# B1D2A staging prerequisite remediation result

Status: `A_RESOLVED — B_STOPPED_UNEXPECTED_CURRENT_REDIRECT_ALLOWLIST`

- Mode: `B1D2A_PROMOTE_VERIFIED_STAGING_DEPLOYMENT_V1`
- Human Decisions: `HDC_B1D2A_M04_M05_FORCE_DYNAMIC_CALLBACK_RUNTIME_V1`, `HDC_B1D2A_PROMOTE_VERIFIED_STAGING_DEPLOYMENT_V1`, and the conditional Remediation B authorization in `HDC_B1D2A_STAGING_PREREQUISITE_REMEDIATION_AB_V1`
- Date: 2026-08-11
- Branch: `codex/b1d2-unit-f`
- Runtime source: `8bdbaac7e776e84a0e495ee410eba5cb3c460bb4`
- Actual-device / Simulator / Magic Link / provider-live auth flow: not executed
- Source / test / DB / migration / env / project setting / production app change: none in this promote/configuration turn

## Remediation A — promoted staging fallback

Vercel project `native-minute-staging` had verified deployment `dpl_C2evjjuZi35mHMp1sNdaejXJPdui` at the exact runtime source above in `READY` + `STAGED` state. The formal Vercel promote operation completed successfully. The fixed `native-minute-staging.vercel.app` alias then resolved to that exact deployment, which became `READY` + `PROMOTED`.

Public fixed-domain proof used synthetic non-provider sentinels and did not follow the callback redirect:

| Surface | Result |
|---|---|
| `/mobile/auth/callback?...` | HTTP 303; fixed `Location: /mobile/auth/recovery`; body 0 bytes; no `Set-Cookie`; `private, no-store, max-age=0`; `no-referrer`; `noindex, nofollow, noarchive`; no sentinel reflection; callback `x-vercel-cache: MISS`, not `PRERENDER` |
| `/mobile/auth/recovery` | HTTP 200; fixed no-session/new-link/no-reuse guidance present; no secret marker |
| `/.well-known/apple-app-site-association` | HTTP 200; zero redirects; exact staging app ID and exact `/mobile/auth/callback` component |

Production project `native-minute` remained on deployment `dpl_7FzKMVfgKdYjGWqPpJoFrpbFgruG`, source `b0e61c0504ad3be31e2eaa4c8cfdaaafbffb280c`, branch `main`, with the same production aliases. No rollback was required.

Remediation A status: `STAGING_FALLBACK_DEPLOYMENT_PREREQUISITE_RESOLVED`.

- M04: `IMPLEMENTED_LIVE_READY_PENDING_ACTUAL_DEVICE`
- M05: `READY_PENDING_ACTUAL_DEVICE_AFTER_M04`

These are not final case PASS statuses. No app-not-installed tap, installation, fresh Link B, or other actual-device step ran in this turn. Platform/infrastructure raw-query logging remains `UNKNOWN`.

## Remediation B — current configuration reconciliation

After A passed, an authenticated human-owned Supabase Dashboard session was used read-only for project `native-minute-staging`. Source still constructs Web `emailRedirectTo` from the staging request origin plus `/auth/callback?next=%2Fscripts`; the exact Web callback allowlist entry is absent.

Current Dashboard evidence:

- Site URL: `http://localhost:3000`
- Redirect URLs total: 3
- Debug: `com.nativeminutes.app.debug://auth/callback**`
- Mobile exact: `https://native-minute-staging.vercel.app/mobile/auth/callback`
- Additional mobile query wildcard: `https://native-minute-staging.vercel.app/mobile/auth/callback\?**`
- Exact Web callback: absent
- Email templates: default; Custom SMTP not configured

The third mobile query wildcard is not present in the last-known repository-authoritative Unit E configuration, which records only the Debug entry and exact mobile HTTPS entry. Because this is an unexpected security-sensitive allowlist difference, the approved B STOP condition applies. The Web callback entry was not added, and Site URL, existing redirects, template, SMTP, Supabase project, and production were not changed.

Remediation B status: `NOT_STARTED_CHANGE — STOPPED_UNEXPECTED_CURRENT_REDIRECT_ALLOWLIST`.

M24 and M25 remain `PENDING_PREREQUISITE_WEB_STAGING_AUTH`.

## Remaining B1D2A cases and effort

B1D2A remains `OPEN` with seven cases: M04, M05, M08, M17, M22, M24, and M25. M04/M05 are now live-ready and require only their separately approved actual-device sequence. M24/M25 remain blocked before Web cookie login proof by the allowlist reconciliation above.

Updated remaining engineering effort is approximately 1.75–3.0 person-days, excluding provider expiry waiting, AASA/device cache waiting, and review iteration.

## Next single action

Obtain a Human Decision that reconciles whether the unexpected mobile query wildcard is authorized and should be retained or removed. Only after the current allowlist is made authoritative may the exact Web callback entry be reconsidered. Do not automatically send a Magic Link, run M04/M05 or M24/M25 actual proof, change Supabase configuration, start B1D2B, or start Gate 2 from this result.
