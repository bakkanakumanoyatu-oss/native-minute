# B1D2A M04/M05 safe Safari fallback result

Status: `IMPLEMENTED_LIVE_READY — ACTUAL DEVICE PENDING`

- Mode: `B1D2A_M04_M05_SAFE_SAFARI_FALLBACK_IMPLEMENT_LOCAL_PROOF_V1`
- Human Decision: `HDC_B1D2A_SAFARI_FALLBACK_PRIVACY_AND_LINK_REUSE_V1`
- Date: 2026-08-11
- Start branch: `codex/b1d2-unit-f`
- Start HEAD / remote: `b61a2363372f16b38040e0583d1ef5061d51a922`
- Scope: M04 and M05 only
- Actual-device / Simulator / Magic Link / provider-live auth action: none; a later approved Vercel staging promote/live proof is recorded below
- DB / migration / Supabase schema / native auth / PKCE / Keychain / Bearer BFF / dependency change: none

This is repo-generated implementation plus local and fixed-staging live HTTP proof. It is not actual-device evidence and does not make M04 or M05 a final PASS.

## Existing fallback and privacy/log audit

At the start HEAD, AASA contained only the exact `/mobile/auth/callback` component, but no Next route/page existed at that path. Middleware materialized `request.nextUrl.search` before its public-route decision, although it did not log or externally send the value. The repository has no installed analytics/telemetry path that captures this callback and no callback-specific application logger.

The repository does not establish whether the hosting platform or infrastructure records raw request query strings. That status is `UNKNOWN`; this result does not claim that platform logging is absent. No confirmed, repo-unmitigable raw-query platform logging was found.

## Implementation

`GET /mobile/auth/callback` accepts no request input in application code and returns an empty fixed `303` response to `/mobile/auth/recovery`. It does not parse, render, copy, or log query values. Both paths bypass middleware auth/session work before `request.nextUrl.search` is materialized.

The callback and recovery responses use:

- `Cache-Control: private, no-store, max-age=0`
- `Referrer-Policy: no-referrer`
- `X-Robots-Tag: noindex, nofollow, noarchive`

The recovery page is fixed guidance only. It performs no provider exchange, creates no Web session/cookie, invokes no Keychain/native auth operation, and its page component adds no form, outgoing link, client-side effect, analytics, or custom-scheme transition. It tells the user to install/open Native Minute, obtain a new Magic Link, and not reuse the link that reached Safari.

The exact AASA component remains `/mobile/auth/callback`. PKCE, state, nonce, transaction, Keychain, and Bearer BFF contracts are unchanged.

## M04 focused proof

The focused test covers valid-looking, duplicate/extra, and malformed callback queries and proves:

- every input receives the same fixed query-free recovery location
- the callback body is empty and raw sentinels do not enter response headers/body
- no cookie is set and middleware never creates a Supabase client
- callback/recovery source contains no query reader, application log, analytics, provider exchange, Web-session primitive, or custom-scheme redirect
- recovery copy contains new-link guidance and no auth transition element
- adopted no-store/no-referrer/noindex headers are configured
- existing AASA exact-path and native callback validation/auth regressions remain green

Final M04 status: `IMPLEMENTED_LIVE_READY_PENDING_ACTUAL_DEVICE`.

## M05 local readiness and exact actual-device sequence

M05 is not defined as reuse of the link that reached Safari. A later, separately approved actual-device proof must use this exact sequence:

1. Ensure the app is not installed.
2. Tap fresh Magic Link A.
3. Confirm the safe Safari fallback.
4. Install and open Native Minute.
5. Do not reuse Link A.
6. Issue fresh Magic Link B.
7. Open Link B through the native callback.
8. Confirm successful authentication.

Final M05 status: `READY_PENDING_ACTUAL_DEVICE_AFTER_M04`.

## Live staging promotion follow-up

Human Decisions `HDC_B1D2A_M04_M05_FORCE_DYNAMIC_CALLBACK_RUNTIME_V1` and `HDC_B1D2A_PROMOTE_VERIFIED_STAGING_DEPLOYMENT_V1` approved the minimal request-time correction and promotion of verified staging deployment `dpl_C2evjjuZi35mHMp1sNdaejXJPdui`, source `8bdbaac7e776e84a0e495ee410eba5cb3c460bb4`. The fixed staging alias resolved to that exact deployment after formal promotion.

Public fixed-domain proof returned callback HTTP 303, fixed query-free recovery Location, empty body, no cookie, adopted privacy headers, no synthetic sentinel reflection, and callback `x-vercel-cache: MISS` rather than `PRERENDER`. Recovery returned 200 with the fixed guidance. AASA returned 200 without redirect and retained the exact staging app ID and callback path. Production `native-minute` remained unchanged.

Therefore `STAGING_FALLBACK_DEPLOYMENT_PREREQUISITE_RESOLVED`. No actual-device, Magic Link, install, or provider auth flow ran. Detailed external evidence, the historical Remediation B STOP, and its later authorized allowlist reconciliation/config-only resolution are authoritative in [staging prerequisite remediation result](./b1d2a-staging-prerequisite-remediation-result.md).

## Focused proof command

```text
npm run test --workspace @native-minute/mobile -- tests/safari-auth-fallback.test.ts tests/aasa-route.test.ts tests/aasa-middleware.test.ts tests/auth-native-config.test.ts src/auth/callback.test.ts src/auth/mobile-auth.test.ts
```

Result: 6 files passed, 60 tests passed, 0 failed.

The built local production server also returned:

- callback: `303`, fixed `/mobile/auth/recovery`, empty body, no cookie, adopted privacy headers, no sentinel in body/location
- recovery: `200`, query-free URL, adopted privacy headers, no cookie, fixed new-link/no-reuse guidance, no sentinel or custom scheme

## Validation

- full mobile tests: 14 files passed, 145 tests passed, 0 failed
- root typecheck: PASS
- root lint: PASS with zero warnings
- root production build: PASS; both callback and recovery routes present
- staging mobile typecheck/build: PASS
- local production HTTP response proof: PASS
- workspace guard: PASS at preflight; rerun at closeout
- `git diff --check`: PASS before final synchronization; rerun at closeout
- docs validator: no existing repository command found

## Remaining B1D2A cases and effort

B1D2A remains `OPEN`, with 7 cases:

- live-ready + actual-device pending: M04, M05
- actual-device / prerequisite: M08, M24, M25
- network/failure condition: M17, M22

After the later Web callback configuration prerequisite resolution, updated remaining engineering effort is approximately 1.5–2.75 person-days, excluding provider delivery, AASA/device cache waiting, and review iteration. The M04/M05 implementation and live prerequisite portions are complete; their later combined device sequence is estimated at 0.25–0.5 day.

## Next single action

After separate approval, execute only the eight-step M04/M05 actual-device sequence above, with platform raw-query logging still reported as `UNKNOWN` unless independently established. Do not automatically send a Magic Link, operate an iPhone, start another B1D2A case, B1D2B, or Gate 2 from this result.
