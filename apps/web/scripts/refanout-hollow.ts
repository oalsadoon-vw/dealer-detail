/**
 * refanout-hollow — re-pull jobs/operations for stored ROs that are HOLLOW
 * (RoFact.jobCount > 0 but opCount = 0 → labor/parts stored as $0 because
 * Tekion job/search returned job shells that night). The collector now
 * retries + re-fans-out these on the fly; this script fixes the backlog
 * (SCT Jul–Oct 2026: 1,221 ROs) and is the manual repair tool.
 *
 *   npx tsx --conditions=react-server scripts/refanout-hollow.ts [--stores SCT,BST] [--since 2026-01-01] [--dry]
 *
 * Browser path (:9225), zero OpenAPI quota: 1 job/search per 50 ROs.
 */
import { prisma } from "../lib/db";
import { BrowserBridge } from "../lib/sources/tekion/internal/browser";
import { TekionInternalClient, JOB_SEARCH_RO_BATCH } from "../lib/sources/tekion/internal/client";
import { numericDealerId, jobsAreHollow } from "../lib/sources/tekion/internal/collector";
import { groupJobsByRo, mapInternalRo } from "../lib/sources/tekion/internal/mapper";
import { RoWriter } from "../lib/sources/tekion/persist";
import { buildRoFacts } from "../lib/facts/buildRoFacts";

const args = process.argv.slice(2);
const opt = (n: string, d: string) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const DRY = args.includes("--dry");
const SINCE = new Date(`${opt("--since", "2026-01-01")}T00:00:00Z`);
const ONLY = opt("--stores", "").split(",").map((s) => s.trim()).filter(Boolean);

async function main() {
  const stores = await prisma.store.findMany({
    where: { apiSyncEnabled: true, tekionDealerId: { not: null }, ...(ONLY.length ? { abbreviation: { in: ONLY } } : {}) },
    select: { id: true, abbreviation: true, tekionDealerId: true }, orderBy: { abbreviation: "asc" },
  });
  const client = new TekionInternalClient(new BrowserBridge());
  for (const s of stores) {
    const ab = s.abbreviation ?? "?";
    const dealer = numericDealerId(s.tekionDealerId!);
    const hollow = await prisma.roFact.findMany({
      where: { storeId: s.id, jobCount: { gt: 0 }, opCount: 0, OR: [{ closeDate: { gte: SINCE } }, { openDate: { gte: SINCE } }] },
      select: { documentId: true, documentNumber: true },
    });
    if (hollow.length === 0) { console.log(`${ab}: no hollow ROs`); continue; }
    console.log(`${ab}: ${hollow.length} hollow ROs${DRY ? " (dry)" : ""}`);
    if (DRY) continue;

    const run = await prisma.syncRun.create({ data: { storeId: s.id, kind: "MANUAL", windowStart: SINCE, windowEnd: new Date(), status: "RUNNING" } });
    const writer = new RoWriter({ storeId: s.id, syncRunId: run.id, resolveAdvisor: async (uid) => { const u = await client.getUser(dealer, uid); return { name: u.name, persona: u.persona }; } });
    let fixed = 0, stillHollow = 0, failed = 0;
    const ids = hollow.map((h) => h.documentId);
    for (let i = 0; i < ids.length; i += JOB_SEARCH_RO_BATCH) {
      const batch = ids.slice(i, i + JOB_SEARCH_RO_BATCH);
      // need fresh headers for mapInternalRo (status/closedTime/vehicle)
      const hdr = await client.rawRoSearch(dealer, { pageInfo: { start: 0, rows: batch.length }, sort: [{ order: "ASC", field: "modifiedTime" }], searchText: null, filters: [{ operator: "IN", values: batch, field: "id" }], searchFields: ["RO_NO"] });
      let byRo = groupJobsByRo(await client.jobsForRos(dealer, batch));
      const retryIds = batch.filter((id) => jobsAreHollow(byRo.get(id) ?? []));
      if (retryIds.length) { await new Promise((r) => setTimeout(r, 1500)); const rb = groupJobsByRo(await client.jobsForRos(dealer, retryIds)); for (const id of retryIds) { const j = rb.get(id); if (j && !jobsAreHollow(j)) byRo.set(id, j); } }
      for (const h of hdr.list) {
        const jobs = byRo.get(h.id) ?? [];
        if (jobsAreHollow(jobs)) { stillHollow++; continue; }
        try {
          const snap = mapInternalRo(h, jobs);
          const advisorId = snap.ro.assignee?.advisor?.id ?? null;
          const adv = await writer.ensureAdvisor(advisorId);
          snap.advisorName = adv.name; snap.advisorPersona = adv.persona;
          await writer.write(snap, advisorId);
          fixed++;
        } catch (e) { failed++; console.error(`${ab} ${h.roNo}: ${(e as Error).message.slice(0, 120)}`); }
      }
      console.log(`${ab}   … ${Math.min(i + batch.length, ids.length)}/${ids.length} fixed=${fixed} stillHollow=${stillHollow} failed=${failed}`);
    }
    const facts = await buildRoFacts({ storeId: s.id, documentIds: ids });
    await prisma.syncRun.update({ where: { id: run.id }, data: { status: failed ? "COMPLETED_WITH_WARNINGS" : "COMPLETED", finishedAt: new Date(), summary: { source: "refanout-hollow", fixed, stillHollow, failed } } });
    console.log(`${ab}: fixed=${fixed} stillHollow=${stillHollow} failed=${failed} facts rebuilt ros=${facts.rosBuilt} ops=${facts.opsBuilt}`);
  }
}
main().then(async () => { await prisma.$disconnect(); }).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
