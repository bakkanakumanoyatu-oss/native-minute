# Capacitor Introduction Decision

This is a decision packet only. It does not install packages, run `capacitor init`, add iOS/Android projects, change code, touch Store Console, connect providers, change DB schema, run actual deletion, capture screenshots, or edit images.

## Current Position

- Web core, voice setup, screenshot planning, final app-display screenshot procedure, and Capacitor preflight checklist are recorded and pushed.
- Current repo is a hosted Next.js App Router app with API routes and server-side provider/storage boundaries.
- Final Store screenshots should be captured from Capacitor app-display after native preflight, not from Safari.
- Provider production readiness and actual deletion proof remain separate gates.
- Capacitor iOS preflight shell has started: core / CLI / iOS packages are installed, `capacitor.config.ts` is present, and an iOS project exists for app-display smoke only.

## Decision Summary

- `proceed_to_capacitor_install`: `conditional_true_after_bundle_id_approval`.
- `recommended_first_target`: `ios_only_preflight`.
- `auth_deep_link_required_before_first_smoke`: `false`.
- `native_smoke_scope`: `standard`.
- `hosted_webview_first_scope`: `preflight_only`.
- `server_url_store_submission_ready`: `false`.
- `final_store_architecture_followup_required`: `true`.
- `bundle_id_human_approval_required_before_init`: `true`.
- `ios_only_start_approved`: `true`.
- `android_deferred_until_after_ios_native_smoke`: `true`.
- `reviewer_account_final_login_blocker_before_capacitor_install`: `false`.
- `provider_readiness_blocker_before_capacitor_install`: `false`.
- `provider_readiness_blocker_before_release_qa`: `true`.
- `approved_app_id_bundle_id`: `com.nativeminutes.app`.
- `bundle_id_human_approval_status`: `approved`.
- `blockers`: stop if package/auth/schema/provider/secret/destructive work becomes necessary in a docs-only phase.

## Capacitor Direction

- Use hosted WebView first, not static export, for preflight only.
- If Capacitor `server.url` is used, treat it as a native shell / app-display / permissions / WebView cookie-session smoke tool, not as final Store submission architecture.
- Do not claim Store submission readiness from `server.url` alone.
- Final Store architecture must be re-checked in a follow-up gate before release.
- Point the native shell at the hosted production app only for the first preflight smoke.
- Current preflight config uses `https://native-minute.vercel.app` as `server.url`.
- Keep Next.js API routes, route handlers, auth callback logic, protected replay routes, upload routes, evaluation routes, account deletion routes, and server-only helpers on the hosted server.
- Do not move provider secrets, provider API keys, service-role keys, or server-owned data authority into the native client.
- Treat any request to move backend logic into the native app as a separate architecture gate.

## App Identifier Guardrail

- Human-approved appId / Bundle ID: `com.nativeminutes.app`.
- This satisfies the pre-init app identifier approval guardrail for a later explicit Capacitor install gate.
- Do not register an Apple Developer bundle identifier or perform Store Console work in this gate.
- Capacitor init and iOS project creation have now been performed for the explicit iOS-only preflight shell.
- Android project creation, Apple Developer bundle registration, and Store Console work remain out of scope.

## Auth / Deep Link Policy

- Do not require complete native magic-link deep link support before the first native smoke.
- First smoke may verify the existing production login flow and hosted callback behavior, including WebView cookie/session persistence.
- Custom scheme, universal links, and full native deep-link handling are a later auth gate.
- Stop before implementation if the first smoke requires changing auth callback semantics, redirect rules, Supabase redirect settings in a way that needs env/secret inspection, or app scheme/universal-link implementation.

## First Native Smoke Scope

Standard, non-destructive smoke:

1. App launches.
2. Hosted production URL loads in app-display.
3. Home / Practice entry renders.
4. Bottom navigation works.
5. Listen screen plays model audio by user action.
6. Record screen shows microphone permission prompt when needed.
7. Record can start and stop recording.
8. Review screen renders a saved result.
9. Progress screen renders latest / best take state.
10. Voice setup shows existing-voice three-choice state.
11. Privacy, Support, and Account deletion links open from app-display.

## Explicitly Out Of Scope For First Smoke

- Provider production connection changes.
- OpenAI custom voice entitlement or alternate provider entitlement checks.
- Actual deletion or destructive cleanup.
- Store submission.
- Paid feature or billing work.
- Android full QA or Android project work before iOS native smoke.
- Final Store screenshot capture.
- App icon or image processing.
- App Store Connect / Google Play Console operations.

## Human Decisions Still Needed

- iOS-only start is approved for the first native smoke.
- Android is deferred until after iOS native smoke.
- Reviewer account final login verification can wait until after the first Capacitor native smoke.
- Provider production readiness can wait until after the first Capacitor native smoke, but remains required before final release QA.
- appId / Bundle ID human approval is recorded as `com.nativeminutes.app`; implementation still waits for a separate explicit install gate.

## Stop Conditions

Stop and create a separate gate if any of these become necessary:

- package install during this docs-only phase
- Capacitor init or platform add during this docs-only phase
- iOS / Android project creation during this docs-only phase
- auth callback / redirect semantics change
- app scheme / universal link implementation
- DB schema / migration
- provider real connection or provider dashboard/API operation
- secret / env actual value inspection
- destructive operation or actual deletion

## Next Gate

With the iOS preflight shell installed, the next gate is human iOS native smoke or an Xcode-focused preflight. It should still stop before Store screenshots and should report app-display, auth/session, audio, mic, upload, safe-area, legal-link, and screenshot-readiness observations separately. Before final Store submission, run a follow-up architecture gate to decide whether the preflight `server.url` approach remains acceptable or needs a different final packaging architecture.
