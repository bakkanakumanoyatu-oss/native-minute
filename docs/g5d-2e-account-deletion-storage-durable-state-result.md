# G5D-2E Account Deletion Storage Durable State

Recorded: 2026-09-02

Mode: `G5D_2E_FINAL_AUTHORITY_CLOSEOUT_COMMIT_AND_PUSH_V1`

Status: `CLOSED_COMMITTED_PASS`

Authority: accepted remediation input verdict `G5D_2E_ACCOUNT_DELETION_STORAGE_DURABLE_STATE_INDEPENDENT_READ_ONLY_FOCUSED_REVIEW_NOT_PASS` and final independent verdict `G5D_2E_SCRIPT_AUDIO_WRITER_FENCE_AND_POSTGRES_RUNTIME_INDEPENDENT_FOCUSED_REVIEW_PASS`.

G5D-2 overall and Gate 5 remain `OPEN`. This unit does not wire the canonical operator, enable the destructive guard, apply migration `0023` to Canonical Staging, deploy, call real Storage, enter DB/anonymization or Auth, or complete an account deletion.

## Focused implementation

Migration `0023_g5d_2e_account_deletion_storage_durable_state.sql` adds account-specific Storage snapshot, count, lease, destructive-start, sub-finalization, and scrub authority to `account_deletion_requests`. The server-only `account_deletion_storage_targets` child keeps the composite request/owner FK and standalone request purge FK. It stores exactly four target kinds for `recordings`, `script-audios`, `voice-samples`, and `voice-consents`; no additional bucket is inferred.

The child enables RLS, grants `service_role` SELECT only, and exposes mutation only through focused `SECURITY DEFINER` RPCs with fixed `pg_catalog, public` search paths. Parent row locks, exact expected request owner, runner lease token, runner attempt count, target attempt count, and target owner are checked before state transitions. Sealed target identity and locators are immutable until the focused scrub transition; `manual_required` is sticky.

## Exact universe and writer fence

The seal boundary starts a durable owner-scoped fence before external inventory. It performs two bounded, sorted, read-only exact owner-prefix inventories and refuses drift. The seal transaction re-locks the request and shared G5C user lock, locks all canonical source tables, rejects unresolved/manual write intents, validates ownership, and unions/deduplicates:

- canonical `takes.audio_path` recording locators;
- canonical `script_audios.stored_asset` locators;
- canonical `voices.sample_audio_path` locators;
- canonical `voice_consents.metadata.recording.audioPath` locators;
- applicable completed `voice_asset_write_intents` locators;
- every listed exact owner-prefix object, including DB-unreferenced orphans.

A DB-known locator remains a target when absent from listing. Malformed keys, ambiguous duplicates, cross-user canonical collisions, active writers, listing drift, and reseal conflicts fail closed. Seal fixes version 1, exact count, and an immutable aggregate fingerprint.

The prior independent review found that this paragraph's original server-owned claim was not true for script audio: migration `0006` still left authenticated `script-audios` INSERT/UPDATE authority, and `stageScriptAudioForReplay` still uploaded through the authenticated request client. That P1 root cause is accepted.

The remediation keeps the existing reservation/finalization model and makes the minimum correction. `speakScript` creates one server/admin client, passes it to both the durable write-intent repository and replay staging, and the replay staging contract no longer accepts the authenticated application client. Reservation remains before provider synthesis and Storage mutation; active account deletion and collecting/sealed Storage authority reject the reservation before external work. Successful upload is followed by the existing atomic `script_audios` row/intent finalizer. Duplicate/ambiguous upload responses are accepted only after an admin read proves exact byte equality; otherwise the reservation remains unresolved for safe manual reconciliation.

Migration `0023` now removes the surviving `script-audios_insert_own`, `script-audios_update_own`, and already-removed/idempotent `script-audios_delete_own` policies while preserving `script-audios_select_own`. Recording upload continues to reserve a `recording_upload` intent, write through the admin client, and finalize the exact intent. Voice sample and voice consent writers retain the G5C server-owned reservation path. The effective `0001` through `0023` policy/runtime proof confirms direct authenticated mutation bypass is zero for all four buckets and owner-prefix playback/read remains available.

## One-step delete, verification, and recovery

The runner executes at most one target-level external action per invocation. Its durable progression is:

`pending -> delete_requested (generation 1 persisted) -> one DELETE -> exact verification -> verified_absent | manual_required`

Automatic DELETE dispatch is durably limited to one generation per target. Process loss, timeout, thrown adapter error, lost result write, lease expiry, or stale result never authorizes a second blind DELETE. A later invocation is verification-first. DELETE success is not absence evidence. Only exact-object `info()` returning HTTP 404 becomes `verified_absent`; present becomes sticky manual, and 400/listing omission/malformed or ambiguous responses do not prove absence. Transient verification uses bounded exponential backoff with jitter and the existing five-attempt G5C reconciliation budget; exhaustion becomes sticky manual.

The request lease has a bounded lifetime and monotonically increasing runner attempt. Focused RPCs require the current lease, unexpired lease time, expected runner attempt, expected target counter, exact request/owner, Provider sub-finalization, and the Storage-stage parent statuses. Losers execute no external action, and stale result writes return no mutation authority.

## Focused Storage sub-finalizer

The only terminal aggregate authority is `finalize_account_deletion_storage_stage`. In one transaction it locks and rechecks the request, recomputes actual target and verified counts, requires every nonzero target to be strictly verified absent, repairs safe parent counts, scrubs child bucket/key/source refs/fingerprints, scrubs the parent aggregate fingerprint, writes the scrub/finalized timestamp, and clears the lease.

Zero targets become `not_needed`; nonzero all-absent targets become `succeeded`. The parent returns only to the confirmed account-deletion state. The finalizer does not enter DB/anonymization, Auth, notification, account completion, or another external stage. Safe kind/status/outcome/count/reason/timestamp/attempt evidence remains, while the later Auth-null owner cascade and parent purge cascade remain possible.

## Legacy path and proof

The aggregate legacy `runStorageCleanupActual` executor now returns `blocked / storage_durable_authority_required` before dry-run inventory, injected/default delete calls, or direct request-status mutation. Canonical operator wiring remains deferred to a later unit.

`npm run account-deletion:storage-durable:self-test` passes 18 focused tests: 13 Storage-durable behavioral fake tests and five server-owned script-audio/Listen writer tests. The script-audio tests prove admin-client injection, one upload, exact-byte duplicate reconciliation, ambiguous/mismatched unresolved behavior, reservation-before-Storage rejection, and normal Listen/cache behavior. Grouped assertions cover production prefix traversal for all four bucket layouts; four-bucket/DB/write-intent/orphan/known-not-listed exact seal and dedup; malformed/cross-user/writer/drift/reseal rejection; post-seal writer/source fence; durable pre-delete intent; one action per invocation; multi-target partial progress; process/result-write loss and verification-first recovery; exact 404 absence, present/ambiguity/manual and retry budget; lease winner/stale CAS/loser action zero; zero/incomplete/all-absent finalization, count repair, locator/source/fingerprint scrub and lease clear; User A/B and later-stage isolation.

A clean disposable local Supabase PostgreSQL stack applied migrations `0001` through `0023`; migration `0023` parsed/applied, exact history contained all 23 versions, and `supabase db lint --local --level warning --fail-on warning` returned zero findings. `scripts/g5d-2e-isolated-postgres-runtime-proof.sql` then passed against actual PostgreSQL catalogs and transactions. It checked table owner/RLS/ACL, dual FK/actions, indexes/constraints/triggers, ten service-role-only `SECURITY DEFINER` RPCs with fixed search paths, final effective Storage policies, authenticated read and mutation behavior, and service mutation authority.

The runtime proof completed all four writer-intent kinds, sealed their applicable locators, rejected collecting/sealed writes before Storage mutation, and used two independent PostgreSQL sessions for lease contention. It passed expiry takeover, stale token/attempt/result rejection, DELETE generation `0 -> 1` only, verification-first lost-result recovery, exact absence, present/manual, retry-budget manual, zero/incomplete/all-absent/count-drift finalizers, forced mid-finalizer rollback with intact retry data, safe retry, Storage-only terminal boundary, dual-FK Auth-null transition, parent purge cascade, cross-user rejection, unrelated User B stability, and fixture cleanup `0/0/0/0`. The first local harness attempt exposed only that Supabase's `postgres` login is intentionally non-superuser; the final independent-session harness ran under disposable local `supabase_admin`, while application RPC owner/ACL assertions remained exact.

This was local/non-live only. Canonical Staging remains at migrations `0001` through `0022`; migration `0023` is `UNAPPLIED`, and Staging mutation/apply/deploy count is zero.

## Validation and safety

- `npm run check:workspace`: PASS.
- focused G5D-2E fake proof: PASS, 13/13.
- script-audio/Listen/focused G5D-2E regression: PASS, 22/22.
- full Mobile regression suite: PASS, 715/715 across 60 files.
- G5D-2A provider durable regression: PASS, 24/24 (included above).
- G5D-2B canonical Provider operator fake proof: PASS.
- legacy operator and Storage cleanup self-tests: PASS.
- clean local migration apply `0001` through `0023`: PASS, exact 23-version history.
- isolated actual PostgreSQL catalog/ACL/trigger/FK/lease/CAS/recovery/finalizer/atomicity/User A-B proof: PASS.
- local schema lint at warning/fail-on-warning level: PASS, zero findings.
- `npm run typecheck` and `npm run mobile:typecheck`: PASS.
- `npm run lint` and `npm run mobile:lint`: PASS.
- `npm run build`: PASS.
- `git diff --check`: PASS.
- destructive guard: disabled.
- real Storage network calls: `0`; local policy-fixture rows only and cleanup complete.
- Staging/Production mutation/apply/deploy: `0`; real Provider calls: `0`.
- DB/anonymization, Auth deletion stage, notification, and account completion calls: `0`; local Auth-null fixture lifecycle only.
- P0: `0`; unresolved correctness P1: `0`; P2: `0`; correctness UNKNOWN: `0`.
- P1-1 script-audio writer bypass: `CLOSED` by the accepted final independent review.
- P1-2 isolated PostgreSQL runtime proof: `CLOSED` by the accepted final independent review.

G5D-2E is `CLOSED_COMMITTED_PASS`; G5D-2 and Gate 5 remain `OPEN`.

Next single action: `G5D_2F_MIGRATION_0023_CONTROLLED_STAGING_APPLY_AND_NON_DESTRUCTIVE_SMOKE`.
