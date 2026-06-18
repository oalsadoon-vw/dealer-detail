# T7 — Switch advisor resolution to the public OpenAPI /users/{id} (browser path retired)

## Why
Joe upgraded the Tekion app's API scope (2026-06-18). The public OpenAPI
`GET /openapi/v4.0.0/users/{id}` now RESOLVES service-advisor names server-to-server
(previously 403 — gotcha #4). This retires the browser-session resolver, which was the
ONLY thing preventing the collector from running on Vercel serverless. After this fix the
whole pipeline is deployable without the localhost:9223 browser.

## Ground truth (verified live 2026-06-18, dealer st = americanmotorscorporation_876_0)
`GET /openapi/v4.0.0/users/74` →
```json
{ "data": {
    "userRoleDetails": { "primaryRole": { "persona": "SERVICE_ADVISOR", "roleName": "..." } },
    "userNameDetails": {
      "firstName": "Brian", "lastName": "Keat",
      "completeNames": [ { "nameType": "DISPLAY_NAME", "value": "Brian Keat" } ]
    },
    "employeeDetails": { "employeeDisplayNumber": "4272", "employeeId": "876_4272" },
    "active": true, "id": "74", "email": "bkeat@sctoyota.com"
} , "meta": { ... } }
```
Unknown / unresolvable id → **HTTP 400** with body `{"code":"no.user.found", ...}` (NOT 404).

## Bugs being fixed (lib/sources/tekion/client.ts)
1. **Wrong endpoint**: `USER_PATH_PREFIX = "/userservice/u/apc/users"` is the INTERNAL browser
   endpoint and fails server-to-server. Change to the public OpenAPI path:
   `${OPENAPI_PREFIX}/users` → i.e. `/openapi/v4.0.0/users/{id}`.
2. **Wrong response parser**: `extractUserDisplayName` reads `data.firstName/lastName/displayName`
   at the top of `data`, but the real name lives at
   `data.userNameDetails.completeNames[nameType==="DISPLAY_NAME"].value`
   (fallback `data.userNameDetails.firstName + " " + lastName`). Current code returns null for
   every advisor. Add these as the FIRST, most-specific candidates; keep the existing fallbacks.
3. **400-not-found handling**: `resolveUserDetailed` only swallows HTTP 404. Tekion returns
   **400 `no.user.found`** for a missing user. Treat a 400 whose body code/id === `no.user.found`
   as "unresolved → cache null, return null" (do NOT throw). Other 400s still throw.

## Acceptance criteria
- `extractUserDisplayName` returns `{name:"Brian Keat", sourceField:"data.userNameDetails.completeNames[DISPLAY_NAME]"}`
  for the verified payload above, and `{name:"Jon Vu", ...}` for user 61.
- A unit test covers: completeNames DISPLAY_NAME, firstName+lastName fallback (no completeNames),
  and the unchanged legacy fallbacks.
- `resolveUserDetailed` returns `{name:null}` (no throw) when the API returns 400 `no.user.found`.
- Live: with `TEKION_ADVISOR_RESOLVER=api`, `resolveAdvisorName("74", {dealerId: st})` === "Brian Keat"
  WITHOUT any browser session running.
- Default resolver kind flips to `api` (env default in advisors.ts: `?? "api"`), and `.env` sets
  `TEKION_ADVISOR_RESOLVER=api`. Browser resolver code stays in the file as a fallback but is no
  longer the default.
- typecheck clean; SCVW (email) path untouched.

## Files
- `apps/web/lib/sources/tekion/client.ts` (path const, extractUserDisplayName, 400 handling)
- `apps/web/lib/sources/tekion/advisors.ts` (default kind api)
- `apps/web/.env` (TEKION_ADVISOR_RESOLVER=api)
- test file for extractUserDisplayName
