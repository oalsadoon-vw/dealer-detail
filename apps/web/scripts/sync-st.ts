/**
 * T5 — host-side manual sync for Stevens Creek Toyota (collect -> aggregate).
 *
 * Runs the same flow as POST /api/sync/{storeId} but in-process on the
 * collector host where the localhost:9223 Tekion browser session lives, so
 * advisor resolution actually works (the serverless route 501s for that
 * reason). For the pilot this is the thing we actually run.
 *
 * Tekion has a 1500-call / 15-min rate limit; default to a SHORT window (last
 * 2 days) to avoid burning the budget on repeated runs. Override via
 * SYNC_ST_WINDOW_DAYS for ad-hoc backfills.
 *
 * Resolves the SCT store by tekionDealerId — fails loudly if not found so the
 * operator runs `npm run consolidate:st` first.
 *
 * Run with:
 *   set -a && . ./.env && set +a && \
 *     npx tsx --conditions=react-server scripts/sync-st.ts
 *   # or: npm run sync:st
 */

import { readFileSync } from "node:fs";

import { prisma } from "../lib/db";
import { collectRepairOrders } from "../lib/sources/tekion/collector";
import { aggregateMetrics } from "../lib/aggregate/aggregator";
import { computeFullPicture } from "../lib/fullPicture";
import { TekionRateLimitError } from "../lib/sources/tekion/client";

const ST_TEKION_DEALER_ID = "americanmotorscorporation_876_0";
const SCT_ADVISOR_CACHE_PATH =
  "/home/itadmin/tekion-reports/data/sct-advisor-cache.json";
const STALE_RUN_MINUTES = 30;
const DEFAULT_WINDOW_DAYS = 2;

function loadSctAdvisorSeed(): Record<string, string> | undefined {
  try {
    const raw = readFileSync(SCT_ADVISOR_CACHE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function fmt$(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function businessDateFloor(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

async function resolveSctStore(): Promise<{ id: string; name: string }> {
  const store = await prisma.store.findFirst({
    where: { tekionDealerId: ST_TEKION_DEALER_ID },
    select: {
      id: true,
      name: true,
      abbreviation: true,
      apiSyncEnabled: true,
      tekionDealerId: true,
    },
  });
  if (!store) {
    throw new Error(
      `No Store with tekionDealerId='${ST_TEKION_DEALER_ID}' found. ` +
        "Run `npm run consolidate:st` to set up the real SCT store, then retry.",
    );
  }
  if (!store.apiSyncEnabled || !store.tekionDealerId) {
    throw new Error(
      `Store ${store.id} (${store.abbreviation ?? "?"}) is missing apiSyncEnabled or tekionDealerId. ` +
        "Run `npm run consolidate:st` to fix.",
    );
  }
  console.log(
    `resolved store: id=${store.id} abbrev=${store.abbreviation ?? "(null)"} name="${store.name}"`,
  );
  return { id: store.id, name: store.name };
}

async function refuseIfConcurrentRun(storeId: string): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_RUN_MINUTES * 60 * 1000);
  const inflight = await prisma.syncRun.findFirst({
    where: {
      storeId,
      status: "RUNNING",
      startedAt: { gte: cutoff },
    },
    select: { id: true, startedAt: true, kind: true },
    orderBy: { startedAt: "desc" },
  });
  if (inflight) {
    throw new Error(
      `Refusing to launch: SyncRun ${inflight.id} (${inflight.kind}) is still RUNNING ` +
        `(startedAt=${inflight.startedAt.toISOString()}). Wait for it to finish or for the ` +
        `${STALE_RUN_MINUTES}-min stale cutoff before retrying.`,
    );
  }
}

async function main(): Promise<void> {
  console.log("\n=== T5 host-side sync — Stevens Creek Toyota ===");
  const store = await resolveSctStore();
  await refuseIfConcurrentRun(store.id);

  const windowDays = (() => {
    const raw = process.env.SYNC_ST_WINDOW_DAYS;
    const n = raw ? Number(raw) : DEFAULT_WINDOW_DAYS;
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_WINDOW_DAYS;
  })();
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const windowEnd = now;
  console.log(`window (${windowDays}d): ${windowStart.toISOString()} .. ${windowEnd.toISOString()}`);

  const advisorSeed = loadSctAdvisorSeed();
  console.log(`advisor seed entries: ${advisorSeed ? Object.keys(advisorSeed).length : "(none)"}`);

  const beforeRaw = await prisma.rawRepairOrder.count({ where: { storeId: store.id } });
  console.log(`RawRepairOrder rows before:  ${beforeRaw}`);

  let rateLimited = false;
  let collectResult: Awaited<ReturnType<typeof collectRepairOrders>> | null = null;
  try {
    console.log("\n--- collect ---");
    collectResult = await collectRepairOrders({
      storeId: store.id,
      tekionDealerId: ST_TEKION_DEALER_ID,
      windowStart,
      windowEnd,
      kind: "MANUAL",
      advisorResolverOptions: { seed: advisorSeed },
    });
    console.log("CollectResult:");
    console.log(JSON.stringify(collectResult, null, 2));
  } catch (err) {
    if (err instanceof TekionRateLimitError) {
      rateLimited = true;
      console.log(`\n⚠ Tekion 429 rate limit hit: ${err.message}`);
      console.log("Continuing with already-collected data (no new rows pulled).");
    } else {
      throw err;
    }
  }

  const afterRaw = await prisma.rawRepairOrder.count({ where: { storeId: store.id } });
  console.log(`RawRepairOrder rows after:   ${afterRaw}  (delta=${afterRaw - beforeRaw})`);

  // Aggregate the dates the collector touched. If we got rate-limited before
  // any work, fall back to letting the aggregator decide (it picks up all
  // distinct businessDates already in RawRepairOrder).
  console.log("\n--- aggregate ---");
  let aggregateBusinessDates: Date[] | undefined;
  if (collectResult) {
    const touched = await prisma.rawRepairOrder.findMany({
      where: {
        storeId: store.id,
        businessDate: {
          gte: businessDateFloor(windowStart),
          lte: businessDateFloor(windowEnd),
        },
      },
      select: { businessDate: true },
      distinct: ["businessDate"],
    });
    aggregateBusinessDates = touched.map((r) => r.businessDate);
  }
  const aggregateResult = await aggregateMetrics({
    storeId: store.id,
    businessDates: aggregateBusinessDates && aggregateBusinessDates.length > 0
      ? aggregateBusinessDates
      : undefined,
    syncRunId: collectResult?.syncRunId,
  });
  console.log("AggregateResult:");
  console.log(JSON.stringify(aggregateResult, null, 2));

  // Final KPIs for the latest businessDate.
  const dates = aggregateResult.datesProcessed;
  const latest = dates[dates.length - 1];
  if (latest) {
    const businessDate = new Date(`${latest}T00:00:00.000Z`);
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
    const fp = computeFullPicture({ ...totals, commodities: commodityInput });
    console.log(`\nFullPicture KPIs for ${latest}:`);
    console.log(`  openRos         = ${totals.openRos}`);
    console.log(`  menuSalesPct    = ${(fp.menuSalesPct * 100).toFixed(2)}%`);
    console.log(`  alaPct          = ${(fp.alaPct * 100).toFixed(2)}%`);
    console.log(`  commodityQty    = ${fp.commodityQtyTotal}`);
    console.log(`  commodityPct    = ${(fp.commodityPct * 100).toFixed(2)}%`);
    console.log(`  recClosingPct   = ${(fp.recClosingPct * 100).toFixed(2)}%`);
    console.log(`  totalDailyGross = ${fmt$(fp.totalDailyGross)}`);
  } else {
    console.log("\nNo businessDates processed.");
  }

  console.log("\n=== RESULT ===");
  console.log(`storeId:        ${store.id}`);
  console.log(`rateLimited:    ${rateLimited}`);
  console.log(`syncRunId:      ${collectResult?.syncRunId ?? "(none — rate-limited before run)"}`);
  console.log(`rosFetched:     ${collectResult?.rosFetched ?? 0}`);
  console.log(`rawRepairOrder rows for store: ${afterRaw}`);
  console.log("=== END RESULT ===");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error("sync-st FAILED:", err);
    if (err && typeof err === "object" && "body" in err) {
      console.error("response body:", (err as { body: unknown }).body);
    }
    await prisma.$disconnect();
    process.exit(1);
  });
