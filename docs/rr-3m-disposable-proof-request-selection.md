# RR-3m Disposable Proof Request Selection / Operator Proof Preparation

RR-3m prepares the future disposable-account destructive proof without running it.

This document does **not** authorize destructive cleanup. Do not enable `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE=1` during RR-3m. Do not call ElevenLabs delete, Supabase Storage delete, DB cleanup/anonymize, or Supabase Auth deletion.

## Scope

RR-3m covers:

- disposable proof request selection criteria,
- proof exclusion criteria,
- operator proof preparation checklist,
- safe status/summary fields needed before proof,
- fake-first candidate assessment in the operator runner,
- raw-data-free proof rules.

RR-3m does not cover:

- real destructive deletion,
- destructive guard enablement,
- real cleanup service connection,
- disposable account deletion,
- public UI/API,
- admin UI,
- DB schema / migration changes,
- RLS policy changes.

## Disposable Proof Request Selection Criteria

A request can be considered a disposable proof candidate only when all conditions below are true:

| Check | Required safe evidence |
| --- | --- |
| Disposable account | Operator explicitly confirms the account is disposable. |
| Not a production user | Reviewer confirms this is not a real user/support/legal request. |
| Request owner known | Owner/operator is recorded in the proof template. |
| Reviewer known | Reviewer is recorded in the proof template. |
| Approver known | Release owner / approver is recorded in the proof template. |
| Request status | `account_deletion_requests.status=confirmed`. |
| Stage status freshness | provider / Storage / DB / Auth cleanup statuses are `pending` or `not_needed` before first destructive proof. |
| Dry-run readiness | Latest provider / Storage / DB / Auth dry-runs are runnable or `not_needed`. |
| Human Check Backlog | Relevant deletion/support/legal backlog items are resolved or explicitly accepted for disposable proof by release owner. |
| Raw-data rule | Candidate can be judged without copying raw user id, email, request id, provider id, storage path, object key, signed URL, transcript, script body, token, service-role key, or raw provider response. |

## Proof Exclusion Criteria

Do not use a request for disposable destructive proof if any condition below is true:

- It belongs to a real user or production customer.
- It is a support/legal/SLA request whose policy wording is not finalized.
- The request owner, reviewer, or approver is unclear.
- The request is not `confirmed`.
- Any cleanup stage is already `succeeded`, `failed`, or `manual_required` before first proof.
- Latest provider / Storage / DB / Auth dry-run readiness is missing or mismatched.
- Human Check Backlog is blocked and release owner has not explicitly accepted the risk for disposable proof.
- Candidate judgment requires raw ids or raw content in proof.
- Operator cannot explain whether the account data is disposable.
- The target environment / commit / proof template path is not recorded.

## Operator Status / Summary Relationship

RR-3l added read-only request status lookup for `status` and `summary`.

RR-3m extends that safe summary with `proofCandidate` assessment. The candidate assessment is based only on:

- request lifecycle status,
- provider / Storage / DB / Auth / notification cleanup statuses,
- retry count,
- explicit operator confirmations supplied via `--proof-candidate-*` flags.

Allowed output:

- `proofCandidate.status`: `pass` or `blocked`,
- `proofCandidate.safeReasonCode`,
- `proofCandidate.checks` booleans,
- `proofCandidate.nextAction`.

Forbidden output remains unchanged:

- raw user id,
- email,
- deletion request id,
- raw operator request ref,
- provider voice id,
- storage path,
- object key,
- signed URL,
- DB row id,
- transcript,
- script body,
- token,
- service-role key,
- raw provider response.

## Candidate Assessment Flags

Use these flags only for non-destructive `status` / `summary` proof preparation:

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

The request ref may be a request UUID or `anonymized_user_ref`. Do not paste the raw ref into docs or screenshots.

`proofCandidate.status=pass` means the request is ready to be copied into the proof template for reviewer / release-owner evaluation. It does **not** mean destructive cleanup may run.

## Proof Preparation Checklist

Before any future destructive proof:

1. Prepare a disposable account.
2. Confirm the account is not a real user/support/legal request.
3. Add owned disposable test data:
   - script,
   - take / review / progress result,
   - weak words / coach feedback,
   - generated script audio if available,
   - voice sample / consent recording if available,
   - ElevenLabs cloned voice candidate if provider environment supports it,
   - quota events if available.
4. Create and confirm the account deletion request.
5. Run read-only operator `summary` and record only safe output fields.
6. Run provider / Storage / DB / Auth dry-run checks and record safe counts/status only.
7. Confirm owner / reviewer / approver.
8. Confirm Human Check Backlog treatment for deletion/support/legal items.
9. Prepare the RR-3f proof template path.
10. Record the exact commit short ref.
11. Record environment label without raw project id/account id.
12. Record irreversible acknowledgement text in the proof template.
13. Record stop conditions:
    - any candidate condition blocked,
    - any dry-run mismatch,
    - any raw data appears in output/proof,
    - any stage status is inconsistent,
    - any human approval is missing,
    - any real user ambiguity appears.

Do not enable the destructive guard during proof preparation.

## Fake-First Self-Test Coverage

`npm run account-deletion:operator:self-test` verifies:

- disposable candidate can pass with safe lifecycle/status and explicit confirmations,
- real-user-like candidate is blocked when disposable confirmation is missing,
- missing approver is blocked,
- dry-run mismatch / stale stage status is blocked,
- operator summary can return proof candidate PASS without calling destructive services,
- raw user id / email / request id / provider id / storage path / token / raw provider response do not appear in output.

## Remaining Before Disposable Proof

Before actually running destructive proof:

- complete final human-check batch or get release-owner acceptance for disposable proof scope,
- decide support contact and account deletion SLA,
- finish legal/support draft review for target launch mode,
- prepare disposable account data and request,
- run read-only summary and all dry-runs,
- get operator / reviewer / approver sign-off,
- only then consider enabling `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE=1` for one stage at a time.

## RR-3m Status

RR-3m is proof preparation only.

No destructive guard was enabled. No real provider / Storage / DB / Auth cleanup service was connected or executed. No disposable account was deleted.

## RR-3n Follow-Up

RR-3n adds fake-only proof log generation for final operator rehearsal:

- `npm run account-deletion:operator:rehearsal` emits safe JSON / markdown.
- The fake sequence covers provider -> Storage -> DB -> Auth -> completion.
- Marker values are never echoed; they are represented as `provided_not_echoed` / `not_provided`.
- If the destructive guard is enabled, rehearsal returns `BLOCKED`.
- This is rehearsal evidence only and does not authorize destructive proof.
