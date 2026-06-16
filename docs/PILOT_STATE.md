# DealerDetail API Pilot — Project State

**Goal:** Stand up ONE Toyota store (Stevens Creek Toyota / `st`) on a NEW Tekion API-driven
data pipeline, running ALONGSIDE the existing SCVW email/Excel workflow, to compare the two methods.

## Decisions locked
- **Control store:** SCVW (`sv`) — stays on email/Excel workflow, untouched.
- **Pilot store:** Stevens Creek Toyota (`st`, Tekion dealer_id `americanmotorscorporation_876_0`)
  — same rooftop family as SCVW for cleanest comparison.
- **Approach:** ADDITIVE. New API tables alongside old email tables in the SAME Supabase project.
  Do NOT delete the prototype until the API path is proven and reconciled.

## Infrastructure status (2026-06-15)
- ✅ **Supabase project EXISTS:** `ijvfvhqnzjiknhqmmtdh` (aws-1-us-west-1).
  Creds in `~/dealer-detail/apps/web/.env`. All 5 connection values + service_role key present.
- ✅ **Prototype schema fully deployed** — all 11 Prisma migrations applied, DB schema up to date.
- ✅ **Tekion production API VERIFIED LIVE** — `POST /repair-orders:search` for `st` returned
  421 ROs (2-day window). Full RO structure confirmed: documentNumber, assignee.advisor.id (e.g. "59"),
  OPCODE tags (TPFM, SAFECAT), PAY_TYPE, jobs[], status.
- ✅ **Anthropic key** at `~/.hermes/.env` (ANTHROPIC_API_KEY) — Claude Code can be activated.
- ✅ Tekion creds: app_id `4ec8bf78-9322-4c25-ae1e-34f73d6eeb50`, prod, in `~/tekion-api/config.json` + `.env`.
- ✅ npm deps installed in `apps/web`. node v22, prisma 6.19.

## Build plan (single-store API pilot)
1. Add new Prisma models (additive migration): SyncRun, RawRepairOrder, OpcodeCategory.
   Extend Store (tekionDealerId), Advisor (tekionUserId). Reuse AdvisorDailyMetrics/Commodity (SET not increment for API).
2. Tekion API client (server-only TS): token, paginated repair-orders:search, jobs/operations/parts fan-out, advisor id→name cache, token-bucket throttle.
3. Aggregator: RawRepairOrder payload → AdvisorDailyMetrics (menu/ALA/rec via opcode map, gross=sale−cost cents).
4. Seed ST store row + its Tekion dealer_id; manual sync endpoint.
5. Dashboard: show ST (API) next to SCVW (email) for comparison.
6. Verify ST API metrics vs known store volume.

## Key API facts (verified)
- Amounts integer cents. Gross = saleAmount − costAmount. Parts saleAmount = extended (no ×qty).
- Advisor nested: assignee.advisor.id → resolve via GET /userservice/u/apc/users/{id} (cache).
- Tags carry OPCODE + PAY_TYPE (SYSTEM tags) → prefilter before fan-out.
- Throttle 1500/15min. Use modifiedTime cursor for incremental.
