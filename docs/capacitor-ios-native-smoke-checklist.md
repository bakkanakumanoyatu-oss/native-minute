# Capacitor iOS Native Smoke Checklist

This checklist is for human-run Xcode verification only. It does not change code, run Xcode here, start a device, add Android, operate Store Console, run `npm audit fix`, connect providers, execute actual deletion, capture final screenshots, or implement deep links / universal links.

## Scope

- App ID / Bundle ID: `com.nativeminutes.app`
- App name: `Native Minutes`
- Native target: iOS only
- Xcode workspace: `ios/App/App.xcworkspace`
- Preferred device: iPhone physical device
- Fallback: iOS Simulator
- Android: out of scope until after iOS native smoke
- Hosted WebView / `server.url`: preflight-only
- Final Store architecture: later follow-up gate

## Status Values

Use only these values when recording each item:

- `PASS`
- `FAIL`
- `BLOCKED`
- `NOT_CHECKED`

For failures, record a short safe note with no email, token, private path, raw audio path, Storage path, provider id, secret, signed URL, or raw provider response.

## Before Opening Xcode

Record status for each:

- Xcode target is `ios/App/App.xcworkspace`.
- Device choice is iPhone physical device if available, otherwise iOS Simulator.
- Android is not part of this smoke.
- `capacitor.config.ts` uses appId `com.nativeminutes.app`.
- `capacitor.config.ts` uses appName `Native Minutes`.
- `capacitor.config.ts` uses `https://native-minute.vercel.app` as preflight-only `server.url`.
- `ios/App/App/Info.plist` has display name `Native Minutes`.
- `ios/App/App/Info.plist` has microphone permission description.
- Native project does not contain provider secrets, API keys, service-role keys, tokens, or private Storage paths.

## Launch / App Display

Record status for each:

- App builds and launches from Xcode.
- App displays the hosted production URL.
- Home / Practice entry is visible.
- Bottom navigation is visible and not broken.
- Safe area and status bar do not cover critical content.
- Keyboard does not badly overlap login, script creation, or text input surfaces.
- App-display has no Safari UI, URL bar, or browser controls.

## Auth / Session

Record status for each:

- Existing production login flow can be used.
- WebView cookie / session persists after refresh or app background / foreground where practical.
- Logout and return to login works if checked.
- If magic link callback gets stuck, record `BLOCKED` and move it to the later deep link gate.
- Do not treat custom scheme / universal link completeness as a blocker for this first smoke.

## Listen / Audio

Record status for each:

- Listen screen opens for a safe demo script.
- Model voice playback starts from a visible user action.
- Audio controls remain usable in safe area.
- Protected audio replay does not expose signed URLs, Storage paths, or provider identifiers in UI.

## Record / Microphone

Record status for each:

- Record screen opens for a safe demo script.
- Microphone permission prompt appears when needed.
- Recording can start.
- Recording can stop.
- Recording preview can play.
- `この Take で評価する` can be checked if practical.
- If evaluation fails, separate provider / evaluation failure from native shell failure.
- Do not expose recording filenames, MIME / codec details, Storage paths, raw audio paths, tokens, or secrets.

## Voice Setup

Record status for each:

- `/setup/voice` opens.
- Existing-voice three-choice state is visible.
- `新しく録音して作り直す` opens the recording UI.
- Microphone permission / recording works in native shell if checked.
- Do not perform provider entitlement checks or custom voice production readiness work.

## Review / Progress

Record status for each:

- Review opens for a saved demo Take.
- Review layout is readable with no major safe-area or bottom-navigation overlap.
- Progress opens.
- Progress shows latest / best take state when demo data exists.
- Saved audio playback from Review / Progress works if checked.

## Legal Links

Record status for each:

- Privacy opens.
- Support opens.
- Account deletion request opens.
- Record whether each opens inside app-display or external browser.
- Do not run actual deletion.
- Do not claim deletion completion from this smoke.

## Screenshot Readiness

Record status for each:

- Home / Practice entry appears capture-ready.
- Script creation appears capture-ready.
- Listen appears capture-ready.
- Record appears capture-ready without file metadata.
- Review appears capture-ready without loading or overly negative warning state where possible.
- Progress appears capture-ready with latest / best take state.
- Voice setup three-choice state appears capture-ready.
- Safari UI / URL bar / browser controls are absent.
- Status bar / safe area look acceptable for later Store assets.
- Final screenshot capture is not performed in this smoke.

## Stop Conditions

Stop and record `BLOCKED` if any of these occur:

- App does not launch.
- Hosted production URL does not display.
- Auth is completely blocked.
- Microphone permission does not appear or recording cannot start.
- Listen playback cannot start by user action.
- Secret, token, private path, raw audio path, Storage path, provider id, signed URL, or service-role key appears in native project or UI.
- The preflight `server.url` would need to be treated as Store-submission-ready architecture.
- Deep link / universal link implementation becomes required.
- Xcode signing / Apple Developer registration becomes required.

## Out Of Scope

- Code changes
- Xcode execution by Codex
- Device launch by Codex
- Package install
- `npm audit fix`
- Android project creation
- Store Console operation
- Final screenshot capture
- Image editing
- Provider connection
- Actual deletion
- DB schema / migration
- Deep link / universal link implementation
