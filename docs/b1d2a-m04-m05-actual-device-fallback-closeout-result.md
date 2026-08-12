# B1D2A M04/M05 actual-device fallback closeout result

Mode: `B1D2A_M04_M05_ACTUAL_DEVICE_FALLBACK_CLOSEOUT_V1`

Status: **COMPLETED — M04/M05 PASS**

Date: 2026-08-12

Start HEAD: `37be7619335a03a6159bd663da1e9a0d444df95b`

## Scope and safety boundary

This closeout covered only M04 app-not-installed Safari fallback and M05 install-after-fallback authentication with a fresh link. No source, test, mobile profile, signing setting, Supabase, Vercel, Apple configuration, production deployment, migration, M08, M17, M22, B1D2B, or Gate 2 change was made.

The account is recorded only as an existing staging test account. Email address, Magic Link, callback query, code, state, nonce, transaction, PKCE verifier, session, token, Keychain value, and device identifier are not recorded.

## Preflight

| Check | Result |
|---|---|
| workspace / branch / HEAD / remote / clean tree | PASS |
| `npm run check:workspace` | PASS |
| runtime source | exact `8bdbaac7e776e84a0e495ee410eba5cb3c460bb4` |
| fixed staging deployment | exact `dpl_C2evjjuZi35mHMp1sNdaejXJPdui`, Ready |
| fixed callback | 303 to query-free `/mobile/auth/recovery`, empty body |
| recovery / AASA | 200 / 200; AASA exact staging app/path |
| production isolation | `dpl_7FzKMVfgKdYjGWqPpJoFrpbFgruG`, source `b0e61c0504ad3be31e2eaa4c8cfdaaafbffb280c`, branch `main`, Ready |

## Device and artifact

- Device: iPhone 14 Plus
- OS: iOS 26.2.1
- Environment: Native Minute Staging signed development build
- Bundle ID: `com.nativeminutes.app.staging`
- Associated Domain: exact `applinks:native-minute-staging.vercel.app`
- Mobile build metadata: staging profile, universal-link callback mode, `authConfigured=true`

No reusable signed device `.app` existed after the initial uninstall. Codex therefore built the already-synced mobile bundle once with the current `App` scheme and `Staging` configuration into a temporary directory. Strict code-sign verification, staging application identifier, exact Associated Domain, and mobile metadata passed. Source, configuration, signing settings, provisioning assets, and production were not changed. The same verified artifact was reused for all later installs; M05 did not trigger another build.

## M04 — app-not-installed Safari fallback

The Mobile-specific Magic Link can only be requested by the installed Staging app's `/LOGIN` UI; Web `/login` would generate the distinct Web callback. The verified Staging artifact was therefore temporarily installed only to request fresh Link A through the normal Mobile UI. Link A remained unopened while Codex uninstalled the app again and confirmed that `com.nativeminutes.app.staging` was absent from the device.

With the app not installed, the newest Link A was tapped exactly once. Safari displayed the Native Minute safe recovery guidance. The observed page said that login is not completed and no session is created in the browser, instructed installation followed by a newly issued link, and explicitly prohibited reuse of the link opened in the browser. The app did not launch; no authenticated UI, automatic custom-scheme transition, crash, or sensitive callback value was visible.

Corroborating live/repo evidence remained unchanged: the callback is a fixed 303 to query-free recovery, produces no body or cookie, bypasses Web auth/provider exchange/session primitives, and the recovery page does not render the incoming query. Platform/infrastructure raw-query logging remains `UNKNOWN` and is not inferred from the device observation.

M04: `PASS_ACTUAL_DEVICE_SAFE_SAFARI_FALLBACK`.

Evidence provenance: `ACTUAL_DEVICE` + contemporaneous Human-provided screenshot/observation + Codex device install-state observation + `LIVE_STAGING_WEB` + corroborating repo implementation evidence.

## M05 — fresh link after install

After M04 PASS, Codex reinstalled and normally launched the same verified signed Staging artifact without rebuilding it. `/LOGIN` rendered. Link A was not reopened or reused.

The same staging test account requested one fresh Link B through the Staging app's normal `/LOGIN` UI. The newest Link B was tapped exactly once. Native Minute Staging opened through the Universal Link flow and rendered authenticated `/SCRIPTS`; Bearer BFF was normal. Safari recovery, localhost, `callback_failed`, duplicate navigation, and crash were not observed.

The successful outcome is consistent with the existing unchanged ingress → JS callback → state/nonce/transaction validation → PKCE exchange → Keychain session → authenticated `/SCRIPTS` → Bearer BFF implementation and prior focused evidence. This closeout records the user-visible/native actual result without exposing or claiming direct observation of raw authentication values.

M05: `PASS_ACTUAL_DEVICE_FRESH_LINK_AFTER_INSTALL`.

Evidence provenance: `ACTUAL_DEVICE` + contemporaneous Human-reported observation + Codex install/launch observation + `LIVE_STAGING_AUTH` + corroborating repo implementation evidence.

## Defects and disposition

- M04 security/privacy defect: none observed.
- M05 auth/ingress defect: none observed.
- Sensitive query exposure: none visible; platform raw-query logging remains `UNKNOWN`.
- Production impact: none.
- M04: `PASS_ACTUAL_DEVICE_SAFE_SAFARI_FALLBACK`.
- M05: `PASS_ACTUAL_DEVICE_FRESH_LINK_AFTER_INSTALL`.

B1D2A remains `OPEN` with three cases: M08, M17, and M22. This result does not start or imply completion of those cases, B1D2B, or Gate 2.

## Next single action

Stop after committing this evidence. The next separately authorized action is a dedicated M08 real provider-expiry proof using one unconsumed staging link after its natural expiry window. Do not automatically issue that link, start M17/M22, change source/configuration, start B1D2B, or start Gate 2.
