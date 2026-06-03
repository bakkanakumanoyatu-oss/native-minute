# Gate 5b Store Metadata / Reviewer Instructions / Privacy Draft Mapping

Status: `draft_ready_human_review_required`

Gate 5b prepares draft Store metadata, reviewer instructions, and App Privacy / Google Data Safety mapping for Native Minute v1.

This is draft/planning only. It is not legal approval, Store Console submission, App Privacy final answer, Google Data Safety final answer, screenshot creation, icon creation, Capacitor work, provider execution, account deletion execution, provider cleanup, env/dashboard operation, or Brush-up implementation.

Brush-up remains deferred to v1.1. Do not claim Brush-up as a v1 feature in Store metadata, screenshots, reviewer notes, privacy disclosures, support copy, or in-app release copy.

## Store Metadata Draft

### App Name Candidates

- `Native Minute`
- `Native Minute English`
- `Native Minute: 1-Minute English`

Decision: `human_required`. Confirm final Store naming, localization, trademark comfort, and platform title length before submission.

### Subtitle / Short Description Draft

Options:

- `Practice English speaking in one minute.`
- `Listen, record, review, and improve.`
- `A tiny English speaking practice loop.`

Avoid claiming native packaging, guaranteed improvement, official assessment, or Brush-up availability.

### Long Description Draft

Native Minute helps you practice short English speaking sessions with a fixed one-minute loop.

Create or choose a short practice script, listen to a model voice, record your own take, and review feedback that helps you decide what to try next. Your review may include a transcript, pronunciation feedback, weak words, and coaching notes intended as learning support.

The v1 release focuses on the core practice loop:

- create a short script;
- listen to normal model audio;
- record a practice take;
- receive transcription and pronunciation feedback;
- review the result;
- track latest and best takes in progress;
- manage voice setup, privacy, support, and account deletion request paths.

Native Minute uses server-side provider boundaries for transcription, pronunciation evaluation, normal model audio, storage, and replay. The app is designed to keep provider keys out of the client and to use app-owned storage/replay paths for user audio and generated model audio.

This draft is for human review. Final Store copy must match the implemented v1 behavior, final Privacy Policy, final Terms, final Support URL, final account deletion request URL, and final App Privacy / Google Data Safety answers.

### Keywords Draft

Draft keyword pool:

- English speaking
- pronunciation
- listening
- recording
- shadowing
- speaking practice
- AI feedback
- language learning
- one minute practice
- voice practice

Decision: `human_required`. Final keywords must be checked against platform rules, localization, and claims.

### Category Draft

Primary category candidates:

- Education
- Productivity

Recommended draft: `Education`, because the core use is language learning practice.

Decision: `human_required`. Confirm final platform category options in App Store Connect / Google Play Console before submission.

### Age Rating Considerations

Draft considerations:

- The app handles user-created text and user audio recordings.
- AI feedback is a learning aid and not an official ability assessment.
- The app does not intentionally provide adult, medical, regulated, gambling, or location-tracking content in v1.
- User-generated scripts could contain user-entered content; Terms / moderation / acceptable-use copy must remain consistent.
- Final age rating questionnaire answers are `human_required`.

Do not treat this draft as final age rating guidance.

### Required URLs

| URL | Status | Notes |
| --- | --- | --- |
| Support URL | `human_required` | Must point to final support surface / inbox policy approved for Store review. |
| Privacy Policy URL | `human_required` | Must point to final public Privacy Policy. |
| Account deletion request URL | `human_required` | Must point to final public account deletion request/help path. |
| Terms URL | `human_required` | Include if required or desired for the distribution plan. |

### Screenshot Candidates

Candidate surfaces:

1. Home / practice entry.
2. `/scripts` practice library.
3. `/scripts/new` script creation.
4. `/scripts/[id]/listen` normal model audio.
5. `/scripts/[id]/record` recording.
6. `/scripts/[id]/review/[takeId]` feedback summary.
7. `/progress` latest / best progress.
8. `/settings` legal/support/account deletion request links.

Screenshot requirements:

- Use a safe demo or reviewer account only.
- Do not show private transcript text, private recordings, email addresses, raw provider responses, storage paths, provider ids, or secrets.
- Do not show Brush-up as a v1 feature.
- Final screenshot set is `human_required`.

### Expressions to Avoid

Do not use:

- `native app` or `native-quality app` before Capacitor/native packaging is complete and reviewed.
- `guaranteed improvement`.
- `perfect pronunciation scoring`.
- `official ability assessment`.
- `medical`, `clinical`, `school-certified`, or institution-level claims.
- `native speaker replacement`.
- `Brush-up is available` or any wording that says best takes become v1 voice material.
- claims that account deletion is complete before disposable proof and destructive path approval.

Safer alternatives:

- `practice support`;
- `learning feedback`;
- `one-minute speaking loop`;
- `model audio`;
- `review your latest and best takes`;
- `account deletion request path`.

## Reviewer Instructions Draft

Status: `draft_human_review_required`.

Reviewer account: `human_required`.

Draft reviewer flow:

1. Open the production URL or native build URL supplied in the review notes.
2. Sign in with the provided reviewer account using the approved login method.
3. Open `/scripts`.
4. Create a new practice script from `/scripts/new`, or use a pre-created reviewer script.
5. Open listen for the script and play or generate normal model audio.
6. Open record and create a short practice recording.
7. Run evaluation.
8. Open review and confirm feedback appears as learning support.
9. Open progress and confirm latest / best continuity.
10. Open `/setup/voice` only if reviewer instructions include voice setup review.
11. Open `/settings`.
12. Confirm Privacy Policy, Terms, Support, and account deletion request/help are reachable.
13. Do not expect Brush-up in v1. Brush-up is planned for v1.1 and is intentionally out of this release.

Provider disabled / failure note:

- If a provider is paused or unavailable, the app should show safe recovery copy instead of secrets, raw provider responses, or private paths.
- Reviewer should not need provider dashboard access.
- Any provider-disabled proof should be performed only by the release owner or operator, not by Store reviewers.

Account deletion note:

- v1 exposes account deletion request / confirmation / dry-run / proof-first surfaces.
- Final Store submission must not claim actual deletion completion until the disposable proof and destructive path approval are complete.
- If the review requires a live deletion proof, use a disposable account only and follow the later Gate 4h / destructive proof gates.

## App Privacy / Google Data Safety Draft Mapping

This mapping is a draft for human review. It is not the final App Store Connect or Google Play Console answer.

| Data / processing area | Collected or processed in v1 | Purpose | Storage / provider path | Disclosure note |
| --- | --- | --- | --- | --- |
| Account data | yes | account management, login, support, deletion request | Supabase Auth / DB | Final identifiers and retention wording are `human_required`. |
| Scripts | yes | app functionality, practice content, review continuity | Supabase DB; optional Script Studio generation through OpenAI path | Do not record script bodies in QA evidence. |
| Recordings | yes | practice evaluation, review, replay, progress, deletion proof | Supabase Storage `recordings`; server-side evaluation flow | User audio is core v1 data. |
| Transcripts | yes | review, feedback, progress | DB / evaluation result path; OpenAI transcription may process audio | Treat as user content / derived learning data. |
| Pronunciation scores | yes | AI evaluation / learning feedback | DB review/progress path; Azure pronunciation evaluation | Learning aid, not official ability judgment. |
| Weak words | yes | review and practice guidance | DB review/progress path | Derived learning feedback. |
| Coaching feedback | yes | learning support / next-step guidance | DB review/progress path; OpenAI or internal provider path as applicable | Learning aid, not guarantee or official judgment. |
| Normal model audio | yes | listen practice, app-owned replay | ElevenLabs normal voice path; Supabase Storage `script-audios`; protected replay | v1 normal model audio only. |
| Voice samples / consent recordings | possible / yes when voice setup is used | normal voice setup, normal model audio, consent proof | Supabase Storage `voice-samples` / `voice-consents`; server-side provider boundary | Do not imply Brush-up or best-take material use in v1. |
| Supabase Storage metadata | yes | storage, replay, deletion dry-run/proof | Supabase Storage / DB metadata | Do not expose object keys or private paths in evidence. |
| Support metadata | possible | user support and deletion help | support surface / account deletion request path | Final support workflow is `human_required`. |
| Account deletion request | yes | account management, deletion support, proof-first flow | Supabase DB request/status path | Actual deletion proof remains pending. |
| OpenAI transcription | yes / possible depending configuration | transcription, Script Studio generation, coaching-adjacent support | server-side provider boundary | API keys never client-side; final provider disclosure is `human_required`. |
| Azure pronunciation evaluation | yes / possible depending configuration | pronunciation evaluation | server-side provider boundary | Final region/resource availability and Data Safety wording are `human_required`. |
| ElevenLabs normal voice path | yes / possible when voice setup/model audio is used | normal model audio / voice setup | server-side provider boundary; app-owned replay | Brush-up is excluded from v1. |
| Brush-up data | no in v1 | not applicable | v1.1 deferred | Must not be included as a v1 claim. |

### Data Use Purpose Draft

| Purpose | v1 status | Notes |
| --- | --- | --- |
| App functionality | yes | main loop, scripts, audio, evaluation, review, progress, settings. |
| AI evaluation / learning feedback | yes | transcription, pronunciation scoring, weak words, coaching notes. |
| Account management | yes | login, settings, deletion request/status. |
| User support | yes / possible | support and deletion help path; final owner/URL required. |
| Storage / replay | yes | app-owned Storage and protected replay for recordings/model audio. |
| Analytics | `human_required` | Do not claim analytics status without final implementation and disclosure review. |
| Advertising | no known v1 claim | Do not add advertising claims without explicit implementation/review. |
| Tracking across apps/sites | no known v1 claim | Final console answers are `human_required`; do not infer beyond repo. |

## Human Required

- Final legal approval for Store metadata, Privacy Policy, Terms, and provider/data disclosures.
- Final support email / support URL / support owner.
- Final Privacy Policy URL.
- Final account deletion request URL.
- Final Terms URL if used.
- Reviewer account and reviewer instructions.
- Final App Privacy answers in App Store Connect.
- Final Google Data Safety answers in Google Play Console.
- Final screenshots and screenshot data redaction review.
- Final countries / regions.
- Final age rating answers.
- Final category and keyword choices.
- Final confirmation that Brush-up is absent from v1 Store claims.
- Final confirmation that account deletion claims match actual proof status.

## Non-Submission Boundary

Gate 5b did not:

- operate App Store Connect;
- operate Google Play Console;
- submit App Privacy or Data Safety answers;
- create screenshots;
- create app icons;
- introduce Capacitor;
- run QA;
- rerun Gate 4h;
- execute account deletion;
- delete Supabase Auth users;
- remove Storage objects;
- delete, update, or anonymize DB rows;
- call provider APIs;
- call provider cleanup;
- change env or dashboards;
- implement Brush-up.
