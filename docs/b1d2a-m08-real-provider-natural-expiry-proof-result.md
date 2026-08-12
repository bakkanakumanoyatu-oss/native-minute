# B1D2A M08 real-provider natural-expiry proof result

Modes:

- `B1D2A_M08_REAL_PROVIDER_NATURAL_EXPIRY_PROOF_V1`
- `HDC_M08_NORMAL_STAGING_SUPABASE_TARGET_ALIGNMENT_V1`

Status: `PASS_ACTUAL_DEVICE_EXPIRED_PROVIDER_LINK`

## Scope and provenance

This closeout covered only M08. It did not start M17 or change Supabase, SMTP, rate-limit, TTL, device clock, source, tests, signing settings, Vercel, production, database, or migration state.

Evidence provenance is separated as follows:

- `ACTUAL_DEVICE + LIVE_STAGING_AUTH + NATURAL_PROVIDER_EXPIRY`: Human-reported current iPhone 14 Plus / iOS 26.2.1 observations for Link E issuance/receipt and the single post-expiry tap
- repo/build evidence: Codex-observed Mobile env contract, signed Staging artifact identity, embedded public target, release guards, implementation, and tests
- live endpoint evidence: Codex-observed fixed staging AASA/callback/recovery and production isolation checks
- provider configuration evidence: current read-only Supabase Dashboard observation of the staging Email OTP/link expiry

The actual-device result is not described as repo-generated. No Magic Link URL, token, code, cookie, email address, Project URL, or publishable key is recorded.

## Preflight and target alignment

- branch and local/remote HEAD matched `8984f2dbdd04e48ed8dd4f539121fd1d6f238d58`
- working tree was clean and `npm run check:workspace` passed
- fixed staging AASA `200`, Apple CDN AASA `200`, callback `303`, recovery `200`, and production root `200`
- the production deployment identity remained unchanged from the pre-run checkpoint
- the previously installed normal artifact targeted a different Supabase project because the M22 recovery build had transiently mapped the root Web `.env.local` pair into the Mobile build-time variables
- Mobile source reads only `MOBILE_SUPABASE_URL` and `MOBILE_SUPABASE_PUBLISHABLE_KEY`; tracked source/config changes were unnecessary
- a temporary mode-`0600` build env supplied the current `native-minute-staging` Project URL and public publishable key only; it was removed after use
- the built/signed artifact matched `com.nativeminutes.app.staging`, Xcode `Staging`, the fixed staging Associated Domain, `authConfigured=true`, and the intended staging Supabase project
- artifact inspection rejected the other project and found no service-role key, secret key, or legacy JWT credential
- the artifact was installed on the iPhone and the Human observer confirmed `/LOGIN`

The mismatch was introduced after the earlier M24/M25 proof. That proof's Web-created User A resource was visible to Mobile User A and absent for authenticated Mobile User B, which positively corroborates the same Web/Mobile Auth and RLS boundary. No evidence invalidates M24/M25 or another accepted case.

## Issuance and natural expiry

The current read-only staging Email OTP/link expiry was `3600` seconds. The setting was not changed.

- one fresh Mobile Link E was issued successfully from `/LOGIN`
- Human-confirmed receipt occurred without opening or forwarding it
- safe issuance observation: `2026-08-12T17:27:04+09:00`
- earliest natural-expiry point: `2026-08-12T18:27:04+09:00`
- pre-tap time check: `2026-08-12T18:30:30+09:00`
- actual tap observation: `2026-08-12T18:31+09:00`; exact seconds are `UNKNOWN`

No TTL, provider setting, device clock, URL, token, or pending state was modified. Link E was tapped exactly once after the natural provider-expiry point and was not retried.

## Actual-device result

The single Link E tap opened Native Minute Staging but did not authenticate:

- the app remained on `/LOGIN`
- the fixed safe message asked for a new authentication link
- `/SCRIPTS` was not shown
- no authenticated session or unexpected authentication success was observed
- no stale-link retry or same-link reuse guidance was shown
- no crash occurred
- the screen remained usable for a fresh-link recovery

The visible `BFFに接続済み` card is not Bearer evidence. Repo implementation identifies it as the unauthenticated public `/api/mobile/health` check. No authenticated Bearer scripts success is claimed.

The UI exposed the fixed `auth_callback_invalid` recovery copy rather than a raw provider error or token detail. The exact internal/provider error code is therefore `UNKNOWN` and is not inferred. M08 requires the real link to be naturally expired and the actual device to fail closed with no session and safe fresh-link recovery; it does not require exposing provider internals to the user.

## Corroborating repo evidence

Existing focused Mobile tests prove that an expired pending PKCE transaction fails closed with `auth_callback_expired`, performs zero provider exchanges, creates no session, and clears the expired pending state. `App.tsx` maps invalid/expired callback outcomes to fixed new-link recovery messages without raw URL or token detail.

This repo evidence corroborates the actual observation but is not substituted for the actual-device result.

## Final disposition

M08:

`PASS_ACTUAL_DEVICE_EXPIRED_PROVIDER_LINK`

Provenance:

`ACTUAL_DEVICE + LIVE_STAGING_AUTH + NATURAL_PROVIDER_EXPIRY`

No product or security defect was observed. B1D2A remains `OPEN` with one case only:

- M17: `PENDING_NATURAL_REFRESH_TRIGGER`

Stop after committing this evidence. Do not issue another Magic Link, tap Link E again, start M17, B1D2B, or Gate 2 automatically.
