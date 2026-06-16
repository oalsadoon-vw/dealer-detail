# TICKET T2b — Advisor name resolver (interim browser-backed + production API stub)

## Context
Repair orders from the Tekion API carry the service advisor as a NESTED id only:
`assignee.advisor.id` (e.g. "59", "62", or a UUID). There is NO advisor name in the RO payload.

The production-correct resolution endpoint is `GET /openapi/v4.0.0/users/{id}` but it is
currently 403-blocked because our app install is a pilot version (scope request submitted to
Tekion separately). Until that scope is granted, we resolve names via the INTERNAL Tekion app
endpoint through an already-authenticated browser session running on THIS server (port 9223).

DESIGN PRINCIPLE: the resolver must be PLUGGABLE. The collector calls one function
`resolveAdvisorName(dealerId, advisorId)`. Behind it sit two strategies selected by an env flag:
  - `TEKION_ADVISOR_RESOLVER=api`     -> use GET /openapi/v4.0.0/users/{id} (production, once scoped)
  - `TEKION_ADVISOR_RESOLVER=browser` -> use the internal :9223 browser endpoint (interim, default now)
Plus a persistent DB-backed cache so resolved names are written ONCE and the deployed Vercel app
only ever READS names from the database — it never calls the browser at runtime.

## Reference implementation (COPY THIS LOGIC — it is proven working)
`/home/itadmin/tekion-reports/sct_menu_sales_api.py` functions `user_name(uid)` and
`resolve_advisors_via_browser(pairs)`. The working browser call:

POST http://localhost:9223/eval  body: {"js": "<async IIFE returning a string>"}
The JS fetches, with credentials:'include', these headers built from localStorage:
  Accept: application/json, Content-Type: application/json,
  applicationId: ARC_NA, clientId: web, dealerId: "876" (SCT), locale: en_US,
  original-tenantid: americanmotorscorporation,
  original-userid: localStorage __user_id, productIds: ARC, program: DEFAULT,
  roleId: localStorage currentActiveRoleId, subApplicationId: US,
  tek-siteId: localStorage currentActiveSiteId,
  tekion-api-token: localStorage t_token,
  tenantname: americanmotorscorporation, userId: localStorage __user_id

Primary call (id -> name):
  GET https://app.tekioncloud.com/api/userservice/u/apc/users/{id}
  -> response.data.userNameDetails.firstName + ' ' + lastName   (title-case the result)
  -> on non-200 or empty, return null
VERIFIED LIVE 2026-06-15: id "59" -> "Edgardo Oliver".

The eval endpoint returns JSON shaped {"result": <return value of the IIFE>}.
NOTE: the JS dealerId header is hardcoded "876" for SCT. Make it a parameter derived from the
dealerId/store (for the pilot it is always 876; accept a `tekionShortDealerId` config).

## What to build (in apps/web/lib/sources/tekion/)

### `advisors.ts`
- `export interface AdvisorResolver { resolve(advisorId: string): Promise<string | null>; }`
- `class ApiAdvisorResolver` — calls the TekionClient's user endpoint
  (`GET /users/{id}`); parse the documented response for the name. This will 403 today; that's
  expected — it's the production path for later. Wrap 403 so it returns null gracefully (logs once).
- `class BrowserAdvisorResolver` — POSTs to `http://localhost:9223/eval` with the JS above.
  Config: browserUrl (default http://localhost:9223), tekionShortDealerId (default "876").
  Parse {"result": ...}; title-case; return null on null/empty/"Any Service Advisor".
- `getAdvisorResolver()` factory — reads `TEKION_ADVISOR_RESOLVER` env (default "browser"),
  returns the right instance.
- A thin `resolveAdvisorName(advisorId)` convenience using the factory.
- Treat the placeholder ids that map to "Any Service Advisor" as => return null (caller shows "Unassigned").

### Seed the cache (one-off)
The existing on-disk cache `/home/itadmin/tekion-reports/data/sct-advisor-cache.json` already
holds real SCT names mapped to these ids. Do NOT hardcode names into source. Instead, the
collector (T3) will persist resolved names to the DB; for now `advisors.ts` should ALSO accept an
optional in-memory seed map so the smoke test can demonstrate resolution without a live browser if
the session is down. (Read that JSON only in the smoke test, not in library code.)

### Update `scripts/tekion-smoke.ts`
After it prints the first RO's `assignee.advisor.id`, call `resolveAdvisorName(id)` and print the
resolved name. Expected: id 59 -> "Edgardo Oliver" (when the :9223 session is authed).
If the browser session is down, print a clear "browser session unavailable" note rather than crashing.

### `index.ts` — export the resolver surface.

## Constraints
- Library stays server-only (`import "server-only"` already in client.ts; advisors.ts is server too).
- No advisor names hardcoded in committed source. No secrets hardcoded.
- The browser dependency must be isolated in BrowserAdvisorResolver ONLY, so swapping to
  ApiAdvisorResolver later is a one-env-var change with zero collector changes.
- Do not touch the DB, routes, or dashboard in this ticket.

## Acceptance criteria
1. `npx tsc --noEmit` clean for new/changed files.
2. `npm run tekion:smoke` prints a real advisor name for id 59 ("Edgardo Oliver") via the browser
   resolver (the :9223 session is currently authed). If it prints "(unresolved)" investigate the
   eval call until it returns the name.
3. Report the smoke output and confirm the resolver is pluggable (api vs browser via env).
