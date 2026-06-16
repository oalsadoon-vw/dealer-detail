# TICKET T4 — Aggregator: RawRepairOrder → AdvisorDailyMetrics (recalc + SET, idempotent)

## Context
T3 lands raw RO snapshots in `RawRepairOrder` (payload = { ro, jobs:[{ job, operations:[{ operation,
parts:[] }] }], vehicle, advisorName }). The EXISTING dashboard reads `AdvisorDailyMetrics` (+
`AdvisorDailyCommodity`) and computes KPIs via `lib/fullPicture.ts`. The email prototype already
writes those tables. T4 makes the API path write the SAME tables so the dashboard needs ZERO changes.

CRITICAL DIFFERENCE FROM EMAIL PROTOTYPE: the email ingest uses `{ increment: ... }` (additive,
because each email is new data). The API RE-FETCHES the same ROs every run, so the aggregator MUST
**recalculate each (storeId, advisorId, businessDate) bucket from scratch and SET** the values — never
increment. Re-running the aggregator over the same data must produce identical rows (idempotent).

## Target tables (already migrated — write these exact fields)
`AdvisorDailyMetrics` @@unique([storeId, advisorId, businessDate]):
  menuCount Int, menuLaborGross Float, menuPartsGross Float,
  alaCount Int, alaLaborGross Float, alaPartsGross Float,
  recCount Int, recSoldCount Int, recAmount Float, recSoldAmount Float,
  dailyLaborGross Float, dailyPartsGross Float
`AdvisorDailyCommodity` @@unique([storeId, advisorId, businessDate, commodityKey]):
  qty Int, gross Float, laborGross Float
`OpcodeCategory` @@unique([storeId, opcode]): opcode, category(MENU|ALA|REC|COMMODITY), commodityKey?
  (storeId NULL = global default; non-null = store override). This is the classification source.

NOTE on money: the dashboard's metrics columns are Float (dollars), matching the email prototype.
Keep API output in the SAME units (DOLLARS as Float) so ST and SCVW numbers are directly comparable
on the dashboard. (RawRepairOrder payload from Tekion is in cents — convert cents→dollars here, /100.)
Gross = sale − cost (both from Tekion), in dollars.

## What to build

### `apps/web/lib/aggregate/opcodeClassifier.ts`
- `loadOpcodeCategories(storeId): Promise<Map<opcodeUpper, {category, commodityKey}>>`
  Loads OpcodeCategory rows: store-specific (storeId) OVERRIDE global (storeId NULL). Key by
  opcode.toUpperCase().trim().
- `classifyOpcode(map, opcode): {category, commodityKey} | null` — null = unclassified (count as
  warning, exclude from menu/ala/rec but still include labor/parts in dailyLaborGross/dailyPartsGross
  so totals stay whole).

### `apps/web/lib/aggregate/aggregator.ts`
Export `async function aggregateMetrics(params): Promise<AggregateResult>`:
```
{ storeId: string; businessDates?: Date[];  // if omitted, aggregate ALL distinct businessDates present in RawRepairOrder for the store
  syncRunId?: string }  // optional, for provenance logging
```
Algorithm:
1. Determine the set of businessDates to (re)compute. Either the passed list, or
   `SELECT DISTINCT businessDate FROM RawRepairOrder WHERE storeId = ?`.
2. For EACH businessDate:
   a. Load all RawRepairOrder rows for (storeId, businessDate). Parse payload.
   b. Build per-advisor accumulators (key = advisorId resolved from Advisor table by tekionUserId /
      nameNormalized; if advisorName missing → "Unassigned"). Ensure an Advisor row exists (upsert by
      (storeId, nameNormalized)); reuse a cache.
   c. Walk jobs → operations. For each operation:
      - opcode = operation.opcode (or job.opcode); classify via opcodeClassifier.
      - laborGross$ = (operation.laborSale − operation.laborCost)/100  (cents→dollars; clamp the field
        names to whatever the Tekion payload actually uses — inspect a real payload and map: labor
        sale/cost amounts). partsGross$ = sum over operation.parts of (part.saleAmount −
        part.costAmount)/100  (saleAmount is the EXTENDED line total, do NOT multiply by qty).
      - Add labor+parts to dailyLaborGross / dailyPartsGross for the advisor (ALWAYS, regardless of
        category — these are store totals).
      - If category MENU: menuCount += 1, menuLaborGross += laborGross$, menuPartsGross += partsGross$.
      - If ALA: alaCount += 1, alaLaborGross/alaPartsGross += ...
      - If REC: this represents a recommendation. recAmount += (recommended $); if the rec was sold
        (operation/job indicates sold/approved status) recSoldCount += 1 and recSoldAmount += sold $.
        INSPECT the payload to find how recommendations & their sold state are represented; if the
        current API payload does NOT carry recommendation data, set rec* to 0 and emit a warning
        "rec data not present in RO payload" (do NOT fabricate). Document this in the result.
      - If COMMODITY: accumulate into a per-(advisor, commodityKey) bucket: qty += 1 (or operation
        qty if present), gross += labor$+parts$, laborGross += labor$.
   d. Count menu/ala "count" as number of qualifying OPERATIONS (mirror the email prototype's notion
      of count = line items, not ROs). If you find the email prototype counts ROs instead, match that —
      check lib/ingest.ts accumulator semantics and be consistent. State your choice in the result.
3. WRITE with recalc+SET semantics, per (storeId, advisorId, businessDate):
   - upsert AdvisorDailyMetrics: on create insert computed values; on update SET every metric field to
     the freshly computed value (NOT increment). For advisor/day buckets that have NO data this run
     but previously had rows from a stale API run, SET them to zero (or delete) so re-runs converge —
     prefer: delete AdvisorDailyMetrics + AdvisorDailyCommodity rows for the (storeId, businessDate)
     set being recomputed FIRST, inside a transaction, then insert fresh. This guarantees idempotent
     convergence and removes orphans. (Email-sourced rows for OTHER stores/dates are untouched.)
   - Same delete-then-insert for AdvisorDailyCommodity scoped to the recomputed (storeId, businessDate).
4. Return AggregateResult { datesProcessed, advisorsTouched, metricsRowsWritten, commodityRowsWritten,
   unclassifiedOpcodes: string[], warnings: string[] }.

### CLI runner `apps/web/scripts/aggregate-st.ts` + npm `aggregate:st`
- Resolve ST store, run aggregateMetrics over ALL businessDates present in RawRepairOrder.
- Print AggregateResult, then query & print a sample: for the most recent businessDate, the top 5
  advisors with menuCount/alaCount/recAmount/dailyLaborGross/dailyPartsGross, and the computed
  FullPicture (call computeFullPicture with the right inputs) so we see real KPI numbers.
- Run with `tsx --conditions=react-server`.

## Acceptance criteria
1. `npx tsc --noEmit` clean.
2. `npm run aggregate:st` runs against LIVE Supabase (reads the 142 RawRepairOrder rows already
   present — NO new Tekion API calls needed; this is DB→DB) and writes AdvisorDailyMetrics rows.
3. IDEMPOTENT: running `npm run aggregate:st` TWICE produces identical AdvisorDailyMetrics (same row
   count, same values). Prove it: capture a checksum (e.g. sum of menuCount + dailyLaborGross across
   all rows) before/after the 2nd run — must be equal.
4. Numbers sanity: print a real advisor's day — menuCount/alaCount are non-negative ints, grosses are
   plausible dollar values (not cents, not negative-by-default), recClosingPct computes without crash.
5. Report: AggregateResult, the sample advisor table, the FullPicture for the latest day, the list of
   unclassified opcodes (so we know what OpcodeCategory mappings are missing), and whether rec data is
   present in the payload.

## CONFIRMED PAYLOAD FIELD MAP (inspected from real RO 569025 — use these exact paths)
- Each payload: `{ ro, jobs:[ { job:{...}, operations:[ { operation:{...}, parts:[...] } ] } ], vehicle, advisorName }`
  (NOTE: verify whether jobs items are `{job, operations}` wrappers or the job object itself with an
   `operations` key — RO 569025 showed JOB keys at top level with `operations` sibling. Handle both:
   `const jobObj = j.job ?? j; const ops = j.operations ?? jobObj.operations ?? []`. Same for operations:
   `const opObj = o.operation ?? o; const parts = o.parts ?? opObj.parts ?? []`.)
- Opcode: `opObj.opcode` (e.g. "TSC10"), description `opObj.opcodeDescription`.
- Labor (CENTS): `opObj.labor.saleAmount`, `opObj.labor.costAmount`. laborGross$ = (saleAmount − costAmount)/100.
- Parts (CENTS, EXTENDED line totals — do NOT ×qty): `part.saleAmount`, `part.costAmount`.
  partsGross$ = Σ (part.saleAmount − part.costAmount)/100. (unit values exist as unitSaleAmount/unitCostAmount; ignore.)
- Pay type: `jobObj.payType` / `jobObj.subPayType` (use if classifier needs pay context; else informational).
- Advisor: top-level `payload.advisorName`; also `ro.assignee?.advisor?.id` for tekionUserId.
- RECOMMENDATIONS: this payload has `operation.corrections` and `job.concern` but NO explicit
  recommended/declined/sold $ structure. CONCLUSION: rec data is NOT in the current RO payload.
  Set recCount/recSoldCount/recAmount/recSoldAmount = 0 and emit warning "rec data not present in RO
  payload — needs separate Tekion recommendations endpoint (future ticket)". Do NOT fabricate.

## OpcodeCategory SEED (the table is currently EMPTY — 0 rows; 83 distinct opcodes in our data)
Before aggregating, seed a STARTER set of GLOBAL (storeId=NULL) OpcodeCategory mappings so the
aggregator produces real non-zero KPIs. Put this in `apps/web/scripts/seed-opcode-categories.ts`
(+ npm `seed:opcodes`), idempotent upsert by (storeId,opcode). Use these defaults (best-effort
Toyota maintenance taxonomy — Joe will review/extend later, so keep them in ONE obvious array):
  MENU (factory-scheduled maintenance menus): TSC10, TXM5, TXM15, TXM20, TXMBASIC, TXMPLUS, TAC30,
    TAC50, TSCCONTRACT, TSC* (any TSC/TXM/TAC prefix → MENU)
  COMMODITY: ROTATE → commodityKey "tires"; any opcode containing "ALIGN" → "alignment";
    FACBRAKE → "brakes"; "BATT" → "battery"; "WIPER" → "wipers"; "CABIN"/"AIRFILTER" → "filters"
  ALA (à la carte add-on services): VAC, MPVI, MISC, EARLYBIRD, DIAG (and other customer-pay
    non-menu service ops)
  Leave internal/non-sales opcodes UNMAPPED (they'll show as unclassified, which is correct):
    EMPSHOP, TPFM, PORT10, INFO, CAT, K1, RECALL, TEK* (warranty/internal codes)
This is a STARTER seed to prove the pipeline — the result MUST print the unclassified-opcode list so
Joe can see what still needs mapping. Do NOT spend effort perfecting the taxonomy.

## Constraints
- NO Tekion API calls (pure DB→DB transform). NO schema changes. NO dashboard/route changes.
- Recalc + SET (delete-then-insert per recomputed store/date in a transaction). NEVER increment.
- Convert cents→dollars (/100) to match the email prototype's units. Gross = sale − cost.
- Don't touch email-sourced rows for other stores/dates.
- INSPECT a real RawRepairOrder payload first to map exact Tekion field names for labor sale/cost,
  parts sale/cost, opcode, and recommendation/sold status. Report the field names you used.
