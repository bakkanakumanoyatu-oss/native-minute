# RR-3k Safe Request Resolver / Real Service Wrapper Fake-First Implementation

RR-3k adds the fake-first safe request resolver seam needed before a future real service connection.

This remains non-destructive. It does **not** enable `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE=1`, does not perform a real DB lookup in normal/self-test execution, and does not call ElevenLabs delete, Supabase Storage delete, DB cleanup/anonymize, or Supabase Auth deletion.

## Scope

RR-3k covers:

- safe request resolver responsibility,
- fake resolver seam in the operator runner,
- safe request marker output,
- fake real-service wrapper shape,
- service result sanitization after resolver,
- self-test coverage for resolver/service blocking.

RR-3k does not cover:

- real DB request lookup,
- real stage service connection,
- disposable-account destructive proof,
- public UI/API,
- admin UI,
- DB schema / migration changes,
- RLS policy changes.

## Safe Request Resolver Responsibility

A future resolver will accept the operator-provided request reference and resolve it server-side.

Responsibilities:

- accept an operator request reference,
- re-fetch the account deletion request server-side,
- verify the target request and target user relationship,
- produce internal-only `userId` and `deletionRequestId` for the stage service wrapper,
- return only safe markers to CLI output / proof,
- never print or store raw user id, email, request id, provider id, storage path, DB row id, token, service role key, or raw provider response in proof output.

RR-3k adds the seam but uses fake resolver injection only.

## Runner Behavior

`runAccountDeletionOperator` now accepts:

```js
await runAccountDeletionOperator(argv, {
  env,
  requestResolver: async (input) => resolverResult,
  stageServices: {
    provider: async (input) => safeResult,
    storage: async (input) => safeResult,
    database: async (input) => safeResult,
    auth: async (input) => safeResult
  }
});
```

Default CLI execution still passes no `requestResolver` and no real `stageServices`, so it cannot reach destructive cleanup.

## Guard Before Resolver / Service Call

The resolver is called only after the modeled execution guards pass:

- exactly one destructive stage,
- `--execute`,
- request reference provided,
- `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE=1`,
- explicit irreversible acknowledgement phrase,
- proof path provided,
- latest dry-run marked runnable,
- prior stage marked satisfied for `storage`, `database`, and `auth`,
- stage service seam connected,
- request resolver seam connected.

If any guard is missing, the runner returns `blocked` before the resolver and before the stage service.

## Safe Request Marker

Resolver output is normalized to safe markers:

- `requestRef: provided_not_echoed`,
- `userRef: resolved_not_echoed` or `not_resolved`,
- `deletionRequestRef: resolved_not_echoed` or `not_resolved`.

The internal target can be passed to an injected fake stage service in-process, but it is not included in CLI/proof output.

## Real Service Wrapper Shape

A later approved wrapper should map stages to actual service boundaries:

| CLI stage | Future actual service |
| --- | --- |
| `provider` | `runElevenLabsProviderCleanupActual` |
| `storage` | `runStorageCleanupActual` |
| `database` | `runDatabaseCleanupActual` |
| `auth` | `runSupabaseAuthDeletionActual` |

The wrapper must:

- receive internal-only `userId + deletionRequestId` from the resolver,
- call exactly one stage service,
- pass stage service result through safe summary sanitization,
- stop after each stage for proof review,
- never expose raw ids or provider/storage/db/auth payloads.

## Safe Result Sanitization

Stage service output is normalized to:

- `status`,
- `safeReasonCode`,
- `safeCounts`,
- `nextAction`.

Allowed count fields:

- `requestResolverCalls`,
- `stageServiceCalls`,
- `destructiveOperationsAttempted`,
- `providerCandidates`,
- `storageObjects`,
- `databaseTables`,
- `authUsers`.

Arbitrary raw fields are dropped. Raw-looking reason codes are normalized to `stage_service_result`.

## Self-Test Coverage

`npm run account-deletion:operator:self-test` verifies:

- request ref missing blocks before fake resolver,
- missing destructive guard blocks before fake resolver and fake service,
- missing prior stage satisfaction blocks before fake resolver and fake service,
- fake resolver is called only after modeled guards pass,
- fake service is called only after fake resolver resolves,
- raw user id / email / request id do not appear in safe output,
- fake service result raw fields are dropped,
- default CLI has no connected real resolver or real stage services.

The self-test injects fake resolver and fake service functions in-process. It does not enable the process-level destructive guard and does not call real provider / Storage / DB / Auth cleanup.

## Remaining Before Real Service Connection

Stop before real service connection until these are approved:

- real server-side request resolver implementation,
- safe TypeScript service wrapper for the Node operator path,
- wrapper self-test with fake actual services,
- release-owner approval for how request references are generated and shared with operators,
- explicit decision on whether blocked dry-run states may update request status when destructive guard is enabled,
- disposable-account proof plan.

## RR-3k Status

RR-3k is fake-first implementation only.

No real DB request lookup, real service connection, destructive guard enablement, disposable proof, or real provider / Storage / DB / Auth destructive cleanup was executed.

## RR-3l Follow-Up

RR-3l connects a read-only version of this resolver seam for `status` and `summary` only.

- The default CLI can resolve a request UUID or `anonymized_user_ref` server-side for status proof.
- Output is limited to request lifecycle status, cleanup-stage statuses, retry count, and safe request markers.
- Raw user id, email, deletion request id, and request ref remain hidden.
- Provider / Storage / DB / Auth destructive stages still do not use real services.
