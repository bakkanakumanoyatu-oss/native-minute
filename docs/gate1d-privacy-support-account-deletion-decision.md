# Gate1d Privacy / Support / Account Deletion Decision

Gate1d は、Native Minute v1 を Web production / Store submission へ進める前に、privacy / terms / support / account deletion / data deletion の公開方針を固定する decision memo です。ここでは destructive deletion job、DB migration、RLS policy、Storage policy、provider cleanup、Supabase Auth deletion は実装しません。

This is a developer draft, not final legal text. Before App Store / Google Play submission, the current official requirements must be rechecked and final policy wording should be reviewed by the responsible human / legal reviewer.

Official references checked for this decision:

- Apple: [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) and [Offering account deletion in your app](https://developer.apple.com/support/offering-account-deletion-in-your-app/).
- Google Play: [Understanding Google Play's app account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en-EN) and [User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en).

## Provider Roles

- ElevenLabs: voice clone / model audio generation.
- OpenAI: transcription / Script Studio generation / coaching-adjacent generation.
- Azure Speech: pronunciation evaluator.
- Supabase: Auth / database / private Storage / protected replay.

## Decision Summary

- Web beta / private small cohort can use the current request-based deletion flow plus documented support/manual cleanup operation, as long as the app publishes privacy / terms / support pages and clearly says actual deletion is handled by a support-backed process.
- Web public should not launch broadly until the deletion completion path is operationally defined and support can complete app data, Storage, provider voice, and Auth cleanup within the stated SLA.
- Store submission should treat actual account/data deletion completion as a blocker. Request creation / confirm / dry-run alone is not enough for a review-ready v1, because the app supports account creation and stores user audio, transcript, score, and cloned voice data.
- Recommended path: keep request-based deletion + server-side job architecture, then implement actual cleanup in the existing order: provider cleanup -> Storage cleanup -> DB cleanup -> Supabase Auth deletion -> completion/status notification.

## User Data Inventory

| Data | Location | Processor / surface | Current deletion state |
| --- | --- | --- | --- |
| Auth account / email | Supabase Auth | Supabase | Auth deletion dry-run only. Actual Auth user deletion not implemented. |
| Profile | `profiles` | Supabase DB | DB dry-run counts only. |
| Scripts | `scripts` | Supabase DB; OpenAI may receive seed/draft input during generation | DB dry-run counts only. Script text is not returned by deletion dry-run APIs. |
| Recordings | `takes` metadata + `recordings` bucket | Supabase Storage; OpenAI transcription; Azure evaluator | Storage / DB dry-run counts only. Actual object deletion not implemented. |
| Transcripts | `takes.transcript_text` and review-derived display | Supabase DB; OpenAI transcription output | DB dry-run counts only. Raw transcript is not returned by deletion dry-run APIs. |
| Pronunciation scores | `takes` scalar score fields | Supabase DB; Azure evaluator output | DB dry-run counts only. |
| Weak words | `weak_words` | Supabase DB; Azure / review service derived | DB dry-run counts only. |
| Coaching feedback | `coach_feedback` | Supabase DB; current v1 helper/coaching-adjacent logic | DB dry-run counts only. |
| Saved best takes | `script_saved_best_takes` | Supabase DB | DB dry-run counts only. |
| Generated script audios | `script_audios` + `script-audios` bucket | Supabase DB/Storage; ElevenLabs TTS | Storage / DB dry-run counts only. Actual object deletion not implemented. |
| Saved model audios | `script_saved_model_audios` | Supabase DB | DB dry-run counts only. |
| Voice samples | `voice-samples` bucket and `voices.sample_audio_path` | Supabase Storage; ElevenLabs clone input | Storage / DB dry-run counts only. Actual object/provider cleanup not implemented. |
| Consent recordings | `voice-consents` bucket + `voice_consents` | Supabase Storage/DB | Dry-run only. Account deletion policy should delete them unless a short retention period is explicitly disclosed. |
| Clone voice metadata | `voices` (`provider`, `provider_voice_id`, safe metadata) | Supabase DB; ElevenLabs provider-side voice | ElevenLabs cleanup dry-run counts candidates but does not return provider voice IDs. Actual provider delete not implemented. |
| Provider processing metadata | quota metadata, safe request IDs in logs, provider-specific failure points | App DB/logs | Raw provider responses are not intentionally persisted. Quota/log retention policy still needs final decision. |
| Quota events | `quota_events` | Supabase DB | v1 policy: delete during account deletion unless a short anonymous retention period is required and disclosed. Actual delete/anonymize not implemented. |
| Account deletion requests | `account_deletion_requests` | Supabase DB | Request/status/confirm and dry-runs implemented. Completed request may retain anonymized reference/status for short-term support tracking. |

## External Processor Map

| Processor | Data sent | Data stored by Native Minute | Raw response policy |
| --- | --- | --- | --- |
| Supabase | Auth, app DB rows, private Storage objects, request/session cookies | Main app data, Storage audio, account deletion request state | App stores first-party data; dry-run APIs return counts/safe summary only. |
| OpenAI | Recording audio for transcription; Japanese seed/brief for Script Studio generation; possible coaching-adjacent input in future | Transcript / generated draft only where user saves or review persists; quota metadata uses safe counts/lengths | Raw OpenAI response, auth header, secret, raw prompt/seed/full generated text are not returned or stored in quota metadata. |
| Azure Speech | Audio file and script/reference text for pronunciation assessment | Scores, weak words, review summary fields | Raw Azure payload/session detail is not persisted or returned. |
| ElevenLabs | Voice sample for cloning; script text and provider voice reference for model audio generation | `voices` metadata, app-owned generated audio, `script_audios` cache rows | Raw ElevenLabs response body is not persisted. Provider voice ID is stored server-side but not exposed in deletion dry-run responses. |
| Browser/local state | Form state, MediaRecorder blobs before upload, auth/session cookies | No intended long-lived local audio archive | Local artifacts should not be committed or copied into docs/logs. |

## Current Account Deletion Implementation Status

Implemented:

- Settings UI for account deletion request / confirm / status.
- `POST /api/account/deletion-request`.
- `POST /api/account/deletion-confirm`.
- `GET /api/account/deletion-status`.
- `GET /api/account/deletion-inventory`.
- `GET /api/account/deletion-provider-dry-run`.
- `GET /api/account/deletion-storage-dry-run`.
- `GET /api/account/deletion-database-dry-run`.
- `GET /api/account/deletion-auth-dry-run`.
- `GET /api/account/deletion-job-dry-run`.
- Server-side `anonymized_user_ref` and metadata generation.
- Direct authenticated client insert is closed; RLS is own read only.
- Dry-run responses use safe counts and do not return row IDs, raw Storage paths, signed URLs, provider voice IDs, raw provider payloads, scripts, transcripts, auth payloads, sessions, email, or secrets.

Not implemented:

- Actual ElevenLabs provider voice delete.
- Actual Storage object delete.
- Actual DB row delete / update / anonymize.
- Actual `quota_events` delete / anonymize.
- Actual consent recording deletion.
- Actual Supabase Auth user deletion.
- Actual background/cron deletion job runner.
- Completion notification.
- Public web deletion request URL.
- Final Privacy Policy / Terms / Support pages.

## Web Beta / Web Public / Store Classification

| Milestone | Acceptable | Blocker |
| --- | --- | --- |
| Web beta (`private_beta` / `small_cohort`) | Current request-based flow can be acceptable if support operation and SLA are explicit, Privacy / Terms / Support pages are published as drafts, and users can request deletion from Settings. | No public support contact, no deletion SLA, or no human process to complete cleanup. |
| Web production before broad public | Needs production support process, published policies, public deletion request URL, production Supabase/RLS proof, provider budget proof, and manual cleanup or implemented cleanup runbook. | Broad public launch with only dry-run and no actual completion process. |
| Store submission | Needs in-app deletion initiation, a web deletion request resource for Google Play, public Privacy Policy / Support URLs, Apple privacy / Google Data safety answers, and an actual deletion completion path. | Dry-run-only deletion flow; provider-side ElevenLabs cleanup not operable; Storage/DB/Auth cleanup cannot be completed. |
| v1.1+ | Granular per-object deletion, export, automated retention lifecycle, admin dashboard. | Not required for v1 if full account deletion can be completed. |

## Recommended Account Deletion Path

Adopt option C:

1. Web beta may continue with request-based deletion + support/manual operation, but only as a small cohort and only with clear disclosure.
2. Store submission must be blocked until an actual account/data deletion completion path exists.
3. Keep the RR-2 architecture: request-based deletion + server-side deletion job.
4. Execute destructive cleanup in this order:
   - ElevenLabs provider cleanup.
   - Supabase Storage cleanup.
   - Supabase DB cleanup.
   - Supabase Auth user deletion.
   - Completion status / notification.
5. Stop on provider cleanup failure with `provider_cleanup_failed`; require manual retry/support fallback.
6. Stop on Storage cleanup failure with `storage_cleanup_failed`; do not delete DB/Auth while app-owned audio objects are unresolved.
7. Stop on DB cleanup failure with `db_cleanup_failed`.
8. Stop on Auth cleanup failure with `auth_cleanup_failed`.
9. Supabase Auth deletion remains last so owned app data can be re-fetched server-side until cleanup is complete.

RR-3a follow-up:

- `docs/rr-3a-account-deletion-actual-implementation-plan.md` fixes the implementation plan for this path.
- The plan defines stage behavior, failure status, retry/manual fallback, safety gates, and smoke checklist.
- RR-3b adds the guarded ElevenLabs provider cleanup service / adapter boundary behind `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE=1`.
- It does not add a public actual cleanup route and normal checks do not run real ElevenLabs delete. Storage delete, DB delete/anonymize, and Supabase Auth deletion remain Store submission blockers.

## Privacy / Terms / Support Route Plan

Routes to add before Web production:

- `/privacy`
  - Developer/app identity.
  - Data collected: account email, scripts, recordings, transcripts, scores, weak words, coaching feedback, generated audio, voice samples, consent recordings, provider processing metadata, quota/account deletion records.
  - Processors: Supabase, OpenAI, Azure Speech, ElevenLabs.
  - Retention and deletion policy.
  - Contact/support mechanism.
- `/terms`
  - Free v1 status.
  - No medical/legal/education certification claims.
  - AI/provider output limitations.
  - User responsibility for uploaded/entered content.
  - Account deletion and support references.
- `/support`
  - Support contact.
  - Known troubleshooting: login magic link rate limit, microphone permission, recording length, provider outage/kill switch.
  - Link to account deletion request.
- `/support/account-deletion` or `/account/delete`
  - Public web deletion request resource.
  - Authenticated users should be directed to Settings.
  - Non-authenticated requesters can contact support with the email associated with the account.
  - No secrets, tokens, audio files, transcripts, or provider IDs should be requested through the public form.
- `/settings`
  - Keep in-app account deletion entry.
  - Add links to Privacy / Terms / Support when those pages exist.

For Capacitor later, Settings must expose privacy, terms, support, and account deletion links inside the app shell.

## Consent / Disclosure Gaps

Before Web production:

- Recording disclosure: microphone audio is uploaded to Supabase Storage and may be sent to OpenAI transcription and Azure Speech pronunciation assessment.
- Voice setup disclosure: voice sample / consent recording are stored by Native Minute and sample audio is sent to ElevenLabs to create a cloned voice.
- Script generation disclosure: seed/brief text is sent to OpenAI when real Script Studio generation is enabled.
- Model audio disclosure: script text is sent to ElevenLabs to generate model audio and the generated audio is stored in private app Storage.
- Retention: recordings, transcripts, scores, generated audio, voice samples, consent recordings, quota events, and deletion requests need a published retention statement.
- Withdrawal/deletion: Settings request exists, but actual completion path is not implemented yet.
- Support contact and deletion completion SLA must be defined.
- Privacy/data safety declarations must say that raw provider responses are not intentionally stored by Native Minute, while third-party processors may process data under their own terms.

## Store Declaration Attention

Likely Apple / Google Play declaration areas to prepare:

- Account identifiers / email.
- User-generated content: scripts and free writing / AI seed input.
- Audio recordings / voice samples / consent recordings.
- Transcripts and speech/pronunciation-derived results.
- App activity / product interaction if quota events or diagnostics are considered usage data.
- Third-party processing by Supabase, OpenAI, Azure, ElevenLabs.
- Data deletion and retention policy.
- Public privacy URL, support URL, and account deletion URL.

Final Apple Privacy Details and Google Play Data safety answers require human review against the latest official forms.

## Human Decisions Before Implementation

- Support email / URL owner and expected response time.
- Web beta deletion SLA.
- Whether Web beta uses manual provider/Storage/DB/Auth cleanup or waits for destructive job implementation.
- Whether completed deletion requests are retained, and for how long.
- Whether quota/log records are deleted or anonymized if security/abuse prevention requires short retention.
- Whether consent recordings are deleted immediately on account deletion or retained briefly for legal/support reasons.
- Whether public deletion URL is `/support/account-deletion` or `/account/delete`.
- Final Privacy Policy / Terms wording and jurisdiction-specific obligations.

## Next Implementation Candidates

1. Gate1e: add public Privacy / Terms / Support / Account deletion route drafts, without destructive cleanup. **Done.**
2. RR-3a: actual account deletion job implementation plan split by stage. **Done as plan.**
3. RR-3b: provider cleanup actual implementation with dry-run-to-live guard. **Done as guarded boundary.**
4. RR-3c: Storage cleanup actual implementation with object count proof.
5. RR-3d: DB cleanup + quota event delete/anonymize implementation.
6. RR-3e: Supabase Auth deletion and completion notification.

Recommended next step: RR-3c if Store submission readiness is the immediate goal; production-like human QA execution if Web beta is the immediate goal.
