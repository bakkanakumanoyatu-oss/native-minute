# Gate 4a v1 Privacy / Consent / Deletion Implementation Plan

Gate 4a fixes the implementation contract for v1 privacy, terms, consent, support, and account deletion before code work starts. It follows the Gate 3 `WARN` result, Gate 3 WARN follow-up queue, Brush-up v1 deferral decision, and Gate 3.5 v1 release scope lock.

This is docs/design-only planning. It does not change code, DB schema, API routes, provider integrations, provider dashboards, production env, infrastructure, Capacitor, Store submission state, or Brush-up implementation.

## Decision

- v1 ships without Brush-up.
- v1 privacy, consent, deletion, Store copy, and support work must describe only the actual v1 feature set.
- Brush-up-specific consent, revoke, provider submission, script-scoped voice variants, generated Brush-up audio, and cleanup proof move to v1.1.
- Gate 4a implementation planning may proceed, but any future task that requires DB schema, API contract, provider, env, or infrastructure changes must be scoped explicitly before implementation.

## v1 Implementation Targets

### Public and Legal Copy

- Final Privacy Policy content for the v1 data flow.
- Final Terms content for Web and Store release.
- Support page content, support contact, and support expectations.
- Account deletion request page content and completion expectations.
- Store reviewer instructions for privacy, audio, providers, support, and deletion.
- App Privacy and Google Data Safety source notes that match the v1 implementation.

### Settings / Account

- Settings / Account section with links to Privacy Policy, Terms, Support, and account deletion.
- Account deletion request entry and current request status.
- Clear status copy for request created, confirmed, in progress, manual review, completed, failed, or support follow-up.
- Non-secret operational notes for deletion timing and support fallback.

### Consent and Notice Surfaces

- Recording consent or notice before practice recording upload and evaluation.
- AI provider usage notice for transcription, pronunciation evaluation, Script Studio generation, and coaching-adjacent generation.
- Model audio / voice setup notice for normal voice sample, consent recording, default voice, and normal generated model audio.
- Voice sample / consent recording notice that explains app-owned upload, server-side provider processing, and deletion coverage.
- No v1 Brush-up consent prompt, because v1 does not send a best take to a provider as script-scoped voice material.

### Account Deletion Flow and Proof

- User account deletion request flow.
- Confirmation / status flow that does not expose raw user, provider, storage, transcript, or audio data.
- Safe inventory and dry-run proof for v1 data.
- Provider cleanup proof for v1 provider resources, especially normal ElevenLabs voice resources if created.
- Storage cleanup proof for v1 buckets.
- DB cleanup / anonymization proof for v1 rows.
- Supabase Auth deletion proof, run last.
- Disposable account proof package before Store submission.

## v1 Screens and Routes

| Surface | v1 requirement |
| --- | --- |
| Settings / Account | Entry point for account, support, legal links, deletion request, deletion status, and safe dry-run/proof status where appropriate. |
| Privacy Policy | Public URL with final v1 data handling, providers, retention, deletion, and contact terms. |
| Terms | Public URL with user responsibility, acceptable use, generated content limitations, provider processing, and support boundaries. |
| Support | Public URL with contact, response expectations, provider outage/support guidance, deletion help, and reviewer-safe instructions. |
| Account deletion request page | Public support path for deletion instructions, including login-required and cannot-login paths. |
| Record flow | Recording consent / notice before upload and evaluation. |
| Evaluate / Review flow | AI provider processing notice and safe failure copy. |
| Listen flow | Normal model audio generation, cache reuse, app-owned replay, and provider processing notice. |
| Voice setup | Normal voice sample and consent recording notice; no Brush-up promise. |
| Store reviewer notes | Reviewer account, core loop instructions, privacy/deletion notes, and no Brush-up claims for v1. |

Route names can keep the current public draft paths (`/privacy`, `/terms`, `/support`, `/support/account-deletion`) if implementation confirms they meet Store release requirements. Gate 4a does not rename or implement routes.

## v1 Consent Classification

| Consent / Notice | Required for v1 | Scope | Must not imply |
| --- | --- | --- | --- |
| Normal recording consent | yes | Practice recording upload, storage, transcription, pronunciation evaluation, review, replay, progress, and deletion coverage. | That the best take will be reused as voice material. |
| AI provider usage notice | yes | OpenAI transcription, Script Studio generation, coaching-adjacent generation, Azure pronunciation evaluation, ElevenLabs normal model audio, Supabase storage/auth/DB, and Vercel hosting. | That provider raw responses or secrets are visible to the user. |
| Model audio / voice setup notice | yes | Voice sample, consent recording, default voice, server-side provider processing, normal model audio generation, app-owned replay, and provider cleanup on deletion where relevant. | That Brush-up or script-scoped variants are available in v1. |
| Voice sample / consent recording notice | yes | App-owned upload to Supabase Storage, server-side use for normal voice setup, retention and deletion expectations. | That client directly sends sample audio to OpenAI or ElevenLabs. |
| Brush-up consent | no, v1.1 | Future selected-best-take-as-script-scoped-voice-material flow. | Any v1 availability claim. |
| Brush-up revoke | no, v1.1 | Future stop-use, provider cleanup, generated audio deletion/hiding, and account deletion extension. | Any v1 account deletion dependency. |

Implementation copy should keep normal recording consent separate from voice sample / consent recording consent. A user agreeing to practice recording evaluation must not be treated as agreeing to voice cloning or future Brush-up material use.

## Account Deletion Scope

### v1 Data Targets

Account deletion for v1 must cover the actual released feature set:

- Supabase Auth user.
- Profile / account rows required for the user.
- Scripts and script ownership.
- Practice recordings in the `recordings` bucket.
- Takes, transcripts, pronunciation scores, weak words, coach feedback, and review/progress data.
- Saved best-take pins and saved model-audio pins.
- Normal generated model audio and related `script_audios` rows.
- `script-audios` Storage objects.
- Voice samples and `voice-samples` Storage objects.
- Consent recordings and `voice-consents` Storage objects.
- Voice consent rows, voice rows, default voice state, and normal provider voice metadata.
- Quota / processing metadata as policy allows.
- Account deletion request rows, retaining only minimal anonymized tracking data if disclosed and necessary for support.

### Cleanup Order

1. Re-fetch the active deletion request and owned user data server-side.
2. Run provider cleanup for v1 provider resources where relevant.
3. Delete app-owned Storage objects for recordings, script audios, voice samples, and voice consents.
4. Delete or anonymize DB rows for scripts, takes, reviews, weak words, coach feedback, audio library pins, script audios, voices, consents, quota/processing metadata, and profiles.
5. Delete Supabase Auth user last.
6. Record safe completion status without raw identifiers, content, object keys, provider ids, or private data.

### Provider Cleanup in v1

Provider cleanup is required only for provider resources actually created by v1. For v1 this means normal voice resources and normal model audio provider-side resources where the provider offers deletion or cleanup semantics. OpenAI transcription and Azure pronunciation processing must be described in policy, but they do not create Brush-up voice variants in v1.

If a provider cleanup stage cannot prove deletion or safe non-applicability, Store submission stays blocked or must be explicitly accepted as a narrower test-phase warning by the release owner.

## Store Submission Inputs

Before App Store / Google Play submission, v1 needs:

- Privacy Policy URL.
- Terms URL if required by distribution plan.
- Support URL.
- Account deletion request URL.
- Reviewer account and reviewer instructions.
- App Privacy answers that match v1 data collection and processing.
- Google Data Safety answers that match v1 data collection and processing.
- AI provider disclosure covering OpenAI, Azure, ElevenLabs, Supabase, and Vercel as applicable.
- Account deletion support and completion expectations.
- No screenshots, metadata, reviewer notes, or public copy that present Brush-up as available in v1.

Likely Store data categories include account identifiers, user-generated scripts, audio/voice recordings, transcripts, pronunciation scores, feedback, generated model audio, voice samples, consent recordings, support/deletion request metadata, usage/quota metadata, and diagnostics/log metadata if collected.

## Risk Classification

### Release Blockers

- Final Privacy Policy, Terms, Support, and account deletion copy for the v1 feature set.
- Public Privacy Policy URL, Support URL, and account deletion request URL.
- App Privacy / Google Data Safety answers matching the implemented v1 behavior.
- Actual account/data deletion completion path for v1.
- Disposable deletion proof for v1 data and provider resources.
- Provider cleanup proof or safe non-applicability for normal v1 voice resources.
- Provider kill switch readiness for OpenAI, Azure, ElevenLabs normal voice, and Storage uploads, unless explicitly accepted for a narrower test phase.
- Reviewer account and reviewer instructions.

### Implementation Blockers

- Any discovered need for DB schema or API contract changes not yet scoped.
- Any deletion stage that cannot re-fetch owned data server-side.
- Any cleanup stage that would expose raw provider data, transcript body, audio path, object key, credential, or private identifier in UI, logs, or proof.
- Any account deletion flow that deletes Supabase Auth before app-owned cleanup is complete.
- Any provider cleanup requirement that lacks a safe service boundary for the v1 feature set.

### Human Confirmation Required

- Final support contact, support URL, privacy URL, and deletion URL.
- Legal or release-owner approval of Privacy Policy and Terms.
- Store reviewer account and reviewer notes.
- App Privacy / Google Data Safety answers.
- Provider kill switch operation proof.
- Provider cleanup / deletion / retention confirmation for normal voice resources.
- Disposable deletion proof result.
- Azure alert or accepted manual monitoring owner.

### Gate 6 Release QA

- Mobile browser / future WebView recording and upload.
- Protected replay for normal generated model audio and saved recordings.
- Account deletion request and status flow.
- Provider failure recovery and safe error copy.
- Support links, legal links, and deletion request page smoke.
- Monitoring and logs redaction check.
- Reviewer account smoke.

### v1.1 Deferred

- Brush-up UI and entry points.
- Selected best take used as script-scoped voice material.
- Brush-up explicit consent and revoke UI.
- Brush-up script-scoped voice variants.
- Brush-up generated audio candidates and acceptance.
- Brush-up-specific provider cleanup, retention, deletion, cost, latency, and retry proof.
- Brush-up-specific account deletion proof.
- Brush-up-specific App Privacy / Data Safety updates.

## Recommended Implementation Order

1. Finalize docs and copy contract.
   - Privacy Policy, Terms, Support, account deletion instructions, Store disclosure source notes, and no-Brush-up v1 copy guardrails.
2. Finish Settings / Account navigation and status copy.
   - Link legal/support/deletion surfaces and make request/status states understandable.
3. Add or revise consent and notice UI copy.
   - Recording consent, AI provider usage notice, normal voice sample / consent recording notice, and model audio notice.
4. Review account deletion request / confirmation / status behavior.
   - Keep route handlers thin, re-fetch owned data server-side, and preserve safe summaries only.
5. Prepare deletion dry-run and proof checklist for v1 data.
   - Confirm provider -> Storage -> DB -> Auth order and proof template.
6. Run disposable deletion proof.
   - Record safe evidence only; do not record raw ids, content, paths, provider payloads, or secrets.
7. Run Gate 6 release QA.
   - Confirm legal/support links, consent surfaces, protected replay, provider failure recovery, deletion proof, Store metadata, and reviewer flow.

## Stop Conditions for Future Implementation

Stop and rescope before implementation if:

- DB schema / migration changes are required.
- API route or API contract changes are required.
- Provider cleanup semantics require new provider integration behavior.
- Production env or dashboard changes are required.
- Brush-up needs to re-enter v1 scope.
- Legal review changes the product claims or deletion commitments.
- Any secret, provider raw response, transcript body, private audio path, object key, or credential-like value would be exposed in UI, logs, docs, or proof.

## Handoff

Next work can implement Gate 4a only for the locked v1 feature set. Brush-up stays v1.1. Capacitor should wait until v1 privacy/deletion/consent behavior and proof are stable enough for Store-facing claims.
