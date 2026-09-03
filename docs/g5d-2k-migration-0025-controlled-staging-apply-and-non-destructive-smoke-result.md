# G5D-2K Migration 0025 Controlled Staging Apply and Non-Destructive Smoke

Recorded: 2026-09-03

Mode: `G5D_2K_MIGRATION_0025_CONTROLLED_STAGING_APPLY_AND_NON_DESTRUCTIVE_SMOKE_V1`

Closeout mode: `G5D_2K_FINAL_AUTHORITY_DOCS_CLOSEOUT_COMMIT_AND_PUSH_V1`

Status: `CLOSED_COMMITTED_PASS`

Authority: `G5D_2J_FINAL_AUTHORITY_CLOSEOUT_COMMITTED_AND_PUSHED_PASS` at source `22715148bd1783daba07531854e9e1ddb111aba5`.

Accepted authorities:

- `G5D_2K_MIGRATION_0025_CONTROLLED_STAGING_APPLY_AND_NON_DESTRUCTIVE_SMOKE_PASS_PENDING_REVIEW`;
- `G5D_2K_STAGING_APPLY_AND_NON_DESTRUCTIVE_SMOKE_INDEPENDENT_READ_ONLY_REVIEW_PASS`.

G5D-2K is `CLOSED_COMMITTED_PASS`. This unit applied the exact committed migration `0025` once to Canonical Staging and verified its deployed function catalog, ACL, trigger attachments, constraints, indexes, and non-destructive data boundary. It did not call the database finalizer or any Provider, Storage, Auth, completion, or purge path. G5D-2 and Gate 5 remain `OPEN`.

## Preflight and Canonical Staging identity

- Workspace and git root: `/Users/karasawatakahiro/Developer/native-minute`.
- Branch: `codex/g3-mobile-main-loop`.
- Local HEAD/upstream: `22715148bd1783daba07531854e9e1ddb111aba5`.
- Tracked worktree was clean; only allowed untracked `supabase/.temp/` existed.
- Initial `npm run check:workspace` and `git diff --check`: PASS.
- Project: `native-minute-staging`.
- Project ref: `ztlliqishddrrvqqrrlu`.
- Region/status: `ap-northeast-1` / `ACTIVE_HEALTHY`.
- Linked target: exact match; ambiguity `0`.
- Production connection/mutation: `0/0`.
- `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE` remained unset; guard enablement `0`.

## Migration identity, semantic audit, and controlled apply

Exact migration: `supabase/migrations/0025_g5d_2j_atomic_db_finalizer.sql`.

SHA-256: `8dcee3373fa67edcbbf9356d708c6d3a722b2f916cfd4659198238a750934814`.

The file is tracked and present in current `HEAD`. Worktree bytes, the `HEAD` Git object, the G5D-2J result authority, and the focused test constant all matched this SHA. The committing source is the current `HEAD`.

Pre-apply remote history was exactly contiguous `0001`–`0024`: `0024` appeared once, `0025` was absent, missing/future/unknown were `0/0/0`, and the only local pending migration was `0025`.

The top-level semantic audit found only focused function/trigger installation, replacement of the temporary DB-terminal foundation with permanent terminal protection, the focused terminal-shape constraint, function/table ACL changes, finalizer declaration, ownership, grant, and comment. Application-data `INSERT`/`UPDATE`/`DELETE` exists only inside the uncalled finalizer function body. Top-level product deletion, quota/voice anonymization execution, request advancement, Auth/Provider/Storage mutation, completion, purge, scheduler, and generic work framework were absent.

The official linked dry-run with vault changes skipped listed only `0025_g5d_2j_atomic_db_finalizer.sql`; seeds, roles, vault work, `0026+`, and unrelated migrations were `0`.

The normal linked command applied `0025` once:

`npx --no-install supabase db push --linked --skip-vault --yes`

No manual SQL patch, migration repair, squash, manual catalog/ACL edit, seed, role or vault change, second apply, or Production connection was used.

Post-apply remote history is exactly contiguous `0001`–`0025`, with `0025` exactly once and pending/missing/future/unknown `0/0/0/0`. The official post-apply dry-run returned `Remote database is up to date` with empty migrations, seeds, and roles.

## Finalizer and helper function catalog

Actual Canonical Staging contains exactly:

`finalize_account_deletion_database_stage(uuid,uuid,text)`

Its identity arguments are `p_deletion_request_id uuid, p_expected_user_id uuid, p_expected_db_inventory_version text`. Its return type is the exact table shape `db_cleanup_status text`, `safe_reason text`, four integer D/A/R evidence fields, and `already_finalized boolean`. Owner is `postgres`, mode is `SECURITY DEFINER`, and config is exact `search_path=pg_catalog, public`. Effective EXECUTE is `PUBLIC=false`, `anon=false`, `authenticated=false`, `service_role=true`; direct grantees are owner `postgres` and intended `service_role`. The RPC was not called.

All 13/13 expected G5D-2J writer-fence helpers resolve with owner `postgres`, `SECURITY DEFINER`, exact fixed search path, and effective direct application-role EXECUTE counts `PUBLIC/anon/authenticated/service_role = 0/0/0/0`. The separate permanent terminal helper resolves with owner `postgres`, `SECURITY INVOKER`, exact fixed search path, and the same `0/0/0/0` EXECUTE exposure. Missing helpers and unexpected helper exposure are `0/0`.

## Writer fences and permanent terminal protection

Actual catalog contains the exact 12/12 focused row-level `BEFORE` trigger attachments introduced or replaced by `0025`, all enabled:

- permanent DB terminal authority on `account_deletion_requests`, `INSERT OR UPDATE`;
- Storage-terminal shared writer lock on `account_deletion_requests`, focused `UPDATE OF` the three expected columns;
- profile, processing-consent, quota, saved-model, and saved-best `INSERT OR UPDATE` fences;
- script, voice-operation, and voice-target `INSERT` fences;
- weak-word and coach-feedback `INSERT OR UPDATE OF take_id` fences.

Every attachment points to its exact committed helper. Duplicate and unexpected attachments are `0/0`. The old temporary `enforce_account_deletion_db_terminal_foundation` trigger/function are absent; permanent terminal trigger count is exactly `1`.

The permanent helper rejects terminal evidence on insert, permits only the focused prerequisite-complete transition shape, and makes terminal evidence plus metadata immutable afterward. The focused finalizer remains callable only through the intended service-role RPC authority; no Staging mutation fixture was created.

## Terminal-column ACL and Provider/Storage regressions

Effective unauthorized `UPDATE` authority across `PUBLIC`, `anon`, `authenticated`, and `service_role` for all seven protected fields is exactly `0` across the full 28-cell matrix:

- `db_cleanup_status`;
- `db_inventory_version`;
- `db_observed_row_count`;
- `db_deleted_row_count`;
- `db_anonymized_row_count`;
- `db_retained_row_count`;
- `db_sub_finalized_at`.

The explicit `service_role` non-terminal update surface is exact `48/48`, with missing/unexpected columns `0/0`; this includes all intended Provider and Storage request columns and excludes the seven DB-terminal columns.

All 8/8 focused Provider RPCs remain present with owner `postgres`, `SECURITY DEFINER`, exact fixed search path, service-role EXECUTE `8/8`, and `PUBLIC`/`anon`/`authenticated` EXECUTE `0/0/0`. All 10/10 focused Storage RPCs have the same expected authority, service-role EXECUTE `10/10`, and client EXECUTE `0`. No Provider or Storage RPC was called.

## Constraints, indexes, table authority, and backdoor smoke

All three focused account-request DB constraints resolve and are validated:

- exact inventory version `g5d-2h.account-db.v1`;
- all four evidence counts nonnegative;
- permanent terminal shape with exact `observed = deleted + anonymized + retained`, nonterminal zero shape, required terminal timestamp/version, `not_needed => D=A=0`, and `succeeded => D+A>0`.

The four required retention/evidence indexes resolve and are valid, ready, and live: Voice audit expiry, quota retention expiry, Provider target request/status, and Storage target request/status. No constraint weakening was observed.

Actual public application tables are the exact committed 18-table `g5d-2h.account-db.v1` set. Missing/extra tables are `0/0`; generic finalizer/cleanup work tables are `0`.

Actual `prosrc` for the finalizer, permanent terminal helper, and 13 writer helpers was checked as a 15-function set. Hits for `current_setting`, `set_config`, `session_replication_role`, boolean caller arguments, metadata authorization flags, and bypass/debug backdoors were all `0`.

## Existing-data integrity

Only safe aggregate evidence was returned. No raw IDs, identifiers, content, or PII were retrieved. Pre/post row counts were identical for all 18 tables:

| Table | Pre | Post |
| --- | ---: | ---: |
| account_deletion_provider_targets | 0 | 0 |
| account_deletion_requests | 0 | 0 |
| account_deletion_storage_targets | 0 | 0 |
| coach_feedback | 5 | 5 |
| processing_consents | 12 | 12 |
| profiles | 40 | 40 |
| quota_events | 10 | 10 |
| script_audios | 3 | 3 |
| script_saved_best_takes | 1 | 1 |
| script_saved_model_audios | 0 | 0 |
| scripts | 9 | 9 |
| takes | 5 | 5 |
| voice_asset_write_intents | 27 | 27 |
| voice_consents | 11 | 11 |
| voice_deletion_operations | 21 | 21 |
| voice_deletion_targets | 11 | 11 |
| voices | 3 | 3 |
| weak_words | 17 | 17 |

Server-side aggregate row fingerprints also matched for all 18/18 tables, covering in-place mutations without returning row contents. Focused aggregates were unchanged: account request/Provider target/Storage target rows remained `0/0/0`; DB-terminal requests remained `0`; quota owner-null/scrubbed remained `0/0`; Voice operation/target owner-null remained `0/0`; Voice/write-intent status distributions were identical. Application-row mutation, product deletion, quota/voice anonymization, request advancement, Provider/Storage target mutation, and write-intent mutation were all `0`.

## Evidence distinction and boundaries

G5D-2J isolated PostgreSQL remains the behavioral authority for Provider/Storage prerequisites, writer-fence behavior, exact 18-table mutation, D/A/R, DELETE/CASCADE, quota anonymization, voice audit handling, rollback, corrupted replay fail-close, prior-evidence polarity, concurrency, already-finalized replay, User A/B isolation, and runtime ACL behavior.

G5D-2K proves the exact `0025` deployment and actual Canonical Staging catalog/ACL, trigger attachment, constraint/index, Provider/Storage regression, 18-table, and application-row mutation-zero state non-destructively. It intentionally does not repeat behavioral or destructive fixtures on Staging; this is an evidence boundary, not a correctness `UNKNOWN`.

Committed source still sets `LEGACY_DATABASE_CLEANUP_DURABLE_AUTHORITY_REQUIRED = true`, and `runDatabaseCleanupActual` returns `db_durable_authority_required` before dry-run planning or any sequential mutation path. Legacy inventory, sequential DELETE, immediate quota DELETE, request status write, Auth call, and completion call were all `0`.

Finalizer execution, actual 18-table cleanup/anonymization, Provider call, Storage call, Auth call, completion, purge, Production connection/mutation, and destructive guard enablement were all `0`.

## Validation and final status

- workspace preflight and exact clean source checkpoint: PASS;
- migration identity/SHA and pre/post history: PASS;
- pre/post dry-run and exact-one apply: PASS;
- finalizer/helper/trigger/terminal/ACL catalog smoke: PASS;
- Provider 8/8 and Storage 10/10 regression authority: PASS;
- constraints/indexes and exact 18 tables: PASS;
- pre/post application data: PASS, row mutation `0`;
- final `npm run check:workspace` and `git diff --check`: PASS;
- root lint, typecheck, build, and isolated runtime proof were not rerun because application source, migration bytes, tests, package metadata, DB types, routes, and UI were unchanged; G5D-2J remains their accepted behavioral authority;
- P0/P1/P2/correctness UNKNOWN: `0/0/0/0`.

The independent read-only review verdict is accepted as final authority. G5D-2K is `CLOSED_COMMITTED_PASS`; G5D-2 and Gate 5 remain `OPEN`. DB canonical operator wiring, Auth deletion/recovery, completion, live Account deletion proof, and future expiry purge/control work have not started. This closeout changes documentation only: application source, migrations, tests, package metadata, and generated DB types remain unchanged.

Exact next one action:

`G5D_POST_2K_DB_OPERATOR_NEXT_UNIT_RECONCILIATION`

That next unit is read-only and must determine from the live repository whether connecting Provider terminal -> Storage terminal -> DB finalizer to the existing canonical operator is sufficient or whether an additional prerequisite exists. It is not started by this closeout.
