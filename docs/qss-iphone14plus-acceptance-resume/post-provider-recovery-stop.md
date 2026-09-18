# Post-provider recovery — local preflight STOP

MODE: `QSS_POST_PROVIDER_STORAGE_FAILURE_TERMINAL_RECOVERY_LOCAL_IMPLEMENTATION`

2026-09-17. Result: **STOP_STORAGE_PHYSICAL_ABSENCE_CONTRACT_UNESTABLISHED**.
Local implementation is **not complete**; no recovery migration, RPC, status, or operator was added.
P1/P2/P3/J/Gate5 remain CLOSED. Formal acceptance remains PAUSED.

## Preflight and existing contract

- Workspace: `/Users/karasawatakahiro/Developer/native-minute`.
- Branch: `codex/g3-mobile-main-loop`.
- HEAD, upstream and read-only `git ls-remote` branch result all equal `910bfa46f63783966c50242b3ac6067dd4ce3f6b`.
- Existing changes to `docs/current-state.md` and untracked acceptance/QA artifacts were preserved.
- Latest repository migration is `0031_take_personal_metadata.sql`; no `0032` was created or applied.
- Migration0019 defines `reserved / completed / cancelled / manual_required`. The owner partial unique index and reserve RPC block `reserved / manual_required`, including expired reservations. Migration0030 preserves the underlying reserve/cancel contracts.
- `completed` means canonical finalization succeeded. `cancelled` requires known no side effect. `manual_required` remains unresolved. None can represent this failure without changing its meaning. If the absence prerequisite is resolved, a single new terminal such as `failed_after_provider` would be necessary; this is a candidate, not an implemented status.
- Existing finalize uses the same owner advisory lock, locks the exact intent, checks `reserved`, lease token/expiry and canonical ownership, then atomically inserts `script_audios` and completes the reservation. Cancel only updates matching `reserved` rows. These implementations were not changed.
- The table has RLS and no direct public/anon/authenticated/service-role table privileges; writer functions provide service-role-only execution. No client/mobile recovery route was added.

## Exact blocker

The accepted 18:13 finding establishes provider success/audio-byte receipt, `failed / storage_staging`, no canonical result, no target Storage catalog row, and an expired reservation. It does **not** establish physical object absence. No live query or mutation was performed in this task.

The existing `services/account-deletion/account-deletion-storage-adapter.ts` implements `verifyObjectAbsence` through exact owned `/storage/v1/object/info/<bucket>/<key>`. It accepts transport 404, or transport 400 with the exact `statusCode="404", error="not_found", code="NoSuchKey", message="Object not found"` body. It does not inspect a backing-store object independently of the catalog. `voice-source-cleanup-storage-adapter.ts` reuses that implementation.

Supabase's public source at commit `e07d10b23d7e644df6ee1133c2d14b679025edb6` resolves `findObject(...)` **before** invoking the renderer in both HEAD and info paths. ObjectStorage's `findObject` delegates to the database. A catalog lookup failure can therefore end the request before the backend physical-object check. The info response alone cannot distinguish that path from a backend absence. Changing to the ordinary HEAD route does not establish the missing guarantee.

Sources, read-only research:

- [Pinned Supabase info/HEAD request handler](https://github.com/supabase/storage/blob/e07d10b23d7e644df6ee1133c2d14b679025edb6/src/http/routes/object/getObjectInfo.ts#L68-L85).
- [Supabase ObjectStorage findObject delegation](https://github.com/supabase/storage/blob/e07d10b23d7e644df6ee1133c2d14b679025edb6/src/storage/object.ts#L258-L267).
- [Storage schema documentation](https://supabase.com/docs/guides/storage/schema/design): catalog metadata and physical objects are separate; metadata absence is not physical deletion evidence.

This is not evidence of the exact Storage server version deployed to Staging, nor a claim that a physical orphan exists. It establishes that the repository's current response-only verifier is insufficient to certify the stronger physical-absence prerequisite for this new recovery. Existing Gate5 approvals and implementations are not reopened or re-audited.

The user-specified stop condition applies: **「exact Storage absenceを安全に判定するため新たな外部操作設計が必要」**. A new authoritative observation/proof contract would be needed; this task does not design or execute it. Mocking an `absent` result, accepting an operator boolean, or storing an info 404 in audit JSON would not supply that missing authority.

## Recovery boundary and follow-up

- No terminal transition is currently authorized/implemented for this case. The exact 18:13 reservation remains unresolved; the owner guard must remain in force.
- Provider success and failure evidence must remain durable. Do not call known-no-side-effect cancel, infer billing/refund status, or claim a provider asset was reclaimed.
- Do not delete a physical object if one is found. Present or uncertain must stop recovery under this scope.
- After the evidence contract is established, recovery must require the exact intent plus owner/script/voice/cache/bucket/key identity, expired reserved state, a CAS fence against finalize, and canonical result absence. The final transaction must recheck DB facts and retain the evidence. No fallback intent, direct UPDATE, or row deletion is permitted.
- New retry must use a new intent. It can cause another provider generation and duplicate cost. Neither BFF deployment alone nor lease expiry releases the current guard.
- **Staging exact mutation: none available.** Do not invent an RPC invocation or substitute cancel. Implementation, scoped DB/race tests and the requested one-time independent review must finish before an exact invocation can be handed off.
- BFF writer fix must be deployed and verified before Human retry. Recovery and that deployment must both be complete before retry; neither is performed or authorized for execution by this local task.
- Only after those prerequisites: same Staging account/script, prepare once, listen on speaker, pause/resume, inspect media time, leave/reopen and verify replay with `cached=true`/cache-hit evidence. Native rebuild/install is unnecessary. Formal acceptance remains paused until an explicit resumption.

## Validation and review

- `npm run check:workspace`: PASS.
- Scoped existing migration/repository contract and script-audio unit suites: **3 files / 20 tests PASS** (`voice-asset-write-intent-contract`, `voice-server-owned-script-audio-writer`, `script-audio-server-storage-writer`). All provider/Storage effects in these suites are mocked.
- `npm run lint`: PASS, no warnings/errors.
- `npm run typecheck`: PASS.
- `git diff --check`: PASS; the new document was also checked for trailing whitespace.
- New recovery DB/unit/race tests and isolated PostgreSQL migration execution: **NOT RUN / no implementation**, because the explicit STOP prerequisite was reached before a migration or function was added.
- Build: **NOT RUN**, documentation-only task changes; no UI, route, type or runtime source change. No native rebuild/install.

Existing tests verify current behavior only; they cannot certify the missing new recovery contract or physical absence.

Independent implementation review: **NOT RUN — implementation stopped at the explicit prerequisite**. No PASS verdict is claimed. No Gate5-wide audit occurred.

Staging DB/migration/18:13 mutation, BFF deployment, provider calls, Storage reads/deletes, Production operations, commit and push: **0**. Public source research and read-only git remote inspection are the only network checks.

NEXT_ONE_ACTION: **Establish the exact-target physical Storage absence evidence contract, including its authoritative observation boundary, before resuming local recovery implementation.** This is a design/evidence handoff, not approval to perform an external operation.
