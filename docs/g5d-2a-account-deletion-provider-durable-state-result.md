# G5D-2A Three-P1 Minimum Remediation

Recorded: 2026-09-01

Mode: `G5D_2A_THREE_P1_MINIMUM_REMEDIATION_IMPLEMENTATION_AND_FAKE_PROOF_V1`

Status: `CLOSED_COMMITTED_PASS`

Authority: `C_ACCOUNT_DELETION_SPECIFIC_DURABLE_STATE_REQUIRED`, `G5D_2A_THREE_P1_MINIMUM_REMEDIATION_AUTHORITY_FIXED`, `G5D_2A_THREE_P1_MINIMUM_REMEDIATION_INDEPENDENT_READ_ONLY_FOCUSED_REVIEW_PASS`, `G5D_2A_DIGEST_SCHEMA_QUALIFICATION_INDEPENDENT_FOCUSED_REVIEW_PASS`, `G5D_2A_ISOLATED_POSTGRES_RUNTIME_PROOF_PASS`, and `G5D_2A_FINAL_INDEPENDENT_CLOSEOUT_AUDIT_PASS`.

G5D-2 overall remains `OPEN`. This result does not start G5D-2B, enable the destructive guard, apply a Staging migration, deploy, or call ElevenLabs.

## Scope and architecture

Uncommitted and repo-evidence-unapplied migration `0022_g5d_2a_account_deletion_provider_durable_state.sql` defines an account-deletion-specific provider snapshot/lease/finalization authority on `account_deletion_requests` and a server-only `account_deletion_provider_targets` table. It does not reuse G5C durable tables/finalizer, B7 Option D, fixed retention, Storage, DB/anonymization, Auth, notification, or completion authority.

The server-only repository keeps the existing RPC shapes and maps exact request/owner/lease/CAS values. All mutations use eight focused `SECURITY DEFINER` RPCs granted only to `service_role`; the child table grants `service_role` SELECT only and no direct DML.

## P1-1 — parent/child lifetime

The child keeps the composite `(deletion_request_id, user_id)` ownership FK and adds a standalone `deletion_request_id -> account_deletion_requests(id) ON DELETE CASCADE` FK. Existing request/status indexes already lead with `deletion_request_id`, so no index was added.

The standalone FK remains authoritative after a later Auth deletion nulls `user_id` through the composite relationship. A later parent request deletion therefore still cascades to the child targets.

## P1-2 — terminal aggregate authority

The parent protection trigger now runs `BEFORE INSERT OR UPDATE`.

- INSERT rejects `provider_cleanup_status = succeeded` and `not_needed`.
- UPDATE rejects every transition into `succeeded` or `not_needed` unless the RPC-local authority is exactly `finalize`, regardless of pending/sealed snapshot state.
- Zero targets still require seal, lease, and the focused finalizer before `not_needed`.
- Non-empty targets require exact sealed count and strict verified absence for every target before focused `succeeded`.

The finalizer atomically repairs the safe aggregate count, scrubs every source/provider locator and fingerprint, writes finalization timestamps, writes the parent terminal status, and clears the lease. It does not finalize the account or enter later stages.

## P1-3 — one durable DELETE dispatch

`delete_attempt_count` is the durable dispatch generation:

- `0`: no automatic external DELETE authority issued;
- `1`: the sole automatic external DELETE authority issued.

The schema enforces `delete_attempt_count IN (0,1)`. The target trigger permits only focused `begin_delete` to change `0 -> 1`; `1 -> 0`, `1 -> 2`, and other writers are rejected. Begin DELETE accepts only an initial pending/not-attempted/not-applicable target at generation 0. A second begin returns no authority.

State progression is:

`generation 0 -> focused generation 1 -> sole automatic DELETE -> GET-first -> verified_absent | manual_required`

A begun, timed-out, unavailable, rejected, result-write-lost, process-lost, or stale-runner DELETE is never blindly repeated. Every later eligible invocation performs GET first. Strict absence verifies the target. GET present becomes sticky `manual_required` regardless of owner signal and cannot re-enter DELETE. Reconciliation keeps its maximum of five attempts with durable transient backoff.

Runner A may issue generation 1 and lose its lease. Runner B can take over only with GET authority. If B observes present it records manual-required and performs zero DELETEs. A delayed HTTP call still consumes the one generation-1 authority; its stale result write is rejected by lease/runner/target CAS and cannot change manual, verified, or finalized state.

This authority does not claim external Provider DELETE exactly-once, and it does not claim that PostgreSQL can fence an already-issued stale runner's late HTTP call. It guarantees that the database issues no second automatic DELETE authority for the target and rejects stale result writes. G5C-B7 Option D is not generalized into this account-deletion authority.

## Legacy path fail-close

The aggregate `runElevenLabsProviderCleanupActual` path is no longer destructive authority. After resolving the request it returns `blocked / provider_durable_authority_required` before dry-run candidate collection, direct terminal writes, an injected fake DELETE, or the default ElevenLabs adapter. The operator safe-code allowlist preserves that reason.

Canonical operator wiring to the durable runner is deliberately deferred to the next implementation unit.

## Behavioral fake proof

`npm run account-deletion:provider-durable:self-test` passes 24 tests covering the fixed 30-point proof:

- terminal authority: insert `succeeded/not_needed` rejection; direct unsealed/sealed terminal transition rejection; zero-target focused `not_needed`; all-verified focused `succeeded`;
- legacy path: direct legacy execution fail-closes with `provider_durable_authority_required`; injected fake and default destructive adapters remain at zero calls;
- one dispatch generation: focused `0 -> 1` exactly once, second begin rejection, check/trigger rejection of `1 -> 0` and `1 -> 2`;
- recovery: timeout, throw, process loss, and result-write loss resume with no new DELETE; strict absence verifies; present becomes sticky manual; reconciliation exhaustion becomes manual;
- stale takeover: A issues generation 1 and stops, B takes over with GET-only, present becomes manual, B DELETE count is zero, simulated late A DELETE makes total automatic dispatch one, and stale A result CAS leaves state unchanged;
- parent/child lifetime: standalone request-id cascade FK plus retained composite ownership FK, with existing leading request indexes;
- existing exact seal, User A/B, multi-target partial recovery, zero target, finalizer gating, atomic safe counts, locator scrub, and zero later-stage/provider/Staging calls.

All provider behavior is injected. Real ElevenLabs DELETE/GET count is `0`.

## Independent review and actual PostgreSQL proof

- The independent focused review passed with no unresolved correctness P1.
- The pgcrypto correction review confirmed the exact `extensions.digest(text, text)` qualification while preserving the fixed `pg_catalog, public` RPC search path.
- A clean disposable Supabase PostgreSQL environment applied migrations `0001` through `0022` successfully.
- Actual PostgreSQL behavior passed dual-FK/catalog, RLS/ACL/eight-RPC authority, trigger attachment, terminal negatives, zero/nonzero finalizer, rollback, one-dispatch, independent two-session target and parent-lease contention, lease-expiry takeover, stale CAS, reconciliation budget/manual state, exact seal/User A-B isolation, finalized Auth-null ownership cascade, atomic scrub, unrelated-row isolation, and fixture cleanup proofs.
- Migration `0022` has isolated PostgreSQL runtime proof but remains unapplied to canonical Staging. Staging apply/deploy is a later controlled unit and is not a G5D-2A correctness unknown.
- The final independent closeout audit verdict is `G5D_2A_FINAL_INDEPENDENT_CLOSEOUT_AUDIT_PASS`; G5D-2A is repository-closeable while G5D-2 overall remains `OPEN`.

## Validation

- `npm run check:workspace`: PASS.
- `npm run account-deletion:provider-durable:self-test`: PASS, 24/24.
- `npm run account-deletion:operator:provider-self-test`: PASS.
- `npm run account-deletion:operator:self-test`: PASS.
- `npm run account-deletion:provider-cleanup:self-test`: PASS.
- relevant account-deletion and shared G5C provider/durable tests: PASS, 136/136.
- `npm run typecheck`: PASS.
- `npm run mobile:typecheck`: PASS.
- `npm run lint`: PASS.
- `npm run mobile:lint`: PASS.
- `npm run build`: PASS.
- `git diff --check`: PASS after final docs sync.
- migration ordering/types: `0022` follows `0021`; `types/database.ts` and affected fixtures are synchronized.

## Safety and findings

- Destructive guard: disabled.
- Storage / DB-anonymization / Auth / completion calls: `0`.
- Real ElevenLabs calls: `0`.
- Staging mutation / migration apply / deploy: `0`; migration `0022` remains canonical Staging unapplied.
- New migration beyond the intended `0022`: `0`; no `0023` exists.
- P0: `0`.
- Unresolved correctness P1: `0`.
- P2: `0` — unexpected GET adapter throws now persist safe `network_error` and `next_retry_at` through the focused reconciliation result RPC.
- Correctness UNKNOWN: `0`.

Next single action: `GATE5_HUMAN_DECISION_AND_PUBLIC_COPY_REPOSITORY_SYNC_DOCS_ONLY`. Keep that unit docs-only; do not start G5D-2B, enable the guard, apply migration `0022` to Staging, deploy, or call a real provider as part of this closeout.
