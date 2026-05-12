# Gate1h Web Beta Deploy / Rollback / Smoke Runbook

Gate1h defines the production-like deploy operations for Web beta / small cohort. It does not deploy, does not change production env, and does not resolve Human Check Backlog items.

## Scope

- Web core deploy readiness for the Next.js app.
- Provider roles:
  - ElevenLabs: voice clone / model audio generation.
  - OpenAI: transcription / Script Studio generation / coaching-adjacent generation.
  - Azure: pronunciation evaluator.
  - Supabase Storage: `recordings`, `script-audios`, `voice-samples`, `voice-consents`.
- Launch mode: `private_beta` or `small_cohort`.

Out of scope: Capacitor, store metadata, destructive account deletion, DB/RLS/bucket changes, dashboard operations, provider contract changes, and formal legal review.

## Pre-Deploy Checklist

### 1. Human gate status

- Review `docs/human-check-backlog.md`.
- Keep unresolved items as `WARN` or `BLOCKED`; do not silently convert them to PASS.
- For Web beta, a human release owner must explicitly accept any remaining BLOCKED item or defer deploy.
- Gate1g currently has a deferred BLOCKED item for Azure Speech resource / region / quota / usage visibility.

### 2. Environment guard

Before deploy, verify production-like env has:

- `NATIVE_MINUTE_LAUNCH_MODE=private_beta` or `small_cohort`.
- `VOICE_PROVIDER=elevenlabs`.
- `TRANSCRIPTION_PROVIDER=openai`.
- `PRONUNCIATION_PROVIDER=azure`.
- `SCRIPT_GENERATION_PROVIDER=openai` if real AI draft is enabled.
- Required Supabase, OpenAI, Azure, and ElevenLabs env are set.
- `E2E_TEST_SECRET`, `E2E_TEST_EMAIL`, and `E2E_TEST_PASSWORD` are not set.
- `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE` is off unless an intentional support/admin cleanup run is separately approved.

Run:

```bash
npm run production:preflight
```

Do not paste env values or secrets into docs.

### 3. Supabase / Storage / RLS

Run:

```bash
npm run supabase:storage-rls:check
```

Expected:

- migrations `0001` through `0012` are present locally.
- required tables are reachable.
- required buckets exist and are private.
- checker output hides service role key, object keys, raw storage paths, and signed URLs.

Manual proof:

- Gate1b protected replay / cross-user ownership proof is already PASS.
- After deploy, repeat a lightweight protected replay regression through app routes only.

### 4. Provider preflight

Run:

```bash
npm run voice:preflight
npm run pronunciation:preflight
```

Expected:

- Voice provider is ElevenLabs.
- Transcription provider is OpenAI.
- Pronunciation provider is Azure.
- The scripts report set/missing only; no secret values are printed.

### 5. Kill switch readiness

Confirm the operator knows how to set:

- `NATIVE_MINUTE_DISABLE_OPENAI=1`
- `NATIVE_MINUTE_DISABLE_AZURE=1`
- `NATIVE_MINUTE_DISABLE_ELEVENLABS=1`
- `NATIVE_MINUTE_DISABLE_STORAGE_UPLOADS=1`

These should pause the relevant paid surface without deleting existing data.

## Deploy Procedure

### Before deploy

1. Confirm a rollback target is known.
2. Confirm no destructive account deletion env is armed.
3. Run local checks:

```bash
npm run lint
npm run build
npm run typecheck
npm run production:preflight
npm run supabase:storage-rls:check
```

4. Record safe deploy metadata only:
   - checked time
   - reviewer
   - commit or build ref
   - launch mode
   - PASS/WARN/BLOCKED status

Do not record raw env values, account ids, project ids, signed URLs, provider response bodies, or billing amounts.

### During deploy

1. Deploy the known build through the hosting provider.
2. Do not change env and code in the same step unless the change is explicitly part of the deployment plan.
3. Watch app health, auth callback, and provider error rates.
4. If paid provider cost spikes, use the relevant kill switch before rolling back unless the app itself is broken.

### After deploy

Run the post-deploy smoke checklist below. If a smoke item fails, classify it before broad rollback.

## Post-Deploy Smoke Checklist

Use a clean small-cohort account when possible. Do not paste raw ids or audio URLs into docs.

| Area | Smoke | PASS condition |
| --- | --- | --- |
| Auth | `/login?next=%2Fscripts` -> magic link -> `/scripts` | Login callback reaches `/scripts`; refresh preserves session. |
| Logout | Settings logout -> `/login?next=%2Fscripts` | Session ends and re-login can start. |
| Home / Practice | `/` and `/scripts` | Practice-first pages render with CSS and navigation. |
| Script Studio | Create or use a simple script | Save reaches `/scripts/[id]/listen?created=1`. |
| Voice setup | `/setup/voice` | Page loads; if needed, consent/sample flow gives safe guidance. |
| Listen | Generate or reuse model audio | `/api/speak-script` succeeds or safe recovery appears; replay route works for owner. |
| Record | 30-60 sec clear English recording | Upload succeeds or clear storage/format recovery appears. |
| Evaluate | OpenAI transcription + Azure pronunciation | Review is created; transcript is non-empty; score grid and weak words appear. |
| Review | `/scripts/[id]/review/[takeId]` | Summary-first review loads; details are available. |
| Progress | `/progress` | Latest result and review link appear. |
| Protected replay | own replay and cross-user denial | Own audio plays; other user receives 403/404-equivalent. |
| Legal/support | `/privacy`, `/terms`, `/support`, `/support/account-deletion` | Draft pages load and state beta draft status. |

## Rollback Criteria

Rollback or pause when any of these occur:

- Auth callback repeatedly fails for normal users.
- CSS/static assets fail and core pages render as broken HTML.
- `/api/evaluate` persists partial review/progress on provider failure.
- Protected replay leaks cross-user audio.
- Storage upload/replay uses raw signed URLs in UI.
- Production provider guard allows mock provider in strict production.
- Provider cost spike cannot be contained by kill switch.
- A destructive account deletion path runs unintentionally.

Prefer kill switch first when the issue is isolated to a paid provider surface:

- OpenAI failure/cost spike: set `NATIVE_MINUTE_DISABLE_OPENAI=1`.
- Azure evaluator failure/cost spike: set `NATIVE_MINUTE_DISABLE_AZURE=1`.
- ElevenLabs clone/TTS failure/cost spike: set `NATIVE_MINUTE_DISABLE_ELEVENLABS=1`.
- Upload abuse/storage spike: set `NATIVE_MINUTE_DISABLE_STORAGE_UPLOADS=1`.

Rollback the deployment when the issue is auth, routing, ownership, persistence, or global rendering.

## Rollback Procedure

1. Freeze new smoke activity.
2. Capture safe notes:
   - failing route
   - phase
   - user-facing error text
   - timestamp
   - deploy/build ref
3. Do not paste secrets, raw provider responses, signed URLs, raw storage paths, raw user ids, or raw audio.
4. If provider-specific, set the relevant kill switch and redeploy/restart.
5. If app-wide, roll back to the previous known-good deployment.
6. Re-run minimal smoke:
   - login
   - `/scripts`
   - own protected replay if relevant
   - record/evaluate only if provider surface is enabled
7. Record PASS/WARN/BLOCKED/FAIL in the deploy log or release notes.

## Failure Triage Table

| Failure | First place to look | Likely action |
| --- | --- | --- |
| Auth callback failure | `/auth/callback`, `/login`, Supabase Auth redirect allowlist | Check callback URL, cookies, next path, magic link rate limit; rollback if route/static issue. |
| Provider failure: OpenAI | `/api/evaluate`, `/api/script-studio/generate`, OpenAI env/preflight | Use `NATIVE_MINUTE_DISABLE_OPENAI=1` if cost/error spike; keep raw provider detail out of UI/docs. |
| Provider failure: Azure | pronunciation preflight, `/api/evaluate`, Azure resource visibility | Use `NATIVE_MINUTE_DISABLE_AZURE=1`; confirm failure is not upload/transcription. |
| Provider failure: ElevenLabs | `/setup/voice`, `/api/create-voice`, `/api/speak-script` | Use `NATIVE_MINUTE_DISABLE_ELEVENLABS=1`; existing cached/replayed audio may still work. |
| Storage upload failure | upload routes, buckets, size/MIME validation | Use `NATIVE_MINUTE_DISABLE_STORAGE_UPLOADS=1` if abuse/spike; otherwise check bucket/private policy. |
| Evaluation save failure | review persistence RPC and route logs | Stop smoke; do not accept partial review/progress. |
| Protected replay failure | `/api/script-audio/[audioId]`, `/api/takes/[takeId]/audio` | Check ownership, bucket private status, object existence; never expose signed URL. |
| Quota / cost concern | Gate1g proof, provider dashboards, kill switches | Pause affected surface; do not broaden launch cohort. |

## Relationship to Human Check Backlog

This runbook lets engineering proceed with deploy-readiness documentation, but Web beta cannot be considered ready until `docs/human-check-backlog.md` is resolved or explicitly accepted by the human release owner.

Do not use this runbook to mark dashboard, billing, legal, support, or SLA items as PASS.
