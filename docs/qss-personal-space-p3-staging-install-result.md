# P3 Staging deployment and actual-device preparation

**Latest — Human A–K acceptance is complete; P3 HUMAN APPROVED / CLOSED.** The J-only UX correction was update-installed and its six-step recheck confirmed by Human. See [P3 closeout](qss-personal-space-p3-checkpoint.md) and [J correction](qss-personal-space-p3-j-finding.md). The remaining sections preserve the initial deployment/install evidence and then-pending acceptance state; their pending statements are historical. Cross-user live proof remains unverified.

2026-09-17 — `QSS_PERSONAL_SPACE_P3_STAGING_DEPLOY_AND_ACTUAL_DEVICE_PREP`

**Staging migration + scoped BFF deployment + signed iPhone update install completed.** P3 remains **IMPLEMENTED / STAGING_DEPLOYED / ACTUAL_DEVICE_PENDING**, not CLOSED. Live authenticated mobile audio and cross-user checks remain unverified; they are not included in the smoke PASS count. Human acceptance A–K has not run. Stage/commit/push = **0/0/0**.

## Authorization and preflight

Human explicitly approved only migration0031 on Staging, required P2/P3 BFF deployment to Staging, and update-install of the signed Staging app on iPhone 14 Plus. No Production or Provider configuration/destructive work.

Correct Developer root; branch `codex/g3-mobile-main-loop`; HEAD/upstream both `af36179fd8e720e6b9fa8dcc11138dc43473db0b`; ahead/behind 0/0; index empty; diff-check PASS. Tracked changes matched the known P3 WIP. Prior 232 untracked P1/P2 QA artifacts and protected `.env.local.save` / repository `supabase/.temp/` were untouched. CLI link/migration operations used a separate task directory under `/tmp/qss-p3-staging-ops`.

## Positive Staging identity

| Boundary | Verified identity |
| --- | --- |
| Supabase environment | `native-minute-staging`, ACTIVE_HEALTHY |
| Project ref / region | `ztlliqishddrrvqqrrlu` / `ap-northeast-1` |
| Pre-apply ledger | exact 0001–0030; only0031 pending |
| Vercel project | `native-minute-staging` / `prj_RSxUzxugEIlH28tiQOyndjP365hw` |
| Fixed BFF domain | `https://native-minute-staging.vercel.app` |
| Vercel slot | `production` **inside that Staging project**, its existing fixed-domain slot; not the separate Production product/project |
| iOS identity | `com.nativeminutes.app.staging`, Xcode Staging, approved Staging public auth fingerprint |

No connection to the Production app/DB/project, Production deployment, provider setting change, deletion, guard enablement or destructive provider call was performed. Vercel CLI's slot label `Production` in its output must not be confused with the product Production environment.

## 0031 result

Exact committed `0031_take_personal_metadata.sql`, SHA-256 `f7b8d75b371635b9ebb63a308faa1f64dd1cf7d1277955699cbe194d887214c4`, copied byte-for-byte with existing migrations to the isolated CLI workdir. Official dry-run selected only0031, no seed/role/vault work. Normal `db push --linked --skip-vault --yes` applied it once.

Post-apply ledger is exact **0001–0031**,0031 once, pending0. Verified `favorite boolean NOT NULL DEFAULT false`, nullable `display_name text`, length1–60 / trimmed / no-control-character constraint and RLS still enabled. All6 existing Takes received false/null defaults. Original Take fields' aggregate fingerprint and counts match before/after; scripts10, coach_feedback6, weak_words21 likewise match. No real-user metadata edit or test data creation.

## Exact deployment scope

Baseline: actual fixed-domain deployment `dpl_8F4BiKEDkFVmHoP48ugi7twdke3j`. Its exact source was reconstructed from matching Git object contents, using the deployment's source SHA-1 manifest. This avoided redeploying unrelated newer Gate5/backend work from the checkout.

Applied the committed P2 backend patch plus the4 new P3 server files. **Only14 source files differ**:

- `app/api/mobile/takes/[takeId]/metadata/route.ts`, `app/api/mobile/takes/[takeId]/audio/route.ts`
- `lib/mobile/api-response.ts`, `lib/mobile/contracts.ts`, `lib/mobile/dto.ts`, `lib/mobile/take-metadata-route.ts`, `lib/mobile/take-audio-route.ts`
- `lib/take-audio-format.ts`, `schemas/take-metadata.ts`
- `services/progress/progress.service.ts`, `services/progress/types.ts`
- `services/takes/take-metadata.service.ts`, `services/takes/take-audio.service.ts`, `types/database.ts`

Existing ownership/download implementation and unrelated backend files, dependencies, Gate5/provider settings are preserved from the prior deployment. No public audio URL. Scoped source passed Next build, lint/type validation. CLI upload dry-run contained658 source files, no `.env.local`, backups, repository temp, node_modules or generated `.next` upload. After deployment, all658 source SHA-1 values matched the dry-run manifest.

Deployment: **`dpl_DFFwoCYpuF8UbdeSe8ArTHJzCiBe`**, READY. Fixed Staging domain positively resolves to this deployment. No git commit/push was used to deploy.

## Smoke evidence and explicit gaps

Live fixed-domain checks **8/8 PASS**: health200; audio/metadata/progress missing-Bearer401; audio invalid-Bearer401; untrusted Origin403; audio GET preflight204; metadata PATCH preflight204. Protected responses remain private/no-store. Metadata request used empty payload and was rejected before mutation.

Existing logged-in Web session opened the authenticated `/progress` screen successfully, with1 owned Script and no saved Take. This is Web-cookie read evidence, not a mobile Bearer audio success. No current user Bearer token was extracted or minted, no login link sent, no account impersonated. Therefore **valid-user mobile Take/audio retrieval, authenticated cross-user live rejection and actual Favorite/Rename persistence are NOT LIVE VERIFIED** in this wave. Wrong-owner/excluded-asset behavior is supported by the prior direct route/service tests; that is not substituted for live proof. These gaps remain visible for Human actual-device acceptance and any subsequent authorized A/B smoke.

## App build, guard and install

Staging public publishable key was read via the exact project's official CLI into process memory only, fingerprint-checked against the approved profile, then supplied only to the mobile build process. No secret/service-role key was supplied to the mobile build. Build/sync use source baseline plus P3 WIP; metadata truthfully records `sourceDirty: true`.

Native `xcodebuild` Staging / iphoneos / generic iOS destination: **BUILD SUCCEEDED**. Bundle `com.nativeminutes.app.staging`, version1.0/build1; correct BFF and callback, authConfigured=true, approved auth fingerprint. SharePlugin + FilesystemPlugin present; FileTimestamp C617.1 privacy manifest packaged; bridge logging none; no Debug scheme/server.url. Strict codesign passed, provisioning application identifier matches and includes the connected iPhone14 Plus, exact Associated Domain matches Staging. Artifact executable SHA-256: `9911e5a624745b1907244583b9ec3ee3e73e255512552cec98867dfbe8e6de9a`.

**Release guard is NOT PASS.** The unchanged existing Staging guard requires a committed clean source tree. It returned exactly3 expected findings for this explicitly authorized uncommitted build:2 `staging_build_metadata_mismatch` (only sourceDirty predicate fails) and1 `staging_source_tree_dirty`. All other guard categories were clear. No sourceDirty metadata falsification, temporary commit, guard edit or disabled check. This wave follows the Human's explicit WIP-install + no-commit instruction; it is a controlled test install, not a clean release artifact. Signing/release guard self-tests passed. Independent artifact identity/signature/privacy/plugin checks passed.

`devicectl device install app` returned **success** on the connected iPhone14 Plus / iOS26.2.1. Same existing Staging bundle ID; post-install inventory contains exactly1 copy. No uninstall, app-data clear, account reset, device reset or auto launch. Existing app Preferences file size/modification metadata is identical before/after; contents/Keychain session and full app-data usability were not read and remain Human confirmation. Do not claim byte-for-byte preservation of every app data item from this limited check.

## Human next steps — one continuous A–K run

1. Open **Native Minutes** on the iPhone. Use the installed Staging app, not the browser QA fixture. If a login screen appears, use the usual Staging login.
2. A: Home's 「自分の録音」/「録音履歴へ」 → select your saved Take. If none exists, complete the usual record/evaluate/save flow first.
3. B: Tap 「▶ 自分の録音を再生」. After loading, press the audio player's ▶ and confirm actual sound.
4. C: 「名前をつける」 → enter name → 「保存」; tap 「♡ お気に入り」.
5. D: Leave/reopen the Take and verify name/Favorite persistence.
6. E–G: 「共有」 → iOS Share Sheet → 「ファイルに保存」 → select folder/save. Open Files and play the exported audio.
7. H: Return to Native Minutes; verify Take/name/Favorite/score/automatic Best unchanged.
8. I: Share again, then cancel/close the sheet; verify normal return.
9. J: My Takes → same Take → playback and Share available.
10. K: 「練習を終了（Home）」 → verify Home and Favorite/Take preview.

Report A–K PASS or the failing letter and observed behavior. No automatic app operation follows installation. Human actual-device PASS alone permits P3 HUMAN APPROVED / CLOSED and the subsequent one commit + normal push. Enlarged text and VoiceOver remain formal acceptance evidence, not PASS inferred here.

Safe evidence: `outputs/qss-personal-space-p3/staging/`. NEXT_ONE_ACTION: **Human actual-device A–K acceptance**; live mobile success and ownership gaps remain explicitly pending.
