/**
 * refanout-split — repair stored ROs whose PAY-TYPE breakdown (sale OR cost)
 * disagrees with Tekion's header paySplitTotalsV3 (cp/wp/ipAmounts).
 *
 * Two known causes, both silent (RO-level totals can still tie):
 *  (1) split-pay jobs (job.splitInfo.splits ≥2 payers) were attributed 100% to
 *      the primary payType → CP/W/I mix off by the split amount. mapper.ts now
 *      allocates per splitInfo.
 *  (2) stale cost snapshot: job/search returned part lines with totalCost=0
 *      (prepaid/TXM parts delivered later, cost posted after the RO's
 *      modifiedTime) → the modifiedTime-unchanged skip keeps $0 cost forever
 *      → CP gross overstated (SCT Oct 1–22: +$1,601).
 *
 *   npx tsx --conditions=react-server scripts/refanout-split.ts [--stores BST,BC] [--from 2026-01-01] [--to 2026-12-31] [--dry]
 *
 * Detection is header-only (rawRoSearch, 200/page): one browser call per 200
 * ROs; re-pull (job/search) only for mismatches. Zero OpenAPI quota.
 * Run nightly after the sync (cron-ro-sync-internal.sh) for the trailing 45d.
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
const FROM = new Date(`${opt("--from", "2026-01-01")}T00:00:00-07:00`);
const TO = new Date(`${opt("--to", new Date().toISOString().slice(0, 10))}T23:59:59.999-07:00`);
const ONLY = opt("--stores", "").split(",").map((s) => s.trim()).filter(Boolean);
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

async function main() {
  const stores = await prisma.store.findMany({
    where: { apiSyncEnabled: true, tekionDealerId: { not: null }, ...(ONLY.length ? { abbreviation: { in: ONLY } } : {}) },
    select: { id: true, abbreviation: true, tekionDealerId: true }, orderBy: { abbreviation: "asc" },
  });
  const client = new TekionInternalClient(new BrowserBridge());
  const grand: string[] = [];
  for (const s of stores) {
    const ab = s.abbreviation ?? "?";
    const dealer = numericDealerId(s.tekionDealerId!);
    const facts = await prisma.roFact.findMany({
      where: { storeId: s.id, OR: [{ closeDate: { gte: FROM, lte: TO } }, { openDate: { gte: FROM, lte: TO } }] },
      select: { id: true, documentId: true, documentNumber: true, cpLaborSale: true, cpPartsSale: true, wLaborSale: true, wPartsSale: true, iLaborSale: true, iPartsSale: true },
    });
    const byId = new Map(facts.map((f) => [f.documentId, f]));
    const ids = facts.map((f) => f.documentId);
    // per-pay-class COST lives on RoOpFact (RoFact has only total cost)
    const costRows = facts.length ? await prisma.roOpFact.groupBy({ by: ["roFactId", "payClass"], where: { storeId: s.id, roFactId: { in: facts.map((f) => f.id) } }, _sum: { laborCost: true, partsCost: true } }) : [];
    const costBy = new Map<string, Record<string, number>>();
    const docByFact = new Map(facts.map((f) => [f.id, f.documentId]));
    for (const r of costRows) { const did = docByFact.get(r.roFactId)!; const m = costBy.get(did) ?? {}; m[r.payClass] = (m[r.payClass] ?? 0) + n(r._sum.laborCost) + n(r._sum.partsCost); costBy.set(did, m); }
    const mismatch: Array<{ id: string; ro: string; d: string }> = [];
    for (let i = 0; i < ids.length; i += 200) {
      const batch = ids.slice(i, i + 200);
      const hdr = await client.rawRoSearch(dealer, { pageInfo: { start: 0, rows: batch.length }, sort: [{ order: "ASC", field: "modifiedTime" }], searchText: null, filters: [{ operator: "IN", values: batch, field: "id" }], searchFields: ["RO_NO"] });
      for (const h of hdr.list as any[]) {
        const f = byId.get(h.id); if (!f) continue;
        const ps = h.paySplitTotalsV3 ?? {};
        const cb = costBy.get(h.id) ?? {};
        const T = (k: string) => ({ s: n(ps[k]?.laborAmount) + n(ps[k]?.partsAmount), c: n(ps[k]?.laborCostAmount) + n(ps[k]?.partCostAmount) });
        const tc = T("cpAmounts"), tw = T("wpAmounts"), ti = T("ipAmounts");
        // RoFact/RoOpFact store DOLLARS; paySplitTotalsV3 is CENTS → compare in cents
        const c$ = (v: number) => Math.round(v * 100);
        const dS = [c$(f.cpLaborSale + f.cpPartsSale) - tc.s, c$(f.wLaborSale + f.wPartsSale) - tw.s, c$(f.iLaborSale + f.iPartsSale) - ti.s];
        const dC = [c$(cb.CP ?? 0) - tc.c, c$(cb.W ?? 0) - tw.c, c$(cb.I ?? 0) - ti.c];
        if ([...dS, ...dC].some((x) => Math.abs(x) > 2)) mismatch.push({ id: h.id, ro: String(h.roNo), d: `sale CP ${dS[0]} W ${dS[1]} I ${dS[2]} | cost CP ${dC[0]} W ${dC[1]} I ${dC[2]}` });
      }
    }
    console.log(`${ab}: scanned ${ids.length} ROs, pay-type mismatches ${mismatch.length}${DRY ? " (dry)" : ""}`);
    for (const m of mismatch.slice(0, 30)) console.log(`   RO ${m.ro}: ${m.d}`);
    if (DRY || mismatch.length === 0) { grand.push(`${ab} ${mismatch.length} mismatches`); continue; }

    const run = await prisma.syncRun.create({ data: { storeId: s.id, kind: "MANUAL", windowStart: FROM, windowEnd: TO, status: "RUNNING" } });
    const writer = new RoWriter({ storeId: s.id, syncRunId: run.id, resolveAdvisor: async (uid) => { const u = await client.getUser(dealer, uid); return { name: u.name, persona: u.persona }; } });
    let fixed = 0, failed = 0, hollow = 0;
    const mids = mismatch.map((m) => m.id);
    for (let i = 0; i < mids.length; i += JOB_SEARCH_RO_BATCH) {
      const batch = mids.slice(i, i + JOB_SEARCH_RO_BATCH);
      const hdr = await client.rawRoSearch(dealer, { pageInfo: { start: 0, rows: batch.length }, sort: [{ order: "ASC", field: "modifiedTime" }], searchText: null, filters: [{ operator: "IN", values: batch, field: "id" }], searchFields: ["RO_NO"] });
      const byRo = groupJobsByRo(await client.jobsForRos(dealer, batch));
      for (const h of hdr.list) {
        const jobs = byRo.get(h.id) ?? [];
        if (jobsAreHollow(jobs)) { hollow++; continue; }
        try {
          const snap = mapInternalRo(h, jobs);
          const advisorId = snap.ro.assignee?.advisor?.id ?? null;
          const adv = await writer.ensureAdvisor(advisorId);
          snap.advisorName = adv.name; snap.advisorPersona = adv.persona;
          await writer.write(snap, advisorId);
          fixed++;
        } catch (e) { failed++; console.error(`${ab} ${h.roNo}: ${(e as Error).message.slice(0, 120)}`); }
      }
    }
    const fb = await buildRoFacts({ storeId: s.id, documentIds: mids });
    await prisma.syncRun.update({ where: { id: run.id }, data: { status: failed ? "COMPLETED_WITH_WARNINGS" : "COMPLETED", finishedAt: new Date(), summary: { source: "refanout-split", fixed, hollow, failed } } });
    console.log(`${ab}: fixed=${fixed} hollow=${hollow} failed=${failed} facts rebuilt ros=${fb.rosBuilt} ops=${fb.opsBuilt}`);
    grand.push(`${ab} ${mismatch.length} mismatches → fixed ${fixed}`);
  }
  console.log("SUMMARY: " + grand.join(" | "));
}
main().then(async () => { await prisma.$disconnect(); }).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

