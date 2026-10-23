import { prisma } from "../lib/db";
import { BrowserBridge } from "../lib/sources/tekion/internal/browser";
import { TekionInternalClient } from "../lib/sources/tekion/internal/client";
import { numericDealerId } from "../lib/sources/tekion/internal/collector";
const n = (x: any) => typeof x === "number" ? x : (x?.amount ?? 0);
(async () => {
  const [ab, FROM, TO, N] = [process.argv[2], process.argv[3], process.argv[4], Number(process.argv[5] ?? 60)];
  const s = await prisma.store.findFirstOrThrow({ where: { abbreviation: ab } });
  const c = new TekionInternalClient(new BrowserBridge()); const d = numericDealerId(s.tekionDealerId!);
  const facts = await prisma.roFact.findMany({ where: { storeId: s.id, status: "CLOSED", closeDate: { gte: new Date(`${FROM}T00:00:00-07:00`), lte: new Date(`${TO}T23:59:59.999-07:00`) } }, take: N, orderBy: { closeDate: "asc" } });
  const ids = facts.map(f => f.documentId);
  const hdr = await c.rawRoSearch(d, { pageInfo: { start: 0, rows: ids.length }, sort: [{ order: "ASC", field: "modifiedTime" }], searchText: null, filters: [{ operator: "IN", values: ids, field: "id" }], searchFields: ["RO_NO"] });
  const H = new Map((hdr.list as any[]).map(h => [h.id, h]));
  const ok = { A: 0, C: 0, MAX: 0, D: 0 }; let tot = 0; let ex = 0;
  for (let i = 0; i < ids.length; i += 25) {
    const jobs: any[] = await c.jobsForRos(d, ids.slice(i, i + 25));
    const byRo = new Map<string, any[]>(); for (const j of jobs) { const k = j.repairOrderId ?? j.roId ?? j.documentId; (byRo.get(k) ?? byRo.set(k, []).get(k)!).push(j); }
    for (const [ro, js] of byRo) {
      const h = H.get(ro); if (!h) continue; const ps = h.paySplitTotalsV3 ?? {};
      const tek = n(ps.cpAmounts?.partCostAmount) + n(ps.wpAmounts?.partCostAmount) + n(ps.ipAmounts?.partCostAmount);
      let A = 0, C = 0, MAX = 0, D = 0; const lines: string[] = [];
      for (const j of js) for (const op of j.operations ?? []) for (const p of op.partLineV2s ?? op.partLines ?? []) {
        const tc = n(p.totalCost), cq = n(p.costPricePerPart) * (p.saleQty ?? 0);
        A += tc; C += cq; MAX += Math.max(tc, cq); D += (p.saleQty ?? 0) > 0 ? cq : tc;
        lines.push(`pay=${j.payType} qty=${p.qty} saleQty=${p.saleQty} ret=${p.returnedQty} costPP=${n(p.costPricePerPart)} totalCost=${tc} sale=${n(p.totalSaleWithCore ?? p.totalSellWithCore)} core=${p.coreQty}/${n(p.coreAmountPerPart)} oem=${n(p.oemAdjustmentCostPerPart)}`);
      }
      tot++; if (A === tek) ok.A++; if (C === tek) ok.C++; if (MAX === tek) ok.MAX++; if (D === tek) ok.D++;
      if (D !== tek && ex++ < 4) { console.log(`  D-miss RO ${h.documentNumber ?? ro} tek=${tek} A=${A} C=${C} MAX=${MAX} D=${D}`); lines.forEach(l => console.log("     " + l)); }
    }
  }
  console.log(`${ab} ${FROM}..${TO}: ROs=${tot} A=${ok.A} C=${ok.C} MAX=${ok.MAX} D(saleQty>0?cq:tc)=${ok.D}`);
  process.exit(0);
})();
