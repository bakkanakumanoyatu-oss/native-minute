# Gate 4i Privacy / Support / Deletion Release QA Checklist

Status: `checklist_ready`

Gate 4i defines the v1 release QA smoke checklist for privacy, terms, support, account deletion request, and consent / provider notice surfaces that can be reviewed without a disposable account.

Gate 4h remains blocked on `needs_human_disposable_account`. This checklist does not rerun Gate 4h, does not execute dry-run APIs against an account, and does not run actual deletion.

This gate does not run actual account deletion, Supabase Auth deletion, Storage deletion, DB destructive cleanup, provider cleanup, DB schema changes, API contract changes, env changes, dashboard operations, Capacitor work, Store submission work, or Brush-up work.

Brush-up remains deferred to v1.1 and must not be claimed as a v1 feature in public copy, Store metadata, screenshots, reviewer notes, or in-app notices.

## QA Status Values

Use only these status values in QA evidence:

- `pass`: the item is visible, reachable, and matches v1 behavior.
- `warn`: usable, but needs release-owner or legal follow-up before submission.
- `blocked`: cannot proceed without a required prerequisite.
- `not_applicable`: intentionally outside v1 scope.
- `human_required`: needs human approval, dashboard confirmation, final URL, final legal copy, disposable account, or Store-owner action.

## Target Screens and Routes

| Surface | QA focus |
| --- | --- |
| `/privacy` | Public privacy copy, provider/data disclosure, deletion request links, final approval marker. |
| `/terms` | Public terms copy, v1 limitations, provider processing boundaries, final approval marker. |
| `/support` | Support path, deletion help path, no request for secrets or raw private data. |
| `/support/account-deletion` | Request / confirmation / dry-run / proof-first explanation without claiming actual deletion is complete. |
| `/settings` | Authenticated account surface with Privacy, Terms, Support, and account deletion request links. |
| Record flow | Recording, upload, OpenAI transcription, Azure pronunciation evaluation, AI feedback, Supabase Storage notice. |
| Listen flow | Normal model audio, app-owned replay, provider boundary, no Brush-up v1 claim. |
| Review flow | AI coaching / feedback as learning aid, score limitations, support/legal links. |
| `/setup/voice` | Voice sample / consent recording notice, server-side provider boundary, v1 normal voice only. |
| Footer / legal links | Global or route-level access to Privacy, Terms, Support, account deletion, and Settings as applicable. |

## Screen Checklist

### `/privacy`

- Page loads without auth-only dependency.
- Copy is clearly draft / release-candidate until final human approval.
- Explains normal recordings, transcription, pronunciation evaluation, AI coaching / feedback, normal model audio, voice samples / consent recordings, Supabase Auth / DB / private Storage, support metadata, and account deletion request handling.
- Names OpenAI, Azure, ElevenLabs, Supabase, Vercel, or equivalent provider categories only at a safe disclosure level.
- Links to Terms, Support, and account deletion request.
- Does not claim actual deletion proof is complete.
- Does not claim Brush-up is available in v1.

### `/terms`

- Page loads without auth-only dependency.
- Copy is clearly draft / release-candidate until final human approval.
- Explains the learning-tool nature of AI feedback and pronunciation scoring.
- Explains user responsibility for recordings, scripts, and acceptable use.
- Links to Privacy and Support.
- Does not claim legal final approval.
- Does not claim Brush-up is available in v1.

### `/support`

- Page loads without auth-only dependency.
- Provides a route to account deletion request help.
- Links to Privacy and Terms.
- Does not ask users to send secrets, raw provider payloads, transcript bodies, raw audio, full Storage paths, or credential-like values.
- Marks final support URL / inbox / operator ownership as `human_required` if not release-approved.

### `/support/account-deletion`

- Page explains request / confirmation / dry-run / proof-first flow.
- Page clearly says actual deletion implementation and disposable proof are not complete until later gates.
- Page lists v1 deletion categories at a safe category level.
- Page explains cannot-login support path without requesting private raw data.
- Page does not imply a request immediately deletes data.
- Brush-up-specific deletion remains v1.1 deferred.

### `/settings`

- Authenticated user can reach Privacy Policy, Terms, Support, and account deletion request.
- Account deletion panel labels the current state as request / confirmation / dry-run / proof-first.
- Dry-run summaries show safe counts, category status, missing coverage, skipped items, deferred items, human-required items, and blocker codes only.
- No public actual deletion button is exposed.
- UI does not show raw ids, raw provider responses, transcript bodies, full private paths, signed URLs, provider voice ids, secrets, or raw audio.

### Record Flow

- A short notice appears near the recording action.
- Notice says recordings are used for evaluation, review, and progress.
- Notice says OpenAI transcription may be used.
- Notice says Azure pronunciation evaluation may be used.
- Notice says AI coaching / feedback is a learning aid, not a complete ability judgment.
- Notice mentions Supabase Storage / protected app-owned handling at a high level.
- Privacy, Terms, Support, and account deletion request links are reachable.
- Notice does not say best takes are sent as Brush-up material in v1.

### Listen Flow

- A short notice appears near model audio / listen actions.
- Notice says normal model audio may be generated or replayed.
- Notice keeps replay app-owned and does not rely on provider direct URL claims.
- Notice links to Privacy, Terms, Support, and account deletion request.
- Notice does not claim Brush-up voice variants are available in v1.

### Review Flow

- A short notice appears near results or review summary.
- Notice says transcript, score, weak words, and coach feedback are learning aids.
- Notice does not present AI feedback as an official ability judgment.
- Support and privacy links are reachable.
- No raw provider response, transcript body, or private audio path appears in UI.

### `/setup/voice`

- Voice setup notice explains normal v1 voice setup only.
- Notice covers voice sample / consent recording handling.
- Notice describes app-owned upload and server-side provider boundary at a high level.
- Notice links to Privacy, Terms, Support, and account deletion request.
- Notice does not claim Brush-up or selected-best-take voice material is available in v1.

### Footer / Legal Links

- Privacy, Terms, Support, and account deletion request are reachable from the app shell or route-level legal link clusters.
- If there is no global footer on a surface, QA may mark the route `warn` only if route-level links still make the legal pages reachable.
- Broken legal links are `blocked` for Store submission.

## Store Submission QA Items

- App Privacy answers match the implemented v1 data collection and processing.
- Google Data Safety answers match the implemented v1 data collection and processing.
- Reviewer account exists and can run the v1 main loop.
- Reviewer instructions include login, script creation, listen, record, evaluate, review, progress, Settings, support, and account deletion request path.
- Privacy Policy URL is final and public.
- Support URL is final and public.
- Account deletion request URL is final and public.
- Store metadata, screenshots, and reviewer notes do not mention Brush-up as a v1 feature.
- Provider disclosure covers OpenAI transcription, Azure pronunciation evaluation, ElevenLabs normal model audio / voice setup where applicable, Supabase Auth / DB / Storage, and Vercel hosting at the release-approved level.

## Gate 4h Re-Run Items

Move these to Gate 4h re-run after a human prepares a disposable account:

- disposable account safe alias;
- explicit confirmation that the account is not a real or personal account;
- environment label;
- login as disposable account;
- minimal v1 test data creation;
- account deletion request creation;
- typed confirmation;
- inventory dry-run safe summary;
- job-stage dry-run safe summary;
- provider cleanup dry-run safe summary;
- Storage cleanup dry-run safe summary;
- DB cleanup dry-run safe summary;
- Supabase Auth deletion dry-run safe summary;
- category counts / status / reason codes;
- redaction confirmation;
- stop point before actual deletion.

## Gate 4j or Later Items

Move these to later destructive gates after explicit approval:

- actual provider cleanup for normal v1 voice resources;
- actual Storage object deletion;
- actual DB cleanup / anonymization;
- Supabase Auth user deletion;
- post-delete verification;
- Store-ready disposable deletion proof;
- any operator-only destructive execution surface;
- any public actual deletion completion claim.

## human_required

- Final Privacy Policy approval.
- Final Terms approval.
- Final support URL / inbox / operator ownership.
- Final account deletion request URL.
- Legal owner / operator identity for Store metadata if required.
- App Privacy final answers.
- Google Data Safety final answers.
- Reviewer account and reviewer instructions.
- Gate 4h disposable account preparation and re-run.
- Provider cleanup semantics for normal v1 voice resources.
- Final confirmation that public copy does not overclaim deletion completion or Brush-up availability.

## Redaction Rules

QA evidence must not record:

- secrets;
- env values;
- raw provider responses;
- billing detail beyond safe status;
- full email addresses;
- full auth user ids;
- transcript bodies;
- script bodies;
- raw audio;
- private audio paths;
- full Storage object paths or keys;
- signed URLs;
- provider voice identifiers.

Use safe aliases, counts, statuses, reason codes, and route names only.

## Non-Destructive Boundary

Gate 4i is a release QA checklist only. It does not:

- rerun Gate 4h;
- target any real or disposable account;
- create or confirm deletion requests;
- execute actual deletion;
- delete a Supabase Auth user;
- delete Storage objects;
- delete, update, or anonymize DB rows;
- call provider cleanup;
- change DB schema or migrations;
- change API contracts;
- change env or dashboards;
- implement Brush-up;
- start Capacitor or Store submission work.

## Handoff

Next safe work is either:

1. Run this Gate 4i QA checklist manually against local or production without recording private data; or
2. Prepare a disposable account and re-run Gate 4h dry-run proof capture.

Actual deletion implementation and live deletion proof must remain in later gates with explicit destructive approval.
