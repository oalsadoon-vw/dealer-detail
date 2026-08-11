/**
 * Sync ALL API-enabled stores sequentially with an inter-store cooldown.
 *
 * Tekion's 1500-call/15-min budget is APP-WIDE (OVERALL_RATELIMIT is shared
 * across every dealer on our app_id — verified during the VI-scraper
 * migration). A 3-day window per store costs roughly 300-600 calls, so we
 * space stores out and treat a per-store failure as non-fatal: one bad store
 * must never block the other six.
 *
 * Usage:
 *   npm run sync:all                      # default 3-day window
 *   SYNC_WINDOW_DAYS=14 npm run sync:all  # backfill
 *   SYNC_STORES=SCVW,BC npm run sync:all  # subset
 *   SYNC_COOLDOWN_SECONDS=300 npm run sync:all
 */

import { prisma } from "../lib/db";
import { syncStore } from "./sync-store";

const DEFAULT_WINDOW_DAYS = 3;
const DEFAULT_COOLDOWN_SECONDS = 240;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Does this per-store failure look like a token/auth blip worth one more try?
 * Matches the exact nightly failure ('Token request failed: HTTP 400') plus
 * generic auth-ish failures (401/403, 'unauthorized', token/auth mentions).
 */
export function isTokenAuthError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("token request failed") ||
    m.includes("token response") ||
    m.includes("unauthorized") ||
    m.includes("forbidden") ||
    /\btoken\b/.test(m) ||
    /\bauth\w*/.test(m) ||
    /http 40[13]\b/.test(m)
  );
}

async function main() {
  const windowDays = (() => {
    const n = Number(process.env.SYNC_WINDOW_DAYS);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_WINDOW_DAYS;
  })();
  const cooldownSeconds = (() => {
    const n = Number(process.env.SYNC_COOLDOWN_SECONDS);
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_COOLDOWN_SECONDS;
  })();
  const only = (process.env.SYNC_STORES ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  const stores = await prisma.store.findMany({
    where: {
      apiSyncEnabled: true,
      tekionDealerId: { not: null },
      ...(only.length > 0 ? { abbreviation: { in: only } } : {}),
    },
    select: { abbreviation: true, name: true },
    orderBy: { abbreviation: "asc" },
  });
  if (stores.length === 0) {
    console.log("No API-enabled stores found. Run seed:stores.");
    return;
  }
  console.log(
    `sync-all: ${stores.length} stores, window=${windowDays}d, cooldown=${cooldownSeconds}s\n` +
      stores.map((s) => `  - ${s.abbreviation} (${s.name})`).join("\n"),
  );

  const results: Array<{
    abbrev: string;
    ok: boolean;
    rosFetched?: number;
    metricsRowsWritten?: number;
    rateLimited?: boolean;
    error?: string;
    retried?: boolean;
  }> = [];

  for (let i = 0; i < stores.length; i++) {
    const abbrev = stores[i].abbreviation ?? "?";
    try {
      const r = await syncStore(abbrev, windowDays);
      results.push({
        abbrev,
        ok: true,
        rosFetched: r.rosFetched,
        metricsRowsWritten: r.metricsRowsWritten,
        rateLimited: r.rateLimited,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${abbrev} FAILED: ${msg}`);
      results.push({ abbrev, ok: false, error: msg });
    }
    if (i < stores.length - 1 && cooldownSeconds > 0) {
      console.log(`cooldown ${cooldownSeconds}s before next store...`);
      await sleep(cooldownSeconds * 1000);
    }
  }

  // ---- Second-chance pass ----------------------------------------------
  // Stores that failed with a token/auth error get exactly ONE more attempt
  // after a cooldown. The 2026-07 nightly run lost 3/7 stores to a transient
  // 'Token request failed: HTTP 400' that self-healed — one retry pass would
  // have saved all three. Same per-store try/catch: a store that fails again
  // stays FAIL and never blocks the others.
  const secondChance = results.filter(
    (r) => !r.ok && r.error !== undefined && isTokenAuthError(r.error),
  );
  if (secondChance.length > 0) {
    console.log(
      `\nsecond-chance pass: ${secondChance.length} store(s) failed with token/auth errors: ` +
        secondChance.map((r) => r.abbrev).join(", "),
    );
    for (let i = 0; i < secondChance.length; i++) {
      const entry = secondChance[i];
      if (cooldownSeconds > 0) {
        console.log(`cooldown ${cooldownSeconds}s before retrying ${entry.abbrev}...`);
        await sleep(cooldownSeconds * 1000);
      }
      console.log(`retrying ${entry.abbrev} (second chance)...`);
      entry.retried = true;
      try {
        const r = await syncStore(entry.abbrev, windowDays);
        entry.ok = true;
        entry.error = undefined;
        entry.rosFetched = r.rosFetched;
        entry.metricsRowsWritten = r.metricsRowsWritten;
        entry.rateLimited = r.rateLimited;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`${entry.abbrev} FAILED AGAIN (second chance): ${msg}`);
        entry.error = msg;
      }
    }
  }

  console.log("\n=== SYNC-ALL SUMMARY ===");
  for (const r of results) {
    const retryTag = r.retried
      ? r.ok
        ? "  (recovered on second-chance retry)"
        : "  (failed second-chance retry too)"
      : "";
    if (r.ok) {
      console.log(
        `  ${r.abbrev.padEnd(5)} OK    ros=${r.rosFetched} metricsRows=${r.metricsRowsWritten}${r.rateLimited ? "  (rate-limited, partial)" : ""}${retryTag}`,
      );
    } else {
      console.log(`  ${r.abbrev.padEnd(5)} FAIL  ${r.error}${retryTag}`);
    }
  }
  const failures = results.filter((r) => !r.ok);
  const retriedCount = results.filter((r) => r.retried).length;
  if (retriedCount > 0) {
    const recovered = results.filter((r) => r.retried && r.ok).length;
    console.log(
      `=== second-chance retries: ${retriedCount} attempted, ${recovered} recovered ===`,
    );
  }
  console.log(`=== ${results.length - failures.length}/${results.length} stores OK ===`);
  if (failures.length > 0) process.exitCode = 1;
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (err) => {
    console.error("sync-all FAILED:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
