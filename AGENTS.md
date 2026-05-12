# AGENTS.md

## First read
- Read this file first.
- Then read `docs/current-state.md`.
- Use `README.md` as setup/reference, not as the freshest implementation log.

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
- Be careful with history semantics: `takes` do not snapshot full script content, so in-place script editing can break old review/progress meaning.
- `script_audios` and `recordings` must stay ownership-checked.

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
