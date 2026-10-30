# "Show Everything" — Status/Pay-Type Filters, Exports, Custom Views

> **For Hermes:** Phase 1 executes via subagent-driven-development, 3 parallel lanes + Jay QA/tie-out.

**Goal:** fixedopsreports.com shows every RO status and pay type by default (what Joe/Sean see in Tekion), lets each user filter down, and exports any view. Later: saved views + configurable dashboard widgets.

**Why (measured 2026-10-29):** site "closed basis" hard-filters `status='CLOSED'` (`lib/server/services/reports.ts:dateWhere`, `elr.ts:132/241`). DB already holds every status for every store (Oct MTD SCT: 4,381 CLOSED · 358 INVOICED · 43 RFI · 16 IN_PROGRESS · 17 TECH_ASSIGNED · 13 HOLD · 17 UNASSIGNED · 35 VOIDED, with $ on each). Sean's Tekion report includes INVOICED (+ open jobs) → "numbers off". Nothing to collect; it's a display filter.

**Tech:** Next 14 app router, Prisma/Supabase, Tailwind, in-house UI kit (`components/ui`), `xlsx` already a dependency. URL-persisted filter state (`lib/client/report-filters.ts`). No new heavy deps for Phase 1.

---

## Design decisions (need Omar OK)

### D1. Default = everything
Default filter state on every report page: **all statuses, all pay types, "Activity" date basis**. Users subtract, never add.

### D2. Date basis gets a 3rd option — this is the crux
Open ROs have **no close date**. "Closed basis + all statuses" can never show an in-progress RO. So:

| Basis | Which ROs | Matches |
|---|---|---|
| **Activity** (new, default) | opened in range OR closed/invoiced in range | "everything that touched the shop this period" — Sean's mental model |
| Closed | closeDate in range (CLOSED_TIME, fallback INVOICED_TIME) | Tekion closed reports / financial statement |
| Opened | openDate in range | Tekion RO list by created date |

Activity basis dedups an RO that both opened and closed in range (counted once).

### D3. "Tie to Tekion" is one click, not the default
A preset chip **"Posted only (ties to financials)"** = Closed basis + status CLOSED. Nightly dollar tie-out keeps proving that base is exact; every other status is additive on top. We never lose the audited number.

### D4. Status filter is a **composition strip, not a dropdown**
Above every report: one chip per status present in the current range, showing `count · $sale`. Chips are toggles (click = exclude, click again = include; alt-click = only). Grouped visually: **Posted** (CLOSED) · **Invoiced** (INVOICED) · **Open** (RFI, IN_PROGRESS, TECH_ASSIGNED, PARTIALLY_ASSIGNED, UNASSIGNED, HOLD) · **Voided**. The user sees *what makes up the number* before deciding what to hide. This directly answers "the amount of data is overwhelming": the strip is the map.

### D5. Pay type = same chip pattern
CP · Warranty · Internal · Other, each with `$` for the current selection. Applies at the **operation** level (RoOpFact.payClass) — an RO with CP+W jobs contributes only its CP ops when W is hidden. RO *counts* with a pay-type filter = ROs having ≥1 matching op (stated in a tooltip; this is how Tekion behaves too).

### D6. VOIDED default = hidden
Only exception to "everything on". $0 value, pollutes counts. Chip still present so it can be turned on.

### D7. Filter state in the URL (already the pattern) — `?basis=activity&status=CLOSED,INVOICED,OPEN&pay=CP,W`
Bookmarkable/shareable today; Phase 2 saved views are just named URLs + layout.

### D8. Export = what you see
Every table gets **CSV · Excel · PDF**. Excel via `xlsx` (already installed): one sheet per table on the page + a "Filters" sheet recording store/range/basis/status/pay so a number can always be reproduced. PDF via print stylesheet (`@media print`, hides nav/filter bar, keeps header with store + filters + generated-at). No server rendering, zero new infra.

### D9. Open-RO dollars are labelled
Open-status ROs show quoted/in-progress $ that will change. Any widget total that includes open statuses gets a subtle "includes N open ROs (in progress)" caption. Honest numbers, no surprises.

### D10. Original close date rule (Omar 2026-10-29 — APPROVED)
Tekion overwrites `closedTime` on re-close (`firstClosedTime`/`reopenedTime` are always null in payloads). We observe the original close on its own night, so we keep it:
- `RoFact.firstCloseDate` — set on first observation in CLOSED; **never overwritten**.
- `RoFact.closeDate` — Tekion's current value (needed for the Tekion-exact tie-out).
- Reports use `firstCloseDate` for Closed/Activity basis → a re-closed RO stays in its original month (matches Sean's report + the FS month it posted in).
- While an RO is REOPENED (status not CLOSED after having a firstCloseDate) it shows as **Open** (truth today); when re-closed it returns to its original slot.
- Backfill: `firstCloseDate = closeDate`; where `invoicedTime` is >7 days before `closedTime` and in a prior month, `firstCloseDate = invoicedTime::date`, `wasReclosed = true` (Oct 1–28 fleet: ~21 ROs / ~$8.5K).

### D11. Track reopen / re-close events (Omar — APPROVED)
- `RoFact.reopenCount Int`, `lastReopenedAt`, `lastReclosedAt`, `wasReclosed Boolean`.
- New table `RoStatusEvent(id, storeId, roFactId, documentNumber, fromStatus, toStatus, observedAt, closeDateBefore, closeDateAfter, laborSaleBefore/After, partsSaleBefore/After)` written by `persist.ts` on every status change it observes (not just reopen). Gives: who/when/what-$-changed audit, a "Re-closed" chip in the composition strip, and an "RO changes" report later.
- Tie-out: `--date-field current|first`; both must tie (current ↔ Tekion closedTime search; first ↔ Sean's Advisor Performance).

**Open RO visibility rule:** reopened RO → Open chip group while open; returns to original month as Posted when re-closed; the event is visible under "Re-closed".

---

## Phase 1 — Filters + Exports (this week) — 3 parallel lanes

### Lane A — Data layer (backend)
Files: `lib/server/services/reports.ts`, `elr.ts`, `financials.ts` (GL — status N/A, verify untouched), `dashboard.ts`, `app/api/reports/[report]/route.ts`, `prisma/schema.prisma`, `scripts/tieout-dollars.ts`.

A1. Extend `ReportRange`: `basis: "activity"|"closed"|"opened"`, `statuses: string[]` (canonical Tekion statuses + group alias `OPEN`), `payClasses: ("CP"|"W"|"I"|"O")[]`.
A2. Zod in route: `basis` enum +activity; `status` csv (default all non-VOIDED); `pay` csv (default all). Expand `OPEN` alias server-side.
A3. Rewrite `dateWhere` / `opDateWhere`:
   - activity: `OR[{openDate in}, {closeDate in}]` + `status in`
   - closed: `closeDate in` + `status in` (no more hard CLOSED)
   - opened: `openDate in` + `status in`
   Op-level adds `payClass in`.
A4. Every aggregate that sums RoFact totals (laborSale etc.) must switch to RoOpFact sums when a pay filter is active (RoFact pre-sums are all-pay). Audit each service function; list in PR.
A5. New endpoint `GET /api/reports/composition?storeId&start&end&basis` → `{ byStatus: [{status,count,laborSale,partsSale}], byPay: [{payClass,laborSale,partsSale,roCount}] }` for the chip strip (unfiltered by status/pay so chips always show the full picture).
A6. Index: `RoFact @@index([storeId, status, closeDate])`, `@@index([storeId, status, openDate])`. Migration. Verify with `EXPLAIN` on SCT YTD.
A7. `tieout-dollars.ts` gains `--status CLOSED,INVOICED` so we can tie **CLOSED+INVOICED** against Tekion's Advisor Performance (Sean's report) — second proof point beyond the posted-only tie.
A8. Tests: `scripts/_filter_matrix.ts` — for SCT Oct: assert `activity/all` ≥ `closed/all` ≥ `closed/CLOSED` on count and $; assert pay chips sum to total; assert posted-only equals today's numbers to the cent (regression guard: nothing moves for the audited view).

### Lane B — Filter UX (frontend)
Files: `lib/client/report-filters.ts`, `components/reports/ReportFilterBar.tsx`, new `components/reports/CompositionStrip.tsx`, `components/reports/FilterChip.tsx`, `app/(app)/reports/shell.tsx`, each `reports/*/page.tsx` (consume new filters, show open-RO caption).

B1. Filter state: add `basis` 3-way, `statuses`, `payClasses` to URL + `query`; defaults per D1/D6.
B2. Filter bar redesign (one row, left→right): Store · Basis segmented (Activity | Closed | Opened) with one-line explainer · Date range + presets · **Preset chips**: "Everything" (default) / "Posted only – ties to financials" / "Open work (WIP)" / "Invoiced, not posted". Preset = sets basis+status in one click.
B3. `CompositionStrip`: fetches `/composition`; renders status chips grouped (Posted · Invoiced · Open · Voided) then pay chips. Each chip: label, count, $ (compact: `358 · $90.7K`), on/off state with clear affordance (filled = on, outlined = off, muted when $0). Keyboard accessible. Alt-click = solo. "Reset" link when any chip is off. Sticky under the filter bar on scroll so context never leaves the screen.
B4. Report pages: read `f.statuses/payClasses`; add open-RO caption (D9) to total Stats; Advisor table gets a "Status mix" mini-bar per advisor row (posted/invoiced/open) so Sean sees his composition without changing filters.
B5. Mobile: strip collapses to "Filters (3 hidden)" button → bottom sheet with the same chips.
B6. Empty/edge states: no ROs in selection → EmptyState with "Show everything" action.

### Lane C — Exports
Files: new `lib/client/export.ts`, `components/reports/ExportMenu.tsx`, `app/globals.css` (print), each `reports/*/page.tsx` (wire ExportMenu into page header).

C1. `exportXlsx(filename, sheets: {name, rows, columns?}[], filters)` via `xlsx`: Filters sheet first (store, range, basis, statuses, pay types, generated-at PT, URL). Column widths auto, money cells numeric with `#,##0.00`.
C2. `ExportMenu` = one button "Export ▾" → CSV / Excel / PDF; each page registers its tables with the menu via a tiny context (`useExportTables()`), so the menu exports **every table on the page**, not just one.
C3. Print stylesheet: hide sidebar/nav/filter bar/buttons; add print-only header (store wordmark, range, basis, active filters, generated-at); `break-inside: avoid` on cards; DataTable renders all rows when printing (no virtual scroll). PDF option = `window.print()` with a toast "Choose Save as PDF".
C4. Filename convention `AMG_<STORE>_<report>_<start>_<end>_<basis>.xlsx`.

### QA / acceptance (Jay)
- `tsc` clean, `next build` clean, preview deployment URL for Omar + Sean.
- **Regression:** Posted-only preset reproduces current site numbers to the cent for all 7 stores Oct 1–28 (tie-out table in PR).
- **New proof:** Closed basis + CLOSED,INVOICED vs Tekion Advisor Performance (Sean's xlsx, TOL) — store total labor/parts within $100, with a diff table of residuals explained.
- Filter matrix script passes. Excel export opens, Filters sheet present. Print preview renders header + all rows.
- Screenshots of the new bar on desktop + mobile in the PR.

### Rollout
Branch `feat/show-everything` → PR → Omar reviews preview → merge main. Nightly tie-out continues on posted-only; add the CLOSED+INVOICED tie as a second line in the 06:30 run.

---

## Phase 2 — Saved views + configurable dashboard (next 2–3 weeks)

- **Saved views**: table `SavedView(id, userId|orgId, name, scope: personal|shared, params JSON = filters+page, isDefault)`. "Save view" from the filter bar; views dropdown; share link; per-user default lands on login. Role defaults seeded (Advisor / Service Manager / VP Fleet).
- **Dashboard widgets**: widget registry (Stat, Table, Bar, Composition, WIP board); layout JSON per saved view; drag-reorder + show/hide first (dnd-kit), resize second; every widget inherits the active view's filters, with per-widget override (e.g. a "Posted MTD" stat next to an "Everything MTD" stat).
- **WIP board**: dedicated open-RO view (RFI / Hold / In progress / Unassigned) with age in shop, advisor, $ — the thing Sean actually wants to watch during the day. Nightly data is 1 night old for open ROs → evaluate a daytime 2-hour internal sync for open statuses only (cheap: ~200 ROs/store).
- **Scheduled exports**: cron email (via Stacey) of any saved view as Excel/PDF.
- **Column chooser** on DataTable (show/hide/reorder columns, saved with the view).

## Phase 3 — later
Tekion comparison panel (site vs Report Builder export upload → auto diff), per-user alerting on saved views, embedding GL/financial statement into the same view model.

---

## Open questions for Omar
1. D2 default basis = **Activity**? (Alternative: Closed+all statuses — simpler but hides open ROs by definition.)
2. D6 VOIDED hidden by default — OK?
3. Phase 2 saved views: personal only first, or shared org views from day one?
