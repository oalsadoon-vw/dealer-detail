/**
 * Live collector run for Stevens Creek Toyota.
 *
 * Run with:
 *   set -a && . ./.env && set +a && \
 *     npx tsx --conditions=react-server scripts/collect-st.ts
 *   # or: npm run collect:st
 *
 * Pulls the last 3 days of ROs from Tekion into RawRepairOrder, wrapped in a
 * SyncRun. Idempotent: running it twice doesn't grow the row count. Prints the
 * CollectResult, the row count, 3 sample rows, and the SyncRun summary.
 */

import { readFileSync } from "node:fs";

import { prisma } from "../lib/db";
import { collectRepairOrders } from "../lib/sources/tekion/collector";

const ST_ORG_ID = "10000000-0000-0000-0000-000000000099";
const ST_STORE_ID = "30000000-0000-0000-0000-000000000099";
const ST_TEKION_DEALER_ID = "americanmotorscorporation_876_0";
const ST_ABBREVIATION = "ST";
const ST_NAME = "Stevens Creek Toyota";
const ST_TIMEZONE = "America/Los_Angeles";
const SCT_ADVISOR_CACHE_PATH =
  "/home/itadmin/tekion-reports/data/sct-advisor-cache.json";

function loadSctAdvisorSeed(): Record<string, string> | undefined {
  try {
    const raw = readFileSync(SCT_ADVISOR_CACHE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

async function ensureStStore(): Promise<{ id: string }> {
  const existing = await prisma.store.findUnique({
    where: { abbreviation: ST_ABBREVIATION },
  });
  if (existing) {
    if (
      existing.tekionDealerId !== ST_TEKION_DEALER_ID ||
      !existing.apiSyncEnabled
    ) {
      const updated = await prisma.store.update({
        where: { id: existing.id },
        data: {
          tekionDealerId: ST_TEKION_DEALER_ID,
          apiSyncEnabled: true,
        },
      });
      return { id: updated.id };
    }
    return { id: existing.id };
  }
  await prisma.organization.upsert({
    where: { id: ST_ORG_ID },
    update: {},
    create: {
      id: ST_ORG_ID,
      name: "Stevens Creek Group",
      slug: "stevens-creek",
    },
  });
  const store = await prisma.store.upsert({
    where: { id: ST_STORE_ID },
    update: {
      tekionDealerId: ST_TEKION_DEALER_ID,
      apiSyncEnabled: true,
      organizationId: ST_ORG_ID,
      name: ST_NAME,
      abbreviation: ST_ABBREVIATION,
      timezone: ST_TIMEZONE,
    },
    create: {
      id: ST_STORE_ID,
      organizationId: ST_ORG_ID,
      name: ST_NAME,
      abbreviation: ST_ABBREVIATION,
      timezone: ST_TIMEZONE,
      tekionDealerId: ST_TEKION_DEALER_ID,
      apiSyncEnabled: true,
    },
  });
  return { id: store.id };
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "(null)";
  return d.toISOString();
}

async function main() {
  console.log("\n=== T3 collector — Stevens Creek Toyota ===");
  const store = await ensureStStore();
  console.log(`storeId:        ${store.id}`);
  console.log(`tekionDealerId: ${ST_TEKION_DEALER_ID}`);

  const advisorSeed = loadSctAdvisorSeed();
  console.log(
    `advisor seed entries: ${advisorSeed ? Object.keys(advisorSeed).length : "(none)"}`,
  );

  // Window size: default 3 days, override with COLLECT_ST_WINDOW_DAYS for
  // short kill-tests so we don't burn the Tekion 429 budget on repeat runs.
  const windowDays = (() => {
    const raw = process.env.COLLECT_ST_WINDOW_DAYS;
    const n = raw ? Number(raw) : 3;
    return Number.isFinite(n) && n > 0 ? n : 3;
  })();
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const windowEnd = now;
  console.log(`window:         ${windowStart.toISOString()} .. ${windowEnd.toISOString()}`);

  const before = await prisma.rawRepairOrder.count({
    where: { storeId: store.id },
  });
  console.log(`rows before run: ${before}\n`);

  console.log("--- pulling ROs (creationTime window) ---");
  const result = await collectRepairOrders({
    storeId: store.id,
    tekionDealerId: ST_TEKION_DEALER_ID,
    windowStart,
    windowEnd,
    kind: "MANUAL",
    advisorResolverOptions: { seed: advisorSeed },
  });

  console.log("\nCollectResult:");
  console.log(JSON.stringify(result, null, 2));

  const after = await prisma.rawRepairOrder.count({
    where: { storeId: store.id },
  });
  console.log(`\nrows after run:  ${after}`);
  console.log(`delta:           ${after - before}`);

  const recent = await prisma.rawRepairOrder.findMany({
    where: { storeId: store.id },
    orderBy: { fetchedAt: "desc" },
    take: 3,
    select: {
      documentNumber: true,
      status: true,
      advisorTekionId: true,
      businessDate: true,
      openDate: true,
      closeDate: true,
      vin: true,
    },
  });
  console.log("\nsample rows (3 most-recent fetched):");
  for (const row of recent) {
    console.log(
      `  doc=${row.documentNumber} status=${row.status ?? "(null)"} ` +
        `advisor=${row.advisorTekionId ?? "(null)"} ` +
        `vin=${row.vin ?? "(null)"} ` +
        `business=${fmtDate(row.businessDate)} ` +
        `open=${fmtDate(row.openDate)} close=${fmtDate(row.closeDate)}`,
    );
  }

  const syncRun = await prisma.syncRun.findUnique({
    where: { id: result.syncRunId },
    select: {
      id: true,
      kind: true,
      status: true,
      apiCallCount: true,
      rosFetched: true,
      warnings: true,
      errors: true,
      summary: true,
      startedAt: true,
      finishedAt: true,
    },
  });
  console.log("\nSyncRun:");
  console.log(JSON.stringify(syncRun, null, 2));

  const advisorRows = await prisma.advisor.findMany({
    where: { storeId: store.id },
    select: { nameNormalized: true, nameRaw: true, tekionUserId: true },
    orderBy: { nameNormalized: "asc" },
  });
  console.log(`\nAdvisor rows for store (${advisorRows.length}):`);
  for (const a of advisorRows) {
    console.log(
      `  ${a.nameNormalized.padEnd(28)} raw="${a.nameRaw ?? ""}" tekionUserId=${a.tekionUserId ?? "(null)"}`,
    );
  }

  // Final RESULT block — re-query the SyncRun so we see the *persisted* status
  // (not a stale in-memory value), and print row count + summary. This must be
  // the LAST thing printed so a tail of the run log always shows the outcome.
  const finalRun = await prisma.syncRun.findUnique({
    where: { id: result.syncRunId },
    select: {
      id: true,
      status: true,
      summary: true,
      rosFetched: true,
      apiCallCount: true,
      startedAt: true,
      finishedAt: true,
    },
  });
  const finalRowCount = await prisma.rawRepairOrder.count({
    where: { storeId: store.id },
  });
  console.log("\n=== RESULT ===");
  console.log(`syncRunId:     ${result.syncRunId}`);
  console.log(`status:        ${finalRun?.status ?? "(missing)"}`);
  console.log(`rosFetched:    ${finalRun?.rosFetched ?? "(missing)"}`);
  console.log(`apiCallCount:  ${finalRun?.apiCallCount ?? "(missing)"}`);
  console.log(`startedAt:     ${fmtDate(finalRun?.startedAt)}`);
  console.log(`finishedAt:    ${fmtDate(finalRun?.finishedAt)}`);
  console.log(`summary:       ${JSON.stringify(finalRun?.summary ?? null)}`);
  console.log(`rawRepairOrder rows for store: ${finalRowCount}`);
  console.log("=== END RESULT ===");
}

async function flushStdout(): Promise<void> {
  await new Promise<void>((resolve) => {
    if (process.stdout.writableLength === 0) return resolve();
    process.stdout.write("", () => resolve());
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
    await flushStdout();
  })
  .catch(async (err) => {
    console.error("collect-st FAILED:", err);
    if (err && typeof err === "object" && "body" in err) {
      console.error("response body:", (err as { body: unknown }).body);
    }
    await prisma.$disconnect();
    await flushStdout();
    process.exit(1);
  });
