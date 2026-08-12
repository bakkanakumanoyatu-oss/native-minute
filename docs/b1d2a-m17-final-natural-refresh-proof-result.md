# B1D2A M17 final natural-refresh proof result

Mode: `B1D2A_M17_FINAL_NATURAL_REFRESH_PROOF_V1`

Status: `PASS_ACTUAL_DEVICE_TRANSIENT_REFRESH_RECOVERY`

## Scope and provenance

This closeout covers only M17 transient refresh recovery. It does not start the B1D2A final closeout audit, B1D2B, Gate 2, or template work.

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

## Actual controlled-network sequence

The Human resumed after the conservative natural-refresh window and performed the approved sequence without changing TTL, clock, token, Keychain, source, tests, or provider configuration:

1. At `2026-08-12T20:08:54+09:00`, the safe time check was beyond the `20:05` margin.
2. While the app remained backgrounded, Airplane Mode was enabled and Wi-Fi was disabled before foregrounding.
3. The existing app icon was tapped once. After more than 15 seconds, the app remained on `/SCRIPTS`, retained the logout action, showed scripts loading and explicit offline state, did not force `/LOGIN`, and did not crash. Safe observation record: `2026-08-12T20:12:03+09:00`.
4. No in-app `再試行` or `再接続` action was pressed.
5. Airplane Mode was disabled and Wi-Fi enabled while Control Center remained open.
6. Returning to the app foreground used the existing lifecycle retry path. The app displayed `/SCRIPTS`, the one owned script, and normal BFF connection without `/LOGIN`, error, crash, or manual retry. Safe recovery observation: `2026-08-12T20:14:14+09:00`; the supplied screenshot clock showed `20:13`.

Because the original access token was issued no later than the `19:03:38` authenticated baseline and the configured lifetime is `3600` seconds, it was expired by `20:03:38` at the latest. Therefore the successful authenticated Bearer scripts result after `20:13` could not be produced by the original expired access token and demonstrates successful refresh recovery.

The offline observation demonstrates behavioral session retention; raw Keychain content was not read. Existing focused repo tests corroborate that retryable refresh failures return to `authenticated`, keep the stored session candidate, and single-flight concurrent refresh callers. No duplicate UI/navigation or refresh-storm symptom was observed; exact raw request counts were not logged and are not invented.

## Final disposition

M17:

`PASS_ACTUAL_DEVICE_TRANSIENT_REFRESH_RECOVERY`

Provenance:

`ACTUAL_DEVICE + CONTROLLED_NETWORK + NATURAL_SESSION_REFRESH_TRIGGER`

No product or security defect was observed. B1D2A case-level remaining count is `0`, but B1D2A is not yet marked `CLOSED_COMMITTED_PASS`. The next and only action is the separately authorized `B1D2A_FINAL_CLOSEOUT_AUDIT`. Do not start B1D2B or Gate 2 automatically.
