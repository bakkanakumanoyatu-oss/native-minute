# G5D-2J Atomic DB finalizer RPC and transactional runtime proof result

Recorded: 2026-09-03

Closeout mode: `G5D_2J_FINAL_AUTHORITY_CLOSEOUT_COMMIT_AND_PUSH_V1`

## Status

`G5D-2J = CLOSED_COMMITTED_PASS`

This unit implements the focused database/anonymization sub-finalizer only. It does not wire the canonical operator, call Auth/Provider/Storage, complete an account deletion, add a purge scheduler, enable the destructive guard, apply migration `0025` to Canonical Staging, or touch Production. G5D-2 and Gate 5 remain `OPEN`.

## Accepted authority and scope

The accepted final authorities are:

- `G5D_POST_2I_ATOMIC_DB_FINALIZER_NEXT_UNIT_RECONCILIATION_PASS`;
- `G5D_2J_ATOMIC_DB_FINALIZER_RPC_AND_TRANSACTIONAL_RUNTIME_PROOF_IMPLEMENTED_PENDING_REVIEW`;
- `G5D_2J_ATOMIC_DB_FINALIZER_INDEPENDENT_READ_ONLY_FOCUSED_REVIEW_NOT_PASS`;
- `G5D_2J_FINALIZER_FAIL_CLOSED_REPLAY_AND_PRIOR_EVIDENCE_REMEDIATION_PASS_PENDING_REVIEW`;
- `G5D_2J_FAIL_CLOSED_REPLAY_AND_PRIOR_EVIDENCE_INDEPENDENT_FOCUSED_REVIEW_NOT_PASS`;
- `G5D_2J_MIGRATION_SHA_FOCUSED_TEST_COVERAGE_P2_CORRECTED_PENDING_REVIEW`;
- `G5D_2J_MIGRATION_SHA_FOCUSED_TEST_COVERAGE_INDEPENDENT_READ_ONLY_REVIEW_PASS`.

The final independent review closes both P1 correctness findings and the P2 migration-SHA focused-test coverage finding. The finalizer consumes the unchanged exact inventory version `g5d-2h.account-db.v1` and all 18 current public tables. The implementation remains forward-only migration `0025_g5d_2j_atomic_db_finalizer.sql`; no dynamic table-driven deletion/retention engine, generic write-lock framework, or repository wrapper was added.

## Accepted remediation findings

- P1-1 root cause: the already-finalized branch returned from parent DB terminal evidence before revalidating current Provider/Storage prerequisites, owned DB post-state, and retained evidence/count shape.
- P1-2 root cause: prior eligible request validation matched parent counts to actual targets but did not enforce `not_needed => zero targets` and `succeeded => nonzero targets` for Provider and Storage.
- P2-1 root cause: the exact migration `0025` SHA-256 was not recorded in this result.

P1-1, P1-2, and P2-1 are `CLOSED` under the accepted final independent review. P0, unresolved correctness P1, P2, and correctness UNKNOWN are `0/0/0/0`.

## Transaction and prerequisite design

`finalize_account_deletion_database_stage(uuid, uuid, text)` is one `SECURITY DEFINER` PostgreSQL function, owned by `postgres`, with fixed `search_path = pg_catalog, public` and service-role-only `EXECUTE`. It resolves the persisted request owner before taking the existing user-scoped transaction advisory lock, locks the exact request `FOR UPDATE`, and performs prerequisite verification, inventory, mutation, post-state verification, and terminal evidence persistence in the same transaction.

The function requires exact persisted Provider authority (`g5d-2a.account-provider.v1`, sealed snapshot, valid terminal status/counts, cleared lease, sub-finalized timestamp, and scrubbed verified-absent targets) followed by exact persisted Storage authority (`g5d-2e.account-storage.v1` with the analogous sealed/terminal/count/lease/sub-finalized/scrub invariants). Caller flags cannot override either prerequisite.

An already-finalized invocation now passes through those same current Provider and Storage validation blocks before it can return success. It then performs a read-only exact owned post-state check across the static 18-table authority, requires the current request and its current Provider/Storage evidence to remain present and safe, and requires persisted `R` to equal the canonical current request plus current target rows. Parent terminal D/A/R polarity and `observed = D + A + R` are rechecked without rewriting historical counts or timestamps. Any mismatch raises the safe `db_terminal_post_state_invalid` or existing prerequisite error; replay does not delete, anonymize, repair, or clear anything.

## Exact inventory and disposition

The static SQL inventories these exact 18 tables:

1. `profiles`
2. `scripts`
3. `script_audios`
4. `takes`
5. `weak_words`
6. `coach_feedback`
7. `script_saved_model_audios`
8. `script_saved_best_takes`
9. `voices`
10. `voice_consents`
11. `processing_consents`
12. `voice_deletion_operations`
13. `voice_deletion_targets`
14. `voice_asset_write_intents`
15. `account_deletion_requests`
16. `account_deletion_provider_targets`
17. `quota_events`
18. `account_deletion_storage_targets`

This is the exact current `g5d-2h.account-db.v1` authority: inventory `18/18`, missing `0`, extra `0`, static SQL authority, and User A/B isolation `PASS`. The obsolete 12-category legacy model is not used.

The explicit DELETE order is `takes` before `scripts`, followed by `voices`, `voice_consents`, `processing_consents`, and `profiles`. `weak_words`, `coach_feedback`, and saved-best rows disappear through the take parent; `script_audios` and saved-model rows disappear through the script parent. Every physical CASCADE row is still included in pre-inventory and `D`, then checked absent in post-state.

Completed/cancelled write intents are deleted; reserved/manual or malformed intent authority blocks the whole transaction. Every active/manual/partial/unsafe-failed voice operation blocks. Failed operations remain blocked because the persisted, already-scrubbed account Provider/Storage locators cannot uniquely prove complete coverage. Valid completed/verified/scrubbed operations use their existing `completed_at + 90 days` audit expiry: expired parents are deleted with target CASCADE, while unexpired operation and target owners become `NULL` and the safe audit survives.

Expired quota rows are deleted at the fixed transaction timestamp. Unexpired rows keep the original expiry and classification fields while owner, subject/target identifiers, idempotency/dedupe keys, fingerprint, Provider request ID, and metadata are atomically scrubbed; `identifier_scrubbed_at` is set in the same update.

The current request and its scrubbed Provider/Storage evidence are retained with owner authority for the later Auth stage. Current request metadata is normalized to `{}`. Safely classified cancelled/expired prior requests are deleted with their child evidence; active, failed, manual, leased, or inconsistent prior authority blocks. Before deletion, terminal prior Provider and Storage evidence now explicitly requires `not_needed` with zero parent/actual/verified targets or `succeeded` with a positive equal parent/actual/verified target count, plus verified-absent, scrubbed, failure-cleared target shape and canonical parent markers. Contradictory prior evidence blocks before mutation and is retained for investigation.

## D/A/R and terminal authority

The exact persisted equation is `observed = D + A + R`:

- `D`: explicit deletes, CASCADE children, expired voice/quota rows, terminal intents, and eligible prior request/evidence rows.
- `A`: unexpired quota rows and unexpired completed voice audit operation/target rows anonymized by this transaction.
- `R`: the current request plus its already-scrubbed Provider and Storage target evidence.

`not_needed` is permitted only when `D=0` and `A=0`; `R` may be positive. `succeeded` requires `D+A>0`. Counts are checked against the PostgreSQL integer range and persisted with the exact inventory version and `db_sub_finalized_at` only after reinventory succeeds.

The full valid runtime fixture is `observed=26`, `D=17`, `A=3`, `R=6`. The zero-work fixture is `observed=1`, `D=0`, `A=0`, `R=1` and returns `not_needed`; positive retained evidence is therefore valid for `not_needed`.

Migration `0025` replaces the temporary G5D-2H deny trigger with permanent shape/transition/immutability protection. It revokes broad `UPDATE` on `account_deletion_requests` and grants `service_role` an explicit non-DB-terminal column list, excluding all seven focused DB terminal/evidence columns. The finalizer and permanent terminal authority do not use caller booleans, request metadata flags, `current_setting`, or `set_config`.

## Narrow writer fence

The repo-wide production writer audit identified the post-Storage gaps and added user-scoped triggers for profile creation/upsert, script insert, processing consent, quota events, saved model/best rows, weak words, coach feedback, new voice deletion operations, and new voice deletion targets. Each trigger takes the existing user-scoped transaction advisory lock before checking terminality, so a writer that began immediately before Storage terminality must commit first and becomes visible to the later DB inventory; a writer ordered after terminality fails closed. Existing Storage/voice fences continue to own takes, script audio, voice, voice consent, script source changes, and writer-intent reservation. Canonical finalizer deletes and exact quota/voice anonymization remain allowed.

## Isolated PostgreSQL proof

A fresh disposable local Supabase stack applied migrations `0001` through `0025` without a manual patch. `scripts/g5d-2j-isolated-postgres-runtime-proof.sql` returned:

`G5D_2J_ISOLATED_POSTGRES_RUNTIME_PROOF_PASS`

The actual proof covered:

- exact migration history and 18-table catalog;
- RPC owner, `SECURITY DEFINER`, fixed search path, exact EXECUTE ACL, permanent trigger mode/source, terminal-column ACL, and 12 focused trigger attachments;
- exact Provider and Storage transition RPCs after the new ACL;
- all ten new writer-fence surfaces after persisted Storage terminality, plus an independent-session writer begun immediately before terminality whose commit completed before Storage terminal persistence and was then included in DB inventory;
- cross-user input rejection before mutation and representative User B explicit/cascade/quota/voice rows unchanged with an exact pre/post checksum match;
- a full 18-class User A fixture producing `observed=26`, `D=17`, `A=3`, `R=6`, then exact delete/CASCADE/anonymize/retain post-state;
- response-loss replay returning the same counts with `already_finalized=true`;
- zero-work `not_needed` with `observed=1`, `D=0`, `A=0`, `R=1`, plus replay;
- the exact former P1-1 reproduction: after valid zero-work commit, a proof-only owned script was introduced; replay failed closed, the corrupt script survived, terminal evidence was byte-for-byte unchanged, replay product mutation was zero, and User B remained unchanged;
- a terminal request's retained current Provider evidence was proof-only corrupted; replay failed closed with the target and terminal evidence unchanged;
- prior Provider and prior Storage `not_needed`/nonzero target polarity corruptions each blocked before deletion, product mutation, or DB terminal persistence;
- valid prior Provider/Storage `not_needed`/zero and `succeeded`/nonzero verified/scrubbed combinations remained deletable with `observed=6`, `D=5`, `A=0`, `R=1`;
- Provider nonterminal, Provider terminal-count drift, Storage nonterminal, and Storage terminal-count drift rejection with product mutation and terminal persistence both zero;
- reserved/manual write intents and pending/processing/partial-failure/manual/failed/invalid-completed voice operations all blocking with product mutation and terminal persistence zero;
- an injected late profile-delete failure rolling back product delete, quota scrub, and terminal evidence, followed by a successful safe retry;
- two independent PostgreSQL finalizer sessions yielding one mutation and one already-finalized result, while a target-user late insert failed and unrelated User B wrote successfully.

The corruption fixtures deliberately bypassed triggers with `session_replication_role=replica` only inside the disposable proof database to construct proof-only inconsistent persisted/post-terminal state. No production bypass or debug path was added. Proof-only persistent trigger helpers were dropped, and the complete disposable stack is removed after validation.

`supabase db lint --local --level warning --fail-on warning` returned zero findings.

## Focused and regression validation

- workspace guard: PASS
- clean `0001` through `0025` apply: PASS
- isolated PostgreSQL runtime proof: PASS
- schema lint at warning/fail-on-warning: PASS, zero findings
- G5D-2J focused finalizer contract: PASS, 11/11 tests, including computed migration bytes SHA = expected SHA = result-document SHA and drift detection for both migration bytes and result-document SHA
- G5D-2H DB foundation regression: PASS, 7 tests
- legacy DB cleanup guard: PASS, mutation zero
- Provider durable regression: PASS, 24 tests
- Storage durable/writer regressions: PASS, 18 tests
- root lint: PASS, zero warnings/errors
- root typecheck: PASS
- Mobile source/test typecheck and lint: PASS
- production build: PASS
- final `git diff --check`: PASS

No live Provider, Storage, Auth, Canonical Staging, or Production call/mutation was made. Actual Staging cleanup is zero and the destructive guard remains disabled.

## Migration identity

Exact migration: `supabase/migrations/0025_g5d_2j_atomic_db_finalizer.sql`

SHA-256: `8dcee3373fa67edcbbf9356d708c6d3a722b2f916cfd4659198238a750934814`

The worktree migration bytes, the Git-intended bytes, and the migration applied by the disposable runtime proof are the same file and hash. Canonical Staging deployed history remains exact migrations `0001` through `0024`; repository migration `0025` remains unapplied and is the next controlled Staging migration. The former pre-remediation hash is not current authority.

## Findings and next action

Final findings are `P0=0 / unresolved correctness P1=0 / P2=0 / correctness UNKNOWN=0`. The final independent review is accepted and G5D-2J is `CLOSED_COMMITTED_PASS`.

- P1-1 already-finalized fail-closed replay validation: `CLOSED`
- P1-2 prior Provider/Storage evidence polarity: `CLOSED`
- P2-1 migration SHA focused-test coverage: `CLOSED`

Unfinished and intentionally outside this closeout are migration `0025` Canonical Staging apply, DB canonical operator wiring, Auth deletion/recovery, completion, future expiry purge, and live account deletion proof. DB push, Staging mutation, Production access, actual DB cleanup, DB operator wiring, Auth/completion, Provider/Storage external calls, and destructive guard enablement are all `0` in this closeout. G5D-2 and Gate 5 remain `OPEN`.

Exact next action:

`G5D_2K_MIGRATION_0025_CONTROLLED_STAGING_APPLY_AND_NON_DESTRUCTIVE_SMOKE`
