# RR-3g Operator / Admin Execution Surface Design

RR-3g defines the future internal execution surface for actual account deletion.

This is a design document only. It does not add a public deletion button, public API, admin UI, CLI runner, or destructive execution path. Do not enable `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE=1` during normal development checks.

## Scope

The future operator surface must execute the already-defined destructive stages in order:

1. ElevenLabs provider cleanup.
2. Supabase Storage cleanup.
3. DB cleanup / anonymize.
4. Supabase Auth deletion.
5. Completion tracking.

Current guarded boundaries:

| Stage | Boundary | Status |
| --- | --- | --- |
| Provider cleanup | `runElevenLabsProviderCleanupActual` | RR-3b complete as guarded service boundary |
| Storage cleanup | `runStorageCleanupActual` | RR-3c complete as guarded service boundary |
| DB cleanup / anonymize | `runDatabaseCleanupActual` | RR-3d complete as guarded service boundary |
| Supabase Auth deletion | `runSupabaseAuthDeletionActual` | RR-3e complete as guarded service boundary |
| Destructive proof | `docs/rr-3f-destructive-audit-operator-runbook.md` | RR-3f complete as docs-only runbook / template |

None of these boundaries should be exposed to a user-facing UI or public API until the destructive audit has passed and the release owner approves the policy.

## Execution Surface Options

| Option | Fit for v1 | Pros | Risks / why defer |
| --- | --- | --- | --- |
| Internal CLI runner | Recommended minimal surface | Server-only, no public route, can require explicit flags, easy to keep raw output out of UI, fits one-stage-at-a-time execution. | Requires operator discipline and local/CI access controls. Approval log is proof-doc based unless a future DB audit table is added. |
| Internal-only admin route | Defer | Could be convenient later for support operations. | Requires admin auth, operator permission model, route hardening, CSRF/rate policy, and audit surface. This is a security design change. |
| Server action | Defer | Works inside app runtime. | Tied to UI/session and too easy to drift toward a user-facing destructive button. Not ideal for irreversible support operations. |
| Manual service invocation | Current fallback only | No new surface; can be used by a developer in a controlled emergency. | Too ad hoc for Store proof. Harder to record consistent approval, command, and result evidence. |

## Adopted Minimal Policy

For the next implementation step, use a guarded internal CLI runner, not a public API or Settings button.

The CLI should:

- Default to dry-run mode.
- Run exactly one stage per invocation.
- Resolve the deletion request server-side before calling a stage service.
- Accept a request reference for operator targeting, but never print raw request id, user id, email, provider voice id, storage path, object key, signed URL, token, or raw provider response.
- Re-fetch the active request and owned resources server-side.
- Require `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE=1` plus explicit `--execute` and an irreversible acknowledgement before calling any actual stage.
- Refuse to proceed if latest dry-run is blocked or prior stage cleanup is not `succeeded` / `not_needed`.
- Stop after each stage and require proof review before the next stage.

Suggested future command shape:

```bash
npm run account-deletion:operator -- --stage provider --request <request-ref> --dry-run
npm run account-deletion:operator -- --stage provider --request <request-ref> --execute --proof <proof-doc> --latest-dry-run-runnable --acknowledge-irreversible I_UNDERSTAND_ACCOUNT_DELETION_IS_IRREVERSIBLE
```

The command name and argument names can change during implementation, but the behavior above should not.

## Required Operator Conditions

Before any `--execute` run:

- Deletion request is `confirmed` or in the matching retryable failed status for the selected stage.
- Target account is classified as disposable for proof, or a real support request has release-owner approval.
- Human approval is recorded in the proof template.
- Irreversible action acknowledgement is recorded.
- `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE=1` is intentionally enabled only for the approved run.
- Latest stage dry-run is PASS/WARN and not BLOCKED.
- Prior stages are `succeeded` or `not_needed`.
- Proof template is prepared before execution.
- Human Check Backlog items that affect deletion/support/legal policy are resolved or explicitly accepted by the release owner.

If any condition is missing, the operator surface must return `BLOCKED` and must not call the destructive service.

## Roles

| Role | Responsibility |
| --- | --- |
| Operator | Runs preflight, dry-run, and approved one-stage CLI commands. Records safe command/result summaries. Stops on any BLOCKED/FAIL. |
| Reviewer | Checks the proof for stage order, safe output, forbidden raw values, and consistency with dry-run counts. |
| Approver / release owner | Approves destructive guard enablement, irreversible acknowledgement, retry after failure, and GO / GO WITH WARNINGS / BLOCKED decisions. |
| Support owner | Communicates with the requester when the flow is a real support case and handles `manual_required` follow-up. |

One person may cover multiple roles in a small beta only if the proof records that explicitly. Store submission proof should use at least operator + reviewer separation.

## Approval Log / Proof Log

Because RR-3g does not add a DB audit table, the initial approval log is a raw-data-free proof document using RR-3f's template.

Record:

- `checked_at`
- operator / reviewer / approver role
- commit short ref
- environment label
- launch mode
- stage
- dry-run result
- decision
- safe counts
- safe reason code
- next action

Do not record:

- raw user id
- private email address
- provider voice id
- storage path or object key
- signed URL
- audio id / take id
- DB row id
- script body
- transcript
- coach feedback text
- raw provider response
- raw audio
- session, token, auth payload, or service role key
- API key, billing amount, account id, subscription id, project id, or resource id

If a durable in-app operator audit log becomes required, that is a new DB schema / auth design decision and should stop before implementation.

## Stage Execution Order

The operator surface must not offer a "run all" destructive path until the disposable-account proof has passed.

Required order:

1. Provider cleanup.
   - May run only from `confirmed` or `provider_cleanup_failed`.
   - Stops at `provider_cleanup_failed` / `manual_required` on provider ambiguity.
2. Storage cleanup.
   - May run only after provider cleanup is `succeeded` or `not_needed`.
   - Stops at `storage_cleanup_failed` / `manual_required` on bucket, ownership, or candidate mismatch.
3. DB cleanup / anonymize.
   - May run only after Storage cleanup is `succeeded` or `not_needed`.
   - Stops at `db_cleanup_failed` / `manual_required` on constraint, permission, or candidate mismatch.
4. Supabase Auth deletion.
   - May run only after DB cleanup is `succeeded` or `not_needed`.
   - Auth deletion is irreversible and must be the final destructive stage.
5. Completion tracking.
   - Uses existing `account_deletion_requests` tracking.
   - Completion notification remains manual / policy-bound until a future approved implementation.

## Retry / Partial Failure / Manual Required

Rules:

- Retry starts from the failed stage only.
- Already-succeeded prior stages are treated as satisfied and should not be re-run unless a reviewer approves that the stage is idempotent and safe.
- Later stages must remain blocked until the failed stage is `succeeded` or `not_needed`.
- `manual_required` means the system cannot prove safe ownership or provider/storage/DB/Auth state automatically.
- A retry after `manual_required` requires reviewer + approver sign-off.
- Do not create a second deletion request to bypass a stuck request without release-owner approval.
- Do not recreate user data to repair a failed proof.

Stage-specific retry notes:

| Failed stage | Retry prerequisite |
| --- | --- |
| Provider | ElevenLabs dashboard/API state, credentials, rate limit, or missing provider reference is resolved. |
| Storage | Bucket access, list/remove permission, candidate mismatch, or ownership ambiguity is resolved. |
| DB | Constraint, service role, candidate classification, or retention/anonymize ambiguity is resolved. |
| Auth | Service role/Auth state is resolved and DB cleanup remains satisfied. |
| Completion | Support/manual follow-up records safe completion state; do not recreate deleted user data. |

## Future CLI Specification

Next minimal implementation should add a CLI runner only after RR-3g:

- Script name: `scripts/account-deletion-operator-runner.mjs` or equivalent.
- Package script: `account-deletion:operator`.
- Default mode: dry-run only.
- Required flags:
  - `--stage provider|storage|database|auth`
  - `--request <request-ref>`
  - `--dry-run` or `--execute`
  - `--acknowledge-irreversible` only for execute mode
- Optional flags:
  - `--proof <path>` to record that an operator prepared a proof document.
  - `--env-label <label>` for safe proof context.

Execution behavior:

- Resolve the request server-side.
- Derive the target user from the active request server-side.
- Call dry-run first and print safe JSON/text summary.
- For `--execute`, verify destructive guard env, request/stage guard, latest dry-run, and prior-stage satisfaction.
- Call exactly one stage service.
- Print only safe status, counts, reason code, and next-stage guidance.

Stop before implementation if the runner requires:

- a DB audit table,
- admin auth / permission design,
- public route exposure,
- production secret values,
- or any raw value in command output.

## Current RR-3g Status

RR-3g is docs/design only.

No public UI, public API, admin UI, CLI actual runner, DB migration, RLS policy, or destructive execution was added. Real ElevenLabs delete, Supabase Storage delete, DB cleanup / anonymize, and Supabase Auth deletion were not executed.

## RR-3h Follow-Up

RR-3h adds the internal CLI skeleton described here:

- `npm run account-deletion:operator`
- `npm run account-deletion:operator:self-test`

The skeleton keeps dry-run default, one-stage-per-invocation, and safe output. It models proof path, latest dry-run runnable, prior-stage satisfaction, destructive env, and irreversible acknowledgement guards. It is not connected to actual provider / Storage / DB / Auth deletion services yet, so even simulated execute mode remains blocked with `actual_service_not_connected_in_skeleton`.

## RR-3i Follow-Up

RR-3i adds the fake-first stage service seam:

- `runAccountDeletionOperator` can receive injected stage services for `provider / storage / database / auth`.
- Guard failures return `blocked` before the injected service is called.
- Fake service results are normalized to safe status / counts / reason code only.
- The default CLI invocation still passes no real stage services and cannot reach real destructive cleanup.
