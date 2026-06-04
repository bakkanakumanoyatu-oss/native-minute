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

Gate 4h disposable account dry-run proof capture is recorded in `docs/store-release-gate4h-disposable-account-dry-run-proof-capture.md` and `outputs/store_release_gate4h_disposable_account_dry_run_proof_capture/gate4h_disposable_account_dry_run_proof_capture.json`. Result: `BLOCKED: needs_human_disposable_account`. No explicit disposable account safe alias, authenticated disposable session, or confirmed disposable deletion request was provided, so no dry-run was executed. The proof package records only safe unknown / not_executed / human_required status and stops before actual deletion.

Gate 4i privacy / support / deletion release QA smoke checklist is captured in `docs/store-release-gate4i-privacy-support-deletion-release-qa-checklist.md` and `outputs/store_release_gate4i_privacy_support_deletion_release_qa_checklist/gate4i_privacy_support_deletion_release_qa_checklist.json`. It defines human-confirmation-free QA targets for `/privacy`, `/terms`, `/support`, `/support/account-deletion`, `/settings`, record, listen, review, `/setup/voice`, footer / legal links, and Store submission support/privacy/deletion URL checks. Gate 4h disposable account dry-run proof remains blocked until a human prepares a disposable account; actual deletion and destructive cleanup stay in later gates.

Gate 4j provider kill switch readiness is captured in `docs/store-release-gate4j-provider-kill-switch-readiness.md` and `outputs/store_release_gate4j_provider_kill_switch_readiness/gate4j_provider_kill_switch_readiness.json`. OpenAI, Azure, and ElevenLabs provider call guards were repo-confirmed. Storage upload kill switch readiness now accepts both the existing canonical `NATIVE_MINUTE_DISABLE_STORAGE_UPLOADS` and the alternate `NATIVE_MINUTE_DISABLE_STORAGE_UPLOAD` alias, without changing Vercel env or running provider/dashboard/destructive operations.

Gate 4k provider kill switch smoke evidence is captured in `docs/store-release-gate4k-provider-kill-switch-smoke-evidence.md` and `outputs/store_release_gate4k_provider_kill_switch_smoke_evidence/gate4k_provider_kill_switch_smoke_evidence.json`. Local dummy-env `production:preflight` smoke confirms OpenAI, Azure, ElevenLabs, Storage upload canonical, and Storage upload alias kill switches are detected without provider API calls. Baseline unset / false cases remain off. Vercel env, dashboards, provider APIs, deletion, DB, Storage cleanup, provider cleanup, Brush-up, and Capacitor were not touched.

Gate 4l release blocker / remaining human action summary is captured in `docs/store-release-gate4l-release-blocker-human-action-summary.md` and `outputs/store_release_gate4l_release_blocker_human_action_summary/gate4l_release_blocker_human_action_summary.json`. It classifies remaining v1 blockers into human-required, Codex-can-proceed, disposable-account, dashboard/env, legal/support approval, future destructive approval, Gate 6 QA, and v1.1 defer buckets. Gate 4h remains blocked on `needs_human_disposable_account`, while Brush-up stays outside v1 release scope.

Gate 5a release QA smoke execution plan is captured in `docs/store-release-gate5a-release-qa-smoke-execution-plan.md` and `outputs/store_release_gate5a_release_qa_smoke_execution_plan/gate5a_release_qa_smoke_execution_plan.json`. It defines the v1 QA scope, environment matrix, status values, Gate 4h dependencies, Gate 6 handoff items, execution order, and safe evidence package shape. It is planning only: no QA run, disposable account proof rerun, provider call, env/dashboard operation, deletion, cleanup, Capacitor, or Store submission occurred.

Gate 5b Store metadata / reviewer instructions / App Privacy and Google Data Safety draft mapping is captured in `docs/store-release-gate5b-store-metadata-reviewer-privacy-draft.md` and `outputs/store_release_gate5b_store_metadata_reviewer_privacy_draft/gate5b_store_metadata_reviewer_privacy_draft.json`. It drafts v1 Store metadata, reviewer flow, data use purposes, data safety mapping, human-required final answers, screenshot candidates, age/category considerations, and claims to avoid. It is human-review-required draft only; no Store Console operation, final privacy/data safety submission, screenshot/icon creation, Capacitor work, deletion, cleanup, provider call, env/dashboard operation, or Brush-up occurred.

Gate 5c screenshot candidate plan / reviewer evidence template is captured in `docs/store-release-gate5c-screenshot-reviewer-evidence-template.md` and `outputs/store_release_gate5c_screenshot_reviewer_evidence_template/gate5c_screenshot_reviewer_evidence_template.json`. It defines v1 screenshot candidate surfaces, safe caption directions, Store claims to avoid, reviewer evidence fields, reviewer flow, and the difference between internal QA evidence and Store reviewer evidence. It is planning/template only; no screenshot capture, image generation, Store Console operation, Capacitor work, deletion, cleanup, provider call, env/dashboard operation, or Brush-up occurred.

Gate 5d reviewer instructions / evidence package draft is captured in `docs/store-release-gate5d-reviewer-instructions-evidence-package.md` and `outputs/store_release_gate5d_reviewer_instructions_evidence_package/gate5d_reviewer_instructions_evidence_package.json`. It turns the reviewer flow into practical draft instructions, defines reviewer account placeholders, evidence package fields, safe test script guidance, provider unavailable expectations, and show / do-not-show boundaries. It is draft/template only; no reviewer account creation, password recording, Store Console operation, screenshot capture, QA run, deletion, cleanup, provider call, env/dashboard operation, Capacitor work, or Brush-up occurred.

Gate 5e Store asset capture plan is captured in `docs/store-release-gate5e-store-asset-capture-plan.md` and `outputs/store_release_gate5e_store_asset_capture_plan/gate5e_store_asset_capture_plan.json`. It defines the Store asset preparation scope, recommended screenshot sets, caption candidates, claims to avoid, capture prerequisites, screenshot evidence template, and redaction boundaries. It is planning/template only; no screenshot capture, image generation, app icon creation, Store Console operation, QA run, deletion, cleanup, provider call, env/dashboard operation, Capacitor work, or Brush-up occurred.

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

Status: blocked pending human disposable account. Codex did not execute dry-run because the task did not provide a disposable account safe alias, authenticated disposable session, or confirmed request. Next attempt must use a disposable account only, record no raw identifiers, and stop before actual deletion.

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

Status: summary ready. Gate 4h still needs a human-prepared disposable account before dry-run proof capture can proceed. Codex can next draft release QA, Store metadata, reviewer instructions, and App Privacy / Google Data Safety mapping, but must not start actual deletion, provider cleanup, env/dashboard operations, Capacitor, Store submission, or Brush-up.

### Gate 4: Capacitor iOS / Android

Goal: wrap the Web core for native shells after Web behavior, privacy, deletion, and provider operations are stable enough.

Do not start Capacitor work before Gate 1.5 and the Store-facing privacy/deletion gaps are understood.

### Gate 5: Store Assets / Metadata / Reviewer Account

Goal: prepare screenshots, icons, descriptions, support URL, privacy policy URL, review account, demo notes, and store metadata.

### Gate 5a: Release QA Smoke Execution Plan

Goal: plan v1 release QA smoke across local, production Web, mobile browser, reviewer account, disposable account, provider disabled env, and provider normal env contexts before Store assets and native packaging move forward.

Status: plan ready. Gate 5a does not execute QA. Gate 4h disposable account dry-run proof remains separate and blocked on human disposable account preparation. Gate 6 receives mobile/WebView audio risk, Azure final refresh, provider cleanup proof, App Privacy / Data Safety consistency, reviewer flow, Store URLs, production logs redaction, kill switch operation proof, protected replay proof, and final legal/support approval.

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
