// Lists ROs the SITE counts as CLOSED in [from,to] that Tekion does NOT (reverse of tieout-missing-ros.ts), and re-reads each from Tekion live.
// Usage: npx tsx --conditions=react-server scripts/tieout-siteonly-ros.ts SCT 2026-10-01 2026-10-26

import { prisma } from "../lib/db";
import { BrowserBridge } from "../lib/sources/tekion/internal/browser";
import { TekionInternalClient } from "../lib/sources/tekion/internal/client";
import { numericDealerId } from "../lib/sources/tekion/internal/collector";
(async () => {
  const [ab, FROM, TO] = [process.argv[2], process.argv[3], process.argv[4]];
  const s = await prisma.store.findFirstOrThrow({ where: { abbreviation: ab } });
  const c = new TekionInternalClient(new BrowserBridge()); const d = numericDealerId(s.tekionDealerId!);
  const from = new Date(`${FROM}T00:00:00-07:00`).getTime(), to = new Date(`${TO}T23:59:59.999-07:00`).getTime();
  const all: any[] = []; let start = 0;
  for (;;) { const r = await c.rawRoSearch(d, { pageInfo: { start, rows: 200 }, sort: [{ order: "ASC", field: "closedTime" }], searchText: null, filters: [{ operator: "IN", values: ["CLOSED"], field: "status" }, { operator: "GTE", values: [String(from)], field: "closedTime" }, { operator: "LTE", values: [String(to)], field: "closedTime" }], searchFields: ["RO_NO"] }); all.push(...r.list); if (r.list.length < 200) break; start += 200; }
  const tek = new Set(all.map((h:any)=>h.id));
  const facts = await prisma.roFact.findMany({ where: { storeId: s.id, status: "CLOSED", closeDate: { gte: new Date(from), lte: new Date(to) } }, select: { documentId: true, documentNumber: true, closeDate: true } as any });
  let n=0;
  for (const f of facts as any[]) if (!tek.has(f.documentId)) {
    n++;
    // ask Tekion for this RO by id
    let live:any=null;
    try { const r = await c.rawRoSearch(d, { pageInfo:{start:0,rows:5}, sort:[], searchText: String(f.documentNumber), filters: [], searchFields:["RO_NO"] }); live = (r.list as any[]).find((h:any)=>h.id===f.documentId) ?? r.list[0] ?? null; } catch(e){ live={err:(e as Error).message.slice(0,80)}; }
    console.log(`SITE-ONLY RO ${f.documentNumber} id=${f.documentId} siteClose=${f.closeDate?.toISOString?.()} | tekNow status=${live?.status} closed=${live?.closedTime?new Date(live.closedTime).toISOString():null} err=${live?.err??''}`);
  }
  console.log(`${ab}: site-only ${n} of ${facts.length}; tekion ${all.length}`);
  process.exit(0);
})();
