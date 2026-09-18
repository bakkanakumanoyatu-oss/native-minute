# Listen actual-device install — 2026-09-17

2026-09-18 closeout: **Human A–M PASS、server read-only PASS**。[現在のcloseout](listen-human-pass-closeout.md)。下記はinstall時点の履歴。再build/install・A〜M再確認は不要。

MODE: `QSS_LISTEN_PLAYBACK_CONTROLS_ACTUAL_DEVICE_INSTALL_AND_HUMAN_CHECK`

**STAGING UPDATE INSTALLED / HUMAN CHECK PENDING / STOP.** Same iPhone 14 Plus, iOS26.2.1; install completed around 20:45 JST. P1/P2/P3/J/Gate5 remain CLOSED. Formal acceptance remains pending; no commit/push.

## Preflight and preserved WIP

Correct root `/Users/karasawatakahiro/Developer/native-minute`, branch `codex/g3-mobile-main-loop`, HEAD `910bfa46f63783966c50242b3ac6067dd4ce3f6b`; workspace guard PASS, index empty. All preexisting source hashes remained unchanged through build/install. No implementation edits, stash/reset, staging, commit or push. Protected backup and repository Supabase temp contents were not read.

- Listen product WIP: `ListenScreen.tsx`, Listen CSS, shared `lib/audio-playback-rate.ts` and Web re-export.
- Listen verification WIP: API/screen tests and `listen-playback-*` / lifecycle fixtures.
- Existing0032 WIP: `types/database.ts`, migration0032, recovery test scripts and recovery evidence; preserved separately. The five null recovery fields in `voice-upload-durable-intent.test.ts` are existing fixture compatibility, not a new Listen backend change.
- Existing acceptance documents, QA outputs and other untracked files preserved. This task adds only install evidence and documentation.

## Source, build and installed identity

Before building, local `dist` was `local-spike` at HEAD with dirty source, while native synced public assets were the previous Staging J build at `af36179...`; all previous J asset hashes matched its historical installation evidence. Device inventory showed the existing Staging app1.0/build1. Prior device bundle bytes were not extracted.

Built with `npm run mobile:sync:ios:staging`, followed by `xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Staging -sdk iphoneos -destination 'generic/platform=iOS' -derivedDataPath /tmp/qss-listen-device-install/DerivedData build`. Staging uses optimized Swift `-O`. Existing bundled public auth configuration was read into process memory and matched the approved Staging fingerprint; no server lookup or secret credential was needed.

- Bundle `com.nativeminutes.app.staging`, version1.0/build1; sourceRevision `910bfa46f63783966c50242b3ac6067dd4ce3f6b`, **sourceDirty=true**.
- Fixed Staging BFF/callback, approved public auth fingerprint, no remote `server.url`, bridge logging none.
- Web JS `index-B9mxcfpb.js`, SHA-256 `669a293ae183f5327add8e39e8f46703983d49c597087235a568a3fe0151e147`.
- CSS `index-Bo4ctn0b.css`, SHA-256 `42ab9ae0c28aedfc49cd5424c370c0967d4248ba0f08cd3a2c3ffc1c2eb5da38`.
- Executable SHA-256 `4cd19659509280366b4c0e0a13ad4b99b3f590706663236113f591cfdd3e0020`.
- All seven dist files match synced public and signed App.app byte-for-byte. Strict codesign, provisioning for the connected device, Staging associated domain, plugins and privacy manifest PASS.
- `devicectl device install app` succeeded using that exact signed App.app. Receipt installation URL matches post-install inventory; new bundle container, exactly one Staging app, same device and version/build.

Installed source identity is established by the hashed signed artifact → exact install command/receipt → matching device inventory chain. Device-side bundle bytes were not independently extracted and runtime UI was not inspected. No auto launch. Preferences file metadata is unchanged; Keychain/session contents and full app-data usability remain Human observations, not inferred PASS.

Workspace guard, root/mobile lint, mobile source/test typechecks, Staging Vite build/sync, signed native build and diff check PASS. Release guard is **NOT PASS**: exactly the same three expected dirty-source findings (two metadata predicates and one source-tree finding). No guard edit, metadata falsification or temporary commit. User explicitly authorized WIP install before Human PASS. Root Next build/typecheck, browser/unit suites and full E2E were not rerun in this packaging-only task; prior implementation verification remains recorded separately.

## Human: one Listen sequence only

- A–C: 同じ台本のListenを開く → 再生 → 一時停止。
- D–G: 「10秒戻る」→「10秒進む」→ 速度を0.85倍 → 再生し、実際に遅いことを確認。
- H–L: 再生中に別アプリへ移動 → 15分以内に戻る → 自動で音が出ないことを確認 →「再生」を1回だけ押す → 以前の位置付近から0.85倍で再開することを確認。
- M: 本文末尾までscrollし、dockが最終行を隠さないことを確認。
- 可能なら同じbuildでN–O: iPhone文字サイズを大きくしてListenを再表示し、seek/play/speedが欠けず重ならないことを確認。
- 可能ならP: VoiceOver ONで「10秒戻る」「再生/一時停止」「10秒進む」「再生速度」が別操作として読めることを確認。

Report A–M PASS or the failed letter/behavior, optional N–P results, and approximate execution time (JST). Do not request regeneration, voice setup, Share, record/evaluate or the full58. No automatic continuation to Record.

Server-side read-only correlation for additional provider generation occurs **only after Human results**. No server read in this task; earlier19:53 completed/canonical and19:56 cache-hit observations remain historical, not extended to this install. `orphan_possible=true` remains unchanged;0032/recovery/writer deployment not rerun. Migration/BFF deploy/provider/Production operations, data clear, account reset and voice registration: zero.

Evidence: [preflight source manifest](../../outputs/qss-listen-device-install/preflight-source-manifest.json), [before bundle identity](../../outputs/qss-listen-device-install/before-local-bundle-identity.json), [signed artifact](../../outputs/qss-listen-device-install/native-artifact-proof.json), [install proof](../../outputs/qss-listen-device-install/install-proof.json). **NEXT: Human A–M; remain stopped until results.**
