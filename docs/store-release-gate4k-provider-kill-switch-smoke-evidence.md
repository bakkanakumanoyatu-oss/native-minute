# Gate 4k Provider Kill Switch Smoke Evidence

Status: `PASS_local_non_provider_call`

Gate 4k records local, non-provider-call smoke evidence for the v1 provider kill switches defined in Gate 4j.

This evidence uses `npm run production:preflight` with local dummy env and strict production guard. It does not operate Vercel env, provider dashboards, provider APIs, account deletion, Supabase Auth deletion, Storage deletion, DB destructive cleanup, provider cleanup, DB schema changes, API contract changes, Brush-up, Capacitor, or Store submission.

Provider API calls executed: `false`.

## Smoke Scope

| Surface | Env name | Smoke status |
| --- | --- | --- |
| OpenAI transcription / Script Studio generation | `NATIVE_MINUTE_DISABLE_OPENAI` | `pass` |
| Azure pronunciation evaluation | `NATIVE_MINUTE_DISABLE_AZURE` | `pass` |
| ElevenLabs normal voice setup / model audio | `NATIVE_MINUTE_DISABLE_ELEVENLABS` | `pass` |
| Supabase Storage uploads | `NATIVE_MINUTE_DISABLE_STORAGE_UPLOADS` | `pass` |
| Supabase Storage uploads alias | `NATIVE_MINUTE_DISABLE_STORAGE_UPLOAD` | `pass` |
| Baseline unset | all kill switches unset | `pass` |
| Baseline false | all kill switches false | `pass` |

## Evidence Summary

The local preflight smoke confirmed:

- strict production guard can run with dummy env and safe output;
- preflight output hides secret values;
- unset kill switches are reported as `off`;
- explicit false kill switches are reported as `off`;
- `NATIVE_MINUTE_DISABLE_OPENAI=1` is detected as OpenAI disabled;
- `NATIVE_MINUTE_DISABLE_AZURE=1` is detected as Azure disabled;
- `NATIVE_MINUTE_DISABLE_ELEVENLABS=1` is detected as ElevenLabs disabled;
- `NATIVE_MINUTE_DISABLE_STORAGE_UPLOADS=1` is detected as Storage uploads disabled;
- `NATIVE_MINUTE_DISABLE_STORAGE_UPLOAD=1` is detected as the same Storage upload surface disabled;
- all preflight runs exited successfully;
- no provider API calls were made by the preflight smoke;
- no dashboard or production env was changed.

## Provider-Specific Results

### OpenAI

- Env enabled detection: `pass`
- Provider call before stop: `not_executed`
- Expected stop point: `services/transcription/factory.ts` and `services/script-studio/script-generation.service.ts` before OpenAI provider creation
- User-facing message: safe pause copy from `lib/cost-guard.ts`
- Raw data exposure: `pass`
- Baseline unset / false path: `pass`

### Azure

- Env enabled detection: `pass`
- Provider call before stop: `not_executed`
- Expected stop point: `services/pronunciation/factory.ts` before Azure evaluator creation
- User-facing message: safe pause copy from `lib/cost-guard.ts`
- Raw data exposure: `pass`
- Baseline unset / false path: `pass`

### ElevenLabs

- Env enabled detection: `pass`
- Provider call before stop: `not_executed`
- Expected stop point: `providers/voice/factory.ts` before ElevenLabs provider creation
- User-facing message: safe pause copy from `lib/cost-guard.ts`
- Raw data exposure: `pass`
- Baseline unset / false path: `pass`

### Supabase Storage Uploads

- Canonical env enabled detection: `pass`
- Alias env enabled detection: `pass`
- Provider / Storage upload call before stop: `not_executed`
- Expected stop point: upload routes call `assertCostGuardEnabled("storage_uploads")` before upload services
- User-facing message: safe pause copy from `lib/cost-guard.ts`
- Raw data exposure: `pass`
- Baseline unset / false path: `pass`

## Safe Output Boundary

The smoke evidence records only:

- provider / surface name;
- env name;
- smoke status;
- stop point category;
- safe notes;
- boolean flags for provider calls, dashboard changes, production env changes, and destructive operations.

It does not record:

- secret values;
- env values;
- provider raw responses;
- transcript bodies;
- script bodies;
- raw audio;
- private audio paths;
- Storage object keys or paths;
- signed URLs;
- provider voice identifiers;
- email addresses;
- auth user ids.

## Non-Destructive Boundary

Gate 4k did not:

- call OpenAI, Azure, ElevenLabs, Supabase Storage upload services, or provider cleanup;
- change Vercel env;
- operate provider dashboards;
- target real users or disposable accounts;
- create or confirm account deletion requests;
- execute actual deletion;
- delete Supabase Auth users;
- remove Storage objects;
- delete, update, or anonymize DB rows;
- change DB schema or migrations;
- break API contracts;
- implement Brush-up;
- introduce Capacitor or Store submission work.

## Remaining Human Required

- Vercel env presence-only confirmation for all kill switches.
- Human/operator operation proof in production-like or approved production-safe environment.
- Confirmation that production logs remain redacted during any real drill.
- Gate 4h disposable account preparation and dry-run proof re-run.

## Handoff

Next safe work is either human/operator kill switch operation proof using this evidence as the local baseline, or Gate 4h re-run after a disposable account is prepared. Actual deletion and provider cleanup remain later destructive gates with explicit approval.
