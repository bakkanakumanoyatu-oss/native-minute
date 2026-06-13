# Capacitor Preflight Checklist

This is a planning checklist only. It does not install packages, run `capacitor init`, add iOS/Android projects, change code, touch Store Console, connect providers, change DB schema, run actual deletion, capture screenshots, or edit images.

## Current Position

- Web core, voice setup rerecord flow, screenshot candidate selection, Record / Progress review, final redaction prep, screenshot capture strategy, and app-display screenshot procedure are recorded and pushed.
- Final Store screenshots should be captured after Capacitor in app display, not from Safari.
- Current Safari screenshots are composition references only.
- `main...origin/main` was expected to be `0 0` before this checklist work.

## Product / Architecture Baseline

- Native Minute is a fixed 1-minute practice app with the main loop `setup/voice -> scripts -> listen -> record -> review -> progress`.
- Current app is a hosted Next.js App Router app, not a static export app.
- The repo uses server-rendered pages, middleware auth guard, API routes, protected audio replay routes, and server-side provider/storage logic.
- Capacitor planning should therefore start with a hosted WebView model unless a later explicit gate decides to build a different architecture.

## Package / Build

Checklist:

- Confirm `package.json` scripts remain `dev`, `build`, `start`, `lint`, `typecheck`, provider preflights, and Playwright smokes.
- Confirm there is no current `next export` script and no static export assumption.
- Confirm `next.config.mjs` uses standard Next build with `reactStrictMode` and configurable `distDir`.
- Before adding Capacitor, decide whether native shell points at hosted production URL or a local bundled web asset strategy. Current app strongly favors hosted WebView because API routes and server-side auth/storage/provider boundaries are part of the product.
- Stop if Capacitor requires changing Next.js routing, build output mode, env loading, or API route behavior.

Risk:

- Static export would not carry the current API routes, middleware auth, protected replay, or server/provider logic.

## Next.js App Structure

Observed:

- App Router pages include Home, login, scripts, script creation, listen, record, review, progress, settings, privacy, terms, support, account deletion, and setup voice.
- API routes cover auth, scripts, uploads, evaluate, speak script, protected audio replay, saved audio/take library, account deletion dry-runs, and test helpers.
- Server-only helpers exist for Script Studio/OpenAI boundaries.
- No broad Server Actions dependency was observed during preflight search.

Checklist:

- Treat route handlers as server-hosted product surface.
- Keep route handlers thin and service-owned behavior intact.
- Do not move canonical source of truth to the native client.
- Confirm all protected pages still work inside WebView with cookies.
- Confirm `/api/script-audio/[audioId]` and `/api/takes/[takeId]/audio` replay inside WebView.

Risk:

- Any attempt to bundle as static files would require separate backend/API hosting decisions.

## Auth / Redirect

Observed:

- Supabase magic link uses `/api/auth/sign-in` and `/auth/callback`.
- Continuity uses a short-lived cookie and internal `next` path handling.
- `NEXT_PUBLIC_APP_URL` is used as public origin context; callback redirect currently uses request origin.
- Middleware protects `/scripts`, `/setup`, `/progress`, and `/settings`.

Checklist:

- Confirm hosted app origin is allowed in Supabase Auth redirect settings.
- Confirm magic link opens the app-display flow acceptably.
- Decide whether native deep link / custom scheme is required before store submission or whether email link opens hosted app display first.
- If deep link is needed later, handle it in a separate explicit auth callback / redirect gate.
- Confirm session cookies persist inside iOS and Android WebView.
- Confirm logout clears app WebView session state.

Stop if:

- Auth callback / redirect semantics need code changes.
- App scheme or universal link implementation becomes required.
- Secret or env actual values must be inspected.

## Audio / Microphone

Observed:

- Record and setup voice use browser `MediaRecorder` / `getUserMedia`.
- Listen, Review, and Progress depend on HTML audio playback and protected same-origin replay.
- iPhone Safari production smoke already passed for microphone recording, upload, listen playback, review playback, progress, and voice setup rerecord.

Checklist:

- In Capacitor preflight, verify microphone permission prompt timing before final screenshot or QA.
- Verify `MediaRecorder` support and actual MIME output inside iOS WebView and Android WebView.
- Verify Azure path still receives supported WAV/PCM when required.
- Verify audio playback can be started by visible user action in Listen / Review / Progress.
- Verify protected audio fetch with `credentials: same-origin` works inside WebView.
- Verify permission prompts are resolved before final Store screenshots.

Risk:

- iOS WebView microphone and playback behavior may differ from Safari.
- MIME output may differ by WebView, affecting upload / Azure evaluation paths.

## Upload / Storage

Observed:

- Upload routes exist for recordings, voice samples, and voice consent recordings.
- Storage buckets are separated by purpose.
- Upload service validates ownership, size, and MIME.
- App-owned storage references and protected replay are the intended boundary.

Checklist:

- Verify recordings upload in app-display for `record -> evaluate`.
- Verify voice sample upload for setup voice.
- Verify voice consent upload for setup voice where required.
- Verify upload MIME normalization still handles app-display output.
- Verify UI does not expose raw storage paths, object keys, signed URLs, provider ids, or raw audio.
- Verify storage upload kill switch behavior remains server-side.

Risk:

- WebView file / blob behavior may differ from Safari, especially for recorded files.

## UI / Viewport / Safe Area

Observed:

- Layout uses responsive Tailwind classes and a centered app shell.
- Current screenshots from Safari include browser chrome and are not final Store assets.
- Final screenshots should be app-display captures after Capacitor.

Checklist:

- Verify safe area around header, CTAs, audio controls, footer, and bottom navigation.
- Verify status bar appearance and content overlap.
- Verify keyboard overlap on login, script creation, and text inputs.
- Verify Home, Script creation, Listen, Record, Review, Progress, and Voice setup fit without clipped text.
- Verify app-display viewport without Safari chrome does not make the first viewport feel too sparse or too crowded.
- Verify bottom navigation / home indicator spacing before screenshot capture.

Risk:

- Removing Safari chrome changes visible vertical space and may alter screenshot composition.

## Legal / Store Readiness

Checklist:

- Confirm Privacy, Terms, Support, and Account deletion pages open from app-display.
- Confirm support/contact and deletion request copy remains accurate for v1.
- Confirm app display can navigate to legal/support pages without browser controls.
- Confirm actual deletion is not claimed as complete.
- Keep actual deletion proof as a separate explicitly approved gate.

Risk:

- Store reviewers may use app-display only; legal/support/deletion links must work without relying on Safari UI.

## Screenshot Impact

Final screenshot set:

1. Home / Practice entry
2. Script creation
3. Listen / お手本
4. Record
5. Review
6. Progress
7. Voice setup three-choice state

Checklist:

- Prepare clean demo account with safe script, model audio, normal Record state, saved Take, Review result, Progress latest/best, and existing default voice.
- Capture after Capacitor app-display preflight, not before.
- Avoid loading, error, network failure, permission prompt, file metadata, provider/internal identifiers, and overly negative warning copy.
- Run final redaction pass after capture.

## Provider Readiness

Checklist:

- Do not connect or change providers in this preflight.
- Keep OpenAI transcription / script generation, Azure pronunciation, and voice provider secrets server-side.
- Keep provider API keys out of native client and public bundle.
- Keep OpenAI custom voice entitlement and Azure/provider availability as separate gates.
- Confirm provider unavailable states do not block stored audio replay where fallback exists.

Risk:

- Native packaging must not tempt moving provider calls or secrets into client code.

## Android / Google Play

Checklist:

- Treat Android device status as human-required later if no device is available.
- Later verify Android WebView microphone permission, file upload, audio playback, protected replay, keyboard, back navigation, and safe area.
- Later verify Google Play requirements, closed testing setup, Data Safety final answers, app signing, target SDK, permissions disclosure, and screenshot sizes.
- Do not operate Play Console in this preflight.

Risk:

- iPhone Safari PASS does not prove Android WebView or Google Play readiness.

## Stop Conditions

Stop and create a separate implementation gate if any of these become necessary:

- package install
- Capacitor init or platform add
- iOS / Android project creation
- Next.js routing or build mode changes
- auth callback / redirect semantics changes
- DB schema / migration
- provider real connection or provider dashboard/API operation
- secret / env actual value inspection
- Store Console operation
- screenshot capture or image editing
- actual deletion

## Recommended Next Step

Proceed to a Capacitor introduction preflight decision: choose hosted WebView vs another architecture, decide auth/deep-link policy, list required iOS/Android permissions, and define the first non-destructive implementation checkpoint. Do not install packages or create native projects until that decision is accepted.
