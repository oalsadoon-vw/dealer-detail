# TICKET T3 — Collector: pull Tekion ROs into RawRepairOrder (idempotent)

## Context
We have:
- A server-only Tekion API client at `apps/web/lib/sources/tekion/` (T2): `iterateRepairOrders`,
  `getJobs`, `getOperations`, `getParts`, `getRoVehicle`, plus a pluggable advisor resolver
  `resolveAdvisorName` / `getAdvisorResolver()` (T2b).
- Prisma models (T1): `SyncRun`, `RawRepairOrder`, plus `Store.tekionDealerId` / `Store.apiSyncEnabled`,
  `Advisor.tekionUserId`. Prisma client is generated. DB is Supabase (env in apps/web/.env).

This ticket builds the COLLECTOR: given a store + date window, pull every RO with its nested
jobs/operations/parts, resolve the advisor name, and UPSERT one immutable snapshot row per RO
into `RawRepairOrder`. Wrap the whole pull in a `SyncRun` record. NO aggregation, NO routes,
NO dashboard in this ticket (those are T4/T5/T6). This is a server-side library + a CLI script.

## RawRepairOrder model (already migrated — write to these exact fields)
```
documentId (Tekion RO internal id, natural key)  documentNumber  status  payType
advisorTekionId  vin  openDate  closeDate  businessDate  payload(Json)  contentHash
storeId  syncRunId  fetchedAt
@@unique([storeId, documentId])   // <-- upsert key
```

## SyncRun model (already migrated)
```
storeId  kind(FULL_BACKFILL|INCREMENTAL|MANUAL)  windowStart  windowEnd  cursor
status(RUNNING|COMPLETED|COMPLETED_WITH_WARNINGS|FAILED)  apiCallCount  rosFetched
warnings(Json) errors(Json) summary(Json)  startedAt  finishedAt
```

## What to build

### `apps/web/lib/sources/tekion/collector.ts`
Export `async function collectRepairOrders(params): Promise<CollectResult>` where params:
```
{
  storeId: string;            // DealerDetail Store.id (uuid)
  tekionDealerId: string;     // e.g. americanmotorscorporation_876_0
  windowStart: Date;          // inclusive
  windowEnd: Date;            // exclusive
  kind: "FULL_BACKFILL" | "INCREMENTAL" | "MANUAL";
}
```

Algorithm:
1. Create a `SyncRun` row with status RUNNING, the window, kind, startedAt=now.
2. Build the RO search filter: `creationTime` GTE windowStart epoch-ms. (For INCREMENTAL later we
   may use modifiedTime, but for now use creationTime; keep it a parameter.) If windowEnd is set,
   add an LTE/BTW bound so we only pull the window. Use BTW(creationTime, [startMs, endMs]) when
   both bounds exist (BTW takes exactly 2 string values), else GTE.
3. Iterate all ROs via `iterateRepairOrders` (handles pagination). For EACH RO:
   a. Fetch jobs -> for each job fetch operations -> for each operation fetch parts.
      Assemble a nested snapshot object: { ro, jobs:[{job, operations:[{operation, parts:[]}]}] }.
   b. Read advisorTekionId = ro.assignee?.advisor?.id ?? null.
   c. Read vin from ro.vehicle (or call getRoVehicle if not present on the RO).
   d. Derive businessDate: use the RO's closeDate if closed else creationTime/openDate, truncated
      to midnight UTC (a Date at YYYY-MM-DDT00:00:00.000Z). Provide a helper for this.
   e. Compute contentHash = sha256 of a stable JSON stringify of the snapshot
      (reuse apps/web/lib/hash.ts sha256Hex + stableJsonStringify if present; otherwise add).
   f. UPSERT into RawRepairOrder by unique (storeId, documentId):
        - create: all fields + syncRunId + fetchedAt=now
        - update: only if contentHash changed -> overwrite payload, status, payType, advisorTekionId,
          vin, dates, businessDate, contentHash, syncRunId, fetchedAt. If hash unchanged, skip the
          write (count as "unchanged") to avoid churn.
   g. Resolve the advisor name via resolveAdvisorName(advisorTekionId) and UPSERT an `Advisor`
      row (storeId + nameNormalized) AND set Advisor.tekionUserId = advisorTekionId. Keep a
      per-run in-memory cache so each id resolves at most once. If name is null -> use "Unassigned"
      as nameNormalized. (Advisor.nameNormalized is the existing unique key with storeId.)
4. Throttle: the client already rate-limits HTTP calls (token bucket). Bound the per-RO fan-out
   concurrency to a small pool (e.g. 4-6 concurrent ROs) so we don't burst. On TekionRateLimitError,
   the client retries; if it still throws, record a warning and CONTINUE (do not silently drop —
   push the failed documentId into warnings). Track apiCallCount best-effort.
5. On completion, update the SyncRun: status (COMPLETED, or COMPLETED_WITH_WARNINGS if warnings,
   or FAILED if a fatal error), rosFetched, apiCallCount, finishedAt, summary JSON
   { created, updated, unchanged, advisorsResolved, warnings count }.
6. Return CollectResult { syncRunId, rosFetched, created, updated, unchanged, advisorsResolved, warnings }.

### Robustness requirements (production-grade)
- Validate each RO has documentId + documentNumber before persisting; if missing, push to warnings
  and skip that RO (don't crash the run).
- Never let one bad RO abort the whole run — wrap per-RO work in try/catch, record the documentId
  + error in warnings, continue.
- Use the generated Prisma client from `apps/web/lib/db.ts` (import { prisma }).
- All money/derived parsing stays out of this ticket — we store the RAW snapshot only. (Aggregation
  is T4 and reads payload back.)
- The collector is idempotent: running it twice over the same window must NOT create duplicate
  RawRepairOrder rows (the unique key + hash-check guarantees this). Make a test prove it.

### CLI runner `apps/web/scripts/collect-st.ts`
- Loads env, resolves the ST store (for now: find or create a Store with abbreviation 'ST'/name
  'Stevens Creek Toyota' and tekionDealerId 'americanmotorscorporation_876_0', apiSyncEnabled=true
  — minimal seeding so the collector has a storeId to write against; T5 will formalize seeding).
- Runs collectRepairOrders for the LAST 3 DAYS (kind=MANUAL).
- Prints the CollectResult and then queries the DB: count of RawRepairOrder for the store, and the
  3 most recent rows (documentNumber, status, advisorTekionId, businessDate).
- Run with: `set -a && . ./.env && set +a && npx tsx --conditions=react-server scripts/collect-st.ts`
  Add an npm script `collect:st`.

## Acceptance criteria
1. `npx tsc --noEmit` clean.
2. `npm run collect:st` runs end to end against the LIVE Tekion API + LIVE Supabase DB and:
   - creates a SyncRun row that ends COMPLETED (or COMPLETED_WITH_WARNINGS),
   - writes real RawRepairOrder rows (count > 0) for Stevens Creek Toyota,
   - resolves at least some advisor names (Advisor rows created with real names, not just ids).
3. Running `npm run collect:st` a SECOND time does NOT increase the RawRepairOrder row count
   (idempotent) — report both counts to prove it.
4. Report: the CollectResult, total RawRepairOrder rows, a sample of 3 rows, and the SyncRun summary.

## Constraints
- Server-only library. No routes, no UI, no aggregation, no schema changes.
- Bounded concurrency; respect the rate limiter; never silently drop ROs on error.
- Keep the advisor browser-dependency behind the T2b resolver (do not call :9223 directly here).
