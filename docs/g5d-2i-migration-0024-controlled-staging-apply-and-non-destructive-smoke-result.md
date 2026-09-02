# G5D-2I Migration 0024 Controlled Staging Apply and Non-Destructive Smoke

Recorded: 2026-09-02

Mode: `G5D_2I_MIGRATION_0024_CONTROLLED_STAGING_APPLY_AND_NON_DESTRUCTIVE_SMOKE_V1`

Closeout mode: `G5D_2I_FINAL_AUTHORITY_DOCS_CLOSEOUT_COMMIT_AND_PUSH_V1`

Status: `CLOSED_COMMITTED_PASS`

Authority: `G5D_2H_FINAL_AUTHORITY_CLOSEOUT_COMMITTED_AND_PUSHED_PASS` at source `27d603c2a4f728cc8e06d9be3403874312347f6f`.

Accepted authorities:

- `G5D_2I_MIGRATION_0024_CONTROLLED_STAGING_APPLY_AND_NON_DESTRUCTIVE_SMOKE_PASS_PENDING_REVIEW`;
- `G5D_2I_STAGING_APPLY_AND_NON_DESTRUCTIVE_SMOKE_INDEPENDENT_READ_ONLY_REVIEW_PASS`.

G5D-2I is `CLOSED_COMMITTED_PASS`. This unit applied the exact committed migration `0024` once to Canonical Staging and verified its deployed catalog, quota retention metadata backfill, trigger/function security, and non-destructive boundary. It did not run the atomic 18-table DB finalizer, product cleanup/anonymization, voice owner anonymization, quota account-deletion anonymization, Auth deletion, Provider/Storage execution, completion, or purge. G5D-2 overall and Gate 5 remain `OPEN`.

## Preflight and Canonical Staging identity

- Workspace/git root: `/Users/karasawatakahiro/Developer/native-minute`.
- Branch: `codex/g3-mobile-main-loop`.
- Local HEAD/upstream: `27d603c2a4f728cc8e06d9be3403874312347f6f`.
- Tracked worktree was clean; only the allowed untracked `supabase/.temp/` existed.
- `npm run check:workspace` and initial `git diff --check`: PASS.
- Project: `native-minute-staging`.
- Project ref: `ztlliqishddrrvqqrrlu`.
- Region: `ap-northeast-1`.
- Linked status: exact and `ACTIVE_HEALTHY`.
- Production access/mutation: `0/0`.
- Destructive account-deletion guard remained disabled.

## Migration identity, history, and controlled apply

Repository migration: `0024_g5d_2h_db_anonymization_retention_owner_lifecycle_foundation.sql`.

SHA-256: `2350308fe953307f3feef10f96d74edc9dbd772ff69acf233ce73ee8380dab73`.

The migration is tracked in the current commit. The worktree Git object and `HEAD` object matched, and its SHA-256 matched the exact migration used by the G5D-2H isolated PostgreSQL proof.

Pre-apply remote migration history was exactly contiguous `0001`–`0023`: `0023` appeared once, `0024` was absent, and missing/future/unknown migrations were `0`. The only local pending migration was `0024`.

The top-level semantic audit found only the intended voice operation/target owner lifecycle DDL, quota anonymized-retention DDL and metadata backfill, account request DB-evidence DDL, and associated constraints, indexes, functions, triggers, comments, and revocations. Product deletion, voice/account cleanup execution, Auth/Provider/Storage mutation, completion, purge, and generic retention framework changes were absent.

The official linked dry-run with vault updates skipped listed exactly `0024_g5d_2h_db_anonymization_retention_owner_lifecycle_foundation.sql`; seeds, roles, vault changes, `0025+`, and unrelated migrations were `0`.

The normal linked command applied `0024` once:

`npx --no-install supabase db push --linked --skip-vault --yes`

No manual SQL patch, migration repair, squash, seed, role change, vault change, second apply, or Production connection was used.

Post-apply history is exactly contiguous `0001`–`0024`, with `0024` exactly once and pending `0`. The post-apply official dry-run reported the remote database up to date with migrations, seeds, and roles all empty.

## Quota retention metadata backfill

The exact migration predicate is `retention_expires_at is null` after the new nullable column is added. Before apply, the column did not exist and `quota_events` contained 10 rows, so the intended affected-row count was exactly 10.

Safe pre/post aggregate evidence confirmed:

- row count remained `10`;
- canonical `retention_expires_at = attempted_at + interval '90 days'` rows became `10/10`;
- invalid or missing expiry rows are `0`;
- `user_id` non-null/null counts remained `10/0`;
- identifier-bearing field non-null counts remained unchanged;
- an aggregate checksum over identity, content, timestamps, and `updated_at` matched exactly before and after apply;
- `identifier_scrubbed_at` remained null for all 10 rows, so no account-deletion anonymization ran;
- the normal `set_updated_at_quota_events` trigger was enabled before apply and is enabled after apply.

The intended retention metadata backfill was the only application-row update. Row deletion, identity/content mutation, owner removal, scrub execution, retention-window restart, and unintended `updated_at` churn were all `0`.

## Voice operation and target catalog smoke

Actual Canonical Staging catalog confirmed for `voice_deletion_operations`:

- `user_id` is nullable;
- the Auth FK is exact `ON DELETE SET NULL`;
- `audit_expires_at` and the exact expiry index are present;
- completed-safety and anonymized-owner-shape checks are present;
- the owner lifecycle/completed immutability trigger is attached once, enabled, row-level, and `BEFORE UPDATE`;
- completed immutability authority is present in the installed function;
- actual owner-null mutations performed by this unit: `0`.

Actual catalog confirmed for `voice_deletion_targets`:

- `user_id` is nullable;
- exactly two FKs exist: the standalone operation FK with `ON DELETE CASCADE`, and the composite operation/owner FK with `ON UPDATE CASCADE ON DELETE CASCADE`;
- duplicate or unexpected FKs are `0`;
- all 12 current CHECK constraints are present: the ten G5C-B1 lifecycle checks, the prior G5C-B3 Storage locator contract, and the G5D-2H anonymized-owner shape;
- the target immutability trigger is attached once and enabled;
- actual child owner-null mutation performed by this unit: `0`.

Behavioral owner-null, invalid-state rejection, FK propagation, immutable completed evidence, and purge cascade remain the isolated G5D-2H proof authority; no destructive fixture was created on Staging.

## Quota, account request, and terminal catalog smoke

Actual `quota_events` catalog confirmed nullable `user_id`, exact Auth `ON DELETE SET NULL`, nullable `identifier_scrubbed_at`, non-null `retention_expires_at`, expiry index, both new retained-shape/expiry constraints, and the enabled row-level `BEFORE INSERT OR UPDATE` lifecycle trigger. The installed retention anchor is exactly `attempted_at + interval '90 days'`.

Actual `account_deletion_requests` catalog contains all six DB evidence fields with the committed types/defaults/nullability:

- `db_inventory_version text NOT NULL DEFAULT 'g5d-2h.account-db.v1'`;
- four nonnegative integer count fields, each `NOT NULL DEFAULT 0`;
- nullable `db_sub_finalized_at timestamptz`.

The exact inventory-version, nonnegative-count, and DB-terminal-shape constraints are present. All 12/12 Provider durable fields and 15/15 Storage durable fields remain present.

The temporary DB terminal foundation trigger is enabled, row-level, and `BEFORE INSERT OR UPDATE`. Its installed function contains no caller-settable `current_setting`/`set_config` backdoor. No premature DB finalizer RPC exists. No terminal mutation fixture was run; direct/ordinary rejection behavior remains the G5D-2H isolated proof authority.

## Function security and 18-table authority

The four G5D-2H trigger functions are owned by `postgres`, use exact `search_path=pg_catalog, public`, and have one intended trigger attachment each. Voice operation/target functions are narrowly `SECURITY DEFINER`; quota/account terminal functions are `SECURITY INVOKER`. Direct EXECUTE for `PUBLIC`, `anon`, `authenticated`, and `service_role` is `0/0/0/0` for every function. Unexpected privilege escalation is `0`.

Committed source remains exact contract version `g5d-2h.account-db.v1`, count `18`, duplicate `0`, missing `0`. Actual Staging has the same exact 18 named public application tables; migration `0024` added no nineteenth table.

All 18 table row counts and aggregate voice/account status counts matched exactly before and after apply. This includes unchanged learning/product rows, 21 voice operations with the same status distribution, 11 voice targets, zero account requests/Provider targets/Storage targets, and 10 quota rows.

The committed legacy boundary remains `LEGACY_DATABASE_CLEANUP_DURABLE_AUTHORITY_REQUIRED = true`. G5D-2I did not call the legacy DB executor: inventory, sequential DELETE, immediate quota DELETE, request terminal write, Auth, and completion executions were all `0`.

## Evidence distinction, validation, and remaining boundary

G5D-2H behaviorally proved owner-null lifecycle, invalid voice-state rejection, target FK propagation, quota scrub/anonymization behavior, nonzero backfill immutability, premature Auth rejection, DB terminal rejection, and User A/B isolation on disposable isolated PostgreSQL.

G5D-2I proves exact `0024` deployment, actual Canonical Staging migration history/catalog/FKs/constraints/indexes, exact quota metadata backfill result, trigger/function identity, and ACL/security. It intentionally does not repeat destructive or anonymization fixtures on Staging. This is the intended evidence boundary, not a correctness `UNKNOWN`.

- workspace and migration identity/hash: PASS;
- pre/post migration history and exact-one apply: PASS;
- dry-run/post-dry-run: PASS;
- voice operation/target, quota, and account request catalog: PASS;
- DB terminal protection and ACL/security: PASS;
- quota backfill aggregate proof: PASS, intended `10`, canonical `10`, invalid `0`;
- exact public table contract: PASS, `18/18`, duplicate/missing `0/0`;
- unintended application-data mutation: `0`;
- actual DB cleanup/anonymization: `0`;
- real Auth/Provider/Storage/completion calls: `0/0/0/0`;
- Production access/mutation: `0/0`;
- destructive guard enablement: `0`;
- the independent read-only review rechecked the focused DB foundation contract `7/7`, the legacy DB cleanup fail-closed self-test, root/mobile lint, and root/mobile typecheck; build, the full test suite, and migration runtime proof were not rerun because source, migration, tests, package metadata, DB types, routes, and UI were unchanged;
- P0/P1/P2/correctness UNKNOWN: `0/0/0/0`.

Final status:

`G5D-2I = CLOSED_COMMITTED_PASS`

G5D-2 overall and Gate 5 remain `OPEN`. Atomic DB finalizer implementation, DB canonical operator wiring, real cleanup/anonymization, Auth deletion/recovery, completion, purge, and live destructive proof remain unfinished.

The exact next one action, not started here, is:

`G5D_POST_2I_ATOMIC_DB_FINALIZER_NEXT_UNIT_RECONCILIATION`
