# Gate 4j Provider Kill Switch Readiness

Status: `implemented_non_destructive`

Gate 4j inventories and hardens provider kill switch readiness for the v1 provider set. It is scoped to OpenAI transcription / Script Studio generation, Azure pronunciation evaluation, ElevenLabs normal voice setup / model audio, and Supabase Storage uploads.

This gate does not change Vercel env, operate dashboards, call provider APIs, execute account deletion, delete Supabase Auth users, remove Storage objects, perform DB destructive cleanup, execute provider cleanup, add DB schema, break API contracts, implement Brush-up, introduce Capacitor, or start Store submission.

Brush-up remains v1.1 deferred. Gate 4j only covers the normal v1 provider surfaces.

## Existing Implementation Inventory

| Surface | Repo implementation | Kill switch behavior |
| --- | --- | --- |
| OpenAI transcription | `services/transcription/factory.ts` checks `getCostGuardIssue("openai")` before creating the OpenAI transcriber. | `NATIVE_MINUTE_DISABLE_OPENAI=1` blocks provider construction before OpenAI transcription API calls. |
| OpenAI Script Studio generation | `services/script-studio/script-generation.service.ts` checks `getCostGuardIssue("openai")` before creating the OpenAI script generation provider. | `NATIVE_MINUTE_DISABLE_OPENAI=1` records a skipped quota event and blocks OpenAI Responses API calls. |
| Azure pronunciation evaluation | `services/pronunciation/factory.ts` checks `getCostGuardIssue("azure")` before creating the Azure evaluator. | `NATIVE_MINUTE_DISABLE_AZURE=1` blocks evaluator construction before Azure SDK calls. |
| ElevenLabs voice provider | `providers/voice/factory.ts` checks `getCostGuardIssue("elevenlabs")` before creating OpenAI / ElevenLabs voice providers. | `NATIVE_MINUTE_DISABLE_ELEVENLABS=1` blocks ElevenLabs clone / TTS provider usage before provider calls. |
| Storage upload routes | `app/api/uploads/recording`, `app/api/uploads/voice-sample`, and `app/api/uploads/voice-consent` call `assertCostGuardEnabled("storage_uploads")` before reading upload form data into Storage services. | `NATIVE_MINUTE_DISABLE_STORAGE_UPLOADS=1` and the new alias `NATIVE_MINUTE_DISABLE_STORAGE_UPLOAD=1` block new uploads. |
| Account deletion cleanup guards | `services/account-deletion/account-deletion.service.ts` checks ElevenLabs and Storage upload guard state as safe guard metadata. | Upload kill switch does not replace the destructive account deletion guard and does not itself run cleanup. |
| Production preflight | `scripts/production-readiness-preflight.mjs` prints kill switch state without values. | Preflight now reports both Storage upload env names as one surface. |

## v1 Kill Switches

| v1 surface | Env name | Alias | Code readiness | Human / env readiness |
| --- | --- | --- | --- | --- |
| OpenAI transcription / Script Studio | `NATIVE_MINUTE_DISABLE_OPENAI` | none | `ready` | Vercel env presence / operation proof still human-required. |
| Azure pronunciation | `NATIVE_MINUTE_DISABLE_AZURE` | none | `ready` | Vercel env presence / operation proof still human-required. |
| ElevenLabs normal voice | `NATIVE_MINUTE_DISABLE_ELEVENLABS` | none | `ready` | Vercel env presence / operation proof still human-required. |
| Supabase Storage uploads | `NATIVE_MINUTE_DISABLE_STORAGE_UPLOADS` | `NATIVE_MINUTE_DISABLE_STORAGE_UPLOAD` | `ready_with_alias` | Vercel env presence / operation proof still human-required. |

The plural Storage upload env remains canonical because it already exists in docs, `.env.example`, preflight, and prior proof packages. The singular name is accepted as an alternate alias for Gate 4j wording and operator convenience.

## Updated Guard

Gate 4j updates `lib/cost-guard.ts` so each cost guard area can have one or more env names. Storage uploads now accept either:

- `NATIVE_MINUTE_DISABLE_STORAGE_UPLOADS=1`
- `NATIVE_MINUTE_DISABLE_STORAGE_UPLOAD=1`

When either value is truthy (`1`, `true`, `yes`, or `on`), `getCostGuardIssue("storage_uploads")` returns a safe user-facing pause message and the triggered env name for operator diagnostics. No provider API call or Storage upload is performed by this change.

Production preflight now reports the Storage upload kill switch as `NATIVE_MINUTE_DISABLE_STORAGE_UPLOADS / NATIVE_MINUTE_DISABLE_STORAGE_UPLOAD` and prints only safe status, never env values.

## Disabled User-Facing Behavior

| Surface | Disabled behavior |
| --- | --- |
| OpenAI disabled | Transcription and Script Studio generation fail before provider creation with a short safe pause message. No OpenAI API call is made. |
| Azure disabled | Pronunciation evaluator creation fails before Azure SDK evaluation with a short safe pause message. No Azure evaluation call is made. |
| ElevenLabs disabled | Voice clone and normal model audio provider creation fails before ElevenLabs provider calls. Existing cached / saved app-owned replay may still be readable where the UI already supports it. |
| Storage upload disabled | Recording upload, voice sample upload, and consent recording upload return a short safe pause message before app-owned Storage upload. Protected replay and account deletion cleanup are separate surfaces and are not enabled by this switch. |

The safe message does not include secrets, raw provider responses, private paths, transcript bodies, raw audio, provider voice identifiers, or env values.

## Release QA Smoke

Run these in a controlled local or production-like environment without recording secrets or private data:

1. Set `NATIVE_MINUTE_DISABLE_OPENAI=1`; verify OpenAI transcription / Script Studio provider calls are not made and UI shows safe recovery copy.
2. Set `NATIVE_MINUTE_DISABLE_AZURE=1`; verify pronunciation evaluation is blocked safely before Azure calls.
3. Set `NATIVE_MINUTE_DISABLE_ELEVENLABS=1`; verify new voice creation / new model audio generation is blocked safely before ElevenLabs calls, while previously saved app-owned replay remains a separate readable path where available.
4. Set `NATIVE_MINUTE_DISABLE_STORAGE_UPLOADS=1`; verify recording, voice sample, and consent recording uploads are blocked before Storage upload.
5. Set `NATIVE_MINUTE_DISABLE_STORAGE_UPLOAD=1`; verify the alias blocks the same upload routes.
6. Unset the kill switch; verify normal provider path still reaches the existing provider readiness / env checks.
7. Confirm no UI, logs, docs, or evidence record secrets, raw provider responses, transcript bodies, raw audio, private audio paths, Storage object keys, signed URLs, provider voice identifiers, or env values.

Do not run these drills against production if toggling would disrupt real users; use production-like staging unless the release owner approves a production safe drill.

## Human Required

- Vercel env presence-only confirmation for all four v1 kill switches.
- Safe operation proof for OpenAI, Azure, ElevenLabs, and Storage uploads.
- Release-owner acceptance of any remaining `WARN` before Store submission.
- Confirmation that production logs during the drill do not expose forbidden data.

## Non-Destructive Boundary

Gate 4j did not:

- change Vercel env;
- operate provider dashboards;
- call provider APIs;
- execute account deletion;
- delete Supabase Auth users;
- remove Storage objects;
- delete, update, or anonymize DB rows;
- call provider cleanup;
- change DB schema or migrations;
- add destructive API routes;
- implement Brush-up;
- introduce Capacitor or Store submission work.

## Handoff

Next safe work is a human/operator kill switch smoke using the checklist above, or Gate 4h re-run after a disposable account is prepared. Actual deletion and provider cleanup remain later destructive gates with explicit approval.
