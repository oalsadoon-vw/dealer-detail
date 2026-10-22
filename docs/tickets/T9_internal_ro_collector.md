# T9 — Internal-API RO collector (1 call per 50 ROs) + resumable sync + scorecard-exact Menu Sales

## Why (the core problem, not the band-aid)

The nightly all-stores sync has broken 5 times (7/02, 7/08, 9/01, 10/06, 10/22). The last three
share ONE root cause, which was never fixed — only patched around (bigger timeout, store rotation,
manual facts re-runs):

    Tekion OpenAPI quota  = 1,500 calls / 15 min, APP-WIDE (all 7 stores + VI pull + GL share it)
    OpenAPI collector     = ~12 calls per changed RO (jobs → ops per job → parts per op → vehicle)
    Nightly need          ≈ 23,000+ calls on a normal night (BST 11,247 + SCT ~4,500 + TOL ~4,300 + BC ~2,700 + …)
    Nightly budget        = 2h30 cap (2 AM VI pull shares the quota) ≈ 14,000 calls at the ceiling

The job cannot finish by design. Whoever sits behind BST in the rotation goes stale. Any fix that
keeps the OpenAPI fan-out just moves the starvation to a different store.

## What changes

### 1. Collector v2 — Tekion INTERNAL API through the logged-in browser (:9225)

Same path `/reports/financials` (GL snapshot) already uses. Zero OpenAPI quota.

| Step | Endpoint | Calls | Verified |
|---|---|---|---|
| RO headers in window | `POST /api/service-module/u/ro/v1/ro-search` filters `modifiedTime GTE/LTE`, sort ASC, `pageInfo{start,rows:200}` | 1 per 200 ROs | 200/page OK, 500 → 400 `max.es.search.row.count.exceeded`; `data.total` + `data.list[]` |
| Jobs+ops+parts for a batch | `POST /api/service-module/u/job/search` `filters[{field:roId,IN,[≤50 ids]}]`, `pageInfo{start,rows:500}` | 1 per 50 ROs | returns every job incl. `operations[].partLineV2s[]`; `deleted:true` = voided job (57/239 hits BC) |
| Advisor name/persona | `GET /api/userservice/u/apc/users/{id}` | 1 per NEW advisor id (cached in DB) | same shape as OpenAPI `/users/{id}` incl. `userRoleDetails.secondaryRoles[]` |

Cost model: BST worst night (11,247 OpenAPI calls ≈ 940 changed ROs) → ~5 search pages + ~19 job
batches ≈ **25 calls, ~15 s**. Whole fleet ≈ 150 calls / ~2 min. The 2h30 timeout becomes irrelevant.

Header-first skip stays: if `header.modifiedTime === RawRepairOrder.sourceModifiedAt` the RO is not
re-fetched or re-hashed.

### 2. Mapper — internal shape → EXISTING `RawRepairOrder.payload` shape

Facts (`buildRoFacts.ts`), the legacy aggregator, and every report read the OpenAPI payload shape.
The mapper produces that exact shape so **nothing downstream changes** and the two sources can be
tied out row-for-row. Money stays INTEGER CENTS.

| payload field (OpenAPI shape) | internal source | note |
|---|---|---|
| `ro.documentId` | header `id` | |
| `ro.documentNumber` | header `roNo` | |
| `ro.status` | header `status` | same enum (CLOSED/INVOICED/IN_PROGRESS/…/VOIDED) |
| `ro.type` | header `type` | |
| `ro.creationTime` / `modifiedTime` | header `createdTime` / `modifiedTime` | |
| `ro.closedTime` / `invoicedTime` | header `closedTime` / `lastInvoicedTime` | OpenAPI left these null; internal has them → closeDate becomes exact, not modifiedTime-derived |
| `ro.schedule[]` | `CHECKIN_TIME`=header `checkinTime`, `CLOSED_TIME`=`closedTime`, `INVOICED_TIME`=`lastInvoicedTime`, `PROMISE_TIME`=`promiseTime`, `APPOINTMENT_TIME`=`appointmentDateTime` | facts read `scheduleValue()` |
| `ro.assignee.advisor.id` | header `primaryAdvisorId` | |
| `ro.tags[]` | `[{field:"OPCODE",value}]` from job ops | parity with OpenAPI tags |
| `vehicle{vin,year,make,model,mileageIn,mileageOut}` | header `vehicle{vin,year,make,model,mileageIn,mileageOut}` | year is a string "2021" → `num()` handles it |
| `jobs[].job{id,jobNumber,status,payType,subPayType,type,creationTime,modifiedTime,completionTime}` | job hit; **skip `deleted:true`** (= voided) | `nonVoidedJobCount` ties exactly after skip |
| `jobs[].operations[].operation{id,opcode,opcodeDescription,labor{saleAmount,costAmount,billDuration}}` | op `laborAmount.amount` / `laborCostAmount.amount` / `billingTimeInSeconds`; skip `deleted:true` ops | tie-out 12/12 ROs exact |
| `jobs[].operations[].parts[]{partNumber,status,saleAmount,costAmount,quantities[{type:SALE,value}]}` | `partLineV2s[]`: partNumber = `partId` stripped of `M_<BRAND>_` else `resolvedPartName.split(" - ")[0]` minus `(S)`; sale=`totalSaleAmount`; **cost = `totalCost − oemAdjustmentCostPerPart × saleQty`**; qty=`saleQty`; skip `deleted` | 412/412 cost lines exact incl. 5 OEM-adjust lines (OpenAPI reports pre-adjustment cost) |
| `advisorName`, `advisorPersona` | resolver | |
| `source: "internal"` | constant | lets the Sync page show which path produced the row |

### 3. Resumable runs

`SyncRun.cursor` (exists, unused) = last fully-written header `modifiedTime` (ASC order). On start,
if the previous run for the store FAILED/was killed with a cursor inside the current window, resume
from `cursor − 1 min` instead of the window start. A killed run never throws away its work.

### 4. OpenAPI stays as fallback, never as default

`SYNC_SOURCE=internal|openapi` (default `internal`). If the browser is not logged in
(`location.hostname !== "app.tekioncloud.com"` or `localStorage.t_token` missing) the run fails
LOUDLY with `BrowserNotAuthenticated` and the Sync page shows it — it does **not** silently fall
back to the quota-starved path (that is the pattern that hid the last 3 incidents).

### 5. Sync Status page — stale alert that actually fires

Already shows a 30h banner, but only if someone opens the page. Add `scripts/check-stale-stores.sh`
(cron 06:30) that posts to Slack when any API store's newest `sourceModifiedAt` is > 30h old or
the last run FAILED. Message names the store(s) and the reason.

### 6. Menu Sales — scorecard-exact definition

The emailed BC/SCT/TOL/BT scorecards (`tekion-reports/*_menu_sales_*`) define a menu sale as:

    RO status ∈ {CLOSED, INVOICED}         (search filter — "closed")
    AND operation opcode ∈ store SERVICE_MENU set (strict TEK<mileage>[BPV][NS]M — 212/212 at BC)
    AND operation labor.saleAmount > 0     ("lab <= 0: continue")
    counted per MENU LINE, grouped by RO

The site counted every `isMenu` op regardless of labor. BC Oct 1–21 tie-out: site 115 vs scorecard
94 → 13 $0-labor lines + 8 INVOICED-but-not-CLOSED. The 8 INVOICED are legitimately "closed" by the
scorecard's own filter (it includes INVOICED) — the real gap was the closed-basis date: the
scorecard windows on `closedTime`, the site on `closeDate` derived from `modifiedTime`. With the
internal header's true `closedTime` + the labor>0 rule, both converge.

Change: `RoOpFact.isMenuSale = isMenu && laborSale > 0` (new column, backfilled by facts rebuild);
`RoFact.menuLines/menuLaborSale/menuPartsSale/hasMenu` are computed from `isMenuSale`. `getMenuSales`
and the Menu page use `isMenuSale`. Acceptance: BC closed-basis Oct 1–21 = **94 ROs**, same RO set
as `data/bc-menu-sales-closed-2026-10-21.json`.

### 7. Persona bug (found during verification)

Jacob Debussey (BC) → primary role `EMPLOYEE`, secondary `SERVICE_ADVISOR`; the site files him under
"Others". `extractUserPersona` only reads `primaryRole`. Fix: if any `secondaryRoles[].persona ===
"SERVICE_ADVISOR"`, persona = `SERVICE_ADVISOR`. One-off re-resolve of advisors with persona ∉
{SERVICE_ADVISOR, null}.

## Acceptance

1. `npm run sync:store -- BC 3` with `SYNC_SOURCE=internal` completes in < 2 min, `apiCallCount` < 60.
2. **Tie-out script** `scripts/tieout-sources.ts <STORE> <days>`: for every RO in the window fetched
   by BOTH paths, `buildFactsFromPayload()` output is deep-equal (ro + ops) except `closeTs`/`closeDate`
   where internal is allowed to be EARLIER (true closedTime vs modifiedTime). Exit non-zero on any
   other diff. Run on BC, SCT, TOL before switching the cron.
3. Facts rebuild for Oct → BC Menu Sales closed Oct 1–21 = 94 ROs, identical RO set to the scorecard.
4. Nightly cron switched to internal path; next-morning Sync page shows all 7 stores COMPLETED,
   newest RO < 12h old on each.
5. Kill a run mid-store (SIGTERM) → rerun resumes from cursor, no duplicate/lost ROs.
6. Browser logged out → run FAILS with `BrowserNotAuthenticated`, Slack alert fires, no silent fallback.
7. `vitest` green: mapper unit tests (fixtures captured from live BC RO 105066 + a deleted-job RO),
   persona secondary-role test, isMenuSale test.

## Non-goals

- No change to the legacy `AdvisorDailyMetrics` aggregator math.
- No change to the Financials/GL path (already internal).
- OpenAPI client stays in the repo as fallback and for the VI pull.
