# Storage Object Cleanup Boundary Plan

Recorded: 2026-06-07

This is a planning checkpoint for Storage object cleanup across practice slot deletion and account deletion. It does not execute Storage deletion, account deletion, DB cleanup, Auth deletion, provider cleanup, schema changes, env changes, Store Console work, screenshot capture, Capacitor work, or provider calls.

## Current Repo Findings

Practice slot deletion:

- `/api/scripts/[id]` requires the current user before deleting.
- `deleteScript` deletes only the owned `scripts` row by `user_id + id`.
- Related DB rows for `script_audios`, `takes`, weak words, coach feedback, saved model audio pins, and saved best take pins are expected to fall away through existing foreign keys and current service behavior.
- Practice slot deletion does not call Supabase Storage remove and does not run provider cleanup.
- Production human smoke confirmed the five-slot UX: five full slots, sixth-script block, organize-stock link, discoverable per-card delete action, confirmation UI, reopened slot after deletion, new script creation, and intact `/progress`.

Storage objects that can remain after practice slot deletion:

- `recordings`: user-owned recording objects keyed under the user/script prefix.
- `script-audios`: app-owned generated model audio objects referenced from `script_audios.stored_asset`.
- `voice-samples`: normal voice setup sample objects under user/consent prefix.
- `voice-consents`: consent recording objects under user prefix.

Account deletion cleanup:

- Account deletion dry-run already covers `recordings`, `script-audios`, `voice-samples`, and `voice-consents`.
- Storage dry-run lists Storage objects under the user's prefix and compares them with DB-known references.
- Storage dry-run returns safe counts/status only and does not return object keys, signed URLs, transcript bodies, raw audio, secrets, or raw provider responses.
- Storage actual cleanup exists behind account deletion destructive guards and is not exposed through the practice slot deletion path.
- Account deletion actual order remains provider cleanup, Storage cleanup, DB cleanup, Supabase Auth deletion, post-delete verification.

## Boundary Decision

Practice slot deletion is a slot-management action. Its v1 responsibility is to remove the script from the active practice library, reopen one of the five slots, and keep `/scripts` and `/progress` coherent for the remaining scripts.

Account deletion is the user-level data removal action. Its v1 responsibility is to cover all owned Storage buckets and DB cleanup after explicit deletion request, confirmation, dry-run proof, operator guard, and destructive approval.

These two flows should stay separate:

- Practice slot deletion must not silently trigger broad user-level Storage cleanup.
- Account deletion must include Storage cleanup before DB cleanup and Auth deletion.
- Storage cleanup implementation should not be added to the public practice-slot delete button without a separate small design and proof pass.

## Practice Slot Deletion Policy

Recommended v1 policy:

- Keep practice slot deletion as DB-first slot management for now.
- Do not run Storage remove from the `/api/scripts/[id]` delete path in the current release line.
- Keep the user-facing meaning as "remove this practice from my active stock" rather than "permanently erase every related object from Storage."
- If a later release adds per-script Storage cleanup, make it an explicit non-breaking enhancement behind server-side ownership checks.

Possible future per-script cleanup gate:

- Collect owned object candidates by `userId + scriptId` for `recordings`.
- Collect `script-audios` object candidates through owned `script_audios.stored_asset` rows before deleting those rows.
- Never trust client-provided Storage paths.
- Delete Storage objects before DB rows if the product claim becomes "remove all files for this script."
- Return only safe counts/status, not object keys or raw paths.
- Add failure behavior that leaves the script visible or marks manual follow-up rather than losing DB references before Storage cleanup completes.

## Account Deletion Policy

Recommended v1 policy:

- Treat account deletion Storage cleanup as required before Store submission actual deletion proof.
- Keep Storage cleanup in the guarded account deletion operator/destructive path, not the public Settings flow.
- Continue using dry-run counts/status for proof packages.
- Run provider cleanup before Storage cleanup when provider-owned voice resources exist.
- Run DB cleanup only after provider and Storage cleanup are `succeeded` or `not_needed`.
- Run Supabase Auth deletion last.

Account deletion must cover:

- `recordings`
- `script-audios`
- `voice-samples`
- `voice-consents`
- any future Brush-up-specific Storage buckets or object classes before Brush-up returns in v1.1

## Store Release Impact

Practice slot Storage cleanup is not a Store submission blocker if public copy does not claim that deleting a practice slot permanently removes every related Storage object. It remains a storage hygiene / cost / privacy follow-up and should be tracked as a warning.

Account deletion Storage cleanup is a Store submission blocker for the actual deletion proof path. Before submission, the app needs a human-approved destructive gate run or equivalent proof that account deletion removes or appropriately handles owned Storage objects.

## Next Gate Recommendation

Recommended next gate:

- `Gate 4m: Account deletion Storage cleanup proof readiness`

Scope:

- Re-run safe Storage dry-run for the disposable account if needed.
- Confirm the four bucket categories with safe counts/status.
- Confirm destructive guard requirements and operator stop points.
- Do not execute actual deletion unless a separate destructive approval gate is explicitly requested.

Practice slot per-script Storage cleanup should be a later optional gate unless product copy or Store review feedback requires it before release.
