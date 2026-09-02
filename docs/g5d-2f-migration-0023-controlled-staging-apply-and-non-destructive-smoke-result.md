# G5D-2F Migration 0023 Controlled Staging Apply and Non-Destructive Smoke

Recorded: 2026-09-02

Mode: `G5D_2F_MIGRATION_0023_CONTROLLED_STAGING_APPLY_AND_NON_DESTRUCTIVE_SMOKE_V1`

Closeout mode: `G5D_2F_FINAL_AUTHORITY_DOCS_CLOSEOUT_COMMIT_AND_PUSH_V1`

Status: `CLOSED_COMMITTED_PASS`

Authority: `G5D_2E_FINAL_AUTHORITY_CLOSEOUT_COMMITTED_AND_PUSHED_PASS` at source `26a8b3db85dd62322eaea16997746ecae82fb4d1`.

Accepted authorities:

- `G5D_2F_MIGRATION_0023_CONTROLLED_STAGING_APPLY_AND_NON_DESTRUCTIVE_SMOKE_PASS_PENDING_REVIEW`.
- `G5D_2F_STAGING_APPLY_AND_NON_DESTRUCTIVE_SMOKE_INDEPENDENT_READ_ONLY_REVIEW_PASS`.

G5D-2F is `CLOSED_COMMITTED_PASS`. G5D-2 overall and Gate 5 remain `OPEN`. This result records one controlled schema migration and read-only Staging catalog proof; it does not authorize or prove live Account deletion or Storage-target execution.

## Canonical Staging identity

- Project: `native-minute-staging`.
- Project ref: `ztlliqishddrrvqqrrlu`.
- Region: `ap-northeast-1`.
- Linked state: exact match and `ACTIVE_HEALTHY`.
- The only other visible project was inactive and unlinked. Production access/mutation was `0`.
- Preflight local/upstream source: `26a8b3db85dd62322eaea16997746ecae82fb4d1`.
- Tracked worktree was clean; existing `supabase/.temp/` remained untracked and was not staged.
- Destructive guard remained disabled.

## Migration identity and controlled apply

Repository migration: `0023_g5d_2e_account_deletion_storage_durable_state.sql`.

SHA-256: `4132279e9d2850a22b6e19084bd7981193719928b69032a8d5848e188a027d17`.

The working file and `HEAD` object produced the same hash. This is the same committed migration reviewed with the G5D-2E isolated PostgreSQL proof; source, migration, tests, package metadata, and DB types were not changed in this unit.

Pre-apply linked history was exactly contiguous `0001` through `0022`: `0022` appeared once, `0023` was absent remotely, and missing, future, or unknown migrations were `0`. The local set was exactly `0001` through `0023`.

The top-level migration audit found only the intended schema, constraint, index, function, trigger, RLS/ACL, and Storage-policy changes. All INSERT/UPDATE statements are inside focused function definitions and were not invoked. There is no top-level fixture/product-row DML, Storage object mutation, Provider mutation, Auth mutation, retention implementation, or DB/anonymization implementation.

The official linked dry-run with vault updates skipped listed exactly `0023_g5d_2e_account_deletion_storage_durable_state.sql`. Seeds, roles, vault updates, `0024+`, and other migrations were `0`.

The approved normal linked command applied migration `0023` exactly once:

`npx --no-install supabase db push --linked --skip-vault --yes`

No manual SQL patch, migration repair, squash, seed, role change, vault update, deploy, or second apply was used.

Post-apply linked history is exactly contiguous `0001` through `0023`, with `0023` once. A second official dry-run reported the remote database up to date with pending migrations, seeds, and roles all `0`.

## Parent and target schema smoke

The actual Staging schema/catalog dump confirmed:

- all 15/15 Storage-durable parent fields exist with the committed types, defaults, and nullability, with 6/6 focused parent constraints;
- all 12/12 prior Provider-durable parent fields remain present;
- `public.account_deletion_storage_targets` exists, is owned by `postgres`, and has all 25/25 committed durable columns;
- target kinds are exactly `recording`, `script_audio`, `voice_sample`, and `voice_consent_recording`, mapped to the four intended buckets;
- all 11/11 target lifecycle, one-generation, verification, retry/manual, immutable-locator, and scrub constraints exist;
- all 5/5 focused indexes exist: locator/fingerprint uniqueness, status/retry traversal, and parent lease expiry;
- the standalone request FK and composite request/owner FK both exist with `ON DELETE CASCADE`; the composite FK also keeps `ON UPDATE CASCADE`;
- the parent Auth FK remains `ON DELETE SET NULL`, and parent `(id, user_id)` uniqueness remains present.

No destructive Auth-null or parent-purge fixture was created on Staging. Their runtime behavior remains part of the G5D-2E isolated PostgreSQL evidence.

## Effective Storage policies and writer fence

Actual `storage.objects` policy state has exactly the four authenticated owner-read policies: `recordings_select_own`, `script-audios_select_own`, `voice-samples_select_own`, and `voice-consents_select_own`. Authenticated SELECT authority is intended owner read only.

Authenticated INSERT/UPDATE/DELETE policies for all four bucket classes are absent: INSERT `0`, UPDATE `0`, and DELETE `0` direct mutation authority. In particular, the old migration-`0006` `script-audios` authenticated writer bypass is `0`. `storage.objects` RLS remains enabled, so owner playback/read remains available.

Read-only source inspection confirms the committed application boundary remains server/admin Storage writer plus durable write intent for recordings, script audios, voice samples, and voice consents. Reservation precedes external work, and active account deletion or collecting/sealed Storage authority fails closed. No upload or Storage object mutation was performed in this unit.

## RLS, ACL, RPC, and trigger smoke

`public.account_deletion_storage_targets` has RLS enabled. `anon` and `authenticated` have direct mutation authority `0`; `service_role` has intended SELECT and direct INSERT/UPDATE/DELETE/TRUNCATE authority `0`. Focused mutations remain RPC authority only.

All ten expected focused RPCs exist with their committed signatures and return shapes:

1. `begin_account_deletion_storage_snapshot`
2. `seal_account_deletion_storage_snapshot`
3. `claim_account_deletion_storage_lease`
4. `release_account_deletion_storage_lease`
5. `begin_account_deletion_storage_delete_attempt`
6. `record_account_deletion_storage_delete_result`
7. `begin_account_deletion_storage_verification_attempt`
8. `record_account_deletion_storage_verification_result`
9. `finalize_account_deletion_storage_stage`
10. `finalize_recording_upload_write_intent`

For all ten, actual authority is owner `postgres`, `SECURITY DEFINER`, fixed `search_path=pg_catalog, public`, no PUBLIC/`anon`/`authenticated` EXECUTE, and intended `service_role` EXECUTE. None was called.

All eight expected G5D-2E trigger attachments exist exactly once with the committed tables/events/timing: target updated-at; take, voice-consent, voice, script-audio, and script-source writer/source fences; Storage parent lifecycle/immutability; and Storage target lifecycle/immutability. Duplicate expected trigger attachments were `0`.

Prior Provider durability also remains structurally intact: 12/12 parent fields, 8/8 focused Provider RPCs, and 3/3 Provider triggers remain present.

## Existing-data and non-destructive boundary

- Pre-apply safe table statistics: `account_deletion_requests=0`.
- Post-apply exact service-role aggregate: `account_deletion_requests=0`, `account_deletion_storage_targets=0`.
- Top-level product-row DML in migration: `0`.
- Existing product-row mutation attributable to apply: `0`.
- Account deletion request creation, snapshot begin/seal, lease, delete generation, verification, finalizer, or writer-intent mutation: `0`.
- Storage upload/INSERT/UPDATE/DELETE/info calls: `0`.
- Provider calls: `0`.
- DB cleanup/anonymization: `0`.
- Auth deletion: `0`.
- Notification/account completion: `0`.
- Production access/mutation: `0`.
- Destructive guard enablement: `0`; it remains disabled.

## Evidence distinction and validation

G5D-2E's isolated PostgreSQL proof behaviorally established trigger/RPC transitions, FK lifecycle, two-session concurrency, lease/CAS, delete generation `0 -> 1`, verification-first recovery, atomic finalization/rollback, Auth-null/purge, and User A/B isolation.

G5D-2F establishes that the exact committed migration is deployed to Canonical Staging and that the actual Staging catalog, ACL, Storage policies, RPC identities, and trigger attachments match. It intentionally does not repeat destructive fixtures or live Storage deletion on Staging.

The absence of live destructive behavior in G5D-2F is the intended evidence boundary, not a correctness `UNKNOWN`.

- `npm run check:workspace`: PASS.
- pre/post migration history: PASS.
- exact-one dry-run/apply/post-dry-run: PASS.
- parent/target schema, FK, constraints, and indexes: PASS.
- effective four-bucket Storage policy: PASS; authenticated mutation bypass `0`.
- RLS/ACL: PASS.
- focused RPC authority: PASS, 10/10.
- trigger attachment: PASS, 8/8, duplicates `0`.
- exact post-apply aggregate counts: PASS, `0/0`.
- writer-fence structural source smoke: PASS.
- `git diff --check`: PASS after documentation sync.
- independent read-only review: `G5D_2F_STAGING_APPLY_AND_NON_DESTRUCTIVE_SMOKE_INDEPENDENT_READ_ONLY_REVIEW_PASS`.
- Lint, typecheck, build, and tests were not rerun because source, migration, tests, package metadata, and DB types were not changed.
- P0: `0`; unresolved correctness P1: `0`; P2: `0`; correctness UNKNOWN: `0`.

Next single action: `G5D_POST_2F_NEXT_TECHNICAL_UNIT_RECONCILIATION`.

Do not start that reconciliation, canonical Storage operator wiring, DB/anonymization work, or live destructive proof in this closeout.
