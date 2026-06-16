# TICKET T4b — Align count semantics to email prototype (penetration) + populate openRos

## Problem (found in live verification)
T4 currently counts menuCount/alaCount as OPERATIONS (line items). The EXISTING email prototype
(lib/parsing/parsers/menuSales.ts line 37-53) counts UNIQUE (advisor, RO) pairs — i.e. the number of
distinct ROs in which the advisor sold a menu (a PENETRATION count), deduped by `advisor|ro`. Because
T4 counts line items, menuSalesPct came out 127.7% (> 100%), which is nonsense for a penetration rate.

Also `openRos` (the denominator for menuSalesPct/alaPct/commodityPct) is currently 0 because the API
path never populated it. In the email world openRos comes from the OpsTrax "roCount" / Vehicle
Attendance report. The API-native equivalent is the count of DISTINCT ROs per (advisor, businessDate)
already present in RawRepairOrder.

## Fixes (in lib/aggregate/aggregator.ts — no schema changes)

### 1. menuCount / alaCount = distinct ROs (penetration), matching the email prototype
- For each (advisor, businessDate) bucket, track a `Set<documentId>` for menu and a separate
  `Set<documentId>` for ALA. When an operation classified MENU is found on RO X, add X to the menu
  set; same for ALA. At write time: `menuCount = menuMenuSet.size`, `alaCount = alaSet.size`.
- Grosses (menuLaborGross/menuPartsGross/alaLaborGross/alaPartsGross) STAY as the SUM across all
  qualifying operation lines (this already matches the email prototype lines 55-56). Do NOT change them.
- Commodity qty: keep the existing AdvisorDailyCommodity behavior, BUT verify the dashboard's
  commodityPct = commodityQtyTotal / openRos makes sense; commodity `qty` may legitimately exceed
  RO count (multiple tires) — that's fine, leave qty as-is (it's a quantity, not a penetration).

### 2. Populate openRos per (advisor, businessDate)
RESOLVED — `AdvisorDailyMetrics.openRos Int @default(0)` ALREADY EXISTS (schema line 243). The API
route reads it (app/api/advisor/route.ts:68) and the dashboard computes menuSalesPct = menuCountTotal
/ openRosTotal (app/(app)/dashboard/ui.tsx:270). So NO schema change — just SET openRos =
distinct RawRepairOrder.documentId count for each (storeId, advisorId, businessDate) bucket.
Store-wide openRos for the FullPicture sample = unique documentIds across all advisors that day.

### 3. Re-verify the KPI sample
- After the fix, for the latest businessDate print: store-wide openRos, total menuCount, total alaCount,
  and computeFullPicture(...) — menuSalesPct and alaPct MUST now be in a sane 0–100%+ range that
  reflects penetration (a single RO can have both a menu AND ala, so each pct is independently 0–100%;
  they should NOT exceed ~100% unless an advisor genuinely sold a menu on more ROs than... no — capped
  by openRos, so each ≤ 100%). If menuSalesPct still > 100%, the dedupe is wrong — fix it.

## Acceptance criteria
1. `npx tsc --noEmit` clean.
2. `npm run aggregate:st` re-run: menuCount/alaCount are now DISTINCT-RO penetration counts
   (≤ openRos for that bucket). openRos is populated (> 0) for ST.
3. For the latest businessDate, menuSalesPct and alaPct are each in 0–100% and printed. Show the math:
   menuCount, alaCount, openRos, and the resulting pcts.
4. STILL IDEMPOTENT: run twice, identical checksum (menuCount sum, alaCount sum, dailyLaborGross sum,
   openRos sum). Prove it.
5. Email-sourced rows for other stores untouched (spot-check a non-ST store/date still has its values).

## Constraints
- Match the email prototype's penetration semantics EXACTLY (dedupe by advisor|RO) so ST and SCVW are
  comparable on the same dashboard.
- No schema changes if avoidable. If openRos genuinely has nowhere to live for the API path and a
  column is unavoidable, STOP and report back BEFORE adding a migration (Jay will decide) — do not
  silently alter the schema.
- Recalc + SET, idempotent. cents->dollars unchanged. Don't touch email-store data.
