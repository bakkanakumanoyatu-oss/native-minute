# RR-3l Read-Only Request Resolver / Operator Status Proof

RR-3l connects the operator runner to a read-only account deletion request resolver for `status` and `summary` checks.

This remains non-destructive. It does not enable `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE=1`, does not connect provider / Storage / DB / Auth cleanup services, and does not execute real destructive deletion.

## Scope

RR-3l covers:

- read-only request resolver for operator `status` / `summary`,
- safe lifecycle output for `account_deletion_requests`,
- request status and cleanup-stage status sanitization,
- self-test coverage for read-only resolver behavior and raw data redaction.

RR-3l does not cover:

- provider cleanup actual execution,
- Storage cleanup actual execution,
- DB cleanup / anonymize actual execution,
- Supabase Auth deletion actual execution,
- disposable-account destructive proof,
- public UI/API,
- admin UI,
- DB schema / migration changes,
- RLS policy changes.

## Resolver Behavior

The default CLI runner now wires a read-only resolver for `status` and `summary` stages only.

Supported operator references:

- account deletion request UUID,
- `anonymized_user_ref` in the existing `adr_<hex>` format.

The resolver uses server-side Supabase service-role access to read a single `account_deletion_requests` row. It selects only lifecycle and cleanup-state columns needed for proof:

- `status`,
- `provider_cleanup_status`,
- `storage_cleanup_status`,
- `db_cleanup_status`,
- `auth_cleanup_status`,
- `notification_status`,
- `retry_count`.

It also reads `id` and `user_id` internally to verify that a request exists and whether the request still maps to an Auth user, but those raw values are never included in CLI output.

## Safe Output

`status` and `summary` output may include:

- `request.requestRef: provided_not_echoed`,
- `request.userRef: resolved_not_echoed` or `not_available_after_auth_cleanup`,
- `request.deletionRequestRef: resolved_not_echoed`,
- `deletionRequest.status`,
- `deletionRequest.stageStatuses.provider`,
- `deletionRequest.stageStatuses.storage`,
- `deletionRequest.stageStatuses.database`,
- `deletionRequest.stageStatuses.auth`,
- `deletionRequest.stageStatuses.notification`,
- safe counts such as `requestResolverCalls` and `retryCount`,
- safe reason code,
- next action.

Output must not include:

- raw user id,
- email,
- raw deletion request id,
- raw request ref,
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

## Destructive Stage Isolation

The read-only resolver is not used for destructive stage dry-runs. `provider`, `storage`, `database`, and `auth` dry-runs remain summary-only unless a future approved runner wires a stage-specific resolver and actual stage service under destructive guard.

For execute mode, the previous RR-3k guard remains:

- missing destructive guard blocks before resolver and service,
- missing request ref blocks before resolver and service,
- missing prior stage satisfaction blocks before resolver and service,
- missing service connection blocks before resolver and service.

## Failure Handling

The resolver returns safe blocked reason codes:

- `request_ref_required`,
- `request_ref_invalid`,
- `read_only_resolver_env_missing`,
- `read_only_resolver_lookup_failed`,
- `request_not_found`,
- `read_only_resolver_stage_not_allowed`.

Raw database errors are not printed to the CLI summary.

## Self-Test Coverage

`npm run account-deletion:operator:self-test` verifies:

- `status` stage can call a fake read-only resolver without a destructive service,
- read-only status output redacts raw request/user identifiers,
- destructive stage dry-run does not call the resolver or service,
- the real read-only resolver refuses destructive stages before DB lookup,
- RR-3k fake resolver / fake service execution tests still pass,
- safe output contains no raw user id, email, request id, provider id, storage path, token, or raw provider response.

## Remaining Before Real Destructive Connection

Before any real destructive stage connection:

- release owner must approve request reference sharing and operator process,
- disposable-account destructive proof must be prepared,
- Human Check Backlog must be resolved or explicitly accepted,
- support contact and account deletion SLA must be finalized,
- real stage services must stay one-stage-per-invocation behind destructive guard,
- proof must use safe lifecycle/status fields only.

## RR-3l Status

RR-3l is read-only implementation only.

No destructive guard was enabled. No real provider / Storage / DB / Auth cleanup service was connected or executed.

## RR-3m Follow-Up

RR-3m extends `status` / `summary` proof preparation with disposable proof candidate assessment:

- candidate PASS requires `confirmed` request status,
- provider / Storage / DB / Auth cleanup statuses must be fresh (`pending` or `not_needed`),
- operator must explicitly confirm disposable account, owner, reviewer, approver, dry-run readiness, and Human Check alignment,
- output remains safe lifecycle/status markers only,
- destructive services remain disconnected.
