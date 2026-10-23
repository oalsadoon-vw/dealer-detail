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
  const facts = await prisma.roFact.findMany({ where: { storeId: s.id, status: "CLOSED", closeDate: { gte: new Date(from), lte: new Date(to) } }, select: { documentId: true } });
  const have = new Set(facts.map(f => f.documentId));
  for (const h of all as any[]) if (!have.has(h.id)) { const raw = await prisma.rawRepairOrder.findFirst({ where: { storeId: s.id, documentId: h.id }, select: { status: true, closeDate: true, payType: true } }); const f = await prisma.roFact.findFirst({ where: { storeId: s.id, documentId: h.id }, select: { status: true, closeDate: true } }); console.log(`MISSING RO ${h.roNumber ?? h.documentNumber} id=${h.id} tekStatus=${h.status} closed=${new Date(h.closedTime).toISOString()} cp=${h.paySplitTotalsV3?.cpAmounts?.amount} | raw=${JSON.stringify(raw)} fact=${JSON.stringify(f)}`); }
  console.log(`${ab}: tekion ${all.length} closed, site ${facts.length}`);
  process.exit(0);
})();
