# B1D2A M24/M25 combined actual proof result

Mode: `B1D2A_M24_M25_COMBINED_ACTUAL_PROOF_V1`

Status: **STOPPED — WEB USER A `/scripts` SERVER-SIDE EXCEPTION; M24/M25 OPEN**

Date: 2026-08-11

Start HEAD: `64297bd6e4c13d4efb5abad075d41acb1fd96fd6`

## Scope and safety boundary

This wave was limited to normal staging Web cookie auth and Mobile Bearer auth for M24/M25. No source, test, Supabase configuration, Vercel, env, DB, migration, service role, SQL Editor, admin client, artificial fixture, production, or other B1D2A case was changed or exercised.

Accounts are recorded only as User A and User B. Email address, Magic Link, token, code, state, nonce, transaction, cookie, session, resource ID, and script content/title are not recorded.

## Preflight

| Check | Result |
|---|---|
| workspace / branch / HEAD / remote / clean tree | PASS |
| `npm run check:workspace` | PASS |
| runtime branch | exact `8bdbaac7e776e84a0e495ee410eba5cb3c460bb4` |
| fixed staging deployment | exact `dpl_C2evjjuZi35mHMp1sNdaejXJPdui`, Ready |
| staging callback / recovery / AASA | 303 / 200 / 200; callback body empty and no cookie; AASA exact staging app/path |
| Supabase staging Redirect URLs | exact Web callback present; expected four-entry set confirmed read-only |
| production isolation | `native-minute` remained on `dpl_7FzKMVfgKdYjGWqPpJoFrpbFgruG` |

## Phase 1 — Web User A cookie session

User A used the normal staging Web login UI to request one fresh Web Magic Link. The newest link was opened once. It did not fall back to localhost and did not display `callback_failed`. The final secret-free URL was `https://native-minute-staging.vercel.app/scripts` with no query parameters.

Instead of rendering `/scripts`, the live page displayed a server-side exception with safe digest `182509400`. Because `/scripts` did not render and refresh persistence was not tested, the following must not be inferred:

- Web cookie session established
- callback exchange completed successfully
- refresh persistence
- `WEB_USER_A_COOKIE_SESSION_ESTABLISHED`

Evidence provenance: `LIVE_STAGING_WEB` + contemporaneous Human-provided screenshot + Codex read-only safe-path observation. Browser: Safari on the user's Mac. Exact macOS/Safari versions are `UNKNOWN`.

## Stopped phases

The approved failure policy required an immediate STOP. The link was not reopened or refreshed, and no replacement link was requested.

| Phase | Result |
|---|---|
| User A owned resource creation | NOT STARTED |
| Mobile User A baseline | NOT STARTED |
| M25 Web cookie / Mobile Bearer coexistence | NOT STARTED |
| Mobile User A logout isolation | NOT STARTED |
| Mobile User B login | NOT STARTED |
| M24 User A/B isolation | NOT STARTED |

No iPhone or Mobile app operation occurred in this wave, so no new actual-device/device-OS evidence was generated. User B was not used.

## Case disposition

- M24: `OPEN_BLOCKED_WEB_USER_A_SCRIPTS_SERVER_EXCEPTION`
- M25: `OPEN_BLOCKED_WEB_USER_A_SCRIPTS_SERVER_EXCEPTION`

Neither case is PASS. The remaining B1D2A case count stays seven: M04, M05, M08, M17, M22, M24, and M25.

## Defect and next action

Blocking defect: `WEB_USER_A_SCRIPTS_SERVER_EXCEPTION_AFTER_CALLBACK_REDIRECT`.

The root cause is `UNKNOWN`; this wave did not inspect provider/session values or server logs and did not change architecture or configuration. The next single action is a separately authorized, read-only `WEB_USER_A_SCRIPTS_SERVER_EXCEPTION_DIAGNOSTIC` that correlates safe digest `182509400` with staging runtime logs, determines whether callback exchange/cookie creation completed, and identifies the failing `/scripts` server operation without exposing auth values. Do not resend a Magic Link or resume M24/M25 until that diagnostic is reviewed.
