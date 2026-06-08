# Store Release Mainline Inventory

Native Minute is now tracked as a `store-release-mainline`: the long-term target is App Store and Google Play listing, while the current work stays on the Next.js Web core until the release gates make native packaging worthwhile.

This document is docs-only. It does not change auth, DB schema, API contracts, providers, Capacitor, infrastructure, or deployment state.

## Current Position

- The fixed 1-minute practice main loop is working well in production-style use: Home, `/scripts`, `/scripts/new`, Listen, Record, Review, and Progress have no major known UX blocker.
- UI/UX improvement is paused as a phase. The product should now move from "make it easier to use" to "make it safe, operable, and reviewable for public release."
- Recent speed work has improved perceived performance: selected-script summaries, Review loading consolidation, lazy Progress audio players, protected audio feedback, and staged evaluate feedback are in place.
- Gate 0 auth callback failure fix `0bd55b4 Fix auth callback login redirect handling` is reflected in the production latest deploy. Human browser smoke is `PASS`; `/login`, new email login, `/scripts`, clean new-account state, `/progress` initial state, refresh session persistence, logout -> new magic link -> login, and the prior `callback_failed` / `/login` 404 / `/_next/static` 404 chain are resolved.
- The next decisions should be evidence and operations decisions, not broad UI polish or provider implementation.

## Git / Deploy Snapshot

- Store release inventory started at `10e4c83 Add staged feedback for evaluate wait`.
- Gate 1 Web beta smoke evidence is pushed at `4e99304 Record Gate 1 web beta smoke pass evidence`.
- Local `main` and `origin/main` had no diff before this Gate 1.5 docs/design work.
- No staged, unstaged, or untracked changes were present before this Gate 1.5 docs/design work.
- Git alone does not prove deployment state; Gate 1 production smoke evidence is the human-confirmed production record.

## Gate Map

### Gate 0: Auth Callback Failure Production Smoke

Goal: verify the production auth recovery path after the callback failure fix before returning to Store release planning.

Status: `PASS` for production latest deploy with commit `0bd55b4`. Safe evidence is recorded in `outputs/store_release_gate0_auth_callback_production_human_smoke/gate0_auth_callback_production_human_smoke.json`.

Confirmed:

- production latest deploy reflected the fix
- `/login` opens
- new email login works
- `/scripts` opens after login
- new account does not show old records
- `/progress` starts from an initial state
- refresh keeps the session
- logout -> new magic link -> login works
- `callback_failed` / `/login` 404 / `/_next/static` 404 chain is resolved
- Safari old-record visibility was treated as an old session / cookie issue; Chrome clean session confirmed a new-account state

### Gate 1: Web Production Core / Web Beta Deploy Smoke

Goal: prove the current Web core is deployed, usable, and recoverable.

Gate 1 smoke checklist and safe evidence templates are fixed in `docs/store-release-gate1-web-beta-smoke.md` and `outputs/store_release_gate1_web_beta_smoke/`.

Status: `PASS` for the human-confirmed Web beta production smoke on Vercel Production / Current, build ref `b5c10e8`. Evidence is recorded in `outputs/store_release_gate1_web_beta_smoke/gate1_web_beta_smoke_evidence_b5c10e8.md` and `.json`. Exact deploy timestamp and exact device/browser remain `unknown`.

Confirm:

- production URL
- commit or build ref
- login and refresh session
- script creation
- listen and protected model audio replay
- record and upload
- evaluate
- review
- progress
- second take on the same script
- latest / best / progress continuity
- provider env and kill switch readiness
- no secret, raw provider response, raw audio, signed URL, or raw storage path appears in UI or docs

### Gate 1.5: Voice Consent / Clone Voice / Brush-up Server-Side Architecture Review

Goal: review voice consent, sample audio, clone voice, Brush-up, provider identifiers, storage, replay, and cleanup architecture before expanding Store-facing voice functionality.

This is an architecture review gate, not a provider implementation gate.

Status: design review is captured in `docs/store-release-gate1_5-voice-brushup-architecture.md`. Brush-up is treated as a v1 adoption candidate, but implementation requires later schema/API/provider/UI work.

### Gate 2: Privacy / Terms / Consent / Delete

Goal: make privacy, terms, consent, support, and account deletion accurate enough for public distribution and store review.

Status: design plan is captured in `docs/store-release-gate2-privacy-consent-deletion-plan.md`. Brush-up v1 requires explicit script-scoped consent before a selected best take is used as voice material, separate from normal recording/evaluation consent. Revoke and account deletion must cover provider cleanup, app-owned Storage, DB rows, generated Brush-up audio, and saved pins.

Store submission remains blocked until account/data deletion completion is proven with a disposable live proof and App Privacy / Google Data Safety answers match the final implemented behavior.

### Gate 3: OpenAI / Azure / ElevenLabs Provider Production Readiness and Cost Guard

Goal: verify production provider roles, env, budget controls, kill switches, monitoring, and safe failure recovery.

Status: checklist/design plan is captured in `docs/store-release-gate3-provider-readiness-cost-guard.md`. Repo confirms provider guard, preflight scripts, kill switches, safe provider boundaries, app-owned replay, and non-blocking quota metadata. Store v1 still requires refreshed human confirmation for dashboard/billing/quota/model availability, production env presence, kill-switch operation, provider retention/deletion behavior, and provider cleanup proof.

Human confirmation package and safe evidence templates are captured in `docs/store-release-gate3-human-confirmation-package.md` and `outputs/store_release_gate3_human_confirmation/`. They separate repo-confirmed facts, human-confirmation-required items, confirmed-by-human status, unknowns, warnings, and blockers without recording secrets, raw provider bodies, private user data, transcript text, audio paths, provider identifiers, or billing details.

Human confirmation result: `WARN`. OpenAI / Azure / ElevenLabs / Supabase / Vercel main dashboard / env / logs / storage surfaces are human-confirmed, but provider-specific kill switch gaps, Azure alert setup, Azure Pronunciation Assessment and mobile/WebView audio risk, ElevenLabs cleanup / retention / Brush-up feasibility, Supabase protected replay, and account deletion cleanup proof remain open.

Gate 3 WARN follow-up queue and Gate 3.5 entry criteria are captured in `docs/store-release-gate3-warn-followup-queue.md` and `outputs/store_release_gate3_warn_followup_queue/gate3_warn_followup_queue.json`. Gate 3.5 implementation must not start until ElevenLabs Brush-up feasibility, cleanup, retention, cost/latency/retry, ElevenLabs kill-switch proof, and Brush-up-aware account deletion cleanup proof are closed or explicitly deferred to v1.1.

Brush-up v1 deferral decision is captured in `docs/store-release-brush-up-v1-deferral-decision.md` and `outputs/store_release_brush_up_v1_deferral_decision/brush_up_v1_deferral_decision.json`. Brush-up is no longer a v1 Store release blocker; Brush-up-specific provider cleanup, retention, revoke/delete, script-scoped voice material, account deletion proof, and cost/latency/retry work move to v1.1 entry criteria.

Gate 3.5 v1 core readiness and release scope lock are captured in `docs/store-release-gate3-5-v1-core-readiness.md` and `outputs/store_release_gate3_5_v1_core_readiness/gate3_5_v1_core_readiness.json`. v1 includes the fixed practice loop, normal voice setup/model audio, provider readiness, privacy/deletion readiness, support, and release QA. v1 excludes Brush-up UI, best-take provider submission, script-scoped voice variants, Brush-up generated candidates, and Brush-up-specific cleanup/deletion proof.

Gate 4a v1 privacy / consent / deletion implementation planning is captured in `docs/store-release-gate4a-privacy-consent-deletion-implementation-plan.md` and `outputs/store_release_gate4a_privacy_consent_deletion_implementation_plan/gate4a_privacy_consent_deletion_implementation_plan.json`. It fixes the v1 implementation targets for Settings / Account, Privacy Policy, Terms, Support, recording consent, AI provider notice, normal voice sample / consent recording notice, account deletion request / proof, and Store disclosure source notes. Brush-up consent, revoke, best-take provider submission, script-scoped voice variants, and Brush-up cleanup proof remain v1.1.

Gate 4b v1 privacy / terms / support scaffold is captured in `docs/store-release-gate4b-privacy-terms-support-scaffold.md` and `outputs/store_release_gate4b_privacy_terms_support_scaffold/gate4b_privacy_terms_support_scaffold.json`. Existing `/privacy`, `/terms`, `/support`, `/support/account-deletion`, and `/settings` surfaces now use v1 release candidate draft copy, mark final human approval as required, and state that account deletion is request / dry-run / proof-prep only. No actual deletion, provider cleanup, DB cleanup, Auth deletion, env, dashboard, infra, Capacitor, or Brush-up work was performed.

Gate 4c v1 consent / provider notice UI is captured in `docs/store-release-gate4c-consent-provider-notice-ui.md` and `outputs/store_release_gate4c_consent_provider_notice_ui/gate4c_consent_provider_notice_ui.json`. Listen, Record, Review, and setup voice now include short release candidate draft notices for recording use, OpenAI transcription, Azure pronunciation evaluation, AI coaching / feedback, normal model audio, voice samples / consent recordings, app-owned Storage, server-side provider boundaries, and legal/support links. Brush-up remains v1.1 deferred and is not claimed as a v1 feature.

Gate 4d account deletion request / dry-run proof scaffold is captured in `docs/store-release-gate4d-account-deletion-request-dry-run-proof.md` and `outputs/store_release_gate4d_account_deletion_request_dry_run_proof/gate4d_account_deletion_request_dry_run_proof.json`. Existing Settings, support account deletion page, account deletion panel, account API routes, and account deletion service boundaries now have a documented v1 request / confirmation / dry-run / proof-first shape. The UI names v1 dry-run categories and proof phases, while actual deletion, Auth deletion, Storage deletion, DB destructive cleanup, provider cleanup execution, schema/API/env/infra changes, and Brush-up remain out of scope.

Gate 4e disposable account deletion proof checklist / operator proof package is captured in `docs/store-release-gate4e-disposable-account-deletion-proof-checklist.md` and `outputs/store_release_gate4e_disposable_account_deletion_proof_checklist/gate4e_disposable_account_deletion_proof_checklist.json`. It defines the disposable test account data setup, request / confirmation / dry-run capture sequence, safe proof package fields, redaction rules, and actual-deletion implementation blockers. It stops before actual deletion and does not change Auth, Storage, DB, provider cleanup, schema/API/env/infra, Capacitor, Store submission, or Brush-up.

Gate 4f account deletion actual implementation planning is captured in `docs/store-release-gate4f-account-deletion-actual-implementation-plan.md` and `outputs/store_release_gate4f_account_deletion_actual_implementation_plan/gate4f_account_deletion_actual_implementation_plan.json`. It inventories the existing request UI, status UI, dry-run routes/services, and guarded actual service boundaries, then fixes the v1 destructive boundary and recommended order: provider cleanup, Storage cleanup, DB cleanup, Supabase Auth deletion, post-delete verification. It does not execute deletion or change Auth, Storage, DB, provider cleanup, schema/API/env/infra, Capacitor, Store submission, or Brush-up.

Gate 4g account deletion dry-run service hardening is captured in `docs/store-release-gate4g-account-deletion-dry-run-hardening.md` and `outputs/store_release_gate4g_account_deletion_dry_run_hardening/gate4g_account_deletion_dry_run_hardening.json`. `runAccountDeletionJobDryRun` now returns a safe `summary` that aligns Gate 4e proof categories with coverage, skipped actual stages, deferred Brush-up items, human-required confirmations, blockers, operator checklist items, and redaction rules. Settings shows this safe summary without adding actual deletion power.

Gate 4h disposable account dry-run proof capture is recorded in `docs/store-release-gate4h-disposable-account-dry-run-proof-capture.md` and `outputs/store_release_gate4h_disposable_account_dry_run_proof_capture/gate4h_disposable_account_dry_run_proof_capture.json`. Initial result: `BLOCKED: needs_human_disposable_account`. Re-run evidence now treats `+delete-test` as a disposable account candidate with human login PASS, human-created account deletion request, human-completed typed confirmation, visible request / confirmed timestamps, provider / Storage / database / Auth still pending, and human-observed safe dry-run summary. Current result in `outputs/store_release_gate4h_disposable_account_dry_run_proof/gate4h_disposable_account_dry_run_proof.json`: `PASS: human_observed_safe_dry_run_summary`. Safe summary includes inventory displayed, database counts mostly 0, Storage counts 0, provider cleanup not_needed / count 0, Storage cleanup not_needed / listed 0 / known 0, DB cleanup required dry-run only, `accountDeletionRequests` retain_anonymized / required / count 1, Auth cleanup waiting_for_db_cleanup, request runnable yes, service role available, auth account present, missing coverage 0, blockers none, and actual_deletion_not_run. The proof package records only safe alias / status / reason codes and stops before actual deletion.

Gate 4h / 4i follow-up copy polish updated Settings / Account deletion wording non-destructively. The UI now explains request creation, typed confirmation, safe count summary, redaction boundaries, and future provider / Storage / DB / Auth cleanup in user-facing Japanese, while avoiding claims that deletion has completed. No deletion API/service logic, actual deletion, Auth deletion, Storage deletion, DB destructive cleanup, provider cleanup, env/dashboard operation, or Store Console work was changed.

Gate 4h / 4i follow-up copy production smoke is human-confirmed `PASS` on production `/settings`. No misleading completion wording such as "削除済み", "完全に削除されました", "今すぐ削除", or "実削除完了" was observed. The request creation, typed confirmation, safe count summary, actual deletion as a separate gate, and raw-data non-display boundaries are clearer. Before Store submission, final copy polish remains `human_required / before_store_submission` for draft labels, mixed English technical labels, and final human approval wording. No actual deletion, Auth deletion, Storage deletion, DB cleanup, provider cleanup, screenshot capture, Store Console operation, or Capacitor work was performed.

Gate 4i privacy / support / deletion release QA smoke checklist is captured in `docs/store-release-gate4i-privacy-support-deletion-release-qa-checklist.md` and `outputs/store_release_gate4i_privacy_support_deletion_release_qa_checklist/gate4i_privacy_support_deletion_release_qa_checklist.json`. It defines human-confirmation-free QA targets for `/privacy`, `/terms`, `/support`, `/support/account-deletion`, `/settings`, record, listen, review, `/setup/voice`, footer / legal links, and Store submission support/privacy/deletion URL checks. Gate 4h safe dry-run proof is now human-observed PASS; actual deletion and destructive cleanup stay in later explicitly approved gates.

Gate 4j provider kill switch readiness is captured in `docs/store-release-gate4j-provider-kill-switch-readiness.md` and `outputs/store_release_gate4j_provider_kill_switch_readiness/gate4j_provider_kill_switch_readiness.json`. OpenAI, Azure, and ElevenLabs provider call guards were repo-confirmed. Storage upload kill switch readiness now accepts both the existing canonical `NATIVE_MINUTE_DISABLE_STORAGE_UPLOADS` and the alternate `NATIVE_MINUTE_DISABLE_STORAGE_UPLOAD` alias, without changing Vercel env or running provider/dashboard/destructive operations.

Gate 4k provider kill switch smoke evidence is captured in `docs/store-release-gate4k-provider-kill-switch-smoke-evidence.md` and `outputs/store_release_gate4k_provider_kill_switch_smoke_evidence/gate4k_provider_kill_switch_smoke_evidence.json`. Local dummy-env `production:preflight` smoke confirms OpenAI, Azure, ElevenLabs, Storage upload canonical, and Storage upload alias kill switches are detected without provider API calls. Baseline unset / false cases remain off. Vercel env, dashboards, provider APIs, deletion, DB, Storage cleanup, provider cleanup, Brush-up, and Capacitor were not touched.

Gate 4l release blocker / remaining human action summary is captured in `docs/store-release-gate4l-release-blocker-human-action-summary.md` and `outputs/store_release_gate4l_release_blocker_human_action_summary/gate4l_release_blocker_human_action_summary.json`. It classifies remaining v1 blockers into human-required, Codex-can-proceed, disposable-account, dashboard/env, legal/support approval, future destructive approval, Gate 6 QA, and v1.1 defer buckets. Gate 4h safe dry-run proof is now human-observed PASS, while future actual deletion proof remains a separate destructive approval gate and Brush-up stays outside v1 release scope.

Gate 5a release QA smoke execution plan is captured in `docs/store-release-gate5a-release-qa-smoke-execution-plan.md` and `outputs/store_release_gate5a_release_qa_smoke_execution_plan/gate5a_release_qa_smoke_execution_plan.json`. It defines the v1 QA scope, environment matrix, status values, Gate 4h dependencies, Gate 6 handoff items, execution order, and safe evidence package shape. It is planning only: no QA run, disposable account proof rerun, provider call, env/dashboard operation, deletion, cleanup, Capacitor, or Store submission occurred.

Gate 5b Store metadata / reviewer instructions / App Privacy and Google Data Safety draft mapping is captured in `docs/store-release-gate5b-store-metadata-reviewer-privacy-draft.md` and `outputs/store_release_gate5b_store_metadata_reviewer_privacy_draft/gate5b_store_metadata_reviewer_privacy_draft.json`. It drafts v1 Store metadata, reviewer flow, data use purposes, data safety mapping, human-required final answers, screenshot candidates, age/category considerations, and claims to avoid. It is human-review-required draft only; no Store Console operation, final privacy/data safety submission, screenshot/icon creation, Capacitor work, deletion, cleanup, provider call, env/dashboard operation, or Brush-up occurred.

Gate 5c screenshot candidate plan / reviewer evidence template is captured in `docs/store-release-gate5c-screenshot-reviewer-evidence-template.md` and `outputs/store_release_gate5c_screenshot_reviewer_evidence_template/gate5c_screenshot_reviewer_evidence_template.json`. It defines v1 screenshot candidate surfaces, safe caption directions, Store claims to avoid, reviewer evidence fields, reviewer flow, and the difference between internal QA evidence and Store reviewer evidence. It is planning/template only; no screenshot capture, image generation, Store Console operation, Capacitor work, deletion, cleanup, provider call, env/dashboard operation, or Brush-up occurred.

Gate 5d reviewer instructions / evidence package draft is captured in `docs/store-release-gate5d-reviewer-instructions-evidence-package.md` and `outputs/store_release_gate5d_reviewer_instructions_evidence_package/gate5d_reviewer_instructions_evidence_package.json`. It turns the reviewer flow into practical draft instructions, defines reviewer account placeholders, evidence package fields, safe test script guidance, provider unavailable expectations, and show / do-not-show boundaries. It is draft/template only; no reviewer account creation, password recording, Store Console operation, screenshot capture, QA run, deletion, cleanup, provider call, env/dashboard operation, Capacitor work, or Brush-up occurred.

Gate 5e Store asset capture plan is captured in `docs/store-release-gate5e-store-asset-capture-plan.md` and `outputs/store_release_gate5e_store_asset_capture_plan/gate5e_store_asset_capture_plan.json`. It defines the Store asset preparation scope, recommended screenshot sets, caption candidates, claims to avoid, capture prerequisites, screenshot evidence template, and redaction boundaries. It is planning/template only; no screenshot capture, image generation, app icon creation, Store Console operation, QA run, deletion, cleanup, provider call, env/dashboard operation, Capacitor work, or Brush-up occurred.

Gate 5f Store asset capture readiness check is captured in `docs/store-release-gate5f-store-asset-capture-readiness-check.md` and `outputs/store_release_gate5f_store_asset_capture_readiness_check/gate5f_store_asset_capture_readiness_check.json`. Gate 0 production human smoke PASS is a ready prerequisite, and the screenshot candidate set, safe caption pool, redaction rule, human-confirmed `/privacy`, `/support`, and `/support/account-deletion` URLs, unified support contact email, human-confirmed app name/subtitle, human-confirmed demo script, v1 scope boundary, Brush-up v1.1 deferral boundary, and Store claim safety list are ready. Actual screenshot capture is not ready until final copy, reviewer or clean demo account, mobile/device selection, platform-specific asset requirements, legal/support approval, final redaction review, and final URL validity are human-confirmed. No screenshot capture, image generation, app icon creation, Store Console operation, Capacitor work, deletion, cleanup, provider call, env/dashboard operation, voice provider connection, or Brush-up occurred.

Support contact update: public support contact is unified to `nativeminutes.support@gmail.com`. Human check confirmed `/privacy`, `/support`, and `/support/account-deletion` open successfully, and the legacy personal support contact mismatch is fixed without recording the legacy raw value in new evidence.

Store metadata candidate update: app name / subtitle are user human-confirmed candidates for Store assets as `Native Minutes` / `1分間のナチュラル発音トレーニング`. This records a Store metadata candidate only; it does not rename existing `Native Minute` docs references, package/project/repository names, routes, DB, or env names.

Demo script candidate update: Store / screenshot / reviewer demo script is recorded as a user human-confirmed candidate. It is neutral original practice copy with no personal data, no copyrighted excerpt, no Brush-up v1 claim, no voice clone improvement v1 claim, and no guaranteed-outcome Store claim.

Reviewer account update: reviewer account candidate is `nativeminutes.support+reviewer@gmail.com`, with verification status `human_required_deferred`. Defer reason is temporary email / magic link rate-limit risk after repeated login attempts. Supporting evidence: `+demo` and `+delete-test` plus-address login flows have already passed. Final reviewer account login must be confirmed before Store submission / reviewer instructions finalization.

Gate 5g mobile / device selection and platform asset requirements plan is captured in `docs/store-release-gate5g-mobile-device-selection-asset-requirements.md` and `outputs/store_release_gate5g_mobile_device_selection_asset_requirements/gate5g_mobile_device_selection_asset_requirements.json`. It defines iPhone / Android / desktop fallback capture candidates, minimum and optional screenshot sets, per-device capture targets, and current `human_required / unknown` platform checks. It does not capture screenshots, generate images, create app icons, operate Store Console, introduce Capacitor, retry reviewer login, resend magic links, execute deletion, cleanup providers, call provider APIs, or change env/dashboard state.

Store release readiness checkpoint is captured in `docs/store-release-readiness-checkpoint.md` and `outputs/store_release_readiness_checkpoint/store_release_readiness_checkpoint.json`. Non-destructive readiness is organized as complete for Gate 0 production smoke, Gate 4h human-observed safe dry-run proof, account deletion copy production smoke, support contact / URL checks, Store metadata candidates, demo script candidate, `+demo` / `+delete-test` login, and Gate 5e / 5f / 5g asset planning. Remaining human-required or deferred items are reviewer account final login verification, final copy polish, screenshot capture, app icon, Store metadata finalization, App Privacy / Google Data Safety final answers, Apple Developer / Google Play Console readiness, Google closed testing testers, actual deletion proof as a separate destructive gate, Capacitor, and release QA. No actual deletion, Store Console operation, screenshot capture, app icon creation, Capacitor work, DB / Auth / Storage cleanup, provider cleanup, env/dashboard operation, provider API call, or Brush-up work was performed.

Store release final copy polish plan is captured in `docs/store-release-final-copy-polish-plan.md` and `outputs/store_release_final_copy_polish_plan/store_release_final_copy_polish_plan.json`. It identifies public copy that still needs pre-submission polish, especially footer, Settings, Privacy, Terms, Support, and Account deletion wording that exposes `draft`, `release candidate`, `human_required`, Gate / smoke / proof / cleanup / destructive, or similar internal planning terms. It keeps Store claim safety explicit: no guaranteed improvement, perfect pronunciation scoring, medical/institutional assessment, Brush-up v1 availability, voice clone improvement v1 availability, best-take provider submission v1, complete deletion before proof, or native-app claim before Capacitor. No screenshot capture, Store Console operation, App Store Connect / Google Play Console operation, Capacitor work, app icon creation, actual deletion, DB / Auth / Storage cleanup, provider cleanup, env/dashboard operation, provider API call, reviewer login retry, or magic link resend was performed.

Final copy polish small pass is now applied to footer, Settings, Privacy, Terms, Support, Account deletion, the account deletion panel, and provider / consent notices. Public copy now avoids the main internal planning labels from the plan and explains deletion request creation, typed confirmation, safe count summary, and the separate actual deletion path in user-facing language. No deletion API/service logic, actual deletion, Auth deletion, Storage deletion, DB cleanup, provider cleanup, screenshot capture, Store Console operation, Capacitor work, app icon creation, env/dashboard operation, provider API call, reviewer login retry, or magic link resend was performed.

Account deletion UI received an additional user-facing copy refinement. Public UI no longer asks or implies that users should prepare a disposable/test account, and it frames the flow as request creation, content confirmation, deletion-target overview, support-side safety review, and later deletion procedure. The primary user-facing target summary now uses broad categories: account information, practice records, recordings/audio files, and evaluation/feedback. Detailed counts and support-side safety checks stay inside expandable sections, while internal proof/deletion details remain in docs/outputs. No deletion API/service logic, actual deletion, Auth deletion, Storage deletion, DB cleanup, provider cleanup, schema/migration, env/dashboard operation, screenshot capture, Store Console operation, Capacitor work, reviewer login retry, or magic link resend was performed.

Practice slot deletion readiness check is captured in `outputs/practice_slot_deletion_status/practice_slot_deletion_status.json`. `/scripts` has a user-facing delete action with confirmation UI, and `DELETE /api/scripts/[id]` deletes only the current user's script by `user_id + id`. Related DB rows cascade through existing foreign keys, so deleted scripts disappear from `/scripts` and `/progress`; Storage objects for recordings/model audio are not removed by this practice-slot delete path and remain separate from account deletion/storage cleanup. The five-slot rule is now enforced in the server-side create path and `/scripts/new` shows a full-state guidance when five scripts already exist. No account deletion, provider cleanup, storage cleanup, DB schema/migration, env/dashboard operation, Store Console operation, screenshot capture, Capacitor work, or voice provider connection was performed.

Practice slot management UX follow-up moved the user-facing script delete action out of the hidden "other actions" area and next to the card's primary practice action as a lower-emphasis "delete this script" control. The existing confirmation UI remains in place. When five slots are full, `/scripts` now offers a clickable "organize stock" link to the script list anchor, and `/scripts/new` returns users to the same management anchor. The five-slot server-side cap, ownership boundary, hard-delete semantics, and Storage-object non-cleanup warning remain unchanged.

Practice slot management production human smoke is PASS for commit `48dfda2`. The owner confirmed the five-slot full state, sixth-script block, organize-stock link, visible per-card delete action, delete confirmation UI, reopened slot after one script deletion, new script creation after deletion, and intact `/progress`. Account deletion, actual deletion, and Storage cleanup were not performed.

Storage object cleanup boundary planning is captured in `docs/storage-object-cleanup-boundary-plan.md` and `outputs/storage_object_cleanup_boundary_plan/storage_object_cleanup_boundary_plan.json`. Practice slot deletion remains v1 DB-first slot management and does not call Storage remove; this is a warning / future gate unless public copy or Store review requires per-script file deletion. Account deletion remains the user-level destructive path and must cover `recordings`, `script-audios`, `voice-samples`, and `voice-consents` through safe dry-run evidence and a separately approved destructive gate before Store submission. No Storage deletion, actual account deletion, Auth deletion, DB cleanup, provider cleanup, schema/migration, env/dashboard operation, Store Console operation, screenshot capture, or Capacitor work was performed.

Gate 4m account deletion Storage cleanup proof readiness is captured in `docs/store-release-gate4m-account-deletion-storage-cleanup-proof-readiness.md` and `outputs/store_release_gate4m_account_deletion_storage_cleanup_proof_readiness/gate4m_account_deletion_storage_cleanup_proof_readiness.json`. Repo-side readiness is in place for safe Storage dry-run proof across `recordings`, `script-audios`, `voice-samples`, and `voice-consents`, and Gate 4h human-observed disposable evidence shows Storage cleanup `not_needed / listed 0 / known 0`. Actual account deletion Storage cleanup proof remains a Store submission blocker until a separately approved destructive gate or explicit human/legal acceptance. No Storage deletion, actual account deletion, Auth deletion, DB cleanup, provider cleanup, schema/migration, env/dashboard operation, Store Console operation, screenshot capture, or Capacitor work was performed.

Gate 4n account deletion actual proof approval packet is captured in `docs/store-release-gate4n-account-deletion-actual-proof-approval-packet.md` and `outputs/store_release_gate4n_account_deletion_actual_proof_approval_packet/gate4n_account_deletion_actual_proof_approval_packet.json`. It defines the disposable-account-only target boundary, human confirmation checklist, provider -> Storage -> DB -> Auth -> post-delete verification order, stop points, blocker conditions, and future approval phrase. The phrase is defined for a later gate but not provided or accepted here, so actual deletion, Storage deletion, Auth deletion, DB cleanup, provider cleanup, provider API calls, env/dashboard operations, schema/migration, API/service logic changes, Store Console work, screenshot capture, and Capacitor work remain blocked.

Provider roles:

- ElevenLabs: voice clone and model audio generation
- OpenAI: transcription, Script Studio generation, and coaching-adjacent generation
- Azure: pronunciation evaluator
- Supabase: Auth, DB, private Storage, and protected replay

### Gate 3.5: v1 Core Readiness / Brush-up Deferral Check

Goal: align the v1 release scope after Gate 3 `WARN`, confirm Brush-up is deferred from v1, close or explicitly accept v1 provider kill switch gaps, and make sure privacy / deletion / consent claims match the v1 feature set before native packaging.

Brush-up returns as v1.1 work only after ElevenLabs cleanup / retention / script-scoped feasibility / cost-latency-retry, `NATIVE_MINUTE_DISABLE_ELEVENLABS` proof, protected replay, and Brush-up-aware account deletion cleanup proof are ready.

### Gate 4a: v1 Privacy / Consent / Deletion Implementation Plan

Goal: fix the implementation contract for v1 privacy, terms, support, recording consent, AI provider notice, normal voice setup consent/notice, account deletion, cleanup proof, and Store disclosure inputs before implementation starts.

Status: docs/design-only plan is captured in `docs/store-release-gate4a-privacy-consent-deletion-implementation-plan.md`. v1 planning excludes Brush-up and keeps Brush-up-specific consent, revoke, provider submission, script-scoped variants, generated Brush-up audio, and cleanup proof in v1.1.

### Gate 4b: v1 Privacy / Terms / Support Route Scaffold

Goal: publish the minimal v1 release candidate draft copy and navigation for Privacy Policy, Terms, Support, account deletion request explanation, and Settings / Account links.

Status: implemented as small UI/copy scaffold. It does not claim final legal approval, does not claim actual deletion completion, and does not include Brush-up as a v1 feature.

### Gate 4c: v1 Consent / Provider Notice UI

Goal: add small, flow-local consent and provider notices to listen, record, review, and voice setup without turning legal copy into the main screen.

Status: implemented as release candidate draft UI/copy. It explains the v1 provider/data boundaries and links to Privacy, Terms, Support, and account deletion request pages. It does not implement destructive deletion, provider cleanup, DB schema changes, API contract changes, provider calls, env/dashboard changes, or Brush-up.

### Gate 4d: Account Deletion Request / Dry-Run Proof Scaffold

Goal: make the existing account deletion request, confirmation, dry-run, and proof-first boundaries understandable before any destructive implementation or disposable proof run.

Status: implemented as a non-destructive UI/copy/docs scaffold. It clarifies v1 dry-run categories, future deletion phases, redaction boundaries, and v1.1 Brush-up exclusions. It does not execute deletion or change DB schema, API contracts, providers, env, dashboards, infrastructure, Capacitor, or Store submission state.

### Gate 4e: Disposable Account Deletion Proof Checklist

Goal: define the operator checklist and proof package shape for a future disposable account deletion proof, including test data creation, dry-run capture, redaction rules, and the stop point before actual deletion.

Status: checklist ready. It is docs/output only and does not execute deletion, add destructive operations, or change DB schema, API contracts, providers, env, dashboards, infrastructure, Capacitor, Store submission state, or Brush-up scope.

### Gate 4f: Account Deletion Actual Implementation Plan / Destructive Boundary Decision

Goal: decide the v1 actual deletion order, destructive boundary, DB schema/migration need, provider cleanup scope, and operator confirmation points before any destructive implementation or run.

Status: plan ready. It is docs/output only. The existing request table appears sufficient for the v1 operator proof path, so no DB schema/migration is required for this planning gate. Actual cleanup remains separated into later gates and must not be exposed as a public UI button before guarded operator proof is accepted.

### Gate 4g: Account Deletion Dry-Run Service Hardening / Operator Checklist Alignment

Goal: make the existing non-destructive dry-run output line up with the disposable proof checklist before any actual deletion implementation or proof run.

Status: implemented non-destructively. The job dry-run summary now covers Gate 4e v1 categories, explicit v1.1 Brush-up deferrals, skipped actual stages, human-required confirmations, blocker codes, operator checklist alignment, and redaction rules. No destructive route, DB migration, provider cleanup, Storage deletion, DB cleanup, Auth deletion, env/dashboard change, Capacitor work, or Store submission work was added.

### Gate 4h: Disposable Account Dry-Run Proof Capture

Goal: capture non-destructive dry-run evidence for a disposable account using safe counts, status, blockers, deferred items, human-required items, and redaction checks.

Status: human-observed safe dry-run summary PASS. The disposable `+delete-test` account, request, typed confirmation, pending cleanup statuses, safe inventory / cleanup counts, missing coverage 0, blockers none, and actual_deletion_not_run were observed in the authenticated UI. Codex did not execute provider / Storage / DB / Auth cleanup and did not record raw identifiers. Actual deletion remains a later explicitly approved destructive gate.

### Gate 4i: Privacy / Support / Deletion Release QA Smoke Checklist

Goal: define a release QA smoke checklist for privacy, terms, support, account deletion request, consent notices, provider notices, and Store-facing URL/reviewer/data safety checks that can be reviewed without a disposable account.

Status: checklist ready. Gate 4i is docs/output only. It does not rerun Gate 4h, target any account, execute actual deletion, add destructive routes, change DB schema/API/env/infra, or implement Brush-up. Disposable-account dry-run proof stays in Gate 4h re-run; actual deletion proof stays in later destructive gates.

### Gate 4j: Provider Kill Switch Readiness

Goal: prove repo-side kill switch readiness for OpenAI, Azure, ElevenLabs, and Storage uploads before Store release QA, without operating dashboards or changing production env.

Status: implemented non-destructively. OpenAI, Azure, and ElevenLabs already stop at provider factory / service boundaries before provider calls. Storage uploads now support both `NATIVE_MINUTE_DISABLE_STORAGE_UPLOADS` and `NATIVE_MINUTE_DISABLE_STORAGE_UPLOAD` as the same upload pause. Human env presence and operation proof are still required before Store PASS.

### Gate 4k: Provider Kill Switch Smoke Evidence

Goal: capture local, non-provider-call smoke evidence that each v1 kill switch is detected and that unset / false values do not pause the normal path.

Status: local smoke PASS. Evidence used `npm run production:preflight` with dummy env only. It confirms OpenAI, Azure, ElevenLabs, Storage upload canonical, and Storage upload alias detection, plus unset / false baseline. Human production-like or approved production-safe operation proof remains required before Store PASS.

### Gate 4l: Release Blocker / Human Action Summary

Goal: summarize remaining release blockers, human actions, Codex-safe next work, no-go work, and the v1 / v1.1 boundary before moving into release QA planning or disposable account proof re-run.

Status: summary ready. Gate 4h safe dry-run proof is now human-observed PASS. Codex can proceed with non-destructive release readiness work, but must not start actual deletion, provider cleanup, env/dashboard operations, Capacitor, Store submission, or Brush-up without a separate explicit gate.

### Gate 4: Capacitor iOS / Android

Goal: wrap the Web core for native shells after Web behavior, privacy, deletion, and provider operations are stable enough.

Do not start Capacitor work before Gate 1.5 and the Store-facing privacy/deletion gaps are understood.

### Gate 5: Store Assets / Metadata / Reviewer Account

Goal: prepare screenshots, icons, descriptions, support URL, privacy policy URL, review account, demo notes, and store metadata.

### Gate 5a: Release QA Smoke Execution Plan

Goal: plan v1 release QA smoke across local, production Web, mobile browser, reviewer account, disposable account, provider disabled env, and provider normal env contexts before Store assets and native packaging move forward.

Status: plan ready. Gate 5a does not execute QA. Gate 4h safe dry-run proof is now human-observed PASS, while actual deletion proof remains separate and destructive-gate-only. Gate 6 receives mobile/WebView audio risk, Azure final refresh, provider cleanup proof, App Privacy / Data Safety consistency, reviewer flow, Store URLs, production logs redaction, kill switch operation proof, protected replay proof, and final legal/support approval.

### Store Release QA Readiness Refresh

Goal: refresh the pre-submission QA checklist after Gate 0 auth recovery, Gate 4h safe dry-run proof, Gate 4m / 4n deletion readiness, account deletion public copy polish, five-slot management smoke, and Gate 5e / 5f / 5g asset readiness work.

Status: refresh ready. The updated checklist separates clean demo account, reviewer account, and disposable account scopes; adds auth callback regression, five-slot management, script deletion/recreation, progress continuity, account deletion request / typed confirmation / safe summary, privacy / terms / support / footer copy, provider notice, Store claim safety, mobile browser, reviewer flow, and Store data forms. Actual deletion proof and Storage cleanup actual proof remain Store-submission blockers unless separately approved or explicitly accepted. This refresh did not run QA, target accounts, execute deletion, operate Store Console, capture screenshots, introduce Capacitor, or change provider/env/dashboard state.

### Mobile Browser QA Plan

Goal: prepare human-run mobile browser QA for iPhone Safari, iPhone Chrome, and Android Chrome before screenshots, Capacitor, Store Console, or destructive account deletion work.

Status: plan ready. The checklist covers login / logout / magic link, Home / Scripts, five-slot management, script creation, Listen audio playback, Record microphone / upload, Review saved recording playback, Progress, Settings, Privacy / Terms / Support / Account deletion, small-screen layout, Safari / Chrome differences, provider/upload failure copy, and Store claim safety. Evidence must use safe PASS / FAIL / BLOCKED / human_required fields only. This plan did not run mobile QA, send magic links, log into reviewer accounts, capture screenshots, operate Store Console, introduce Capacitor, call providers, change env/dashboard state, or execute actual deletion / cleanup.

Human QA update: iPhone Safari production mobile browser QA is `PASS` with a clean demo account context. Login, scripts, five-slot management, script creation, listen audio, record microphone / upload, review playback, progress, and settings / legal pages passed with no concerns. Actual deletion, Store Console, screenshots, Capacitor, provider API calls by Codex, env/dashboard changes, and cleanup operations were not performed.

Human QA update: iPhone Chrome lightweight production mobile QA is also `PASS` for login, scripts, listen audio, record microphone / upload, review playback, progress, and settings / legal pages with no concerns. Android Chrome is still `human_required_later / device_unavailable`; no Android Chrome PASS is claimed.

### Gate 5b: Store Metadata / Reviewer Instructions / Privacy Draft Mapping

Goal: prepare human-review-required drafts for Store metadata, reviewer instructions, App Privacy mapping, and Google Data Safety mapping that match the v1 feature set without Brush-up.

Status: draft ready. Final support / privacy / deletion URLs, reviewer account, App Privacy / Data Safety console answers, screenshots, countries/regions, category, keywords, and age rating remain human-required. Do not operate App Store Connect or Google Play Console until the draft is reviewed and release blockers are resolved.

### Gate 5c: Screenshot Candidate Plan / Reviewer Evidence Template

Goal: prepare screenshot candidate surfaces, safe caption directions, claims-to-avoid, and Store reviewer evidence template before any screenshot capture or Store Console operation.

Status: plan/template ready. Recommended v1 screenshot candidates are Home / practice entry, script creation, listen, record, review, and progress, with optional settings/legal and account deletion request surfaces. Final screenshots, app icon, app name, subtitle, reviewer account, support/privacy/deletion URLs, legal approval, platform-specific screenshot sizes, and redaction review remain human-required. Brush-up must not appear in v1 screenshots or reviewer notes.

### Gate 5d: Reviewer Instructions / Evidence Package Draft

Goal: prepare practical reviewer instructions and a safe reviewer evidence package shape before reviewer account creation, QA execution, screenshots, or Store Console operation.

Status: draft ready. The reviewer flow covers login, script creation, listen, record, evaluate, review, progress, settings, privacy, terms, support, account deletion request, provider unavailable recovery, and the explicit no-Brush-up v1 boundary. Reviewer account creation, reviewer password transfer outside repo/docs/outputs, final URLs, final reviewer notes, final screenshots, and legal approval remain human-required.

### Gate 5e: Store Asset Capture Plan

Goal: prepare the capture plan for screenshots, app icon, app name/subtitle, descriptions, preview captions, Store URLs, reviewer account, and reviewer instructions before any asset capture or Store Console operation.

Status: plan ready. Minimum screenshot set is Home / practice entry, script creation, listen, record, review, and progress. Optional additions are Scripts, Settings, and Privacy / Support / Account deletion request surfaces. Final screenshot capture, app icon, final app name/subtitle/descriptions, support/privacy/deletion URLs, reviewer account, demo account/script, device size selection, platform-specific asset requirements, legal approval, and redaction review remain human-required. Brush-up must not appear in v1 assets.

### Gate 5f: Store Asset Capture Readiness Check

Goal: decide whether Store asset capture can begin based on Gate 5e prerequisites, Gate 0 auth recovery evidence, redaction rules, Store claim safety, v1 scope, and human-required items.

Status: readiness check complete; actual capture is not ready. Ready items are Gate 0 production smoke, candidate screenshots, recommended minimum set, safe caption pool, human-confirmed app name/subtitle, human-confirmed demo script, redaction rule, v1 scope boundary, Brush-up v1.1 defer boundary, and Store claim safety list. Reviewer account candidate is recorded but login verification is `human_required_deferred`. Human-required blockers before capture are final descriptions, reviewer or clean demo account verification, mobile/device selection, platform-specific asset requirement check, legal/support approval, Store console/platform acceptance checks, and final redaction review. Do not capture screenshots or create icons until those are closed.

### Gate 5g: Mobile / Device Selection and Platform Asset Requirements

Goal: choose capture planning candidates for iPhone, Android, and fallback web evidence, and identify platform-specific Store asset requirements that must be human-checked before screenshot capture.

Status: plan ready. Recommended minimum screenshot set remains Home / practice entry, Script creation, Listen, Record, Review, and Progress. Optional additions are Scripts / practice library, Settings, and Privacy / Support / Account deletion request path. Exact App Store / Google Play screenshot dimensions, device family requirements, tablet strategy, feature graphic / app icon requirements, and device frame choices remain `human_required / platform_check_required`.

### Gate 5h: Screenshot Capture Preflight

Goal: prepare screenshot capture without capturing screenshots, creating images/icons, operating Store Console, introducing Capacitor, or touching destructive deletion paths.

Status: preflight ready; capture not started. Use the clean demo account safe alias for screenshots, do not use the reviewer account while verification is deferred, and never use the delete-test account for screenshots. Minimum set is Home / practice entry, Script creation, Listen, Record, Review, and Progress. Optional set is Scripts, Settings, and Privacy / Support / Account deletion request surfaces. Full email, tokens, private URLs, transcripts, raw audio paths, Storage paths, provider data, secrets/env values, personal data, Brush-up v1 claims, and actual-deletion-complete claims must not appear. Final device size, Store screenshot requirements, final copy/caption/legal review, redaction review, app icon, and Store Console requirements remain human-required.

### Gate 5i: Screenshot Candidate Capture Internal Review

Goal: capture PC-based mobile-width screenshot candidates for internal review only, using the clean demo account context and Gate 5h redaction / claim boundaries.

Status: `BLOCKED: no_authenticated_clean_demo_session`. Codex opened production `/scripts` at a mobile-width viewport, but the in-app browser was not authenticated as the clean demo account and redirected to `/login` with `login_required`. No screenshot candidate image files were created. Minimum set and optional set remain unchanged for rerun. Codex did not send magic links, retry reviewer login, use the delete-test account, operate Store Console, approve final screenshots, introduce Capacitor, execute deletion, call provider APIs, change env/dashboard, or perform DB / Auth / Storage / provider cleanup.

### Gate 5j: Human Screenshot Capture Instructions

Goal: provide a concrete iPhone instruction pack for a human to capture internal review screenshot candidates safely, after Gate 5i could not capture due to no authenticated clean demo session.

Status: instruction pack ready; capture not started. Use the clean demo account context only, never the reviewer or delete-test account. Minimum order is Home / practice entry, Script creation, Listen, Record, Review, and Progress. Optional order is Scripts / practice stock, Settings, and Privacy / Support / Account deletion request. The pack tells the human to hide notifications, avoid mailbox / magic-link / full email / auth callback / browser private UI, use the human-confirmed demo script, avoid Brush-up and completed-deletion claims, and keep every candidate as internal review only until later final Store approval. No screenshots, screenshot files, image generation, Store Console work, app icon creation, Capacitor, provider calls, env/dashboard changes, magic-link resend, reviewer relogin, or actual deletion / cleanup happened.

Voice setup recording update: `/setup/voice` now exposes in-browser recording as the primary path for consent audio and normal voice sample capture. The flow is start recording, stop, play back, retry, and use this recording; file selection remains as a fallback / advanced option. The existing voice consent/sample upload routes and app-owned Storage ownership boundary are unchanged. No provider live connection, provider API call, DB schema/migration, env/dashboard operation, Store Console work, screenshot capture, Capacitor work, or actual deletion / cleanup happened.

### Gate 6: Release QA

Goal: run cross-device, mobile WebView, upload, replay, auth, provider failure, account deletion, support, and monitoring QA before external testing.

### Gate 7: TestFlight / Google Closed Testing

Goal: validate native packaging and review-critical flows with controlled testers before store submission.

### Gate 8: App Store / Google Play Submission

Goal: submit with complete policy answers, reviewer access, support/privacy URLs, and known provider behavior.

### Gate 9: Rejection-Specific Fix and Resubmission

Goal: treat review rejection as a normal release loop. Record rejection reason, affected gate, fix, checks, and resubmission evidence.

### Gate 10: Listed

Goal: listing is live. Continue monitoring auth, provider cost, deletion requests, support, crash/error signals, and review feedback.

## Web Beta / Vercel Deploy Smoke

Current status: production URL, deploy provider, project, deployment id/name, environment, deployment status, branch, and build ref have been human-confirmed. Exact `deployedAt` timestamp and exact device/browser remain `unknown`; do not infer them from repo data.

Before claiming Web beta is current, record safe evidence for:

| Area | Confirm |
| --- | --- |
| Production URL | The intended Vercel URL opens the current app. |
| Commit / build ref | The deployed build matches the intended short ref. |
| Login | Magic link or approved auth flow reaches `/scripts`. |
| Session refresh | Refresh preserves session on protected pages. |
| Script creation | `/scripts/new` can create a script and reach listen. |
| Listen | Model audio generates or reuses cache; protected replay works. |
| Record | Microphone or safe upload path reaches evaluate. |
| Evaluate | OpenAI transcription + Azure pronunciation, or accepted provider mode, creates Review without partial failed persistence. |
| Review | Summary, score/weak words, coach note, and replay load safely. |
| Progress | Latest result, best result, and review link reflect saved data. |
| Second take | A second take on the same script keeps latest / best / progress semantics intact. |
| Provider env | Expected providers and launch mode are set; test helper env is not enabled. |
| Kill switches | OpenAI, Azure, ElevenLabs, and Storage upload kill switches are known and can be operated. |
| Redaction | UI and proof notes do not expose secrets, raw provider responses, raw audio, signed URLs, storage paths, provider voice ids, transcripts, or script text. |

## Gate 1.5 Voice Architecture Review

The following is the current server / clone voice direction:

- ElevenLabs clone voice consent recording, sample audio, and `voice_id` persistence require server-side processing.
- Do not introduce VPS, EC2, a dedicated server, or a new always-on worker now.
- Initial architecture remains Vercel Route Handler / API Route + Supabase Storage / DB.
- ElevenLabs API key, OpenAI API key, and Supabase service role key must never be exposed to the client.
- Voice sample audio and consent recording must not be sent directly from the client to ElevenLabs or OpenAI.
- The client uploads voice sample / consent recording to app-owned Supabase Storage first.
- Server-side routes read app-owned Storage objects and pass them to the provider.
- Provider `voice_id`, consent id, and owner information must stay linked to DB user ownership.
- Generated audio should not depend on provider direct URLs; normalize provider bytes or references into app-owned replay.
- Continue to prefer private buckets and authenticated replay routes.
- Provider voice identifiers are provider call inputs, not ownership or cache authority.
- Brush-up best take audio must be read from app-owned `recordings` server-side and sent to the provider only after explicit script-scoped consent.
- Brush-up should use script-scoped voice variants and app-owned generated replay; it must not replace the default voice or reuse best-take material across scripts.
- Consider VPS / worker / queue only if Vercel Functions prove insufficient for timeout, retry, provider latency, long-running cleanup, or scheduled job requirements during Gate 1.5 through Gate 3.

Gate 1.5 review questions:

- Are consent recording and sample recording lifecycle, retention, and deletion rules clear?
- Are provider voice ids, local voice rows, consent rows, and owners linked without trusting client input?
- Can all provider calls be made from server-side boundaries without leaking secrets?
- Does account deletion cover voice samples, consent recordings, generated model audio, local voice rows, and provider-side cloned voices?
- Is provider retry / failure behavior safe without adding a queue yet?
- Is Vercel Function runtime enough for expected sample upload, clone creation, TTS generation, and cleanup proof?
- Can Gate 3.5 prove Brush-up consent, generated audio, revoke, and deletion behavior before Capacitor work starts?

## Store Submission Blockers

The Store path remains blocked until these are resolved or explicitly accepted for a narrower test phase:

- account deletion disposable live proof
- privacy / terms / legal final review
- data handling and AI provider disclosure
- Brush-up explicit consent, revoke, deletion, and provider cleanup proof if Brush-up ships in v1
- support URL and privacy policy URL
- reviewer account and reviewer instructions
- Capacitor native packaging
- store assets, app icons, screenshots, and metadata
- Apple App Privacy answers and Google Play Data safety answers
- TestFlight and Google closed testing
- provider cost guard beyond small-cohort assumptions
- monitoring / error logging / incident response
- post-deploy and post-release smoke evidence
- mobile WebView upload, replay, auth callback, and provider failure QA

## First Three Moves

1. Human-confirm Web beta / Vercel deploy state.
   - Record production URL, commit/build ref, launch mode, provider choices, and post-deploy smoke result without raw ids or secrets.
2. Run Gate 1.5 voice consent / clone voice server-side architecture review.
   - Keep it docs/design first. Do not implement clone voice changes in the review task.
3. Inventory Store-facing privacy, deletion, and provider disclosure gaps.
   - Compare current `/privacy`, `/terms`, `/support`, account deletion flow, provider roles, and data safety answers before native packaging.

## Out of Scope for This Inventory

- auth callback failure fix
- login / callback / middleware code changes
- DB schema / migration changes
- API contract changes
- provider implementation changes
- ElevenLabs clone voice implementation
- OpenAI custom voice implementation
- Capacitor setup
- App Store / Google Play submission
- VPS / EC2 / dedicated server introduction
- queue / worker introduction
- broad UI redesign
