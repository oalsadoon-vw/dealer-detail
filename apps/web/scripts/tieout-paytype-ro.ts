// tieout-paytype-ro — per-RO diff (sale AND cost by CP/W/I) for one store; prints the ROs that disagree with Tekion.
//   npx tsx --conditions=react-server scripts/tieout-paytype-ro.ts SCT 2026-10-01 2026-10-22
import { prisma } from "../lib/db";
import { BrowserBridge } from "../lib/sources/tekion/internal/browser";
import { TekionInternalClient } from "../lib/sources/tekion/internal/client";
import { numericDealerId } from "../lib/sources/tekion/internal/collector";
const AB = process.argv[2] ?? "SCT", FROM = process.argv[3] ?? "2026-10-01", TO = process.argv[4] ?? "2026-10-22";
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
async function main() {
  const s = await prisma.store.findFirstOrThrow({ where: { abbreviation: AB }, select: { id: true, tekionDealerId: true } });
  const facts = await prisma.roFact.findMany({ where: { storeId: s.id, status: "CLOSED", closeDate: { gte: new Date(`${FROM}T00:00:00-07:00`), lte: new Date(`${TO}T23:59:59.999-07:00`) } },
    select: { documentId: true, documentNumber: true, cpLaborSale: true, cpPartsSale: true, wLaborSale: true, wPartsSale: true, iLaborSale: true, iPartsSale: true, laborCost: true, partsCost: true } as any });
  const ops = await prisma.roOpFact.groupBy({ by: ["roFactId", "payClass"], where: { storeId: s.id, roFact: { status: "CLOSED", closeDate: { gte: new Date(`${FROM}T00:00:00-07:00`), lte: new Date(`${TO}T23:59:59.999-07:00`) } } }, _sum: { laborCost: true, partsCost: true } } as any);
  const rf = await prisma.roFact.findMany({ where: { storeId: s.id }, select: { id: true, documentId: true } });
  const idByFact = new Map(rf.map((r) => [r.id, r.documentId]));
  const costBy = new Map<string, Record<string, number>>();
  for (const o of ops as any[]) { const did = idByFact.get(o.roFactId)!; const m = costBy.get(did) ?? {}; m[o.payClass] = (m[o.payClass] ?? 0) + n(o._sum.laborCost) + n(o._sum.partsCost); costBy.set(did, m); }
  const c = new TekionInternalClient(new BrowserBridge()); const d = numericDealerId(s.tekionDealerId!);
  const ids = facts.map((f) => f.documentId); const byId = new Map(facts.map((f) => [f.documentId, f]));
  const rows: string[] = []; let tot = { cs: 0, ws: 0, is: 0, cc: 0, wc: 0, ic: 0 };
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200);
    const hdr = await c.rawRoSearch(d, { pageInfo: { start: 0, rows: batch.length }, sort: [{ order: "ASC", field: "modifiedTime" }], searchText: null, filters: [{ operator: "IN", values: batch, field: "id" }], searchFields: ["RO_NO"] });
    for (const h of hdr.list as any[]) {
      const f: any = byId.get(h.id); if (!f) continue; const ps = h.paySplitTotalsV3 ?? {}; const cb = costBy.get(h.id) ?? {};
      const T = (k: string) => ({ s: n(ps[k]?.laborAmount) + n(ps[k]?.partsAmount), c: n(ps[k]?.laborCostAmount) + n(ps[k]?.partCostAmount) });
      const tc = T("cpAmounts"), tw = T("wpAmounts"), ti = T("ipAmounts");
      const dcs = Math.round((f.cpLaborSale + f.cpPartsSale) * 100) - tc.s, dws = Math.round((f.wLaborSale + f.wPartsSale) * 100) - tw.s, dis = Math.round((f.iLaborSale + f.iPartsSale) * 100) - ti.s;
      const dcc = Math.round((cb.CP ?? 0) * 100) - tc.c, dwc = Math.round((cb.W ?? 0) * 100) - tw.c, dic = Math.round((cb.I ?? 0) * 100) - ti.c;
      tot.cs += dcs; tot.ws += dws; tot.is += dis; tot.cc += dcc; tot.wc += dwc; tot.ic += dic;
      if ([dcs, dws, dis, dcc, dwc, dic].some((x) => Math.abs(x) > 2)) rows.push(`RO ${h.roNo} status=${h.status} tekMod=${new Date(h.modifiedTime).toISOString().slice(0, 16)} | sale Δ CP ${dcs} W ${dws} I ${dis} | cost Δ CP ${dcc} W ${dwc} I ${dic}`);
    }
  }
  console.log(`${AB} ${FROM}..${TO}: ${facts.length} closed ROs, ${rows.length} with any Δ`); rows.forEach((r) => console.log("  " + r));
  console.log(`TOTAL Δ (cents): sale CP ${tot.cs} W ${tot.ws} I ${tot.is} | cost CP ${tot.cc} W ${tot.wc} I ${tot.ic}`);
}
main().finally(() => prisma.$disconnect());
