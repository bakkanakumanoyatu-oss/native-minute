# Post-provider failure terminal — LOCAL implementation

MODE: `QSS_POST_PROVIDER_FAILURE_TERMINAL_WITH_ORPHAN_POSSIBILITY_LOCAL_IMPLEMENTATION`

2026-09-17. Local implementation; STOP before Staging apply. P1/P2/P3/J/Gate5 CLOSED; formal acceptance PAUSED. This contract supersedes the physical-absence prerequisite and NEXT_ONE_ACTION in [the historical preflight STOP](post-provider-recovery-stop.md). No further physical-absence research is required for this transition.

## Preflight / terminal decision

Developer checkout, branch `codex/g3-mobile-main-loop`, HEAD `910bfa46f63783966c50242b3ac6067dd4ce3f6b`. Existing current-state/acceptance/QA/env-backup WIP preserved; no env files read for recovery testing. Latest migration before this task: 0031.

0019 statuses are `reserved`, `completed`, `cancelled`, `manual_required`. Completed certifies canonical finalization; cancellation requires known no side effect; manual remains unresolved. None represents this failure. 0032 adds only `failed_after_provider`, only for `script_audio_create`.

This terminal means **the exact failed intent has no canonical result at recovery and cannot finalize/reuse its reservation**. Provider effect `occurred|possible`, Storage outcome `failed|unknown`, and `orphan_possible=true` are retained. `failed` is the application Storage operation outcome, not object absence. No provider charge/refund conclusion, physical absence, cleanup success, or provider-side undo follows. A later new intent may create a canonical row for the same cache; that does not rewrite the retired intent's history.

## Migration / source / evidence

- `supabase/migrations/0032_script_audio_post_provider_failure.sql`: forward-only migration; status/shape/evidence constraints, exact recovery RPC, evidence immutability, narrow deletion coordination.
- `types/database.ts`: status, evidence columns, typed RPC arguments/result.
- `scripts/script-audio-recovery-isolated-test.py` / `.sql`: synthetic local PostgreSQL proof; Docker `--network none --pull=never`, no host port, fresh 0001–0032, container removed in finally. No provider or Storage service exists in this test environment.
- Existing cancel/finalize/reserve implementations, UI, BFF writer patch, quota, retention policies and historical migrations are unchanged. No additional environment variable or setup dependency.

`recover_script_audio_post_provider_failure` is SECURITY DEFINER with fixed search path; EXECUTE only service_role (database owner retains ordinary DBA authority). No client route, direct table grant, automatic error-handler invocation or generic operator row update is added. The SQL RPC is the operator surface; a new CLI is unnecessary.

Exact parameters: intent ID, owner ID, original lease token, expected updated_at, script ID, voice ID, cache key, bucket, object key, provider effect, Storage outcome, opaque evidence UUID. The expected values come from a freshly inspected exact intent, not a client payload or a fallback lookup. Evidence UUID references the restricted operator incident record; it is an operator attestation/correlation reference, not an automated provider proof. Record accepted provider/audio receipt and staging failure there. It has no FK to quota events and copies no raw provider IDs/logs/private text, so existing quota purge/hold rules remain independent. Facts needed to interpret the terminal are stored in columns even if that separate record expires.

The RPC takes the existing owner advisory lock and owned account-request locks, refuses active deletion/hold safety conditions, locks only the specified intent, and requires reserved + expired lease + exact lease/version/context. It rechecks current script/voice ownership and canonical `script_audios` absence by cache tuple **or** exact locator/path, then performs a status/lease/version CAS. Completed/cancelled/manual/failed terminals, wrong owner/intent/context, stale version and active lease reject. Expiry is only a stale-writer precaution, not side-effect evidence or an external request cancellation guarantee. Operator must first establish that the original request is finished; in-flight/late Storage traffic is not fenced by a database transaction.

## Orphan and deletion boundary

For this writer kind, the existing reserved intent durably stores the exact `script-audios` bucket/object key before provider dispatch; 0032 preserves it unchanged. The known 18:13 evidence reports that exact intent and locator. No locator is fabricated from a missing object. The RPC validates the persisted locator, and a present catalog object is accepted just like an unobserved one. No Storage reads, existence checks, or deletes are performed.

Terminal evidence and locator are immutable and cannot be discarded by direct row deletion or Auth cascade. Existing Account DB finalizer already rejects statuses outside completed/cancelled and is unchanged. New narrow triggers reject Account Storage snapshot advancement/finalization and Voice snapshot sealing/completion for an owner with this orphan possibility: current deletion inventories cannot certify a catalog-less physical orphan. The failed intent therefore **releases generation reservation authority but remains a deletion/cleanup obligation**. Unaffected owners retain existing deletion behavior. Legal hold and independent audit purge contracts are unchanged.

This does not implement orphan cleanup, approve indefinite retention, or claim Account deletion is now complete. A later explicitly scoped cleanup/deletion authority must resolve this obligation and provide safe disposal before this owner's deletion can complete. The existing reserved state already blocked deletion; recovery does not silently convert that blocker to deletion success. No Gate5 re-audit.

## Retry and 18:13 applicability

The accepted facts (provider success, audio receipt, Storage staging failure, no durable canonical row, expired reserved intent with exact locator) fit this RPC with `provider_effect='occurred'`, `storage_outcome='failed'`, `orphan_possible=true`. Physical outcome remains UNKNOWN. Applicability is conditional on a fresh exact DB recheck and original request completion at execution; no live recheck or mutation was performed here. The raw exact ID/lease are deliberately not guessed or placed in this document.

The owner partial unique index and reserve check remain exactly `status in ('reserved','manual_required')`. Thus this terminal is resolved for new reservations. Cancel/finalize still require reserved and the original ID cannot be reused. Retry creates a NEW intent (possibly the same deterministic cache/object path), can incur another provider generation, and does not erase earlier orphan evidence. Current exact-byte duplicate reconciliation remains in the prepared writer patch.

Terminalization alone does not authorize Human retry. Required next sequence, **not executed in this task**:

1. Complete local contract/tests and the single independent focused review; inspect final migration hash and target identity.
2. Apply only 0032 to canonical Staging `ztlliqishddrrvqqrrlu` after verifying migration ledger 0001–0031 and existing schema/ACLs. No broader migrations, Production or deploy implied.
3. Freshly select the one 18:13 reserved intent using the existing restricted incident identity. Match owner/script/voice/cache/locator, original lease + updated_at, finished failed generation event and no canonical row. Do not switch to another intent if state changed. Call exactly once:

   `recover_script_audio_post_provider_failure(p_intent_id, p_user_id, p_lease_token, p_expected_updated_at, p_script_id, p_voice_id, p_cache_key, p_storage_bucket, p_storage_object_key, 'occurred', 'failed', p_evidence_ref)`

   Use bound, named parameters from the fresh exact inspection. On rejection, STOP; no direct UPDATE/delete, cancel or fallback. On ambiguous RPC response, inspect this exact ID before any additional call. Confirm status/evidence/locator, lease cleared, canonical absence, and no other reserved/manual intent. Do not reserve a test intent or call the provider during recovery verification.
4. Revalidate the prepared candidate manifest/base against current Staging deployment. Deploy only the existing two-file [BFF writer patch](../../outputs/qss-listen-voice-readiness/staging-listen-writer.patch); no patch modification or full-HEAD deploy.
5. Confirm resulting deployment/project identity, manifest/source hashes and active alias; do not infer deployment from source HEAD. Preserve Staging environment values.
6. Only then Human retry with a NEW intent: same account/script, prepare once, speaker playback, pause/resume, media time, reopen and verify cache hit. No native rebuild/install required by this change. Formal acceptance resumes only with its separate direction.

## Validation / independent review

- `npm run check:workspace`: PASS.
- Existing focused unit suites: **5 files / 38 tests PASS** (writer intent contract, server-owned writer, exact-byte Storage writer, Account DB foundation/finalizer contracts); existing test files unchanged.
- `python3 scripts/script-audio-recovery-isolated-test.py`: **PASS**, fresh 0001–0032 on network-none PostgreSQL 17. Includes terminal semantics with a present catalog row left untouched, canonical tuple/locator rejection, wrong owner/intent/token/version/cache/path, completed/cancelled/manual/live lease rejection, expired unresolved guard, invalid evidence rejection, new intent/same cache reserve, retired intent finalization/cancel rejection, evidence immutability, Auth cascade rejection, Account Storage guard, unaffected owner's real Account DB finalizer, and deletion-active recovery rejection.
- Three real two-session cases: **PASS** (recovery/CAS contender, finalize commits first, recovery commits first). Old finalize creates no canonical row after recovery. No live service calls.
- The Voice deletion guard is exercised on a fixture table with the actual trigger function; no full Voice deletion flow or Gate5 audit is claimed. Existing Account finalizer's restrictive status whitelist is additionally checked in its current definition; the unrelated owner's finalizer is executed behaviorally.
- Root `npm run lint`, `npm run build`, post-build `npm run typecheck`, `git diff --check`: **PASS**. Python syntax compilation PASS.
- Native/mobile build/install, browser/E2E expansion and physical-device retry: **NOT RUN**, no client UI or native input changed.
- Initial DB test attempts exposed fixture-only composite-row selection, duplicate synthetic provider IDs and an intentionally reserved owner's provider-seal precondition; fixtures were corrected before the final PASS. Migration fresh-apply passed throughout.

Independent focused review: **PASS, exactly one read-only independent pass**, focused P0/P1/P2 = **0/0/0**. Reviewer checked the diff and direct dependencies, ran workspace guard (PASS), and relied on the reported test execution rather than rerunning it. No correction or second review was needed. Limits: Voice guard fixture is not the full Voice RPC flow; invalid Account-finalizer whitelist is checked by definition; two-session tests observe the leader lock but do not explicitly assert the follower wait state. No external/live proof or Gate5-wide verdict is implied.

Reviewed migration SHA-256: `6c8de5f545f5daacf60dfc70d48bd9f6147fe375a15135ac2626531f7d54807f`. Existing unmodified writer patch SHA-256: `db98ab731e7c8b0b3b4e86a2b7a0ec9710ceacb9ecfcdad1d1a759fd7b729a56`.

Staging apply/mutation, 18:13 transition, deploy, provider call, Storage delete, Production, commit/push: **0**. Tests do not certify external physical state or live recovery.

NEXT_ONE_ACTION: after local validation/review PASS, hand off **Staging apply of 0032 only** under the exact sequence above; this task stops before executing it.
