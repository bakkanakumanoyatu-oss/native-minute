# RR-3f Destructive Audit / Operator Runbook

RR-3f is the operator runbook and proof template for a future disposable-account destructive account deletion audit.

This document does **not** authorize or execute destructive cleanup. Do not enable `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE=1` during normal development checks.

## Scope

The future destructive audit must prove the full account deletion sequence:

1. ElevenLabs provider cleanup.
2. Supabase Storage cleanup.
3. DB cleanup / anonymize.
4. Supabase Auth deletion.
5. Completion tracking.

The audit must use a disposable account only. It must not use a real user account, a support case account, or any account containing personal data that needs to be preserved.

## Current Boundaries

Implemented guarded boundaries:

- RR-3b: `runElevenLabsProviderCleanupActual`
- RR-3c: `runStorageCleanupActual`
- RR-3d: `runDatabaseCleanupActual`
- RR-3e: `runSupabaseAuthDeletionActual`

Static / non-live self-tests:

```bash
npm run account-deletion:provider-cleanup:self-test
npm run account-deletion:storage-cleanup:self-test
npm run account-deletion:database-cleanup:self-test
npm run account-deletion:auth-cleanup:self-test
npm run account-deletion:operator:rehearsal:self-test
npm run account-deletion:proof-package:self-test
```

None of these self-tests call ElevenLabs, Supabase Storage delete, DB delete/update/anonymize, or Supabase Auth delete.

RR-3n adds `npm run account-deletion:operator:rehearsal`, which generates a fake-only proof log for operator rehearsal. It can be copied into this proof template as practice evidence, but it is not a real disposable-account destructive proof.

RR-3o adds `docs/rr-3o-sample-disposable-proof-package.md`, a fake-only sample artifact that shows how rehearsal output maps into this proof structure. It is not Store submission evidence.

RR-3p adds `docs/rr-3p-disposable-fixture-dry-run-proof-checklist.md`, the disposable fixture and dry-run proof checklist that must be completed before any future destructive proof.

## Required Approval Before Execution

Before a future destructive audit, record all of the following in the proof template:

- Operator name or role.
- Reviewer / release owner.
- Target environment.
- Confirmation that the account is disposable.
- Confirmation that irreversible actions are understood.
- Confirmation that support/contact/SLA wording is aligned with the current beta legal/support drafts.
- Confirmation that Human Check Backlog items relevant to deletion policy are resolved or explicitly accepted by the release owner.
- Confirmation that no raw identifiers or secrets will be recorded.

If any approval is missing, the audit is `BLOCKED`.

## Required Disposable Test Data

The disposable account should contain enough owned data to exercise every stage:

- Auth account / profile.
- At least one script.
- At least one take / review / progress result.
- Weak words and coach feedback.
- At least one generated script audio.
- At least one voice sample and consent recording, when available.
- One ElevenLabs cloned voice candidate, when the provider environment supports it.
- Quota events for script generation and/or audio generation, when available.
- Confirmed `account_deletion_requests` row.

Do not record raw user id, email, script text, transcript, audio bytes, provider voice id, storage path, object key, signed URL, token, service role key, raw provider response, or raw DB row ids in the proof.

## Pre-Execution Checklist

Use this checklist before enabling any destructive guard.

| Check | PASS | WARN | BLOCKED / FAIL |
| --- | --- | --- | --- |
| Git state | Commit/ref is recorded and intentionally chosen. | Dirty docs-only changes are understood and excluded from execution. | Unknown code state or unreviewed implementation changes. |
| Environment | Staging or production-like target is named without raw ids. | Local-only dry rehearsal. | Unknown target or real user account. |
| Launch mode | `private_beta` / `small_cohort` intent is recorded. | Internal-only proof. | Public production without release owner approval. |
| Destructive guard | Off during preflight; future enablement requires explicit operator approval. | N/A | Guard enabled before checklist approval. |
| Kill switches | OpenAI / Azure / ElevenLabs / Storage upload kill switch state is recorded as safe summary. | A non-required provider is paused intentionally. | Required provider is blocked and stage cannot run. |
| Provider dry-run | ElevenLabs provider dry-run returns safe summary and is runnable or not_needed. | Candidate count is zero but expected for test account. | Blocked / ambiguous provider candidates. |
| Storage dry-run | Bucket summaries are runnable or not_needed. | Missing known object is accepted as already absent with note. | Bucket list/delete readiness blocked or ownership ambiguous. |
| DB dry-run | Table classifications are runnable and count snapshot is recorded safely. | Some tables are zero candidates as expected. | Candidate mismatch, unsafe retention question, or schema drift. |
| Auth dry-run | Auth deletion preflight is ready and DB cleanup satisfied is expected after DB stage. | Auth user is absent only if policy accepts already-removed Auth state. | Auth user state unavailable or service role boundary blocked. |
| Human Check Backlog | Relevant deletion/support/legal items are resolved or accepted by release owner. | Explicit GO WITH WARNINGS from release owner. | Any required deletion/support/legal item remains BLOCKED with no owner decision. |

## Execution Order

Do not skip stages. Do not proceed to a later stage unless the previous stage returns `succeeded` or `not_needed`.

### Stage 1: Provider Cleanup

Run only after provider dry-run is runnable and the destructive guard is explicitly enabled.

PASS:

- Provider cleanup returns `succeeded` or `not_needed`.
- Request status remains safe and later stages have not run.
- Provider voice ids and raw provider responses are not exposed.

WARN:

- Provider-side candidate was already absent and policy accepts it as not needed.

BLOCKED / FAIL:

- `provider_cleanup_failed`.
- `provider_cleanup_status=manual_required`.
- Any raw provider id or raw response appears in proof/logs.

Stop here on BLOCKED / FAIL.

### Stage 2: Storage Cleanup

Run only when provider cleanup is `succeeded` or `not_needed`.

PASS:

- Storage cleanup returns `succeeded` or `not_needed`.
- Protected replay for the deleted account's owned audio becomes inaccessible after cleanup.
- Storage paths, object keys, and signed URLs are not exposed.

WARN:

- Known object was already missing and safely counted as absent.

BLOCKED / FAIL:

- `storage_cleanup_failed`.
- Bucket list/delete ambiguity.
- Protected replay still serves cleaned-up objects.

Stop here on BLOCKED / FAIL.

### Stage 3: DB Cleanup / Anonymize

Run only when Storage cleanup is `succeeded` or `not_needed`.

PASS:

- DB cleanup returns `succeeded` or `not_needed`.
- App-owned rows are removed/anonymized according to RR-3d.
- `account_deletion_requests` remains as short-term anonymized tracking only.

WARN:

- Zero candidates in a table are expected from the disposable fixture.

BLOCKED / FAIL:

- `db_cleanup_failed`.
- Constraint or ownership ambiguity.
- Raw script text, transcript, coach feedback, row ids, or email appear in proof/logs.

Stop here on BLOCKED / FAIL.

### Stage 4: Supabase Auth Deletion

Run only when DB cleanup is `succeeded` or `not_needed`.

PASS:

- Auth deletion returns `succeeded`.
- Login for the deleted account no longer succeeds.
- `account_deletion_requests.user_id` can be null while `anonymized_user_ref` and status remain available for short-term tracking.

WARN:

- Completion communication remains manual but is covered by support policy.

BLOCKED / FAIL:

- `auth_cleanup_failed`.
- Auth user state cannot be verified.
- Raw user id, email, token, session, or service role detail appears in proof/logs.

Auth deletion is irreversible. There is no rollback after this stage.

### Stage 5: Completion Tracking

PASS:

- Request status is `completed`.
- `auth_cleanup_status=succeeded`.
- `notification_status=not_needed` or a human-approved notification status is recorded.
- Only anonymized tracking remains.

WARN:

- Completion notification is manual-only and documented by support owner.

BLOCKED / FAIL:

- Completion status cannot be written after Auth deletion.
- Any attempt is made to recreate user data to repair completion state.

## Post-Execution Verification

After all stages:

- Deleted account cannot log in.
- `/settings` is no longer accessible for the deleted account.
- Scripts, takes, review/progress, weak words, coach feedback, saved best/model audio rows are removed or absent according to RR-3d.
- Protected replay routes for deleted account audio return 403/404-like responses.
- Other users' protected replay still works for their own audio.
- ElevenLabs dashboard/API proof shows disposable voice cleanup without recording provider ids.
- Supabase Storage proof shows no owned disposable audio remains without recording object keys.
- `account_deletion_requests` retains only safe tracking status / anonymized reference / timestamps.
- No proof entry includes raw user/provider/storage/auth data.

## Partial Failure / Manual Required

If a stage fails:

- Stop immediately.
- Do not continue to later stages.
- Record only safe status, stage, count, and safe reason code.
- Keep raw details out of proof docs.
- Leave the request in the stage-specific failed status:
  - `provider_cleanup_failed`
  - `storage_cleanup_failed`
  - `db_cleanup_failed`
  - `auth_cleanup_failed`
- Use `manual_required` when ownership, provider state, Storage state, DB constraints, or Auth state cannot be proven safely.
- Retry starts from the failed stage after the operator resolves the cause.

Do not retry by creating a new deletion request for the same account unless the release owner explicitly approves and can prove no duplicate destructive path is active.

## Rollback / Recovery

There is no general rollback for destructive account deletion.

- Before Auth deletion: the operator can stop at a failed stage and use manual/support recovery.
- After Storage deletion: deleted audio may not be recoverable.
- After DB cleanup: app-owned history may not be recoverable.
- After Supabase Auth deletion: login cannot be restored without creating a new account.
- Do not recreate user data just to repair a proof or completion tracking issue.

If completion tracking fails after Auth deletion, record `manual_required` and use the retained request id / anonymized reference for support follow-up.

## Proof Template

Copy this section for the future disposable-account audit.

### Header

| Field | Value |
| --- | --- |
| checked_at | `YYYY-MM-DD HH:mm TZ` |
| operator | `name / role` |
| reviewer / release owner | `name / role` |
| environment | `local / staging / production-like / production` |
| commit short ref | `short ref only` |
| launch mode | `private_beta / small_cohort / internal_only` |
| destructive guard | `OFF during preflight / ON only during approved execution` |
| disposable account confirmed | `PASS / BLOCKED` |
| irreversible action acknowledged | `PASS / BLOCKED` |
| Human Check Backlog relation | `resolved / accepted warning / blocked` |
| decision | `GO / GO WITH WARNINGS / BLOCKED` |

### Preflight Results

| Area | Result | Safe summary | Notes |
| --- | --- | --- | --- |
| production preflight | `PASS/WARN/BLOCKED/FAIL` | no raw env values |  |
| storage/RLS checker | `PASS/WARN/BLOCKED/FAIL` | no raw paths/ids |  |
| provider self-test | `PASS/WARN/BLOCKED/FAIL` | no provider ids |  |
| storage self-test | `PASS/WARN/BLOCKED/FAIL` | no object keys |  |
| DB self-test | `PASS/WARN/BLOCKED/FAIL` | no row ids/content |  |
| Auth self-test | `PASS/WARN/BLOCKED/FAIL` | no auth ids/tokens |  |
| provider dry-run | `PASS/WARN/BLOCKED/FAIL` | counts only |  |
| storage dry-run | `PASS/WARN/BLOCKED/FAIL` | bucket counts only |  |
| DB dry-run | `PASS/WARN/BLOCKED/FAIL` | table counts/classes only |  |
| Auth dry-run | `PASS/WARN/BLOCKED/FAIL` | presence/status only |  |

### Stage Results

| Stage | Result | Request status after stage | Cleanup status after stage | Counts | Safe reason code | Operator notes |
| --- | --- | --- | --- | --- | --- | --- |
| Provider cleanup | `PASS/WARN/BLOCKED/FAIL` |  |  | counts only |  |  |
| Storage cleanup | `PASS/WARN/BLOCKED/FAIL` |  |  | counts only |  |  |
| DB cleanup / anonymize | `PASS/WARN/BLOCKED/FAIL` |  |  | counts only |  |  |
| Supabase Auth deletion | `PASS/WARN/BLOCKED/FAIL` |  |  | counts only |  |  |
| Completion tracking | `PASS/WARN/BLOCKED/FAIL` |  |  | counts only |  |  |

### Post-Execution Verification

| Verification | Result | Safe evidence |
| --- | --- | --- |
| Deleted account cannot log in | `PASS/WARN/BLOCKED/FAIL` | no email/token |
| Owned app data absent | `PASS/WARN/BLOCKED/FAIL` | counts/status only |
| Protected replay inaccessible | `PASS/WARN/BLOCKED/FAIL` | no URL/path/id |
| Other users unaffected | `PASS/WARN/BLOCKED/FAIL` | status only |
| Anonymized tracking remains | `PASS/WARN/BLOCKED/FAIL` | no user id/email |
| No raw data in proof | `PASS/WARN/BLOCKED/FAIL` | reviewer confirms |

### Forbidden Values

Do not record:

- Raw user id.
- Email address, unless it is a deliberately published support contact.
- Provider voice id.
- Storage path or object key.
- Signed URL.
- Audio id / take id.
- DB row id.
- Script body.
- Transcript.
- Coach feedback text.
- Raw provider response.
- Raw audio.
- Session, token, auth payload, or service role key.
- API key, billing amount, account id, subscription id, project id, resource id.

## RR-3f Status

As of this runbook, RR-3f is documentation-only. No destructive guard has been enabled and no disposable account has been deleted.
