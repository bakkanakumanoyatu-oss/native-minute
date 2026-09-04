# G5D five-stage connected non-live proof result

## Status

`G5D_FIVE_STAGE_CONNECTED_NON_LIVE_PROOF_FINAL_AUTHORITY_CLOSEOUT_COMMIT_AND_PUSH_CLOSED_CANDIDATE`

Accepted reconciliation authority: `G5D_POST_COMPLETION_CONNECTED_NON_LIVE_PROOF_RECONCILIATION = PASS = NO_ADDITIONAL_MIGRATION_REQUIRED`.

Accepted review authority: `G5D_FIVE_STAGE_CONNECTED_NON_LIVE_PROOF_INDEPENDENT_READ_ONLY_FOCUSED_REVIEW = NOT PASS`, focused `P0/P1/P2/UNKNOWN = 0/1/0/0`. The accepted P1 was limited to partial-resource cleanup when isolated-stack bootstrap failed before `startIsolatedStack()` returned its stack object.

Accepted correction authority: `G5D_FIVE_STAGE_CONNECTED_NON_LIVE_PROOF_PARTIAL_STACK_FAILURE_CLEANUP_P1_MINIMUM_CORRECTION`; the actual A–E partial-stack failure probes passed.

Accepted independent focused re-review authority: `G5D_FIVE_STAGE_CONNECTED_NON_LIVE_PROOF_PARTIAL_STACK_CLEANUP_INDEPENDENT_READ_ONLY_FOCUSED_RE_REVIEW = PASS`, focused `P0/P1/P2/UNKNOWN = 0/0/0/0`. The original partial-stack cleanup P1 is `CLOSED` and the program aggregate is `0/0/1/0`.

The five-stage connected non-live proof is a `CLOSED candidate` under this final authority. G5D-2 and Gate 5 remain `OPEN`. G5D-4 remains `NOT AUTHORIZED / NOT STARTED`; no live destructive proof was run and no Human authorization is requested by this closeout.

## Partial-stack cleanup correction

Immediately after the OS-temp workdir is created, the harness now creates one bootstrap context containing the workdir and deterministic Docker network, database-container, and PostgREST-container identifiers. This happens before any Docker mutation. The calling `finally` owns cleanup and retains the context even if bootstrap, readiness, migration application, or PostgREST startup throws. `startIsolatedStack()` does not also own deletion, so repeated cleanup remains best-effort and idempotent rather than treating already-absent resources as an error.

Cleanup no longer equates calling Docker removal commands with success. It removes both possible containers, the network, and the OS-temp workdir, then performs successful Docker container/network inventory reads plus a filesystem existence check. `isolatedStackDestroyed=true` is available only when both matching-container counts, the matching-network count, and the temp-workdir count are all actually zero. An unavailable verification or a residual resource returns false and fails the proof with the fixed safe reason `cleanup_incomplete`.

Failure injection is confined to this proof harness and does not modify production source. It exposes only fixed bootstrap checkpoints and never writes resource identifiers, temp paths, Docker/CLI output, stack traces, credentials, or environment values to safe output.

## Focused partial-stack failure results

The final focused run used actual disposable Docker resources and passed:

- A, after workdir creation and before network creation: container/network/temp `0/0/0` after cleanup.
- B, after network creation: container/network/temp `0/0/0` after cleanup.
- C, after database-container creation: container/network/temp `0/0/0` after cleanup.
- D, after PostgREST-container creation and before its readiness check: container/network/temp `0/0/0` after cleanup.
- E, after proof bootstrap and the first migration application: container/network/temp `0/0/0` after cleanup.
- Every A–E cleanup was called a second time and remained verified/idempotent with final resources `0`.
- Simulated cleanup-verification failure produced `isolatedStackDestroyed=false`; a following real verification succeeded only after actual absence was confirmed.
- Final all-prefix inventory: containers `0`, networks `0`, OS-temp workdirs `0`, backups created `0`.
- Process destructive guard: unset before, unset after, enable count `0`.
- Safe-output resource/temp/raw-error sentinel matches: `0`.

## Execution substrate

The proof used a disposable OS-temp workdir, an isolated local Supabase PostgreSQL container, loopback PostgREST, repository migrations `0001` through `0027`, the real canonical operator runner and five canonical bridge/service/repository paths, the real `0025` Database finalizer RPC, and the real `0027` Completion RPC. Provider, Storage, and Auth external behavior was supplied only by proof-local fake adapters. Every production external-adapter/repository fallback factory was poisoned and remained uncalled.

The process-level destructive guard was unset before and after execution. A proof-local injected acknowledgement/guard environment was used only at the runner/service dependency boundary and is not G5D-4 Human authorization.

## Connected results

- Clean scenario H: Provider `5`, Storage `5`, Database `2`, Auth `2`, Completion `2` separate execute invocations; each stage reached persisted terminal authority before the next stage was invoked.
- Response-loss scenario R: Provider, Storage, Database, Auth, and Completion each received one response-loss injection; all `5/5` recovered on a later invocation and handed off to the next stage. Provider/Storage/Auth DELETE redispatches during recovery were `0`.
- Manual scenario M: one Provider `permission_denied` fake result persisted `manual_required`; no later-stage invocation followed for that fixture.
- Prior-stage negative matrix: Storage-before-Provider, Database-before-Storage, Auth-before-Database, and Completion-before-Auth were blocked `4/4` despite the caller prior-stage flag. Stage external/RPC actions were `0`.
- Already-terminal replay: one replay per stage. Provider external calls, Storage inventory/delete/info calls, and Auth GET/DELETE calls were `0`; Database D/A/R/timestamp and Completion `completed_at`/`expires_at` fingerprints were unchanged.
- Isolation: clean/recovery fixtures used distinct user/request authorities; every A-stage operation preserved B's aggregate fingerprint and vice versa. The wrong request/user pair failed closed with mutation/external action `0`. Two requests sharing one opaque reference were rejected as ambiguous before service/RPC mutation.
- Auth owner-null continuation: Auth terminal replay and Completion both resolved by exact request UUID after `user_id IS NULL`; deleted user identity was not requested again.

Canonical connected sequence `Provider -> Storage -> Database -> Auth -> Completion`, persisted handoff, representative manual stop, User A/B isolation, and opaque ambiguity isolation all passed. Prior-stage enforcement passed `4/4`, response-loss recovery passed `5/5`, and already-terminal replay passed `5/5`.

## Safe aggregate evidence

```text
stageInvocations:
  provider/storage/database/auth/completion = 14/10/5/5/5
  invalidMultiStage = 1
  totalExecuteAttempts = 40
  singleStageExecuteAttempts = 39
  immediatelyPrecedingDryRuns = 39

stageServiceCalls:
  provider/storage/database/auth/completion = 12/9/4/4/5

stageTerminalCounts:
  provider/storage/database/auth/completion = 3/3/3/3/3

fakeDispatchCounts:
  providerDelete/providerGet = 3/2
  storageInventory/storageDelete/storageInfo = 4/2/2
  authGet/authDelete/isolatedAuthUsersDeleted = 4/2/2
  isolatedDatabaseFinalizerRpc/isolatedCompletionRpc = 4/4

responseLossInjected/Recovered = 5/5
priorStageBlocks = 4
manualStops = 1
replayCounts = 1/1/1/1/1
crossRequestBlocks = 1
opaqueAmbiguityBlocks = 1
sameInvocationChaining = 0
redactionSentinelMatches = 0
finalCompletionTerminal = true
isolatedStackDestroyed = true (bound to actual post-cleanup absence verification)
```

Aggregate sealed targets were Provider/Storage `1/1` for clean and recovery, and `1/0` for the representative Provider manual-stop fixture.

## Hard-zero boundaries

Real ElevenLabs GET/DELETE, real Supabase Storage list/info/delete, real Supabase Auth GET/DELETE, Canonical Staging access/mutation, Production access/mutation, notification sender, purge, process destructive-guard enablement, and same-invocation stage chaining were all exactly `0`.

Canonical Staging access/mutation was `0/0`, Production access/mutation was `0/0`, real Provider/Storage/Auth calls were `0`, process destructive-guard enablement was `0`, production source diff was `0`, and migration/schema/generated-type diff was `0`.

No request UUID, user/Auth UUID, opaque reference value, email/phone, Provider locator, Storage bucket/key/path, raw metadata/row/RPC result, raw SQL/PostgREST/CLI error, credential, fixture identifier, or stack trace was written to the safe result. Sentinel matches were `0`.

## Migration and source boundaries

- Commit checkpoint: `a1378f1572c6bc9e97b323412da0962db6e64952`.
- Migration `0027` SHA-256: `ff05fd6ffcca8e1a78c62418360e74f2d025f2779dcd6ea9f147919359728beb`.
- Disposable migration-chain apply: `0001`–`0027` exact, PASS.
- Migration `0028`: `0`.
- Migration `0027`, schema, generated DB type, production service/repository/runner/entry, and README changes: `0`.
- Canonical Staging remains the accepted `0001`–`0027` exact / pending `0` authority; it was not accessed for this proof.

## Regression and validation

- `npm run check:workspace`: PASS.
- focused partial-stack cleanup failure probes: PASS, A–E and verification-failure binding.
- connected non-live proof: PASS.
- Provider/Storage/Database/Auth/Completion canonical bridge regressions: PASS.
- operator core: PASS.
- Provider durable: PASS, `24/24`.
- Storage durable/writer: PASS, `18/18`.
- Database finalizer: PASS, `11/11`.
- Auth durable: PASS, `35/35`.
- Completion focused foundation contract: PASS, `10/10`.
- `npm run lint`: PASS, zero warnings/errors.
- `npm run typecheck`: PASS.
- `git diff --check`: PASS.

`npm run build` was not rerun for this correction because its only implementation change is the proof-local script; product/runtime source was unchanged.

The disposable PostgreSQL/PostgREST containers and Docker network were removed without backup, the OS-temp workdir was deleted, and the process destructive guard remained unset. `supabase/.temp/` was not used, edited, or deleted.

## Findings and next action

Accepted independent focused re-review assessment `P0/P1/P2/correctness UNKNOWN = 0/0/0/0`. The original partial-stack cleanup P1 is `CLOSED`.

Program aggregate remains `P0/P1/P2/UNKNOWN = 0/0/1/0`. The sole known P2 `auth_terminal_authority_missing` remains nonblocking deferred cleanup and was not changed.

Connected non-live proof: `CLOSED candidate`. G5D-2: `OPEN`. Gate 5: `OPEN`. G5D-4 live disposable proof: `NOT AUTHORIZED / NOT STARTED`.

Exact next one action:

`G5D_POST_CONNECTED_NON_LIVE_PROOF_G5D4_HUMAN_GATE_RECONCILIATION`
