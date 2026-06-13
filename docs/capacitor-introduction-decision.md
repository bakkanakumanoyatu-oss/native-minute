# Capacitor Introduction Decision

This is a decision packet only. It does not install packages, run `capacitor init`, add iOS/Android projects, change code, touch Store Console, connect providers, change DB schema, run actual deletion, capture screenshots, or edit images.

## Current Position

- Web core, voice setup, screenshot planning, final app-display screenshot procedure, and Capacitor preflight checklist are recorded and pushed.
- Current repo is a hosted Next.js App Router app with API routes and server-side provider/storage boundaries.
- Final Store screenshots should be captured from Capacitor app-display after native preflight, not from Safari.
- Provider production readiness and actual deletion proof remain separate gates.

## Decision Summary

- `proceed_to_capacitor_install`: `true`, after this decision packet is accepted and only in a separate implementation turn.
- `recommended_first_target`: `ios_only_preflight`.
- `auth_deep_link_required_before_first_smoke`: `false`.
- `native_smoke_scope`: `standard`.
- `blockers`: none for a later first install gate, assuming the human accepts iOS-first preflight and no package/auth/schema/provider/secret/destructive requirement appears.

## Capacitor Direction

- Use hosted WebView first, not static export.
- Point the native shell at the hosted production app for the first preflight smoke.
- Keep Next.js API routes, route handlers, auth callback logic, protected replay routes, upload routes, evaluation routes, account deletion routes, and server-only helpers on the hosted server.
- Do not move provider secrets, provider API keys, service-role keys, or server-owned data authority into the native client.
- Treat any request to move backend logic into the native app as a separate architecture gate.

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
- Android full QA.
- Final Store screenshot capture.
- App icon or image processing.
- App Store Connect / Google Play Console operations.

## Human Decisions Still Needed

- Confirm starting with iOS only, rather than iOS/Android in parallel.
- Decide when an Android physical device becomes available for later WebView / Google Play checks.
- Decide whether reviewer account final login verification should be completed before or after the first Capacitor smoke.
- Decide whether provider production readiness should be finalized before or after the first Capacitor smoke.

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

If the human accepts this packet, the next gate can be a small Capacitor install preflight implementation for iOS only. That gate should still stop before Store screenshots and should report app-display, auth/session, audio, mic, upload, safe-area, legal-link, and screenshot-readiness observations separately.
