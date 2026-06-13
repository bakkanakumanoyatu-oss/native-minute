# Capacitor Native Auth Gate Decision

This is a decision packet only. It does not implement deep links, universal links, native login, DB schema changes, provider changes, Store Console work, Apple Developer configuration, or Supabase production setting changes.

## Current Status

- iOS native shell launch: `PASS`.
- iPhone 16 Pro Simulator launch: `PASS`.
- Native Minutes Home render: `PASS`.
- Protected route login redirect: `observed` and treated as expected route-guard behavior while unauthenticated.
- Auth/session: `BLOCKED`.
- Blocked reason: the magic link callback opened in Mac Chrome instead of the iOS WebView. Chrome did not have the PKCE verifier cookie created by the WebView login attempt, so `/auth/callback` redirected to `/login?error=callback_pkce_missing&next=%2Fscripts`.
- Capacitor `server.url` remains `preflight_only` and is not a Store-submission-ready architecture claim.

## Current Repo Auth Flow

1. Protected routes are guarded by `middleware.ts` for `/scripts`, `/setup`, `/progress`, and `/settings`.
2. Unauthenticated protected requests redirect to `/login?error=login_required&next=<internal path>`.
3. `app/login/page.tsx` renders the email magic-link form and passes a sanitized internal `next` path into `LoginForm`.
4. `components/auth/login-form.tsx` posts to `/api/auth/sign-in`, using same-origin credentials.
5. `app/api/auth/sign-in/route.ts` builds `emailRedirectTo` from the current request origin plus `/auth/callback?next=<internal path>`, calls `supabase.auth.signInWithOtp`, and stores `nm-login-next` plus Supabase PKCE cookies in the response context.
6. `app/auth/callback/route.ts` expects the callback request to arrive in the same browser context. It exchanges `code` with `exchangeCodeForSession` or verifies `token_hash`, applies Supabase session cookies to the redirect response, clears continuity cookies on success, and redirects to the sanitized `next` path.
7. If callback exchange fails and no PKCE verifier cookie is present, the route classifies it as `callback_pkce_missing`.

## Why The Native Shell Blocks

The current flow is correct for a same-browser Web login. In the native shell, the login request starts inside the Capacitor-hosted WebView, so the PKCE verifier cookie is stored in the WebView cookie jar. The email link then opens in Mac Chrome, which is a different browser context and does not have that cookie. The server route sees a callback without the verifier and correctly returns `callback_pkce_missing`.

This is not a protected-route bug. It is the expected result of a PKCE magic-link callback leaving the browser context that started the login.

## Options

### A. Return The Magic Link To The App With Deep Link / Universal Link

- Change scope: native URL handling, iOS associated domain / URL routing, and a small WebView callback handoff so the existing `/auth/callback` URL is loaded inside the app WebView.
- External setup: Apple Associated Domains, an `apple-app-site-association` file for the production domain, Supabase redirect allowlist review, and possibly a custom scheme fallback for simulator-only smoke.
- App Store / TestFlight checks: link from iOS Mail/Safari opens Native Minutes, callback finishes inside app-display, session persists, logout works, and no Safari/Chrome dependency is required for the reviewer.
- Security / PKCE / session impact: preserves the existing PKCE exchange and server-owned cookie flow. The callback must be handled by the same WebView cookie context that started login.
- Capacitor preflight fit: good. It closes the native auth blocker while still keeping `server.url` preflight-only and keeping server logic hosted.
- Implementation risk: medium. Requires iOS entitlement / association correctness and careful native-to-WebView URL handoff. It should be isolated as an auth gate, not mixed with provider or DB work.
- Manual check: start login in app, open the email link from iOS, confirm the app foregrounds and lands on `/scripts`, then verify refresh/background session persistence.

### B. Add A Native-Oriented Email Code / OTP Login Path

- Change scope: new login UI state, likely new API route or callback branch for code/token verification, error states, rate-limit copy, and smoke coverage.
- External setup: email template / provider behavior confirmation and Supabase Auth settings for OTP-style login.
- App Store / TestFlight checks: reviewer can complete login without leaving app-display, code entry works, session persists, and failed/expired code recovery is clear.
- Security / PKCE / session impact: avoids browser-context PKCE handoff but introduces a second auth UX and verification path that must be kept as safe as the existing server route.
- Capacitor preflight fit: workable, but it broadens product/auth surface beyond the current magic-link flow.
- Implementation risk: medium-high for v1 because it adds new auth behavior, new UI states, and new user-facing failure cases.
- Manual check: request code in app, enter code in app, reach `/scripts`, refresh, logout, retry expired/invalid code.

### C. Keep Auth Blocked Until A Later TestFlight Gate

- Change scope: no code change now; keep recording `auth/session: BLOCKED`.
- External setup: none now.
- App Store / TestFlight checks: still required before release because protected practice flows remain inaccessible in native app.
- Security / PKCE / session impact: no immediate change.
- Capacitor preflight fit: acceptable only if the next native smoke remains launch/app-display/audio planning. It does not close the release blocker.
- Implementation risk: low now, but delays the required auth decision.
- Manual check: continue marking auth/session as `BLOCKED`.

## Recommendation

Choose **A: universal link / deep link callback return to the app**, with universal links as the Store-facing path and a custom-scheme fallback only if needed for local/simulator smoke.

Reasoning:

- It preserves the existing server-owned Supabase PKCE magic-link flow.
- It does not introduce a second login product surface.
- It keeps provider secrets, service-role keys, DB ownership, and route-handler authority on the hosted server.
- It directly fixes the observed blocker: callback opening in the wrong browser context.
- It is the most realistic v1 Store path because reviewers should be able to open a login email and return to the app.

## Minimal Implementation Plan For The Recommended Option

1. Decide the exact callback return target:
   - primary: production universal link under `https://native-minute.vercel.app/auth/callback`
   - optional fallback: app custom scheme only if simulator/device smoke needs it
2. Add iOS URL handling in a small native-auth gate:
   - restore or replace the universal-link handoff using the Capacitor iOS 8-compatible API shape
   - ensure the native app loads the callback URL into the Capacitor WebView, not an external browser
3. Add the minimum app association/configuration artifacts only after human approval:
   - Associated Domains entitlement
   - `apple-app-site-association` hosting plan
   - Supabase redirect allowlist confirmation
4. Keep `/api/auth/sign-in` and `/auth/callback` semantics intact unless a focused auth gate proves a small change is required.
5. Run iOS native auth smoke:
   - login starts in app-display
   - email link returns to app-display
   - `/auth/callback` receives the PKCE verifier cookie
   - `/scripts` opens authenticated
   - refresh and background/foreground keep session
6. Stop before Store submission architecture claims. `server.url` remains preflight-only until a later final architecture gate.

## Stop Conditions

Stop and create a separate decision gate if any of these become necessary:

- changing DB schema or migrations
- inspecting secret or env actual values
- moving provider/API/service-role keys into the native client
- changing account ownership semantics
- replacing the existing Web auth flow entirely
- requiring Apple Developer or Supabase production setting changes before the human approves them
- needing Store submission readiness claims from `server.url`
- implementing Android auth before iOS native auth smoke is closed

## Human Decisions Needed Before Implementation

- Approve universal links as the primary v1 native auth path.
- Decide whether to allow a custom scheme fallback for simulator/local smoke.
- Confirm who will handle Apple Developer Associated Domains and `apple-app-site-association` hosting.
- Confirm whether Supabase redirect allowlist changes are approved for the native auth gate.
- Confirm whether this auth gate should happen before final app-display screenshot capture.
