# TICKET T5 — Seed ST onto the REAL store + manual sync endpoint (collect → aggregate)

## Context & problem to fix
T3/T4 wrote data against a THROWAWAY store row created by the collector script:
  id=30000000-0000-0000-0000-000000000099, name="Stevens Creek Toyota", abbreviation="ST",
  tekionDealerId="americanmotorscorporation_876_0", apiSyncEnabled=true
But the REAL Stevens Creek Toyota store the dashboard/orgs know is:
  id=1314a22f-f3b1-4edc-acb9-3634353bc1a8, name="Stevens Creek Toyota", abbreviation="SCT",
  tekionDealerId=NULL, apiSyncEnabled=false
We must NOT ship with a duplicate/orphan store. T5 consolidates onto the REAL store (SCT) and adds a
one-button sync.

## Part A — Consolidate onto the real store (data migration script)
`apps/web/scripts/consolidate-st-store.ts` (+ npm `consolidate:st`):
1. Real store = the one with abbreviation 'SCT' (id 1314a22f...). Set its tekionDealerId =
   'americanmotorscorporation_876_0' and apiSyncEnabled = true.
2. Re-point all rows currently under the throwaway store (id 3000...099) to the real SCT store id:
   RawRepairOrder.storeId, SyncRun.storeId, AdvisorDailyMetrics.storeId, AdvisorDailyCommodity.storeId,
   Advisor.storeId. BUT watch the unique constraints:
   - Advisor @@unique(storeId, nameNormalized): if an advisor with the same nameNormalized already
     exists under SCT, MERGE (re-point that advisor's child rows to the existing SCT advisor, then
     delete the dup) rather than violating the unique key.
   - AdvisorDailyMetrics @@unique(storeId, advisorId, businessDate) and AdvisorDailyCommodity
     @@unique(storeId, advisorId, businessDate, commodityKey): after re-pointing advisorId to merged
     SCT advisors, collisions are possible. Safest approach: after re-pointing RawRepairOrder + Advisor
     to SCT, DELETE all AdvisorDailyMetrics/AdvisorDailyCommodity for the throwaway store, then just
     RE-RUN the aggregator for SCT (it's idempotent and rebuilds metrics from RawRepairOrder). So:
       a. re-point RawRepairOrder + SyncRun to SCT
       b. merge Advisor rows (dedupe by nameNormalized) into SCT, re-point any FKs
       c. delete throwaway store's AdvisorDailyMetrics + AdvisorDailyCommodity
       d. delete the now-empty throwaway store row (3000...099)
       e. run aggregateMetrics({ storeId: SCT }) to rebuild metrics cleanly under SCT
   Do this in a transaction where practical; print a before/after row-count table for every table.
3. Make the script idempotent/safe to re-run (if the throwaway store is already gone, no-op with a
   clear message).
4. After running: scripts/collect-st.ts and scripts/aggregate-st.ts must resolve the SCT store by
   abbreviation 'SCT' (NOT create a new 'ST' store). Update them to look up the existing store by
   tekionDealerId 'americanmotorscorporation_876_0' (now on SCT) and FAIL LOUDLY if not found
   (no silent create).

## Part B — Manual sync endpoint
`apps/web/app/api/sync/[storeId]/route.ts` — `POST /api/sync/{storeId}`:
1. Auth: follow the SAME auth pattern as the existing protected routes (inspect app/api/ingest/route.ts
   and app/api/runs/route.ts for how they authenticate/authorize the caller + scope to org/store).
   Reject if the caller isn't allowed to sync that store.
2. Validate the store exists and apiSyncEnabled=true and tekionDealerId is set; else 400 with a clear
   message.
3. Body params (all optional): { days?: number (default 3), windowStart?, windowEnd? }. Compute the
   window (default last `days` days).
4. Run collectRepairOrders({ storeId, tekionDealerId, window, kind: "MANUAL" }) THEN
   aggregateMetrics({ storeId, businessDates: <the dates touched> }). Return JSON with the
   CollectResult + AggregateResult + the SyncRun id/status.
5. IMPORTANT — serverless vs browser advisor resolver: the collector resolves advisor names via the
   T2b resolver, which in 'browser' mode depends on the :9223 session that ONLY exists on this host,
   not on Vercel. So this endpoint, when deployed, would fail advisor resolution. For the PILOT:
   guard the route — if running in a serverless/Vercel environment (no browser resolver available),
   return 501 with a clear message "manual sync runs on the collector host only (browser advisor
   resolver unavailable in serverless); use the CLI / host-side trigger". The route is built and
   correct for when the API resolver is enabled (Tekion scope), but must not pretend to work on Vercel.
   Detect via env (e.g. process.env.VERCEL or TEKION_ADVISOR_RESOLVER==='browser').
6. Concurrency guard: if a SyncRun for this store is already RUNNING (and not stale), return 409
   "sync already in progress" rather than launching a second concurrent pull (protects the rate limit).

## Part C — host-side trigger script (works today)
`apps/web/scripts/sync-st.ts` (+ npm `sync:st`): does collect→aggregate for SCT in-process on THIS
host (where the browser resolver works), printing CollectResult + AggregateResult + final KPIs. This
is the thing we actually run for the pilot until the API advisor resolver is enabled. Be mindful of
the Tekion 429 rate limit — default to a SHORT window (last 1–2 days) and reuse the reaper/guards.

## Acceptance criteria
1. `npx tsc --noEmit` clean.
2. `npm run consolidate:st` runs: the throwaway store (3000...099) is GONE, the real SCT store
   (1314a22f...) now has tekionDealerId + apiSyncEnabled=true, and ALL RawRepairOrder /
   AdvisorDailyMetrics / AdvisorDailyCommodity / SyncRun / Advisor rows now belong to SCT. Print the
   before/after counts proving nothing was lost (RawRepairOrder count unchanged, e.g. 142).
3. After consolidation, aggregator re-run under SCT reproduces the KPIs (ST 2026-06-15 menu ~87%,
   ala ~93%, openRos ~141) — now attached to the REAL store.
4. `POST /api/sync/{SCT-id}` route exists, compiles, has auth + validation + the serverless guard +
   the 409 concurrency guard. (You don't need a live Vercel test; a local curl against `next dev`
   OR a direct unit-style invocation proving the guards fire is enough — or clearly document why a
   live call isn't run.)
5. `npm run sync:st` runs collect→aggregate end-to-end on this host for SCT and prints final KPIs
   (use a short window to respect the rate limit; if you hit 429, report it and rely on already-present
   data — do NOT hammer the API).
6. No duplicate store remains; `prisma` Store table shows ONE Stevens Creek Toyota.

## Constraints
- Idempotent + non-destructive to OTHER stores (SCVW email data untouched).
- Respect the Tekion 429 rate limit — short windows, no repeated full pulls.
- No new dependencies. Follow existing route auth conventions exactly.
- If consolidation hits a unique-constraint edge you can't resolve safely, STOP and report before
  forcing deletes that could lose data.
