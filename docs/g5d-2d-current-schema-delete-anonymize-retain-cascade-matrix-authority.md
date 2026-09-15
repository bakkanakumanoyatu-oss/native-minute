# G5D-2D current-schema delete / anonymize / retain / cascade matrix authority

- Recorded: 2026-09-02
- Mode: `G5D_2D_CURRENT_SCHEMA_DELETE_ANONYMIZE_RETAIN_CASCADE_MATRIX_REPOSITORY_AUTHORITY_DOCS_ONLY_V1`
- Accepted input: `G5D_2D_CURRENT_SCHEMA_DELETE_ANONYMIZE_RETAIN_CASCADE_MATRIX_AUTHORITY_PASS`
- Result: `G5D_2D_CURRENT_SCHEMA_DELETE_ANONYMIZE_RETAIN_CASCADE_MATRIX_REPOSITORY_AUTHORITY_DOCS_ONLY_PASS`
- Unit status after the docs closeout: `G5D-2D = CLOSED_COMMITTED_PASS`
- Overall status: `G5D-2 = OPEN`, `Gate 5 = OPEN`

## Scope and authority

This document is the canonical repository authority for the current-schema account-deletion resource matrix. It fixes the required `DELETE`, `ANONYMIZE`, `RETAIN`, `CASCADE`, `BLOCK`, verification, retention, and purge semantics that later Storage, DB/anonymization, Auth/completion, and retention work must implement.

The accepted retention and governance authority remains `docs/hdc-gate5-retention-provider-governance-and-public-copy-v2.md`. The already-closed G5C, G5D-1, G5D-2A, G5D-2B, and G5D-2C results remain valid and are not reopened by the implementation gaps recorded here. G5D-2A/G5D-2B define the account-specific Provider durable model, and G5D-2C is the canonical authority that migration `0022` is applied and verified on canonical Staging. The B7 Option D evidence remains historical and target-specific; it is not a general Provider-absence rule.

This unit changes documentation only. It does not add a table, migration, RPC, repository, runner, test, Storage operation, DB/Auth operation, Provider call, Staging/Production mutation, destructive-guard enablement, public-copy rewrite, or legal-policy redesign. A foreign-key cascade describes current mechanics; it is not deletion policy. Supabase Auth deletion must not be used as an unclassified cleanup stage.

## Inventory boundary

The concrete inventory is exactly 24 resources:

- 17 current user-related public tables
- 4 Storage buckets
- `auth.users`
- external Provider assets
- operational logs

The authority matrix also includes two logical rows, deletion audit/evidence and legal-hold control. They are views/control concepts, not claims that two additional DB tables currently exist. Therefore this document contains 26 authority rows while preserving a concrete resource total of 24.

## Current public-table matrix (17/17)

`Migration` means whether the accepted future account-deletion authority requires forward-only schema support for that row. `No` does not mean that implementation work is already complete; it means no row-specific schema change was identified by this authority.

| # | Current table and owner relation | Current FK/cascade mechanics | Canonical account-deletion action and ordering | Retention, verification, and failure authority | Migration |
|---|---|---|---|---|---|
| 1 | `profiles`; `id` is the Auth user ID | `profiles.id -> auth.users.id ON DELETE CASCADE` | `DELETE` in the atomic DB stage | Verify the owned row is absent in the DB finalizer. Do not defer this classified delete to Auth cascade. | No |
| 2 | `scripts`; owned by `user_id` | `scripts.user_id -> auth.users.id ON DELETE CASCADE` | `DELETE` in the atomic DB stage, after dependent Storage absence has been proved | Re-fetch the owned set in the transaction and prove the post-state. Historical take/review meaning is not retained by leaving scripts behind. | No |
| 3 | `script_audios`; ownership is derived from `script_id -> scripts.user_id`; `storage_path` is the stored-asset locator | `script_audios.script_id -> scripts.id ON DELETE CASCADE` | `CASCADE` from script deletion only after every canonical `script-audios` Storage target is exactly absent | Listing omission is not absence. Known locators missing from a listing remain individual sealed targets. Any unresolved/malformed locator blocks or becomes `manual_required`. | No |
| 4 | `takes`; owned by `user_id`, with canonical recording locator `audio_path` | Both `script_id -> scripts.id` and `user_id -> auth.users.id` use `ON DELETE CASCADE` | `DELETE` only after the corresponding `recordings` object is exactly absent | Re-fetch owned takes and verify zero after the atomic DB stage. Do not let script/Auth cascade bypass recording verification. | No |
| 5 | `weak_words`; ownership is derived from `take_id` | `weak_words.take_id -> takes.id ON DELETE CASCADE` | `CASCADE` from classified take deletion | Included in post-DB count/zero proof through the owned take universe. | No |
| 6 | `coach_feedback`; ownership is derived from `take_id` | `coach_feedback.take_id -> takes.id ON DELETE CASCADE` | `CASCADE` from classified take deletion | Included in post-DB count/zero proof through the owned take universe. | No |
| 7 | `script_saved_model_audios`; owned by `user_id` and related to a script/audio | Auth user, script, and script-audio FKs all cascade | `CASCADE` as dependent saved-library state in the atomic DB stage | The cascade is permitted only inside the classified script/script-audio cleanup whose Storage prerequisite has passed. | No |
| 8 | `script_saved_best_takes`; owned by `user_id` and related to a script/take | Auth user, script, and take FKs all cascade | `CASCADE` as dependent saved-library state in the atomic DB stage | The cascade is permitted only inside the classified take cleanup whose recording prerequisite has passed. | No |
| 9 | `voices`; owned by `user_id`; carries Provider and sample-Storage bindings | `voices.user_id -> auth.users.id ON DELETE CASCADE`; consent/voice references elsewhere may be `SET NULL` | `DELETE` only after the account Provider universe is terminal and the related voice sample/consent Storage universe is terminal | Provider and Storage require verified absence. Ambiguous authority, active voice deletion, or unresolved write intent blocks DB cleanup. | No |
| 10 | `voice_consents`; owned by `user_id`; consent-recording locator is in canonical metadata | `voice_consents.user_id -> auth.users.id ON DELETE CASCADE` | `DELETE` only after the consent recording is exactly absent | Source material has an internal 24-hour target, and account deletion deletes it earlier. Missing/ambiguous locator authority is never interpreted as absence. | No |
| 11 | `processing_consents`; owned by `user_id` | `processing_consents.user_id -> auth.users.id ON DELETE CASCADE` | `DELETE` in the atomic DB stage | Current DB cleanup omits this table. Re-fetch and post-state verification are required. | No |
| 12 | `voice_deletion_operations`; currently owned by non-null `user_id` | Current owner FK cascades from Auth; targets currently cascade through the operation/owner relation | Lifecycle-dependent: `BLOCK`, `DELETE`, or `ANONYMIZE + RETAIN` according to the voice-operation mapping below | A verified, scrubbed completed operation is anonymized and retained until `completed_at + 90 days`; expired audit is purged. Unsafe active/manual/unknown state blocks. | **Yes**: nullable owner, `SET NULL`, retention-safe purge |
| 13 | `voice_deletion_targets`; currently tied to `operation_id + user_id` | Current composite FK cascades from `voice_deletion_operations` | Retain only safe metadata with a retained completed operation; purge by parent `CASCADE` | Locators/owner must be scrubbed before retained evidence is safe. Current shape needs post-Auth parent continuity and later purge semantics. | **Yes**: nullable owner, dual FK, purge cascade |
| 14 | `voice_asset_write_intents`; owned by `user_id` | Current owner FK cascades from Auth | `reserved` or `manual_required` is unresolved and `BLOCK`s account DB/Auth progress; terminal `completed`/`cancelled` intent is `DELETE` | All applicable intent locators must be included in the sealed Storage universe before terminal rows are deleted. Routine 24-hour cleanup requires a separate narrow control noted below. | No account-path row change; separate narrow Gate 5 control remains |
| 15 | `account_deletion_requests`; current owner is nullable `user_id`, with UUID and `anonymized_user_ref` continuation authority | `user_id -> auth.users.id ON DELETE SET NULL` | Retain only the current completed request: `ANONYMIZE + RETAIN` for 90 days from completion, then purge. Delete prior cancelled/expired owned requests where applicable during DB cleanup. | Before Auth, `user_id` is owner authority. After Auth, use request UUID/opaque ref only. Completion evidence, expiry, scrub, recovery, and narrow hold controls are incomplete today. | **Yes**: completion audit, Auth recovery, expiry/purge, narrow hold control, plus Storage parent fields |
| 16 | `account_deletion_provider_targets`; child of the account request, with nullable `user_id` | Standalone request FK preserves parent purge cascade; composite request/owner FK follows parent owner changes | After strict Provider absence, scrub locator and owner and `RETAIN` safe metadata with the current completed request; parent purge `CASCADE`s the child | Existing G5D-2A/2B terminal authority remains. No raw Provider locator, source ID, owner, fingerprint, or lease value may remain in retained evidence. | No additional row-specific change identified |
| 17 | `quota_events`; currently owned by non-null `user_id` | Current owner FK cascades from Auth | Immediately anonymize identifiers in the DB stage; retain safe operational classification until each event reaches `attempted_at + 90 days`; purge already-expired and later-expiring rows | Retention starts at each event's `attempted_at`, not account-deletion completion. Current immediate-delete behavior is obsolete, and Auth cascade must not erase retained events. | **Yes**: anonymizable owner, scrub, expiry, purge |

## Non-table and logical matrix (9 rows)

Rows 18-24 complete the 24 concrete resources. Rows 25-26 are additional logical authority only.

| # | Resource | Canonical authority | Verification, retention, and failure authority | Schema consequence |
|---|---|---|---|---|
| 18 | Storage bucket `recordings` | Seal exact owner-prefix objects and DB-known `takes.audio_path` locators; delete before the related take | Verify exact absence per target. Include exact-prefix orphans and known locators missing from list results. Ambiguous ownership is `manual_required`; never infer absence. | Shared account Storage durable target authority required |
| 19 | Storage bucket `script-audios` | Derive owner through the script and seal DB-known `script_audios.storage_path` plus exact owner-prefix objects; delete before DB cascade | Verify exact absence per target. Writers are fenced while the immutable universe is sealed/executed. | Shared account Storage durable target authority required |
| 20 | Storage bucket `voice-samples` | Seal voice, consent, write-intent, DB-known, and exact owner-prefix targets; delete on account deletion or earlier routine expiry | Exact absence required. Internal source-material target is 24 hours; account deletion takes precedence. | Shared account Storage durable authority; separate routine 24-hour control remains |
| 21 | Storage bucket `voice-consents` | Seal consent metadata, write-intent, DB-known, and exact owner-prefix targets; delete on account deletion or earlier routine expiry | Exact absence required. Internal source-material target is 24 hours; account deletion takes precedence. | Shared account Storage durable authority; separate routine 24-hour control remains |
| 22 | `auth.users` | Delete only after the full Auth prerequisite conjunction below has durable proof | Durable pre-dispatch intent/CAS, bounded delete, and exact `getUserById` absence verification are required. Ambiguity is not success. | Auth/completion durable fields and finalization authority required |
| 23 | External Provider assets | Use the G5D-2A/G5D-2B sealed Provider target and terminal sub-finalizer authority | Strict verified absence is required. B7 Option D is not generalized. Provider terminality precedes Storage, DB, and Auth progression. | Migration `0022` already provides the current Provider durable model |
| 24 | Operational logs | External runtime/platform logs only; no public application DB log table currently exists | Target retention is 30 days. Production verification is required, and this authority makes no physical-purge guarantee for provider/platform systems. | No current application table is invented |
| 25 | Logical deletion audit/evidence | Reviewer-safe logical view over completed voice deletion rows, the account request/targets, future Storage targets, and safe evidence | Retain through completion + 90 days, then purge unless a specifically authorized legal hold applies. Raw identity, locator, lease, email, Provider ID, Storage key, and payload data are forbidden. | Implement through the listed durable rows/fields; do not infer a new table here |
| 26 | Logical legal-hold control | Only explicitly authorized, narrowly scoped held evidence is protected | Block any destruction/anonymization that invalidates held evidence; block Auth when owner linkage must remain; do not auto-clear hold/manual state; after release resume at the first incomplete stage; indefinite retention is prohibited. | Narrow control on the account authority; no generic legal-hold system is authorized |

## Sealed Storage universe and ordering

The future account Storage parent is `account_deletion_requests`. Its exact target kinds are:

- `recording`
- `script_audio`
- `voice_sample`
- `voice_consent_recording`

The immutable universe must combine, without omission:

- canonical DB-known locators;
- every applicable `voice_asset_write_intents` locator;
- every object returned under the exact user-owned prefix, including orphans;
- a known canonical locator that listing did not return, represented as its own target.

Every target requires a stable target ID, request ID, immutable fingerprint, exact bucket/key locator, pre-Auth owner, canonical DB source row when present, and orphan-prefix provenance when applicable. Universe sealing and the shared user-scoped writer fence must be atomic. A target then has durable delete/verification state, lease/CAS ownership, stale-result rejection, a retry-versus-manual classification, and no more than one external Storage action per runner invocation.

The Storage sub-finalizer may scrub locator/source/fingerprint only after all sealed targets are verified absent. Only that sub-finalizer may mark the parent Storage stage terminal. Retained evidence must be safe, the child owner must become `NULL` after Auth without losing its parent relation, and parent purge must cascade to Storage targets.

Bucket ordering is fixed:

1. Delete and verify `recordings` before deleting `takes`.
2. Delete and verify `script-audios` before cascading `script_audios`/scripts.
3. Delete and verify `voice-samples` before deleting its voice/consent bindings.
4. Delete and verify `voice-consents` before deleting `voice_consents`.

Malformed or ambiguous ownership is `manual_required`. A missing listing entry, missing DB row, failed listing, timed-out response, or malformed locator never proves absence.

## Voice-deletion durable lifecycle mapping

| Existing voice operation state | Account-deletion authority |
|---|---|
| `pending` | Reconcile or cancel first; `BLOCK` |
| `processing` | Reconcile first; `BLOCK` |
| `partial_failure` | Reconcile first; `BLOCK` |
| `manual_required` | `BLOCK`; do not auto-clear |
| `failed` | `DELETE` in the atomic DB stage only when `destructive_started_at IS NULL`, no lease exists, and every locator is included in the account Provider/Storage sealed universes; otherwise `manual_required` |
| `completed`, verified and scrubbed | Anonymize owner, retain safe audit metadata through `completed_at + 90 days` |
| `completed` but not verified/scrubbed | `BLOCK` and require reconciliation/manual handling |
| Completed audit past expiry and not held | Purge operation parent; targets cascade |

This mapping preserves the voice-only durable state as input to the account deletion, rather than treating Auth cascade as cleanup. A pending/processing/partial operation must first be reconciled or safely cancelled; if it becomes a safe non-audit row, its eventual classified action is `DELETE`, while only verified and scrubbed completed audit is retained. B7 Option D remains bound to its historical exact target and evidence.

## Account request, Auth, and completion lifecycle

Before Auth deletion:

- `account_deletion_requests.user_id` is the owner authority.
- Child Provider targets retain their exact request/user relation.
- Provider, Storage, and DB/anonymization must each be terminal.
- Active, manual, ambiguous, or unknown voice deletion/write authority blocks progression.
- Owner and sealed snapshot counts must match.

At Auth deletion, the parent `user_id` becomes `NULL` through `ON DELETE SET NULL`; the existing child owner relationship follows the parent update, while the standalone request FK preserves later parent-purge cascade.

After Auth deletion, recovery and finalization use only request UUID or opaque reference. They must not use raw identity or recreate an Auth user. The request and scrubbed child evidence are retained until completion + 90 days, then the parent is purged and its children cascade if no legal hold applies.

Retained audit evidence must not contain raw metadata, locator, lease token, email, user ID, Provider ID, Storage key, raw Provider response, signed URL, or payload content.

The exact Auth prerequisite is a conjunction:

`Provider terminal AND Storage terminal AND DB/anonymization terminal AND no active/manual/unknown voice deletion or write authority AND no blocking legal hold AND owner/snapshot counts match`.

The future Auth flow requires:

1. Persist a durable Auth-delete intent using CAS before dispatch.
2. Make one bounded Auth delete call.
3. Verify exact absence using `getUserById`; ambiguous response is not success.
4. Finalize by request UUID/opaque ref after Auth.
5. Atomically write completion, expiry, scrubbed safe evidence, and terminal state.
6. Recover `Auth absent + completion write lost` without recreating the user.
7. When Auth is present, retry or enter manual handling using a safe category.

## DB/anonymization authority

The DB stage must become a focused, service-role-only, atomic finalizer/RPC. Within one transaction it must:

- acquire the shared user-scoped writer/deletion authority and re-fetch current ownership/candidates;
- require terminal Provider and Storage stages;
- block unresolved writer intents and unsafe voice-deletion lifecycle states;
- clean all classified product, learning, voice, and consent rows;
- anonymize quota identifiers, purge already-expired quota rows, and preserve unexpired safe classifications to their original expiry;
- preserve and anonymize only verified/scrubbed completed voice audit rows;
- retain only the current account request and scrubbed current children;
- delete prior cancelled/expired owned requests where applicable;
- verify all 17 table categories through expected counts and post-state counts;
- roll back and record safe manual/drift authority on any mismatch;
- write DB terminal/finalizer state in the same transaction;
- be idempotent under retry and preserve User A/B isolation.

The finalizer must not rely on Auth `CASCADE` for ordinary cleanup. Foreign-key cascades are used only after their external-absence and lifecycle prerequisites have been classified and satisfied.

## Quota, operational logs, audit retention, and hold

For each `quota_events` row, retention begins at `attempted_at`. DB cleanup anonymizes identifiers immediately, deletes events already older than 90 days, and preserves only safe operational classification until that same row's rolling 90-day expiry. The current immediate deletion of quota events conflicts with this authority and is obsolete.

Operational logs are held by external/runtime/platform systems, not a current public application log table. Their target is 30 days, subject to Production verification. This repository authority cannot guarantee the physical purge behavior of those external systems.

Deletion audit is a logical reviewer-safe projection over the durable rows/evidence listed in the matrix, retained for 90 days after completion. It is not permission to retain raw identity, locators, leases, audio, text, Provider payloads, or Storage keys.

A legal hold is never inferred. Only a Human/legal decision for a concrete case may authorize a narrow held scope. That hold blocks any stage that would invalidate required evidence and blocks Auth if owner linkage must remain. It is not cleared automatically, does not authorize indefinite retention, and resumes from the first incomplete stage after explicit release. Whether a real case legally qualifies is case-specific authorization, not a missing matrix decision.

## Current implementation gaps (13 open)

These are implementation gaps against this newly recorded authority. They do not retroactively turn the closed G5C/G5D-1/G5D-2A/G5D-2B/G5D-2C units into defects.

1. Current DB cleanup covers 12 categories and omits `processing_consents`, `voice_deletion_operations`, `voice_deletion_targets`, `voice_asset_write_intents`, and `account_deletion_provider_targets`.
2. The current DB executor is sequential rather than atomic.
3. Current immediate deletion of `quota_events` conflicts with the accepted rolling retention rule.
4. Current account-request anonymized-retain summary/evidence is incomplete.
5. The Storage actual path lacks an immutable sealed target universe, per-target durable progress, exact post-delete absence verification, crash/status-loss recovery, and complete writer coordination.
6. Auth deletion lacks durable pre-dispatch intent and exact absence verification.
7. Recovery from Auth success followed by completion-write loss is inadequate.
8. Current Auth cascades would prematurely erase retained quota/audit rows.
9. Unresolved voice write/deletion authority does not yet fully block DB cleanup.
10. There is no 17-table post-DB finalizer/count/zero proof.
11. There is no purge path for account audit, quota, or completed voice audit.
12. The 24-hour source-material lifecycle is not durably enforced.
13. Narrow legal-hold control and Production log-retention verification are missing.

All 13 remain `OPEN` for future implementation.

## Forward implementation authority

### Storage durable state

Future implementation must use `account_deletion_requests` as parent and the four exact kinds listed above. It must provide stable IDs, immutable fingerprinted exact locators, pre-Auth ownership, source-row/orphan provenance, atomic immutable sealing, the shared writer fence, durable per-target state, one external action per invocation, exact absence verification, lease/CAS, stale-result rejection, retry/manual distinctions, sub-finalizer-only scrub, parent terminality only after all targets are absent, safe evidence, owner nullability with parent continuity, and purge cascade.

### Atomic DB/anonymization

Future implementation must provide the focused service-role-only transaction described above: inside-transaction re-fetch, Provider/Storage terminal guards, writer/voice-state blocks, full product/learning/consent cleanup, quota retention behavior, voice audit preservation, current-request-only retention, prior-request deletion, count/post-state proof, rollback/manual drift handling, same-transaction finalization, idempotency, and User A/B isolation.

### Auth/completion

Future implementation must provide durable intent/CAS, bounded Auth action, exact Auth absence verification, opaque post-Auth continuation, atomic completion/expiry/scrub/evidence, lost-write recovery without user recreation, and safe retry/manual behavior when Auth remains present.

## Migration requirements

`Next account-deletion migration required = YES`.

The forward-only account path has five required schema/control groups:

1. Account Storage durable targets and parent Storage durable fields.
2. `voice_deletion_operations` nullable owner / `SET NULL` / retention-safe purge.
3. `voice_deletion_targets` nullable owner / dual FK / purge cascade.
4. `quota_events` anonymizable owner / identifier scrub / expiry / purge.
5. `account_deletion_requests` completion audit / Auth recovery / expiry-purge / narrow hold control.

Atomic DB/anonymization and completion RPCs/triggers belong to that forward-only authority scope as later implementation. Separately, routine post-registration source-material cleanup toward the internal 24-hour target still needs one narrow Gate 5 schema/control mechanism. None of these changes is implemented by G5D-2D.

## Decision completeness and closeout

- Human Decision missing: `0`
- Correctness `UNKNOWN`: `0`
- Retention periods re-decided in this unit: `0`
- P0/P1/P2 opened against already-closed units: `0/0/0`

For this authority-definition/docs-only scope, the PASS condition is:

`G5D_2D_CURRENT_SCHEMA_DELETE_ANONYMIZE_RETAIN_CASCADE_MATRIX_REPOSITORY_AUTHORITY_DOCS_ONLY_PASS`

This closes G5D-2D as `CLOSED_COMMITTED_PASS`. It does not claim Storage implementation, DB/anonymization implementation, Auth/completion implementation, migration application, live deletion proof, or Gate 5 completion. `G5D-2` and `Gate 5` remain `OPEN`.

The exact next one action after this PASS is:

`G5D_2E_ACCOUNT_DELETION_STORAGE_DURABLE_STATE_SCHEMA_REPOSITORY_AND_FAKE_PROOF_V1`

G5D-2E is not started by this unit.

## R2 owner-null hold linkage authority — 2026-09-15

Historical authority-resolution result (current R2 status / next action: see the focused implementation closeout below): `GATE5_R2_OWNER_NULL_HOLD_LINKAGE_AUTHORITY_RESOLVED` (schema authority only). This additive implementation delta leaves the historical G5D-2D PASS above intact. Base: `2c46ef50b03d95906ed19f5598745d90b5cec7dc`. R2 remains `OPEN / PARTIALLY_IMPLEMENTED`; no migration, code, type, test or live operation is performed here.

### Existing authority and exact scope

- Matrix rows 12/13/17/25/26 and “Quota, operational logs, audit retention, and hold” above already require preservation of specifically held Quota and completed Voice evidence. [Human Decision V2](hdc-gate5-retention-provider-governance-and-public-copy-v2.md), sections 3/4/9, fixes retention, necessary-period hold/release and opaque request reference/safe status/count/timestamp evidence. New Human Decision shortage = **0**; neither retention nor legal categories are re-decided.
- [0028](../supabase/migrations/0028_gate5_limited_legal_hold.sql), `account_deletion_legal_hold_scope_valid`, has exactly `database`, `owner_linkage`, `provider`, `retained_audit`, `storage`; `auth` and `completion` are stages, not scopes. Its current `retained_audit` comment/delete guards cover the request and Account Provider/Storage targets only. The missing Quota/Voice association is an implementation gap against this matrix, not a new policy prohibition or a reopening of R3.
- Exact R2 mapping: `retained_audit` also protects the safe Quota rows and completed/scrubbed Voice operation/target audit bound to that request below. On an owned request it protects the corresponding safe retained evidence during DB anonymization, including already-expired evidence that would otherwise be deleted. It permits the prescribed identifier scrub; it does not preserve raw content or block every pre-completion stage. `database` continues to preserve database evidence before DB finalization; `provider`/`storage` retain their existing resource/stage guards; `owner_linkage` protects the request/Auth owner link, not scrubbed audit by itself. Completed requests still accept only `['retained_audit']`. No enum, stage predicate, completed-request six-field UPDATE allowlist, hold CAS or R3 Provider semantics is expanded.

### One durable linkage and binding transaction

| Location | Exact future field / meaning |
| --- | --- |
| `quota_events` | `retention_account_deletion_request_id uuid NULL`: the single Account request whose atomic DB finalizer anonymized this retained event |
| `voice_deletion_operations` | The same field: the single Account request whose atomic DB finalizer anonymized this completed, verified, scrubbed operation |
| `voice_deletion_targets` | No duplicate field; resolve through immutable `operation_id` and the operation's reference |

The value is the existing random internal `account_deletion_requests.id`, not a generated user pseudonym, `anonymized_user_ref` copy, legal-hold cycle reference, or raw identity. It is usable only by server retention/hold/purge authority; no client write, product ownership/authentication/quota-accounting join, user lookup, analytics export or public/raw evidence exposure is authorized. No user ID, email, locator, Provider ID, idempotency/dedupe key or identity-derived hash is retained for this purpose. The FK proves request existence; the finalizer must separately prove exact ownership.

- Only the forward replacement of `finalize_account_deletion_database_stage` may establish the binding. Read the persisted owner, acquire the existing `g5c_b4_lock_voice_asset_user` lock, then lock/re-fetch the exact request and owned candidates. Bind to that invocation's validated `p_deletion_request_id`, never a latest/nearest request, a cancelled prior request, or an inferred timestamp match. Existing conflicting references fail closed; they are never overwritten.
- In the same transaction and same row UPDATE, set the reference **with** `user_id = NULL` and the existing Quota identifier scrub, or with eligible Voice owner anonymization. Voice targets must already be verified/scrubbed; their existing owner-null cascade follows the operation update. Validate reference equality, safe shape, unchanged expiry and D/A/R counts before DB terminal persistence. Any failure rolls back binding and scrub together. Auth and Completion do not establish or repair this reference. R2 must replace the current expired-row DELETE partition with a hold-aware partition: expired held safe evidence is bound/anonymized/retained, not deleted; unheld expired rows need no surviving reference.
- NULL is normal while the row remains owned. Standalone Voice completion scrubs locators and starts its own audit clock while retaining `user_id` (existing Voice finalizer); it creates no Account request and leaves the reference NULL. A later Account DB finalizer binds it if retained. Quota unrelated to Account deletion also remains owned/unbound and keeps its original clock. Owned routine purge uses persisted ownership and related Account hold authority, never invents a request merely to purge, and must serialize with ownership-to-binding transition.
- After 0029, new owner-null INSERTs and owned-to-null transitions without the validated reference are rejected. Once set, the reference cannot be reassigned/cleared or ownership restored; retries only verify the same binding. Pre-linkage owner-null rows are the explicit exception below, not an insertion/backfill bypass. Existing completed Voice immutability permits only this additional finalizer-owned binding coupled to its already-authorized owner anonymization, with all other fields protected.

### FK, clocks and lifetime

Both references have an indexed FK to `account_deletion_requests(id)` with **`ON DELETE RESTRICT / ON UPDATE RESTRICT`**. Account-request CASCADE or SET NULL for these two relations is forbidden. Existing Voice operation-to-target CASCADE and Account request-to-Account Provider/Storage target CASCADE remain unchanged.

Quota expiry remains `retention_expires_at = attempted_at + interval '90 days'`; Voice expiry remains `audit_expires_at = completed_at + interval '90 days'` ([0024](../supabase/migrations/0024_g5d_2h_db_anonymization_retention_owner_lifecycle_foundation.sql)). Account expiry remains Completion + `2160 hours` ([0027](../supabase/migrations/0027_g5d_completion_foundation.sql)). Binding, hold and release never rewrite these anchors. The reference lives exactly as long as its retained row, including a valid hold past expiry.

For forward binding, validate Quota `attempted_at` and Voice `completed_at` are not after the DB-finalization time; Completion cannot precede DB finalization. Verify the resulting child expiries do not exceed Account audit expiry, using the persisted timestamps/SQL intervals rather than assuming wall-clock/timezone ordering. Invalid ordering fails closed; do not change a retention period to repair it. Each child can purge at its own earlier expiry without waiting for Account expiry. At Account expiry, under the request lock, first purge eligible linked rows at **their own** expiry (Voice targets cascade), then delete the completed, expired, unheld request only when no references remain. Bounded batches revisit that request after remaining eligible children are removed; no tombstone, permanent parent pin or expiry restart is introduced. An unexpectedly unexpired/malformed child blocks parent deletion as an integrity exception, not a new retention policy. An active hold prevents row/parent deletion and therefore cannot lose the reference first.

### Lookup and concurrency authority

1. Routine selection is a bounded, non-locking candidate read, not DELETE authority. For an owner-null row, use `row.retention_account_deletion_request_id -> account_deletion_requests.id`; for a Voice target use `target.operation_id -> operation -> request`. Missing reference/parent, malformed hold state or binding drift is never `not held`.
2. Lock the related request `FOR UPDATE` **before** the target row; then lock/re-fetch the Quota row, or Voice operation followed by its targets, and recheck exact binding, safe lifecycle, expiry and scope. Multi-request work locks all related requests in ascending UUID order before targets; target order is `quota_events` → `voice_deletion_operations` → `voice_deletion_targets`, ascending row UUID within each table (skip unrelated tables). Do not first claim target rows with `FOR UPDATE SKIP LOCKED` and then wait on their request. A changed binding/owner abandons the candidate for fresh selection; never acquire its new authority in reverse order. Lock contention may skip/retry a bounded candidate; transaction/serialization failure grants no purge authority. No global advisory lock is authorized.
3. Owner-present work retains the existing user-lock-before-request order and re-fetches **all** requests for that persisted owner, in request-ID order, not only currently held requests. Coordinate request creation/retention hold application and owned-row purge on the same user fence before the request/target locks; recheck if the owner/binding changed. Owner-null work never reconstructs an owner to acquire that fence. The finalizer keeps its current user → request → target order ([0025](../supabase/migrations/0025_g5d_2j_atomic_db_finalizer.sql), current replacement in 0028).
4. Hold apply/release and purge serialize on the same persisted request row. Hold-first commit means no covered purge; purge-first commit means no claim that the deleted evidence was preserved. For a hold intended to cover specified Quota/Voice evidence, the manual retention control transaction must receive exact internal table/row references, lock request then those rows, verify they still exist/belong to that request, and invoke the existing apply authority in that **same transaction**; a missing target rejects with `legal_hold_scope_unavailable`, and a missing request retains `legal_hold_request_not_found`. A preflight SELECT in another transaction is insufficient. The existing request-only `applied` result protects remaining request-bound evidence; it must never be reported as success for an already-purged or unlinked specified row. These availability checks add no new hold scope, cycle, case taxonomy, completed-request field mutation or restoration claim.
5. Release retains the existing exact-reference CAS, leaves all clocks/stages/counters untouched and performs no purge. A later authorized routine independently re-locks/rechecks and purges expired released rows; the request is eligible under `expires_at <= now() AND NOT legal_hold_active` plus terminal-shape/FK checks. Unexpired released rows wait for their original expiry. R2 must enforce the authority at the database mutation boundary, including Voice target cascade/direct-delete bypasses, not merely in application candidate filtering.

### Already-anonymized rows: option 2, fail closed

Safe automatic backfill evidence is **not established**. 0025/current 0028 discard the owned candidate ID arrays after finalization and persist aggregate D/A/R counts, not the Quota/Voice-to-request mapping; 0024's only Quota backfill is an expiry timestamp. `types/database.ts` has no such relation. [The isolated DB proof](../scripts/g5d-2j-isolated-postgres-runtime-proof.sql) explicitly creates owner-null Quota/Voice rows; its fixture constants are not production linkage authority. [Accepted G5D4 evidence](g5d4-proof-only-tooling-result.md#g5d4-final-live-proof-closeout-preparation--2026-09-14) also records one anonymized Quota row separately from the six Account evidence rows. This rules out claiming that no affected real data ever existed; the summary is not an exact backfill map.

0029 must leave pre-existing owner-null/unbound rows unchanged and classify them `legacy_hold_linkage_unresolved` in safe routine results. Do not backfill from identity, timestamps, counts, fixture IDs or presumed uniqueness. Exclude those rows (and their Voice targets) from routine expiry DELETE regardless of age or currently visible holds. Missing linkage is not an inferred active legal hold and does not authorize indefinite retention: report the blocked count/category for separate operator reconciliation under existing retention/hold authority; neither timeout nor release of some unrelated request clears it. Any eventual exact-evidence repair/disposal requires a separately reviewed, authorized operator path; this unit authorizes none and does not claim legacy physical purge complete. Purging an otherwise eligible unheld Account request must never cascade to or make these unresolved rows routine-eligible.

This safe branch works whether there are zero or many legacy rows, so live data inspection is **not required to decide or implement this authority**. Current remote counts/mappings are unobserved, not assumed zero; no Staging/Production/private-proof access is performed. If later work seeks to remove the exception or enable legacy purge, missing exact evidence is a STOP for that work, not permission to guess. Focused schema-authority correctness UNKNOWN = **0**.

Historical next one action at authority resolution: `GATE5_R2_HOLD_AWARE_ROUTINE_PURGE_FOCUSED_IMPLEMENTATION_V2`, using a new forward-only **0029** migration and this contract; do not edit historical migrations 0024–0028. R1=`OPEN`; R2=`OPEN / PARTIALLY_IMPLEMENTED`; R3=`CODE CLOSED / COMMITTED / PUSHED`; R4=`WAITING_ON_TECHNICAL_CONTROLS`; Gate 5=`OPEN`; G5D4=`LIVE DELETION PROOF CLOSED`. Focused `P0/P1/P2/UNKNOWN=0/0/0/0`; known program P2 `auth_terminal_authority_missing` remains deferred. This is not an R2 implementation PASS or a new Gate 5 audit.


## R2 focused implementation — 2026-09-15

Status: `CODE CLOSED` — independent verdict `GATE5_R2_HOLD_AWARE_ROUTINE_PURGE_INDEPENDENT_REREVIEW_PASS`. The owner-null linkage authority above is unchanged. Migration [0029](../supabase/migrations/0029_gate5_hold_aware_routine_purge.sql) adds both internal UUID references, indexed `ON DELETE RESTRICT / ON UPDATE RESTRICT` FKs, and the forward DB-finalizer replacement. Existing candidate IDs bind in the same UPDATE as owner/identifier scrub; expired `retained_audit` evidence is retained/bound. Conflicting references and future anchors reject atomically. Completion checks persisted child clocks against its unchanged expiry. No legacy backfill or raw identity retention is added.

- Manual entry: `npm run retention:purge -- --mode execute --resource quota|voice|account [--after-id UUID]`, using the existing `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE=1` guard and existing Supabase operator environment convention. No guard was enabled or live invocation performed in this task. The command makes exactly one RPC and examines at most **one parent/event** per invocation. Existing target cascades are counted with their parent, not as additional examined/purged candidates.
- Sweep Quota, then Voice, then Account, each with its own internal UUID cursor. Continue with `nextAfterId`; `examined=0 / nextAfterId=null` ends that sweep. Later sweeps restart without a cursor, including after release or skipped contention. Unexpired candidates are examined and counted as `skipped_not_expired`. `skipped_unsafe` includes lifecycle/shape, authority drift, busy locks and remaining RESTRICT dependencies. A failed/unknown RPC grants no purge proof and is not automatically retried. Counters are invocation aggregates, not cumulative persisted totals.
- SQL reads the candidate, acquires the existing owner fence when present, locks related requests in UUID order, then locks/re-fetches the target and revalidates expiry, safe shape, linkage and hold. NOWAIT/try-lock contention skips safely; Account Provider/Storage children and Voice targets are locked before their existing cascades. DELETE guards also cover direct evidence/Voice-target bypasses. Owned request creation and `retained_audit` apply coordinate with that user fence; R3 scope/CAS/stage semantics and release RPC are unchanged.
- `apply_retained_evidence_legal_hold` accepts one request plus exact Quota/Voice IDs (1–100 total), locks and checks existence/association in the same transaction, then invokes existing retained-audit apply. Missing/purged/unlinked specified evidence rejects with `legal_hold_scope_unavailable`; request-only apply makes no specified-evidence preservation claim. Release changes no clock, performs no purge and needs a later routine invocation.
- Legacy owner-null/unbound evidence remains excluded with `legacy_hold_linkage_unresolved`, including genuine pre-0029 rows in the isolated upgrade proof. This is neither resolved/purged nor approval for indefinite retention. No Staging/Production counts or backfill evidence were queried.
- Implementation self-verification (historical): fresh PostgreSQL 17, `network none`, no public port, sequential **0001–0029**; both restrictive FKs, canonical binding/scrub/late rollback, wrong-request isolation, each independent expiry, Account/Quota/Voice purge, active/incomplete exclusion, both hold/purge transaction orders, transition contention, lock release, existing cascades, service-role ACL and legacy field preservation PASS. The unchanged full 0025 DB proof is reused with only its historical migration-prefix assertion and in-container dblink address adapted in the new test runner; unchanged Completion and direct R3 SQL suites PASS. Containers removed. Focused unit/integration **234/234**, operator core + five bridge fake suites + new R2 real-module fake, workspace, whitespace, lint, typecheck, build and post-build typecheck PASS. Build reported only the existing stale Browserslist data notice; no dependency update was made. Full browser E2E / device checklist / G5D4 live proof were not run (out of scope).

Historical migrations **0001–0028 byte-unchanged**; G5D4 proof tooling unchanged. External destructive calls / Staging / Production access or mutation = **0**. Focused `P0/P1/P2/UNKNOWN=0/0/0/0`; program `0/0/1/0` (`auth_terminal_authority_missing`, known nonblocking deferred). R1=`OPEN`; R2=`CODE CLOSED`; R3=`CODE CLOSED / COMMITTED / PUSHED`; R4=`WAITING_ON_TECHNICAL_CONTROLS`; Gate 5=`OPEN`; G5D4=`LIVE DELETION PROOF CLOSED`. 0029 is committed only as a repository migration; it is **not applied to Staging or Production**. Code close is not deployment or Production enablement.

Independent rereview PASS: lint, typecheck, **161 tests**, operator suites, isolated DB, build and post-build typecheck PASS. This closeout changes only these status docs; reviewed source/tests/scripts/types/package and 0029 bytes are preserved. Commit/push closes out the reviewed R2 WIP in one commit.

Exact next one action after commit/push: **R1 routine source cleanup**, using the existing source-material authority in matrix rows 20/21 and [Human Decision V2](hdc-gate5-retention-provider-governance-and-public-copy-v2.md). Do not restart the R1/R2/R3 inventory or broaden the existing R1 scope.
