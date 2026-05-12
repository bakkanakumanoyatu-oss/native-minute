# RR-3r Future Disposable Proof Package Template

This is an empty template for a future disposable-account destructive proof.

It is not proof that destructive deletion has been executed. It does not authorize destructive cleanup. Do not enable `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE=1` while preparing this template.

Copy this file into a dated proof package only after operator / reviewer / approver sign-off. Keep this source file as the empty template.

## Scope

RR-3r covers:

- empty proof package structure for a future disposable live proof,
- RR-3q evidence-flow mapping,
- operator / reviewer / approver recording fields,
- stage-by-stage actual proof fields,
- PASS / WARN / BLOCKED / FAIL recording rules,
- raw-data non-recording rules.

RR-3r does not cover:

- real destructive deletion,
- destructive guard enablement,
- disposable account creation or deletion,
- provider / Storage / DB / Auth real cleanup service connection,
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

## Review Metadata

| Field | Value |
| --- | --- |
| proof_type | `<future_disposable_live_proof>` |
| proof_status | `<draft|ready_for_review|blocked|completed|failed>` |
| checked_at | `<timestamp_without_sensitive_values>` |
| operator_marker | `<safe_marker_only>` |
| reviewer_marker | `<safe_marker_only>` |
| approver_marker | `<safe_marker_only>` |
| environment_marker | `<local|staging|production_like|other_safe_label>` |
| commit_short_ref | `<short_ref_only>` |
| launch_mode | `<private_beta|small_cohort|store_submission_rehearsal|other>` |
| destructive_guard_state | `<off|on_for_approved_single_stage>` |
| real_cleanup_executed | `<no|yes_single_stage|yes_full_sequence>` |
| proof_template_source | `docs/rr-3r-future-disposable-proof-package-template.md` |

## Disposable Account Confirmation

| Check | Result | Safe notes |
| --- | --- | --- |
| Disposable account confirmed | `<PASS|WARN|BLOCKED|FAIL>` | `<safe notes only>` |
| Production user excluded | `<PASS|WARN|BLOCKED|FAIL>` | `<safe notes only>` |
| Owner identified | `<PASS|WARN|BLOCKED|FAIL>` | `<safe marker only>` |
| Reviewer identified | `<PASS|WARN|BLOCKED|FAIL>` | `<safe marker only>` |
| Approver identified | `<PASS|WARN|BLOCKED|FAIL>` | `<safe marker only>` |
| Request status confirmed | `<PASS|WARN|BLOCKED|FAIL>` | `Record lifecycle status only. Do not record request ref or id.` |
| Fixture data prepared | `<PASS|WARN|BLOCKED|FAIL>` | `Record fixture categories only.` |
| Raw data absence confirmed | `<PASS|WARN|BLOCKED|FAIL>` | `No forbidden raw values recorded.` |

## Human Check Backlog Status

Human Check Backlog items must not be marked PASS from this template alone.

| Backlog item | Status | Release-owner treatment | Safe notes |
| --- | --- | --- | --- |
| Azure Speech resource / region / quota / usage visibility | `<PASS|WARN|BLOCKED|deferred>` | `<accepted|not_accepted|n/a>` | `<safe notes only>` |
| OpenAI dedicated project separation | `<PASS|WARN|BLOCKED|deferred>` | `<accepted|not_accepted|n/a>` | `<safe notes only>` |
| OpenAI budget / alert final setting | `<PASS|WARN|BLOCKED|deferred>` | `<accepted|not_accepted|n/a>` | `<safe notes only>` |
| ElevenLabs explicit alert / notification setting | `<PASS|WARN|BLOCKED|deferred>` | `<accepted|not_accepted|n/a>` | `<safe notes only>` |
| Supabase Storage usage / egress visibility | `<PASS|WARN|BLOCKED|deferred>` | `<accepted|not_accepted|n/a>` | `<safe notes only>` |
| Support contact | `<PASS|WARN|BLOCKED|deferred>` | `<accepted|not_accepted|n/a>` | `<safe notes only>` |
| Account deletion SLA / manual cleanup owner | `<PASS|WARN|BLOCKED|deferred>` | `<accepted|not_accepted|n/a>` | `<safe notes only>` |
| Privacy / Terms / Support / Account deletion draft review | `<PASS|WARN|BLOCKED|deferred>` | `<accepted|not_accepted|n/a>` | `<safe notes only>` |

## RR-3q Evidence Flow Mapping

| RR-3q evidence step | Record in this template | Required recording style |
| --- | --- | --- |
| Account-deletion self-tests | Non-destructive baseline evidence | command name, result, checked_at, safe notes |
| Operator `status` | Operator status result | lifecycle status and cleanup stage statuses only |
| Operator `summary` | Operator summary result | proof candidate status / safe reason code only |
| Provider dry-run | Provider dry-run result | safe candidate counts and runnable / blocked status |
| Storage dry-run | Storage dry-run result | bucket-level safe counts and runnable / blocked status |
| DB dry-run | DB dry-run result | table-level safe counts and classification only |
| Auth dry-run | Auth dry-run result | readiness / waiting / blocked status only |
| Fake-only rehearsal | Fake-only rehearsal reference | mark as fake-only, not live proof |
| RR-3o sample package | Formatting reference | do not copy fake decisions as live evidence |
| `production:preflight` | Production preflight evidence | result only, no env values |
| `supabase:storage-rls:check` | Supabase / Storage / RLS evidence | result only, no project refs or object keys |

## Non-Destructive Baseline Evidence

| Command | Result | checked_at | Safe notes |
| --- | --- | --- | --- |
| `npm run account-deletion:provider-cleanup:self-test` | `<PASS|WARN|BLOCKED|FAIL>` | `<timestamp>` | `<safe notes only>` |
| `npm run account-deletion:storage-cleanup:self-test` | `<PASS|WARN|BLOCKED|FAIL>` | `<timestamp>` | `<safe notes only>` |
| `npm run account-deletion:database-cleanup:self-test` | `<PASS|WARN|BLOCKED|FAIL>` | `<timestamp>` | `<safe notes only>` |
| `npm run account-deletion:auth-cleanup:self-test` | `<PASS|WARN|BLOCKED|FAIL>` | `<timestamp>` | `<safe notes only>` |
| `npm run account-deletion:operator:self-test` | `<PASS|WARN|BLOCKED|FAIL>` | `<timestamp>` | `<safe notes only>` |
| `npm run account-deletion:operator:rehearsal:self-test` | `<PASS|WARN|BLOCKED|FAIL>` | `<timestamp>` | `<safe notes only>` |
| `npm run account-deletion:proof-package:self-test` | `<PASS|WARN|BLOCKED|FAIL>` | `<timestamp>` | `<safe notes only>` |
| `npm run production:preflight` | `<PASS|WARN|BLOCKED|FAIL>` | `<timestamp>` | `<safe notes only>` |
| `npm run supabase:storage-rls:check` | `<PASS|WARN|BLOCKED|FAIL>` | `<timestamp>` | `<safe notes only>` |

## Operator Status Result

| Field | Value |
| --- | --- |
| command_shape | `account-deletion:operator -- --stage status --request <not_recorded>` |
| request_marker | `<resolved_safe_marker|not_recorded>` |
| lifecycle_status | `<requested|confirmed|processing|failed_status|completed|cancelled|expired|unknown>` |
| provider_cleanup_status | `<pending|not_needed|succeeded|failed|manual_required|unknown>` |
| storage_cleanup_status | `<pending|not_needed|succeeded|failed|manual_required|unknown>` |
| db_cleanup_status | `<pending|not_needed|succeeded|failed|manual_required|unknown>` |
| auth_cleanup_status | `<pending|not_needed|succeeded|failed|manual_required|unknown>` |
| retry_count_marker | `<safe_count_or_not_available>` |
| next_action | `<safe next action>` |

## Operator Summary Result

| Field | Value |
| --- | --- |
| command_shape | `account-deletion:operator -- --stage summary --request <not_recorded> ...` |
| proofCandidate.status | `<pass|blocked|unknown>` |
| proofCandidate.safeReasonCode | `<safe_reason_code>` |
| disposable_confirmation | `<provided_not_echoed|not_provided>` |
| owner_confirmation | `<provided_not_echoed|not_provided>` |
| reviewer_confirmation | `<provided_not_echoed|not_provided>` |
| approver_confirmation | `<provided_not_echoed|not_provided>` |
| dry_run_confirmation | `<provided_not_echoed|not_provided>` |
| human_check_alignment | `<provided_not_echoed|not_provided>` |
| next_action | `<safe next action>` |

## Provider Dry-Run Result

| Field | Value |
| --- | --- |
| provider | `ElevenLabs` |
| result | `<PASS|WARN|BLOCKED|FAIL>` |
| cleanup_status | `<required|not_needed|blocked|unknown>` |
| provider_candidate_count | `<safe count>` |
| provider_id_present_count | `<safe count>` |
| provider_id_missing_or_invalid_count | `<safe count>` |
| safe_reason_code | `<safe reason code>` |
| notes | `<safe notes only>` |

## Storage Dry-Run Result

| Bucket | Result | Known object count | Listed object count | Orphan candidate count | Safe reason code |
| --- | --- | --- | --- | --- | --- |
| recordings | `<PASS|WARN|BLOCKED|FAIL>` | `<safe count>` | `<safe count>` | `<safe count>` | `<safe reason code>` |
| script-audios | `<PASS|WARN|BLOCKED|FAIL>` | `<safe count>` | `<safe count>` | `<safe count>` | `<safe reason code>` |
| voice-samples | `<PASS|WARN|BLOCKED|FAIL>` | `<safe count>` | `<safe count>` | `<safe count>` | `<safe reason code>` |
| voice-consents | `<PASS|WARN|BLOCKED|FAIL>` | `<safe count>` | `<safe count>` | `<safe count>` | `<safe reason code>` |

## DB Dry-Run Result

| Classification | Result | Safe count | Safe reason code |
| --- | --- | --- | --- |
| cascade dependent rows | `<PASS|WARN|BLOCKED|FAIL>` | `<safe count>` | `<safe reason code>` |
| explicit user-owned rows | `<PASS|WARN|BLOCKED|FAIL>` | `<safe count>` | `<safe reason code>` |
| delete-last rows | `<PASS|WARN|BLOCKED|FAIL>` | `<safe count>` | `<safe reason code>` |
| retain/anonymize rows | `<PASS|WARN|BLOCKED|FAIL>` | `<safe count>` | `<safe reason code>` |
| not-touched rows | `<PASS|WARN|BLOCKED|FAIL>` | `<safe count>` | `<safe reason code>` |

## Auth Dry-Run Result

| Field | Value |
| --- | --- |
| result | `<PASS|WARN|BLOCKED|FAIL>` |
| auth_stage_status | `<waiting|runnable|blocked|not_needed>` |
| prior_stages_satisfied | `<yes|no>` |
| service_role_boundary_confirmed | `<yes|no>` |
| anonymized_tracking_ready | `<yes|no>` |
| safe_reason_code | `<safe reason code>` |
| notes | `<safe notes only>` |

## Fake-Only Rehearsal Reference

| Field | Value |
| --- | --- |
| rehearsal_command | `npm run account-deletion:operator:rehearsal -- --format json` |
| rehearsal_result | `<PASS|WARN|BLOCKED|FAIL>` |
| fake_only_label_present | `<yes|no>` |
| destructive_guard_off | `<yes|no>` |
| real_cleanup_called | `no` |
| transfer_notes | `Use for formatting only. Do not treat fake decisions as live proof.` |

## Stage-By-Stage Actual Proof

Fill this section only during a future approved disposable destructive proof. One stage should be executed and reviewed at a time.

### 1. Provider Cleanup

| Field | Value |
| --- | --- |
| preconditions_satisfied | `<yes|no>` |
| stage_decision | `<PASS|WARN|BLOCKED|FAIL>` |
| safe_counts | `<safe counts only>` |
| safe_reason_code | `<safe reason code>` |
| operator_signoff | `<safe marker only>` |
| reviewer_signoff | `<safe marker only>` |
| next_action | `<continue_to_storage|stop|manual_required>` |
| raw_data_absence_confirmed | `<yes|no>` |

### 2. Storage Cleanup

| Field | Value |
| --- | --- |
| preconditions_satisfied | `<yes|no>` |
| provider_stage_satisfied | `<yes|no>` |
| stage_decision | `<PASS|WARN|BLOCKED|FAIL>` |
| safe_counts | `<safe counts only>` |
| safe_reason_code | `<safe reason code>` |
| operator_signoff | `<safe marker only>` |
| reviewer_signoff | `<safe marker only>` |
| next_action | `<continue_to_db|stop|manual_required>` |
| raw_data_absence_confirmed | `<yes|no>` |

### 3. DB Cleanup / Anonymize

| Field | Value |
| --- | --- |
| preconditions_satisfied | `<yes|no>` |
| provider_stage_satisfied | `<yes|no>` |
| storage_stage_satisfied | `<yes|no>` |
| stage_decision | `<PASS|WARN|BLOCKED|FAIL>` |
| safe_counts | `<safe counts only>` |
| safe_reason_code | `<safe reason code>` |
| operator_signoff | `<safe marker only>` |
| reviewer_signoff | `<safe marker only>` |
| next_action | `<continue_to_auth|stop|manual_required>` |
| raw_data_absence_confirmed | `<yes|no>` |

### 4. Supabase Auth Deletion

| Field | Value |
| --- | --- |
| preconditions_satisfied | `<yes|no>` |
| provider_stage_satisfied | `<yes|no>` |
| storage_stage_satisfied | `<yes|no>` |
| db_stage_satisfied | `<yes|no>` |
| stage_decision | `<PASS|WARN|BLOCKED|FAIL>` |
| safe_counts | `<safe counts only>` |
| safe_reason_code | `<safe reason code>` |
| operator_signoff | `<safe marker only>` |
| reviewer_signoff | `<safe marker only>` |
| next_action | `<continue_to_completion|stop|manual_required>` |
| raw_data_absence_confirmed | `<yes|no>` |

### 5. Completion Verification

| Check | Result | Safe notes |
| --- | --- | --- |
| Disposable user cannot log in | `<PASS|WARN|BLOCKED|FAIL>` | `<safe notes only>` |
| Owned app data removed or anonymized | `<PASS|WARN|BLOCKED|FAIL>` | `<safe counts / status only>` |
| Protected replay inaccessible | `<PASS|WARN|BLOCKED|FAIL>` | `No audio id, take id, storage path, or URL.` |
| Tracking record remains safe | `<PASS|WARN|BLOCKED|FAIL>` | `Only anonymized tracking marker/status.` |
| Other user data unaffected | `<PASS|WARN|BLOCKED|FAIL>` | `<safe notes only>` |
| Raw data absence confirmed | `<PASS|WARN|BLOCKED|FAIL>` | `<safe notes only>` |

## Final Decision

| Field | Value |
| --- | --- |
| final_decision | `<GO|GO_WITH_WARNINGS|BLOCKED|FAIL>` |
| decision_reason | `<safe summary only>` |
| remaining_blockers | `<safe blocker list>` |
| Store_submission_ready_for_account_deletion | `<yes|no>` |
| next_action | `<safe next action>` |

## PASS / WARN / BLOCKED / FAIL Rules

### PASS

- All required pre-run self-tests and preflights pass.
- Disposable account and non-production status are confirmed.
- Operator `status` / `summary` output is safe and consistent.
- Provider / Storage / DB / Auth dry-runs are runnable or explicitly `not_needed`.
- Each actual stage is executed only after the prior stage is satisfied.
- Completion verification passes without raw data in the proof package.

### WARN

- Optional fixture categories are missing but the required deletion path is still exercised.
- A stage has zero candidates for an expected and documented reason.
- Human Check Backlog contains deferred items accepted by the release owner for this disposable proof only.
- A manual note is needed, but no stage is ambiguous or unsafe.

### BLOCKED

- Human approval, reviewer sign-off, or irreversible acknowledgement is missing.
- The account might be a real user or production support/legal request.
- Request status is not confirmed or safe resolver cannot read it.
- Any dry-run is blocked, ambiguous, stale, or mismatched.
- Prior stage is not satisfied.
- Raw data would be required to decide.
- Destructive guard is enabled outside an approved single-stage execution window.

### FAIL

- Any raw forbidden data appears in proof output.
- Any stage executes out of order.
- Any real cleanup runs outside the approved disposable proof window.
- Any public UI/API or unapproved admin surface triggers cleanup.
- Other-user data is affected.
- DB schema / migration / RLS changes are made to force proof completion.

## Raw Data Non-Recording Rule

Never record:

- raw user id,
- email,
- request id/ref,
- provider id,
- storage path,
- object key,
- signed URL,
- DB row id,
- script body,
- transcript,
- raw audio,
- token,
- service role key,
- raw provider response,
- secret.

Allowed:

- stage name,
- lifecycle status,
- cleanup stage status,
- safe counts,
- safe reason code,
- `provided_not_echoed` / `not_provided` markers,
- checked_at,
- operator / reviewer / approver markers,
- final decision,
- safe next action.

## Difference From RR-3o

RR-3o is a fake-only sample proof package. It is pre-filled with rehearsal-style values and exists to show formatting, transfer shape, and raw-data absence.

RR-3r is an empty future live-proof template. It should remain unfilled until a future disposable account is prepared, approved, dry-run checked, and executed under the destructive guard one stage at a time.

RR-3o must not be used as Store submission evidence. RR-3r becomes evidence only after it is copied, filled during an approved future disposable proof, reviewed, and kept raw-data-free.

## RR-3r Status

RR-3r is docs-only and non-destructive.

No disposable account was created or deleted. No destructive guard was enabled. No real provider / Storage / DB / Auth cleanup service was connected or executed. No public UI/API was added.
