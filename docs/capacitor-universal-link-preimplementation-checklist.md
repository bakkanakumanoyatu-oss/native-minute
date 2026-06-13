# Capacitor Universal Link Preimplementation Checklist

This is a preimplementation checklist only. It does not add Associated Domains entitlements, add an AASA file, change Supabase settings, implement Universal Links, implement a custom scheme, change auth semantics, change DB schema, connect providers, or claim Store-ready architecture.

References:

- Apple: [Supporting associated domains](https://developer.apple.com/documentation/xcode/supporting-associated-domains)
- Apple: [Supporting universal links in your app](https://developer.apple.com/documentation/xcode/supporting-universal-links-in-your-app)
- Apple archive: [Support Universal Links](https://developer.apple.com/library/archive/documentation/General/Conceptual/AppSearch/UniversalLinks.html)
- Supabase: [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)

## Current Status

- iOS native shell launch, Simulator launch, and Home render are `PASS`.
- Protected route login redirect is `observed` and is expected while unauthenticated.
- Auth/session is `BLOCKED` because the magic link callback opened outside the iOS WebView and the callback browser context did not have the PKCE verifier cookie.
- Native auth gate decision recommends Universal Link primary for v1.
- Custom scheme may be considered only as a simulator/local-smoke helper.
- Production / Store-facing primary path is Universal Link.
- `server.url` remains `preflight_only`.
- Native auth gate should close before final app-display screenshots.

## Apple / iOS External Checklist

Human-confirm before implementation:

- Apple Developer team is available and the Team ID / App ID Prefix is known.
- Bundle ID `com.nativeminutes.app` exists or will be created in Apple Developer.
- Associated Domains capability can be enabled for the app identifier.
- Associated Domains entitlement will include `applinks:native-minute.vercel.app` unless a custom production domain is chosen before the gate.
- The final AASA `appID` will be `<TeamID>.com.nativeminutes.app`.
- The app build will include `com.apple.developer.associated-domains`.
- The device or TestFlight build used for smoke is signed by the team that owns the associated domain entitlement.
- No Store-ready claim is made from this entitlement alone; auth smoke still has to pass.

## AASA Checklist

Human-confirm before implementation:

- AASA is served over HTTPS from the same domain used in the magic link callback.
- Preferred path is `https://native-minute.vercel.app/.well-known/apple-app-site-association`.
- File name has no `.json` extension.
- Response is valid JSON and not HTML.
- Response does not redirect.
- Response content type should be compatible with Apple Universal Links, preferably `application/json`.
- AASA contains an `applinks` object with an empty `apps` array and a `details` entry for `<TeamID>.com.nativeminutes.app`.
- Path scope should be as narrow as practical for auth, starting with `/auth/callback*`.
- If broader app links are needed later, widen paths in a separate gate.
- AASA must not contain secrets, tokens, private paths, raw storage paths, provider IDs, or environment values.

Repo placement candidates:

- `app/.well-known/apple-app-site-association/route.ts`
  - Pros: can explicitly set `Content-Type`, avoid extension issues, and keep the response static.
  - Cons: route-handler code is needed and should be verified on Vercel.
- `public/.well-known/apple-app-site-association`
  - Pros: simple static asset if Next/Vercel serves it with the needed path.
  - Cons: current repo has no `public/` directory, and content type must be verified.

Recommendation: use an App Router route handler if content type or no-extension serving is uncertain. Keep the handler static and data-only.

## Supabase Checklist

Human-confirm before implementation:

- Supabase Auth Site URL remains compatible with the production hosted app.
- Additional Redirect URLs / allowlist includes the exact production callback URL used by `emailRedirectTo`.
- Current repo builds `emailRedirectTo` as the request origin plus `/auth/callback?next=<internal path>`.
- Confirm whether Supabase allowlist accepts the callback with query params via exact URL or wildcard pattern.
- At minimum, allow `https://native-minute.vercel.app/auth/callback`.
- If needed by Supabase matching behavior, allow `https://native-minute.vercel.app/auth/callback*` or the documented wildcard equivalent.
- Do not add localhost, preview, or custom scheme redirects unless that smoke path is explicitly approved.
- Do not inspect or record Supabase secrets, JWT secrets, service-role keys, or provider credentials.

## Repo-Side Minimal Change Candidates

Do only after external checklist approval:

1. Add AASA delivery.
   - Either add `app/.well-known/apple-app-site-association/route.ts` or create `public/.well-known/apple-app-site-association`.
   - Include only safe static association data.
2. Add iOS Associated Domains entitlement.
   - Add an entitlements file, wire `CODE_SIGN_ENTITLEMENTS` in the iOS project, and include `applinks:native-minute.vercel.app`.
3. Restore Universal Link handling in iOS with the current Capacitor iOS API.
   - Current `AppDelegate.swift` only forwards custom URL opens.
   - Previous generated Universal Link handler was removed because it produced an Xcode 16.2 build error.
   - Reintroduce only a Capacitor iOS 8-compatible Universal Link handler, and verify with Xcode.
4. Decide whether a WebView explicit-load handoff is needed.
   - Preferred first attempt: let Capacitor App URL open events hand the Universal Link to the hosted WebView if it already loads the same origin.
   - If that does not navigate the WebView, add the smallest native-to-WebView handoff in a separate focused diff.
5. Keep `/api/auth/sign-in` and `/auth/callback` semantics unchanged unless native smoke proves a tiny targeted change is needed.
   - Preserve same-origin credentials, PKCE verifier cookies, `nm-login-next`, safe `next` paths, and callback failure classification.

## Custom Scheme Fallback

Default: do not include custom scheme in the first Store-facing implementation.

Allowed only if explicitly approved for simulator/local smoke:

- Add scheme such as `nativeminutes://auth/callback` only as a fallback test path.
- Add Supabase redirect allowlist entry only for that fallback if used.
- Keep Universal Link as production / Store primary.
- Do not let custom scheme become the reviewer-facing primary path without a new decision.
- Stop if custom scheme requires broad auth callback semantics or a second login UX.

## Recommended Implementation Order

1. Human confirms Team ID / App ID Prefix, Apple Developer access, and Supabase redirect allowlist plan.
2. Add AASA delivery in repo and verify production HTTPS response after deploy.
3. Add iOS Associated Domains entitlement for `applinks:native-minute.vercel.app`.
4. Add Capacitor iOS 8-compatible Universal Link forwarding.
5. Run `npx cap sync ios`.
6. Run repo checks: `git diff --check`, `npm run lint`, `npm run build`, `npm run typecheck`.
7. Human runs Xcode smoke on simulator and preferably physical iPhone.
8. Only after auth/session passes, continue to app-display screenshot readiness.

## Manual Smoke Checklist

Simulator / local smoke:

- Install/run the iOS app from Xcode.
- Open app and confirm Home still renders.
- Try protected route and confirm login prompt appears.
- Send magic link from inside app-display.
- Open the email link in the simulator if possible.
- Confirm app opens or foregrounds and callback reaches app-display.
- Confirm `/scripts` opens authenticated.
- If simulator cannot exercise Universal Links reliably, record `BLOCKED: simulator_link_delivery` and move to physical-device smoke.

Physical iPhone smoke:

- Install/run a signed build with Associated Domains entitlement.
- Confirm AASA is available over HTTPS before opening the link.
- Send magic link from inside app-display.
- Open the email link on the iPhone.
- Confirm Native Minutes opens instead of Safari/Chrome.
- Confirm `/auth/callback` completes and `/scripts` opens authenticated.
- Refresh or background/foreground the app and confirm session persists.
- Logout from Settings and confirm protected routes return to login prompt.
- Try a fresh login after logout.

Failure regression checks:

- `callback_pkce_missing` should not occur when the email link returns to the same app WebView context.
- `callback_failed` should remain distinguishable from missing PKCE.
- Existing Web browser login should continue to work.
- Protected route login redirect should remain expected while unauthenticated.
- No secret, token, service-role key, private path, raw audio path, Storage path, provider ID, or signed URL should appear in UI, native project, logs copied into evidence, or docs.

## Stop Conditions

Stop before implementation or split into a new gate if any of these become necessary:

- Apple Team ID / App ID Prefix is unknown.
- Bundle ID cannot be registered or Associated Domains cannot be enabled.
- AASA cannot be served from the production callback domain over HTTPS without redirect.
- Supabase redirect allowlist cannot safely allow the callback URL.
- Universal Link callback requires replacing the existing Web PKCE flow.
- `/api/auth/sign-in` or `/auth/callback` semantics need broad changes.
- DB schema / migration changes are needed.
- Provider connection or secret/env actual value inspection is needed.
- Native client would need provider API keys or service-role keys.
- `server.url` would need to be treated as final Store-ready architecture.
- Custom scheme would become the Store-facing primary path without a new decision.
