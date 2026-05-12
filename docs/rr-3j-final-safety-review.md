# RR-3j Final Safety Review / Real Service Connection Readiness Audit

RR-3j is the final non-destructive safety review before any real service connection or disposable-account destructive proof.

This review does **not** enable `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE=1`, does not connect the operator CLI to real destructive services, and does not execute ElevenLabs delete, Supabase Storage delete, DB cleanup/anonymize, or Supabase Auth deletion.

## Scope

Reviewed artifacts:

- RR-3b provider cleanup actual boundary.
- RR-3c Storage cleanup actual boundary.
- RR-3d DB cleanup / anonymize actual boundary.
- RR-3e Supabase Auth deletion actual boundary.
- RR-3f destructive audit runbook / proof template.
- RR-3g operator/admin execution surface design.
- RR-3h internal CLI runner skeleton.
- RR-3i fake-first stage service seam.

Out of scope:

- Real destructive deletion.
- Destructive guard enablement.
- Disposable-account proof execution.
- Public deletion UI/API.
- Admin UI.
- DB schema / migration changes.
- RLS policy changes.
- Dashboard, billing, legal, support contact, or SLA human checks.

## Final Review Conclusion

RR-3b through RR-3i are internally consistent enough to proceed to a future **explicitly approved** real service connection design step.

They are **not** ready for disposable-account destructive proof yet because the CLI is still intentionally disconnected from real services and does not yet have a safe request resolver that maps an operator request reference to the server-side `userId` and `deletionRequestId` required by the actual stage services.

## Stage Order

The required order is consistent across docs, service boundaries, dry-runs, and CLI modeling:

1. Provider cleanup.
2. Storage cleanup.
3. DB cleanup / anonymize.
4. Supabase Auth deletion.
5. Completion tracking.

Auth deletion remains last. No later stage should run unless the prior stage is `succeeded` or `not_needed`.

## Guard Alignment

| Stage | Actual service boundary | Runnable request status | Prior stage guard | Destructive guard | Dry-run guard |
| --- | --- | --- | --- | --- | --- |
| Provider | `runElevenLabsProviderCleanupActual` | `confirmed` / `provider_cleanup_failed` | first stage | required | provider dry-run runnable or not_needed |
| Storage | `runStorageCleanupActual` | `confirmed` / `storage_cleanup_failed` | provider `succeeded` / `not_needed` | required | storage dry-run runnable or not_needed |
| DB | `runDatabaseCleanupActual` | `confirmed` / `db_cleanup_failed` | provider + Storage `succeeded` / `not_needed` | required | DB dry-run classification aligned |
| Auth | `runSupabaseAuthDeletionActual` | `confirmed` / `auth_cleanup_failed` | provider + Storage + DB `succeeded` / `not_needed` | required | Auth dry-run ready and service role available |

The operator CLI currently models the same order with:

- one stage per invocation,
- `--execute` required for destructive stages,
- request reference required,
- explicit irreversible acknowledgement required,
- proof path required,
- latest dry-run runnable confirmation required,
- prior-stage satisfaction required for `storage`, `database`, and `auth`,
- fake stage service called only after modeled guards pass.

Normal CLI execution still has no connected real stage services.

## Failure / Retry / Manual Required Alignment

| Stage | Failure request status | Cleanup status | Retry source | Stop condition |
| --- | --- | --- | --- | --- |
| Provider | `provider_cleanup_failed` | `failed` / `manual_required` | provider stage only | ElevenLabs delete failure, missing/invalid provider reference, candidate mismatch, provider/cost guard block |
| Storage | `storage_cleanup_failed` | `failed` / `manual_required` | storage stage only | bucket unavailable, permission/list/delete failure, candidate mismatch, ambiguous ownership |
| DB | `db_cleanup_failed` | `failed` / `manual_required` | DB stage only | classification mismatch, DB delete/update/anonymize failure, constraint/ownership ambiguity |
| Auth | `auth_cleanup_failed` | `failed` / `manual_required` | Auth stage only | service role/Auth state issue, Auth delete failure, completion write failure after Auth delete |

Common policy:

- Stop at the failed stage.
- Do not continue to later stages.
- Retry starts from the failed stage after operator/reviewer approval.
- `manual_required` means the system cannot safely prove provider, Storage, DB, or Auth state automatically.
- Do not create a new deletion request to bypass a stuck request without release-owner approval.
- Do not recreate user data to repair proof or completion tracking.

## Proof / Raw Data Policy Alignment

The proof template and CLI safe output fields are aligned.

Allowed proof fields:

- stage,
- status,
- safe counts,
- safe reason code,
- checked_at,
- operator / reviewer / approver role,
- commit short ref,
- environment label,
- launch mode,
- decision,
- next action,
- PASS / WARN / BLOCKED / FAIL.

Forbidden proof / CLI output values:

- raw user id,
- private email address,
- provider voice id,
- storage path or object key,
- signed URL,
- audio id / take id,
- DB row id,
- script body,
- transcript,
- coach feedback text,
- raw provider response,
- raw audio,
- session, token, auth payload, or service role key,
- API key, billing amount, account id, subscription id, project id, or resource id.

RR-3i's service-result sanitizer rejects raw-looking reason codes and drops arbitrary service fields from output.

## Remaining Gap Before Real Service Connection

Do not connect the CLI to real stage services until all gaps below are closed:

1. Add a server-side request resolver.
   - Input may be an operator request reference.
   - Output to services must be internal-only `userId` + `deletionRequestId`.
   - Output to CLI/proof must never echo raw ids or email.
2. Decide how the Node CLI imports and calls the TypeScript service boundaries.
   - Avoid ad hoc runtime transpilation in production operations unless explicitly approved.
   - A dedicated internal runner wrapper may be needed.
3. Map CLI stage names to actual service boundaries.
   - `provider` -> `runElevenLabsProviderCleanupActual`
   - `storage` -> `runStorageCleanupActual`
   - `database` -> `runDatabaseCleanupActual`
   - `auth` -> `runSupabaseAuthDeletionActual`
4. Keep one-stage execution.
   - No "run all" destructive command before disposable proof passes.
5. Preserve guard-before-service-call behavior.
   - Destructive guard missing must stop before service calls.
   - Prior stage missing must stop before service calls.
6. Preserve safe output.
   - Real service results must pass through the same safe summary / sanitizer shape.
7. Add self-tests for the real service wrapper using fake service functions.
   - Real provider / Storage / DB / Auth clients must not be called in tests.
8. Confirm destructive status updates are understood.
   - With the destructive guard enabled, some blocked dry-run states can update the request to `manual_required` without deleting data.
   - The operator runbook must treat this as a destructive-support operation even when no provider/Storage/DB/Auth delete occurs.

## Disposable Proof Preconditions

Before running a disposable-account destructive proof:

- Human Check Backlog items relevant to account deletion/support/legal policy are resolved or explicitly accepted by the release owner.
- Support contact and account deletion SLA are decided.
- Legal/support draft review is complete or accepted for the target launch mode.
- Disposable account is confirmed and contains test data for every stage.
- Operator, reviewer, and approver are recorded.
- Irreversible acknowledgement is recorded.
- Proof template is prepared before enabling the destructive guard.
- Latest provider / Storage / DB / Auth dry-runs are runnable or not_needed.
- `production:preflight` and `supabase:storage-rls:check` pass for the target environment.
- Kill switch state is recorded as safe summary only.
- No raw ids, secrets, provider details, storage paths, signed URLs, script text, transcript, raw audio, or raw provider responses are copied into proof.

## Non-Destructive Verification Commands

Run these before any future real service connection or disposable proof:

```bash
npm run lint
npm run build
npm run typecheck
npm run account-deletion:provider-cleanup:self-test
npm run account-deletion:storage-cleanup:self-test
npm run account-deletion:database-cleanup:self-test
npm run account-deletion:auth-cleanup:self-test
npm run account-deletion:operator:self-test
npm run production:preflight
npm run supabase:storage-rls:check
```

These checks are non-destructive and must not require real provider delete, real Storage delete, real DB cleanup, or real Auth deletion.

## RR-3j Status

RR-3j is documentation / safety review only.

No real service connection was enabled, no destructive guard was enabled, no disposable account was deleted, and no provider / Storage / DB / Auth destructive cleanup was executed.

## RR-3k Follow-Up

RR-3k adds a fake-first safe request resolver seam:

- `runAccountDeletionOperator` can receive an injected request resolver before the stage service seam.
- Guard failures stop before the resolver and before stage services.
- The resolver can carry internal-only `userId + deletionRequestId` to fake services in-process, while CLI/proof output receives only safe markers.
- Normal CLI execution still has no real DB lookup and no real stage services connected.

## RR-3l Follow-Up

RR-3l closes part of the RR-3j remaining gap for non-destructive proof:

- `status` / `summary` can use a server-side read-only resolver.
- The resolver reads `account_deletion_requests` lifecycle and cleanup-stage status only.
- Raw user id, email, deletion request id, and operator request ref are not printed.
- Destructive stage services remain disconnected; disposable proof is still not complete.

## RR-3m Follow-Up

RR-3m prepares disposable proof request selection:

- candidate selection criteria and exclusion criteria are documented,
- operator `status` / `summary` can model proof candidacy with safe confirmations,
- real-user-like, missing approver, stale stage status, and dry-run mismatch candidates are blocked in self-test,
- destructive proof remains unrun.
