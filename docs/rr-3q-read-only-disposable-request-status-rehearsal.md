# RR-3q Read-Only Disposable Request Status Rehearsal

RR-3q is the final non-destructive account deletion evidence check before a future disposable-account destructive proof.

This document does **not** authorize destructive cleanup. Do not enable `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE=1` for RR-3q. Do not create or delete a disposable account. Do not call ElevenLabs delete, Supabase Storage delete, DB cleanup/anonymize, or Supabase Auth deletion.

## Scope

RR-3q connects the existing non-destructive evidence chain:

1. Operator `status`.
2. Operator `summary`.
3. Fake-only rehearsal.
4. Sample proof package.
5. Dry-run proof checklist.
6. Production / Storage / RLS readiness checks.

RR-3q does not cover:

- real destructive deletion,
- destructive guard enablement,
- disposable account creation or deletion,
- real provider / Storage / DB / Auth cleanup service connection,
- public UI/API,
- admin UI,
- DB schema / migration changes,
- RLS policy changes,
- dashboard / billing / legal / support / SLA human checks.

## Provider Roles

- ElevenLabs: voice provider / voice clone / model audio generation.
- OpenAI: transcription / script generation / coaching-adjacent generation.
- Azure: pronunciation evaluator.
- Supabase: Auth / DB / Storage.

## Rehearsal Flow

### 1. Baseline Self-Tests

Run the account deletion self-tests and infrastructure preflights before looking at any request.

Purpose:

- prove the guarded stage boundaries still block destructive cleanup by default,
- prove operator output stays safe,
- prove proof package samples remain raw-data-free,
- prove production/env and Supabase/Storage/RLS non-destructive checks still pass.

### 2. Operator Status

Command shape:

```bash
npm run account-deletion:operator -- \
  --stage status \
  --request <request-ref>
```

Record only:

- request lifecycle status,
- cleanup stage statuses,
- retry count,
- safe request markers,
- next action.

Do not record the request ref, deletion request id, user id, email, or raw DB output.

Expected use:

- confirm the request is visible to the server-side read-only resolver,
- confirm the lifecycle is not already completed / cancelled / expired,
- confirm destructive stages remain disconnected.

### 3. Operator Summary

Command shape:

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

- `proofCandidate.status`,
- `proofCandidate.safeReasonCode`,
- request lifecycle status,
- cleanup stage statuses,
- safe next action.

Expected use:

- confirm the future proof candidate can be described with safe markers,
- confirm reviewer / approver / dry-run / Human Check alignment are explicitly modeled,
- stop if the candidate is `blocked`.

### 4. Stage Dry-Run Checklist

Use `docs/rr-3p-disposable-fixture-dry-run-proof-checklist.md` for stage-by-stage dry-run evidence:

- provider dry-run,
- Storage dry-run,
- DB dry-run,
- Auth dry-run.

Record only safe counts, stage status, classification, and safe reason codes.

Do not record provider voice id, storage path, object key, signed URL, row id, user id, email, script body, transcript, raw provider response, token, or secret.

### 5. Fake-Only Rehearsal

Command shape:

```bash
npm run account-deletion:operator:rehearsal -- \
  --format json \
  --operator-marker operator \
  --reviewer-marker reviewer \
  --approver-marker approver \
  --env-label environment \
  --proof-template rr-3f
```

Purpose:

- rehearse provider -> Storage -> DB -> Auth -> completion proof flow,
- produce safe JSON/markdown that can be copied into practice proof docs,
- confirm fake-only output is clearly not a real destructive proof.

If `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE=1` is present, rehearsal must return `BLOCKED`.

### 6. Sample Proof Package

Use `docs/rr-3o-sample-disposable-proof-package.md` as the formatting example.

The sample package is fake-only. It is not Store submission evidence and must not be presented as proof of actual deletion.

## Full Pre-Run Command Sequence

Run in this order before any future disposable destructive proof:

```bash
npm run account-deletion:provider-cleanup:self-test
npm run account-deletion:storage-cleanup:self-test
npm run account-deletion:database-cleanup:self-test
npm run account-deletion:auth-cleanup:self-test
npm run account-deletion:operator:self-test
npm run account-deletion:operator:rehearsal:self-test
npm run account-deletion:proof-package:self-test
npm run production:preflight
npm run supabase:storage-rls:check
```

Then, only when a future disposable request exists:

```bash
npm run account-deletion:operator -- --stage status --request <request-ref>
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

Finally, rehearse proof formatting:

```bash
npm run account-deletion:operator:rehearsal -- --format json
npm run account-deletion:proof-package:self-test
```

## Proof Destinations

| Evidence | Record in | Notes |
| --- | --- | --- |
| Self-test pass/fail | `docs/rr-3f-destructive-audit-operator-runbook.md` proof template or future proof package | Record command name, result, checked_at, and safe notes only. |
| Operator status | Future real proof package | Record lifecycle / stage statuses only. Do not record request ref. |
| Operator summary | Future real proof package and RR-3m candidate section | Record `proofCandidate.status` and safe reason code only. |
| Provider dry-run | RR-3p dry-run section / future real proof package | Safe candidate count and classification only. |
| Storage dry-run | RR-3p dry-run section / future real proof package | Bucket-level counts only. |
| DB dry-run | RR-3p dry-run section / future real proof package | Table-level counts and classification only. |
| Auth dry-run | RR-3p dry-run section / future real proof package | Readiness / waiting status only. |
| Fake rehearsal | RR-3o sample format or future practice proof | Must be labeled fake-only. |
| Production preflight | Gate1i release candidate proof / future proof package | Secret values hidden. |
| Storage/RLS checker | Gate1b proof / future proof package | Non-destructive checker only; manual cross-user proof remains separate. |

## PASS / WARN / BLOCKED / FAIL

### PASS

- All self-tests and preflights pass.
- Operator `status` / `summary` returns safe output only.
- `proofCandidate.status=pass` only when all explicit safe confirmation flags are supplied.
- Fake-only rehearsal returns `PASS` with destructive guard off.
- Sample proof package self-test confirms raw-data absence.
- No real cleanup service is called.

### WARN

- Optional disposable fixture data is missing but the deletion path still exercises required stages.
- Human Check Backlog items are still deferred but explicitly marked as not PASS.
- A dry-run has zero candidates where the fixture makes that expected.
- Fake rehearsal is complete but not yet copied into a future proof package.

### BLOCKED

- Human Check Backlog item required for the target proof remains unresolved with no release-owner acceptance.
- Operator summary returns `proofCandidate.status=blocked`.
- Stage dry-run is blocked / ambiguous / mismatched.
- Destructive guard is enabled during rehearsal or preparation.
- Request is not confirmed, is expired/cancelled/completed, or cannot be read safely.
- Raw ids are required to make the proof decision.

### FAIL

- Any real provider / Storage / DB / Auth cleanup runs during RR-3q.
- Any proof output includes raw user id, email, deletion request id, provider id, storage path, object key, signed URL, row id, script body, transcript, token, service role key, raw provider response, or secret.
- A public UI/API is used to trigger actual cleanup.
- DB schema / migration / RLS changes are made to force the proof through.

## Raw Data Non-Recording Rule

Allowed:

- stage names,
- request lifecycle status,
- cleanup stage statuses,
- safe counts,
- safe reason codes,
- `provided_not_echoed` / `not_provided` markers,
- checked_at,
- reviewer/operator/approver role markers,
- next action.

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
- script body,
- transcript,
- raw audio,
- auth token,
- service role key,
- raw provider response,
- billing/account/project/resource identifiers.

## Relationship To Previous RR-3 Work

- RR-3l provides the read-only status / summary resolver.
- RR-3m defines disposable proof candidate conditions.
- RR-3n provides fake-only rehearsal output.
- RR-3o provides the sample proof package shape.
- RR-3p defines fixture and dry-run proof checklists.
- RR-3q ties those pieces into a final non-destructive evidence sequence.
- RR-3r provides the empty future disposable proof package template that maps this evidence sequence into fields for a later approved live disposable proof.

## RR-3q Status

RR-3q is docs-only and non-destructive.

No disposable account was created or deleted. No destructive guard was enabled. No real provider / Storage / DB / Auth cleanup service was connected or executed. No public UI/API was added.
