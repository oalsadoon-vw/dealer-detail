/**
 * Generalized host-side sync for ANY API-enabled store (collect -> aggregate).
 * Multi-store successor to sync-st.ts (kept for back-compat).
 *
 * Usage:
 *   npm run sync:store -- SCT            # by abbreviation
 *   npm run sync:store -- SCVW 14        # optional window-days override
 * Env:
 *   SYNC_WINDOW_DAYS  — default window (arg 2 wins if both given)
 *   SYNC_SOURCE       — "internal" (default) | "openapi"
 *                       internal = Tekion internal API via the logged-in browser
 *                                  (:9225, TEKION_BROWSER). ~1 call / 50 ROs, no quota.
 *                       openapi  = legacy public OpenAPI fan-out (~12 calls / RO,
 *                                  1,500 calls / 15 min APP-WIDE). Fallback only.
 *
 * There is deliberately NO automatic fallback from internal → openapi: if the
 * browser is logged out the run FAILS loudly (BrowserNotAuthenticated) and the
 * Sync page / stale-store alert surface it. Silent fallback hid 3 outages.
 */

import { readFileSync } from "node:fs";

import { prisma } from "../lib/db";
import { collectRepairOrders } from "../lib/sources/tekion/collector";
import { collectRepairOrdersInternal } from "../lib/sources/tekion/internal/collector";
import { aggregateMetrics } from "../lib/aggregate/aggregator";
import { buildRoFacts } from "../lib/facts/buildRoFacts";
import { TekionRateLimitError } from "../lib/sources/tekion/client";

const STALE_RUN_MINUTES = 30;
const DEFAULT_WINDOW_DAYS = 14;

export type SyncSource = "internal" | "openapi";
export function resolveSyncSource(): SyncSource {
  const v = (process.env.SYNC_SOURCE ?? "internal").trim().toLowerCase();
  if (v === "openapi" || v === "internal") return v;
  throw new Error(`SYNC_SOURCE must be "internal" or "openapi" (got "${v}")`);
}

/** Optional per-store advisor seed caches (id -> name), used as warm-start only. */
const ADVISOR_SEED_PATHS: Record<string, string> = {
  SCT: "/home/itadmin/tekion-reports/data/sct-advisor-cache.json",
  BC: "/home/itadmin/tekion-reports/data/bc-advisor-name-cache.json",
};

function loadAdvisorSeed(abbrev: string): Record<string, string> | undefined {
  const path = ADVISOR_SEED_PATHS[abbrev];
  if (!path) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function businessDateFloor(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function syncStore(abbrev: string, windowDays: number): Promise<{
  abbrev: string;
  rosFetched: number;
  rateLimited: boolean;
  metricsRowsWritten: number;
  datesProcessed: string[];
  unclassifiedOpcodes: string[];
  factsBuilt: number;
}> {
  const store = await prisma.store.findFirst({
    where: { abbreviation: abbrev },
    select: { id: true, name: true, abbreviation: true, tekionDealerId: true, apiSyncEnabled: true },
  });
  if (!store) throw new Error(`No store with abbreviation '${abbrev}'. Run seed:stores first.`);
  if (!store.apiSyncEnabled || !store.tekionDealerId) {
    throw new Error(`Store ${abbrev} missing apiSyncEnabled/tekionDealerId. Run seed:stores.`);
  }

  // Refuse concurrent runs for this store.
  const cutoff = new Date(Date.now() - STALE_RUN_MINUTES * 60 * 1000);
  const inflight = await prisma.syncRun.findFirst({
    where: { storeId: store.id, status: "RUNNING", startedAt: { gte: cutoff } },
    select: { id: true, startedAt: true },
  });
  if (inflight) {
    throw new Error(
      `Refusing ${abbrev}: SyncRun ${inflight.id} still RUNNING (started ${inflight.startedAt.toISOString()}).`,
    );
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
  // Window on modifiedTime, not creationTime: an RO that closes days after it
  // was written gets modified at close, so a modifiedTime window re-captures it
  // and un-freezes its status/closeDate. creationTime windows silently freeze
  // any RO that outlives the window (hundreds of phantom "open" ROs per store).
  const dateField =
    (process.env.SYNC_DATE_FIELD as "creationTime" | "modifiedTime" | undefined) ??
    "modifiedTime";
  const source = resolveSyncSource();
  console.log(
    `\n=== sync ${abbrev} (“${store.name}”, dealer ${store.tekionDealerId}) window=${windowDays}d field=${dateField} source=${source} ===`,
  );

  let rateLimited = false;
  let collectResult: Awaited<ReturnType<typeof collectRepairOrders>> | null = null;
  try {
    collectResult =
      source === "internal"
        ? await collectRepairOrdersInternal({
            storeId: store.id,
            tekionDealerId: store.tekionDealerId,
            windowStart,
            windowEnd: now,
            kind: "MANUAL",
            onProgress: (p) =>
              console.log(`${abbrev}   … ${p.seen}/${p.total} headers, written=${p.written} skipped=${p.skipped}`),
          })
        : await collectRepairOrders({
            storeId: store.id,
            tekionDealerId: store.tekionDealerId,
            windowStart,
            windowEnd: now,
            kind: "MANUAL",
            dateField,
            advisorResolverOptions: { seed: loadAdvisorSeed(abbrev) },
          });
    console.log(
      `${abbrev} collect[${source}]: fetched=${collectResult.rosFetched} created=${collectResult.created} updated=${collectResult.updated} unchanged=${collectResult.unchanged} skippedFanOut=${collectResult.skippedFanOut} apiCalls=${collectResult.apiCallCount} status=${collectResult.status}`,
    );
  } catch (err) {
    if (err instanceof TekionRateLimitError) {
      rateLimited = true;
      console.log(`${abbrev}: ⚠ Tekion 429 — continuing with already-collected data.`);
    } else {
      throw err;
    }
  }

  let aggregateBusinessDates: Date[] | undefined;
  if (collectResult) {
    // Re-aggregate exactly the businessDates this run touched (including OLD
    // dates a re-captured RO moved OUT of), plus the window itself as a safety
    // net for legacy rows.
    const touched = await prisma.rawRepairOrder.findMany({
      where: {
        storeId: store.id,
        businessDate: { gte: businessDateFloor(windowStart), lte: businessDateFloor(now) },
      },
      select: { businessDate: true },
      distinct: ["businessDate"],
    });
    const merged = new Map<number, Date>();
    for (const r of touched) merged.set(r.businessDate.getTime(), r.businessDate);
    for (const d of collectResult.touchedBusinessDates ?? []) merged.set(d.getTime(), d);
    aggregateBusinessDates = Array.from(merged.values());
  }
  const agg = await aggregateMetrics({
    storeId: store.id,
    businessDates:
      aggregateBusinessDates && aggregateBusinessDates.length > 0 ? aggregateBusinessDates : undefined,
    syncRunId: collectResult?.syncRunId,
  });
  console.log(
    `${abbrev} aggregate: dates=${agg.datesProcessed.length} metricsRows=${agg.metricsRowsWritten} unclassified=${agg.unclassifiedOpcodes.length}`,
  );

  // v2 fact layer: rebuild RoFact/RoOpFact for every raw row this run wrote
  // (fetchedAt is stamped at write time, so "since run start" is exact).
  // Legacy AdvisorDailyMetrics above stays for the old email-path dashboards.
  const facts = await buildRoFacts({ storeId: store.id, fetchedSince: new Date(now.getTime() - 1000) });
  console.log(`${abbrev} facts: ros=${facts.rosBuilt} ops=${facts.opsBuilt} unclassified=${facts.unclassifiedOpcodes.length}`);

  // Orphan sweep: a run that FAILED mid-way (DB reset, ES cap, browser death)
  // wrote raws but never reached buildRoFacts; later runs skip those ROs as
  // "unchanged" so they'd stay fact-less (or fact-stale) forever — SCVW 10/22:
  // 62 raws / 34 closed ROs missing from MTD. Rebuild any raw whose fact is
  // missing or older than the raw, store-wide.
  const stale = await prisma.$queryRaw<Array<{ documentId: string }>>`
    select r."documentId" from "RawRepairOrder" r
    left join "RoFact" f on f."storeId" = r."storeId" and f."documentId" = r."documentId"
    where r."storeId" = ${store.id} and (f.id is null or r."fetchedAt" > f."builtAt")`;
  if (stale.length > 0) {
    const swept = await buildRoFacts({ storeId: store.id, documentIds: stale.map((s) => s.documentId) });
    console.log(`${abbrev} facts orphan-sweep: ${stale.length} stale raws → ros=${swept.rosBuilt} ops=${swept.opsBuilt}`);
  }

  return {
    abbrev,
    rosFetched: collectResult?.rosFetched ?? 0,
    rateLimited,
    metricsRowsWritten: agg.metricsRowsWritten,
    datesProcessed: agg.datesProcessed,
    unclassifiedOpcodes: agg.unclassifiedOpcodes,
    factsBuilt: facts.rosBuilt,
  };
}

async function main() {
  const abbrev = (process.argv[2] ?? "").toUpperCase().trim();
  if (!abbrev) throw new Error("Usage: npm run sync:store -- <ABBREV> [windowDays]");
  const argDays = Number(process.argv[3]);
  const envDays = Number(process.env.SYNC_WINDOW_DAYS);
  const windowDays =
    Number.isFinite(argDays) && argDays > 0
      ? argDays
      : Number.isFinite(envDays) && envDays > 0
        ? envDays
        : DEFAULT_WINDOW_DAYS;

  const res = await syncStore(abbrev, windowDays);
  console.log("\n=== RESULT ===");
  console.log(JSON.stringify(res, null, 2));
  console.log("=== END RESULT ===");
}

// Only run main() when invoked directly (sync-all imports syncStore).
if (process.argv[1] && /sync-store\.(ts|js)$/.test(process.argv[1])) {
  main()
    .then(async () => prisma.$disconnect())
    .catch(async (err) => {
      console.error("sync-store FAILED:", err);
      await prisma.$disconnect();
      process.exit(1);
    });
}
