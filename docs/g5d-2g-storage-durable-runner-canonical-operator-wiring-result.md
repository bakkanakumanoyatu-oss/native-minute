# G5D-2G Storage Durable Runner Canonical Operator Wiring

Recorded: 2026-09-02

Mode: `G5D_2G_FINAL_AUTHORITY_CLOSEOUT_COMMIT_AND_PUSH_V1`

Status: `CLOSED_COMMITTED_PASS`

Final authority accepts `G5D_2G_STORAGE_DURABLE_RUNNER_CANONICAL_OPERATOR_WIRING_AND_FAKE_PROOF_IMPLEMENTED_PENDING_REVIEW`, `G5D_2G_STORAGE_DURABLE_CANONICAL_WIRING_INDEPENDENT_READ_ONLY_FOCUSED_REVIEW_NOT_PASS`, `G5D_2G_SAFE_INTEGER_COUNTER_SANITIZER_P1_CORRECTED_PENDING_REVIEW`, and the final independent verdict `G5D_2G_SAFE_INTEGER_COUNTER_SANITIZER_INDEPENDENT_FOCUSED_REVIEW_PASS`.

P1-1 Safe Integer Counter Sanitizer is `CLOSED`. P0 / unresolved correctness P1 / P2 / correctness UNKNOWN are `0/0/0/0`, and G5D-2G is closeable. G5D-2 overall and Gate 5 remain `OPEN`: DB/anonymization, Auth, completion, and live Account deletion proof remain unfinished. This closeout only synchronizes authority docs and commits/pushes the intended G5D-2G diff. It does not apply or add a migration, change schema/types, mutate Canonical Staging/Production, enable the destructive guard, call real Storage or Provider services, or connect DB/anonymization, Auth, or completion.

## Canonical stage selection and one-invocation boundary

The canonical stage order is:

`Provider -> Storage -> future DB/anonymization -> future Auth -> future completion`

The canonical entry now exposes only the existing Provider service and the new Storage service. The CLI still enforces exactly one requested stage per invocation.

- A Provider invocation that becomes terminal returns its Provider terminal result and stops. Even with Storage connected in the same entry, it does not call Storage.
- A later Storage invocation performs its own exact persisted-request lookup and Provider-terminal check.
- A Storage invocation that becomes terminal returns its Storage terminal result and stops. DB/anonymization, Auth, and completion services are not present in `stageServices`.
- A future DB request remains safely blocked as an unavailable stage; no DB executor was added.

There is no same-invocation stage chaining. A persisted terminal Provider result authorizes only a later invocation to request Storage, and a terminal Storage invocation still performs DB/Auth/completion calls `0`.

The `--prior-stage-satisfied` outer CLI guard remains an additional operator assertion. It is not stage authority: the Storage resolver independently requires persisted Provider sub-finalization, and the focused proof confirms the flag alone cannot authorize Storage.

## Persisted Provider-terminal prerequisite

The Storage resolver and Storage stage service both fail closed unless the exact owned request row satisfies:

`provider_cleanup_status IN ('succeeded', 'not_needed') AND provider_sub_finalized_at IS NOT NULL`

Pending, progressed/rogue, manual, unknown, failed, null, and inconsistent Provider markers stop before repository advancement, seal, inventory, durable runner, or Storage action. The stage service re-fetches by exact `deletionRequestId + userId` so a stale resolver result or cross-user pair cannot authorize work.

## Storage resolver and bridge

`account-deletion-storage-operator.service.ts` adds a Storage-specific resolver and stage bridge. The resolver performs only:

- exact UUID or opaque request-ref lookup with a two-row ambiguity bound;
- exact pre-Auth owner and request identity validation;
- persisted Provider-terminal validation;
- Storage snapshot and finalizer-shape classification;
- safe internal `userId + deletionRequestId` handoff.

It does not list buckets, inspect objects, delete or verify Storage targets, mutate durable rows, use the legacy aggregate executor, or enter DB/Auth work.

## Seal-only behavior

For a valid `pending` or `collecting` Storage snapshot, the stage calls the closed G5D-2E `sealAccountDeletionStorageSnapshot` authority exactly once. That implementation owns the durable writer fence, existing collection token behavior, two exact owned inventory reads, drift rejection, and focused RPC seal.

A successful seal maps to nonterminal `blocked / storage_snapshot_sealed_continue_required` with `progress.marker=seal_only`. The invocation stops with:

- `storageSealAttempts=1`;
- `storageInventoryReads=2`;
- `storageRunnerInvocations=0`;
- Storage DELETE/info/target external actions `0`;
- DB/Auth/completion calls `0`.

Seal drift/failure fails closed and does not fall through to the runner or any later stage.

## Sealed durable runner behavior

For a consistent sealed snapshot, the bridge invokes `runAccountDeletionStorageDurableStep` exactly once. It does not reproduce target selection, lease/CAS, DELETE intent, verification-first recovery, retry budget, sticky manual, or focused sub-finalization.

The injected/production Storage adapter is wrapped by an observed one-action boundary. One runner invocation can reach no more than one underlying target action: either `deleteObject` or `verifyObjectAbsence`. An attempted second target action receives a local protocol error before the underlying adapter and maps to safe manual/unknown output. Inventory reads are counted separately from target actions.

## Safe Storage result mapping

| Durable result | Operator status | Progress marker | Terminal |
| --- | --- | --- | --- |
| `progressed` | `blocked` | `progressed` | no |
| `target_verified` | `blocked` | `target_verified` | no |
| `retry_later` | `blocked` | `retry_later` | no |
| `busy` | `blocked` | `busy` | no |
| `stale_result` | `blocked` | `stale_result` | no |
| `not_runnable` | `blocked` | `not_runnable` | no |
| `manual_required` | `manual_required` | `manual_required` | no |
| `storage_stage_finalized / succeeded` | `succeeded` | `terminal` | yes, after persisted re-check |
| `storage_stage_finalized / not_needed` | `not_needed` | `terminal` | yes, after persisted re-check |
| `already_finalized` | persisted `succeeded/not_needed` | `terminal` | yes, after persisted re-check |
| exception/runtime-unknown | `manual_required` | `unknown` | no |

A DELETE success, one verified target, or a terminal-looking runner object is not terminal authority. For terminal results the bridge re-fetches the exact row and requires the focused finalizer shape: matching terminal status, `storage_sub_finalized_at`, equal locator-scrub timestamp, scrubbed aggregate fingerprint, equal verified/target counts, and cleared lease.

## Runtime unknown and observed-action accounting

The compile-time exhaustive switch has an explicit runtime fallback. Unknown objects/values map to fixed:

- `manual_required`;
- `safeReasonCode=storage_stage_result_unknown`;
- `progress.marker=unknown`;
- `terminal=false`;
- `storageOutcomeUnknown=1`.

The adapter wrapper increments observed target-action counters before awaiting the underlying fake/production adapter. Therefore an unknown return or exception after one observed action preserves:

- `storageExternalActions=1`;
- `storageAttempted=1`;
- `destructiveOperationsAttempted=1`;
- exact DELETE versus verification action count;
- `storageOutcomeUnknown=1`;
- `storageTerminal=0`.

An action not observed remains `0`; no attempt is guessed. Raw unknown objects and exception details are discarded.

False-zero evidence: `0`.

## Safe counters and redaction

The shared numeric counter sanitizer now accepts only nonnegative `Number.isSafeInteger` values. It preserves `0`, `1`, and `Number.MAX_SAFE_INTEGER`; unsafe finite integers, fractions, negative values, `NaN`, infinities, booleans, and other non-number inputs use the existing safe fallback without flooring. The nullable aggregate counter retains its pre-existing `null` sentinel.

The operator sanitizer allowlists the minimum Storage evidence:

- `storageSealAttempts`;
- `storageInventoryReads`;
- `storageRunnerInvocations`;
- `storageExternalActions`;
- `storageDeleteActions`;
- `storageVerificationActions`;
- `storageAttempted`;
- `storageOutcomeUnknown`;
- `storageTerminal` / `storageNonterminal`;
- aggregate `destructiveOperationsAttempted`.

Output excludes raw user/request IDs, request refs, buckets, object keys/locators, source IDs, fingerprints, Provider IDs, email, signed URLs, secrets, raw Supabase responses, and raw unknown runtime values.

User A/B isolation: `PASS`. Raw Storage bucket/key/locator, source-row/fingerprint, raw user/request identifiers, raw Provider ID/email/secret/response, and rogue unknown values exposed: `0`.

## Legacy and later-stage boundary

The canonical Storage bridge imports neither `runStorageCleanupActual` nor direct Storage SDK `remove()`/`info()` calls. It uses the existing account-deletion Storage adapter only. The legacy `LEGACY_STORAGE_CLEANUP_DURABLE_AUTHORITY_REQUIRED=true` and `storage_durable_authority_required` fail-close path are unchanged.

Provider terminality is rechecked before Storage. Storage terminality never starts DB in the same invocation. DB/anonymization, Auth, completion, Provider external work during the Storage proof, legacy Storage, real Storage, Staging, and Production actions are all `0`.

## Behavioral fake proof

`npm run account-deletion:operator:storage-self-test` passes the focused injected-fake proof for:

- disabled guard precedence before resolver/repository/adapter/runner;
- all specified nonterminal/inconsistent Provider prerequisite cases;
- persisted Provider `succeeded` and `not_needed` eligibility;
- prior-stage CLI flag non-authority;
- pending and collecting seal-only behavior with exact double inventory;
- seal drift fail-close;
- sealed runner exactly once and one underlying target action maximum;
- DELETE/verification same-invocation separation;
- all known nonterminal mappings;
- persisted `succeeded/not_needed` Storage finalizer authority;
- terminal-looking result without persisted finalizer fail-close;
- rogue return and exception before/after an action, with false-zero prevention;
- raw unknown redaction;
- exact request/owner and cross-user mismatch isolation;
- legacy/direct-SDK/later-stage static isolation;
- real Provider/Storage, Staging, Production, DB, Auth, and completion calls `0`;
- destructive guard unchanged and disabled outside the injected fake env object.

## Provider and durable regressions

- The G5D-2B Provider operator proof remains PASS, including pending seal-only, sealed one-step mappings, returned-unknown false-zero correction, terminal mapping, and action-limit behavior.
- A new regression confirms a terminal Provider invocation stops even when a Storage service is connected for a future invocation.
- Provider pending seal-only, one-step runner, runtime unknown handling, observed-action preservation, terminal mapping, and same-invocation Storage calls `0` remain PASS after Storage wiring.
- The G5D-2A Provider durable runner proof remains PASS, 24/24.
- The G5D-2E Storage durable/writer proof remains PASS, 18/18.
- Relevant account-deletion domain/route/Provider-durable/Storage-durable tests remain PASS, 52/52.
- Legacy Provider and Storage guarded self-tests and operator rehearsal remain PASS.

## Validation

- `npm run check:workspace`: PASS.
- `npm run account-deletion:operator:storage-self-test`: PASS.
- table-driven safe-integer boundary proof for every Storage numeric counter: PASS, including direct `Number.MAX_VALUE` rejection.
- canonical entry guard-disabled Storage execute attempt: PASS; blocked before resolver/service work with attempted actions `0`.
- `npm run account-deletion:operator:self-test`: PASS.
- `npm run account-deletion:operator:provider-self-test`: PASS.
- `npm run account-deletion:provider-durable:self-test`: PASS, 24/24.
- `npm run account-deletion:storage-durable:self-test`: PASS, 18/18.
- `npm run account-deletion:provider-cleanup:self-test`: PASS.
- `npm run account-deletion:storage-cleanup:self-test`: PASS.
- `npm run account-deletion:operator:rehearsal:self-test`: PASS.
- relevant account-deletion tests: PASS, 52/52.
- `npm run lint`: PASS.
- `npm run typecheck`: PASS.
- `npm run build`: PASS.
- `git diff --check`: PASS after final documentation sync.
- Mobile source change: `0`; mobile-only lint/typecheck were not required.
- Build emitted only the existing stale Browserslist-data advisory.

## Scope and findings

- Migration/schema/DB type change: `0`.
- Migration `0023` change: `0`.
- Canonical Staging/Production mutation or deployment: `0`.
- Real Storage/Provider calls: `0/0`.
- DB/anonymization/Auth/completion calls: `0/0/0`.
- Destructive guard enablement: `0`; process environment remains disabled.
- P0: `0`.
- P1: `0`.
- P2: `0` in the focused implementation scope.
- Correctness UNKNOWN: `0`.
- Stop conditions encountered: `0`.

The P1-1 Safe Integer Counter Sanitizer disposition is:

`CLOSED`

Final G5D-2G status:

`G5D-2G = CLOSED_COMMITTED_PASS`

Canonical Staging remains migrations `0001`–`0023` exact with pending `0`. The exact next one action, not started by this closeout, is:

`G5D_POST_2G_DB_ANONYMIZATION_NEXT_UNIT_RECONCILIATION`

That read-only reconciliation uses the G5D-2D matrix and live repository to choose exactly one first focused DB/anonymization implementation unit. Schema migration prerequisite, atomic DB finalizer, 17-table authority, quota anonymization, and retained voice/account audit must be decomposed in dependency order rather than implemented together.
