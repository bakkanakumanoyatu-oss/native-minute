# G5D-2N Migration 0026 Controlled Staging Apply and Non-Destructive Smoke

Recorded: 2026-09-03 (Asia/Tokyo)

Mode: `G5D_2N_MIGRATION_0026_CONTROLLED_STAGING_APPLY_AND_NON_DESTRUCTIVE_SMOKE_V1`

Closeout mode: `G5D_2N_FINAL_AUTHORITY_DOCS_CLOSEOUT_COMMIT_AND_PUSH_V1`

Status: `CLOSED_COMMITTED_PASS`

Authority: `G5D_2M_FINAL_AUTHORITY_CLOSEOUT_COMMITTED_AND_PUSHED_PASS` at source `b59a7f5b61b63cacee7fd466ce13a8c594038c21`.

Accepted authorities:

- `G5D_2N_MIGRATION_0026_CONTROLLED_STAGING_APPLY_AND_NON_DESTRUCTIVE_SMOKE_PASS_PENDING_REVIEW`;
- `G5D_2N_STAGING_APPLY_AND_NON_DESTRUCTIVE_SMOKE_INDEPENDENT_READ_ONLY_REVIEW_PASS`.

The independent review is accepted as final authority with P0/unresolved correctness P1/P2/correctness UNKNOWN `0/0/0/0` and closeable `YES`. G5D-2N is `CLOSED_COMMITTED_PASS`. This unit applied the exact committed migration `0026` once to Canonical Staging and verified its deployed schema, function definitions, ACL, RLS-compatible repository authority, and application-row mutation-zero boundary. It did not call any focused mutation RPC, Supabase Auth GET/DELETE, Provider/Storage external path, DB finalizer, or Completion path. Auth canonical operator is `NOT WIRED`, Completion is `NOT IMPLEMENTED`, and G5D-2 and Gate 5 remain `OPEN`.

## Preflight and Canonical Staging identity

- Workspace and git root: `/Users/karasawatakahiro/Developer/native-minute`.
- Branch: `codex/g3-mobile-main-loop`.
- HEAD/upstream: `b59a7f5b61b63cacee7fd466ce13a8c594038c21` / exact match.
- Tracked worktree was clean; only allowed untracked `supabase/.temp/` existed.
- Initial `npm run check:workspace` and `git diff --check`: PASS.
- Actual project-list identity: `native-minute-staging` / `ztlliqishddrrvqqrrlu` / `ap-northeast-1` / `ACTIVE_HEALTHY`.
- Linked ref: `ztlliqishddrrvqqrrlu`; ambiguity `0`.
- Production connection/mutation: `0/0`.
- `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE`: unset; guard enablement `0`.

## Migration identity, semantic audit, and controlled apply

Exact file: `supabase/migrations/0026_g5d_2m_auth_deletion_durable_recovery_foundation.sql`.

- Git tracked/current HEAD/worktree-to-object identity: PASS.
- Worktree and HEAD-object SHA-256: `4c9a34ddb0ded45e02edd345fb0dcebd171cb5aaa5866b5c9ea5b9146e312b81`.
- G5D-2M result/focused authority SHA match: PASS.
- Migration `0025` worktree/HEAD-object SHA-256 remains `8dcee3373fa67edcbbf9356d708c6d3a722b2f916cfd4659198238a750934814`.

The top-level semantic audit found only the intended Auth durable columns and checks, one protection trigger/helper, one prior-stage predicate, six focused RPCs, function ownership/ACL, protected table-column ACL, and comments. Application-data `UPDATE` statements occur only inside uncalled focused function bodies. Top-level application `INSERT`/`UPDATE`/`DELETE`, new table/schema, Auth user deletion, product cleanup, request completion, Provider/Storage/DB mutation, quota/voice purge, external API call, generic workflow/queue/history creation, and Completion assignments were absent.

Pre-apply remote history was exactly contiguous `0001`–`0025`: `0025` appeared exactly once, `0026` was absent, missing/future/unknown were `0/0/0`, and the only pending migration was `0026`.

The official linked dry-run with vault changes skipped listed only `0026_g5d_2m_auth_deletion_durable_recovery_foundation.sql`; seeds, roles, vault work, `0027+`, and unrelated migrations were `0`.

The normal supported linked command applied `0026` once:

`npx --no-install supabase db push --linked --skip-vault --yes`

No manual SQL patch, migration repair, squash, manual catalog/ACL repair, seed, role or vault change, second apply, or Production connection was used.

Post-apply remote history is exactly contiguous `0001`–`0026`, with `0026` exactly once and pending/missing/future/unknown `0/0/0/0`. The official post-apply dry-run returned `Remote database is up to date`, with migrations, seeds, and roles all empty.

## Safe pre/post application-data evidence

Only counts and server-side aggregate fingerprints were returned. No raw user/request/target UUID, email, metadata, content, storage locator, or row payload was retrieved. The count and fingerprint matched before and after for every table:

| `g5d-2h.account-db.v1` table | Pre | Post | Fingerprint |
| --- | ---: | ---: | --- |
| `account_deletion_provider_targets` | 0 | 0 | match |
| `account_deletion_requests` | 0 | 0 | match |
| `account_deletion_storage_targets` | 0 | 0 | match |
| `coach_feedback` | 5 | 5 | match |
| `processing_consents` | 12 | 12 | match |
| `profiles` | 40 | 40 | match |
| `quota_events` | 10 | 10 | match |
| `script_audios` | 3 | 3 | match |
| `script_saved_best_takes` | 1 | 1 | match |
| `script_saved_model_audios` | 0 | 0 | match |
| `scripts` | 9 | 9 | match |
| `takes` | 5 | 5 | match |
| `voice_asset_write_intents` | 27 | 27 | match |
| `voice_consents` | 11 | 11 | match |
| `voice_deletion_operations` | 21 | 21 | match |
| `voice_deletion_targets` | 11 | 11 | match |
| `voices` | 3 | 3 | match |
| `weak_words` | 17 | 17 | match |

Pre/post request aggregates were both zero for total, terminal, nonterminal, owner-null, every Auth cleanup status, and Provider/Storage/DB terminal status. Post-apply non-default Auth durable rows were also zero. Because no account deletion request existed, the migration's no-intent defaults/backfill shape is vacuously safe; no owner, target, generation, verification, prior-stage, terminal, quota, or voice state changed. Application-row mutation is `0`.

## Durable schema and constraints

Actual Canonical Staging contains all nine exact columns:

| Column | Type | Nullable | Default |
| --- | --- | --- | --- |
| `auth_intent_version` | `text` | yes | none |
| `auth_delete_target_user_id` | `uuid` | yes | none |
| `auth_delete_generation` | `integer` | no | `0` |
| `auth_delete_requested_at` | `timestamp with time zone` | yes | none |
| `auth_verification_attempt_count` | `integer` | no | `0` |
| `auth_verification_result` | `text` | yes | none |
| `auth_verification_result_attempt_count` | `integer` | yes | none |
| `auth_verified_absent_at` | `timestamp with time zone` | yes | none |
| `auth_sub_finalized_at` | `timestamp with time zone` | yes | none |

`auth_delete_target_user_id` participates in zero foreign keys, including zero FK to `auth.users`. This preserves the temporary target after Auth hard deletion until focused sub-finalization.

All five focused CHECK constraints are present, type CHECK, and validated: generation `0/1`, nonnegative attempt count, result enum, exact current result/attempt binding, and the composite no-intent/sealed/terminal durable shape. Their actual definitions retain current-result pairing, terminal strict absence, owner-null, target scrub, and generation/status polarity; no weakening was observed. PostgreSQL canonicalizes the 64-byte result-binding identifier to its expected 63-byte catalog name.

The exact `BEFORE INSERT OR UPDATE` Auth durable protection trigger is present once, enabled, and attached to `enforce_account_deletion_auth_durable_authority()`.

## Focused RPC and definition authority

Actual catalog contains exactly six focused RPCs, one overload each:

- `seal_account_deletion_auth_intent(uuid,uuid,text)`;
- `begin_account_deletion_auth_verification_attempt(uuid,uuid,text,integer)`;
- `record_account_deletion_auth_verification_result(uuid,uuid,text,integer,text)`;
- `authorize_account_deletion_auth_delete_dispatch(uuid,uuid,text,integer)`;
- `record_account_deletion_auth_dispatch_outcome(uuid,uuid,text,text)`;
- `finalize_account_deletion_auth_stage(uuid,text,integer,integer)`.

For all 6/6: owner is `postgres`, mode is `SECURITY DEFINER`, fixed config is exact `search_path=pg_catalog, public`, `service_role` EXECUTE is true, and `PUBLIC`/`anon`/`authenticated` EXECUTE is false. Missing names, unexpected overloads, and unexpected Auth-named functions are `0/0/0`.

The deployed `prosrc` SHA-256 for the six RPCs plus the prior-stage helper and transition trigger helper matched byte-for-byte against bodies extracted from committed migration `0026`: `8/8`, mismatch `0`. This is the definition-integrity authority for the actual deployment. Across those eight functions, dynamic `EXECUTE`, GUC/replication-role authorization, boolean caller arguments, and debug/backdoor tokens were all `0`.

The actual dispatch definition requires exact current verification attempt, exact matching result-attempt, persisted result `present`, generation `0`, and still-valid prior-stage authority. Its update repeats all four CAS predicates; a successful CAS advances generation `0 -> 1` and atomically consumes the current `present` authority by clearing the result and result-attempt binding.

The actual sub-finalizer definition requires owner null, strict current `absent` bound to the expected attempt, Provider/Storage/Database terminal authority, exact generation/status polarity, and nonterminal request shape. It writes `auth_sub_finalized_at`, scrubs the target, and clears transient result/binding. Assignments to `status=completed`, `completed_at`, and `expires_at` are all absent.

## ACL and RLS authority

Actual `service_role` table-level SELECT on `public.account_deletion_requests` is true. The repository's exact `REQUEST_SELECT` projection is `49/49`, missing `0`. A read-only `SET LOCAL ROLE service_role` query compiled and selected that complete projection successfully; it returned only a zero row count and no raw content.

Protected SELECT across all nine durable Auth columns:

| Role | Selectable | Denied |
| --- | ---: | ---: |
| `PUBLIC` | 0 | 9 |
| `anon` | 0 | 9 |
| `authenticated` | 0 | 9 |
| `service_role` | 9 | 0 |

Authenticated retains exactly the intended 21 safe status columns: actual/expected `21/21`, missing/unexpected `0/0`. There is no table-wide authenticated SELECT grant.

Protected direct UPDATE across the nine durable columns plus terminal `auth_cleanup_status` is `0/40` for `PUBLIC`, `anon`, `authenticated`, and `service_role`; each role is denied all 10/10. The focused RPCs remain the only Auth durable mutation authority. The service role's committed non-protected update surface is exact `47/47`, missing/unexpected `0/0`, preserving intended Provider/Storage/request operator fields while excluding Auth durable and prior DB-terminal authority.

`account_deletion_requests` has RLS enabled and non-forced. `anon` and `authenticated` have no bypass-RLS capability. The only policy remains `account_deletion_requests_select_own`, `SELECT`, role `authenticated`, predicate `auth.uid() = user_id`; there is no application-role INSERT/UPDATE/DELETE policy. The existing Supabase base table grants therefore create no broad client row bypass. `service_role` retains its expected server bypass and repository/operator ACL. Migration `0026` contains no RLS/policy rewrite; RLS regression count is `0`.

## Public-table and legacy Auth boundaries

Actual public application tables are the exact 18-table `g5d-2h.account-db.v1` inventory. Missing/extra are `0/0`; generic workflow/queue/history tables are `0`.

Committed source still sets `LEGACY_AUTH_DELETION_DURABLE_AUTHORITY_REQUIRED = true`. `runSupabaseAuthDeletionActual` returns `auth_durable_authority_required` before its legacy dry-run/Auth GET, `deleteAuthUser`, legacy completion write, or completion chain. In this unit, legacy Auth GET, Auth DELETE, legacy completion write, focused RPC invocation, and canonical Auth operator wiring are all `0`.

## Evidence distinction and non-destructive boundary

G5D-2M remains the isolated PostgreSQL behavioral authority for GET-first ordering, strict absence, verification binding and A–G negative cases, two-session one-winner CAS concurrency, DELETE maximum one, response-loss recovery, malformed-response recovery, terminal polarity, owner-null lifecycle, Auth sub-finalization, User A/B isolation, and runtime ACL behavior.

G5D-2N proves Canonical Staging deployment authority only: exact migration apply, actual schema/catalog, exact function body identity/security, ACL, service-role repository SELECT, application protected SELECT denial, protected UPDATE denial, RLS preservation, exact public-table inventory, and zero application-row mutation. No live Auth deletion behavior is proven here.

All remained zero: real Staging Auth GET, real Staging Auth DELETE, Auth operator wiring, Completion, Provider external call, Storage external call, DB finalizer invocation, account deletion finalizer/RPC execution, Production mutation, and destructive guard enablement. The intentionally unexecuted real Staging Auth behavior is a later-stage boundary, not a correctness UNKNOWN.

## Validation, files, and status

- Initial and final workspace preflight, exact source checkpoint, `npm run check:workspace`, and `git diff --check`: PASS.
- Canonical Staging identity/health, linked ref, pre/post migration history, migration SHA, pre/post dry-run, exact-one apply: PASS.
- Durable columns, no-target-FK, five validated checks, trigger, RPC/security, 8/8 definition hashes, dispatch/sub-finalizer semantics: PASS.
- Repository SELECT, protected SELECT/UPDATE, authenticated safe columns, service-role prior update surface, RLS/policy: PASS.
- Exact 18 tables and 18/18 pre/post row-count/fingerprint equality: PASS.
- Root lint, typecheck, build, generated types, and isolated PostgreSQL proof were not rerun because migration/application/type/test/package technical bytes were unchanged; G5D-2M remains the accepted behavioral authority. This closeout changes only this result and `docs/current-state.md`.
- README was not changed because final authority is recorded in the fresher `docs/current-state.md` and this focused result; setup/index authority did not require an update.
- P0/P1/P2/correctness UNKNOWN: `0/0/0/0`.

The independent read-only review verdict is accepted as final authority. G5D-2N is `CLOSED_COMMITTED_PASS`; G5D-2 and Gate 5 remain `OPEN`. Auth canonical operator wiring, Completion, connected non-live account-wide proof, separately Human-authorized live disposable Staging proof, and final Gate 5 closeout remain unfinished. No application source, migration, test, package metadata, generated DB type, README, database, Staging, Production, real Auth, Provider/Storage external path, DB finalizer, Completion, or destructive-guard state is changed by this docs-only closeout.

Final status:

`G5D_2N_FINAL_AUTHORITY_DOCS_CLOSEOUT_COMMITTED_AND_PUSHED_PASS`

Exact next one action:

`G5D_POST_2N_AUTH_OPERATOR_NEXT_UNIT_RECONCILIATION`

That next unit is read-only and must determine whether the minimum canonical Auth operator unit can now be only Auth resolver/service/bridge, a real Supabase Auth adapter wrapper, and fake operator proof, with no new migration. It is not started by this closeout.
