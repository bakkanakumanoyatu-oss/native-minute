# G5D-2C Migration 0022 Controlled Staging Apply and Non-Destructive Smoke

Recorded: 2026-09-02

Mode: `G5D_2C_MIGRATION_0022_CONTROLLED_STAGING_APPLY_AND_NON_DESTRUCTIVE_SMOKE_V1`

Closeout mode: `G5D_2C_FINAL_AUTHORITY_DOCS_CLOSEOUT_COMMIT_AND_PUSH_V1`

Status: `CLOSED_COMMITTED_PASS`

Accepted authorities:

- `G5D_2C_MIGRATION_0022_CONTROLLED_STAGING_APPLY_AND_NON_DESTRUCTIVE_SMOKE_PASS_PENDING_REVIEW`.
- `G5D_2C_STAGING_APPLY_AND_NON_DESTRUCTIVE_SMOKE_INDEPENDENT_READ_ONLY_REVIEW_PASS`.

G5D-2C is `CLOSED_COMMITTED_PASS`. G5D-2 overall and Gate 5 remain `OPEN`. No live Provider or account-deletion execution is authorized or proven by this migration apply.

## Canonical Staging identity

- Project name: `native-minute-staging`.
- Project ref: `ztlliqishddrrvqqrrlu`.
- Region: `ap-northeast-1`.
- Linked project: exact match and `ACTIVE_HEALTHY`.
- The other visible project was unlinked and was not accessed for migration or catalog work.
- Production mutation: `0`.

## Pre-apply state and safety

- Local and upstream source: `ec0c4a7f5bed656a2a8c04b90f21048835f197ec`.
- Tracked worktree: clean; existing `supabase/.temp/` remained untracked and untouched.
- Actual remote migration history: contiguous `0001` through `0021`.
- Remote `0022`: absent.
- Missing earlier, unknown, or future migration: `0`.
- Migration SHA-256: `de6fe0d1aea320357705451236a488fb88c509b554dd683dea9831d79d1dcc05`.
- The migration has no top-level fixture or product-row DML. Its INSERT/UPDATE statements are inside focused function definitions and are not invoked by apply.
- Pre-apply estimated `account_deletion_requests` count: `0`.
- Destructive guard: disabled.

The normal linked push dry-run with vault updates skipped listed exactly:

- `0022_g5d_2a_account_deletion_provider_durable_state.sql`.

Seed, role, `0023+`, and other migration apply counts were all `0`.

## Controlled apply

Approved path:

`npx supabase db push --linked --skip-vault --yes`

The command applied `0022_g5d_2a_account_deletion_provider_durable_state.sql` exactly once and completed successfully. No manual SQL fragment, migration repair, seed, role update, vault update, or deploy was used.

Post-apply migration history is exactly contiguous `0001` through `0022`. A second dry-run reported the remote database up to date with no pending migration.

Repository migration `0022` is committed, and its isolated PostgreSQL behavioral/runtime correctness proof passed under G5D-2A. That isolated proof is distinct from this G5D-2C Canonical Staging migration/catalog/non-destructive smoke. Destructive transition behavior was intentionally not re-executed on Staging.

## Actual catalog smoke

Read-only Staging catalog queries confirmed:

- all 12 Provider durable parent fields exist on `public.account_deletion_requests`;
- `public.account_deletion_provider_targets` exists and is owned by `postgres`;
- the standalone request FK and composite request/owner FK both exist with `ON DELETE CASCADE`;
- the parent `(id, user_id)` uniqueness and seven focused parent lifecycle constraints exist;
- child `delete_attempt_count` is constrained to `0` or `1`;
- child status, delete outcome, reconciliation, verified-absence, locator, scrub, and deleted/success lifecycle constraints exist;
- all three relevant partial unique indexes exist for request/voice, request/fingerprint, and request/provider locator.

The fingerprint index name is PostgreSQL-truncated to the identifier limit in the actual catalog, while its exact unique index definition remains present.

## RLS and ACL smoke

- Child RLS enabled: `true`.
- Child policy count: `0`.
- `anon`: SELECT `false`; direct mutation `false`.
- `authenticated`: SELECT `false`; direct mutation `false`.
- `service_role`: SELECT `true`; direct mutation `false`.
- Direct child-table INSERT/UPDATE/DELETE/TRUNCATE authority remains absent from all three API roles.

## Focused RPC authority

All eight focused RPCs exist with exact expected signatures and return types:

1. `seal_account_deletion_provider_snapshot`
2. `claim_account_deletion_provider_lease`
3. `release_account_deletion_provider_lease`
4. `begin_account_deletion_provider_delete_attempt`
5. `record_account_deletion_provider_delete_result`
6. `begin_account_deletion_provider_reconciliation_attempt`
7. `record_account_deletion_provider_reconciliation_result`
8. `finalize_account_deletion_provider_stage`

For all eight:

- owner is `postgres`;
- `SECURITY DEFINER` is enabled;
- fixed `search_path` is `pg_catalog, public`;
- PUBLIC, `anon`, and `authenticated` EXECUTE are absent;
- `service_role` EXECUTE is present.

Actual catalog also confirms `pgcrypto` is installed in `extensions` and `extensions.digest(text,text)` resolves. The sealed snapshot function retains its schema-qualified digest call.

## Trigger attachment

Actual catalog confirmed:

- parent lifecycle trigger: `BEFORE INSERT OR UPDATE` on `account_deletion_requests`;
- target lifecycle/generation trigger: `BEFORE UPDATE` on `account_deletion_provider_targets`;
- target updated-at trigger: `BEFORE UPDATE` on `account_deletion_provider_targets`.

No trigger was intentionally fired by a fixture in this unit.

## Non-destructive and data-integrity boundary

- Post-apply exact catalog aggregate: `account_deletion_requests=0` and `account_deletion_provider_targets=0`.
- Pre/post relevant request count remained `0`.
- Mutation-capable RPC calls: `0`.
- Account deletion request creation, seal, advance, lease, begin-delete, reconciliation, and finalizer calls: `0`.
- Real Provider DELETE/GET: `0`.
- Storage cleanup, DB/anonymization, Auth deletion, and completion: `0`.
- Existing product-row mutation attributable to migration apply: `0`.
- Production mutation: `0`.
- Destructive guard remained disabled.

The runtime smoke intentionally stopped at read-only migration history, schema dump, `pg_catalog`, ACL, and aggregate count queries. It did not call a focused mutation RPC even with a synthetic identifier.

## Validation and findings

- `npm run check:workspace`: PASS.
- pre/post linked migration history: PASS.
- exact-one migration dry-run/apply/post-dry-run: PASS.
- parent/child catalog, dual FK, constraints, and uniqueness: PASS.
- RLS/ACL: PASS.
- eight focused RPC authority checks: PASS, 8/8.
- `extensions.digest` resolution: PASS.
- trigger attachment: PASS, 3/3.
- relevant row-count integrity: PASS, 0 -> 0.
- `git diff --check`: PASS after final docs sync.
- independent read-only review: `G5D_2C_STAGING_APPLY_AND_NON_DESTRUCTIVE_SMOKE_INDEPENDENT_READ_ONLY_REVIEW_PASS`.
- Source, migration, test, package, and DB type changes: `0`.
- P0: `0`.
- Unresolved correctness P1: `0`.
- P2: `0`.
- Correctness UNKNOWN: `0`.

Next single action: `G5D_POST_2C_NEXT_TECHNICAL_UNIT_RECONCILIATION`.

Do not start that reconciliation or live Provider execution in this closeout.
