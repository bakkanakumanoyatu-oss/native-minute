# Gate 2 Privacy / Consent / Deletion Plan

Gate 2 fixes the privacy, terms, consent, revoke, and account deletion planning required before Native Minute can move further toward App Store / Google Play submission. This is a docs/design-only review. It does not implement account deletion, Brush-up, provider calls, DB schema, API contracts, UI, Capacitor, or infrastructure changes.

## Scope

Current premise:

- Gate 1 Web beta production smoke is human-confirmed `PASS`.
- Gate 1.5 voice / clone voice / Brush-up architecture review is complete.
- Brush-up is a v1 adoption candidate, not a distant optional feature.
- v1 remains a free release candidate, but Store submission must be reviewable for privacy, account deletion, data safety, and provider disclosure.

Non-goals:

- Final Privacy Policy / Terms legal wording.
- Account deletion / revoke implementation.
- DB migration or API contract design finalization.
- ElevenLabs clone voice or Brush-up implementation.
- Production environment, Vercel, provider, or Capacitor changes.

## Current Coverage

Already present:

- Web beta draft routes: `/privacy`, `/terms`, `/support`, `/support/account-deletion`.
- In-app account deletion request / confirm / status flow.
- Account deletion inventory and provider / Storage / DB / Auth dry-run APIs with safe count-only summaries.
- Guarded service boundaries for provider, Storage, DB, and Supabase Auth cleanup.
- Internal operator design, fake-only rehearsal, disposable proof templates, and raw-data-free proof rules.
- Voice setup uses app-owned voice sample / consent recording Storage and server-side provider boundaries.
- Generated model audio is staged into app-owned replay instead of relying on provider direct URLs.

Still incomplete for Store submission:

- Final human/legal review of Privacy Policy, Terms, support wording, and store declarations.
- Public actual account/data deletion completion path and disposable live proof.
- Provider cleanup proof for normal cloned voices and future Brush-up script-scoped voice variants.
- Brush-up-specific explicit consent, revoke, delete, and provider disclosure implementation.
- App Privacy / Google Data Safety answers verified against final implemented behavior.

## Gate 2 Decision

- Normal recording/evaluation consent and Brush-up material consent must be separate.
- Brush-up consent must be explicit, script-scoped, and tied to the selected best take before any best take audio is sent to a provider as voice material.
- Account deletion must cover normal practice data, voice setup data, generated audio, provider-side cloned voices, and future Brush-up artifacts.
- Revoke must be available for Brush-up material use independently from deleting the original take/review.
- Store submission remains blocked until actual deletion and provider cleanup are proven with a disposable live proof.

## Data Inventory

| Data | Collected / derived | Purpose | App storage | Provider / processor | User explanation | Account deletion | Revoke behavior |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Account / auth | Supabase Auth account and email | Login, ownership, support/deletion flow | Supabase Auth, `profiles`, deletion request rows | Supabase | Account is needed to keep scripts, recordings, and progress private. | Delete Auth last after provider / Storage / DB cleanup; retain only short-term anonymized deletion tracking if policy allows. | Not applicable outside full account deletion. |
| Scripts | User-created or AI-assisted practice text | Practice, model audio, evaluation reference | `scripts` | OpenAI if Script Studio real generation is used; ElevenLabs when generating model audio; Azure as reference text for evaluation | Script text is used to create and assess 1-minute practice. | Delete user-owned scripts after dependent data cleanup. | Not applicable, except deleting or replacing script should not erase already persisted deletion obligations. |
| Recording audio / takes | User microphone or uploaded practice audio | Playback, transcription, pronunciation evaluation, best take selection | `recordings` bucket, `takes` metadata | OpenAI transcription, Azure pronunciation | Recordings are uploaded for evaluation and saved for review/progress. | Delete recording objects and take rows. | Normal recording use can be stopped by account deletion; future per-take delete is optional unless Brush-up uses that take. |
| Transcripts | Text derived from recording audio | Review and progress display | `takes.transcript_text` | OpenAI | Transcript is generated from recordings to help review practice. | Delete with take/review data. | Delete if linked to deleted take/account. |
| Pronunciation scores / weak words | Score and word-level evaluation data | Review, progress, next practice focus | `takes`, `weak_words` | Azure Speech | Scores are practice guidance, not official certification. | Delete with review/progress rows. | Delete if linked to deleted take/account. |
| Coaching feedback | Short summary / next step | Review guidance | `coach_feedback` | Current helper; OpenAI if coaching is formalized | Coaching is practice advice and may vary by provider/result quality. | Delete with review data. | Delete if linked to deleted take/account. |
| Generated model audio | Provider-generated exemplar audio | Listen and replay | `script_audios`, `script-audios` bucket, saved model audio rows | ElevenLabs or future approved voice provider | Model audio is generated from script text and stored by the app for replay. | Delete Storage objects, DB rows, saved pins, and cleanup provider-side artifacts if provider stores them. | If generated from revoked voice material, conservative v1 policy should delete or hide the generated Brush-up audio. |
| Voice sample audio | Voice setup sample | Create cloned voice | `voice-samples` bucket, `voices.sample_audio_path` | ElevenLabs | Voice sample is used to create the user voice for model audio. | Delete sample object and local metadata; delete provider cloned voice. | Voice setup revoke should stop future use and delete provider voice/sample if offered separately from account deletion. |
| Consent recording | Voice setup consent proof | Prove user consent for cloned voice | `voice-consents` bucket, `voice_consents` | Supabase; provider if required by provider workflow | Consent recording proves permission to use the voice sample. | Delete unless a human-approved short retention period is disclosed. | Voice setup revoke should delete/disable consent-linked provider voice and stop future generation. |
| Provider voice metadata | Provider name, server-only voice reference, local owner linkage | Server-side provider calls and cleanup | `voices` and future voice variant rows | ElevenLabs or future voice provider | Provider identifiers are stored server-side and are not shown as user content. | Delete local rows after provider cleanup; never expose provider IDs in proof. | Revoke should mark disabled/revoked and trigger provider cleanup. |
| Audio Library pins | Saved best takes and saved model audios | Script-scoped curation | `script_saved_best_takes`, `script_saved_model_audios` | None directly | Users can save useful takes/audio without duplicating ownership authority. | Delete pin rows before parent rows or through cascade. | Remove pins if underlying audio is deleted or revoked. |
| Brush-up source material | Selected best take audio, selected explicitly by user | Script-scoped voice material for improved model audio | Existing `recordings` object plus future Brush-up consent/material rows | ElevenLabs or approved provider via server-side route | User explicitly allows a chosen best take to be used as script-specific voice material. | Delete future Brush-up material rows, copied source material, and provider-side source references. Original take can be deleted as part of account deletion. | Stop future provider use, delete provider-side source/material if possible, and remove generated Brush-up artifacts; keep original take/review unless the user deletes account or future take-delete covers it. |
| Brush-up voice variant | Script-scoped derived voice or provider voice reference | Generate improved exemplar for one script | Future `script_voice_variants` / `brushup_voice_variants` | ElevenLabs or approved provider | Brush-up voice is limited to one script and does not replace default voice. | Delete local variant row and provider-side voice/model. | Delete/disable the variant and prevent future generation. |
| Brush-up generated audio | Improved exemplar generated from script + Brush-up voice/material | Listen to a more self-like, native-ish model for the same script | Future candidate rows or `script_audios`, `script-audios` bucket | ElevenLabs or approved provider | Brush-up audio is generated from explicitly consented material and stored by Native Minute for replay. | Delete Storage objects, DB rows, saved model pins, and provider references. | Conservative v1 policy: delete or hide generated Brush-up audio and saved pins after revoke. |
| Quota / processing metadata | Safe provider status, counts, cache flags, failure codes | Cost guard, operations, support | `quota_events`, safe logs | App services; provider dashboards outside app | Metadata helps operate provider cost and reliability without storing raw provider payloads. | Delete by v1 default unless a disclosed anonymized short retention policy is approved. | Not usually consent-revoked unless linked to deleted/revoked artifact and policy chooses deletion. |
| Support / deletion request records | Request status, anonymized ref, safe cleanup status | Support, deletion proof | `account_deletion_requests` | Supabase | Deletion requests track status without exposing content. | Retain only minimal anonymized tracking for a disclosed short period. | Not applicable. |

## Brush-up Consent Requirements

Brush-up needs a consent step separate from normal recording/evaluation because it changes the purpose of the best take audio.

Minimum consent copy must explain:

- Which specific script and selected take will be used.
- The selected best take audio will be used as voice material, not only as a practice recording.
- The material may be sent to the named voice provider through a Native Minute server-side route.
- The provider may create a script-scoped voice variant or equivalent generated audio.
- The result is limited to that script and does not replace the user's default voice.
- The original take/review remains part of practice history unless the user deletes the account or a future take deletion removes it.
- The user can revoke Brush-up material use, after which Native Minute stops future use and cleans up derived Brush-up artifacts where possible.
- Account deletion includes Brush-up consent, source material copies, provider voice variants, generated audio, and saved Brush-up pins.

Consent must not be bundled into a generic "record" button. v1 should require an explicit Brush-up action such as "Use this best take for Brush-up" and a confirmation step before server-side provider submission.

## Revoke Requirements

Brush-up revoke should:

- Stop future Brush-up generation for that script/material.
- Mark the Brush-up consent/material/variant as revoked in future data model.
- Delete or disable provider-side script-scoped voice variant.
- Delete copied source material if the implementation creates a separate Brush-up material object.
- Delete or hide generated Brush-up audio and saved model pins that depend on revoked material.
- Keep the original practice take, transcript, score, weak words, and review unless the user requests account deletion or future granular take deletion.
- Return safe status only; do not expose provider voice IDs, storage paths, signed URLs, raw transcript, or raw provider responses.

Voice setup revoke, if implemented separately from account deletion, should:

- Stop default cloned voice use for future model audio.
- Delete or disable the provider-side cloned voice.
- Delete local voice sample and consent recording unless a disclosed legal/support retention rule says otherwise.
- Decide whether previously generated non-Brush-up model audio remains playable; conservative Store-facing policy should be explicit and should not surprise users.

## Account Deletion Requirements

Account deletion must include:

- Supabase Auth account and `profiles`.
- Scripts and script-scoped curation.
- Recordings, takes, transcripts, scores, weak words, coach feedback, and saved best takes.
- Generated model audio DB rows and `script-audios` Storage objects.
- Voice samples, consent recordings, local voice rows, and provider-side cloned voices.
- Future Brush-up consents, source material rows, script-scoped voice variants, generated Brush-up audio, and saved pins.
- Quota / processing events unless a disclosed anonymized retention policy is approved.
- Support/deletion request state reduced to anonymized tracking only.

Deletion order remains:

1. Provider cleanup.
2. Supabase Storage cleanup.
3. Supabase DB cleanup / anonymize.
4. Supabase Auth deletion.
5. Completion / notification.

Supabase Auth deletion must remain last so server-side cleanup can continue to prove ownership from app data.

## Provider Cleanup Requirements

Provider cleanup must cover:

- ElevenLabs cloned voices created during voice setup.
- Future ElevenLabs script-scoped Brush-up voice variants or equivalent provider-side voice material.
- Future OpenAI custom voice resources if that provider path becomes real.
- Any provider-stored source audio or generated artifacts if the provider API exposes deletion or retention controls.

Native Minute must not:

- Ask the client to provide provider voice IDs, storage keys, row IDs, or cleanup targets.
- Send voice sample, consent recording, or best take audio directly from the client to OpenAI / ElevenLabs.
- Store raw provider responses, auth headers, signed URLs, or raw audio in docs, UI, quota metadata, or deletion proof.
- Depend on provider direct URLs for user replay.

## App Privacy / Google Data Safety Impact

Likely data categories to declare and review:

- Account identifiers and contact info if email/login is collected.
- User-generated content such as scripts, recordings, transcripts, saved practice results, and generated audio.
- Audio data / voice recordings, including voice samples, consent recordings, and best takes used for Brush-up.
- App activity or usage data if quota events, cache status, provider attempts, diagnostics, or logs are classified as usage/diagnostics.
- AI / speech processing by third-party processors: Supabase, OpenAI, Azure Speech, ElevenLabs, and Vercel hosting.
- Data deletion availability and retention timeline.
- Third-party processing disclosures for transcription, pronunciation assessment, script generation, coaching-adjacent generation, voice clone, model audio generation, and Brush-up.

Store-facing answers must match actual behavior at submission time. Draft pages are not enough for Store review if actual deletion completion and provider cleanup are still unproven.

## Policy / Terms / In-App Copy Requirements

Privacy Policy should explain:

- What account, script, audio, transcript, score, feedback, voice sample, consent recording, generated audio, Brush-up, and quota/support data is collected.
- Which provider processes each data type: Supabase, OpenAI, Azure Speech, ElevenLabs, and Vercel.
- That best take audio is not used for Brush-up voice material unless the user gives separate explicit script-scoped consent.
- Retention and deletion behavior, including account deletion, provider cleanup, and any short anonymized support tracking.
- That raw provider responses, secrets, auth headers, provider IDs, signed URLs, raw Storage paths, and raw audio are not intentionally exposed in user-facing proof.

Terms should explain:

- v1 is a free practice app and does not provide official language certification.
- AI, transcription, pronunciation assessment, and generated voice results can vary and may fail.
- Users must only use scripts, recordings, and voice samples they have rights to use.
- Brush-up requires permission to use the selected best take as script-scoped voice material.
- Account deletion and support processes are available, but Store submission requires actual completion proof.

In-app copy should explain at the point of action:

- Recording is uploaded for practice evaluation and review.
- Voice setup sample / consent recording is used to create an app-owned voice setup flow.
- Brush-up is a separate action that uses a selected best take as voice material for one script.
- Revoke stops future Brush-up use and removes derived Brush-up artifacts where possible.

Support URL / deletion request page should include:

- Support contact and expected response / completion targets.
- Authenticated users should start account deletion from Settings.
- Users who cannot login can contact support without sending passwords, magic links, provider IDs, storage paths, audio files, transcripts, or secrets.
- A clear statement that final Store-ready deletion must cover app data, Storage audio, provider voices/material, DB rows, Supabase Auth, and completion status.

## v1 Pre-Submit Blockers

- Final Privacy Policy / Terms / support copy review.
- Public privacy URL, support URL, and account deletion URL.
- In-app account deletion initiation plus actual account/data deletion completion path.
- Disposable live proof for provider -> Storage -> DB -> Auth cleanup.
- Brush-up consent, revoke, delete, and provider cleanup proof if Brush-up ships in v1.
- Data handling / AI provider disclosure for OpenAI, Azure, ElevenLabs, Supabase, and Vercel.
- Apple App Privacy and Google Play Data Safety answers aligned with final behavior.
- Provider cost guard, monitoring, and incident/support process ready for a free v1.
- Reviewer account and reviewer instructions that explain voice/audio behavior without exposing private data.

## v1.1 Or Later Candidates

These can be deferred if v1 has full account deletion and Brush-up v1 proof:

- Granular per-take deletion unrelated to Brush-up revoke.
- User data export.
- Automated retention lifecycle beyond Store-required deletion.
- Admin dashboard for deletion operations.
- Queue / worker / VPS for long-running cleanup, unless Vercel Functions prove insufficient before v1.
- OpenAI custom voice if entitlement and provider policy make it unsuitable for initial release.
- Detailed user-facing provider cost / usage dashboard.

## Gate Handoff

Gate 3 should take:

- Final provider roles, provider env, budget guard, kill switches, cleanup behavior, and failure recovery.
- Provider-side deletion / retention verification for ElevenLabs and any enabled OpenAI voice/custom voice path.
- Raw-response-free logging and monitoring requirements.

Gate 3.5 should take:

- Brush-up MVP implementation scope after Gate 2 policy is accepted.
- Data model candidates for Brush-up consent, script-scoped variants, generated audio candidates, and revoke status.
- Proof plan for consent -> provider submission -> app-owned replay -> revoke -> delete.
- Decision that Brush-up generated audio is deleted or hidden when consent is revoked; conservative v1 default is delete/hide rather than keep playable.

Gate 4 should not start until Gate 2, Gate 3, and any v1 Brush-up proof requirements are stable enough that mobile wrapper work will not hide privacy or deletion gaps.
