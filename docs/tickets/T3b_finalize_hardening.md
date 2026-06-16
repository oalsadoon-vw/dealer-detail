# TICKET T3b — Hardening: signal-safe SyncRun finalization + stale-run reaper

## Problem (observed live)
The collector's SyncRun finalize is correct in the happy path and on caught errors, BUT when the
host PROCESS is killed (SIGTERM/SIGKILL from a timeout wrapper, cron deadline, or Ctrl-C), the final
`prisma.syncRun.update(... status: COMPLETED/FAILED ...)` never runs and the row is left stuck at
`status: RUNNING` with `rosFetched: 0` and `summary: null` — even though the RawRepairOrder rows DID
land. This will corrupt run-history reporting for the nightly cron. We verified data idempotency is
fine (0 duplicate documentIds); this is purely the run-record bookkeeping.

## What to build (no schema changes)

### 1. Signal-safe finalize in `apps/web/lib/sources/tekion/collector.ts`
- Register handlers for `SIGINT` and `SIGTERM` at the start of `collectRepairOrders` (and remove them
  when the function returns/throws — no leaked listeners across calls).
- On receiving a signal mid-run: best-effort `await prisma.syncRun.update` to set status `FAILED`
  with errors `[{ message: 'interrupted by <signal>' }]`, finishedAt=now, plus whatever counters we
  have so far, THEN `process.exit(130)`. Guard against double-finalize (a boolean `finalized` flag so
  the normal path and the signal path can't both write).
- Wrap the existing finalize in an idempotent helper `finalizeRun(status, opts)` used by both the
  normal completion path and the signal handler. Keep current COMPLETED / COMPLETED_WITH_WARNINGS /
  FAILED logic.
- Listeners must be cleaned up in a `finally` so repeated calls in one process don't stack handlers.

### 2. Stale-run reaper helper `apps/web/lib/sources/tekion/reaper.ts`
- Export `async function reapStaleRuns(maxAgeMinutes = 30): Promise<number>` that finds SyncRun rows
  with status RUNNING and startedAt older than maxAgeMinutes, sets them to FAILED with
  errors `[{ reason: 'stale run reaped — process likely killed before finalize' }]`, finishedAt=now.
  Returns the count reaped.
- Call `reapStaleRuns()` at the START of `collectRepairOrders` (before creating the new SyncRun) so
  every new collection self-heals any orphaned RUNNING rows from prior killed processes.

### 3. Make the CLI print the summary reliably
- In `apps/web/scripts/collect-st.ts`, after `collectRepairOrders` returns, print the CollectResult
  AND re-query the SyncRun to print its final status + summary, and the RawRepairOrder count. Flush
  stdout before exit. (The summary currently gets lost when output is tailed — ensure it's the LAST
  thing printed, on its own clearly-delimited block `=== RESULT ===`.)

## Acceptance criteria
1. `npx tsc --noEmit` clean.
2. `npm run collect:st` completes and ends with a `=== RESULT ===` block showing SyncRun status
   COMPLETED/COMPLETED_WITH_WARNINGS (NOT RUNNING) and a non-null summary with created/updated/
   unchanged counts.
3. Simulate a kill: start `npm run collect:st`, send SIGTERM after ~3s, then query the DB — the
   SyncRun for that run must be FAILED (interrupted), NOT stuck at RUNNING. (Show the query result.)
4. After a stuck RUNNING row exists, the NEXT `collectRepairOrders` call reaps it to FAILED at start
   (demonstrate reapStaleRuns works — you may insert a fake RUNNING row older than 30 min to test).
5. Confirm RawRepairOrder still has 0 duplicate documentIds after all of the above.

## Constraints
- No schema changes. No new dependencies. Be mindful of the Tekion 429 rate limit — do the kill test
  with a SHORT window (e.g. last 1 day) or kill BEFORE the heavy fan-out to avoid burning the budget;
  you do not need a full pull to prove signal-safe finalize.
- Don't leak signal listeners (clean up in finally).
