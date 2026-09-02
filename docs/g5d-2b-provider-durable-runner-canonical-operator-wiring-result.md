# G5D-2B Provider Durable Runner Canonical Operator Wiring

Recorded: 2026-09-02

Mode: `G5D_2B_PROVIDER_DURABLE_RUNNER_CANONICAL_OPERATOR_WIRING_AND_FAKE_PROOF_V1`

Status: `CLOSED_COMMITTED_PASS`

Authority: `G5D_POST_2A_NEXT_TECHNICAL_UNIT_RECONCILIATION_PASS`, `G5D_2B_PROVIDER_DURABLE_RUNNER_CANONICAL_OPERATOR_WIRING_AND_FAKE_PROOF_IMPLEMENTED_PENDING_REVIEW`, `G5D_2B_PROVIDER_DURABLE_CANONICAL_WIRING_INDEPENDENT_READ_ONLY_FOCUSED_REVIEW_NOT_PASS`, `G5D_2B_UNKNOWN_RUNTIME_RESULT_FALSE_ZERO_P1_CORRECTED_PENDING_REVIEW`, and the final accepted `G5D_2B_UNKNOWN_RUNTIME_RESULT_INDEPENDENT_FOCUSED_REVIEW_PASS`.

G5D-2 overall and Gate 5 remain `OPEN`. This unit does not apply migration `0022` to canonical Staging, enable the destructive guard, deploy, call a real provider, or connect Storage, DB/anonymization, Auth, or completion.

## Canonical wiring

The canonical internal CLI Provider stage now resolves the exact request and calls the G5D-2A account-specific durable repository/runner rather than `runElevenLabsProviderCleanupActual`.

The boundary remains:

1. The operator core evaluates all execute guards before the request resolver.
2. A UUID or `adr_<32 hex>` reference is resolved server-side to internal-only `userId + deletionRequestId`.
3. The Provider stage rechecks stage, mode, destructive guard, and internal UUID shape before creating a repository or Provider adapter.
4. A pending exact snapshot is sealed and the invocation stops.
5. A sealed exact snapshot runs one durable step.
6. The Provider adapter is wrapped by an additional one-external-action boundary.
7. Only the focused Provider sub-finalizer result maps to terminal `succeeded` or `not_needed`.

The CLI scripts use the `react-server` condition when loading the existing `server-only` durable repository/runner and ElevenLabs deletion adapter. The `server-only` marker package is now an explicit runtime dependency; the server-only markers were not removed or bypassed.

## Pending snapshot

For a request with the exact pending G5D-2A snapshot shape:

- `getRequestForOwner` runs once at the operator-stage boundary;
- `sealProviderSnapshot` runs once;
- the durable runner is not called;
- Provider DELETE and GET are both zero;
- the result is nonterminal `blocked / provider_snapshot_sealed_continue_required` with `progress.marker=seal_only` and a retry marker;
- the operator stops and requires a later invocation.

Seal success never falls through to a Provider action in the same invocation.

## Sealed snapshot and one-step behavior

Only the exact sealed G5D-2A snapshot shape can reach `runAccountDeletionProviderDurableStep`. The runner is called exactly once per operator invocation and retains the closed G5D-2A semantics:

- durable generation `0 -> 1` precedes the sole automatic DELETE authority;
- every later eligible invocation is GET-first;
- strict absence alone verifies a target;
- present becomes sticky `manual_required`;
- lease/CAS rejects stale results;
- finalization is a separate focused DB authority;
- external Provider exactly-once and a PostgreSQL fence around an already-issued late HTTP call are not claimed.

The operator wrapper allows the injected/production adapter to perform at most one underlying external action. An unexpected second adapter invocation receives a local protocol error and maps to manual/unknown; it cannot call the underlying Provider a second time.

## Safe result mapping

| Durable result | Operator status | Safe progress | Terminal |
| --- | --- | --- | --- |
| `progressed` | `blocked` | `progressed`, retryable | no |
| `target_verified` | `blocked` | `target_verified`, retryable | no |
| `retry_later` | `blocked` | `retry_later`, retryable | no |
| `busy` | `blocked` | `busy`, retryable | no |
| `stale_result` | `blocked` | `stale_result`, retryable | no |
| `not_runnable` | `blocked` | `not_runnable` | no |
| `manual_required` | `manual_required` | `manual_required` | no |
| `provider_stage_finalized / succeeded` | `succeeded` | `terminal` | yes |
| `provider_stage_finalized / not_needed` | `not_needed` | `terminal` | yes |
| `already_finalized` | persisted `succeeded/not_needed` | `terminal` | yes |
| exception/unknown | `manual_required` | `unknown` | no |

DELETE success alone, target verification alone, and progress alone never map to terminal Provider success. If the runner becomes unknown after a fake Provider call, output retains the observed Provider action count and sets `providerOutcomeUnknown=1`; it does not claim a false zero attempt.

The independent focused review found one runtime mapping P1: an unrecognized returned runner result fell through the compile-time union switch and let the outer sanitizer emit false zero action evidence. The minimum correction keeps the compile-time `never` exhaustiveness check and adds a runtime fallback that returns fixed `manual_required / provider_stage_result_unknown / unknown` semantics, preserves the bridge-observed external action count, sets `providerOutcomeUnknown=1`, and remains nonterminal. The focused proof now covers an unknown object returned after exactly one fake Provider action; it does not use an exception for this case and confirms attempted/action counts remain `1`, raw unknown fields are absent, and no second or later-stage action occurs.

## Safe output

The operator sanitizer now accepts only an explicit progress-marker allowlist and boolean retry/terminal/manual markers. It also emits redacted counts for snapshot seals, durable runner calls, external Provider actions, terminal, and nonterminal state.

Output still excludes raw user/request/provider identifiers, locators, Storage keys, signed URLs, email, secrets, raw Provider responses, SQL errors, and full rows.

## Legacy and later-stage isolation

- The legacy `runElevenLabsProviderCleanupActual` implementation remains present and still fails closed with `provider_durable_authority_required` before a fake/default DELETE adapter.
- The canonical Provider bridge no longer imports or calls that legacy aggregate executor.
- `stageServices` contains only `provider`.
- Storage, DB/anonymization, Auth, and completion remain unreachable even after a terminal Provider result.
- One stage per invocation remains unchanged.

## Behavioral fake proof

`npm run account-deletion:operator:provider-self-test` passes the focused fake proof for:

- guard-before-resolver/repository/runner/adapter;
- exact UUID and opaque reference resolution;
- invalid, missing, ambiguous, and stale target fail-close;
- pending seal exactly once and zero Provider action;
- sealed runner exactly once;
- explicit progressed/retry/busy/stale/manual/terminal mapping;
- maximum one underlying fake Provider action;
- unknown result after a Provider action without false-zero reporting;
- safe output/redaction;
- Provider-only stage connection and zero later-stage calls;
- zero real Provider and Staging calls.

The closed G5D-2A durable runner proof remains the authority for DELETE intent ordering, result-write/process loss, GET-first takeover, strict absence, present/manual, transient retry, reconciliation exhaustion, lease/CAS, stale result, zero-target finalization, multi-target recovery, and locator scrub.

## Validation

- `npm run check:workspace`: PASS.
- `npm run account-deletion:operator:provider-self-test`: PASS.
- returned unknown runtime result after one fake Provider action: PASS; nonterminal safe unknown, observed action count preserved, false zero `0`.
- canonical guard-disabled Provider dry-run: PASS, resolver/stage/provider action zero.
- `npm run account-deletion:operator:self-test`: PASS.
- `npm run account-deletion:provider-durable:self-test`: PASS, 24/24.
- `npm run account-deletion:provider-cleanup:self-test`: PASS.
- relevant account-deletion domain + durable tests: PASS, 29/29.
- `npm run lint`: PASS.
- `npm run typecheck`: PASS.
- `npm run build`: PASS.
- `git diff --check`: PASS after final documentation sync.
- migration/schema/DB type diff: zero.
- mobile source diff: zero; mobile-only lint/typecheck were not required.

`npm install` reported the repository-wide existing dependency-audit backlog. No audit fix, forced upgrade, or unrelated dependency remediation was performed.

## Safety and findings

- Destructive guard: disabled.
- Real ElevenLabs DELETE/GET: `0`.
- Storage / DB-anonymization / Auth / completion calls: `0`.
- Canonical Staging mutation/apply: `0`.
- Migration/schema/type change: `0`.
- Deploy: `0`.
- P0: `0`.
- Unresolved correctness P1: `0`.
- P2: `0` in the focused implementation scope.
- Correctness UNKNOWN: `0`.

G5D-2B is `CLOSED_COMMITTED_PASS`. G5D-2 overall and Gate 5 remain `OPEN`.

Next single action: `G5D_2C_MIGRATION_0022_CONTROLLED_STAGING_APPLY_AND_NON_DESTRUCTIVE_SMOKE`.

Migration `0022` remains unapplied to canonical Staging at this closeout. The next unit begins separately and must not start with destructive execution.
