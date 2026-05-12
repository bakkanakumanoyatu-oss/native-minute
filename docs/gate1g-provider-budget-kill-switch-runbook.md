# Gate1g Provider Budget / Kill Switch Runbook

Gate1g fixes the Web beta operations checklist for paid provider cost monitoring and emergency kill switches. It does not run bulk provider calls, does not record secrets, and does not change provider contracts.

## Scope

- OpenAI: transcription and Script Studio generation.
- Azure Speech: pronunciation evaluator.
- ElevenLabs: voice clone and model audio generation.
- Supabase Storage: `recordings`, `script-audios`, `voice-samples`, `voice-consents`.

Do not paste raw API keys, auth headers, raw provider responses, signed URLs, raw user ids, raw storage paths, account ids, invoices, or detailed billing amounts into docs or support tickets.

## Existing App Guards

- `npm run production:preflight` blocks strict production when provider choices are not:
  - `VOICE_PROVIDER=elevenlabs`
  - `TRANSCRIPTION_PROVIDER=openai`
  - `PRONUNCIATION_PROVIDER=azure`
  - `SCRIPT_GENERATION_PROVIDER=openai`
- `NATIVE_MINUTE_LAUNCH_MODE=public_free` is blocked before DB-backed quota enforcement exists.
- E2E/test helper env is blocked in strict production.
- Runtime cost kill switches:
  - `NATIVE_MINUTE_DISABLE_OPENAI=1`
  - `NATIVE_MINUTE_DISABLE_AZURE=1`
  - `NATIVE_MINUTE_DISABLE_ELEVENLABS=1`
  - `NATIVE_MINUTE_DISABLE_STORAGE_UPLOADS=1`
- Kill switches return short safe user-facing errors and do not delete existing data.

## Provider Dashboard Proof

Use `docs/gate1g-provider-budget-kill-switch-proof-template.md` to record dashboard checks. Record only PASS/WARN/BLOCKED/FAIL, checked time, reviewer, masked account reference, and notes without raw billing details.

### OpenAI

Confirm:

- Usage or budget monitoring is enabled for the project/org used by Web beta.
- Alert recipient / channel is configured and owned.
- Expected paid surfaces are understood: transcription and Script Studio generation.
- API key is server-side only and not visible in client bundles or screenshots.
- `NATIVE_MINUTE_DISABLE_OPENAI=1` is documented as the emergency pause for OpenAI transcription / generation.
- App behavior when disabled is a safe Japanese recovery message, not raw OpenAI detail.

### Azure Speech

Confirm:

- Azure Speech resource, region, quota / budget alert, and owner are known.
- Alert recipient / channel is configured and owned.
- Expected paid surface is pronunciation assessment after upload/transcription.
- `NATIVE_MINUTE_DISABLE_AZURE=1` is documented as the emergency pause for Azure pronunciation evaluation.
- App behavior when disabled is a safe recovery message and does not confuse upload failure with Azure failure.

### ElevenLabs

Confirm:

- ElevenLabs usage / quota / plan limit is visible to the operator.
- Alert or manual daily check owner is assigned for Web beta.
- Expected paid surfaces are voice clone and TTS/model audio generation.
- Existing `script_audios` cache behavior is used to reduce repeated TTS calls.
- `NATIVE_MINUTE_DISABLE_ELEVENLABS=1` is documented as the emergency pause for ElevenLabs clone / model audio generation.
- App behavior when disabled does not expose provider voice ids or raw provider responses.

### Supabase Storage

Confirm:

- Supabase project usage / budget monitoring is visible to the operator.
- Storage growth and egress are monitored for `recordings`, `script-audios`, `voice-samples`, and `voice-consents`.
- Gate1b protected replay / cross-user ownership proof remains PASS.
- `NATIVE_MINUTE_DISABLE_STORAGE_UPLOADS=1` is documented as the emergency pause for user uploads.
- Protected replay can continue for existing authorized objects when uploads are disabled.

## Kill Switch Drill

For Web beta proof, use a production-like staging deploy when possible. Do not use real user data for drill evidence.

1. Pick one surface and set the corresponding `NATIVE_MINUTE_DISABLE_*` env to `1`.
2. Redeploy or restart the runtime.
3. Confirm the affected operation stops with a safe Japanese message.
4. Confirm unrelated history/replay pages still load where expected.
5. Reset the env to off.
6. Record only PASS/WARN/BLOCKED/FAIL and safe notes in the proof template.

Do not run real ElevenLabs delete, account deletion cleanup, bulk generation, bulk transcription, or destructive Storage operations during this drill.

## PASS / WARN / BLOCKED / FAIL

- PASS: dashboard monitoring exists, owner is assigned, kill switch behavior is understood, and no secret/raw details are recorded.
- WARN: dashboard monitoring exists but alert thresholds, owner, or drill evidence is incomplete.
- BLOCKED: dashboard access, provider account ownership, or support escalation owner is missing.
- FAIL: secrets/raw provider details are exposed, kill switch cannot be operated, or provider cost surface is unknown.

## Web Beta Blocker

Before Web beta, a human must complete the provider dashboard proof template for OpenAI, Azure, ElevenLabs, and Supabase Storage. DB-backed quota enforcement can wait while launch mode remains `private_beta` or `small_cohort`.
