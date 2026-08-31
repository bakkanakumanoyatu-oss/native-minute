# G5D-1 Provider-only Internal Operator Vertical Slice

Recorded: 2026-08-30

Mode: `G5D_1_PROVIDER_ONLY_INTERNAL_OPERATOR_VERTICAL_SLICE_FAKE_PROOF_V1`

Status: `CLOSED_COMMITTED_PASS`

Authority: `NATIVE_MINUTE_POST_B7_APP_STORE_CRITICAL_PATH_ULTRA_NORMALIZATION_V1`, the exact implementation checkpoint `4f947e7ecb8c7eaf5a57f26dca333f4e8ba2279e`, and independent verdict `G5D_1_INDEPENDENT_FOCUSED_REVIEW_PASS`.

Independent closeout review: PASS with P0=`0`, unresolved G5D-1 correctness P1=`0`, P2=`0`, and G5D-1 closeable=`YES`.

## Scope

G5D-1 connects only the account-deletion operator `provider` stage to the existing TypeScript service boundary `runElevenLabsProviderCleanupActual`.

This slice does not connect or call Storage cleanup, DB cleanup/anonymization, Supabase Auth deletion, or completion. It does not enable the destructive guard, call ElevenLabs, mutate Staging, add a migration, deploy, or expose a public API/UI.

## Architecture

1. The existing operator core evaluates every execute guard before it calls a resolver or stage service.
2. `account-deletion-operator-entry.mjs` is the canonical CLI entry. It preserves the existing read-only `status` / `summary` resolver and wires one destructive stage service key: `provider`.
3. `account-deletion-provider-operator.service.ts` resolves an operator request UUID or `adr_<32 hex>` reference server-side.
   - UUID lookup is exact by primary key.
   - Opaque-reference lookup reads at most two rows and requires exactly one result because the existing opaque-reference index is not unique authority.
   - Returned identity must match the external reference, and request/provider-stage status must still be runnable or already satisfied.
   - Missing, invalid, unknown, ambiguous, stale, userless, or malformed targets fail closed.
   - Only internal `userId + deletionRequestId` crosses into the provider service.
4. The provider wrapper re-checks `stage=provider`, `mode=execute`, target UUID shape, and the destructive guard before calling the existing TypeScript service.
5. The adapter drops the service request view, guard detail, notes, arbitrary fields, identifiers, locators, and provider payloads. Operator output receives only status, allowlisted safe reason, exact available cleanup counts, and unknown-state markers.

The CLI uses `tsx` only as the dedicated internal TypeScript runner bridge. Application routes and public contracts are unchanged.

## Outcome Mapping

| Service status | Operator status | `safeReasonCode` policy |
| --- | --- | --- |
| `succeeded` | `succeeded` | `null` |
| `not_needed` | `not_needed` | `null` |
| `already_satisfied` | `already_satisfied` | `null` |
| `failed` | `failed` | explicit allowlist mapping or `provider_cleanup_failed` |
| `manual_required` | `manual_required` | explicit allowlist mapping or `provider_cleanup_manual_required` |
| `blocked` | `blocked` | explicit allowlist mapping or `provider_cleanup_blocked` |
| wrapper/service exception | `manual_required` | `provider_stage_result_unknown` |

`cleanup.attempted / succeeded / failed / notNeeded / blocked` becomes `providerAttempted / providerSucceeded / providerFailed / providerNotNeeded / providerBlocked`. `destructiveOperationsAttempted` mirrors `attempted`. The service result does not expose a canonical total provider-candidate count, so `providerCandidates` is `null` rather than an inferred value. If the service throws after an unknown point, every provider outcome count is `null` and `providerOutcomeUnknown=1`; output does not claim zero attempts, successes, or failures.

Known provider failures are generalized before operator output. Examples include `deletion_request_id_mismatch -> request_target_mismatch`, provider not-found -> `provider_target_absence_unverified`, invalid provider reference -> `provider_target_reference_invalid`, and the ElevenLabs kill switch -> `provider_kill_switch_active`. Unknown raw-looking reasons never pass through.

## Behavioral Fake Proof

Command:

```bash
npm run account-deletion:operator:provider-self-test
```

Passed behaviors:

- destructive guard before resolver and service;
- exact UUID targeting;
- invalid, unknown, and ambiguous reference fail-close;
- provider is the only connected destructive stage;
- Storage, DB/anonymization, Auth, and completion calls are zero;
- all six service outcomes are explicitly mapped;
- partial-success retry re-resolves the exact request and remains provider-only;
- status-write/result loss becomes unknown/manual, not false success or false zero attempts;
- raw user id, deletion request id, provider id, locator, provider response, email, secret, and signed URL are absent from operator output;
- real provider calls and Staging mutation are zero.

The existing operator-core and provider-boundary self-tests also pass. Every provider behavior in the new proof is injected; the default service implementation is not invoked by the proof.

## Validation

- `npm run check:workspace`: PASS.
- `npm run account-deletion:operator:provider-self-test`: PASS.
- `npm run account-deletion:operator:self-test`: PASS.
- `npm run account-deletion:provider-cleanup:self-test`: PASS.
- canonical operator entry with destructive guard forced off and `--stage provider --dry-run`: PASS; resolver/service calls `0`.
- `npm run lint`: PASS.
- `npm run build`: PASS.
- `npm run typecheck`: PASS.
- `git diff --check`: PASS.
- migration diff: empty.
- Supplemental `npm audit`: repository-wide existing backlog remains `13` findings; the report contains no finding for the newly added `tsx` / `esbuild` bridge dependency chain. No audit fix or unrelated dependency upgrade was performed.

## Retry and Durable Recovery Finding

The existing account-deletion provider service persists only aggregate request/provider-stage status. It can delete one target successfully and then fail on a later target before writing a complete per-target durable history. A retry safely:

- re-resolves the exact external request reference server-side;
- re-fetches owned provider candidates in the existing service;
- stays at the provider stage;
- never advances Storage, DB, Auth, or completion;
- can become `manual_required` when an already-deleted target is observed as not found.

This is fail-closed, but it is not complete automatic durable recovery for multi-target partial success or a provider-success/status-write-loss window. The separate G5C voice-deletion durable model is not linked to this account-deletion request/runner. Reusing it or adding account-deletion-specific per-target state would be a durable-model/architecture decision outside G5D-1. No migration or integration was added.

Disposition: carried-forward blocker `ACCOUNT_DELETION_PROVIDER_DURABLE_RECOVERY_AUTHORITY_DECISION_BEFORE_G5D_2`. This is not a G5D-1 correctness defect or unresolved G5D-1 P1. It must be resolved before G5D-2 starts and before G5D-4 live authorization. Whether resolution requires schema/migration work, or can safely reuse the separate G5C durable model, remains UNKNOWN.

## Safety Result

- Default destructive guard: disabled.
- Real ElevenLabs DELETE/GET: `0`.
- Storage calls: `0`.
- DB cleanup/anonymization calls: `0`.
- Auth/completion calls: `0`.
- Staging mutation: `0`.
- Migration: `0`.
- Deploy: `0`.
- Public API/UI change: `0`.

## Findings

- P0: `0`.
- Unresolved G5D-1 correctness P1: `0`.
- P2: `0` in the G5D-1 fake-only implementation scope.
- Carried-forward blocker: `ACCOUNT_DELETION_PROVIDER_DURABLE_RECOVERY_AUTHORITY_DECISION_BEFORE_G5D_2`.
- UNKNOWN: whether a later account-deletion integration can safely reuse the separate G5C durable voice-deletion model without schema or durable-authority changes. G5D-1 makes no such claim.
- Outside-scope existing WARN: repository-wide dependency-audit remediation remains separate work and was not reclassified or changed by G5D-1.

Next single action: `ACCOUNT_DELETION_PROVIDER_DURABLE_RECOVERY_AUTHORITY_DECISION_BEFORE_G5D_2`. Do not start G5D-2, enable the destructive guard, or run a live provider call as part of this closeout.
