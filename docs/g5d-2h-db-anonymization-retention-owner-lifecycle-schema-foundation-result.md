# G5D-2H DB Anonymization, Retention, and Owner Lifecycle Schema Foundation

Recorded: 2026-09-02

Mode: `G5D_2H_FINAL_AUTHORITY_CLOSEOUT_COMMIT_AND_PUSH_V1`

Status: `CLOSED_COMMITTED_PASS`

Final authority accepts `G5D_POST_2G_DB_ANONYMIZATION_NEXT_UNIT_RECONCILIATION_PASS`, `G5D_2H_DB_ANONYMIZATION_RETENTION_AND_OWNER_LIFECYCLE_SCHEMA_FOUNDATION_IMPLEMENTED_PENDING_REVIEW`, and the independent verdict `G5D_2H_DB_ANONYMIZATION_RETENTION_OWNER_LIFECYCLE_SCHEMA_FOUNDATION_INDEPENDENT_READ_ONLY_FOCUSED_REVIEW_PASS`. This unit adds only the schema and contract foundation required by the future focused atomic account-deletion DB finalizer. It does not install or run that finalizer, delete or anonymize product data, apply migration `0024` to Canonical Staging, call Auth/Provider/Storage, enable the destructive guard, or advance Auth/completion.

## Accepted authority and preflight

- Workspace/git root: `/Users/karasawatakahiro/Developer/native-minute`.
- Branch: `codex/g3-mobile-main-loop`.
- HEAD and upstream: `975d36cf1a94e835426211e34971a03e1ff4bfaf`.
- Tracked tree was clean; the only pre-existing untracked path was `supabase/.temp/`.
- `npm run check:workspace` and initial `git diff --check`: PASS.
- G5D-2G: `CLOSED_COMMITTED_PASS`; G5D-2 and Gate 5: `OPEN`.
- Accepted Canonical Staging authority: migrations `0001`–`0023` exact, pending `0`; migration `0024` absent.
- Destructive account-deletion guard: disabled.
- Required repository authorities were reconciled: AGENTS, current-state, README setup reference, G5D-2D inventory matrix, G5D-2G result, retention authority, migrations `0001`–`0023`, DB types, legacy DB cleanup, voice lifecycle, and quota services.

## Exact current 18-table DB contract

Inventory version: `g5d-2h.account-db.v1`.

| Table | Disposition | Exact foundation authority |
| --- | --- | --- |
| `profiles` | `DELETE` | explicit owned-row deletion before Auth |
| `scripts` | `DELETE` | owned scripts after Storage absence |
| `script_audios` | `CASCADE` | cascade from classified script deletion |
| `takes` | `DELETE` | owned takes after recording absence |
| `weak_words` | `CASCADE` | cascade from classified take deletion |
| `coach_feedback` | `CASCADE` | cascade from classified take deletion |
| `script_saved_model_audios` | `CASCADE` | dependent saved-library state |
| `script_saved_best_takes` | `CASCADE` | dependent saved-take state |
| `voices` | `DELETE` | only after Provider and Storage terminality |
| `voice_consents` | `DELETE` | only after consent-recording absence |
| `processing_consents` | `DELETE` | owned processing-consent history |
| `voice_deletion_operations` | `BLOCKING_AUTHORITY -> ANONYMIZE_RETAIN` | active/manual/failed/invalid rows block; only completed verified scrubbed audit may retain |
| `voice_deletion_targets` | `RETAIN_SCRUBBED` | retain only under an eligible completed parent; parent retention purge cascades |
| `voice_asset_write_intents` | `BLOCKING_AUTHORITY -> DELETE` | reserved/manual rows block; completed/cancelled rows are delete candidates |
| `account_deletion_requests` | `ANONYMIZE_RETAIN` | retain the current scrubbed request authority; prior classified rows are future delete candidates |
| `account_deletion_provider_targets` | `RETAIN_SCRUBBED` | closed Provider sub-finalizer evidence; parent purge cascades |
| `quota_events` | `ANONYMIZE_RETAIN` | scrub identifiers; retain safe classifications only to `attempted_at + 90 days` |
| `account_deletion_storage_targets` | `RETAIN_SCRUBBED` | closed Storage sub-finalizer evidence; parent purge cascades |

The future DB stage must re-fetch the exact owned request and require both persisted prerequisites:

- `provider_cleanup_status IN ('succeeded', 'not_needed')` and `provider_sub_finalized_at IS NOT NULL`;
- `storage_cleanup_status IN ('succeeded', 'not_needed')` and `storage_sub_finalized_at IS NOT NULL`.

The TypeScript contract records all 18 tables explicitly. It is not a generic retention framework and is not executable cleanup authority.

## Migration 0024 foundation

`0024_g5d_2h_db_anonymization_retention_owner_lifecycle_foundation.sql` adds three bounded foundations.

### Completed voice-deletion audit owner lifecycle

- `voice_deletion_operations.user_id` and `voice_deletion_targets.user_id` become nullable.
- The operation Auth FK changes to `ON DELETE SET NULL`.
- Targets have a standalone parent `ON DELETE CASCADE` FK for retention purge plus the composite `(operation_id, user_id)` owner FK with `ON UPDATE CASCADE ON DELETE CASCADE`.
- Owner removal is allowed only for a completed operation with succeeded snapshot, succeeded/not-needed consent withdrawal, succeeded post-delete verification, completion/scrub timestamps, cleared sensitive consent snapshot fields and lease, exact `completed_at + 90 days` audit expiry, and no target outside verified-absent/scrubbed shape.
- `pending`, `processing`, `partial_failure`, `manual_required`, unsafe `failed`, and invalid completed rows reject owner removal. Direct child owner removal and cross-user parent/child pairs reject.
- Completed operation evidence and scrubbed target lifecycle/locators remain immutable. Parent retention purge cascades target purge.
- Auth-like owner deletion fails closed while an unsafe voice operation exists and succeeds without losing a valid retained audit after canonical scrubbing.
- Trigger functions use fixed `pg_catalog, public` search paths; owner-cascade trigger execution is narrowly `SECURITY DEFINER`; direct execute is revoked from `PUBLIC`, `anon`, `authenticated`, and `service_role`.
- `voice_deletion_operations_audit_expires_at_idx` supports future retention cleanup selection.

### Quota anonymization and retention lifecycle

- `identifier_scrubbed_at` and non-null `retention_expires_at` are added; expiry is exactly `attempted_at + interval '90 days'`.
- Existing-row backfill changes only missing retention expiry metadata. The normal `updated_at` trigger is disabled only around that statement and the migration emits its affected-row count. The disposable clean migration affected `0` rows.
- `quota_events.user_id` becomes nullable and its Auth FK changes to `ON DELETE SET NULL`.
- An anonymized retained row must atomically clear `subject_id`, `target_resource_id`, `idempotency_key`, `dedupe_key`, `request_fingerprint`, and `provider_request_id`, replace metadata with exact `{}`, and set `identifier_scrubbed_at`. Safe event/status/category/provider/model classifications remain available.
- Owner restoration, scrub-timestamp rewrite, attempted-at rewrite, and retention-expiry rewrite are rejected. Wrong expiry and partial scrub shapes are rejected.
- Account deletion does not restart the 90-day window. Expired and non-expired selection is supported by `quota_events_retention_expires_at_idx`.

### Account-request DB-stage evidence and terminal protection

`account_deletion_requests` gains:

- `db_inventory_version = 'g5d-2h.account-db.v1'`;
- `db_observed_row_count`;
- `db_deleted_row_count`;
- `db_anonymized_row_count`;
- `db_retained_row_count`;
- `db_sub_finalized_at`.

Counts are nonnegative and the inventory version is exact. Until the next focused finalizer replaces this temporary foundation trigger, inserts or transitions to DB `succeeded`/`not_needed` and writes of `db_sub_finalized_at` fail closed, including service-role-like direct attempts. No session GUC, bypass switch, or premature finalizer RPC was added. Terminal evidence is immutable if a pre-existing terminal row is encountered.

## Legacy DB executor isolation

`runDatabaseCleanupActual` still performs its exact read-only request lookup, then returns `db_durable_authority_required` before dry-run inventory, sequential deletion, quota deletion, failed/succeeded request writes, Auth, or completion. `LEGACY_DATABASE_CLEANUP_DURABLE_AUTHORITY_REQUIRED=true` is a fixed code authority, not an environment guard. Static and behavioral self-tests prove the guard precedes every legacy mutation path.

## Clean and runtime PostgreSQL proof

A disposable local Supabase/PostgreSQL stack, separate from repository `supabase/.temp/`, applied migrations `0001`–`0024` from empty state. Results:

- workspace/applied `0024` SHA-256 match: `2350308fe953307f3feef10f96d74edc9dbd772ff69acf233ce73ee8380dab73`;
- exact migration history: 24 migrations;
- exact public table inventory: 18;
- migration `0024` quota metadata backfill: 0 rows on the clean fixture;
- `supabase db lint --local --level warning --fail-on warning`: PASS, findings `[]`;
- catalog proof: nullable/FK/check/index/trigger/search-path/ACL foundation present;
- valid completed voice owner anonymization and child propagation: PASS;
- invalid active/manual/failed/completed owner anonymization: rejected;
- target lifecycle/locator immutability and parent purge cascade: PASS;
- quota canonical scrub, wrong/partial scrub rejection, immutable 90-day anchor, expired/non-expired classification: PASS;
- direct and service-role-like DB terminal writes: rejected;
- premature Auth-like deletion: rejected for unsafe voice/quota rows, permitted after canonical safe shape while retained audit rows survive;
- User A/B isolation and tagged-fixture cleanup: PASS.

The independent review additionally applied `0001`–`0023` to a separate disposable local Supabase/PostgreSQL stack, inserted one nonzero quota fixture, and then applied exact migration `0024`. The row survived; `retention_expires_at` became exactly `attempted_at + 90 days`; identity/content and `updated_at` were unchanged; the normal timestamp trigger was re-enabled; identifier, owner, scrub-timestamp, and retention-anchor restoration attempts rejected. The supplemental verdict was:

`G5D_2H_NONZERO_QUOTA_BACKFILL_AND_IMMUTABILITY_PASS`

Final isolated verdict:

`G5D_2H_ISOLATED_POSTGRES_RUNTIME_PROOF_PASS`

Counters: exact public tables `18`; product cleanup `0`; real Auth `0`; Provider `0`; Storage `0`; Staging mutation `0`; completion `0`.

## Focused and regression proof

- DB foundation contract: PASS, 7/7.
- account-deletion domain/route/Provider-durable/Storage-durable plus DB foundation: PASS, 59/59.
- Provider durable runner: PASS, 24/24.
- Storage durable/writer regression: PASS, 18/18.
- legacy DB cleanup guard, Provider cleanup, Storage cleanup: PASS.
- canonical Provider and Storage operator fake proofs: PASS.
- operator core and fake-only rehearsal: PASS.
- `npm run check:workspace`: PASS.
- `npm run lint`: PASS, warnings `0`.
- `npm run mobile:lint`: PASS, warnings `0`.
- `npm run build`: PASS; only the pre-existing stale Browserslist-data advisory was emitted.
- `npm run typecheck`: PASS after build.
- `npm run mobile:typecheck`: PASS for source and tests.

Provider and Storage authorities were not changed. Runtime proofs used injected fakes or isolated tagged database fixtures; real Provider/Storage/Auth calls and product cleanup remained `0`.

## Scope, staging, and findings

- Canonical Staging remains accepted at migrations `0001`–`0023` exact, pending `0`; migration `0024` is repository-only and was not applied or previewed against linked Staging.
- Canonical Staging/Production access, mutation, or deployment: `0`.
- Product DB deletion/anonymization: `0`.
- Real Auth/Provider/Storage/completion calls: `0/0/0/0`.
- Destructive guard enablement: `0`; environment unchanged.
- Atomic DB finalizer/RPC: `0`; Auth/completion wiring: `0/0`.
- Closeout commit/push: the exact intended G5D-2H diff only, by one normal fast-forward push.
- P0: `0`.
- P1: `0`.
- P2: `0` in this focused foundation scope.
- Correctness UNKNOWN: `0`.
- Stop conditions encountered: `0`.

Final status:

`G5D-2H = CLOSED_COMMITTED_PASS`

P0 / unresolved correctness P1 / P2 / correctness UNKNOWN remain `0/0/0/0`. G5D-2 overall and Gate 5 remain `OPEN`; the atomic 18-table DB finalizer, DB canonical operator wiring, real cleanup/anonymization, Auth deletion/recovery, completion, purge, Canonical Staging apply, and live destructive proof remain unfinished.

The exact next one action, not started here, is:

`G5D_2I_MIGRATION_0024_CONTROLLED_STAGING_APPLY_AND_NON_DESTRUCTIVE_SMOKE`
