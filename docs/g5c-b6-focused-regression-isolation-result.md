# G5C-B6 Focused Regression / Isolation

Status: `CLOSED_COMMITTED_PASS`

Gate: `G5C_B6_FOCUSED_REGRESSION_ISOLATION`
MODE: `G5C_B6_FOCUSED_REGRESSION_ISOLATION_IMPLEMENTATION_V1`

Final proof accepted: `G5C_B6_FOCUSED_REGRESSION_ISOLATION_PASS`.

Canonical Staging is `native-minute-staging` (`ztlliqishddrrvqqrrlu`). Existing canonical migration evidence is reused: `0001`–`0020` remain applied. This closeout added no migration, provider/Storage adapter, production source, route, BFF, or UI change.

- New direct production-path tests close the focused gaps. A durable `snapshot_status=succeeded` response-loss fixture resumes through the consent runner without a reseal, a new target, or any provider/Storage/DB/verification/finalizer dispatch. A durable withdrawal committed at `provider_cleanup` returns `provider_stage_reached` without resealing or re-running the consent mutation. A due `storage_cleanup` `partial_failure` dispatches exactly one Storage runner and no other runner/finalizer. Mobile Voice Setup treats a legacy consent row with no current exact processing consent and no default voice as `consent_required`, not `ready`.
- Existing evidence was reused without reopening B4 cross-user destructive isolation, malformed/missing fail-closed, writer/snapshot race, atomic rollback, partial-cleanup-zero, learning-history preservation, GET-read-only, Web/Mobile authority, POST-step bounds, finalizer separation, refresh/relaunch, safe DTO, bounded UI advance, provider rejected GET-first, verification-first Storage, stale lease/CAS suites, or account-deletion separation.
- Focused tests passed: 34 tests across the three changed files. The affected G5C suite passed 261 tests across 20 files. The final full Mobile suite passed 603 tests across 54 files.

## Safe Staging proof

Only two disposable synthetic Auth identities were used. The harness called the existing durable operation RPCs and server-only Admin cleanup only; it did not call any provider, Storage, script, recording, evaluation, review, progress, or account-deletion service. The initial non-evidence concurrency attempt was cleaned up and was immediately followed by a diagnostic and final harness that both passed; no durable-contract regression was reproduced or accepted as evidence.

- Concurrent `create_or_get_voice_deletion_operation` through two independent clients returned one canonical operation for both callers, exactly one `created=true` winner, exactly one active row, matching synthetic owner, and zero targets.
- A separate zero-target sealed operation accepted lease A, rejected lease B before expiry, then reclaimed successfully for B after expiry. The runner-attempt counter advanced monotonically, B was the current lease authority, and delayed A release returned no mutation while B remained authoritative. The valid B release completed the safe fixture.
- Provider calls=`0`; Storage calls=`0`; provider/Storage destructive calls=`0`; durable targets=`0`; destructive target mutation=`0`. The proof did not create a Storage object or make a provider request.
- Synthetic Auth cleanup completed with cascade confirmation: tagged Auth users=`0`, tagged operations=`0`, and tagged targets=`0`; no local harness file was retained. The known untracked `supabase/.temp/` metadata directory remains unchanged.
- No mutation was made to account data, scripts, recordings, takes, transcripts, scores, weak words, coach feedback, latest/best/progress data, or `script_saved_best_takes`. B4 preservation evidence remains valid and was not rerun.

## Validation

Passed: `npm run check:workspace`, root `typecheck`, root `lint`, root `build`, `mobile:typecheck`, `mobile:lint`, focused tests, affected G5C tests, and the full `mobile:test` suite. `git diff --check` passed before commit preparation.

P0=`0`; P1=`0`; P2=`1`; remaining UNKNOWN=`1` within this focused B6 scope: the discarded first concurrent harness attempt did not retain a safe error code, then the immediate diagnostic and final independent-client proofs passed. It did not reproduce as a durable-contract failure and does not block this closeout, but its original transport/harness cause is not asserted.

G5C-B7 is explicitly deferred. No cloned voice, ElevenLabs DELETE/GET, live eventual-consistency, real provider timeout/credential proof, or Storage destructive mutation was performed.

Next single action: G5C-B6 independent read-only closeout audit.
