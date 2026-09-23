# Script revision / archive foundation — local implementation

2026-09-23. Source of truth: [live reconciliation](script-revision-archive-live-db-reconciliation-20260923.md) and the Human-approved implementation request. **LOCAL VALIDATED; live NOT APPLIED; commit/push NOT DONE.**

## 1. MODE / preflight

`NATIVE_MINUTES_SCRIPT_REVISION_ARCHIVE_FOUNDATION_IMPLEMENTATION`.
Root `/Users/karasawatakahiro/Developer/native-minute`, branch `codex/g3-mobile-main-loop`; HEAD/upstream/remote at entry all `392700a229a55307a57582f0722d2b41ff66c5d3`. Workspace guard PASS. No reset/stash/staging/commit/push. Initial hashes cover 830 files; none disappeared. Existing styles and acceptance-checklist/mapping WIP remain byte-identical. The existing untracked Progress concurrency test was updated only for the affected read contract. Current-state history is retained beneath a new checkpoint.

## 2. Exact implementation scope

Stable Script ID, immutable content revisions, title snapshot on Take claim, nullable legacy identity, archive/restore, authoritative active-10 limit, optimistic edit conflicts, practice epoch, revision-bound recording/reference-audio writes, same-revision comparisons, all-time history, Web/Mobile management and targeted metadata updates.

No quota operations/limits, 200-word or 2,000-character validation, generation visibility changes, candidate schemas, import/export features, branding, orientation, new performance project, or template integration. Existing 4,000-character validation remains. No dependency or environment variable added.

## 3. Migration / schema

- `0033_script_revision_archive_foundation.sql`: `script_revisions`; scripts current revision/archive/version/epoch; nullable Take revision/title/epoch; script-audio revision/key version/preset/binding; durable writer revision identity. Composite constraints prevent cross-script/cross-owner linkage. A deferred trigger verifies the current content projection. Revisions and saved Take identities cannot be rewritten.
- Authenticated users read owned scripts/revisions including archives. Normal clients cannot directly insert/update/delete scripts or insert/delete Takes; personal Take name/favorite remains updateable. Create/edit/archive/restore and claim/save use restricted RPCs. The old reservation signature is not executable by normal or service roles.
- `0034_script_revision_deletion_inventory.sql`: narrowly extends the existing account-deletion inventory to v2, including all revisions and registered-source-use cascade rows (20 tables). Existing v1 evidence and prior migration bytes stay unchanged. Existing Provider → Storage → DB → Auth order, legal holds, retention, post-state checks and writer fences remain. A v1 request must already have terminal DB cleanup to use the legacy replay verifier.
- Both migrations fail before changing their contract if nonterminal v1 deletion is in flight. They are a coordinated forward-only cutover, not an independently deployable client change.

## 4. Legacy handling

Current script rows receive a `current_baseline` observation. Existing Takes and audio are **not** attached to it. The synthetic existing-shape fixture verifies seven NULL-revision Takes, exactly six `reviewed` plus one `completed`, unchanged IDs/status/favorite/name/coaching/weak words/audio. Review shows that the original script was not saved; the current title, if used, is explicitly labelled as current. Missing versioned revision data fails closed rather than substituting current content. No live historical data was transformed.

## 5. Edit

Content/locale/target changes create a revision in the same transaction as the current projection update. Title-only changes increment lock version but preserve revision, epoch and reference-audio key. Expected revision + lock version are required; stale writes return conflict and retain the draft. The user can explicitly reload the current base before resubmitting. The Take title is fixed at evaluation claim, not inferred later from the current Script title.

## 6. Archive / restore

Normal Web DELETE and Mobile management archive the logical script. No product path physically deletes it or calls provider/Storage deletion. Active list and practice suggestions exclude it; history, favorite, custom name, reference audio and saved recording remain owner-readable. Archive frees a slot. Restore uses the same limit and keeps the current revision. Archive/restore each advance the epoch to reject an old request even after an archive → restore cycle. Repeating the same directional request is a no-op.

## 7. Active-10 concurrency

Create and restore acquire the existing per-owner transaction advisory lock before counting active scripts and writing. Revisions, archives and unsaved templates consume no additional active slot. Isolated concurrent clients verified: 16 creates yield exactly 10 successes; one restore plus seven creates competing for the final slot yield exactly one success. Concurrent edit/archive with one expected version yields one commit and one conflict.

## 8. Review / Progress / audio

Versioned Review reads immutable saved revision content/locale/duration and Take title snapshot. Latest/best/deltas are computed only among reviewed Takes of the same revision. The current-script summary excludes legacy and old revisions; history retains both. All-time practice count includes all reviewed Takes, including old revisions/archives and six legacy reviews. The completed legacy record is displayed separately and is not promoted or counted as reviewed.

Reference audio v2 keys include immutable revision, provider, voice and generation preset. Queries require revision match. Legacy unbound audio and old-revision audio remain stored; they are not automatically relabelled or reused as current. Upload reservation, evaluation claim, review commit and audio finalization check active state/revision/epoch. A recording locator cannot be reserved again under another revision/epoch.

An already reserved external operation can finish while archive/edit races with it, but its stale result cannot be attached/published. Existing durable intent/quota evidence remains for the existing recovery process; this task does not cancel or delete external assets automatically. All tests use synthetic local data/mocks, with zero real provider/Storage calls.

## 9. Web / Mobile / API

Both clients use the same Script service/RPC contract. Added Web edit/archive list and Mobile edit/archive/restore controls. Mobile GET supports an archived scope; PATCH/DELETE require version tokens. Listen/upload/evaluate require practice identity. Recording checks the current state immediately before starting, freezes that identity for retries, and cancels delayed start on exit. Web remounts the recording panel on revision/epoch changes and retains one Take ID across evaluation retries. Web Progress no longer truncates history to five scripts.

## 10. Metadata continuity

Script mutation patches the active list from the authoritative mutation response and marks the shared aggregate plus only that Script's Review metadata dirty. Other Reviews retain successful display. Earlier read/mutation responses cannot roll back newer metadata. Name/favorite patches also cover historical revision summaries. Review metadata still contains no audio permission; entry ownership/object-version validation, one-item 30-second audio reuse, fresh Share and lifecycle/auth invalidation are retained. No all-screen cache flush or new periodic refresh.

## 11. Tests / validation

- Workspace guard, root/mobile lint, root/mobile typecheck, Next build, local-spike Vite build and diff check: PASS.
- Directly affected unit/service/API/UI/browser regression scope: **31 files / 506 tests PASS**, including the existing recording browser cases, Web delayed-start exit, mixed revision/legacy DTO round trip, title snapshots, archive-only DELETE and metadata races.
- Isolated PostgreSQL 17 (`--network none`, no published ports, cached image only): all migrations on a clean DB; pre-0033 legacy fixture; owner/RLS/ACL checks; immutable history; successful atomic review save; rejected archive-during-evaluate/audio finalization; recording relabel rejection; create/restore/edit concurrency; account v2 cascade/count/fence/retry; v1 active-cutover rejection and exact closed-evidence preservation/replay: PASS. The disposable container was removed.
- Evidence: `outputs/script-revision-foundation-20260923/{final-tests,db,lint,mobile-lint,typecheck,mobile-typecheck,build,mobile-build,workspace,diff-check}.log`.
- Full historical suite, real-provider flow, actual-device acceptance, live DB checks/apply, native signing/install, deployment and release guard were not run. Scope is the directly affected local foundation; prior device/performance acceptance and existing release blockers are not promoted to PASS.

## 12. One focused review

One read-only focused review after core implementation covered history loss, false backfill, owner boundaries, destructive entry points, archive writes, active limit, audio identity, migration/RLS and Review/Progress semantics. No P0 found. Two reproducible P1 findings were fixed, then verified without another broad review:

1. Mobile parser still equated current-version Take count with full history length. Fixed to validate current and all-time/legacy counts separately; a real service-output/API-parser round-trip test covers mixed history and rejects false counts.
2. Web retained recording/start state could survive a revision rerender or complete its fresh lookup after exit. The panel is keyed by revision/epoch and cancels delayed start/streams on unmount; a browser regression verifies no late microphone request.

Additional DB validation found an ambiguous column in the v1 terminal replay branch; it was qualified, and the existing-evidence fixture/replay now passes. No future architecture was added to address these findings.

## 13. Changed files

Exact task manifest: `outputs/script-revision-foundation-20260923/changed-files.txt`; preservation evidence: `wip-preservation.json` in the same directory. Main groups:

- Migrations 0033/0034 and `types/database.ts`.
- `services/scripts`, `services/review`, `services/progress`, recording storage, voice cache/writer, Take audio and the narrow deletion inventory/version contract.
- `schemas/{script,evaluate,upload,voice}.ts`, Web routes/pages/components and `lib/mobile` adapters/DTOs.
- Mobile API parsing, metadata loaders/mutation handling, Scripts/Home/Listen/Record/Review/Progress and the new ScriptManagement control.
- Targeted tests, isolated SQL/Python fixture runner, README/AGENTS/current-state and this report.

The manifest excludes pre-existing unrelated WIP and generated build output. Nothing is staged.

## 14. P0 / P1 / P2

P0: none found. P1: the focused-review findings and the DB replay defect are fixed with passing regression evidence; none left open in the implemented local scope. P2/next-stage validation: actual-device edit/archive/restore and prior metadata-performance Human acceptance remain pending. Multi-client rollout must be coordinated because old clients lack required practice identity. Historical G5D v1 invocation-proof scripts remain v1 evidence and must not be reused as v2 live proof without an approved v2 invocation plan.

## 15. Live status

**NOT APPLIED.** No Staging/Production migration, database write, provider call, Storage operation, deployment or device installation was performed.

## 16. Commit / push

**NOT DONE.** Same branch and HEAD; no staging or unrelated changes included.

## 17. Human approval for next live step

Required by the request's explicit live-apply prohibition. Proposed next Staging plan, for separate approval:

1. Approve the exact 0033/0034 files and application diff; recheck target project and current migration head. Capture restricted backups and content-free counts/legacy identity hashes. Confirm no active v1 deletion and no unresolved practice writer/evaluation operations; otherwise stop.
2. Quiesce writes from old Web/Mobile clients. Apply 0033 then 0034 in the same maintenance window; do not reopen writes between them. On failure keep writes closed and diagnose—do not drop revisions or reverse-transform history.
3. Verify current projection/FKs/RLS/grants, exact legacy NULL/status preservation, audio binding, active counts and unchanged closed v1 evidence. Switch the matching BFF/Web/Mobile versions before reopening writes; reject old clients safely.
4. Run approved Staging smoke with an owned test account: title/content edit, conflict, archive/history/playback, restore and ten-slot boundary. Obtain separate permission for real provider use and device acceptance. Production remains a later decision.

This document is a concrete reviewable plan, not authorization to execute it. Commit/push is also deferred until the implementation result is returned and the next action is authorized.

## 18. NEXT_ONE_ACTION

Human reviews this local result and approves or adjusts the coordinated **Staging 0033/0034 + BFF/Web/Mobile cutover plan**. Do not apply migrations yet.
