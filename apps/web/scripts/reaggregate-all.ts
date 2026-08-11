/**
 * One-shot: re-aggregate ALL businessDates for ALL API stores after the
 * 2026-07-08 taxonomy change (prepaid split out of MENU). DB-only.
 */
import { prisma } from "../lib/db";
import { aggregateMetrics } from "../lib/aggregate/aggregator";

async function main() {
  const stores = await prisma.store.findMany({
    where: { apiSyncEnabled: true },
    select: { id: true, abbreviation: true },
    orderBy: { abbreviation: "asc" },
  });
  for (const s of stores) {
    const res = await aggregateMetrics({ storeId: s.id });
    console.log(
      `${s.abbreviation}: dates=${res.datesProcessed.length} metricsRows=${res.metricsRowsWritten} commodityRows=${res.commodityRowsWritten} unclassified=${res.unclassifiedOpcodes.length}`,
    );
  }
  // Post-check: July MTD menu + prepaid per store
  const july = new Date("2026-07-01T00:00:00Z");
  for (const s of stores) {
    const agg = await prisma.advisorDailyMetrics.aggregate({
      where: { storeId: s.id, businessDate: { gte: july } },
      _sum: { menuCount: true, alaCount: true, openRos: true },
    });
    const prepaid = await prisma.advisorDailyCommodity.aggregate({
      where: { storeId: s.id, businessDate: { gte: july }, commodityKey: "prepaid_maint" },
      _sum: { qty: true },
    });
    console.log(
      `JULY ${s.abbreviation}: menu=${agg._sum.menuCount ?? 0} ala=${agg._sum.alaCount ?? 0} roCount=${agg._sum.openRos ?? 0} prepaid=${prepaid._sum.qty ?? 0}`,
    );
  }
}
main()
  .then(async () => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
