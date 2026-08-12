# B1D2A M08 real-provider natural-expiry proof result

Mode: `B1D2A_M08_REAL_PROVIDER_NATURAL_EXPIRY_PROOF_V1`

Status: `PENDING_RATE_LIMIT`

## Scope and provenance

This run covered only M08. It did not start M17, modify provider settings, or perform an expired-link tap.

Evidence provenance is separated as follows:

- repo/live preflight: Codex-observed workspace, deployment, endpoint, and installed-app state
- rate-limit result: Human-provided current actual-device observation
- expiry policy: last-known read-only Supabase Dashboard observation from the preceding wave

No Magic Link URL, token, code, cookie, or email address is recorded.

## Preflight

- branch and local/remote HEAD matched `45921a33be12bb9c886d6a35623d6c4e6e7c1ef4`
- working tree was clean
- `npm run check:workspace` passed
- fixed staging AASA `200`
- Apple CDN AASA `200`
- fixed staging callback `303`
- fixed staging recovery `200`
- fixed staging callback `Set-Cookie` count `0`
- fixed staging and production deployments were unchanged
- normal `com.nativeminutes.app.staging` development app was installed on the iPhone 14 Plus
- temporary M22 branch, worktree, and local artifact directory were absent
- the Human observer confirmed the app was at `/LOGIN`

## Expiry setting

The last-known read-only provider setting remains Email OTP/link expiry `3600` seconds. A current read-only recheck was attempted, but the available Supabase Dashboard browser session was signed out. No login or setting action was initiated, and no contradictory current value was observed. This run therefore does not claim a newly confirmed provider value.

## Single issuance attempt

The Human observer used Mobile `/LOGIN` and performed the one authorized send attempt. The current actual-device result was rate limiting.

- Link E issuance: `NOT_CONFIRMED`
- safe observation record time: `2026-08-12T07:50:45Z` (`2026-08-12T16:50:45+09:00`)
- exact button-tap time: `UNKNOWN`
- retry in this run: none

Because issuance was not confirmed, no natural-expiry window started. No message was opened, forwarded, or tapped. Phases 2 through 4 were not performed.

## Final disposition

M08 remains:

`PENDING_RATE_LIMIT`

No authentication/session result, expired-link recovery result, or M08 PASS is claimed. The rate limit itself is consistent with a safe provider/app control; it does not demonstrate the required expired-link behavior and is not recorded as a product defect.

B1D2A remains `OPEN` with two cases:

- M08: `PENDING_RATE_LIMIT`
- M17: `PENDING_NATURAL_REFRESH_TRIGGER`

The next M08 attempt requires a separately initiated run after the provider rate limit has cleared naturally. Do not automatically resend, start the expiry timer, tap an older link, or start M17.
