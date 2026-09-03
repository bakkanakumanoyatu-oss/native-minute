# G5D-2L DB Finalizer Canonical Operator Wiring and Fake Proof

Recorded: 2026-09-03

Mode: `G5D_2L_FINAL_AUTHORITY_CLOSEOUT_COMMIT_AND_PUSH_V1`

Status: `CLOSED_COMMITTED_PASS`

Final authorities accepted: `G5D_POST_2K_DB_OPERATOR_NEXT_UNIT_RECONCILIATION_PASS`, `G5D_2L_DB_FINALIZER_CANONICAL_OPERATOR_WIRING_AND_FAKE_PROOF_IMPLEMENTED_PENDING_REVIEW`, and independent verdict `G5D_2L_DB_FINALIZER_CANONICAL_OPERATOR_WIRING_INDEPENDENT_READ_ONLY_FOCUSED_REVIEW_PASS`. G5D-2G, G5D-2J, and G5D-2K remain closed authorities.

This focused unit connects the committed atomic database finalizer to the canonical account-deletion operator. It does not change migration/schema/generated DB types, duplicate the 18-table finalizer, connect Auth/completion, enable the destructive guard, invoke the real finalizer, or mutate Canonical Staging/Production. G5D-2 and Gate 5 remain `OPEN`.

## Preflight

- Root and Git root: `/Users/karasawatakahiro/Developer/native-minute`.
- Branch: `codex/g3-mobile-main-loop`.
- HEAD/upstream: `bde2d55d92823d81b2a7f2064b25cd29ccc827f4`.
- Tracked worktree was clean; only allowed untracked `supabase/.temp/` existed.
- Initial workspace guard and `git diff --check`: PASS.
- Actual process destructive guard: unset.

## Canonical stage routing and boundary

The explicit routing is now:

`status/summary -> read-only resolver`

`provider -> Provider resolver/service`

`storage -> Storage resolver/service`

`database -> Database resolver/service`

`auth/future/unknown -> unavailable, fail-closed`

Database is no longer routed through the Storage resolver fallback. The runner still dispatches exactly the single requested stage. Provider terminal does not call Storage in the same invocation; Storage terminal does not call Database in the same invocation; Database terminal does not call Auth in the same invocation. Auth and completion remain disconnected, with no legacy Auth fallback.

## Database resolver and persistent eligibility

The Database-specific resolver uses an exact UUID or opaque request reference with a two-row ambiguity bound and returns only the internal exact `userId + deletionRequestId` pair. Resolver and stage service both require persisted authority.

Minimum prior-stage eligibility is:

- exact owned request identity;
- request status `confirmed` or `db_cleanup_failed` for runnable nonterminal state;
- Provider `succeeded|not_needed` plus `provider_sub_finalized_at`;
- Storage `succeeded|not_needed` plus `storage_sub_finalized_at`;
- exact `g5d-2h.account-db.v1` inventory version;
- DB `pending|failed`, null DB sub-finalizer timestamp, and exact zero nonterminal counts; or a valid persisted terminal replay surface.

The `--prior-stage-satisfied` caller flag cannot establish this authority. The stage re-fetches by exact request and expected user before reaching the RPC, so cross-user or stale resolver input stops with finalizer invocation `0`.

The operator intentionally does not validate Provider/Storage target counts, fingerprints, leases, child evidence, the 18-table inventory, voice/write blockers, writer fences, or D/A/R post-state inventory. Those remain exclusively owned by the G5D-2J RPC.

## Server-only finalizer wrapper

`account-deletion-database-finalizer.repository.ts` is server-only and contains one mutation call:

`finalize_account_deletion_database_stage(p_deletion_request_id, p_expected_user_id, p_expected_db_inventory_version)`

The version is exact `g5d-2h.account-db.v1`. The wrapper performs no manual cleanup, table loop, retry, second finalizer call, direct terminal write, legacy DB call, Auth call, or completion call.

It requires exactly one result row with the committed seven fields. Status, boolean, safe reason, and all four counts are runtime validated; counts must be nonnegative safe integers. Zero/multiple rows, missing/wrong fields, fractions, unsafe integers, numeric strings, unknown statuses, and malformed safe reasons become a fixed unknown result. Supabase/PostgreSQL errors are discarded and cross only as a fixed blocked category.

## Result mapping and persisted terminal re-fetch

The safe terminal mappings are:

- first-call `succeeded` -> persisted re-fetch -> `succeeded / terminal`;
- first-call `not_needed` -> persisted re-fetch -> `not_needed / terminal`;
- `already_finalized=true` -> persisted re-fetch -> persisted `succeeded|not_needed / terminal`.

The post-RPC exact owned row must retain Provider and Storage terminality and must have:

- request `status=confirmed`;
- cleared failure stage/reason;
- matching terminal DB status;
- exact inventory version;
- valid `db_sub_finalized_at`;
- `last_attempted_at = db_sub_finalized_at`;
- empty metadata;
- safe persisted observed/D/A/R matching the returned evidence;
- `observed = D + A + R`;
- `not_needed => D=0 and A=0`;
- `succeeded => D+A>0`.

Failure of this persisted surface is `manual_required / database_terminal_authority_missing / marker=unknown / terminal=false`. The operator does not rerun the 18-table, quota, voice, or child-target validation performed transactionally by the RPC.

## Unknown, exception, accounting, and redaction

A rogue runtime result or exception maps to fixed `manual_required / database_stage_result_unknown / marker=unknown / terminal=false`, with `dbOutcomeUnknown=1`. No raw object, database error, SQLSTATE detail, row, table diagnostic, ID, stack, token, or secret is returned.

At the wrapper invocation boundary, the operator records:

- `dbFinalizerInvocations=1`;
- `dbAttempted=1`;
- `destructiveOperationsAttempted=1`.

These remain `1` after rogue output, exception, malformed terminal evidence, or post-RPC re-fetch failure. Before the wrapper boundary they remain `0`. `dbTerminal` and `dbNonterminal` are separate numeric counters. Verified observed/D/A/R are returned only for a persisted terminal match; otherwise all four are `null`, never false zero.

The shared sanitizer continues to accept only nonnegative `Number.isSafeInteger` numeric counters. DB nullable evidence has an intentional `null` sentinel and is not confused with boolean progress fields.

## Focused injected-fake proof

`npm run account-deletion:operator:database-self-test` uses only injected local fakes and passes all required behavior, including:

1. Provider nonterminal -> Database resolver/service/finalizer `0`.
2. Provider terminal plus Storage nonterminal -> Database `0`.
3. Persisted Provider and Storage terminal -> Database eligible.
4. Caller prior-stage flag alone cannot authorize.
5. Persisted DB mismatch -> finalizer `0`.
6. Storage becomes terminal this invocation -> Database `0`.
7. Next invocation with persisted Storage terminal -> Database.
8. Database terminal -> same-invocation Auth `0`.
9. Wrapper exactly once.
10. Exact request/user/version arguments.
11. Legacy DB executor `0`.
12. Second wrapper mutation logic `0`.
13. `succeeded` -> persisted re-fetch.
14. `not_needed` -> persisted re-fetch.
15. `already_finalized` -> persisted re-fetch.
16. Invalid terminal parent -> fail-close.
17. D/A/R equation mismatch -> fail-close.
18. RPC/persisted terminal mismatch -> fail-close.
19. Rogue return -> manual unknown.
20. Exception -> manual unknown.
21. Observed invocation count remains `1`.
22. Destructive-attempt evidence remains `1`.
23. `dbOutcomeUnknown=1`.
24. Unverified observed/D/A/R remain `null`.
25. False-zero evidence `0`.
26. Raw return/error leakage `0`.
27. Auth service calls `0`.
28. Completion calls `0`.
29. Provider/Storage external calls `0`.
30. Real database finalizer RPC calls `0`.
31. Canonical Staging/Production mutations `0`.
32. Destructive guard remains disabled outside injected fake authority.

Additional explicit proofs cover User A/B isolation; zero/multiple/malformed wrapper rows; valid succeeded, not-needed, and already-finalized fixtures; missing DB timestamp; wrong inventory; Provider/Storage terminal drift; unsafe/null persisted counts; post-RPC re-fetch exception; safe-integer boundaries; explicit Database routing; and legacy/Auth static isolation.

## Validation

- workspace guard: PASS.
- focused Database operator fake proof: PASS.
- operator core self-test: PASS.
- Provider canonical operator regression: PASS.
- Storage canonical operator regression: PASS.
- Provider durable regression: PASS, 24/24.
- Storage durable/writer regression: PASS, 18/18.
- G5D-2J focused finalizer contract regression: PASS, 11/11.
- legacy DB durable guard: PASS.
- relevant account-deletion tests: PASS.
- root lint: PASS, zero warnings/errors.
- root typecheck: PASS.
- production build: PASS.
- final workspace guard and `git diff --check`: PASS.

Mobile source changes are `0`, so mobile-only lint/typecheck were not required. No G5D-2J PostgreSQL runtime proof was rerun because migration and SQL bytes are unchanged.

## Scope and findings

- Migration `0025` changes: `0`.
- Migration/schema/generated DB type changes: `0/0/0`.
- Canonical Staging remains `0001`–`0025` exact, pending `0`; no remote call or mutation was made.
- Real DB finalizer/Provider/Storage/Auth/completion calls: `0/0/0/0/0`.
- Legacy DB calls: `0`.
- Destructive guard enablement: `0`.
- P0/P1/P2/correctness UNKNOWN: `0/0/0/0`.
- Stop conditions encountered: `0`.
- G5D-2 and Gate 5: `OPEN`.

Final status:

`G5D-2L = CLOSED_COMMITTED_PASS`

The independent focused review is accepted with P0/unresolved correctness P1/P2/correctness UNKNOWN `0/0/0/0`. G5D-2 and Gate 5 remain `OPEN`. Auth deletion/recovery, completion, live Account deletion proof, and future expiry/purge/control work remain unfinished and are not claimed by this closeout.

Exact next one action, not started:

`G5D_POST_2L_AUTH_COMPLETION_NEXT_UNIT_RECONCILIATION`

That read-only reconciliation will determine dependencies for durable Auth deletion intent, exactly-once/bounded external Auth delete authority, exact absence verification, response-loss recovery, post-Auth request ownership/null lifecycle, completion finalization, and account-deletion audit retention, then select exactly one focused Auth/completion implementation unit.
