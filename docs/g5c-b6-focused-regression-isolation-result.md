# G5C-B6 Focused Regression / Isolation

Status: `LOCAL_PASS_PENDING_INDEPENDENT_AUDIT_AND_PUSH`

Gate: `G5C_B6_FOCUSED_REGRESSION_ISOLATION`
MODE: `G5C_B6_FOCUSED_P1_REMEDIATION_V1`

This is a local P1-remediation checkpoint, not an independent closeout audit or a push declaration.

Canonical Staging is `native-minute-staging` (`ztlliqishddrrvqqrrlu`). Existing canonical migration evidence is reused: `0001`–`0020` remain applied. The B6 implementation and this focused remediation add no migration, provider/Storage adapter, production source, route, BFF, or UI change.

- The focused tests retain the response-loss resume, committed-withdrawal resume, and one-runner `storage_cleanup` `partial_failure` proofs. The fresh-consent recovery test now reaches Mobile Voice Setup GET → production `getVoiceSetupState` → production `getCurrentProcessingConsent` without mocking the consent helper. Its safe repository/client fixture returns legacy `voice_consents` history, no current exact active `voice_cloning` processing-consent row, and no current ElevenLabs voice. It asserts the exact current-contract query filters and returns `consent_required`, never `ready`; the legacy `voice_consents` row is therefore not current-consent authority.
- Existing evidence was reused without reopening B4 cross-user destructive isolation, malformed/missing fail-closed, writer/snapshot race, atomic rollback, partial-cleanup-zero, learning-history preservation, GET-read-only, Web/Mobile authority, POST-step bounds, finalizer separation, refresh/relaunch, safe DTO, bounded UI advance, provider rejected GET-first, verification-first Storage, stale lease/CAS suites, or account-deletion separation.
- Current remediation validation passed: 34 focused tests across the three B6 files and 252 affected G5C tests across 20 files. The prior full Mobile-suite result remains implementation evidence and was not rerun for this test/document-only remediation.

## Existing safe Staging proof

The existing B6 safe Staging proof remains PASS and is reused; this remediation made no Staging mutation. Only two disposable synthetic Auth identities were used. The harness called the existing durable operation RPCs and server-only Admin cleanup only; it did not call any provider, Storage, script, recording, evaluation, review, progress, or account-deletion service. The initial non-evidence concurrency attempt was cleaned up and was immediately followed by a diagnostic and final harness that both passed; no durable-contract regression was reproduced or accepted as evidence.

- Concurrent `create_or_get_voice_deletion_operation` through two independent clients returned one canonical operation for both callers, exactly one `created=true` winner, exactly one active row, matching synthetic owner, and zero targets.
- A separate zero-target sealed operation accepted lease A, rejected lease B before expiry, then reclaimed successfully for B after expiry. The runner-attempt counter advanced monotonically, B was the current lease authority, and delayed A release returned no mutation while B remained authoritative. The valid B release completed the safe fixture.
- Provider calls=`0`; Storage calls=`0`; provider/Storage destructive calls=`0`; durable targets=`0`; destructive target mutation=`0`. The proof did not create a Storage object or make a provider request.
- Synthetic Auth cleanup completed with cascade confirmation: tagged Auth users=`0`, tagged operations=`0`, and tagged targets=`0`; no local harness file was retained. The known untracked `supabase/.temp/` metadata directory remains unchanged.
- No mutation was made to account data, scripts, recordings, takes, transcripts, scores, weak words, coach feedback, latest/best/progress data, or `script_saved_best_takes`. B4 preservation evidence remains valid and was not rerun.

## Validation

This remediation passed `npm run check:workspace`, the focused Voice Setup route test, the three B6 focused test files (34 tests), the 20-file affected G5C suite (252 tests), `mobile:typecheck`, and `mobile:lint`. Root typecheck/lint/build and the full `mobile:test` suite were not rerun because production source, routes, UI, and migrations remain unchanged. `git diff --check` passed before local commit preparation.

P0=`0`; P1=`0`; P2=`1`; remaining UNKNOWN=`1` within this focused B6 scope: the discarded first concurrent harness attempt did not retain a safe error code, then the immediate diagnostic and final independent-client proofs passed. It did not reproduce as a production defect and remains non-blocking P2; its original transport/harness cause is not asserted.

P1 remediation is complete; independent re-audit and push are pending. G5C-B7 remains unstarted and deferred. No cloned voice, ElevenLabs DELETE/GET, live eventual-consistency, real provider timeout/credential proof, or Storage destructive mutation was performed.

Next single action: G5C-B6 focused independent read-only re-audit.
