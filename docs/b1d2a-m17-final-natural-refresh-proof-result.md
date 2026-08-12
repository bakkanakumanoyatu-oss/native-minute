# B1D2A M17 final natural-refresh proof result

Mode: `B1D2A_M17_FINAL_NATURAL_REFRESH_PROOF_V1`

Status: `READY_PENDING_NATURAL_REFRESH_WINDOW`

## Scope and provenance

This checkpoint covers only M17 transient refresh recovery. It does not claim the outage/recovery PASS yet and does not start B1D2B, Gate 2, or template work.

Evidence provenance is separated as follows:

- actual-device baseline: Human-reported current iPhone 14 Plus / iOS 26.2.1 observations
- repo contract: Codex-read current source and focused tests
- live/config evidence: Codex-observed endpoints, signed artifact target, production deployment identity, and read-only Supabase Dashboard session settings

No email address, Magic Link URL, token, Keychain content, Project URL, publishable key, or other secret is recorded.

## Preflight

- branch and local/remote HEAD matched `1d74a36c106a0d34c789ab6bc30fe0a4c1bd3ff4`
- working tree was clean and `npm run check:workspace` passed
- normal `com.nativeminutes.app.staging` development artifact was installed on the connected iPhone 14 Plus
- generated artifact inspection matched the exact `native-minute-staging` Supabase project, rejected other projects, reported `authConfigured=true`, and found no service-role/secret key
- fixed staging AASA `200`, Apple CDN AASA `200`, callback `303`, recovery `200`, and production root `200`
- production deployment remained `dpl_7FzKMVfgKdYjGWqPpJoFrpbFgruG`
- M22 temporary branch, Preview worktree, artifact, and config were absent
- the Human observer confirmed `/LOGIN`

## Current M17 contract

Current source uses `autoRefreshToken=false` and owns rotation explicitly:

1. `refreshIfNeeded()` starts refresh when persisted `expiresAt <= now + 60 seconds`.
2. The native `appStateChange` listener calls `refreshIfNeeded()` whenever the app becomes active.
3. A scripts request that receives exactly `401 session_expired` performs one refresh and at most one Bearer retry.
4. Retryable refresh failures — no status, `0`, `429`, or `5xx` — return `auth_refresh_failed`, transition back to `authenticated`, and retain the Keychain session candidate.
5. Non-retryable invalid refresh clears the stored session and returns auth-required; that is M18 behavior, not the expected M17 path.
6. After transient recovery, a later foreground activation calls `refreshIfNeeded()` again; the scripts UI also exposes one existing `再試行` action for failed scripts loading.
7. `refreshOperation` single-flights concurrent callers, and the BFF path retries at most once.

No new semantics, debug action, or hook was introduced.

## Fresh authenticated baseline

- one fresh Mobile Link F was issued successfully; safe issuance observation `2026-08-12T19:01:59+09:00`
- the Human confirmed receipt and tapped it exactly once
- successful authenticated baseline observation: `2026-08-12T19:03:38+09:00`
- Native app `/SCRIPTS`, one owned script, Bearer BFF normal, no error, and no crash
- the Human returned to the iPhone Home Screen without force-quitting the app; safe background-state observation `2026-08-12T19:10:53+09:00`

## Natural refresh window

The current read-only Supabase setting is access-token expiry `3600` seconds. No save or setting change was performed. A safe direct `expiresAt` was not exposed by the app UI, and the current Auth Logs page did not provide a correlated session-expiry field. Reading or decoding the raw token and dumping Keychain content were intentionally not used.

Therefore the approved fallback is used: current `3600`-second access-token lifetime plus the observed login-success time. Because session issuance occurred no later than the login-success observation and source refreshes 60 seconds before expiry:

- conservative latest refresh-window entry: no later than `2026-08-12T20:02:38+09:00`
- safe resume time with margin: `2026-08-12T20:05:00+09:00`

The direct exact `expiresAt` remains `UNKNOWN`; the margin avoids pretending that the observation timestamp is the provider's exact issue timestamp.

## Pending sequence

At or after `20:05 JST`, while the same app session remains backgrounded:

1. put the iPhone fully offline before foregrounding the app
2. open the existing Native Minute Staging app once, causing the existing foreground refresh check
3. confirm `/LOGIN` is not forced, no crash occurs, and a retryable state remains
4. restore network
5. foreground/retry once through the existing path
6. confirm `/SCRIPTS`, the owned script, Bearer BFF, authenticated state, and no duplicate refresh storm

Until then, do not open or terminate the app, change network, change clock/TTL/config, send another Magic Link, or modify token/Keychain/source/tests.

## Final disposition

M17 remains the only B1D2A case-level item:

`READY_PENDING_NATURAL_REFRESH_WINDOW`

This is a material pending checkpoint, not a failure and not a PASS. The next single action is to resume at or after `20:05 JST` and first put the iPhone fully offline while Native Minute Staging remains backgrounded.
