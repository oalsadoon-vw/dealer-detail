/**
 * Tie-out: OpenAPI collector vs INTERNAL collector on the SAME ROs.
 *
 * For every RO in <STORE> modified in the last <days>, fetch it via BOTH paths,
 * run buildFactsFromPayload() on each, and deep-compare the facts. Exit 1 on
 * any diff other than the allowed closeTs source difference.
 *
 *   npx tsx --conditions=react-server scripts/tieout-sources.ts BC 2 [maxRos]
 *
 * This is the acceptance gate (T9) before switching the nightly to internal.
 * It spends OpenAPI quota (≈12 calls/RO) — keep maxRos modest (default 60).
 */

import { prisma } from "../lib/db";
import { TekionClient } from "../lib/sources/tekion/client";
import { buildRoSearchFilters } from "../lib/sources/tekion/collector";
import type { RepairOrder, RepairOrderSnapshot } from "../lib/sources/tekion/types";
import { BrowserBridge } from "../lib/sources/tekion/internal/browser";
import { TekionInternalClient } from "../lib/sources/tekion/internal/client";
import { numericDealerId } from "../lib/sources/tekion/internal/collector";
import { groupJobsByRo, mapInternalRo } from "../lib/sources/tekion/internal/mapper";
import { buildFactsFromPayload } from "../lib/facts/buildRoFacts";
import { loadOpcodeCategories } from "../lib/aggregate/opcodeClassifier";

async function openapiSnapshot(client: TekionClient, dealerId: string, ro: RepairOrder): Promise<RepairOrderSnapshot> {
  const roId = ro.documentId;
  const jobs = await client.getJobs(dealerId, roId);
  const jobsExpanded: RepairOrderSnapshot["jobs"] = [];
  for (const job of jobs) {
    const jobId = (job.id ?? job.documentId) as string;
    const ops = await client.getOperations(dealerId, roId, jobId);
    const opsExpanded: RepairOrderSnapshot["jobs"][number]["operations"] = [];
    for (const op of ops) {
      const opId = (op.id ?? op.documentId) as string;
      const parts = await client.getParts(dealerId, roId, jobId, opId);
      opsExpanded.push({ operation: op, parts });
    }
    jobsExpanded.push({ job, operations: opsExpanded });
  }
  let vehicle = null;
  try { vehicle = await client.getRoVehicle(dealerId, roId); } catch { /* vin may come from ro.vehicle */ }
  return { ro, vehicle, jobs: jobsExpanded, advisorName: null };
}

function stripForCompare(f: ReturnType<typeof buildFactsFromPayload>) {
  if (!f) return null;
  const { ro, ops } = f;
  const { advisorName: _a, closeTs: _c, closeDate: _d, isClosed: _i, ...roRest } = ro as Record<string, unknown>;
  void _a; void _c; void _d; void _i;
  // Order-insensitive: OpenAPI returns jobs in API order, internal sorts by jobNumber.
  const key = (o: any) => `${o.jobNumber}|${o.opcode}|${o.laborSale}|${o.partsSale}`;
  const sortedOps = ops.map((o) => ({ ...o })).sort((x, y) => key(x).localeCompare(key(y)));
  return { ro: roRest, ops: sortedOps, unclassified: [...f.unclassified].sort() };
}

function diffKeys(a: unknown, b: unknown, path = ""): string[] {
  if (a === b) return [];
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return [`${path}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`];
  if (Array.isArray(a) !== Array.isArray(b)) return [`${path}: array/object mismatch`];
  const out: string[] = [];
  const ka = Object.keys(a as object), kb = Object.keys(b as object);
  for (const k of new Set([...ka, ...kb])) {
    out.push(...diffKeys((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], path ? `${path}.${k}` : k));
  }
  return out;
}

async function main() {
  const abbrev = (process.argv[2] ?? "").toUpperCase();
  const days = Number(process.argv[3] ?? 2);
  const maxRos = Number(process.argv[4] ?? 60);
  if (!abbrev) throw new Error("usage: tieout-sources.ts <ABBREV> [days] [maxRos]");
  const store = await prisma.store.findFirstOrThrow({ where: { abbreviation: abbrev } });
  const dealerOpen = store.tekionDealerId!;
  const dealerInt = numericDealerId(dealerOpen);
  const opcodeMap = await loadOpcodeCategories(store.id);

  const end = new Date();
  const start = new Date(end.getTime() - days * 864e5);
  const open = new TekionClient();
  const bridge = new BrowserBridge();
  await bridge.assertAuthenticated();
  const int = new TekionInternalClient(bridge);

  // 1. OpenAPI headers for the window
  const openRos: RepairOrder[] = [];
  for await (const ro of open.iterateRepairOrders({ dealerId: dealerOpen, filters: buildRoSearchFilters(start, end, "modifiedTime"), pageSize: 50 })) {
    openRos.push(ro);
    if (openRos.length >= maxRos) break;
  }
  // 2. Internal headers for the same ids (one search page per 200 in window; filter to our ids)
  const intHeaders = new Map<string, Awaited<ReturnType<typeof int.searchRoHeaders>>["list"][number]>();
  let s = 0, total = Infinity;
  while (s < total) {
    const page = await int.searchRoHeaders(dealerInt, start.getTime(), end.getTime(), s, 200);
    total = page.total;
    if (!page.list.length) break;
    s += page.list.length;
    for (const h of page.list) intHeaders.set(h.id, h);
  }

  const pairs = openRos.filter((r) => intHeaders.has(r.documentId));
  console.log(`${abbrev}: openapi=${openRos.length} internal=${intHeaders.size} paired=${pairs.length}`);

  // 3. Internal jobs in batches of 50
  const jobsByRo = new Map<string, Awaited<ReturnType<typeof int.jobsForRos>>>();
  for (let i = 0; i < pairs.length; i += 50) {
    const ids = pairs.slice(i, i + 50).map((r) => r.documentId);
    const hits = await int.jobsForRos(dealerInt, ids);
    for (const [k, v] of groupJobsByRo(hits)) jobsByRo.set(k, v);
  }

  let same = 0, diff = 0, skipped = 0;
  const diffs: string[] = [];
  for (const ro of pairs) {
    const h = intHeaders.get(ro.documentId)!;
    // Both sides must be at the same modifiedTime or the compare is meaningless.
    if (Number(h.modifiedTime) !== Number(ro.modifiedTime)) { skipped++; continue; }
    const a = await openapiSnapshot(open, dealerOpen, ro);
    const b = mapInternalRo(h, jobsByRo.get(ro.documentId) ?? []);
    const fa = stripForCompare(buildFactsFromPayload(a, opcodeMap));
    const fb = stripForCompare(buildFactsFromPayload(b, opcodeMap));
    const d = diffKeys(fa, fb);
    if (d.length === 0) same++;
    else { diff++; diffs.push(`RO ${ro.documentNumber}:\n  ` + d.slice(0, 12).join("\n  ")); }
  }
  console.log(`\nTIE-OUT ${abbrev}: identical=${same} different=${diff} skipped(modified mid-scan)=${skipped}`);
  if (diffs.length) console.log(diffs.join("\n"));
  await prisma.$disconnect();
  process.exit(diff ? 1 : 0);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(2); });
