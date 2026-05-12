# RR-3h Internal CLI Runner Skeleton

RR-3h adds the internal account deletion operator CLI skeleton.

This skeleton is intentionally non-destructive. It does not call ElevenLabs delete, Supabase Storage remove, DB delete/anonymize, or Supabase Auth delete. It does not add a public UI, public API, admin UI, DB migration, or RLS policy.

## Added Commands

```bash
npm run account-deletion:operator
npm run account-deletion:operator:self-test
```

The operator command maps to:

```bash
node scripts/account-deletion-operator-runner.mjs
```

## Current Behavior

The runner:

- defaults to dry-run mode,
- accepts exactly one stage per invocation,
- accepts `provider`, `storage`, `database`, `auth`, `status`, or `summary`,
- accepts a request reference for operator targeting but never echoes it,
- prints a safe JSON summary,
- records whether proof path and environment label were provided without printing their values,
- blocks `--execute` unless destructive guard and irreversible acknowledgement are present,
- blocks `--execute` unless a proof path is provided and the operator confirms the latest dry-run is runnable,
- blocks `storage`, `database`, and `auth` execute attempts unless the prior stage is marked satisfied,
- still blocks execution with `actual_service_not_connected_in_skeleton` even when guard inputs are simulated,
- never calls actual stage services in RR-3h.

## Example

```bash
npm run account-deletion:operator -- --stage provider --request <request-ref> --dry-run
```

Safe output fields:

- `stage`
- `mode`
- `status`
- `safeCounts`
- `safeReasonCode`
- `nextAction`
- `proof.envLabel`
- `proof.proofPath`
- `proof.requestRef`
- `guard`
- `notes`

When using `npm run`, the package manager may echo the command line in the terminal. Do not paste command lines containing a real request reference into proof docs. Record only the safe JSON summary fields.

Forbidden output values:

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

## Execute Mode

`--execute` is not connected to destructive services in RR-3h.

The skeleton still models the future guard requirements:

- `--execute`,
- `--stage provider|storage|database|auth`,
- `--request <request-ref>`,
- `--proof <proof-doc>`,
- `--latest-dry-run-runnable`,
- `--prior-stage-satisfied` for `storage`, `database`, and `auth`,
- `--acknowledge-irreversible I_UNDERSTAND_ACCOUNT_DELETION_IS_IRREVERSIBLE`,
- `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE=1`,
- one stage per invocation.

Even when those guard inputs are simulated in self-test, RR-3h returns `blocked` with `actual_service_not_connected_in_skeleton` and `destructiveOperationsAttempted=0`.

## Self-Test

Run:

```bash
npm run account-deletion:operator:self-test
```

The self-test verifies:

- dry-run default,
- missing stage blocked,
- multiple stages blocked,
- `--execute` without destructive env blocked,
- missing irreversible acknowledgement blocked,
- missing proof path / latest dry-run runnable confirmation blocked,
- missing prior-stage satisfaction blocked for later stages,
- safe output only,
- skeleton execution remains blocked even when guard inputs are simulated,
- no actual provider / Storage / DB / Auth deletion service is connected.

## Relationship To RR-3f / RR-3g

- RR-3f defines the disposable-account destructive audit runbook and proof template.
- RR-3g chooses an internal one-stage CLI as the future minimal operator surface.
- RR-3h adds the CLI skeleton and self-test, but keeps actual stage services disconnected.
- RR-3i adds the fake-first stage service seam and safe result sanitizer while keeping the default CLI disconnected from real destructive services.

## Remaining Before Store Submission

- Connect the CLI to the actual stage services in a later RR only after approval.
- Keep one-stage execution and proof review between stages.
- Run a disposable-account destructive proof with explicit human approval.
- Finalize support contact, account deletion SLA, and legal/support drafts.
