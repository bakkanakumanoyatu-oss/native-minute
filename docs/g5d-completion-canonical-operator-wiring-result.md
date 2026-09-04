# G5D Completion canonical operator final authority closeout

Recorded: 2026-09-04 (Asia/Tokyo)

Mode: `G5D_COMPLETION_CANONICAL_OPERATOR_FINAL_AUTHORITY_CLOSEOUT_COMMIT_AND_PUSH`

Status: `G5D_COMPLETION_CANONICAL_OPERATOR_CLOSED_COMMITTED_PASS`

This closeout accepts `G5D_POST_COMPLETION_FOUNDATION_STAGING_OPERATOR_NEXT_UNIT_RECONCILIATION = PASS = NO_ADDITIONAL_MIGRATION_REQUIRED`, the completed minimum implementation, the independent focused review `NOT PASS` finding `P0/P1/P2/UNKNOWN=0/1/0/0`, the minimum tri-state RPC accounting correction, and `G5D_COMPLETION_CANONICAL_OPERATOR_RPC_ACCOUNTING_INDEPENDENT_READ_ONLY_FOCUSED_RE_REVIEW = PASS` with focused `P0/P1/P2/UNKNOWN=0/0/0/0`. The reproduced runner-sanitizer false-zero P1 is `CLOSED`; no technical diff was added after the accepted re-review. The Completion canonical operator implementation is closed, while the broader connected Completion proof, G5D-2, and Gate 5 remain `OPEN`.

## Accepted authority and boundary

- Canonical Staging remains `native-minute-staging` / `ztlliqishddrrvqqrrlu`, migrations `0001`–`0027` exact, pending `0`.
- Migration `0027_g5d_completion_foundation.sql`, schema, and `types/database.ts` are byte-unchanged.
- Completion repository, Completion operator service, canonical routing, execute guards, and timestamp authority are unchanged by this correction.
- Real `finalize_account_deletion_completion` calls: `0`.
- Real Provider, Storage, Database-finalizer, and Auth calls: `0`.
- Canonical Staging and Production mutation: `0/0`.
- Connected proof, live proof, notification, purge, Gate 5 closeout, and destructive-guard enablement were not started.
- The known program P2 `auth_terminal_authority_missing` remains unchanged as nonblocking deferred cleanup.
- The accepted focused re-review found no additional P0/P1/P2/correctness UNKNOWN and authorized this exact nine-file lineage for final closeout.

## Repository and resolver

`services/account-deletion/account-deletion-completion.repository.ts` owns only:

1. exact UUID or exact existing `adr_<32 hex>` authority lookup with `.limit(2)` and exactly-one acceptance;
2. exact UUID parent re-fetch without an owner filter;
3. one `finalize_account_deletion_completion({ p_deletion_request_id })` call with no retry or direct update.

The authority result normalizes to internal `{ deletionRequestId }` only. Missing, ambiguous, mismatched, malformed, or failed lookups fail closed. Full rows and raw Supabase/PostgreSQL errors do not cross the authority resolver. The exact re-fetch selects only the minimum Completion precheck/binding surface.

Only exact migration-owned SQLSTATE/message pairs are recognized as a known transactional rejection. Transport failures, response loss, unknown PostgreSQL errors, and unrecognized messages—including a known SQLSTATE with an unknown message—normalize to `unknown`.

## RPC normalization and timestamp authority

The repository requires exactly one RPC row and exactly the generated five-field contract. It normalizes only:

- `completed`: `completion_status=completed`, `safe_reason=completion_finalized`, `already_completed=false`;
- `already_completed`: `completion_status=completed`, `safe_reason=already_completed`, `already_completed=true`;
- `rejected`: exact recognized DB transactional rejection;
- `unknown`: every transport, cardinality, shape, timestamp, reason/polarity, or unrecognized case.

Both terminal forms require timezone-bearing timestamps parsed as UTC epoch microseconds and exact positive `expires_at - completed_at = 7,776,000,000ms` (`7,776,000s`). PostgreSQL sub-millisecond differences are not rounded into equality. No `Date.setDate()`, local calendar arithmetic, or formatted timestamp equality is used.

## Minimum precheck and post-RPC binding

Before the RPC, the service exact-fetches the parent and requires only the accepted minimum surface: exact identity; `confirmed|completed`; null owner; clear failure fields; empty metadata; terminal Auth cleanup; and a valid Auth sub-finalizer timestamp. A confirmed candidate additionally requires null `completed_at`, pending notification, and `last_attempted_at` equal to the Auth sub-finalizer as an instant. A replay candidate requires a valid minimum completed terminal surface and exact expiry delta.

Provider/Storage target predicates, snapshot versions/seals/counts/fingerprints/leases, DB D/A/R, retained evidence, and the full Auth generation/verification predicate are not copied into TypeScript. Migration `0027` remains their transactional authority.

Only a structurally valid `completed` or `already_completed` RPC result triggers the post-RPC exact re-fetch. Terminal requires exact request identity; completed parent state; valid persisted timestamps matching the RPC instants; exact persisted 90-day elapsed delta; `notification_status=not_needed`; null owner; clear failures; empty metadata; `last_attempted_at=completed_at` as an instant; and retained terminal Auth markers. A replay also binds pre/post completion and expiry instants and rejects rewrites.

Verified first completion maps to `succeeded`; verified replay maps to `already_satisfied`. A recognized rejection maps to `blocked / completion_rpc_rejected`. Transport/malformed/unknown maps to `manual_required / completion_stage_result_unknown`. A terminal-looking response without exact persisted binding maps to `manual_required / completion_terminal_authority_missing`. Raw RPC `safe_reason` is never repeated.

## Routing, guard, and accounting

Canonical routing is now:

`status/summary -> read-only`

`provider -> Provider`

`storage -> Storage`

`database -> Database`

`auth -> Auth`

`completion -> Completion`

`future/unknown -> fail closed`

The existing Provider/Storage/Database/Auth `DESTRUCTIVE_STAGES` set remains unchanged. A minimal `EXECUTABLE_STAGES` set adds Completion to the same execute ceremony: destructive guard, irreversible acknowledgement, proof path, latest dry-run evidence, prior-stage acknowledgement, exact resolver, and one stage per invocation. Completion does not bypass this authorization boundary.

Completion is a terminal DB mutation, not an external destructive operation. Its safe accounting is:

- `completionRpcCalls=0` only for trusted pre-RPC stops, `1` only for trusted RPC-dispatched paths, and `null` for missing/malformed/untrusted evidence;
- the Completion sanitizer accepts only exact numeric `0` or `1`; it does not coerce, default, or infer missing, `undefined`, `NaN`, either infinity, negative, fractional, greater-than-one, numeric-string, or arbitrary values;
- `completionOutcomeUnknown=1` for transport/malformed/post-fetch uncertainty;
- `completionTerminal=1` only for verified persisted terminal authority, `0` for verified nonterminal rejection/precheck, and `null` for unverified outcomes;
- `completionAlreadyCompleted=0|1` only for verified first/replay terminal results and `null` otherwise;
- `externalCalls=0`;
- `destructiveOperationsAttempted=0`.

No wrapper retry exists. A response-loss invocation performs no second RPC. A later, separate invocation may call the RPC once and recover from DB-side `already_completed` authority without timestamp rewrite.

`completion_terminal_authority_missing` is accepted only with exact `completionRpcCalls===1`, because it is exclusively the post-RPC exact re-fetch mismatch path. The same reason with `0`, missing, or malformed RPC evidence fails closed to `manual_required / completion_stage_result_unknown / terminal=false`, with `completionRpcCalls=null`, `completionOutcomeUnknown=1`, and both terminal evidence fields `null`. The sanitizer does not infer `1` from a terminal-looking reason.

An Auth invocation still reports `completionCalls=0`. A Completion invocation cannot call Provider, Storage, the Database finalizer, Auth, notifications, connected proof, or another Gate.

## Redaction

The repository, service, and runner expose only fixed allowlisted reasons and safe counters/progress. Output omits request UUID/ref, user/Auth identity, email/phone, Provider/Storage locators, raw metadata, raw SQL/PostgreSQL message/detail/hint/context/stack, credentials, and raw RPC rows. Focused sentinel checks found safe-output occurrences `0`.

## Focused fake/non-live proof

`npm run account-deletion:operator:completion-self-test` passes injected-fake coverage for the canonical A–U cases plus the focused P1 regressions:

- invalid/missing/ambiguous request authority and cross-request mismatch with RPC `0`;
- exact UUID/opaque resolution to the same internal UUID;
- persisted Auth/precheck failures with RPC `0`;
- first completion and completed replay with RPC at most one, post-fetch binding, terminal mapping, replay timestamp immutability, and already-completed polarity;
- recognized rejection, response loss, zero/multiple rows, wrong status/reason/boolean polarity, invalid/no-timezone timestamp, wrong RPC/persisted expiry delta, persisted timestamp mismatch, and replay timestamp rewrite;
- observed RPC accounting with retry `0`, nullable unverified terminal/replay evidence, and fixed safe reasons;
- `completion_terminal_authority_missing + completionRpcCalls=0|missing|NaN` generic-unknown fail-close with nullable RPC evidence;
- the valid `completion_terminal_authority_missing + completionRpcCalls=1` post-RPC surface remains unchanged;
- Auth-to-Completion and Completion-to-earlier-stage same-invocation calls `0`;
- external/destructive operation accounting `0` and sensitive sentinel leakage `0`.

The operator core proof additionally covers missing, `undefined`, `NaN`, `Infinity`, `-Infinity`, `-1`, `0.5`, `2`, and `"1"` RPC evidence mapping to `null` rather than `0`; invalid terminal-authority/count combinations; the valid count-one combination; Completion resolver sanitization; terminal replay sanitization; guard separation; and zero external accounting.

## Existing stage regressions and validation

- `npm run check:workspace`: PASS.
- `npm run account-deletion:operator:completion-self-test`: PASS.
- `npm run account-deletion:operator:self-test`: PASS.
- Provider canonical operator regression: PASS.
- Storage canonical operator regression: PASS.
- Database canonical operator regression: PASS.
- Auth canonical operator regression: PASS.
- Auth durable proof: PASS, `35/35`.
- Independent focused re-review: PASS; original false-zero P1 closed; focused `P0/P1/P2/UNKNOWN=0/0/0/0`.
- `npm run lint`: PASS.
- `npm run typecheck`: PASS.
- `npm run build`: NOT RUN for this correction; runner/test/docs-only correction does not affect UI/routes/types, and the accepted implementation baseline already passed build.
- final `git diff --check`: PASS.

No new migration/isolation PostgreSQL proof was run because migration `0027` is closed authority and its bytes are unchanged.

## Findings and status

- Accepted review finding P0/P1/P2/correctness UNKNOWN: `0/1/0/0`.
- Post-correction independent focused re-review P0/P1/P2/correctness UNKNOWN: `0/0/0/0`, `PASS`.
- Program aggregate P0/P1/P2/correctness UNKNOWN: `0/0/1/0`.
- Sole known program P2: `auth_terminal_authority_missing`, unchanged.
- Stop conditions encountered: `0`.
- Final closeout: one atomic commit and normal fast-forward push; no amend, squash, rebase, or force.
- Completion canonical operator: `G5D_COMPLETION_CANONICAL_OPERATOR_CLOSED_COMMITTED_PASS`.
- Broader connected Completion proof: `NOT STARTED`; overall G5D-2 program completion remains `OPEN`.
- G5D-2: `OPEN`.
- Gate 5: `OPEN`.

## Exact next action

`G5D_POST_COMPLETION_CONNECTED_NON_LIVE_PROOF_RECONCILIATION`
