# G5C-B3 Focused Storage Cleanup

Status: `CLOSED_COMMITTED_PASS`

Scope is limited to `HDC_G5C_B3_DEDICATED_INVALID_TARGET_DURABLE_TRANSITION_V1`: focused B3 Storage target transitions and the dedicated local `invalid_target` durable mapping. G5C-B4 was not started.

Canonical Staging is `native-minute-staging` (`ztlliqishddrrvqqrrlu`). Migration `0017_g5c_b3_storage_object_transitions.sql` was already applied and remained unchanged by the forward-only architecture decision. Migration `0018_g5c_b3_invalid_storage_target_durable_mapping.sql` was then applied through the normal linked CLI path; the remote is current with `0001`–`0018` applied.

- Actual PostgreSQL catalog proof passed for `mark_storage_object_invalid_target_manual_required`: the exact fixed signature exists, owner is `postgres`, it is `SECURITY DEFINER` with `search_path=pg_catalog, public`, `PUBLIC` / `anon` / `authenticated` have no execute, and `service_role` has execute. The dedicated function has no trigger attachment; the expected B3 writer-fence triggers remain present, and 0018 added no policy or table-schema change.
- Disposable Staging fixtures used only synthetic identities and rows. Existing target-kind constraints rejected a `recordings` durable target before it could become a Storage candidate. No fixture created a Storage object.
- A canonical approved `voice_sample` target completed the real begin RPC, then the fake adapter alone returned `invalid_target`. The actual dedicated RPC moved both target and operation to `manual_required` with failure category `invalid_target`, `next_retry_at=null`, retained locator, and no verified absence, completion, locator scrub, or B4 transition. The actual runner returned the durable manual state; it did not manufacture a memory-only result.
- The verification-side fake `invalid_target` took the same dedicated RPC path after a canonical verification begin. It made no Storage list call, did not use the normal verification-result RPC, and persisted the same manual-required state.
- A fake external `rejected` result remained distinct: it used `record_storage_object_delete_result`, stayed `delete_requested` with verification pending, did not call the dedicated invalid-target RPC, and the next invocation was verification-first with no blind delete retry.
- Focused actual lease/CAS proof passed: accepted live-lease transition; wrong lease, expired lease, stale delete counter, stale verification counter, and wrong operation/user/target relation all returned no transition and did not overwrite durable state. A manual target prevented `storage_stage_complete`.

Fake adapter counters recorded `Storage.from=0`, `remove=0`, and `list=0` for the invalid-target proofs. Live Supabase Storage mutation, recordings mutation, real-user mutation, live ElevenLabs call, consent withdrawal, DB binding cleanup, locator scrub, operation completion, and B4 transition were all `0`.

Previous PASS evidence was intentionally reused without repetition: CASE A/B writer concurrency, writer-fence runtime, synthetic three-bucket delete/absence/list proof, crash/restart, and pre-existing B3 lease/CAS coverage.

Cleanup deleted every synthetic Auth identity and verified cascade removal of synthetic source and durable rows. P0=`0`; P1=`0`; P2=`0` for this closeout scope.

Validation passed: workspace check, root typecheck, lint, production build, 59 focused B3 mobile tests, one full mobile suite (462 tests), and one account-deletion Storage self-test. No secrets, raw identifiers, or locators are recorded here.

Next single action: G5C-B4 DB binding cleanup + consent withdrawal read-only inventory.
