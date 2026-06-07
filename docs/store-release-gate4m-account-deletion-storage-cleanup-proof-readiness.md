# Gate 4m Account Deletion Storage Cleanup Proof Readiness

Recorded: 2026-06-07

Status: `READY_FOR_SAFE_PROOF_REVIEW / ACTUAL_CLEANUP_PROOF_STILL_BLOCKER`

Gate 4m is a non-destructive readiness checkpoint for account deletion Storage cleanup proof. It does not execute Storage object deletion, account deletion, Supabase Auth deletion, DB destructive cleanup, provider cleanup, provider API calls, env/dashboard operations, Store Console work, screenshot capture, Capacitor work, DB schema/migration changes, or API/service logic changes.

## Inputs Read

- `docs/storage-object-cleanup-boundary-plan.md`
- `docs/store-release-gate4h-disposable-account-dry-run-proof-capture.md`
- `outputs/storage_object_cleanup_boundary_plan/storage_object_cleanup_boundary_plan.json`
- `outputs/store_release_gate4h_disposable_account_dry_run_proof/gate4h_disposable_account_dry_run_proof.json`
- `services/account-deletion/account-deletion.service.ts`
- `app/api/account/deletion-storage-dry-run/route.ts`
- Storage bucket constants for recordings, script audio, voice samples, and voice consents

## Current Storage Cleanup Readiness

The repo already has a non-destructive Storage cleanup dry-run for account deletion:

- `GET /api/account/deletion-storage-dry-run` requires the current authenticated user.
- `planStorageCleanupDryRun(userId)` requires an active account deletion request.
- It checks Storage under the current user's prefix for each supported bucket.
- It compares listed Storage objects with DB-known references.
- It returns safe status/count summaries only.
- It does not return full Storage paths, object keys, signed URLs, raw audio, transcript bodies, secrets, cookies, tokens, raw provider responses, or full user identifiers.
- Actual Storage cleanup exists behind account deletion destructive guards and is not run by this gate.

Gate 4h human-observed evidence for the disposable account already shows:

- deletion request created;
- typed confirmation completed;
- provider / Storage / database / Auth statuses pending;
- Storage cleanup `not_needed`;
- listed `0`;
- known `0`;
- blockers none;
- actual deletion not run.

## Storage Cleanup Proof Targets

The proof package must cover these four account-owned Storage categories:

| Category | Bucket / source | Readiness expectation |
| --- | --- | --- |
| Recordings | `recordings` | Count user-owned recording objects under the user prefix and compare against DB-known recording references. |
| Script audios | `script-audios` | Count app-owned generated model audio objects under the user prefix and compare against owned `script_audios.stored_asset` metadata. |
| Voice samples | `voice-samples` | Count normal voice setup sample objects under the user/consent prefix and compare against owned `voices.sample_audio_path`. |
| Voice consents | `voice-consents` | Count consent recording objects under the user prefix and compare against owned `voice_consents.metadata`. |

Brush-up-specific Storage categories remain deferred to v1.1 because Brush-up is not in v1 release scope.

## Safe Summary Contract

The Storage cleanup proof should include:

- bucket/category name;
- bucket status: `not_needed`, `required`, or `blocked`;
- known object count;
- listed object count;
- orphan candidate count;
- missing known object count;
- list status: `available` or `unavailable`;
- overall Storage cleanup dry-run status;
- request / confirmation status;
- stop point before actual deletion;
- redaction status;
- destructive operation executed: `false`.

The proof must not include:

- full email;
- full user id;
- full Storage path;
- object key;
- signed URL;
- auth token;
- cookie value;
- secret or env value;
- transcript body;
- raw audio;
- raw provider response;
- provider voice id;
- raw DB row identifiers.

## Readiness Conditions

Gate 4m readiness is satisfied for the non-destructive proof layer when:

- a disposable account or Store-review-safe account has an account deletion request;
- typed confirmation is complete;
- Storage dry-run can be viewed in an authenticated UI or safely called by an operator without exposing credentials to Codex;
- all four Storage categories are represented;
- bucket statuses are `not_needed` or `required`, not `blocked`;
- missing known object count is `0`;
- no full paths, object keys, signed URLs, raw audio, transcript body, secrets, cookies, tokens, or raw provider responses are recorded;
- provider cleanup remains `succeeded` or `not_needed` before any future actual Storage cleanup;
- actual Storage deletion is not run during readiness capture.

## Store Submission Blocker

Storage cleanup proof remains a Store submission blocker because actual account deletion proof has not run yet.

Gate 4h gives a safe dry-run proof with zero Storage candidates for the disposable account. That is useful evidence, but it is still non-destructive. Before Store submission, Native Minute needs either:

- a separately approved destructive proof showing Storage cleanup reaches `succeeded` or `not_needed`; or
- human-approved Store/legal acceptance that the account deletion proof path is sufficient without a live destructive run.

The recommended path is to keep this as a blocker until a separate destructive gate is explicitly approved.

## Stop Conditions Before Actual Deletion

Do not proceed to actual Storage cleanup if any of these is true:

- Storage dry-run status is `blocked`.
- Any required bucket is unavailable.
- Missing known object count is greater than `0`.
- Owned target counts changed between the latest dry-run and actual candidate collection.
- Provider cleanup is not `succeeded` or `not_needed`.
- Destructive guard is not explicitly enabled in a later approved destructive gate.
- Operator request reference cannot be safely resolved server-side.
- The proof would require recording full paths, object keys, raw identifiers, secrets, or private data.
- Any DB schema/migration, Auth policy, Storage policy, or ownership-boundary change is required.

## Recommended Next Gate

Recommended next gate:

- `Gate 4n: Account deletion actual proof approval packet`

Scope:

- gather human approval for whether to run a destructive disposable proof;
- define operator, reviewer, approver, stop points, and rollback limitations;
- decide whether proof can be satisfied by `not_needed` Storage cleanup for the disposable account;
- continue to avoid actual deletion until the destructive gate is explicitly requested.
