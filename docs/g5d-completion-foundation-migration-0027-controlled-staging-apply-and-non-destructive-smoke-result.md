# G5D Completion Foundation Migration 0027 Controlled Staging Apply and Non-Destructive Smoke

Recorded: 2026-09-04 (Asia/Tokyo)

Mode: `G5D_COMPLETION_FOUNDATION_MIGRATION_CANONICAL_STAGING_APPLY`

Closeout mode: `G5D_COMPLETION_FOUNDATION_MIGRATION_CANONICAL_STAGING_FINAL_AUTHORITY_CLOSEOUT_COMMIT_AND_PUSH`

Status: `G5D_COMPLETION_FOUNDATION_MIGRATION_CANONICAL_STAGING_CLOSED_COMMITTED_PASS`

Repository authority: `G5D_COMPLETION_FOUNDATION_MIGRATION_CLOSED_COMMITTED_PASS` at source `5108452db8e50e3925345d9ddec2ed51dcf85c2b`.

Accepted authorities:

- `G5D_COMPLETION_FOUNDATION_MIGRATION_CANONICAL_STAGING_APPLIED_PENDING_INDEPENDENT_REVIEW`;
- `G5D_COMPLETION_FOUNDATION_MIGRATION_CANONICAL_STAGING_INDEPENDENT_READ_ONLY_FOCUSED_REVIEW`, verdict `PASS`.

The independent review is accepted as final authority with focused `P0/P1/P2/UNKNOWN = 0/0/0/0` and no new correctness UNKNOWN. The 0027 repository authority and Canonical Staging deployment are `CLOSED`; Completion operator/service/routing is `NOT IMPLEMENTED`, and Completion, G5D-2, and Gate 5 remain `OPEN`.

This unit applied only the accepted Completion foundation migration `0027_g5d_completion_foundation.sql` to Canonical Staging and collected deployment, catalog, ACL, and non-destructive smoke evidence. It did not implement or call Completion operator/service/routing, use an existing deletion request as a fixture, create a disposable account, perform connected or live account-deletion proof, call Provider/Storage/Auth destructive paths, invoke the Database finalizer, enable a destructive guard, or touch Production.

## Repository and migration preflight

- Workspace and git root: `/Users/karasawatakahiro/Developer/native-minute`.
- Branch: `codex/g3-mobile-main-loop`.
- HEAD/upstream: `5108452db8e50e3925345d9ddec2ed51dcf85c2b` / exact match.
- Ahead/behind: `0/0`.
- Tracked worktree: clean; only the allowed existing untracked `supabase/.temp/` directory was present and it was not manually read, changed, or removed.
- `npm run check:workspace`: PASS before apply.
- Local migration SHA-256: `ff05fd6ffcca8e1a78c62418360e74f2d025f2779dcd6ea9f147919359728beb`, exact accepted authority.

The required repository authority documents and migrations `0026` and `0027` were read before apply. No migration, generated DB type, runtime source, test, package, or configuration byte was changed.

## Canonical Staging identity and pre-apply history

Live Supabase project-list evidence returned exactly one matching project:

- name: `native-minute-staging`;
- project ref: `ztlliqishddrrvqqrrlu`;
- region: `ap-northeast-1`;
- status: `ACTIVE_HEALTHY`;
- linked project: true, with the same exact ref.

This was unambiguously the expected non-Production environment. No Production connection or mutation was made.

The pre-apply remote migration history was exactly contiguous `0001` through `0026`. Missing, duplicate, out-of-order, future `0028+`, and remote-only migrations were all zero. Migration `0027` was absent remotely and was the only local pending migration. The official linked dry-run listed only:

`0027_g5d_completion_foundation.sql`

Seeds and roles were empty. Migration repair, history rewrite, squash, schema pull, reset, force, and manual SQL patch were not used.

## Historical-data preflight and controlled apply

Read-only service-role aggregate queries before apply returned:

- all `account_deletion_requests`: `0`;
- completed requests: `0`;
- open requests: `0`;
- non-completed requests with non-null `completed_at`: `0`;
- completed requests missing `completed_at`: `0`.

No UUID, user identity, auth target, email/phone, provider locator, storage path/key, metadata, or row payload was retrieved or recorded. No preflight fixture, repair, or backfill was created. The migration's own fail-closed historical preflight completed successfully.

The established supported linked command was run once:

`npx --no-install supabase db push --linked --skip-vault --yes`

It applied exactly `0027_g5d_completion_foundation.sql`. The result was unambiguous, so no second apply was attempted.

## Post-apply history

Immediate read-only history inspection returned exactly contiguous `0001` through `0027`; migration `0027` appears exactly once. Pending, missing, future, and remote-only migrations are `0/0/0/0`. The immediate official linked post-apply dry-run returned `Remote database is up to date`, with migrations, seeds, and roles all empty.

## Completion catalog and definition authority

The deployed schema contains exactly one `finalize_account_deletion_completion(uuid)` function with the expected return contract:

- `completion_status text`;
- `safe_reason text`;
- `completed_at timestamptz`;
- `expires_at timestamptz`;
- `already_completed boolean`.

Its owner is `postgres`, mode is `SECURITY DEFINER`, and fixed configuration is `search_path=pg_catalog, public`. The deployed function body exactly matches the accepted migration body.

All four migration-owned deployed function bodies match the accepted local `0027` definitions byte-for-byte (`4/4`, mismatch `0`):

- `enforce_account_deletion_auth_durable_authority()`;
- `account_deletion_completion_prerequisites_terminal(account_deletion_requests)`;
- `enforce_account_deletion_completion_authority()`;
- `finalize_account_deletion_completion(uuid)`.

The deployed catalog also contains:

- validated `account_deletion_requests_completion_terminal_shape_check`;
- enabled `enforce_account_deletion_completion_authority` `BEFORE INSERT OR UPDATE` trigger on `account_deletion_requests`;
- enabled `enforce_account_deletion_auth_durable_authority` `BEFORE INSERT OR UPDATE` trigger on the same table;
- the accepted Auth-trigger delta requiring the terminal-entry clause only when prior `auth_sub_finalized_at` is null.

The Completion expiry definition is `interval '2160 hours'` in every persisted function-body authority site. PostgreSQL catalog normalization represents the constraint interval as `2160:00:00`. This is the accepted exact `7,776,000` elapsed-second authority; no Staging row or DST fixture was created because isolated PostgreSQL timezone/DST proof is already accepted authority.

## ACL and security-definer authority

Effective execute authority for `finalize_account_deletion_completion(uuid)` is:

| Role | Execute |
| --- | --- |
| `service_role` | true |
| `PUBLIC` | false |
| `anon` | false |
| `authenticated` | false |

The deployed ACL revokes PUBLIC authority and grants only `service_role`; no application-role grant exists. An actual anon call was denied with HTTP `401`. A no-key public gateway call was also denied with HTTP `401`. An authenticated call was intentionally not manufactured because this unit forbids creating a disposable account; deployed ACL authority proves no authenticated execute grant.

The prerequisite helper and both trigger helpers have no application/service direct execute grant. Direct `service_role` update grants for Completion-owned `completed_at`, `expires_at`, and `notification_status` are all absent (`0/3`), leaving the focused RPC as the Completion mutation authority.

## Non-destructive behavioral smoke

A `service_role` call used a freshly generated nonexistent random request UUID, never an existing row. It failed closed with HTTP `403`, SQLSTATE `42501`, and fixed safe reason `completion_request_not_found`. The aggregate `account_deletion_requests` count was `0` before and `0` after the call. No Completion row mutation occurred.

No real request UUID or other sensitive identifier was emitted. Existing real users and deletion requests were not used.

## Existing stage-authority preservation

Actual deployed function catalog inspection confirmed all accepted prior-stage focused RPCs remain present:

- Provider: `8/8`;
- Storage: `10/10`;
- Database: `1/1`;
- Auth: `6/6`.

Missing prior-stage RPCs: `0`. This unit did not invoke any of them.

## Boundaries, files, and validation

- Canonical Staging migration apply: exactly one migration, `0027`.
- Application-row mutation attributable to the apply/smoke: `0`; account-deletion request count remained `0`.
- Existing deletion request fixture use: `0`.
- New disposable account: `0`.
- Completion operator/service/routing: `NOT IMPLEMENTED`.
- Connected non-live proof and destructive/live account deletion proof: `NOT RUN`.
- Provider/Storage/Auth destructive action, DB finalizer call, and real external call: `0`.
- Production connection/mutation: `0/0`.
- Destructive guard enablement: `0`.
- `npm run check:workspace`: PASS before apply and after documentation update.
- Focused Completion foundation contract validator: PASS, `10/10`.
- Focused deployment/catalog/smoke evidence: PASS.
- `git diff --check`: PASS after documentation update.
- Lint, typecheck, build, the full test suite, and isolated PostgreSQL runtime proof were not rerun because source, migration, generated type, test, package, route, and UI bytes were unchanged. The accepted isolated PostgreSQL Completion authority remains the behavioral proof.
- Files changed by this unit: this result and `docs/current-state.md` only.
- This final-authority closeout changes only this result and `docs/current-state.md`; no technical source, migration, generated type, test, package, route, UI, database, Staging, Production, provider, storage, or auth state is changed.

The focused unit has `P0/P1/P2/UNKNOWN = 0/0/0/0`. Program aggregate is `P0/P1/P2/UNKNOWN = 0/0/1/0`; the known P2 `auth_terminal_authority_missing` remains nonblocking deferred cleanup. The 0027 repository authority and Canonical Staging deployment are `CLOSED`; Completion operator/service/routing is `NOT IMPLEMENTED`; Completion, G5D-2, and Gate 5 remain `OPEN`.

Exact next one action:

`G5D_POST_COMPLETION_FOUNDATION_STAGING_OPERATOR_NEXT_UNIT_RECONCILIATION`
