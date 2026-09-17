# P3 J actual-device UX finding

2026-09-17 — **J HUMAN PASS / P3 HUMAN APPROVED / CLOSED**. After A–I and K, Human confirmed all six J recheck steps on the updated Staging app. Only the J playback/share finding was changed. The implementation/install record below describes the pre-acceptance work (stage/commit/push 0/0/0 at that time); the authorized one-commit closeout is recorded in [P3 checkpoint](qss-personal-space-p3-checkpoint.md).

## Cause and bounded change

The initial playback button downloaded audio and revealed controls without calling `play()`. The button then disappeared, while an adjacent Share text button had no separating gap. This made two actions look continuous and Share appear to arrive later.

Product changes are limited to `apps/mobile/src/screens/SavedTakeAudio.tsx` and its styles in `apps/mobile/src/styles.css`:

- Keep the audio element mounted and start playback after the owned download completes. The source is assigned once so rendering does not interrupt the pending play request.
- Keep the playback and Share actions visible in a two-column row with a 24px gap; show the player below them. Share retains its position before/after player expansion.
- If playback is rejected, retain the loaded audio and display an explicit retry message. A subsequent tap calls play without downloading again.
- Preserve navigation cleanup/generation invalidation and the existing Share handler/controller. No Home, Favorite, persistence, navigation, schema or backend changes.

Installed Capacitor iOS sets `mediaTypesRequiringUserActionForPlayback = []`; no native playback policy was changed. Browser success does not establish actual iPhone audio output.

## Verification and update install

- Workspace/baseline preflight matched the prior P3 source manifest; unknown tracked changes 0; index empty; HEAD/upstream remain `af36179fd8e720e6b9fa8dcc11138dc43473db0b`.
- Root/mobile lint and typecheck PASS; Next build, Staging mobile build/sync, signed Staging iphoneos build PASS.
- Existing Share/API/object-URL tests: 26 PASS. Existing P3 browser conditions: 44 PASS, now asserting playback progression without a test-injected play call.
- J: Chromium and WebKit × 320/428px × 100/200% text, 8 configurations PASS. Covers one-tap playback after delayed fetch, separated actions/stable Share position, cancellation preserving Take data/route, denied-play retry, Share before playback, and leaving during fetch without hidden playback. API/audio/Share adapters are synthetic; this is not native Share Sheet proof.
- Strict signature, provisioning/device, Staging identity, Share/Filesystem plugins, packaged privacy manifest and actual J web assets PASS. Existing release guard reports the same 3 clean-source findings for the authorized uncommitted WIP; NOT PASS and not bypassed by changing guards/metadata.
- Updated existing `com.nativeminutes.app.staging`, version 1.0/build 1, on iPhone 14 Plus successfully. Preferences file metadata unchanged; no uninstall/data clear/reset/auto launch. Full local-state usability remains Human observation.
- Production operations, provider operations, backend deploys and schema changes in this correction: 0.

Evidence: `outputs/qss-personal-space-p3/j-browser-results.json`, `staging/j-native-artifact-proof.json`, `staging/j-install-proof.json` within the same output directory. Initial A–K/install instructions in the earlier deployment report are historical; use the J-only steps below now.

## Human J-only recheck

Completed by Human: open the updated Staging app → Home 「自分の録音」/「録音履歴へ →」 → select the target recording's 「結果を見る →」 → 「▶ 自分の録音を再生」 once → actual sound starts after loading → separate 「共有」 → iOS Share Sheet → cancel/close → return to the same recording's result screen. No A–I/K rerun was requested. J is accepted; the prior no-commit gate is satisfied.
