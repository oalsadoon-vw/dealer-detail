// tieout-paytype — site (reports service, what the UI renders) vs Tekion paySplitTotalsV3 per CP/W/I, sale + gross, per store.
//   npx tsx --conditions=react-server scripts/tieout-paytype.ts 2026-10-01 2026-10-22 [BST,BC]
// TEMP verification: new pay-type breakdown (what the UI will render) vs Tekion paySplitTotalsV3 per pay type.
import { prisma } from "../lib/db";
import { BrowserBridge } from "../lib/sources/tekion/internal/browser";
import { TekionInternalClient, type InternalRoHeader } from "../lib/sources/tekion/internal/client";
import { numericDealerId } from "../lib/sources/tekion/internal/collector";
import { getSummary, getAdvisorPerformance, getFleetRollup } from "../lib/server/services/reports";

const FROM = process.argv[2] ?? "2026-10-01";
const TO = process.argv[3] ?? "2026-10-22";
const ROWS = 200;
const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
function ptMidnightMs(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 8);
  const off = -new Date(guess).toLocaleString("en-US", { timeZone: "America/Los_Angeles", timeZoneName: "shortOffset" }).match(/GMT([+-]\d+)/)![1];
  return Date.UTC(y, m - 1, d, Number(off));
}
type PT = { labor: number; parts: number; lcost: number; pcost: number };
type Split = { cp: PT; wp: PT; ip: PT; ros: number; keys: Set<string> };
function add(t: PT, v: Record<string, unknown> | undefined) {
  if (!v) return;
  t.labor += Number(v.laborAmount ?? 0) / 100;
  t.parts += Number(v.partsAmount ?? 0) / 100;
  t.lcost += Number(v.laborCostAmount ?? 0) / 100;
  t.pcost += Number(v.partCostAmount ?? 0) / 100;
}
async function tekSplit(client: TekionInternalClient, dealer: string, fromMs: number, toMs: number): Promise<Split> {
  const z = () => ({ labor: 0, parts: 0, lcost: 0, pcost: 0 });
  const s: Split = { cp: z(), wp: z(), ip: z(), ros: 0, keys: new Set() };
  const seen = new Set<string>();
  for (let start = 0; ; start += ROWS) {
    const body = {
      pageInfo: { start, rows: ROWS }, sort: [{ order: "ASC", field: "closedTime" }], searchText: null,
      filters: [
        { operator: "IN", values: [false], field: "migrated" },
        { operator: "IN", values: ["CLOSED"], field: "status" },
        { operator: "GTE", values: [fromMs], field: "closedTime" },
        { operator: "LTE", values: [toMs], field: "closedTime" },
      ],
      searchFields: ["RO_NO"],
    };
    const r = await client.rawRoSearch(dealer, body);
    for (const h of r.list as InternalRoHeader[]) {
      if (seen.has(h.id)) continue;
      seen.add(h.id); s.ros++;
      const ps = (h.paySplitTotalsV3 ?? {}) as Record<string, Record<string, unknown>>;
      for (const k of Object.keys(ps)) s.keys.add(k);
      add(s.cp, ps.cpAmounts); add(s.wp, ps.wpAmounts); add(s.ip, ps.ipAmounts);
      for (const k of Object.keys(ps)) if (!["cpAmounts", "wpAmounts", "ipAmounts"].includes(k) && ps[k] && typeof ps[k] === "object") {
        const v = ps[k] as Record<string, unknown>;
        if (Number(v.laborAmount ?? 0) || Number(v.partsAmount ?? 0)) s.keys.add(`NONZERO:${k}`);
      }
    }
    if (r.list.length < ROWS || start + ROWS >= r.total) break;
  }
  return s;
}

async function main() {
  const stores = await prisma.store.findMany({
    where: { apiSyncEnabled: true, tekionDealerId: { not: null }, ...(process.argv[4] ? { abbreviation: { in: process.argv[4].split(",") } } : {}) },
    select: { id: true, abbreviation: true, tekionDealerId: true, organizationId: true }, orderBy: { abbreviation: "asc" },
  });
  const tc: any = { user: { isPlatformAdmin: true, memberships: [] }, org: { organizationId: stores[0].organizationId, role: "org_admin", accessibleStoreIds: stores.map((s) => s.id) } };
  const client = new TekionInternalClient(new BrowserBridge());
  const fromMs = ptMidnightMs(FROM), toMs = ptMidnightMs(TO) + 86_400_000 - 1;

  const fleet = await getFleetRollup(tc, { startDate: FROM, endDate: TO, basis: "closed" });
  console.log(`\n== SITE pay-type SALE vs TEKION paySplitTotalsV3, CLOSED ${FROM}..${TO} PT (sale $, labor+parts) ==`);
  console.log(`${"store".padEnd(5)} ${"pay".padEnd(3)} ${"site".padStart(11)} ${"tekion".padStart(11)} ${"Δ".padStart(8)}`);
  let worst = 0;
  for (const s of stores) {
    const ab = s.abbreviation ?? "?";
    const sum = await getSummary(tc, { storeId: s.id, startDate: FROM, endDate: TO, basis: "closed" });
    const t = sum.totals;
    const tek = await tekSplit(client, numericDealerId(s.tekionDealerId!), fromMs, toMs);
    const site = Object.fromEntries(t.byPayType.map((p) => [p.payClass, p]));
    const g = (x: PT) => x.labor + x.parts - x.lcost - x.pcost;
    const pairs: Array<[string, number, number]> = [
      ["CP", site.CP.totalSale, tek.cp.labor + tek.cp.parts],
      ["W", site.W.totalSale, tek.wp.labor + tek.wp.parts],
      ["I", site.I.totalSale, tek.ip.labor + tek.ip.parts],
      ["ALL", t.totalSale, tek.cp.labor + tek.cp.parts + tek.wp.labor + tek.wp.parts + tek.ip.labor + tek.ip.parts],
      ["CPg", site.CP.totalGross, g(tek.cp)],
      ["Wg", site.W.totalGross, g(tek.wp)],
      ["Ig", site.I.totalGross, g(tek.ip)],
      ["ALLg", t.totalGross, g(tek.cp) + g(tek.wp) + g(tek.ip)],
    ];
    for (const [k, a, b] of pairs) {
      worst = Math.max(worst, Math.abs(a - b));
      console.log(`${ab.padEnd(5)} ${k.padEnd(3)} ${money(a).padStart(11)} ${money(b).padStart(11)} ${money(a - b).padStart(8)}`);
    }
    // internal consistency
    const ptSum = t.byPayType.reduce((n, p) => n + p.totalGross, 0);
    const adv = await getAdvisorPerformance(tc, { storeId: s.id, startDate: FROM, endDate: TO, basis: "closed" });
    const advGross = adv.rows.reduce((n, r) => n + r.totalGross, 0);
    const advCp = adv.rows.reduce((n, r) => n + r.cpGross, 0);
    const advPtSum = adv.rows.reduce((n, r) => n + r.cpGross + r.wGross + r.iGross + r.oGross, 0);
    const fl = fleet.rows.find((r) => r.storeId === s.id)!;
    const flCp = fl.byPayType.find((p) => p.payClass === "CP")!.totalGross;
    console.log(`${ab.padEnd(5)}   gross: total ${money(t.totalGross)} | Σpaytypes ${money(ptSum)} (Δ ${money(ptSum - t.totalGross)}) | Σadvisors ${money(advGross)} (Δ ${money(advGross - t.totalGross)}) | ΣadvCP ${money(advCp)} vs storeCP ${money(site.CP.totalGross)} (Δ ${money(advCp - site.CP.totalGross)}) | Σadv pt ${money(advPtSum)} | fleetCP ${money(flCp)} | O-class gross ${money(site.O.totalGross)} ROs ${t.roCount}/${tek.ros} | tek keys ${[...tek.keys].join(",")}`);
  }
  console.log(`\nworst |Δ| sale any store/paytype: $${money(worst)}`);
}
main().then(async () => { await prisma.$disconnect(); process.exit(0); }).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(2); });
