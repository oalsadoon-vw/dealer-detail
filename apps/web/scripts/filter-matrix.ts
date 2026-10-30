/**
 * filter-matrix — regression + composition guard for the "show everything" data
 * layer (Lane A / PLAN A8).
 *
 * For a given store + range it asserts:
 *   1. activity/all ≥ closed/all ≥ closed/CLOSED  (count AND dollars)
 *   2. pay chips (CP+W+I+O) sum to the activity/all total (dollars)
 *   3. basis=closed & status=CLOSED & date-field=current (RoFact.closeDate)
 *      equals the pre-change posted-only number — printed as the regression
 *      baseline (optionally hard-asserted via TIEOUT_PRE_LABOR / _PARTS / _ROS).
 *
 * Prints a table. Read-only.
 *
 *   npx tsx --conditions=react-server scripts/filter-matrix.ts [--store SCT] [--from YYYY-MM-DD] [--to YYYY-MM-DD]
 */
import { prisma } from "../lib/db";
import { getSummary } from "../lib/server/services/reports";

const args = process.argv.slice(2);
const opt = (n: string, d: string) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const PT = "America/Los_Angeles";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: PT, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const from = opt("--from", `${today.slice(0, 7)}-01`);
const to = opt("--to", today);
const storeArg = opt("--store", "");

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const close = (a: number, b: number) => Math.abs(a - b) <= 0.01;

interface Row { view: string; ros: number; labor: number; parts: number; total: number; }

async function main(): Promise<number> {
  const store = await prisma.store.findFirst({
    where: storeArg ? { abbreviation: storeArg.toUpperCase() } : { apiSyncEnabled: true },
    select: { id: true, abbreviation: true, name: true, organizationId: true },
    orderBy: { abbreviation: "asc" },
  });
  if (!store) throw new Error(`store not found for '${storeArg}'`);
  const tc: any = { user: { isPlatformAdmin: true }, org: { organizationId: store.organizationId, accessibleStoreIds: [store.id] } };
  const gte = new Date(`${from}T00:00:00.000Z`), lte = new Date(`${to}T00:00:00.000Z`);

  const activity = await getSummary(tc, { storeId: store.id, startDate: from, endDate: to, basis: "activity" });
  const closedAll = await getSummary(tc, { storeId: store.id, startDate: from, endDate: to, basis: "closed" });
  const closedPosted = await getSummary(tc, { storeId: store.id, startDate: from, endDate: to, basis: "closed", statuses: ["CLOSED"] });

  // regression baseline = pre-change posted-only (closeDate, status CLOSED)
  const base = await prisma.roFact.aggregate({
    where: { storeId: store.id, status: "CLOSED", closeDate: { gte, lte } },
    _count: { _all: true }, _sum: { laborSale: true, partsSale: true },
  });
  const baseline: Row = {
    view: "closed/CLOSED (closeDate=pre-change)",
    ros: base._count._all,
    labor: base._sum.laborSale ?? 0,
    parts: base._sum.partsSale ?? 0,
    total: (base._sum.laborSale ?? 0) + (base._sum.partsSale ?? 0),
  };

  const rows: Row[] = [
    { view: "activity/all", ros: activity.totals.roCount, labor: activity.totals.laborSale, parts: activity.totals.partsSale, total: activity.totals.totalSale },
    { view: "closed/all", ros: closedAll.totals.roCount, labor: closedAll.totals.laborSale, parts: closedAll.totals.partsSale, total: closedAll.totals.totalSale },
    { view: "closed/CLOSED (firstCloseDate)", ros: closedPosted.totals.roCount, labor: closedPosted.totals.laborSale, parts: closedPosted.totals.partsSale, total: closedPosted.totals.totalSale },
    baseline,
  ];

  const payChips = activity.totals.byPayType;
  const paySum = payChips.reduce((s, p) => s + p.totalSale, 0);

  // ---- print --------------------------------------------------------------
  console.log(`\nfilter-matrix  ${store.abbreviation ?? "?"} ${store.name}  ${from}..${to} ${PT}\n`);
  console.log(` ${"view".padEnd(34)} ${"ROs".padStart(7)} ${"labor".padStart(12)} ${"parts".padStart(12)} ${"total".padStart(12)}`);
  for (const r of rows) console.log(` ${r.view.padEnd(34)} ${String(r.ros).padStart(7)} ${money(r.labor).padStart(12)} ${money(r.parts).padStart(12)} ${money(r.total).padStart(12)}`);
  console.log(`\n pay chips (activity/all):`);
  for (const p of payChips) console.log(`   ${p.payClass.padEnd(3)} ${p.label.padEnd(20)} ${String(p.lines).padStart(7)} ${money(p.totalSale).padStart(12)}`);

  // ---- assertions ---------------------------------------------------------
  const failures: string[] = [];
  const q = (cond: boolean, msg: string) => { if (!cond) failures.push(msg); };

  q(activity.totals.roCount >= closedAll.totals.roCount, `activity/all ROs (${activity.totals.roCount}) < closed/all (${closedAll.totals.roCount})`);
  q(closedAll.totals.roCount >= closedPosted.totals.roCount, `closed/all ROs (${closedAll.totals.roCount}) < closed/CLOSED (${closedPosted.totals.roCount})`);
  q(activity.totals.totalSale >= closedAll.totals.totalSale - 0.01, `activity/all $ (${money(activity.totals.totalSale)}) < closed/all $ (${money(closedAll.totals.totalSale)})`);
  q(closedAll.totals.totalSale >= closedPosted.totals.totalSale - 0.01, `closed/all $ (${money(closedAll.totals.totalSale)}) < closed/CLOSED $ (${money(closedPosted.totals.totalSale)})`);
  q(close(paySum, activity.totals.totalSale), `pay chips sum (${money(paySum)}) != activity/all total (${money(activity.totals.totalSale)})`);

  const preLabor = Number(process.env.TIEOUT_PRE_LABOR);
  const preParts = Number(process.env.TIEOUT_PRE_PARTS);
  const preRos = Number(process.env.TIEOUT_PRE_ROS);
  if (Number.isFinite(preLabor)) q(close(baseline.labor, preLabor), `closed/CLOSED closeDate labor ${money(baseline.labor)} != expected pre-change ${money(preLabor)}`);
  if (Number.isFinite(preParts)) q(close(baseline.parts, preParts), `closed/CLOSED closeDate parts ${money(baseline.parts)} != expected pre-change ${money(preParts)}`);
  if (Number.isFinite(preRos)) q(baseline.ros === preRos, `closed/CLOSED closeDate ROs ${baseline.ros} != expected pre-change ${preRos}`);

  if (failures.length) {
    console.log("\nFAIL:");
    for (const f of failures) console.log(`  ✗ ${f}`);
    return 1;
  }
  console.log("\nPASS: monotonicity, pay-chip sum, and (if provided) pre-change regression all hold.");
  console.log(`      regression baseline (closeDate posted-only) == tieout-dollars --date-field current output by construction.`);
  return 0;
}

main()
  .then((rc) => prisma.$disconnect().then(() => process.exit(rc)))
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(2); });