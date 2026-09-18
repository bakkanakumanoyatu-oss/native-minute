# Listen Human PASS / server verification / closeout — 2026-09-18

MODE: `QSS_LISTEN_PLAYBACK_HUMAN_PASS_SERVER_VERIFY_AND_CLOSEOUT`

**Listen改善枝: HUMAN ACCEPTED / CLOSED.** Formal acceptance resumes at `QSS_IPHONE14PLUS_FORMAL_ACCEPTANCE_RESUME_AFTER_P1_P3`; the full58 remains OPEN. P1/P2/P3/J/Gate5 CLOSED is unchanged. No performance optimization or template migration is started.

## Identity and preserved source

Root `/Users/karasawatakahiro/Developer/native-minute`, branch `codex/g3-mobile-main-loop`; pre-closeout HEAD `910bfa46f63783966c50242b3ac6067dd4ce3f6b`. Human used the installed Staging app on iPhone14 Plus/iOS26.2.1, bundle `com.nativeminutes.app.staging` 1.0(1).

The [install chain](listen-device-install-and-human-check.md) binds the signed app to `910bfa46 + known WIP`. The installed JavaScript hash is `669a293ae183f5327add8e39e8f46703983d49c597087235a568a3fe0151e147`; CSS hash `42ab9ae0c28aedfc49cd5424c370c0967d4248ba0f08cd3a2c3ffc1c2eb5da38`. This closeout changes no product/test/migration source bytes. The commit containing this report records the accepted WIP as-is. [Source reconciliation](../../outputs/qss-listen-closeout/source-identity.json) compares the install manifest with the closeout tree; documentation changes are listed separately. Commit SHA and remote delivery are reported after the commit, avoiding a self-referential hash inside it.

No native sync, Xcode build, install, launch, data clear or Human retest. Verification-only Vite output is isolated under `/tmp/qss-listen-closeout-validation/mobile-dist`; installed/synced/dist Staging artifacts remain unchanged. Existing `sourceDirty=true` metadata is preserved, not rewritten to claim a clean release build.

## Read-only server result

Fixed Staging `ztlliqishddrrvqqrrlu`, Supabase Management `database/query/read-only`, SELECT only using the existing CLI credential in process memory. No application Listen request, provider API, DB mutation/RPC, Storage download/change, deployment or Production operation was issued.

[Safe observation](../../outputs/qss-listen-closeout/staging-readonly.json):

- Target script fingerprint `9ccb5de6ecd81d17698d624bbeac74c2`; canonical audio fingerprint `9da54f91c6d3bb7e21a4385128c8a389`. These are MD5 equality labels over UUIDs, not security hashes. The exact target is selected through the historical recovered intent, and the canonical tuple is script + voice + cache key.
- The same owner's latest retained auth session is iPhone/Mobile, updated **2026-09-18 09:29:34.224340 JST**. Latest target event is **09:31:39.380446 JST**, `cache_hit`, `cached=true`, same canonical audio, no provider request reference. These are actual server timestamps, **not invented Human start/end times**.
- One canonical row remains, created **2026-09-17 19:53:01.252430 JST**, owned script/voice, stored metadata and exact `storageBucket/storageObjectKey` catalog row present. An initial exploratory catalog comparison used the app playback path and was corrected to the actual stored locator; no missing-object finding is asserted.
- Target `script_audio_create` intents remain exactly two: historical failed-after-provider and the completed **19:52:54 → 19:53:01** intent. Their timestamps and voice/cache matches are unchanged. Owner unresolved reserved/manual intents = **0**.
- Global audio-generation event count **15 → 16**, with the sole new target event a cache hit. **Additional recorded provider generation = 0; additional target create intent = 0.** Latest non-cache target generation is still the prior evening's successful generation. Background/return did not produce another generation event or reservation in this observed interval.
- Old failure remains `failed_after_provider`, `provider_effect=occurred`, `storage_outcome=failed`, `orphan_possible=true`; original locator, recovery evidence reference and recovery time **2026-09-17T10:14:09.364068Z** remain. Physical orphan cleanup is not claimed and its separate obligation remains.

Evidence limits: quota events do not carry an auth-session foreign key, and this ledger does not record each replay GET/background notification. Correlation uses the exact owner/script/audio, latest iPhone session, post-install cache event and Human's same-installed-build report. It establishes saved canonical/cache reuse and zero extra recorded generation, not exact Human action timestamps or a replay GET count. The unchanged inspected implementation and 46 component browser tests confirm that same-session resume reaches only authenticated saved-audio GET. There is no provider-side billing audit claim.

## Human A–M and original58 mapping

Human reports all A–M PASS: play, pause, ±10 seconds, 0.85x with audible slower playback, switch apps while playing, return within15 minutes, no autoplay, one play resumes near the prior position at0.85x, and normal-text final-line scroll without dock obstruction. Follow-up explicitly confirms **no overlapping/double audio and clear built-in speaker playback**. Exact action times were not supplied.

[mapping.md](mapping.md) and [mapping.json](mapping.json) retain all original IDs/purposes/session assignments. New original PASS: **L-01/L-03/L-04/L-07**. Existing D-01 remains PASS. **5 PASS / 0 FAIL / 2 BLOCKED / 51 NOT YET RUN**; B=4/0/2/34, A=1/0/0/0, C=0/0/0/9, D=0/0/0/7, E=0/0/0/1. Existing PS30 remains **17/0/3/10**; template-dependent6 remain separate. S-05/S-07 applicability is untouched.

- L-05 remains unjudged: Human did not report elapsed/duration display behavior or its distinction from the target60 seconds.
- L-02/L-06 still need dock/Record CTA at upper/middle/lower text positions and same-script Record transition without full-play requirement.
- L-09 retains accepted return behavior, but background-time sound stopping was not explicitly reported; internal resource release is local supporting proof. L-10 retains no-autoplay/replay evidence but its remaining pause/Record navigation conditions are unconfirmed. These composite originals are not promoted by inference.
- LP-01–07 separately record the directly accepted seek,0.85x, no autoplay, one-play position resume, retained speed, server no-regeneration and normal-text last-line criteria. All seven PASS; not added to the58 denominator.
- Dynamic Type: Human said 「文字サイズは変えられなかった」, reason unknown. **Neither PASS nor FAIL.** VoiceOver: **unjudged**. Both remain Session C; normal-text evidence is reusable.

## Scoped validation and review

[Logs](../../outputs/qss-listen-closeout/validation.json): workspace guard; root/mobile lint; root Next build and post-build typecheck; mobile source/test typechecks and isolated Vite build; **7 scoped unit suites / 62 tests**, **Listen Chromium/WebKit 46 cases**, fresh network-none PostgreSQL0001–0032 plus recovery/CAS/finalizer race cases; scoped diff check PASS with the byte-preservation exceptions below. Docker fixture removed. Historical browser screenshots were restored after this run, preserving their original evidence identity.

Focused self-review covered the accepted source diff, pending/stale playback, duplicate native/document events, exact saved audio retry, auth/owner invalidation, provider failure evidence, migration/type/fixture consistency, ownership and deletion safeguards. No new env vars/dependencies or setup changes; README remains applicable. Existing loading/error messages and route/service boundaries remain. Prior independent recovery review is retained; no new independent-agent review is claimed.

Whitespace validation: ordinary unstaged `git diff --check` passes. The strict staged check reports only the already-installed shared definition’s extra EOF blank line and literal blank context lines in the historical writer `.patch` evidence. Those bytes are preserved to honor the source/patch identity freeze. `git -c core.whitespace=-blank-at-eof diff --cached --check -- . ':!outputs/qss-listen-voice-readiness/staging-listen-writer.patch'` passes; this invocation excludes the patch artifact and tolerates the known EOF blank, without changing repository config. These are formatting exceptions, not an unqualified strict staged PASS. Documentation/log whitespace introduced during closeout is normalized.

Full58, P3 A–K, full E2E, native rebuild/install and Dynamic Type/VoiceOver were **not rerun**. Staging mutation/provider/Storage operations = **0**. `.env.local.save`, `supabase/.temp` and secret backups were not read, hashed or changed. Unknown/unrelated P1/P2/P3 QA WIP is excluded from staging.

## Delivery and release guard

Single closeout commit/normal push is authorized after these checks. It contains only the explicit [accepted file list](../../outputs/qss-listen-closeout/accepted-files.json). No product bytes are edited to obtain a new commit identity.

Before commit, Staging release guard reports the same three existing findings: web metadata mismatch, native metadata mismatch, dirty source tree. The accepted code WIP becomes committed, but the installed artifacts still truthfully identify `910bfa46 + sourceDirty:true`. Unknown/unrelated untracked WIP remains. Therefore committing alone cannot certify the existing artifact as a clean-current-HEAD release build. Post-push guard and exact HEAD/upstream/remote/ahead-behind are reported in the final delivery receipt; no guard workaround or unrelated cleanup is authorized here.

## Next Human work — B＋E remainder only

Use the [updated checklist](human-checklist.md). Reuse completed Listen/P3 evidence. Collect only Scripts readability/selection; L-02/L-05/L-06; one normal recording/preview/manual confirmation/evaluation and Review advice→next Take; one shared short rerecord/unsaved-exit check; Review/Progress interpretation/history/same-script navigation and available long-advice conditions; remaining Back/Exit/navigation and mixed Favorite/non-Favorite comparison. H-01 six experience answers use that same continuation. Do not reset permissions or manufacture error/long-content data. Missing conditions remain explicitly untested/blocked.

**NEXT_ONE_ACTION: Human performs only the remaining B＋E checklist in the existing installed Staging app and returns one combined result.** Session C/D remain separate. No full58/A–K restart, optimization or template port.
