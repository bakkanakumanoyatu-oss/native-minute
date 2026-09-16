# G5D-2D current-schema delete / anonymize / retain / cascade matrix authority

- Recorded: 2026-09-02
- Mode: `G5D_2D_CURRENT_SCHEMA_DELETE_ANONYMIZE_RETAIN_CASCADE_MATRIX_REPOSITORY_AUTHORITY_DOCS_ONLY_V1`
- Accepted input: `G5D_2D_CURRENT_SCHEMA_DELETE_ANONYMIZE_RETAIN_CASCADE_MATRIX_AUTHORITY_PASS`
- Result: `G5D_2D_CURRENT_SCHEMA_DELETE_ANONYMIZE_RETAIN_CASCADE_MATRIX_REPOSITORY_AUTHORITY_DOCS_ONLY_PASS`
- Unit status after the docs closeout: `G5D-2D = CLOSED_COMMITTED_PASS`
- Overall status at original matrix recording: `G5D-2 = OPEN`, `Gate 5 = OPEN`

Current status (2026-09-16): R1=**FINAL CLOSED / PRODUCTION_LIKE_RUNTIME_PROOF_PASS**; see the [runtime closeout](#r1-staging-natural-due-runtime-closeout--2026-09-16). R2/R3=`CODE CLOSED / COMMITTED / PUSHED`; G5D4=`LIVE DELETION PROOF CLOSED`; R4=`HUMAN_APPROVED`; **Gate5=`CLOSED`** under explicit [`HUMAN_DECISION_GATE5_FINAL_APPROVAL`](hdc-gate5-retention-provider-governance-and-public-copy-v2.md#gate-5-final-human-approval-and-formal-closeout--2026-09-16). `TECHNICAL_BLOCKERS_FOR_R4=0`; technical work is not reopened. Earlier implementation/deployment statuses and next actions below are historical. Known Auth P2 and legacy linkage limitations remain; public-copy correction, final legal/publication prerequisites and release readiness remain separate and pending. No Production execution or publication is authorized by this closeout.

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
| 20 | Storage bucket `voice-samples` | Seal voice, consent, write-intent, DB-known, and exact owner-prefix targets; delete on account deletion or earlier routine expiry | Exact absence required. Fixed first durable registration success + 24 hours under the [R1 contract](#r1-shared-source-cleanup-authority--2026-09-15); account deletion takes precedence. | Shared account Storage durable authority; separate routine R1 control is authority-resolved, not implemented |
| 21 | Storage bucket `voice-consents` | Seal consent metadata, write-intent, DB-known, and exact owner-prefix targets; delete on account deletion or earlier routine expiry | Exact absence required. Same fixed source-level [R1 contract](#r1-shared-source-cleanup-authority--2026-09-15); required consent/audit evidence is separate; account deletion takes precedence. | Shared account Storage durable authority; separate routine R1 control is authority-resolved, not implemented |
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

## R1 shared-source cleanup authority — 2026-09-15

Mode: `GATE5_R1_SHARED_SOURCE_CLEANUP_ELIGIBILITY_AUTHORITY_RESOLUTION`. Applied Human Decision: [`HDC_GATE5_R1_SHARED_SOURCE_CLEANUP_ELIGIBILITY_V1`](hdc-gate5-retention-provider-governance-and-public-copy-v2.md#r1-shared-source-cleanup-eligibility-decision--2026-09-15). Source reconciliation base: `codex/g3-mobile-main-loop`, HEAD/upstream `9ef30301a67c5cf3bddc1912167cfb9f43b6a3ce`. This section fixes the V2 contract; it does not claim the following new state or guards already exist.

### Existing authority alignment

| Existing source | Confirmed authority / limitation |
| --- | --- |
| [createUserVoice](../services/voice/voice.service.ts), [write-intent repository](../services/voice/voice-asset-write-intent.repository.ts) | Owned consent/sample resolution → `reserve(kind='voice_create')` with a fresh lease token → `provider.createVoice` → `finalizeVoice` RPC. Reuse of the same owned sample is currently possible. Neither HTTP success nor the Provider response is the durable registration point. |
| [0019 finalizer and intent schema](../supabase/migrations/0019_g5c_b4_db_cleanup_and_consent_withdrawal.sql) | `finalize_voice_create_write_intent` checks owner, reserved intent, lease token/expiry and current consent; inserts `voices`, changes default voice and completes the intent in one transaction. It has no later replacement through 0029. The intent has no completion timestamp or durable result/source binding; `voice_id` and Storage fields are null for `voice_create`. |
| [0023 current reserve RPC / shape](../supabase/migrations/0023_g5d_2e_account_deletion_storage_durable_state.sql) | Reservation uses `g5c_b4_lock_voice_asset_user`; deletion fences and the partial unique index allow only one `reserved` / `manual_required` intent per user. V2 preserves this restriction; the concurrent-use rule is not permission to introduce parallel registrations. |
| [sample upload / resolver](../services/storage/voice-sample-storage.service.ts), [consent upload / resolver](../services/storage/voice-consent-storage.service.ts) | Uploads use new random object keys, `upsert:false`, and durable upload intents retaining exact bucket/key after completion. Sample resolution validates owner/consent/path, but has no cleanup-state check. Consent resolution downloads audio before any registration intent. |
| [createVoiceConsent](../services/voice/voice.service.ts), [ElevenLabs](../providers/voice/elevenlabs.ts), [OpenAI](../providers/voice/openai.ts) | Consent creation has no durable registration intent today. ElevenLabs acknowledges locally; OpenAI's adapter downloads consent audio. Consent creation is not the R1 success anchor. A read/use fence is needed before the consent resolver's download as well as before any Provider source consumption; this does not change Provider consent authority or enable a Provider. |
| [0029 Account finalizer](../supabase/migrations/0029_gate5_hold_aware_routine_purge.sql), [0028 holds](../supabase/migrations/0028_gate5_limited_legal_hold.sql) | Unresolved write intents block Account finalization; terminal intents are eventually deleted under existing Account authority. R1 must preserve these guards, existing Storage hold scope and deletion precedence. It does not alter R2 audit expiry or R3 decisions. |

### First durable success and fixed due

- **Success point:** the committed transaction of `finalize_voice_create_write_intent` that inserts the canonical voice and marks that exact `voice_create` intent `completed`. An external success followed by failed/ambiguous finalization is unresolved, not a new cleanup anchor. If the DB committed but the response was lost, its persisted state remains authoritative.
- V2 binds the registration to its resolved sample and associates the consent recording derived from owned canonical consent metadata, so the first voice success can anchor both source objects. Distinguish actual audio use (`requires_audio=true`) from consent-evidence association (`false`), as determined by the server's read path. `createVoice` currently reads sample bytes and references consent evidence/Provider consent ID; it does not download consent audio. Evidence association alone neither blocks cleanup nor requires re-upload of cleaned consent audio. Any actual consent audio read must pass source admission. Multiple references to one exact object share one source authority; a source-less mock/fallback cannot manufacture one.
- In that same finalizer transaction, under the source lock, write `first_registered_at` and `first_registration_intent_id` **only when unset on a proven never-registered source**; null legacy state is insufficient. Use a DB timestamp sampled at successful finalization after locking; it becomes durable only on commit. Atomically persist source anchors, voice creation and intent completion, or roll them all back. The first committed finalization wins; later completions and response recovery leave the pair unchanged.
- `cleanup_due_at = first_registered_at + interval '24 hours'` is server-derived, not independently editable. Do not use upload time, consent time, last voice creation, `updated_at`, last use, lease expiry or retry completion. This is 24 elapsed hours, not the next calendar day or a public guarantee.
- A source with no proven first success has no R1 registered-source due yet. Missing historical authority is not equivalent to a proven never-registered source. Do not backfill from the earliest surviving voice, mutable timestamps, migration time or current time: old voices may already have been deleted. Legacy unbound/ambiguous sources fail closed for reuse and automatic R1 cleanup pending exact reconciliation; this grants no indefinite retention. Orphan/never-successful-upload expiry is not newly decided here.

### Durable in-flight use and retry identity

- The existing operation identity is **`voice_asset_write_intents.id`**, owner-checked; `lease_token` is a CAS capability for that intent, not a new operation identity. `createUserVoice` creates a fresh intent for each new call. The `${userId}:${provider}` map in `createDefaultVoiceIfMissing` is process-local deduplication, not durable retry authority. There is no existing registration HTTP idempotency key or general resume RPC; deletion-operation IDs and synthesis quota/cache keys are unrelated.
- V2 must commit an immutable source-to-intent binding in the same transaction that admits the operation, **before any source download or Provider dispatch**. Persist the exact owner, consent/provider context and full source set; retries cannot change these or attach another source. For `requires_audio=true`, `reserved` (including expired lease) and `manual_required` mean unresolved use and block cleanup. Never infer terminality from a timeout, process exit, absent client request or expired lease. An unknown/missing binding on a legacy unresolved same-owner intent conservatively blocks claim; no matching join row is not proof of no use.
- Terminal use is a durably completed operation, or a safely cancelled operation with known no side effect and no outstanding reader/dispatch. A delayed worker must be fenced before cancellation; the existing caller assertion alone must not release a still-active use. Ambiguous Provider outcomes remain unresolved/manual, with no automatic retry or manual-state clearance added by R1.
- All already-admitted nonterminal uses block the source, including any begun before its first success and still running at due. A retry after due is eligible only within that same still-nonterminal, previously admitted intent and its existing safe execution authority. A new intent, a new HTTP submission after terminality, or changed source/context is a new registration and must pass the new-registration gate. Merely supplying an old ID/token cannot revive a completed/cancelled intent.
- Existing lease/finalizer rules still apply: this decision does not grant expired-lease renewal or a Provider request replay. Once safe terminality is durable, the original due remains; a **separate routine invocation** may claim cleanup. There is no automatic cleanup chained from registration completion and no new 24-hour period.

### New-registration rejection and cleanup-completed behavior

1. The authoritative admission boundary is the server-only reservation transaction, serialized with cleanup by the **same owner advisory lock and source row locks**. Re-fetch canonical source state and bind use atomically. Reject if any required source is due (`cleanup_due_at <= DB current time`, sampled after acquiring locks), cleanup-authorized/started/completed, unresolved/manual, missing, malformed, wrong-owner or not a proven completed upload. A frontend/path check or a check only in the finalizer is insufficient. Started means successful durable admission, not HTTP arrival or transaction-start time before waiting on locks.
2. Claim cleanup only for an already-due source with no unresolved bound use, after existing deletion/hold checks. Persist the cleanup authority before external deletion. Keep lock order consistent: owner advisory lock → applicable Account request rows in ID order → source rows in ID order → use intents. Hold apply/dispatch must serialize on the existing request row; Account/Voice deletion and routine cleanup cannot both own dispatch. Preserve the existing user-level writer fence.
3. If admission wins before due, its bound unresolved use blocks cleanup. If cleanup claim wins, admission rejects. At/after due, a new registration rejects **even without a claim**, so it cannot postpone cleanup. A blocked sweep acquires no destructive authority and never resets the due timestamp. Claims cannot coexist with a live source consumer.
4. Once claimed, cleanup failure, lease expiry or a later cleanup retry never returns the source to usable state. A current claim token/CAS controls cleanup continuation; stale workers cannot complete a newer claim. Mark `completed` only after exact object absence is verified and durably recorded. DELETE response, missing list entry or locator scrubbing alone is not completion.
5. Every new-registration path, including legacy `sampleAudioPath` fallback and consent recording reuse, checks canonical state before reading bytes/dispatching. A leftover locator or object unexpectedly restored at the same key cannot override the completed tombstone. Missing authority also rejects; do not rebuild a usable record from the path. If source material is needed again, upload to a **new object key/source identity**. Retaining a valid consent evidence row or Provider consent ID does not itself mean its old audio is readable, and R1 does not invalidate that evidence/ID.

### Minimum schema/state authority for V2

Use the existing **source upload intent as the source authority**, plus one narrow source-use relation; do not create a second independent registration-operation system. The following names define the intended new state, not existing columns.

| Location | Required minimum authority |
| --- | --- |
| Existing `voice_asset_write_intents` upload rows (`voice_sample_upload` / `voice_consent_upload`) | Source identity is the upload intent ID with immutable owner + exact bucket/object key. Enforce uniqueness of the source locator across these upload rows; conflicting legacy rows are unresolved, never silently merged. Keep upload `status=completed` distinct from audio cleanup status. Fresh upload finalization establishes known lifecycle state; legacy defaults must not imply never registered. |
| Same source rows | Write-once `first_registered_at` + `first_registration_intent_id` (same-owner `voice_create` FK; both null or both set), fixed derived `cleanup_due_at`; separate `cleanup_state` (`available`, `claimed`, `completed`, `manual_required`), write-once `cleanup_authorized_at`, `cleanup_completed_at`, cleanup lease token/expiry and safe failure category. Null/unknown legacy lifecycle is not `available`. Claim history stays fenced even when its lease is released; success never resets. No `last_registered_at` retention anchor. |
| New `voice_source_uses` relation | Unique `(source_upload_intent_id, registration_intent_id)` with owner-consistent FKs to the existing intents and server-owned immutable `requires_audio`; binding written at admission. Reuse the parent intent's durable `created_at`/status for start/terminal authority, not a separately maintained active counter. Freeze consent ID/provider on the consuming intent (for consent creation, allocate the intended consent UUID at reservation and use it for persistence). Bind every consumed source before starting; never wait for success to discover in-flight use. Evidence-only associations cannot authorize bytes access or be upgraded on retry. |
| Existing write-intent family | For consent audio use, add a narrowly scoped `voice_consent_create` kind with the same reservation/status/lease discipline; reserve and bind **before** `resolveOwnedVoiceConsentRecordingInput` downloads. Complete after durable consent persistence and no remaining source use; this completion does **not** start the R1 clock. A later `voice_create` separately binds canonical consent recording/sample sources and sets first success only via the voice finalizer. No change to consent version/timestamp/purpose or Provider-side consent semantics. |
| Server-only transitions and lifecycle integration | Source-aware admission, first-success finalization, safe use terminalization, cleanup claim/absence completion use transactional ownership checks and CAS. No client DML for lifecycle fields/bindings. A routine claim is visible to existing deletion/hold coordination even though the upload remains completed. Preserve source tombstones while product reuse remains possible; remove use links/source authority only inside the existing classified Account/Voice deletion prerequisites, without extending Account/audit retention or weakening DB/Auth blockers. |

Required V2 invariants: two successes on one source leave the first anchor unchanged; pre-first-success concurrent use blocks at due; new-at-due rejects; same-operation safe continuation does not re-anchor; expired/manual use blocks; claim/admission races have one winner; ambiguous cleanup remains fenced; completed/missing-state locators reject; rollback/lost-response preserves atomic first-success state; cross-owner use rejects; consent evidence and existing deletion/hold authority survive source cleanup. These are future implementation checks, not tests run in this unit.

### Authority-resolution closeout

Verdict: `GATE5_R1_SHARED_SOURCE_CLEANUP_ELIGIBILITY_AUTHORITY_RESOLVED`. Human Decision shortage / focused authority UNKNOWN=`0/0`; focused `P0/P1/P2/UNKNOWN=0/0/0/0` for this docs-only resolution, **not implementation correctness**. Program remains `0/0/1/0` (`auth_terminal_authority_missing`, known nonblocking deferred P2).

R1=`OPEN / AUTHORITY_RESOLVED / NOT_IMPLEMENTED`; R2=`CODE CLOSED`; R3=`CODE CLOSED / COMMITTED / PUSHED`; R4=`WAITING_ON_TECHNICAL_CONTROLS`; Gate5=`OPEN`; G5D4=`LIVE DELETION PROOF CLOSED`. Validation: `npm run check:workspace` and `git diff --check` PASS; no docs validator found in repository scripts/package manifests. Lint/typecheck/build/tests intentionally not run (docs only, per Human instruction). Migration/source/types/tests/operator/DELETE/Staging/Production/external Provider changes or operations=`0`; `.env.local.save` and `supabase/.temp/` untouched.

Exact `NEXT_ONE_ACTION`: `GATE5_R1_REGISTERED_SOURCE_MATERIAL_ROUTINE_CLEANUP_FOCUSED_IMPLEMENTATION_V2`.


## R1 focused implementation — 2026-09-15

Implementation-stage R1 status: `IMPLEMENTED_PENDING_INDEPENDENT_REREVIEW` (historical; latest remediation below). The approved shared-source authority above remains unchanged; its `NOT_IMPLEMENTED` closeout is historical. Self-validation PASS is repository/isolated evidence only, not independent acceptance or Production-like runtime proof.

- [0030](../supabase/migrations/0030_gate5_registered_source_cleanup.sql) extends the existing upload intents with known/unknown lifecycle, write-once first-success/due, cleanup authority/lease, attempts/failure and verified completion. Adds only `voice_source_uses`; owner-consistent FKs bind upload and registration intents. Known source locators are unique; every admission also checks exact cardinality against legacy rows. Legacy lifecycle remains unknown, without invented anchors or automatic repair.
- Admission uses owner fence → owned Account request rows → canonical source locks → operation. `voice_create` and narrow `voice_consent_create` reserve full immutable context/source bindings before audio read/Provider dispatch. A single dispatch CAS fences delayed processes; only pre-dispatch known-no-side-effect cancellation may release a use. Due-boundary checks sample DB time after locks. Existing per-owner unresolved-intent uniqueness remains enabled.
- The voice finalizer commits voice, intent completion and the source's first anchor together. Later successes and completed-response recovery never restart the 24 elapsed hours. Consent finalization preserves the evidence row and does not start this clock. A voice registration associates consent audio as evidence-only; fresh samples may use preserved consent evidence after its audio cleanup without re-reading that audio.
- Only relevant `reserved`/`manual_required` registration uses block cleanup, including expired leases and defensive pre-first-success concurrent uses. Unknown legacy registration binding fails closed; unrelated uploads are not source consumers. There is no new HTTP idempotency key, expired registration lease renewal, Provider replay, or automatic manual-state clearance.
- `npm run voice:source-cleanup -- --mode execute [--after-id UUID]` uses the existing `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE=1` guard. One invocation examines one due source, atomically claims it, rechecks latest state, verifies exact absence, deletes only if present, verifies again, and CAS-persists the result. Advance the returned cursor on skip/failure as well as success; at sweep end a later sweep starts without a cursor. No scheduler or release/finalizer chaining is added.
- R1 RPC/DELETE transport has a 20-second abort bound and cleanup claims have a 900-second lease. Failure/expiry/reclaim never restores source availability or changes due. The Account adapter's exact raw-info absence classifier is reused unchanged; DELETE success alone is insufficient. Sample/consent completion and failures remain independent, and safe output omits owner/locator/Provider data.
- Existing `storage` hold scope blocks source cleanup; release changes no source clock and performs no cleanup. Additive 0030 coordination triggers expose R1 claims to existing Account/Voice Storage dispatch and Account DB removal; existing Account RPCs/adapters, R2 and R3 migrations are unchanged. A claimed R1 source can finish recovery after a later Account request; an already-owned Account Storage stage takes precedence. Account DB finalization removes source/use authority through the existing terminal-intent deletion/cascades, with no extra raw-identity retention period.
- Verification: workspace/diff/lint/typecheck/build/post-build typecheck PASS; **175 direct regression tests + 62 R1 tests** PASS, plus R1 operator partial/retry fake suite and existing Account Storage self/bridge fake suites. The bridge used direct `node --conditions=react-server --import tsx` because network-denial also blocked the legacy tsx CLI's local IPC listener. Browser E2E and physical-device checks were not run.
- Fresh disposable PostgreSQL applied **0001–0030** with `--network none`, no published port, and fake Storage. First/immutable anchor, late atomic rollback, due boundary, same-operation continuation/recovery, in-flight/manual block, claim/CAS/crash retry, hold/release, evidence-only reuse, partial failure, already-absence, Account Storage/DB interaction, bounded cursor and idempotency passed. Real overlapping DB sessions covered both reservation/claim orders, waiting across due, competing workers, hold/claim and parallel finalizers. Defensive parallel-operation fixtures temporarily remove/recreate the singleton index **only inside the disposable test DB**; production admission still rejects a second unresolved operation. A connected test exercised the production repository/routine against that DB with fake Storage. Container and its volume were removed.
- 0001–0029 verified byte-unchanged against HEAD; 0030 is the sole forward migration. It must accompany this code before deployment and is unapplied to Staging/Production. External/live destructive operations, G5D4 rerun, stage/commit/push=`0`. The approved authority WIP and protected artifacts are preserved.

Focused self-review `P0/P1/P2/UNKNOWN=0/0/0/0`; Program `0/0/1/0` (`auth_terminal_authority_missing`, known nonblocking deferred P2). R2/R3=`CODE CLOSED / COMMITTED / PUSHED`; R4=`WAITING_ON_TECHNICAL_CONTROLS`; Gate5=`OPEN`; G5D4=`LIVE DELETION PROOF CLOSED`.

Exact `NEXT_ONE_ACTION`: `GATE5_R1_REGISTERED_SOURCE_MATERIAL_ROUTINE_CLEANUP_INDEPENDENT_READ_ONLY_REREVIEW`.


## R1-P1-01 consent read failure remediation — 2026-09-15

Remediation-stage R1=`REMEDIATED_PENDING_INDEPENDENT_REREVIEW` (historical; current code closeout below); self-validation PASS, independent rereview was pending. Existing `HDC_GATE5_R1_SHARED_SOURCE_CLEANUP_ELIGIBILITY_V1` remains unchanged.

- Root cause / exact before: actual consent service + repository + resolver against fresh isolated 0001–0030 reproduced a failed Storage GET with Provider calls=0, `reserved` use and premature `registration_dispatched_at`. Cancellation and new registration were rejected; lease expiry and due arrival still returned `in_flight_use`.
- Authority: consent begin now records immutable `registration_source_read_started_at` as single-reader admission. Only the winning server invocation reports the awaited resolver outcome through service-role-only `finish_voice_consent_source_read`. Owner → owned Account requests → sources → operation locks and exact intent/owner/token/kind/`reserved`/read-started/no-dispatch CAS gate it. A false outcome, called only inside the resolver catch, sets the intent to `cancelled` and clears its lease. Source-use bindings remain evidence; cleanup sees the terminal intent. No source or cleanup authority is mutated.
- Dispatch boundary: after a successful source read, the same RPC's true outcome commits `registration_dispatched_at` immediately before `provider.createConsent`. It is conservative dispatch permission, not evidence that the Provider received or completed a call. Lost CAS response, crash after dispatch permission, ambiguous Provider result and Provider/finalizer failure remain unresolved. Generic cancellation cannot clear a started reader. No timer/reaper, lease-expiry cancellation, manual-state release or Provider replay is added.
- Exact after: failed GET → Provider calls=0 → `cancelled`; entire source row unchanged, including first-success anchor, fixed due and null cleanup authority. Before due, a separate new registration can use the same source under existing admission rules. After due it is rejected without extending the clock; a separate normal cleanup invocation claims, verifies, fake-deletes and verifies absence successfully. Original attempt/token cannot restart or overwrite later state.
- Direct regressions A–J PASS: pending read blocks cleanup; successful read preserves normal consent flow; dispatched/ambiguous/lost-response paths remain unresolved; due/anchor unchanged; next-invocation cleanup; lease expiry alone still blocks; manual state stays manual; actual overlapping cleanup/read-failure and dispatch/read-failure sessions in both orders have no dual authority/stale overwrite. Existing Account Storage SQL and fake operator regressions pass. `createUserVoice` and its sample path are byte-identical to the reviewed WIP; sample read/dispatch behavior is unchanged.
- Validation: workspace/diff checks, lint, typecheck, **211 focused/direct tests** (68 R1 + 143 direct), **8 actual-service isolated SQL tests**, R1 operator fake, Account Storage self/bridge fake, fresh network-none/no-public-port 0001–0030 with real DB concurrency and connected cleanup fake, network-denied build and post-build typecheck PASS. All disposable containers/volumes removed. Browser E2E, device checks, G5D4 and live runtime proof were not run.
- Preservation: pre-edit identity matched independent review's 765 files and exact 23-file WIP; unknown changes=0. The existing 23 paths remain, with one added isolated consent regression file. 0001–0029 remain byte-identical to HEAD. 0030 is still unapplied externally. Protected `.env.local.save` / `supabase/.temp/` were neither read, hashed nor changed. No new environment settings, setup/README changes or public API/UI changes are needed.

Exact remediation files (relative to repository root):

- `services/voice/voice.service.ts`
- `services/voice/voice-asset-write-intent.repository.ts`
- `supabase/migrations/0030_gate5_registered_source_cleanup.sql`
- `types/database.ts`
- `apps/mobile/tests/voice-source-registration.test.ts`
- `apps/mobile/tests/voice-consent-read-isolated.test.ts` (new)
- `scripts/gate5-source-cleanup-isolated-test.sql`
- `scripts/gate5-source-cleanup-isolated-test.py`
- `scripts/gate5-source-cleanup-concurrency-test.py`
- `docs/current-state.md`
- `docs/hdc-gate5-retention-provider-governance-and-public-copy-v2.md`
- `docs/g5d-2d-current-schema-delete-anonymize-retain-cascade-matrix-authority.md`

Focused `P0/P1/P2/UNKNOWN=0/0/0/0`; Program `0/0/1/0` (known nonblocking `auth_terminal_authority_missing`). R2/R3/R4/Gate5/G5D4 statuses unchanged. External/live operations and stage/commit/push=`0/0/0`.

Exact `NEXT_ONE_ACTION`: `GATE5_R1_CONSENT_READ_FAILURE_TERMINALIZATION_INDEPENDENT_READ_ONLY_REREVIEW`.

## R1 independent rereview code closeout — 2026-09-15

Authoritative verdict: `GATE5_R1_REGISTERED_SOURCE_MATERIAL_ROUTINE_CLEANUP_INDEPENDENT_REREVIEW_PASS`. **R1-P1-01 independent rereview PASS / CLOSED; R1 advances from CODE_CLOSE_CANDIDATE to CODE CLOSED.** Production-like runtime proof=`PENDING`; R1 is not FINAL CLOSED.

- Accepted independent validation PASS: workspace/diff, lint, typecheck, 130 focused/direct tests, 8 actual-service isolated DB tests, old counterexample, independent SQL concurrency, fake operators, network-denied build and post-build typecheck. Reviewer edits=0 and stage/commit/push=0/0/0; 767 repository files and status were unchanged across review.
- Commit/push preflight: HEAD/upstream=`9ef30301a67c5cf3bddc1912167cfb9f43b6a3ce`, ahead/behind=0/0. Actual WIP=34 status entries: 8 tracked changes + 26 untracked; excluding 10 protected entries leaves 24 reviewed R1 files. All 767 non-protected file identities and status match the independent-review baseline; unknown changes=0. Only the three authority/status docs receive closeout synchronization; source/tests/migration remain the reviewed bytes.
- 0030 remains a repository migration, unapplied to Staging/Production; no 0031. This unit records the reviewed WIP and minimal docs in one commit and normal push. Validation is limited to workspace check, diff check and staged diff check; independent lint/typecheck/tests/build PASS is reused without rerunning.
- R2/R3=`CODE CLOSED / COMMITTED / PUSHED`; R4=`WAITING_ON_TECHNICAL_CONTROLS`; Gate5=`OPEN`; G5D4=`LIVE DELETION PROOF CLOSED`. Focused `P0/P1/P2/UNKNOWN=0/0/0/0`; known Program P2 `auth_terminal_authority_missing` remains nonblocking deferred. No runtime proof, Staging/Production access, real Storage/Provider DELETE, R2/R3 reopen, G5D4 rerun or R4 work in this unit.

NEXT_ONE_ACTION: perform R1 Production-like runtime proof under existing authority in the minimum scope. Define its execution after the commit/push response; do not start it in this unit.

## R1 Staging natural-due runtime closeout — 2026-09-16

Mode: `GATE5_R1_STAGING_RUNTIME_PROOF_NATURAL_DUE_EXECUTION`. Verdict: **R1 FINAL CLOSED / PRODUCTION_LIKE_RUNTIME_PROOF_PASS**. [Safe runtime evidence](gate5-r1-staging-natural-due-evidence.json) retains the original preparation identity and opaque target references.

- Preflight: Developer root, `codex/g3-mobile-main-loop`, local/upstream/remote `51ecd1e74b01c9949b68b99634f40217037d64c2`, ahead/behind 0/0, tracked clean. Canonical `native-minute-staging` / `ztlliqishddrrvqqrrlu` / `ap-northeast-1` / `ACTIVE_HEALTHY`; management read-only ledger exactly 0001–0030. No migration applied in this unit.
- Fixed disposable account metadata and SHA-256 source refs matched exactly. Both sources were present/available with durable mock-registration success, active/in-flight use=0 and relevant hold=0. T0=`2026-09-15T10:49:08.381570Z`, natural due=`2026-09-16T10:49:08.381570Z`; no timestamp changes or new account/source/registration.
- Saved safe pre-destructive snapshot, then invoked the committed CLI sequentially for sample and consent with `--mode execute --source-id <exact UUID>`; no `--after-id`, candidate scan or fallback. Each returned `succeeded / cleanup_succeeded`, examined=1, actual Staging Storage DELETE=1, exact verifications=2, nextAfterId=null. Sample completed at `2026-09-16T11:48:19.895124Z`; consent completed at `2026-09-16T11:48:40.735099Z`.
- Independent post-operation exact Storage info checks: both absent. Both canonical cleanup states completed, attempt_count=1, failure=null, claim/lease cleared. Consent record/version/timestamp/purpose, processing consent, both completed registration audit intents and all three durable source-use bindings remain.
- Non-destructive canonical `r1_bind_source(requires_audio=true)` checks on each fixed source rejected with SQLSTATE 23514 / `source_reupload_required`. Explicit rollback transactions permit the helper's row lock; the expected exception aborts the transaction before insertion. No new registration or Provider dispatch.
- Second exact-target invocation for each same ID returned `skipped / cleanup_succeeded`, examined=1, DELETE=0, verification=0, nextAfterId=null. Canonical terminal fields stayed byte-equivalent in safe snapshots; no other candidate was used.
- Before/after aggregate full-row fingerprints and counts matched across all 19 public relations, auth.users and storage.objects, excluding only the two fixed source rows and their exact Storage object rows. Consent remained unchanged after sample cleanup. Unrelated source changes, unrelated Storage DELETE, other-user changes, Provider DELETE, Production operations and unexpected destructive operations all 0.
- Docs/evidence only; source/tests/migration unchanged. Protected `.env.local.save` and repository `supabase/.temp/` were not read, hashed or changed. Workspace/diff checks and lint PASS. Build/typecheck/tests were not rerun because this unit changed no application code, UI, routes, types or migrations; no new implementation/review or R2/R3/G5D4 retest.

R1=`FINAL CLOSED / PRODUCTION_LIKE_RUNTIME_PROOF_PASS`; R2/R3=`CODE CLOSED / COMMITTED / PUSHED`; R4=`READY_FOR_FINAL_HUMAN_LEGAL_APPROVAL`; Gate5=`OPEN`; G5D4=`LIVE DELETION PROOF CLOSED`. Known Auth P2 remains nonblocking deferred. This closes the authorized Staging runtime proof; no Production execution or public-copy publication is implied.

NEXT_ONE_ACTION: `GATE5_R4_FINAL_HUMAN_LEGAL_APPROVAL`.
