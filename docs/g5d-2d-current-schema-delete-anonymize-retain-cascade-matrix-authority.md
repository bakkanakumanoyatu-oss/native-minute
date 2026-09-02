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
