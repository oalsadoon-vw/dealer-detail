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

  const now = new Date();
  const windowStart = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
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
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error("collect-st FAILED:", err);
    if (err && typeof err === "object" && "body" in err) {
      console.error("response body:", (err as { body: unknown }).body);
    }
    await prisma.$disconnect();
    process.exit(1);
  });
