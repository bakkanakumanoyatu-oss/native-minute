# RR-3o Sample Disposable Proof Package

**FAKE-ONLY SAMPLE. This is not a real destructive proof.**

This package shows how RR-3n fake-only rehearsal output should be assembled into the RR-3f proof template shape. It does not use a disposable account, does not enable `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE=1`, and does not call ElevenLabs, Supabase Storage, DB cleanup/anonymize, or Supabase Auth deletion.

## Package Purpose

Use this sample to rehearse:

- where to place review metadata,
- how to copy safe stage decisions,
- which safe counts and reason codes belong in proof,
- how to record raw-data absence,
- how to distinguish fake-only rehearsal from future real disposable proof.

Do not use this sample as Store submission evidence. It is a template rehearsal artifact only.

## Review Metadata

| Field | Sample value |
| --- | --- |
| proof_type | `fake_only_operator_rehearsal` |
| checked_at | `sample_timestamp_not_live` |
| commit_short_ref | `sample_commit_ref_not_live` |
| environment_marker | `provided_not_echoed` |
| launch_mode | `sample_private_beta_marker` |
| operator_marker | `provided_not_echoed` |
| reviewer_marker | `provided_not_echoed` |
| approver_marker | `provided_not_echoed` |
| proof_template | `provided_not_echoed` |
| destructive_guard | `off_required_for_rehearsal` |
| real_cleanup_executed | `no` |

## Source Command

The sample corresponds to this non-destructive command shape:

```bash
npm run account-deletion:operator:rehearsal -- \
  --format json \
  --operator-marker operator \
  --reviewer-marker reviewer \
  --approver-marker approver \
  --env-label local \
  --proof-template rr-3f
```

The command records marker presence only. Do not paste personal names, email addresses, project ids, account ids, or proof paths into public docs.

## Rehearsal Output Summary

| Stage | Decision | Status | Safe count | Safe reason code | Next action |
| --- | --- | --- | --- | --- | --- |
| provider | `PASS` | `rehearsed` | `providerCandidates=2` | `fake_provider_rehearsal_succeeded` | Real proof must run provider cleanup first, then stop for review. |
| storage | `PASS` | `rehearsed` | `storageObjects=4` | `fake_storage_rehearsal_succeeded` | Real proof must run storage only after provider is satisfied. |
| database | `PASS` | `rehearsed` | `databaseTables=10` | `fake_database_rehearsal_succeeded` | Real proof must run DB only after provider and storage are satisfied. |
| auth | `PASS` | `rehearsed` | `authUsers=1` | `fake_auth_rehearsal_succeeded` | Real proof must run Auth last, only after DB is satisfied. |
| completion | `PASS` | `rehearsed` | `completionRecords=1` | `fake_completion_rehearsal_succeeded` | Real proof must record completion only after Auth succeeds. |

## RR-3f Mapping

| RR-3f proof area | RR-3o sample source |
| --- | --- |
| Required approval | Review metadata markers show presence only. Real approval is not granted by this sample. |
| Required disposable test data | Not exercised. Future real proof must use a disposable account with test data. |
| Pre-execution checklist | `destructive_guard=off_required_for_rehearsal` proves this is only rehearsal. |
| Provider stage | Fake provider stage row. |
| Storage stage | Fake storage stage row. |
| DB stage | Fake database stage row. |
| Auth stage | Fake auth stage row. |
| Completion tracking | Fake completion stage row. |
| Partial failure handling | Not exercised; see PASS/WARN/BLOCKED/FAIL conditions below. |
| Raw data policy | Raw-data absence confirmation below. |

## PASS / WARN / BLOCKED / FAIL Conditions

### PASS

For this fake-only package, PASS means:

- rehearsal command completed with `overallDecision=PASS`,
- every fake stage returned `decision=PASS`,
- raw-data absence self-test passed,
- destructive guard was not enabled,
- safety booleans show real cleanup was not called.

### WARN

Use WARN if:

- marker values are missing but the rehearsal is still clearly fake-only,
- the sample is incomplete but no raw data appears,
- a future real proof prerequisite is pending but documented.

### BLOCKED

Use BLOCKED if:

- destructive guard is enabled during rehearsal,
- unknown CLI arguments are present,
- any raw identifier or secret appears,
- reviewer / approver markers are missing and the package could be mistaken for release evidence,
- the package omits the fake-only disclaimer.

### FAIL

Use FAIL if:

- any real provider / Storage / DB / Auth cleanup is called,
- the sample uses a real user or production account,
- raw provider response, auth token, signed URL, storage locator, script text, transcript, or email appears,
- the package is presented as a real destructive proof.

## Raw Data Absence Confirmation

This sample intentionally contains no:

- raw user identifier,
- email address,
- deletion request identifier,
- provider voice identifier,
- storage path,
- object key,
- signed URL,
- DB row identifier,
- transcript,
- script body,
- token,
- service-role key,
- raw provider response,
- billing amount,
- provider account id,
- cloud subscription id,
- Supabase project ref.

Use safe markers, safe counts, safe reason codes, and stage decisions only.

## Fake-Only vs Real Disposable Proof

| Area | RR-3o fake-only sample | Future real disposable proof |
| --- | --- | --- |
| Account | No account | Disposable account only |
| Request | No request lookup | Confirmed request resolved server-side |
| Stage execution | Fake bundled sequence | One stage per invocation |
| Destructive guard | Must be off | Explicitly enabled after approval |
| Cleanup services | Not called | Called one stage at a time |
| Evidence value | Operator rehearsal proof package | Store-readiness deletion proof |
| Raw data | Never recorded | Never recorded |

## Final Decision

`PASS_FOR_REHEARSAL_ONLY`

This package can be used to train the operator/reviewer flow and to check proof formatting. It does not satisfy the Store submission blocker for actual account/data deletion completion.

## Next Action

Before a real disposable proof:

1. Resolve or explicitly accept Human Check Backlog items relevant to deletion/support/legal policy.
2. Prepare a disposable account with owned test data.
3. Create and confirm the deletion request.
4. Run read-only status / summary and dry-run checks.
5. Record operator / reviewer / approver approval.
6. Prepare a real proof package from RR-3f.
7. Only then consider enabling the destructive guard for exactly one stage.

## RR-3p Follow-Up

RR-3p adds the disposable fixture / dry-run proof checklist that should be completed before step 2 through step 4 above. It defines required fixture data, dry-run order, GO/WARN/BLOCKED/FAIL conditions, and raw-data-free proof rules.
