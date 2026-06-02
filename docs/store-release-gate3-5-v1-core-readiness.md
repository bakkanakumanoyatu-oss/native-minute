# Gate 3.5 v1 Core Readiness / Release Scope Lock

Gate 3.5 locks the v1 Store release scope after the Gate 3 `WARN` result and the Brush-up v1 deferral decision. The purpose is to move toward privacy / deletion / consent implementation for the actual v1 feature set without blocking App Store / Google Play listing on Brush-up.

This is docs/evidence-only planning. It does not change code, DB schema, API contracts, provider integrations, provider dashboards, production env, Vercel settings, account deletion implementation, Capacitor, or Store submission state.

## Decision

- v1 ships without Brush-up.
- Brush-up remains planned for v1.1 and must not appear in v1 Store metadata, Privacy Policy claims as an available feature, screenshots, reviewer notes, or in-app release copy.
- Gate 3.5 is now a v1 core readiness checkpoint: lock v1 scope, sort Gate 3 WARN items for the v1 feature set, and define entry criteria for privacy / deletion / consent implementation.
- Existing Brush-up architecture docs remain future planning inputs and are not deleted.

## v1 Included Scope

v1 includes:

- Account login / session continuity.
- Home and practice entry points.
- Script creation and script library: `/scripts`, `/scripts/new`, and safe duplicate/new-script flow.
- Listen: normal model audio generation or cache reuse for a saved script.
- Record: microphone / supported upload path for practice recordings.
- Evaluate: OpenAI transcription + Azure pronunciation evaluation through server-side boundaries.
- Review: persisted score, transcript, weak words, coach / next step, and saved result playback.
- Progress: latest result, best result, saved best take / saved model audio summaries, and continuity across multiple takes.
- Normal voice setup: voice sample, consent recording, default voice, and normal model audio generation through the existing server-side voice provider path.
- Settings, support, privacy / terms draft routes, and account deletion request / dry-run / proof planning surfaces.
- Provider readiness for the v1 provider set: OpenAI transcription / Script Studio generation, Azure pronunciation evaluation, ElevenLabs normal voice path, Supabase Auth/DB/Storage, and Vercel production deploy.
- Store release operations: provider kill switch gap closure, release QA, store assets, metadata, reviewer account, TestFlight / Google closed testing, submission, rejection-specific fixes, and listing.

## v1 Excluded Scope

v1 excludes:

- Brush-up UI or user-facing Brush-up actions.
- Best-take-to-script-scoped voice material provider submission.
- Brush-up-specific consent and revoke UI.
- Brush-up script-scoped voice variants.
- Brush-up generated audio candidate creation / acceptance.
- Brush-up-specific provider cleanup proof.
- Brush-up-specific account deletion proof.
- Brush-up-specific quota / cost / latency / retry proof.
- Any Store metadata, screenshot, reviewer note, support article, or privacy copy that claims Brush-up is available in v1.

## v1.1 Scope

v1.1 receives:

- Brush-up from selected best take.
- Script-scoped voice material / voice variant design and implementation.
- Brush-up explicit consent / revoke UX.
- Brush-up generated audio candidates and app-owned replay proof.
- Brush-up-specific provider cleanup / retention / deletion proof.
- Brush-up account deletion coverage.
- Brush-up cost / latency / retry proof and any worker / queue / VPS reconsideration if Vercel Functions are insufficient.

## Store Metadata / Privacy Copy Guardrails

Do not describe Brush-up as a v1 feature in:

- App Store / Google Play descriptions.
- Screenshot captions.
- Reviewer notes.
- Onboarding / marketing copy.
- Privacy Policy feature descriptions.
- Terms examples of available behavior.
- Support pages or account deletion instructions for v1 users.

Allowed wording:

- v1 may describe practice recordings, transcription, pronunciation evaluation, normal generated model audio, normal voice setup, and account deletion for the actual released feature set.
- v1 may say future voice-improvement features are planned only if they are clearly marked as future / not available and not used to satisfy Store review claims.
- Internal docs may continue to reference Brush-up as v1.1 planning.

## Provider WARN Classification for v1

| Provider | WARN item | v1 classification | Action before release |
| --- | --- | --- | --- |
| OpenAI | `NATIVE_MINUTE_DISABLE_OPENAI` missing / unproven | v1 before release | Add/confirm env presence and safe operation proof, or explicitly accept WARN for a narrow test phase. |
| OpenAI | `OPENAI_TRANSCRIPTION_MODEL` absent | non-blocker / release QA | Code has a default; either add explicit env or record accepted default before Store PASS. |
| OpenAI | support escalation owner pending | release QA | Assign provider outage/support owner before release QA exits. |
| Azure | `NATIVE_MINUTE_DISABLE_AZURE` missing / unproven | v1 before release | Add/confirm env presence and safe operation proof, or explicitly accept WARN for a narrow test phase. |
| Azure | alert not configured | v1 before release | Configure alert or record accepted manual monitoring owner. |
| Azure | Pronunciation Assessment availability not refreshed | release QA | Confirm for final resource/region before Store submission. |
| Azure | mobile / WebView audio risk unconfirmed | release QA | Confirm during mobile / native QA before Store submission. |
| ElevenLabs | normal voice path dashboard/env/logs confirmed | v1 non-blocker | Keep normal voice path; Brush-up-specific cleanup/retention moves to v1.1. |
| ElevenLabs | `NATIVE_MINUTE_DISABLE_ELEVENLABS` proof deferred | v1 before release for normal voice; v1.1 for Brush-up | Confirm normal voice kill switch proof before release; Brush-up proof repeats in v1.1. |
| ElevenLabs | delete / cleanup / retention / script-scoped feasibility / Brush-up cost deferred | v1.1 Brush-up | Not a v1 blocker after Brush-up deferral. |
| Supabase | protected replay not confirmed in this pass | release QA | Confirm normal v1 replay before Store submission; Brush-up replay proof moves to v1.1. |
| Supabase | account deletion cleanup proof pending | v1 before release | Required for actual v1 account/data deletion path; Brush-up-specific cleanup moves to v1.1. |
| Supabase | policy SQL detail not reviewed | release QA | Confirm before Store submission. |
| Vercel | provider-specific kill switch env gaps | v1 before release | Close or explicitly accept WARN for v1 provider set. |
| Vercel | rollback / redeploy owner pending | release QA | Assign before release QA exits. |

## v1 Release Blockers

Block v1 until resolved or explicitly accepted for a narrower test phase:

- Provider kill switch readiness for the v1 provider set: OpenAI, Azure, ElevenLabs normal voice, and Storage uploads.
- Azure alert or accepted manual monitoring owner.
- Actual account/data deletion completion path for the v1 feature set.
- Disposable deletion proof for v1 data: account, scripts, recordings, transcripts, scores, weak words, coach feedback, normal voice samples, consent recordings, normal generated model audio, saved pins, Storage, DB rows, Auth, and provider cleanup where v1 actually uses provider-side resources.
- Final Privacy Policy / Terms / support / deletion request copy matching the v1 feature set without Brush-up.
- App Privacy / Google Data Safety answers matching actual v1 data handling.
- Support URL and privacy policy URL.
- Store reviewer account / reviewer instructions.
- Release QA for Web core, mobile browser / future WebView audio path, protected replay, auth/session, provider failure recovery, account deletion, support, and monitoring.

## v1 Non-blockers / Release QA Handoff

These do not block Gate 3.5 scope lock, but must be tracked:

- `OPENAI_TRANSCRIPTION_MODEL` explicit env presence if the default is accepted.
- OpenAI support escalation owner.
- Azure Pronunciation Assessment availability refresh for final resource/region.
- Azure mobile / WebView audio risk.
- Supabase policy SQL detail review.
- Supabase protected replay proof for normal v1 audio.
- Vercel rollback / redeploy owner.
- Brush-up-specific cleanup / retention / script-scoped feasibility / revoke / account deletion proof, because Brush-up is v1.1.

## Privacy / Deletion / Consent Implementation Entry Criteria

Before implementation resumes for privacy / deletion / consent, confirm the following scope:

1. v1 does not include Brush-up and does not send a best take to a provider as script-scoped voice material.
2. Recording consent covers normal practice recording upload, transcription, pronunciation evaluation, review, replay, and progress only.
3. AI provider explanation covers OpenAI transcription / Script Studio generation, Azure pronunciation evaluation, ElevenLabs normal voice generation, Supabase storage/auth/DB, and Vercel hosting.
4. Voice sample and consent recording copy covers normal voice setup and normal model audio generation only.
5. Account deletion scope covers actual v1 data: account, scripts, recordings, transcripts, pronunciation scores, weak words, coach feedback, voice samples, consent recordings, normal generated model audio, saved pins, quota / processing metadata as policy allows, Storage, DB rows, Auth, and provider cleanup where relevant.
6. Storage cleanup proof covers v1 buckets and does not depend on Brush-up material buckets or rows.
7. Provider cleanup proof covers normal cloned voices / provider resources used by v1, not Brush-up variants.
8. Support URL, privacy policy URL, deletion request path, and reviewer instructions do not promise Brush-up.
9. Any remaining Gate 3 WARN accepted for v1 is documented with an owner, mitigation, and Gate 6 verification point.

## Next Work

Next work should be Gate 4-prep only after Gate 2 implementation gaps are handled for v1:

1. Implement or finish v1 privacy / terms / support / consent / account deletion behavior for the locked v1 feature set.
2. Record safe proof for provider kill switches and v1 account deletion cleanup.
3. Run release QA against the v1 feature set without Brush-up.
4. Start Capacitor only after v1 Web behavior, privacy/deletion, provider operations, and Store-facing claims are stable enough.
