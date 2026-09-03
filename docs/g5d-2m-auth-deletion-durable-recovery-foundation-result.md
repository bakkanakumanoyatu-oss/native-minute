# G5D-2M Auth deletion durable recovery foundation final result

Date: 2026-09-03 (Asia/Tokyo)

Status: `CLOSED_COMMITTED_PASS`

## Scope and authority

This closeout accepts the full G5D-2M authority chain:

- `G5D_POST_2L_AUTH_COMPLETION_NEXT_UNIT_RECONCILIATION_PASS`
- `G5D_2M_AUTH_DELETION_DURABLE_RECOVERY_FOUNDATION_IMPLEMENTED_PENDING_REVIEW`
- `G5D_2M_AUTH_DELETION_DURABLE_RECOVERY_FOUNDATION_INDEPENDENT_READ_ONLY_FOCUSED_REVIEW_NOT_PASS`
- `G5D_2M_AUTH_VERIFICATION_BINDING_UNKNOWN_RECOVERY_AND_REDACTION_REMEDIATED_PENDING_REVIEW`
- `G5D_2M_AUTH_VERIFICATION_BINDING_UNKNOWN_RECOVERY_AND_REDACTION_INDEPENDENT_FOCUSED_REVIEW_NOT_PASS`
- `G5D_2M_SERVICE_ROLE_REPOSITORY_SELECT_ACL_REMEDIATED_PENDING_REVIEW`
- `G5D_2M_SERVICE_ROLE_REPOSITORY_SELECT_ACL_INDEPENDENT_FOCUSED_REVIEW_PASS`

The final independent PASS closes P1-4 without reopening P1-1 current-verification/dispatch binding, P1-2 malformed-DELETE unknown recovery, or P1-3 fixed reason sanitizer. All four P1 dispositions are `CLOSED`; final P0/unresolved correctness P1/P2/correctness UNKNOWN is `0/0/0/0`.

The final P1-4 correction restores the table-level `SELECT` authority required by the existing server-only durable repository to `service_role` after the application-role revoke. This is repository authority, not application exposure. The repository, runner, adapter, Provider/Storage/Database paths, Completion boundary, and canonical operator wiring are unchanged by closeout.

The durable contract has one version only: `g5d-2m.auth-delete.v1`. It is shared by migration SQL, the server-only repository, runner, focused tests, and this result. Canonical order remains `Provider -> Storage -> Database -> Auth -> Completion`; G5D-2M implements only the Auth durable foundation. Auth canonical operator is `NOT WIRED`, and Completion is `NOT IMPLEMENTED`. Migration `0026_g5d_2m_auth_deletion_durable_recovery_foundation.sql` was corrected in place before final review; no `0027` exists. Its final SHA-256 is `4c9a34ddb0ded45e02edd345fb0dcebd171cb5aaa5866b5c9ea5b9146e312b81`, also pinned by the focused byte-level test. Prior `0026` hashes beginning `8d6017` and `ae0fb7` are not current authority. Migration `0025` remains byte-exact at SHA-256 `8dcee3373fa67edcbbf9356d708c6d3a722b2f916cfd4659198238a750934814`.

## Persisted authority

Migration `0026` adds the following focused authority to `account_deletion_requests`:

- `auth_intent_version`
- `auth_delete_target_user_id`
- `auth_delete_generation`
- `auth_delete_requested_at`
- `auth_verification_attempt_count`
- `auth_verification_result`
- `auth_verification_result_attempt_count`
- `auth_verified_absent_at`
- `auth_sub_finalized_at`

`auth_delete_target_user_id` deliberately has no FK to `auth.users`. The seal RPC locks the exact deletion request, requires a non-null persisted owner equal to the expected owner, validates terminal Provider/Storage/Database evidence, and copies the persisted `request.user_id`; a caller cannot substitute another target. The target survives the external owner deletion and is scrubbed only by the Auth sub-finalizer.

`auth_verification_result` is a protected current authority with only `present | absent | unknown`, paired with the exact positive `auth_verification_result_attempt_count`. Beginning attempt `N+1` increments the count exactly once and clears both fields, so attempt `N` evidence cannot be reused. Recording requires the exact request, durable target, intent version, and current attempt; stale/future attempts, wrong targets/versions, terminal rows, and duplicate conflicting records are rejected. Adapter normalization is the only source: exact matching GET user becomes `present`, strict `null + numeric 404 + user_not_found` becomes `absent`, and every other accepted safe GET category becomes `unknown`.

Exact checks cover no-intent, sealed/nonterminal, and terminal shapes. They reject partial result/binding pairs, a binding beyond the current attempt, and terminal retention of transient verification evidence. Generation is limited to `0` or `1`; verification attempts are nonnegative and monotonic. Terminal polarity is exact: generation `0` becomes `not_needed`, generation `1` becomes `succeeded`. Both require current strict `absent` evidence, `request.user_id IS NULL`, cleared failure state, and `auth_sub_finalized_at`; the sub-finalizer atomically clears both current-result fields and scrubs the temporary target.

## Focused transactional surface

The existing six narrow `SECURITY DEFINER` RPCs remain the whole surface: seal intent, begin a verification attempt, record its safe result, authorize delete generation by CAS, record a safe delete outcome, and sub-finalize Auth. They are owned by `postgres`, use fixed `pg_catalog, public` search paths, and are executable only by `service_role`. `PUBLIC`, `anon`, and `authenticated` have no execute authority. No caller boolean, metadata flag, GUC, `current_setting`, `set_config`, debug bypass, seventh RPC, history table, or generic retry engine is used.

Direct writes to all nine durable Auth columns and terminal `auth_cleanup_status` evidence are excluded from service-client update authority. The transition trigger enforces one-way generation `0 -> 1`, immutable intent/target until focused finalization, sticky manual state, verification count `+1`, and immutable terminal evidence. Application roles cannot select the recovery target or current verification authority; authenticated status access is an explicit safe-column list.

Migration `0026` explicitly grants table `SELECT` on `account_deletion_requests` to `service_role`, matching the existing repository's `REQUEST_SELECT` query. It does not grant table `SELECT` to `PUBLIC`, `anon`, or `authenticated`; authenticated retains only the pre-existing safe-column list. No `INSERT`, `DELETE`, or protected direct `UPDATE` privilege was added, and focused RPC mutation authority is unchanged.

The delete-dispatch RPC re-locks the exact request and requires the exact durable target/version, exact current verification count, a result binding equal to that count, persisted `present`, canonical nonterminal state, generation `0`, and still-valid Provider/Storage/Database prerequisites. Its one transaction changes generation `0 -> 1` and clears the current `present` result plus binding. Missing, `unknown`, `absent`, stale, or already-consumed evidence returns no authorization; concurrent callers have exactly one winner.

The Auth sub-finalizer re-locks the request and requires the exact intent/version, expected generation/count, current `absent` result bound to that count, owner-null lifecycle, and still-valid persisted Provider/Storage/Database terminal evidence. It clears transient failure state and current verification fields, writes Auth terminal evidence, and scrubs the target in one transaction. It does not write `status=completed`, `completed_at`, `expires_at`, or any completion marker.

## Strict Auth protocol and bounded runner

The injected adapter treats GET as absent only for the exact conjunction `data.user === null`, HTTP status `404`, and error code `user_not_found`. A successful GET is present only when one returned user has the exact durable target ID. Null-on-200, mismatch, malformed responses, permissions, throttling, 5xx, network errors, and timeouts never establish absence.

DELETE 2xx and exact 404 are observations only; both require a later strict GET. Permissions become safe manual state. Throttling, 5xx, network errors, timeouts, and malformed/impossible responses all preserve generation `1`, the target, and an unknown recoverable nonterminal outcome. Malformed DELETE alone no longer creates sticky manual state or terminal evidence. The next invocation starts with GET and performs no automatic redispatch; verified absence can recover, while generation `1` plus verified present then becomes sticky manual.

Every runner `safeReasonCode` passes through one fixed Auth-specific allowlist. Recognized fixed reasons survive; null remains only for successful terminal results; every unrecognized or missing failure reason becomes the literal `auth_stage_reason_unknown`. Original persisted text is never interpolated into the fallback. Raw Auth responses, errors, user objects, identities, contact data, tokens, stack traces, SQL/detail text, rogue persisted reasons, and request/target UUIDs do not enter safe output or runner logs.

Each injected fake-only runner invocation performs at most two GETs and one DELETE and is always GET-first. Its sequence is `begin verification -> Auth GET -> normalize -> record exact current result`; only a recorded current-attempt `present` with generation `0` may win the transactional `0 -> 1` CAS and dispatch once. Generation `1` can never authorize another automatic DELETE. The dispatch counter is crossed before calling the adapter, so exception/response loss retains `authDeleteDispatches=1`, `authAttempted=1`, and `destructiveOperationsAttempted=1`.

If generation is durably `1` but the process crashes before transmission, the next invocation still performs GET first. Verified absence can recover with DELETE `0`; a still-present user becomes sticky `manual_required`, also with DELETE `0`. Safety therefore closes blind redispatch at the deliberate cost of manual intervention in the ambiguous CAS-before-transmission window.

Lookup continues after owner null by exact deletion-request UUID or the existing opaque `adr_...` reference. It never depends on `request.user_id`, and the target remains server-only until sub-finalization.

## Legacy and completion boundaries

`runSupabaseAuthDeletionActual` now returns `auth_durable_authority_required` before its permissive legacy dry-run lookup, `deleteUser`, legacy completed write, or completion chain. Legacy code is retained but cannot remain a parallel mutation path.

The durable runner is dependency-injected and is not imported by the canonical operator. It does not instantiate a real Auth admin adapter. Terminal Auth results make zero Completion calls in the same invocation. It never writes completed status, `completed_at`, `expires_at`, or a completion terminal marker. Provider/Storage external calls, Database finalizer calls, real Auth GET/DELETE, Staging/Production mutation, and destructive-guard enablement are all outside this unit and remained zero.

## Behavioral fake proof

`npm run account-deletion:auth-durable:self-test` passes 35 focused tests. The proof covers:

- Provider, Storage, and Database nonterminal rejection before intent/GET/DELETE;
- persisted-owner sealing, caller substitution rejection, idempotent replay, and owner-null-before-intent rejection;
- every required GET and DELETE response category, strict absence, exact present identity, malformed/mismatch fail-close, and mandatory post-DELETE GET;
- dispatch rejection without a recorded result, with current `unknown`, with current `absent`, and after a newer begin clears stale `present`;
- current-attempt `present` one-winner CAS, atomic evidence consumption, replay rejection, generation-1 no-redispatch, response-loss recovery, sticky generation-1-plus-present manual state, and monotonic verification attempts;
- malformed DELETE as recoverable unknown, next-invocation GET-first absent recovery, next-invocation present-to-manual behavior, and raw malformed payload non-leakage;
- a persisted rogue reason containing UUID-like, SQL/detail, and fake-secret markers mapping only to `auth_stage_reason_unknown`, with a serialized result/log scan showing zero marker leakage;
- owner-null finalization, exact polarity, target scrubbing, terminal replay, post-owner-null lookup, User A/B isolation, redaction, focused repository RPC use, migration boundary, and generated type surface;
- `completionCalls=0` and no real external client construction.

Provider durable, Storage durable, Database foundation/finalizer, all three canonical operator regressions, canonical operator core, and legacy Provider/Storage/Database/Auth guards pass separately. Migration `0025` remains byte-unchanged at SHA-256 `8dcee3373fa67edcbbf9356d708c6d3a722b2f916cfd4659198238a750934814`.

## Isolated PostgreSQL proof

A fresh disposable local Supabase/PostgreSQL stack applied clean migrations `0001` through the corrected `0026` and returned `G5D_2M_ISOLATED_POSTGRES_RUNTIME_PROOF_PASS`. `supabase db lint --local --level warning --fail-on warning` returned no findings. Under an actual `SET ROLE service_role`, the complete repository `REQUEST_SELECT` column list—including `auth_delete_target_user_id`, `auth_verification_result`, and `auth_verification_result_attempt_count`—selected the exact fixture successfully. Actual protected-column selects under `anon`, `authenticated`, and a PUBLIC-only probe role each failed with SQLSTATE `42501`. The `PUBLIC`/`anon`/`authenticated`/`service_role` protected direct-UPDATE matrix was `0/40`, and an actual service-role protected update also failed with `42501`. The stack and data volumes were stopped without backup; its temporary workdir was moved to Trash after proof.

The actual PostgreSQL proof validates exact 26-migration history/catalog, five Auth state constraints, no target FK, all nine protected columns, table/RPC ACLs, RLS-compatible service authority, the repository's real service-role SELECT, application-role negative SELECT, six fixed RPCs with `postgres` ownership and fixed search paths, direct protected-column denial, terminal immutability, and User A/B isolation. It rejects result-without-binding, binding-without-result, future binding, wrong target, stale/future attempt, duplicate conflicting record, terminal record, and terminal retention of transient evidence.

The P1-1 negative matrix is executed against real PostgreSQL: begin-without-result rejects dispatch; current `unknown` rejects; current `absent` rejects; attempt `N+1` begin clears attempt `N` `present` and stale dispatch rejects; current attempt `present` wins once; replay rejects; and two independent sessions racing the same current-present authority produce exactly one winner. The winning transaction leaves generation `1` and atomically clears both current-result fields. An actual malformed dispatch outcome persists `failed / auth_delete_malformed_outcome_unknown`, generation `1`, retained target, null sub-finalizer, and no terminal state.

Separate fixtures preserve generation-0 `not_needed`, generation-1 `succeeded`, owner-nonnull absence rejection, ambiguous generation-1-plus-present sticky manual behavior, and rejection when each Provider/Storage/Database prerequisite is corrupted.

The owner lifecycle proof uses only a disposable local `auth.users` row deletion to simulate external Auth hard deletion. Before it, product data is already absent as required by the DB-terminal contract. After it, the deletion request and opaque reference remain, `request.user_id` becomes null, Provider/Storage owned evidence becomes owner-null, safe quota/voice audit evidence remains owner-null, and the durable Auth target remains. Focused Auth sub-finalization then scrubs only the target while retaining verified/sub-finalized evidence. Overall request status remains `confirmed`; `completed_at` and `expires_at` remain null.

## Validation and boundaries

Passed on the current corrected bytes before handoff:

- workspace guard and diff checks;
- focused Auth fake proof `35/35`, including the new service-role SELECT grant and updated migration SHA assertion;
- clean isolated PostgreSQL `0001 -> 0026` apply, runtime proof, and schema lint;
- account-deletion focused regressions `7` files / `105` tests: Auth durable `35/35`, Provider durable `24/24`, Storage durable `13/13`, Database foundation `7/7`, Database finalizer `11/11`, and domain/route `15/15`;
- legacy Auth durable-authority fail-close and Provider/Storage/Database canonical operator fake regressions;
- root lint with zero warnings/errors;
- migration SHA synchronization, exact unchanged `0025` SHA, final workspace/status, and `git diff --check`.

Production TypeScript implementation bytes were unchanged by this ACL-only correction. The immediately preceding accepted authority's root/mobile type checks, mobile lint, production build, generated schema/type comparison, complete mobile suite, operator rehearsal/proof package, and other unchanged Provider/Storage/Database regressions were reused rather than rerun.

Final closeout re-ran `npm run check:workspace`, focused Auth `35/35`, all relevant account-deletion tests `7` files / `105` tests, the legacy Auth durable-authority guard, G5D-2J focused contract `11/11`, `git diff --check`, and an independent migration SHA calculation; all passed. SHA checks across the migration, source, tests, generated DB types, proof script, legacy guard, and package manifest matched their pre-closeout values exactly, so closeout changed only final documentation bytes. The accepted independent PostgreSQL, Provider `24/24`, Storage durable/writer `18/18`, DB foundation `7/7`, lint, typecheck, build, and full mobile-suite authorities were reused as allowed for unchanged technical bytes.

Canonical Staging remains the previously established `0001`–`0025` exact state, with repo migration `0026` pending and unapplied. Closeout performed no `db push`, remote migration/status mutation, real Supabase Auth GET/DELETE, Production action, Provider/Storage action, DB-finalizer execution, Completion, or destructive-guard enablement. `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE` remained unset.

P1 dispositions:

- P1-1 GET-result/dispatch binding: `CLOSED`.
- P1-2 malformed DELETE recoverable unknown: `CLOSED`.
- P1-3 safeReasonCode redaction: `CLOSED`.
- P1-4 service-role repository SELECT authority: `CLOSED`.

Final state is P0/unresolved correctness P1/P2/correctness UNKNOWN: `0/0/0/0`. G5D-2M is `CLOSED_COMMITTED_PASS`; G5D-2 and Gate 5 remain `OPEN`. Still incomplete are migration `0026` Canonical Staging apply, Auth canonical operator wiring, Completion, connected non-live account-wide proof, separately Human-authorized live disposable Staging proof, and Gate 5 final closeout.

## Exact next action

`G5D_2N_MIGRATION_0026_CONTROLLED_STAGING_APPLY_AND_NON_DESTRUCTIVE_SMOKE`

Do not start G5D-2N in this unit. G5D-2N is limited to exact Canonical Staging identity and `0001`–`0025` pre-history verification, applying `0026` exactly once, RPC/catalog/ACL/constraint checks, service-role repository SELECT, application protected SELECT and protected UPDATE denials, and zero application-row mutation. It performs no real Auth GET or DELETE.
