# AGENTS.md

## First read
- Read this file first.
- Then read `docs/current-state.md`.
- Use `README.md` as setup/reference, not as the freshest implementation log.

## Workspace guard
- The correct working directory is `/Users/karasawatakahiro/Developer/native-minute`.
- Do not edit `/Users/karasawatakahiro/Desktop/native-minute` or the quarantined Desktop checkout.
- Run `npm run check:workspace` before meaningful verification; it fails outside the Developer checkout.

## Product focus
- Native Minute is a fixed 1-minute English practice MVP.
- Prioritize the main loop: `setup/voice -> scripts -> listen -> record -> review -> progress`.
- E2E expansion is not the main goal. Keep the current minimum smoke coverage unless the task explicitly asks for more.

## Working style
- Prefer small, safe, high-value diffs.
- Avoid large refactors unless explicitly required.
- Do not change implementation just because a cleaner abstraction is possible.
- If information seems missing, read the related files before asking questions.

## Architecture rules
- Keep route handlers thin.
- Keep responsibility split across `service / schema / UI`.
- Do not move canonical source of truth to the client.
- Re-fetch owned server-side data when correctness matters.
- Do not break atomicity around review persistence and related save flows.

## Data and integrity rules
- `/api/evaluate` is audio-first.
- Canonical script data comes from the server-owned `scripts` row, not client request payloads.
- Stored review/progress data should keep reading from persisted take/review tables.
- Script identity is stable; content/locale/duration changes create immutable `script_revisions`. Title-only edits keep the revision and reference audio. Take title is snapped at claim; legacy NULL revision never means current.
- New script bodies and changed bodies have a server-checked maximum of 200 whitespace-separated words and 2,000 trimmed JavaScript characters. Keep over-limit drafts intact; existing long bodies remain readable and title-only editable.
- Normal script deletion is archive; retain history/audio and restore through the owner-locked active-10 RPC. Practice writes require expected revision + epoch; edits require expected revision + lock version.
- `script_audios` and `recordings` must stay ownership-checked.
- Display metadata is bounded, owner/session-scoped, process-memory-only: one Scripts snapshot, one shared Home/Progress/My Takes snapshot, and up to five Reviews. Five minutes is a revalidation age, never a deletion timer. Fresh revisits, short background, and normal token refresh preserve data; meaningful entry/resume/manual/mutation/recovery events refresh only related data. Temporary failures retain safe successful display; logout/owner change and detected resource loss remove it. Mutation responses patch exact fields; stale reads are fenced. Cached Review metadata carries no audio authorization.
- Saved Take audio reuse is memory-only, one item, 30 seconds from download. Every Review re-entry requires fresh server ownership and Storage object-version validation; auth/lifecycle/error invalidation is mandatory. Share always fetches fresh audio. Only the validated, rendered Review may foreground-prefetch its one saved Take through that same entry; Play shares the in-flight request. Exit cancels pending fetch; failure never retries automatically.

## Product defaults
- Default locale is `en-US`.
- Warn when a script is too long for the target duration.
- Prompt re-recording when audio is too short.
- Reuse generated script audio when the cache key matches.

## Verification
- After meaningful changes, run `npm run lint`.
- Run `npm run build` when UI/routes/types may be affected.
- Run `npm run typecheck` as needed; if Next.js generated types look stale, run it after `npm run build`.
- If you did not run a check, say so explicitly.

## Documentation
- Keep this file and `docs/current-state.md` short and practical.
- Update them when the main flow, safety assumptions, or current priorities change.
