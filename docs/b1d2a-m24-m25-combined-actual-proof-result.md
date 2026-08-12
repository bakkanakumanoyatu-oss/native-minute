# B1D2A M24/M25 combined actual proof result

Mode: `B1D2A_M24_M25_COMBINED_ACTUAL_PROOF_V1`

Resume authorization: `HDC_B1D2A_WEB_USER_A_EXISTING_COOKIE_SINGLE_RELOAD_AND_RESUME_M24_M25_V1`

Status: **COMPLETED — M24/M25 PASS**

Execution dates: 2026-08-11 through 2026-08-12

Initial wave HEAD: `64297bd6e4c13d4efb5abad075d41acb1fd96fd6`

Resume checkpoint HEAD: `4ee26840d7662250d241793ebfe9f9bb745dea29`

## Scope and safety boundary

This wave was limited to normal staging Web cookie auth and Mobile Bearer auth for M24/M25. No source, test, Supabase configuration, Vercel, env, DB, migration, service role, SQL Editor, admin client, artificial fixture, production, or other B1D2A case was changed or exercised during the resumed proof.

Accounts are recorded only as User A and User B. Email address, Magic Link, token, code, state, nonce, transaction, cookie, session value, resource ID, and script content/title are not recorded.

## Preflight and environment

| Check | Result |
|---|---|
| workspace / branch / HEAD / remote / clean tree | PASS |
| `npm run check:workspace` | PASS |
| runtime branch | exact `8bdbaac7e776e84a0e495ee410eba5cb3c460bb4` |
| fixed staging deployment | exact `dpl_C2evjjuZi35mHMp1sNdaejXJPdui`, Ready |
| staging callback / recovery / AASA | 303 / 200 / 200; callback body empty and no cookie; AASA exact staging app/path |
| Supabase staging Redirect URLs | exact Web callback present; expected four-entry set confirmed read-only |
| production isolation | `native-minute` remained on `dpl_7FzKMVfgKdYjGWqPpJoFrpbFgruG` |
| Web client | Safari on the user's Mac; exact macOS/Safari versions `UNKNOWN` |
| Mobile client | same physical staging device used in the continuing wave; Human-provided device context: iPhone 14 Plus / iOS 26.2.1 |

## Initial Web exception and authorized recovery

User A used the normal staging Web login UI to request one fresh Web Magic Link and opened the newest link once. It reached query-free `https://native-minute-staging.vercel.app/scripts`, but initially rendered a server-side exception with safe digest `182509400`. The initial wave stopped without inferring cookie establishment.

The separately authorized read-only runtime diagnostic correlated the digest to `JWT issued at future`. Safe evidence established that callback exchange succeeded, the cookie session was effectively persisted, and `/scripts` auth resolution passed; the failure occurred before the authenticated PostgREST `takes` query completed. No raw JWT, token, cookie, email, or provider payload was recorded.

Under the resume authorization, the existing User A cookie session reloaded `/scripts` exactly once. The page rendered normally, did not redirect to login, retained authenticated User A state, and had no server-side exception. No second reload and no replacement Web Magic Link were used.

Result: `WEB_USER_A_EXISTING_COOKIE_RELOAD_PASS` and `WEB_USER_A_COOKIE_SESSION_ESTABLISHED`.

Evidence provenance: `LIVE_STAGING_WEB` + `LIVE_STAGING_RUNTIME_SAFE_LOG` + contemporaneous Human-provided screenshot/context + Codex read-only browser observation. The initial clock-skew exception remains recorded as a transient runtime incident; it was not reproduced after the authorized single reload and is not treated as a persistent blocker.

## User A owned resource creation

Using only the normal authenticated Web UI at `/scripts/new`, User A created one test script through the existing application flow. Web redirected through the normal created-resource path and `/scripts` displayed one owned resource. Safe runtime evidence showed the normal create request succeeded and a later `/scripts` request returned successfully.

Result: `USER_A_OWNED_SCRIPT_CREATED_NORMAL_WEB_FLOW`.

Evidence provenance: `LIVE_STAGING_WEB` + `LIVE_STAGING_RUNTIME_SAFE_LOG` + Codex browser observation. No service role, SQL Editor, admin API/client, direct DB insert, RLS bypass, artificial fixture, or production data was used.

## Mobile User A baseline

Mobile User A authenticated using one fresh Mobile Magic Link. `/SCRIPTS` rendered, the User A-owned resource was visible, and the Bearer BFF connection was normal.

Result: `USER_A_CAN_ACCESS_OWN_RESOURCE`.

Evidence provenance: `ACTUAL_DEVICE_MOBILE` + contemporaneous Human-reported observation. This is actual staging behavior, not repo-generated device evidence.

## M25 — Web cookie / Mobile Bearer coexistence

The following were simultaneously true:

- Web User A remained authenticated by cookie and displayed the owned resource after normal navigation back to `/scripts`.
- Mobile User A remained authenticated by Bearer/Keychain, displayed the same owned resource, and reported normal BFF operation after a normal reconnect action.
- Neither side invalidated the other session.

After Mobile-only logout, Mobile showed `/LOGIN`. Web User A was intentionally not logged out. A fresh Web navigation to `/scripts` still rendered authenticated User A state and the owned resource, confirming that Mobile logout did not destroy the Web cookie session.

M25: `PASS_LIVE_WEB_COOKIE_MOBILE_BEARER_COEXISTENCE`.

Evidence provenance: `LIVE_STAGING_WEB` + `ACTUAL_DEVICE_MOBILE` + Codex browser observation + contemporaneous Human-reported device observations.

## M24 — User A/B isolation

After Mobile User A logout, User B used one fresh Mobile Magic Link and reached authenticated `/SCRIPTS` with normal Bearer BFF operation. User A's existing owned resource did not appear for User B. The result is not an auth-error/empty-response false positive because User B's authenticated response and BFF health were both normal, while the same resource had already been proven present and visible to User A.

Corroborating repo evidence remains unchanged: the Mobile route validates the Bearer user and passes that verified user ID to `listScripts`; the service filters `scripts.user_id`; and the `scripts_crud_own` RLS policy binds rows to `auth.uid()`.

M24: `PASS_ACTUAL_STAGING_USER_AB_ISOLATION`.

Evidence provenance: `ACTUAL_DEVICE_MOBILE` + contemporaneous Human-reported observation + `CORROBORATING_REPO_IMPLEMENTATION_EVIDENCE`. The actual User A/B observation is not described as repo-generated evidence.

## Defects and disposition

- Historical transient incident: safe digest `182509400`, `JWT issued at future` during the first User A `/scripts` render.
- Persistent blocker: none observed after the one authorized reload.
- Security/isolation defect: none observed.
- Unexpected logout or cross-session invalidation: none observed.
- M24: `PASS_ACTUAL_STAGING_USER_AB_ISOLATION`.
- M25: `PASS_LIVE_WEB_COOKIE_MOBILE_BEARER_COEXISTENCE`.

B1D2A remains `OPEN` with five cases: M04, M05, M08, M17, and M22. M24/M25 completion does not start or imply completion of any other case, B1D2B, or Gate 2.

## Next single action

Stop after committing this evidence. The next separately authorized action is the M04/M05 exact actual-device fallback sequence. Do not automatically issue another Magic Link, operate the device, start M08/M17/M22, change source/configuration, start B1D2B, or start Gate 2.
