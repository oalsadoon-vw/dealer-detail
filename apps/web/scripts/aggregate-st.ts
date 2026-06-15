/**
 * Live aggregator run for Stevens Creek Toyota.
 *
 * Pure DB→DB: reads RawRepairOrder rows the T3 collector already landed and
 * writes AdvisorDailyMetrics + AdvisorDailyCommodity (delete-then-insert,
 * idempotent). NO Tekion API calls.
 *
 * Run with:
 *   set -a && . ./.env && set +a && \
 *     npx tsx --conditions=react-server scripts/aggregate-st.ts
 *   # or: npm run aggregate:st
 *
 * Prints:
 *   - AggregateResult (datesProcessed, advisorsTouched, rows written, etc.)
 *   - checksum (sum of menuCount + dailyLaborGross across all rows for this store)
 *   - top-5 advisors for the latest businessDate
 *   - FullPicture KPIs for the latest businessDate
 *   - list of unclassified opcodes (the OpcodeCategory mappings still missing)
 */

import { prisma } from "../lib/db";
import { aggregateMetrics } from "../lib/aggregate/aggregator";
import { computeFullPicture } from "../lib/fullPicture";

const ST_ABBREVIATION = "ST";

interface ChecksumRow {
  storeId: string;
  totalMenuCount: number;
  totalAlaCount: number;
  totalOpenRos: number;
  totalDailyLaborGross: number;
  rowCount: number;
}

async function checksum(storeId: string): Promise<ChecksumRow> {
  const agg = await prisma.advisorDailyMetrics.aggregate({
    where: { storeId },
    _sum: {
      menuCount: true,
      alaCount: true,
      openRos: true,
      dailyLaborGross: true,
    },
    _count: { _all: true },
  });
  return {
    storeId,
    totalMenuCount: agg._sum.menuCount ?? 0,
    totalAlaCount: agg._sum.alaCount ?? 0,
    totalOpenRos: agg._sum.openRos ?? 0,
    totalDailyLaborGross: agg._sum.dailyLaborGross ?? 0,
    rowCount: agg._count._all,
  };
}

function fmt$(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function main() {
  console.log("\n=== T4 aggregator — Stevens Creek Toyota ===");
  const store = await prisma.store.findUnique({
    where: { abbreviation: ST_ABBREVIATION },
    select: { id: true, name: true },
  });
  if (!store) {
    throw new Error(`Store with abbreviation=${ST_ABBREVIATION} not found. Run collect:st first.`);
  }
  console.log(`storeId: ${store.id}  (${store.name})`);

  const rawCount = await prisma.rawRepairOrder.count({
    where: { storeId: store.id },
  });
  console.log(`RawRepairOrder rows for store: ${rawCount}`);

  // ----- Run 1 -----
  console.log("\n--- run #1 ---");
  const t0 = Date.now();
  const r1 = await aggregateMetrics({ storeId: store.id });
  const elapsed1 = Date.now() - t0;
  console.log(`elapsed: ${elapsed1}ms`);
  console.log("AggregateResult:");
  console.log(JSON.stringify(r1, null, 2));

  const c1 = await checksum(store.id);
  console.log(`\nchecksum after run #1:`);
  console.log(
    `  rowCount=${c1.rowCount}  totalMenuCount=${c1.totalMenuCount}  totalAlaCount=${c1.totalAlaCount}  totalOpenRos=${c1.totalOpenRos}  totalDailyLaborGross=${c1.totalDailyLaborGross}`,
  );

  // ----- Run 2: idempotency proof -----
  console.log("\n--- run #2 (idempotency check) ---");
  const t1 = Date.now();
  const r2 = await aggregateMetrics({ storeId: store.id });
  const elapsed2 = Date.now() - t1;
  console.log(`elapsed: ${elapsed2}ms`);

  const c2 = await checksum(store.id);
  console.log(`checksum after run #2:`);
  console.log(
    `  rowCount=${c2.rowCount}  totalMenuCount=${c2.totalMenuCount}  totalAlaCount=${c2.totalAlaCount}  totalOpenRos=${c2.totalOpenRos}  totalDailyLaborGross=${c2.totalDailyLaborGross}`,
  );

  const idempotent =
    c1.rowCount === c2.rowCount &&
    c1.totalMenuCount === c2.totalMenuCount &&
    c1.totalAlaCount === c2.totalAlaCount &&
    c1.totalOpenRos === c2.totalOpenRos &&
    Math.abs(c1.totalDailyLaborGross - c2.totalDailyLaborGross) < 1e-6;
  console.log(`\nIDEMPOTENCY: ${idempotent ? "PASS" : "FAIL"}`);
  if (!idempotent) {
    console.log("  run #1:", c1);
    console.log("  run #2:", c2);
  }

  // ----- Sample advisor day for latest businessDate -----
  const latest = r1.datesProcessed[r1.datesProcessed.length - 1];
  if (!latest) {
    console.log("\nNo businessDates processed — nothing to sample.");
  } else {
    const businessDate = new Date(`${latest}T00:00:00.000Z`);
    console.log(`\n--- sample: latest businessDate ${latest} ---`);

    const rows = await prisma.advisorDailyMetrics.findMany({
      where: { storeId: store.id, businessDate },
      include: { advisor: { select: { nameNormalized: true, nameRaw: true } } },
      orderBy: { dailyLaborGross: "desc" },
      take: 5,
    });

    console.log("\nTop 5 advisors by dailyLaborGross:");
    console.log(
      "  advisor                       menu  ala   recAmt$    daily$         parts$         total$".padEnd(
        80,
      ),
    );
    for (const row of rows) {
      const adv = (row.advisor.nameRaw ?? row.advisor.nameNormalized).padEnd(28);
      const menu = String(row.menuCount).padStart(4);
      const ala = String(row.alaCount).padStart(4);
      const recA = fmt$(row.recAmount).padStart(10);
      const labor = fmt$(row.dailyLaborGross).padStart(14);
      const parts = fmt$(row.dailyPartsGross).padStart(14);
      const total = fmt$(row.dailyLaborGross + row.dailyPartsGross).padStart(14);
      console.log(`  ${adv} ${menu} ${ala} ${recA} ${labor} ${parts} ${total}`);
    }

    // Compute the store-wide FullPicture for the latest date by summing across
    // advisors. (computeFullPicture is per-advisor; we aggregate inputs first.)
    const all = await prisma.advisorDailyMetrics.findMany({
      where: { storeId: store.id, businessDate },
    });
    const comm = await prisma.advisorDailyCommodity.findMany({
      where: { storeId: store.id, businessDate },
    });
    const totals = all.reduce(
      (a, r) => ({
        openRos: a.openRos + r.openRos,
        menuCount: a.menuCount + r.menuCount,
        alaCount: a.alaCount + r.alaCount,
        recAmount: a.recAmount + r.recAmount,
        recSoldAmount: a.recSoldAmount + r.recSoldAmount,
        dailyLaborGross: a.dailyLaborGross + r.dailyLaborGross,
        dailyPartsGross: a.dailyPartsGross + r.dailyPartsGross,
      }),
      {
        openRos: 0,
        menuCount: 0,
        alaCount: 0,
        recAmount: 0,
        recSoldAmount: 0,
        dailyLaborGross: 0,
        dailyPartsGross: 0,
      },
    );
    const commByKey = new Map<string, { qty: number; gross: number }>();
    for (const c of comm) {
      const cur = commByKey.get(c.commodityKey) ?? { qty: 0, gross: 0 };
      cur.qty += c.qty;
      cur.gross += c.gross;
      commByKey.set(c.commodityKey, cur);
    }
    const commodityInput = [...commByKey.entries()].map(([commodityKey, v]) => ({
      commodityKey,
      qty: v.qty,
      gross: v.gross,
    }));

    const fp = computeFullPicture({
      ...totals,
      commodities: commodityInput,
    });
    console.log("\nFullPicture (store-wide totals for latest businessDate):");
    console.log(`  inputs (summed across advisors):`);
    console.log(`    openRos=${totals.openRos}  menuCount=${totals.menuCount}  alaCount=${totals.alaCount}`);
    console.log(
      `    recAmount=${fmt$(totals.recAmount)}  recSoldAmount=${fmt$(totals.recSoldAmount)}`,
    );
    console.log(
      `    dailyLaborGross=${fmt$(totals.dailyLaborGross)}  dailyPartsGross=${fmt$(totals.dailyPartsGross)}`,
    );
    console.log(`  commodities: ${commodityInput.length}`);
    for (const c of commodityInput) {
      console.log(`    ${c.commodityKey.padEnd(14)} qty=${c.qty}  gross=${fmt$(c.gross)}`);
    }
    console.log(`  KPIs:`);
    console.log(`    menuSalesPct    = ${(fp.menuSalesPct * 100).toFixed(2)}%`);
    console.log(`    alaPct          = ${(fp.alaPct * 100).toFixed(2)}%`);
    console.log(`    commodityQtyTotal = ${fp.commodityQtyTotal}`);
    console.log(`    commodityPct    = ${(fp.commodityPct * 100).toFixed(2)}%`);
    console.log(`    recClosingPct   = ${(fp.recClosingPct * 100).toFixed(2)}%`);
    console.log(`    totalDailyGross = ${fmt$(fp.totalDailyGross)}`);
  }

  // ----- Unclassified opcodes -----
  console.log(`\nUnclassified opcodes (${r1.unclassifiedOpcodes.length}):`);
  if (r1.unclassifiedOpcodes.length === 0) {
    console.log("  (none)");
  } else {
    // Pretty-print 6 per line.
    const chunked: string[][] = [];
    for (let i = 0; i < r1.unclassifiedOpcodes.length; i += 6) {
      chunked.push(r1.unclassifiedOpcodes.slice(i, i + 6));
    }
    for (const chunk of chunked) {
      console.log("  " + chunk.map((s) => s.padEnd(14)).join(""));
    }
  }

  console.log("\n=== END RESULT ===");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error("aggregate-st FAILED:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
