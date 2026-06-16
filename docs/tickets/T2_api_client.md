# TICKET T2 — Tekion OpenAPI client (server-only library)

## Context
DealerDetail app, `apps/web`. We're adding an API-driven data path that pulls service
repair-order data from the Tekion OpenAPI. This ticket builds ONLY the client library — the
typed, throttle-safe wrapper around the Tekion API. NO database writes, NO routes, NO UI in
this ticket (those are T3+). This module will be imported by the collector in T3.

## Tekion API facts (these are VERIFIED against the live production API — trust them)
- Base URL: `https://api.tekioncloud.com/openapi/v4.0.0` (env `TEKION_BASE_URL` = `https://api.tekioncloud.com`)
- Auth: app_id + secret_key -> bearer token. Env: `TEKION_APP_ID`, `TEKION_SECRET_KEY`.
- Token endpoint pattern: the existing Python client at `/home/itadmin/tekion-api/tekion_client.py`
  shows how the token is obtained. READ THAT FILE FIRST and replicate its token-fetch logic in TS
  (same URL, same request body/headers, same response field for the token). Do not guess.
- EVERY API call needs these headers: `Authorization: Bearer <token>`, `app_id: <appId>`,
  `dealer_id: <dealerId>`, `Content-Type: application/json`.
- Stevens Creek Toyota dealer_id = `americanmotorscorporation_876_0`.

### Endpoints this client must wrap
1. `POST /repair-orders:search` — body:
   ```json
   {"filters":[{"field":"creationTime","operator":"GTE","values":["<epochMsString>"]}],"pageSize":50}
   ```
   - Allowed filter fields: opcode, make, status, vin, documentNumber, documentId,
     creationTime, invoicedTime, closedTime, modifiedTime, paytype.
   - Allowed operators: GT, GTE, LT, LTE, IN, NIN, BTW, BOOL. (NOT "BETWEEN".) BTW takes exactly 2 values.
   - Epoch-ms values are STRINGS.
   - pageSize max 50. Paginate via `paginationToken` in the request body, reading the next token
     from `meta.nextPageToken` in the response. Stop when nextPageToken is absent/empty.
   - Response shape: `data.results` (array of ROs), `meta.totalCount`, `meta.nextPageToken`.
2. `GET /repair-orders/{rid}/jobs` -> `data.jobs[]`
3. `GET /repair-orders/{rid}/jobs/{jid}/operations` -> `data.roOperations[]`
   (fields incl. opcode, opcodeDescription, labor.saleAmount, labor.costAmount — all CENTS)
4. `GET /repair-orders/{rid}/jobs/{jid}/operations/{oid}/parts` -> `data.parts[]`
   (partNumber, quantities[], costAmount, saleAmount — saleAmount is EXTENDED line total in CENTS)
5. `GET /repair-orders/{rid}/ro-vehicle` -> vin, ymm, mileage
6. `GET /userservice/u/apc/users/{id}` -> resolves a Tekion user id to a name (for advisors)
   NOTE: this path is NOT under /openapi/v4.0.0 — it's at `<TEKION_BASE_URL>/userservice/u/apc/users/{id}`.
   Verify the exact response field that holds the display name by calling it once during a smoke
   test; cache id->name.

### Data shape gotchas (bake into types/comments)
- All money is integer CENTS. 8999 = $89.99.
- Advisor on an RO is NESTED: `assignee.advisor.id` (NOT `assignee.id`).
- RO `tags` array carries SYSTEM tags incl. `{field:"OPCODE",value:...}` and
  `{field:"PAY_TYPE",value:...}` — useful for prefiltering before fan-out.

## What to build

Create directory `apps/web/lib/sources/tekion/` with:

### `client.ts` — the core client (server-only)
- Add `import "server-only";` at the top (this module must never reach the browser).
- A `TekionClient` class or factory configured from env (TEKION_BASE_URL, TEKION_APP_ID,
  TEKION_SECRET_KEY). Throw a clear error if any env var is missing.
- Token caching: fetch the bearer token once, cache it in-memory with its expiry, refetch when
  near expiry. (Inspect the Python client / token response for the expiry field; if none, cache
  for a conservative default like 50 minutes.)
- A private `request()` that injects the 4 required headers, takes a dealerId param, does JSON,
  and on non-2xx throws a typed `TekionApiError` carrying status + body. On HTTP 429, throw a
  `TekionRateLimitError` (subclass) so callers can back off.
- Public methods (all take `dealerId` as a param):
  - `searchRepairOrders({ dealerId, filters, pageSize })` -> async generator OR a method that
    returns one page + nextPageToken. Provide a helper `iterateRepairOrders(...)` async generator
    that transparently paginates through ALL pages.
  - `getJobs(dealerId, roId)`, `getOperations(dealerId, roId, jobId)`,
    `getParts(dealerId, roId, jobId, opId)`, `getRoVehicle(dealerId, roId)`.
  - `resolveUser(dealerId, userId)` with an in-memory id->name cache (Map), returns name string
    or null.

### `throttle.ts` — token-bucket rate limiter
- Implement a token-bucket limiter sized for the Tekion Basic plan: 1500 calls / 15 min.
  Use a SAFE cap of 1400 / 15 min. Expose `await limiter.acquire()` that resolves when a token
  is available (delays if the bucket is empty). Refill continuously based on elapsed time.
- The client's `request()` must `await limiter.acquire()` before every HTTP call.
- Also implement exponential backoff with jitter on TekionRateLimitError (429): on 429, wait and
  retry up to N times (e.g. 4) before giving up.

### `types.ts` — TypeScript types
- Types for RepairOrder (the fields we read: documentId, documentNumber, status, creationTime,
  closedTime, modifiedTime, assignee.advisor.id, vehicle/vin, tags), Job, Operation
  (opcode, opcodeDescription, labor {saleAmount, costAmount}), Part (partNumber, quantities,
  saleAmount, costAmount), and a parsed RepairOrderSnapshot that nests jobs->operations->parts.
- A `centsToDollars(n)` helper and a `laborGross`/`partsGross` (sale - cost) helper, all in cents-aware math.

### `money.ts` — money helpers (pure, unit-testable)
- `centsToDollars(cents: number): number`
- `grossCents(saleAmount, costAmount): number` (sale - cost; null-safe -> 0)
- Part line total: use the line `saleAmount` directly (already extended) — provide
  `partLineSaleCents(part)` that returns `part.saleAmount` and does NOT multiply by qty.

### `index.ts` — barrel export of the public surface.

## Smoke test (REQUIRED before you finish)
Write a standalone script `apps/web/scripts/tekion-smoke.ts` that:
1. Loads env from `.env` (the values are already there: TEKION_BASE_URL, TEKION_APP_ID, TEKION_SECRET_KEY).
   The TEKION_* vars ARE present in apps/web/.env.
2. Instantiates the client, calls `searchRepairOrders` for dealer `americanmotorscorporation_876_0`
   with a creationTime GTE filter for the last 3 days, pageSize 5.
3. Prints: totalCount, number returned, the first RO's documentNumber + status + assignee.advisor.id.
4. For that first RO, fetches jobs -> operations for the first job, and prints the first
   operation's opcode + labor.saleAmount + labor.costAmount + computed grossCents.
5. Resolves the advisor id via resolveUser and prints the resolved name (and which response field it came from).
Run it with: `set -a && . ./.env && set +a && npx tsx scripts/tekion-smoke.ts`
(Install tsx as a devDependency if not present.)

## Constraints
- This is a LIBRARY ONLY. Do not write to the database, do not add Next.js routes, do not touch
  the dashboard or any existing files except package.json (for tsx) if needed.
- Server-only: `import "server-only"` in client.ts.
- No secrets hardcoded — everything from env.
- TypeScript strict-friendly; no `any` in the public API (internal parsing may use unknown+narrowing).

## Acceptance criteria
1. `npx tsc --noEmit` passes for the new files (run the project's typecheck).
2. The smoke test runs and prints REAL data: totalCount > 0 for the last 3 days at SCT, a real
   documentNumber, a real opcode + labor amounts, and a resolved advisor name.
3. Report the smoke-test output, the files created, and confirm which response field holds the
   advisor display name (so T3 can rely on it).
