# RR-3a Account Deletion Actual Implementation Plan

RR-3a は Store submission 前に必要になる actual account/data deletion completion path の実装計画です。この文書では destructive cleanup の順序、stage behavior、failure status、retry / manual fallback、実装 phase、smoke checklist を固定します。

This is an implementation plan, not an implemented deletion job. この段階では ElevenLabs voice delete、Storage object delete、DB row delete / anonymize、Supabase Auth user delete は実行しない。

## Current Implementation Inventory

Implemented:

- `account_deletion_requests` table and safe request tracking.
- Settings UI for request / confirm / status.
- `GET /api/account/deletion-status`.
- `POST /api/account/deletion-request`.
- `POST /api/account/deletion-confirm`.
- `GET /api/account/deletion-inventory`.
- `GET /api/account/deletion-provider-dry-run`.
- `GET /api/account/deletion-storage-dry-run`.
- `GET /api/account/deletion-database-dry-run`.
- `GET /api/account/deletion-auth-dry-run`.
- `GET /api/account/deletion-job-dry-run`.
- Server-side inventory and dry-run planning for provider, Storage, DB, Auth, and full job order.
- RLS own read only for request rows. Authenticated direct insert is closed.
- Safe dry-run responses that return counts / status / notes only.

Not implemented:

- Actual ElevenLabs provider-side voice deletion.
- Actual Storage object deletion.
- Actual DB row deletion / anonymization.
- Actual `quota_events` deletion / anonymization.
- Actual consent recording deletion.
- Actual Supabase Auth user deletion.
- Actual destructive job runner, cron, queue, or admin execution surface.
- Completion notification.

## Fixed Stage Order

Actual deletion must run in this order:

1. Provider cleanup.
2. Storage cleanup.
3. DB cleanup / anonymize.
4. Supabase Auth deletion.
5. Completion / notification.

Supabase Auth deletion is always last. Until DB cleanup is complete, the system must be able to re-fetch owned app data server-side by `user_id`.

## Request Status And Cleanup Status

Runnable request statuses:

- `confirmed`
- `provider_cleanup_failed`
- `storage_cleanup_failed`
- `db_cleanup_failed`
- `auth_cleanup_failed`

Non-runnable request statuses:

- `requested`
- `processing`
- `completed`
- `cancelled`
- `expired`

Stage failure status mapping:

| Stage | Failure request status | Cleanup status |
| --- | --- | --- |
| Provider cleanup | `provider_cleanup_failed` | `provider_cleanup_status=failed` or `manual_required` |
| Storage cleanup | `storage_cleanup_failed` | `storage_cleanup_status=failed` or `manual_required` |
| DB cleanup | `db_cleanup_failed` | `db_cleanup_status=failed` or `manual_required` |
| Supabase Auth deletion | `auth_cleanup_failed` | `auth_cleanup_status=failed` or `manual_required` |
| Completion / notification | keep prior destructive status or mark notification failed if policy allows | `notification_status=failed` or `manual_required` |

Succeeded or empty stages should use `succeeded` or `not_needed`. Do not advance a later stage until the prior stage is `succeeded` or `not_needed`.

## Stage 1: Provider Cleanup

Scope:

- ElevenLabs provider-side cloned voices for the deleting user.
- Candidates are derived server-side from owned `voices` rows where `provider='elevenlabs'`.
- `provider_voice_id` is used only inside the server-side cleanup service.

Behavior:

- Re-fetch owned voice rows server-side.
- Classify candidates as `required`, `not_needed`, or `blocked`.
- Delete only provider-side ElevenLabs voices that can be proven to belong to the user through owned app rows.
- If there are no ElevenLabs provider-side candidates, mark provider cleanup `not_needed`.
- If cleanup succeeds for all candidates, mark provider cleanup `succeeded`.

Safety:

- Never expose `provider_voice_id` to the client.
- Never accept provider voice IDs from the client.
- Never store raw ElevenLabs response body in `account_deletion_requests.metadata`.
- Store only safe failure reason codes / counts if needed.

Failure:

- If ElevenLabs delete fails, stop at `provider_cleanup_failed`.
- If a candidate has a missing or invalid provider reference, stop or require support review before destructive cleanup.
- Retry is allowed from `provider_cleanup_failed` after the operator resolves provider credentials, provider outage, or data inconsistency.
- Manual support fallback is required if ElevenLabs dashboard/API state cannot be reconciled.

Implementation risk:

- Before RR-3b implementation, verify ElevenLabs deletion endpoint semantics, rate limits, and deleted/missing voice behavior against the provider docs or dashboard. Do not infer destructive API behavior from current dry-run code.

## Stage 2: Storage Cleanup

Buckets:

- `recordings`
- `script-audios`
- `voice-samples`
- `voice-consents`

Candidate sources:

- Known object references from owned DB rows.
- User-prefix listed objects when bucket listing is available.
- Orphan candidates only when they are under a server-proven user prefix.

Behavior:

- Re-fetch owned DB references server-side.
- List bucket prefixes server-side with service role.
- Delete known owned objects first.
- Delete prefix-listed orphan candidates only when ownership is proven by bucket/prefix policy and server-side inventory.
- Missing known objects may be treated as already absent, with a safe note, if the DB row is owned and the bucket returns a clear not-found result.
- If all required objects are absent or deleted, mark storage cleanup `succeeded`.
- If a bucket has no candidates, mark it `not_needed`.

Safety:

- Never expose raw storage path, object key, or signed URL to the client.
- Never accept cleanup object keys from the client.
- Do not continue to DB cleanup while app-owned audio objects are unresolved.

Failure:

- Bucket list failure, permission failure, ambiguous ownership, or delete failure stops at `storage_cleanup_failed`.
- Retry is allowed from `storage_cleanup_failed` after bucket policy, service role, or object state is resolved.
- Manual fallback is required when orphan ownership cannot be proven safely.

## Stage 3: DB Cleanup / Anonymize

Target tables:

- `script_saved_best_takes`
- `script_saved_model_audios`
- `weak_words`
- `coach_feedback`
- `takes`
- `script_audios`
- `voice_consents`
- `voices`
- `scripts`
- `profiles`
- `quota_events`
- `voice_quota_events` if present in the current schema / future migrations
- `account_deletion_requests`

Deletion / retention classification:

| Class | Tables / rows | Action |
| --- | --- | --- |
| Cascade dependent | `weak_words`, `coach_feedback`, saved best/model rows when parent cleanup removes their parents | Delete through parent or explicit cleanup if cascade is insufficient |
| Explicit user-owned rows | `takes`, `script_audios`, `voice_consents`, `voices`, `scripts`, `profiles` | Delete after provider and Storage cleanup have succeeded |
| Delete-last rows | `profiles`, remaining user-owned rows required for lookup until near the end | Delete at the end of DB cleanup before Auth deletion |
| Retain / anonymize | `account_deletion_requests` | Retain short-term anonymized tracking record only |
| Delete by v1 default | `quota_events`, `voice_quota_events` if present | Delete unless a human-approved short anonymous retention policy exists |

Behavior:

- Re-fetch owned rows server-side.
- Do not accept row IDs from the client.
- Delete child/curation rows before parent rows where cascade is not sufficient.
- Keep `account_deletion_requests` as the only tracking record after DB cleanup.
- Strip or overwrite unsafe operational metadata before completion if a future implementation adds stage metadata.
- Keep only `anonymized_user_ref`, status, safe cleanup statuses, safe failure code, and timestamps needed for short-term support tracking.

Safety:

- Do not put script text, transcript text, raw provider payload, raw metadata detail, storage paths, provider voice IDs, email, auth payloads, signed URLs, or secrets into retained deletion metadata.
- `quota_events` should not retain raw seed, generated full text, raw provider response, or provider secret. If retention is required for abuse prevention, use anonymized aggregates only and update policy text first.

Failure:

- DB delete or anonymize failure stops at `db_cleanup_failed`.
- Retry is allowed after constraint, service role, or data consistency issue is resolved.
- Do not proceed to Supabase Auth deletion if any required DB cleanup is unresolved.

## Stage 4: Supabase Auth Deletion

Scope:

- Supabase Auth user for the deletion request.

Behavior:

- Run only after DB cleanup is `succeeded` or `not_needed`.
- Use server-side service role / admin boundary.
- Confirm the request can still be tracked by deletion request id and `anonymized_user_ref`.
- Delete the Supabase Auth user.
- The `account_deletion_requests.user_id` foreign key is expected to become `null` through `on delete set null`.

Safety:

- Do not expose `user_id`, email, session, token, auth raw payload, or service role detail to the client.
- Do not call Auth deletion from client-side code.
- Do not delete Auth before provider / Storage / DB cleanup, because app-owned data lookup depends on the user.

Failure:

- Auth deletion failure stops at `auth_cleanup_failed`.
- Retry is allowed from `auth_cleanup_failed`.
- Manual support fallback is required if Auth user state is inconsistent or already missing but request tracking has not completed.

## Stage 5: Completion / Notification

Behavior:

- Run after Auth deletion succeeds.
- Mark request `completed`.
- Set safe completion timestamp and cleanup statuses.
- Keep only short-term anonymized tracking if policy allows.
- If a notification is added later, it must not require storing the user's email inside deletion metadata unless a human-approved policy allows it.

User-facing behavior:

- Before Auth deletion, an authenticated user can see status in Settings.
- After Auth deletion, login should no longer succeed for that account.
- Completion confirmation may require support-channel communication, especially for Web beta / small cohort.

Failure:

- Completion status write failure should be treated as support/manual follow-up, because destructive stages may already have run.
- Do not re-create user data to repair completion status.

## Safety Gate / Preflight Requirements

Before actual destructive execution:

- Request must be `confirmed` or one of the retryable failed statuses.
- Active request must belong to the authenticated/support-targeted user and be re-fetched server-side.
- Latest dry-run must be reviewed and match the planned actual run.
- Provider cleanup must be first.
- Storage cleanup must wait for provider cleanup `succeeded` or `not_needed`.
- DB cleanup must wait for Storage cleanup `succeeded` or `not_needed`.
- Supabase Auth deletion must wait for DB cleanup `succeeded` or `not_needed`.
- Completion must wait for Auth cleanup `succeeded` or `not_needed`.
- Production guard / launch mode / kill switches must be checked before provider or Storage operations.
- Service role availability must be checked, but secret values must never be logged.
- Client must not provide provider IDs, storage keys, row IDs, or cleanup targets.
- Raw provider responses, raw audio, transcript, script text, signed URLs, auth payloads, email, and secrets must not be stored in request metadata.

Recommended destructive execution guard:

- Add an explicit server-side `DESTRUCTIVE_ACCOUNT_DELETION_ENABLED=1` style guard before RR-3b/RR-3c/RR-3d/RR-3e live execution.
- Keep dry-run APIs available separately from actual execution APIs.
- Require support/admin operation for the first implementation, not a user-triggered one-click destructive job.
- Record safe stage attempts using status and timestamps only.

## Retry And Manual Fallback

- `provider_cleanup_failed`: retry after ElevenLabs credential, provider outage, rate limit, or data mismatch is resolved. Manual ElevenLabs dashboard proof may be needed.
- `storage_cleanup_failed`: retry after bucket/list/delete permissions or ambiguous objects are resolved. Manual Storage UI proof may be needed.
- `db_cleanup_failed`: retry after constraint or data consistency issue is resolved.
- `auth_cleanup_failed`: retry after service role/Auth state issue is resolved.
- `manual_required`: use when the system cannot prove safe ownership or cleanup state automatically.

Retry must start at the failed stage and must not re-run later stages that were never reached. Already succeeded stages should be idempotent or skipped.

## Implementation Phases

### RR-3b: Provider Cleanup Actual

- Added as implementation boundary in `docs/rr-3b-elevenlabs-provider-cleanup-actual.md`.
- ElevenLabs cleanup executor exists behind `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE=1`.
- Existing provider dry-run candidates are re-fetched server-side.
- Provider voice IDs remain server-only.
- Provider failure stops at `provider_cleanup_failed`.
- Current self-test does not call ElevenLabs; disposable live proof is still required before Store submission.

### RR-3c: Storage Cleanup Actual

- Added as implementation boundary in `docs/rr-3c-storage-cleanup-actual.md`.
- Storage cleanup executor exists behind `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE=1`.
- Owned Storage candidates are re-fetched server-side from latest dry-run / user prefix listing.
- Storage object keys remain server-only.
- Storage cleanup waits for provider cleanup `succeeded` or `not_needed`.
- Storage failure stops at `storage_cleanup_failed`.
- Current self-test does not call Supabase Storage `.remove()`; disposable live proof is still required before Store submission.

### RR-3d: DB Cleanup / Anonymize Actual

- Added as implementation boundary in `docs/rr-3d-database-cleanup-actual.md`.
- DB cleanup executor exists behind `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE=1`.
- Owned DB candidates are re-fetched server-side from latest DB dry-run.
- DB cleanup waits for provider cleanup and Storage cleanup `succeeded` or `not_needed`.
- Row ids, user id, script text, transcript, coach feedback, provider metadata, and storage paths remain server-only.
- DB failure stops at `db_cleanup_failed`.
- Current self-test does not call DB delete / update / anonymize; disposable live proof is still required before Store submission.

### RR-3e: Supabase Auth Deletion And Completion

- Added as implementation boundary in `docs/rr-3e-supabase-auth-deletion-actual.md`.
- Auth deletion executor exists behind `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE=1`.
- Supabase Auth user deletion waits for provider, Storage, and DB cleanup `succeeded` or `not_needed`.
- Auth user id, email, session, token, raw Auth payload, and service role details remain server-only.
- Completion tracking uses existing `account_deletion_requests` schema: `status=completed`, `auth_cleanup_status=succeeded`, `notification_status=not_needed`, and request-id-based update after Auth deletion can set `user_id` null through the FK.
- Current self-test does not call Supabase Auth admin `.deleteUser()`; disposable live proof is still required before Store submission.
- Support completion communication policy remains a human-check / policy item.

### RR-3f: End-to-End Destructive Smoke / Audit

- Added as docs-only runbook / proof template in `docs/rr-3f-destructive-audit-operator-runbook.md`.
- Must run with a disposable account only.
- Must verify provider voice, Storage objects, DB rows, Auth login, protected replay, review/progress absence, anonymized request tracking, and other users.
- Must record only safe stage status, counts, safe reason codes, checked_at, operator, reviewer, and decision.
- Must not record raw user id, email, provider voice id, storage path, object key, signed URL, tokens, service role key, raw provider response, raw audio, script body, transcript, or row ids.
- Current RR-3f work does not enable the destructive guard and does not run real destructive deletion.

### RR-3g: Operator / Admin Execution Surface Design

- Added as docs-only design in `docs/rr-3g-operator-admin-execution-surface-design.md`.
- Compares CLI script, internal admin route, server action, and manual service invocation.
- Chooses a guarded internal CLI runner as the future minimal execution surface.
- Keeps the CLI dry-run by default and one-stage-per-invocation.
- Requires operator / reviewer / approver proof, latest dry-run, prior-stage satisfaction, explicit irreversible acknowledgement, and `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE=1` before any actual stage.
- Defers public UI/API, admin route, server action, DB audit table, and the actual CLI runner implementation.
- Current RR-3g work does not enable the destructive guard and does not run real destructive deletion.

### RR-3h: Internal CLI Runner Skeleton

- Added as non-destructive skeleton in `docs/rr-3h-internal-cli-runner-skeleton.md`.
- Adds `npm run account-deletion:operator` and `npm run account-deletion:operator:self-test`.
- Runner defaults to dry-run and accepts exactly one stage per invocation: `provider`, `storage`, `database`, `auth`, `status`, or `summary`.
- Runner prints only safe summary fields and never echoes request refs, user ids, provider ids, storage paths, object keys, signed URLs, row ids, email, tokens, or raw provider responses.
- `--execute` models the future guard requirements, including proof path, latest dry-run runnable confirmation, prior-stage satisfaction for later stages, destructive env, and irreversible acknowledgement, but remains blocked with `actual_service_not_connected_in_skeleton`; RR-3h does not connect to actual stage services.
- Current RR-3h work does not enable the destructive guard and does not run real destructive deletion.

### RR-3i: Operator CLI Stage Service Connection

- Added as fake-first connection in `docs/rr-3i-operator-cli-stage-service-connection.md`.
- `runAccountDeletionOperator` can receive injected fake stage services for `provider`, `storage`, `database`, and `auth`.
- Guard failures block before the fake service seam is called.
- Service results are sanitized to safe status / reason code / counts only.
- The normal CLI path still passes no real actual stage services and does not run real destructive deletion.

### RR-3j: Final Safety Review

- Added as non-destructive safety review in `docs/rr-3j-final-safety-review.md`.
- Confirms provider -> Storage -> DB -> Auth -> completion order is consistent across docs, service boundaries, dry-runs, CLI modeling, and self-tests.
- Confirms failure status, retry source, `manual_required`, proof fields, and raw-data prohibition are aligned.
- Identifies the remaining real-service connection gap: the future operator wrapper must resolve an operator request reference to internal-only `userId + deletionRequestId`, map stages to actual service exports, and keep all service results behind safe summary sanitization.
- Current RR-3j work does not connect real services, enable the destructive guard, run disposable proof, or execute real destructive deletion.

### RR-3k: Safe Request Resolver / Wrapper

- Added as fake-first resolver seam in `docs/rr-3k-safe-request-resolver-wrapper.md`.
- `runAccountDeletionOperator` can receive an injected request resolver before an injected stage service.
- Resolver is called only after modeled destructive guards pass.
- Resolver output uses safe markers in CLI/proof output and keeps internal-only `userId + deletionRequestId` out of output.
- Fake service result still passes through safe summary sanitization.
- Current RR-3k work does not perform real DB lookup, connect real stage services, enable the destructive guard, run disposable proof, or execute real destructive deletion.

### RR-3l: Read-Only Request Resolver / Status Proof

- Added in `docs/rr-3l-read-only-request-resolver-status-proof.md`.
- Default CLI `status` / `summary` stages can resolve an account deletion request UUID or `anonymized_user_ref` with a server-side read-only lookup.
- Output is limited to request lifecycle status, cleanup-stage statuses, retry count, safe reason code, and safe request markers.
- Raw user id, email, deletion request id, and operator request ref are not printed.
- Provider / Storage / DB / Auth actual services remain disconnected.

### RR-3m: Disposable Proof Request Selection

- Added in `docs/rr-3m-disposable-proof-request-selection.md`.
- Disposable proof candidate selection requires a confirmed request, fresh stage statuses, disposable-account confirmation, owner/reviewer/approver confirmation, dry-run readiness, and Human Check alignment.
- Operator `status` / `summary` can emit a safe `proofCandidate` PASS/BLOCKED summary with `--proof-candidate-*` flags.
- Real user accounts, ambiguous owner/reviewer/approver, dry-run mismatch, stale stage status, and any proof that needs raw ids are blocked.
- No destructive guard, real service connection, or disposable proof execution is included.

### RR-3n: Fake-Only Proof Log Rehearsal

- Added in `docs/rr-3n-fake-only-proof-log-rehearsal.md`.
- `npm run account-deletion:operator:rehearsal` emits a fake-only proof log for provider -> Storage -> DB -> Auth -> completion.
- Output is safe JSON or markdown with stage decisions, safe counts, safe reason codes, marker presence, and no raw identifiers.
- The rehearsal blocks if `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE=1` is enabled.
- This bundled sequence is rehearsal-only; real destructive execution remains one stage per invocation after explicit approval.

### RR-3o: Sample Proof Package Assembly

- Added in `docs/rr-3o-sample-disposable-proof-package.md`.
- The sample package maps RR-3n fake-only rehearsal output into the RR-3f proof template areas.
- It records review metadata markers, stage decisions, safe counts, safe reason codes, PASS/WARN/BLOCKED/FAIL, and raw data absence.
- `npm run account-deletion:proof-package:self-test` verifies the sample package is fake-only and contains no raw-looking identifiers or secrets.
- The sample is not Store submission evidence and does not replace the future disposable-account destructive proof.

### RR-3p: Disposable Fixture / Dry-Run Proof Checklist

- Added in `docs/rr-3p-disposable-fixture-dry-run-proof-checklist.md`.
- Defines the disposable account fixture requirements before any live proof.
- Requires app data, Storage references, and ElevenLabs provider candidates to be disposable and server-owned.
- Fixes the dry-run order: non-destructive baseline, operator summary, provider dry-run, Storage dry-run, DB dry-run, Auth dry-run, fake-only proof package rehearsal.
- Defines GO / WARN / BLOCKED / FAIL before destructive proof and keeps raw data out of proof.
- This is docs-only preparation and does not create an account or run cleanup.

## Tests / Smoke / Checklist

Pre-implementation:

- `npm run lint`
- `npm run build`
- `npm run typecheck`
- `npm run production:preflight`
- `npm run supabase:storage-rls:check`
- Dry-run APIs return safe summaries and no raw identifiers.

Per-stage implementation smoke:

- Unauthenticated actual cleanup endpoint returns 401.
- Non-confirmed request cannot run.
- Confirmed disposable request can run only when destructive env guard is enabled.
- Provider cleanup never returns provider voice ID or raw provider response.
- Storage cleanup never returns object key, raw path, or signed URL.
- DB cleanup never returns row IDs, script text, transcript, raw metadata, or email.
- Auth cleanup never returns auth payload, session, token, email, or service role detail.
- Each stage stops with the correct failure status.
- Later stages do not run if the prior stage failed.
- Other users' data is unchanged.

End-to-end destructive smoke:

- Create disposable account.
- Create script, recording, review/progress data, generated model audio, voice sample/consent, ElevenLabs cloned voice if possible.
- Create and confirm deletion request.
- Capture dry-run safe counts.
- Run provider cleanup and verify provider-side state through a safe operator-only proof.
- Run Storage cleanup and verify protected replay returns 404/403-like response.
- Run DB cleanup and verify review/progress/user data no longer appears.
- Run Supabase Auth deletion and verify login no longer succeeds.
- Mark completed and verify only anonymized request tracking remains.

## Store Submission Relationship

Web beta / small cohort can continue with request-based deletion plus support/manual cleanup and clear SLA disclosure.

Store submission should remain blocked until:

- Provider cleanup actual path exists.
- Storage cleanup actual path exists.
- DB cleanup / anonymize actual path exists.
- Supabase Auth deletion actual path exists.
- Completion/status tracking exists.
- Public privacy/support/account deletion pages are reviewed and aligned with the actual implementation.

## Stop Conditions Before Implementation

- ElevenLabs destructive delete semantics cannot be verified.
- Storage ownership cannot be proven server-side.
- DB cleanup requires schema or RLS changes not already approved.
- Auth deletion cannot be run safely with service role.
- Support contact / SLA / legal wording is not decided.
- Any implementation would require exposing provider IDs, storage keys, raw data, auth payloads, or secrets to the client.
