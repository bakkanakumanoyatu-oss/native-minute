# RR-3p Disposable Account Fixture / Dry-Run Proof Checklist

RR-3p defines the disposable account fixture and dry-run proof checklist required before a future disposable-account destructive proof.

This document does **not** authorize destructive cleanup. Do not enable `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE=1` for RR-3p. Do not create or delete a disposable account as part of RR-3p. Do not call ElevenLabs delete, Supabase Storage delete, DB cleanup/anonymize, or Supabase Auth deletion.

## Scope

RR-3p covers:

- disposable account fixture preparation checklist,
- app data / Storage / provider fixture expectations,
- dry-run proof checklist and order,
- GO / WARN / BLOCKED / FAIL conditions before destructive proof,
- raw-data-free proof rules,
- relationship to RR-3o fake-only sample proof package.

RR-3p does not cover:

- real destructive deletion,
- destructive guard enablement,
- disposable account creation or deletion,
- real provider / Storage / DB / Auth cleanup,
- public UI/API,
- admin UI,
- DB schema / migration changes,
- RLS policy changes.

## Disposable Account Fixture Checklist

The future proof target must be a disposable account. Do not use a real user, production customer, support case, employee personal account, or any account that contains personal data needing preservation.

### Identity / Approval

| Check | Required safe evidence | BLOCKED if |
| --- | --- | --- |
| Disposable account confirmed | Operator and reviewer both confirm the account is disposable. | Any ambiguity that the account may be real. |
| Production user excluded | Reviewer confirms it is not a production user/support/legal request. | Account comes from a real support request. |
| Owner recorded | Operator marker is recorded in proof. | No accountable operator. |
| Reviewer recorded | Reviewer marker is recorded in proof. | No second-person review. |
| Approver recorded | Release-owner / approver marker is recorded in proof. | No approval for irreversible proof. |
| Environment labeled | Environment marker is recorded without raw project/account ids. | Target environment is unclear. |
| Commit recorded | Commit short ref is recorded. | Unknown code state. |
| Human Check relationship | Relevant Human Check Backlog items are resolved or explicitly accepted for disposable proof. | BLOCKED legal/support/SLA item has no release-owner decision. |

### App Data Fixture

The disposable account should contain enough owned app data to exercise every cleanup stage.

Required where feasible:

- one profile / Auth account,
- at least one script,
- at least one take,
- at least one persisted review/progress result,
- weak words,
- coach feedback,
- one saved best take if available,
- one saved model audio if available,
- one generated script audio if available,
- at least one voice consent row,
- at least one voice row,
- quota events if available in the environment.

Optional but useful:

- a second take for the same script,
- a script audio cache hit / regenerated audio pair,
- both saved model audio and saved best take references,
- one failure-free evaluate/review/progress loop immediately before request confirmation.

Do not put private personal data, secrets, sensitive scripts, or personal voice material into the fixture.

### Storage Fixture

The disposable account should have owned app storage references where feasible:

- `recordings` object for a take,
- `script-audios` object for generated model audio,
- `voice-samples` object for voice setup sample audio,
- `voice-consents` object for consent recording.

The proof must record only bucket-level safe counts / status. Do not record storage paths, object keys, signed URLs, or raw audio.

### Provider Fixture

For ElevenLabs:

- use a disposable cloned voice candidate only,
- confirm it is connected to an owned `voices` row,
- record only candidate count / status,
- do not record provider voice id,
- do not use a personal voice sample unless the release owner explicitly approves it for disposable testing.

OpenAI and Azure are not voice providers. They may be involved in transcription / script generation / coaching / pronunciation during fixture creation, but RR-3p proof target selection is about account deletion cleanup.

## Fixture Exclusion Rules

Do not use a fixture if any condition is true:

- account could be a real user,
- proof requires raw email, raw user id, request id, provider id, storage path, or script/transcript text,
- consent ownership is ambiguous,
- ElevenLabs candidate cannot be tied to an owned app row,
- Storage object ownership cannot be proven by server-side dry-run,
- DB dry-run table counts do not match expected fixture shape,
- Auth dry-run cannot confirm the account is still deletable,
- Human Check Backlog has relevant BLOCKED items with no explicit release-owner acceptance,
- support contact / SLA / legal wording is required for the target environment and unresolved.

## Dry-Run Proof Checklist

Run and record only safe summaries before any future destructive proof.

### 1. Non-Destructive Baseline

```bash
npm run production:preflight
npm run supabase:storage-rls:check
npm run account-deletion:provider-cleanup:self-test
npm run account-deletion:storage-cleanup:self-test
npm run account-deletion:database-cleanup:self-test
npm run account-deletion:auth-cleanup:self-test
npm run account-deletion:operator:self-test
npm run account-deletion:operator:rehearsal:self-test
npm run account-deletion:proof-package:self-test
```

Required result:

- all commands pass,
- no secret or raw target is printed,
- destructive guard remains off.

### 2. Request Status / Summary

Run read-only operator status / summary for the future request:

```bash
npm run account-deletion:operator -- \
  --stage summary \
  --request <request-ref> \
  --proof-candidate-disposable \
  --proof-candidate-owner-confirmed \
  --proof-candidate-reviewer-confirmed \
  --proof-candidate-approver-confirmed \
  --proof-candidate-dry-runs-runnable \
  --proof-candidate-human-checks-aligned
```

Record only:

- request lifecycle status,
- cleanup stage statuses,
- retry count,
- `proofCandidate.status`,
- `proofCandidate.safeReasonCode`,
- safe request markers.

Do not record the request ref, deletion request id, user id, email, or raw DB output.

### 3. Provider Dry-Run

Use the existing provider dry-run path / Settings summary for the disposable request.

Record only:

- provider cleanup safe status,
- candidate count,
- blocked/not_needed/required classification,
- safe reason code.

GO only if ElevenLabs candidate status is runnable or `not_needed`.

### 4. Storage Dry-Run

Use the existing Storage dry-run path / Settings summary for the disposable request.

Record only:

- bucket-level candidate counts,
- DB-known object count,
- listed object count,
- orphan/missing count if safely computed,
- bucket status,
- safe reason code.

GO only if every required bucket is runnable or `not_needed`.

### 5. DB Dry-Run

Use the existing DB dry-run path / Settings summary for the disposable request.

Record only:

- table-level candidate counts,
- cascade / explicit delete / delete-last / retain-anonymize classification,
- quota event candidate count,
- retained tracking count,
- safe reason code.

GO only if classification matches the fixture and there is no retention/anonymization ambiguity.

### 6. Auth Dry-Run

Use the existing Auth dry-run path / Settings summary for the disposable request.

Record only:

- Auth deletion readiness,
- service-role boundary status,
- prior-stage waiting status,
- anonymized tracking expectation,
- safe reason code.

GO only if Auth deletion is waiting for DB cleanup and can become runnable after prior stages.

### 7. Fake-Only Proof Package Rehearsal

Generate or review the RR-3o fake-only package:

```bash
npm run account-deletion:operator:rehearsal -- --format markdown
npm run account-deletion:proof-package:self-test
```

This verifies proof formatting only. It is not destructive proof evidence.

## GO / WARN / BLOCKED / FAIL Before Destructive Proof

### GO

All of the following must be true:

- disposable account confirmed,
- owner / reviewer / approver recorded,
- request is `confirmed`,
- provider / Storage / DB / Auth dry-runs are runnable or `not_needed`,
- operator `summary` proof candidate is `pass`,
- Human Check Backlog items relevant to deletion/support/legal are resolved or explicitly accepted for disposable proof,
- RR-3o sample package has been reviewed,
- raw-data-free proof rules are understood,
- destructive guard is still off before the final approval step.

### WARN

GO WITH WARNINGS may be possible only with release-owner acceptance when:

- a fixture table has zero candidates but that is expected,
- provider candidate is `not_needed` because no disposable ElevenLabs voice was created,
- optional saved best/model audio fixture is absent,
- a dashboard/human-check item is still WARN but not required for disposable proof.

### BLOCKED

Do not run destructive proof if:

- any required approval marker is missing,
- request is not `confirmed`,
- proof candidate is `blocked`,
- any dry-run is blocked, mismatched, stale, or `manual_required`,
- provider / Storage / DB / Auth ownership is ambiguous,
- Human Check Backlog has a relevant unresolved BLOCKED item with no release-owner acceptance,
- destructive guard is already enabled before final approval,
- proof requires raw ids, raw content, secrets, signed URLs, provider ids, or storage paths.

### FAIL

Treat the preparation as FAIL if:

- real destructive cleanup is executed during preparation,
- a real user or production account is selected,
- raw user/provider/storage/auth data is copied into proof,
- public UI/API is used to trigger actual cleanup,
- DB schema / migration / RLS changes are made to force the proof through,
- operator proceeds despite a BLOCKED condition.

## Allowed / Forbidden Fixture Evidence

Allowed:

- safe counts,
- safe reason codes,
- stage status,
- candidate classification,
- marker presence,
- PASS / WARN / BLOCKED / FAIL,
- checked date,
- commit short ref,
- environment label without raw project/account id.

Forbidden:

- raw user id,
- email,
- deletion request id,
- request ref,
- provider voice id,
- storage path,
- object key,
- signed URL,
- DB row id,
- script text,
- transcript,
- coach feedback text,
- token,
- service-role key,
- raw provider response,
- raw audio,
- billing amount,
- account / subscription / project / resource ids.

## Relationship To RR-3o

RR-3o is the fake-only proof package sample. RR-3p is the checklist for selecting and preparing the future real disposable-account proof target.

- RR-3o can train proof formatting.
- RR-3p decides whether a real disposable fixture is ready for destructive proof.
- Neither document authorizes destructive execution.
- Real proof still requires final operator / reviewer / approver sign-off and explicit destructive guard enablement for one stage at a time.

## RR-3p Status

RR-3p is docs-only checklist work.

No disposable account was created or deleted. No destructive guard was enabled. No real provider / Storage / DB / Auth cleanup service was connected or executed.
