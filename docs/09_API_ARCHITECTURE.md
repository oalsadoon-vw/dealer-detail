# 09 — API-Driven Architecture (Production Rebuild)

> **Status:** Design spec for the v2 rebuild. Replaces the Excel-upload / Gmail-ingest
> prototype with a direct Tekion OpenAPI ingestion pipeline.
> **Author:** Jay (Tekion DMS Specialist) · 2026-06-15

---

## 1. Why we're rebuilding

The v1 prototype ingested **Tekion Excel exports** that arrived by email. That path is:

- **Fragile** — depends on Report Builder emails firing, correct filenames, OTP-gated logins.
- **Stale** — Report Builder syncs ~4:50 AM; intraday data is empty.
- **Lossy** — Excel flattens away RO/operation structure we can't recover later.
- **Manual** — classification + parsing of arbitrary spreadsheet shapes.

The Tekion OpenAPI gives us **real-time, structured, no-OTP** data covering the same KPIs
**plus** RO/operation/parts granularity the reports never had. We rip out the email/Excel
layer entirely and replace it with a scheduled API collector.

**What we KEEP from v1:**
- Multi-tenant identity (Organization → Store → Membership → RLS) — unchanged.
- The **two-layer storage philosophy**: a raw immutable layer + a normalized analytics layer.
- The dashboard KPI definitions (menu %, ALA %, rec closing %, daily gross) — see `lib/fullPicture.ts`.

**What we DELETE:**
- `EmailSource` model + Gmail ingest route + cron.
- Excel parsing pipeline (`lib/parsing/*`), classifiers, detectors, xlsx reader.
- Upload UI + `/api/ingest` file route.
- Streamlit prototype (`streamlit_app.py`, `example_excels/`).
- `IngestedFile`, `RawReportRow` (file-shaped) → replaced by API-shaped raw tables.

---

## 2. Data sources (Tekion OpenAPI v4.0.0)

Base: `https://api.tekioncloud.com/openapi/v4.0.0`. Client: `~/tekion-api/tekion_client.py`
pattern (app_id + secret → bearer token). Per-call headers: `Authorization`, `app_id`,
`dealer_id`, `Content-Type`. Dealer IDs for all 7 stores in `~/tekion-api/config.json`.

| Data | Endpoint | Shape |
|---|---|---|
| Repair orders | `POST /repair-orders:search` | paginated, filter `creationTime`/`closedTime` GTE/BTW |
| Jobs | `GET /repair-orders/{rid}/jobs` | `data.jobs[]` |
| Operations | `GET …/jobs/{jid}/operations` | `data.roOperations[]` — opcode, `labor.saleAmount`/`costAmount` (cents) |
| Parts | `GET …/operations/{oid}/parts` | `data.parts[]` — `saleAmount` = extended line total (cents) |
| RO vehicle | `GET …/ro-vehicle` | vin, ymm, mileage |
| Advisor name | `GET /userservice/u/apc/users/{id}` | id→name; cache |
| GL balances | `GET /general-ledger/balances/all` + `/differential` | financial statement (phase 2) |
| Vehicle inventory | `POST /vehicle-inventory:search` | The Goods (phase 2) |

### Money rules (CRITICAL — verified live)
- All amounts are **integer cents**. `8999` = `$89.99`.
- `labor.saleAmount` = customer **price**, not gross. **Gross = saleAmount − costAmount**.
- Parts: line `saleAmount` is the **extended** total (qty already applied) — **do NOT × qty**.
  Gross = line `saleAmount` − `costAmount`.
- Advisor on RO is **nested**: `assignee.advisor.id` (NOT `assignee.id`).
  `"Any Service Advisor"` placeholder → display **"Unassigned"**.

### Throttle budget (Basic Plan — the constraint that shapes everything)
- **1,500 calls / 15 min**, 500,000 / 30 days.
- A naive per-RO fan-out (search + jobs + operations + parts) is ~4 calls/RO. 7 stores ×
  ~200 ROs/day = ~5,600 calls for a single day → **must be windowed**.
- **Mitigations (mandatory):**
  1. Prefilter ROs by `tags` (system OPCODE/PAY_TYPE tags) before fetching jobs — skips ~95%.
  2. Token-bucket rate limiter: cap at 1,400/15min with jittered backoff; respect `429`.
  3. Incremental pulls via `modifiedTime` cursor — only re-pull changed ROs after the
     first full backfill.
  4. Cache advisor id→name (numeric ids are stable) and opcode→category maps locally.

---

## 3. New data model

Three logical layers. **Raw** is append-only truth; **normalized** is derived and
re-buildable from raw; **dimension** tables are slowly-changing lookups.

### 3.1 Dimension / identity (KEEP from v1, lightly extended)
- `Organization`, `Profile`, `Membership`, `StoreMembership`, `Invite`, `PlatformAdmin`,
  `AuditLog` — unchanged.
- `Store` — add `tekionDealerId String?` (maps store → Tekion dealer_id) and keep
  `abbreviation`, `timezone`.
- `Advisor` — keep `(storeId, nameNormalized)`. Add `tekionUserId String?` for stable
  id→name joins.

### 3.2 Sync orchestration (replaces IngestionRun/IngestedFile)
```
SyncRun
  id, storeId, kind (FULL_BACKFILL | INCREMENTAL | MANUAL)
  windowStart, windowEnd          // business-date range pulled
  cursor      String?             // modifiedTime watermark for next incremental
  status      (RUNNING | COMPLETED | COMPLETED_WITH_WARNINGS | FAILED)
  apiCallCount Int                // throttle accounting
  rosFetched  Int
  warnings/errors/summary Json
  startedAt, finishedAt
  @@index([storeId, windowStart])
```

### 3.3 Raw layer (API-shaped, immutable, replaces RawReportRow)
```
RawRepairOrder
  id, storeId, syncRunId
  documentId    String            // Tekion internal id (stable key)
  documentNumber String           // RO#
  status, payType, openDate, closeDate, businessDate
  advisorTekionId String?
  vin String?
  payload Json                    // full RO + nested jobs/operations/parts snapshot
  contentHash String              // sha256 of payload → idempotent upsert
  fetchedAt
  @@unique([storeId, documentId])
  @@index([storeId, businessDate])
```
> One row per RO, **upserted by `(storeId, documentId)`**. Re-pulling a day overwrites the
> snapshot instead of appending — no double-count. `payload` keeps the full nested tree so
> we can add analytics later without re-fetching (the v1 "never re-upload history" property).

### 3.4 Normalized analytics layer (derived — fully rebuildable from raw)
```
AdvisorDailyMetrics                // KEYED, SET (not increment)
  storeId, advisorId, businessDate
  openRos
  menuCount, menuLaborGross, menuPartsGross
  alaCount,  alaLaborGross,  alaPartsGross
  recCount, recSoldCount, recAmount, recSoldAmount
  dailyLaborGross, dailyPartsGross
  computedFromSyncRunId            // provenance
  @@unique([storeId, advisorId, businessDate])

AdvisorDailyCommodity              // tires/alignment/etc pivot — unchanged shape
  storeId, advisorId, businessDate, commodityKey
  qty, gross, laborGross
  @@unique([storeId, advisorId, businessDate, commodityKey])
```
> **Idempotency change from v1:** v1 used additive `increment` (because multiple Excel
> files per day accumulated). The API re-pulls the *same* ROs, so we recompute each
> `(store, advisor, day)` cell **from scratch and SET** it. Re-running a sync is safe and
> convergent. Aggregation reads `RawRepairOrder.payload` for the day, never the API directly.

---

## 4. Ingestion pipeline

```
                 ┌─────────────────────────────────────────────┐
  cron / manual  │  Collector  (lib/sources/tekion/collect.ts)  │
   trigger  ───► │  1. token-bucket gate                        │
                 │  2. /repair-orders:search  (paginate)        │
                 │  3. prefilter by tags                        │
                 │  4. fan-out jobs→operations→parts (bounded)  │
                 │  5. resolve advisor id→name (cached)         │
                 └───────────────┬─────────────────────────────┘
                                 ▼   upsert by (storeId, documentId)
                          ┌──────────────┐
                          │ RawRepairOrder│   (immutable snapshots)
                          └──────┬────────┘
                                 ▼   aggregate per (store, day)
                 ┌─────────────────────────────────────────────┐
                 │  Aggregator  (lib/aggregate/advisorDay.ts)   │
                 │  opcode→category map → menu/ALA/rec buckets  │
                 │  labor/parts gross = sale − cost             │
                 │  SET AdvisorDailyMetrics + AdvisorDailyCommodity
                 └───────────────┬─────────────────────────────┘
                                 ▼
                          ┌──────────────┐
                          │  Dashboard   │  (reads normalized layer only)
                          └──────────────┘
```

**Two-phase by design:** collect (network-bound, throttle-sensitive) is fully decoupled
from aggregate (CPU-bound, deterministic, re-runnable offline). If we change a KPI formula
we re-aggregate from `RawRepairOrder` with **zero** API calls.

### Opcode → category classification
Menu vs A-la-carte vs Recommendation is opcode-driven. Maintain a versioned
`OpcodeCategory` map (`storeId?, opcode → MENU | ALA | REC | COMMODITY:<key>`), seeded from
the existing classification logic and the Report Builder definitions, editable in admin UI.
Default unknown opcodes → ALA, surfaced in a "needs classification" report.

---

## 5. Scheduling & operations

- **Nightly full-ish pull** (1 AM, matches Joe's early-riser cron convention): incremental
  by `modifiedTime` per store, falls back to FULL_BACKFILL window on first run / gaps.
- **Backfill job**: 60-day window, chunked per store per day, throttle-paced, resumable via
  `SyncRun.cursor`.
- **Manual re-sync**: admin endpoint `POST /api/sync/{storeId}` → enqueues a SyncRun.
- **Worker model:** start with Next.js route handlers + a DB-backed job row (SyncRun acts
  as the queue). Promote to BullMQ/Redis only if concurrency/duration demands it. Collector
  is idempotent so a crashed run is safely retried.

---

## 6. Safety & production-grade requirements

1. **Secrets** — Tekion `secret_key` and API token live in env / secret manager, never in
   the repo. Server-only module (`lib/sources/tekion/client.ts`), never imported client-side.
2. **RLS** — all new tables get org-scoped Row Level Security policies (mirror existing
   `enable_rls_policies` migration). Collector uses a service role that bypasses RLS;
   dashboard queries run under user RLS.
3. **Idempotency** — every write is an upsert keyed by a natural Tekion id + content hash.
   Re-runs converge, never duplicate.
4. **Observability** — `SyncRun` records call counts, durations, RO counts, warnings;
   structured logs; a `/api/health/sync` endpoint surfacing last successful sync per store.
5. **Rate-limit resilience** — token bucket + exponential backoff on `429`; a run that hits
   the throttle pauses and resumes, never silently drops ROs (v1-era bug).
6. **Validation** — Zod schemas validate every API response shape before persistence;
   malformed records quarantined to `SyncRun.warnings`, not dropped silently.
7. **Tests** — Vitest unit tests for money math (cents, gross = sale − cost, parts no ×qty),
   opcode classification, and aggregation; fixture-based collector tests with recorded
   API responses (no live calls in CI).
8. **Verification** — post-sync sanity checks: RO count ≈ store appointment volume; all
   gross amounts integer-cents-derived; advisor totals reconcile to RO totals.

---

## 7. Migration plan (Excel → API)

1. Land new schema additively (new tables alongside old) → migrate.
2. Build + verify collector and aggregator on **ONE store (SCT/`st`)** for yesterday.
3. Reconcile API-derived advisor metrics against the last good Excel/Report Builder day.
4. Roll out to all 7 stores; enable nightly cron.
5. **Then** delete the email/Excel models, routes, parsing lib, Streamlit, and old migrations.
6. Dashboard switches its data source from old normalized tables to new (same KPI shape →
   minimal UI churn).

---

## 8. Phase 2 (after advisor metrics are solid)
- **GL balances** → financial-statement tables (endpoints now known: `/balances/all`,
  `/balances/differential`).
- **Vehicle Inventory** → feed The Goods directly; VI webhooks (17 events) push price/status/
  mileage/media deltas instead of full nightly re-scrapes.
- **Deals / F&I** → front-end gross alongside fixed-ops.
