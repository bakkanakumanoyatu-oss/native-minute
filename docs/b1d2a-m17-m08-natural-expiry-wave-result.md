# B1D2A M17/M08 natural-expiry wave result

Mode: `B1D2A_M17_AND_M08_NATURAL_EXPIRY_WAVE_V1`

Status: **COMPLETED WITH PENDING CONDITIONS — M17 NATURAL TRIGGER / M08 RATE LIMIT**

Date: 2026-08-12

Start HEAD: `e01c11ab67c21fe5cd776344ce73c1e207f837c6`

## Scope and safety boundary

This wave covered only M17 transient refresh recovery readiness and M08 natural provider-link expiry preparation. M22 was not started. No source, test, mobile profile, Supabase setting, Vercel setting/deployment, Apple setting, production, database, migration, token TTL, device clock, Keychain value, or auth/security architecture was changed.

No access token, refresh token, cookie, Magic Link, callback query, email address, user identifier, Keychain value, or device identifier was displayed or recorded.

## Preflight

| Check | Result |
|---|---|
| workspace / branch / HEAD / remote / clean tree | PASS |
| `npm run check:workspace` | PASS |
| runtime branch | exact `8bdbaac7e776e84a0e495ee410eba5cb3c460bb4` |
| fixed staging deployment | exact `dpl_C2evjjuZi35mHMp1sNdaejXJPdui`, Ready |
| callback / recovery | 303 to query-free recovery / 200 |
| AASA | 200; exact staging application identifier and callback path |
| production isolation | exact `dpl_7FzKMVfgKdYjGWqPpJoFrpbFgruG`, Ready and unchanged |

## M17 — current session and safe-trigger reconciliation

The current signed Staging session immediately before this wave was authenticated on iPhone 14 Plus / iOS 26.2.1. The contemporaneous Human observation was native `/SCRIPTS`, an owned script, normal Bearer BFF, and no abnormal UI after M05. This is `ACTUAL_DEVICE + HUMAN_REPORTED_CURRENT_STATE`; it is not repo-generated evidence.

The current exact access-token expiry timestamp was not exposed by a safe app UI and was not read from raw session or Keychain material. Its value is therefore `UNKNOWN_NOT_EXPOSED`. Corroborating repo implementation requires every persisted session envelope to contain a valid integer `expiresAt` and a refresh-capable SDK session. It runs with `autoRefreshToken=false`, checks the stored expiry on foreground activation, starts refresh only within 60 seconds of expiry, and also performs one refresh plus at most one BFF retry for an explicit `session_expired` response.

Retryable refresh failure preserves the authenticated state and Keychain candidate; invalid refresh clears the session. Concurrent refresh calls are single-flight. The unchanged focused suite reexecution passed `apps/mobile/src/auth/mobile-auth.test.ts` and `apps/mobile/src/App.test.tsx`: 2 files / 47 tests. This is `CORROBORATING_REPO_EVIDENCE`, not an actual transient outage/recovery result.

The fresh current session had not naturally reached the expiry-minus-60-seconds or BFF `session_expired` condition. There is no production UI that safely forces refresh before those conditions. The wave did not modify TTL, clock, token, Keychain, source, provider configuration, or network to manufacture the trigger. No controlled offline refresh sequence was performed.

M17: `PENDING_NATURAL_REFRESH_TRIGGER`.

The one missing item is: **the authenticated production-like session must naturally reach an existing refresh-required condition**.

After this M17 disposition was fixed, the Human performed one normal mobile logout and observed `/LOGIN`. This logout was preparation for M08 and is not M17 refresh evidence.

## M08 — expiry policy and Link E issuance

Codex opened the existing authenticated Supabase Dashboard session read-only, selected project `native-minute-staging`, and inspected the Email provider modal. `Email OTP expiration` was `3600` seconds. Save remained disabled, the modal was closed without changes, and no TTL/rate-limit/auth setting was modified. This configuration observation is `LIVE_STAGING_CONFIGURATION_READ_ONLY`; it does not itself prove expired-link behavior.

From the signed Staging app's `/LOGIN`, the Human attempted the single approved fresh Link E request using the existing staging test account. The UI returned the normal rate-limit state. Link E issuance was not confirmed and is not treated as issued. No received link was opened, forwarded, pasted, retapped, or recorded. No retry or rate-limit change was performed.

Because no Link E issuance was confirmed, the unconsumed natural-expiry window did not start in this wave. No expired-link tap or M08 actual proof was performed.

M08: `PENDING_RATE_LIMIT`.

## Defects, remaining scope, and next action

- M17 defect: none demonstrated; the natural refresh trigger is absent at this observation time.
- M08 defect: none demonstrated; provider/app rate limiting behaved as a safe control.
- M17 actual transient refresh recovery: not performed and not claimed.
- M08 actual expired provider-link rejection: not performed and not claimed.
- M22: not started.

B1D2A remains `OPEN` with three cases: M08, M17, and M22. Updated engineering effort is approximately 0.5–1.0 person-day excluding natural external wait windows and review iteration.

The next single action candidate is a separately authorized M22 controlled AASA outage proof while the M08 rate limit clears naturally. Do not automatically start M22, resend a Magic Link, tap any link, modify source/configuration, start B1D2B, or start Gate 2.
