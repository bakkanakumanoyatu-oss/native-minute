# RR-3i Operator CLI Stage Service Connection

RR-3i connects the internal account deletion operator CLI skeleton to a fake-first stage service seam.

This is still non-destructive. It does not call ElevenLabs delete, Supabase Storage remove, DB delete/anonymize, or Supabase Auth delete. It does not add a public UI, public API, admin UI, DB migration, or RLS policy.

## Scope

RR-3i covers:

- the operator CLI execution seam,
- safe service-result normalization,
- fake stage service self-test coverage,
- guard-before-service-call behavior.

RR-3i does not cover:

- wiring the CLI to real `runElevenLabsProviderCleanupActual`,
- wiring the CLI to real `runStorageCleanupActual`,
- wiring the CLI to real `runDatabaseCleanupActual`,
- wiring the CLI to real `runSupabaseAuthDeletionActual`,
- enabling `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE=1`,
- disposable-account destructive proof.

## Current Commands

```bash
npm run account-deletion:operator
npm run account-deletion:operator:self-test
```

The default CLI invocation has no connected stage services. It can print dry-run / blocked safe summaries only.

## Stage Service Seam

`scripts/account-deletion-operator-runner.mjs` now exports `runAccountDeletionOperator`.

The runner accepts an injected `stageServices` object for internal tests or a future approved operator wrapper:

```js
await runAccountDeletionOperator(argv, {
  env,
  stageServices: {
    provider: async (safeInput) => safeResult,
    storage: async (safeInput) => safeResult,
    database: async (safeInput) => safeResult,
    auth: async (safeInput) => safeResult
  }
});
```

The default CLI path passes an empty `stageServices` object, so it cannot reach any actual destructive service.

## Guard Before Service Call

A stage service can be called only when the safe summary reaches `ready_for_execution`.

Required modeled guards:

- exactly one destructive stage,
- `--execute`,
- request reference provided,
- `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE=1`,
- explicit irreversible acknowledgement phrase,
- proof path provided,
- latest dry-run marked runnable,
- prior stage marked satisfied for `storage`, `database`, and `auth`.

If any guard is missing, the runner returns `blocked` and does not call the injected service.

In normal CLI use, no service is connected. Even with all flags present, the default CLI path remains blocked with `actual_service_not_connected_in_skeleton`.

## Safe Service Result

Injected stage services may return only safe summary values. The runner normalizes results to:

- `status`,
- `safeReasonCode`,
- `safeCounts`,
- `nextAction`.

Allowed count fields:

- `stageServiceCalls`,
- `destructiveOperationsAttempted`,
- `providerCandidates`,
- `storageObjects`,
- `databaseTables`,
- `authUsers`.

The sanitizer rejects raw-looking reason values and does not pass through arbitrary fields.

Forbidden output values remain:

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

## Self-Test

`npm run account-deletion:operator:self-test` verifies:

- dry-run default,
- one stage per invocation,
- missing destructive guard blocks before fake service call,
- missing prior stage satisfaction blocks before fake service call,
- fake stage service is called only after all modeled guards pass,
- fake stage input uses safe markers instead of raw request/proof values,
- service result sanitizer drops raw-looking reason values,
- output remains safe,
- default CLI has no connected real stage services.

The self-test injects fake stage services in-process. It does not enable the process-level destructive env guard and does not call real provider / Storage / DB / Auth cleanup.

## Future Real Service Connection

A later RR may connect a dedicated internal operator wrapper to the real service boundaries:

- `runElevenLabsProviderCleanupActual`,
- `runStorageCleanupActual`,
- `runDatabaseCleanupActual`,
- `runSupabaseAuthDeletionActual`.

Before that connection, stop if any of the following are required:

- DB schema / migration changes,
- admin auth or operator permission design,
- raw request/user/provider/storage/auth values in output,
- production secret values,
- real destructive proof execution,
- bypassing Human Check Backlog decisions.

## Remaining Before Store Submission

- Wire real stage services only after an approved operator wrapper plan.
- Run disposable-account destructive proof with explicit human approval.
- Resolve final Human Check Backlog items.
- Finalize support contact, account deletion SLA, and legal/support drafts.

## RR-3j Follow-Up

RR-3j adds the final safety review before real service connection:

- stage order / guard / failure / retry / proof policy are aligned,
- the default CLI remains disconnected from real actual services,
- a future wrapper still needs a safe server-side request resolver from operator request reference to internal-only `userId + deletionRequestId`,
- disposable destructive proof remains unrun.

## RR-3k Follow-Up

RR-3k adds that request resolver seam in fake-first form:

- fake resolver is called only after modeled guards pass,
- raw request ref is passed only to the resolver seam and is not printed,
- fake stage service receives internal target plus safe request markers,
- output keeps only `provided_not_echoed` / `resolved_not_echoed` markers,
- normal CLI remains disconnected from real DB lookup and real destructive services.

## RR-3l Follow-Up

RR-3l connects the resolver seam for non-destructive operator proof only:

- default CLI `status` / `summary` can read `account_deletion_requests` server-side,
- output includes lifecycle and cleanup-stage statuses only,
- destructive stages still do not call real resolver or real services in normal dry-run,
- real cleanup service connection and disposable proof remain blocked until explicit approval.
