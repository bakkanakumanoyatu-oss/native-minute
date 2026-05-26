# Gate 3 Provider Readiness / Cost Guard Plan

Gate 3 reviews OpenAI, Azure Speech, ElevenLabs, provider cleanup, cost guard, kill switches, monitoring, and Store-facing support readiness before Native Minute moves to Brush-up v1 implementation or native packaging.

This is docs/design/checklist-only. It does not call provider APIs, change production env, alter provider code, add DB schema, change API contracts, implement Brush-up, change UI, add Capacitor, or introduce worker / queue / VPS infrastructure.

## Gate 3 Decision

- Gate 1 production smoke is `PASS`.
- Gate 1.5 voice / Brush-up architecture review is complete.
- Gate 2 privacy / consent / deletion planning is complete.
- Gate 3 provider plan is **ready as a checklist**, but the Store-facing provider readiness decision remains `WARN` until human dashboard / billing / quota / entitlement / kill-switch operation proof is refreshed for the target production deployment.
- Brush-up v1 must not start until ElevenLabs clone/create/delete/cleanup readiness, Brush-up cost surfaces, and provider retention/deletion behavior are confirmed enough for Gate 3.5 proof.

## Repo-Confirmed Provider Roles

| Provider | v1 role | Repo-confirmed status |
| --- | --- | --- |
| OpenAI | Transcription, Script Studio generation, possible coaching-adjacent generation | `TRANSCRIPTION_PROVIDER=openai` and `SCRIPT_GENERATION_PROVIDER=openai` are production policy values. Transcription and Script Studio live smoke are documented. Raw OpenAI provider responses are not returned to the client. |
| Azure Speech | Pronunciation evaluator | `PRONUNCIATION_PROVIDER=azure` is the production policy value. Azure live smoke and OpenAI transcription + Azure combined review/progress smoke are documented. PCM WAV assumptions and safe failure copy exist. |
| ElevenLabs | Voice clone and model audio generation | `VOICE_PROVIDER=elevenlabs` is the production policy value. Clone voice -> TTS -> app-owned replay -> cache hit / Audio Library metadata is documented as passed. Failure branch and cleanup policy are documented. |
| Supabase | Auth, DB, private Storage, protected replay | Required for recordings, script-audios, voice-samples, voice-consents, review persistence, and account deletion dry-run/proof. |

## OpenAI Readiness

Repo-confirmed:

- OpenAI transcription is selected with `TRANSCRIPTION_PROVIDER=openai`.
- OpenAI Script Studio generation is selected with `SCRIPT_GENERATION_PROVIDER=openai`.
- `OPENAI_API_KEY` is required by production preflight.
- Optional model envs exist for transcription and Script Studio generation.
- Strict production guard blocks mock transcription and mock Script Studio provider.
- `NATIVE_MINUTE_DISABLE_OPENAI=1` pauses OpenAI transcription and Script Studio generation.
- OpenAI transcription reads app-owned recording bytes server-side through the evaluate service.
- `/api/evaluate` remains audio-first and re-fetches the owned script server-side.
- Provider failures do not persist partial review/progress.
- Empty transcript / too-short recording recovery is documented and does not expose raw provider detail.
- Script Studio OpenAI adapter returns structured candidates into the app pipeline; model-supplied metrics are ignored and app-side quality checks recompute from the English script.
- Quota metadata records safe counts/lengths and does not intentionally store raw seed, generated full text, raw provider response, secret, or raw audio.

Human confirmation required:

- OpenAI project / organization used by production.
- Billing status, usage limit, alert threshold, and alert recipient / owner.
- Model availability for transcription and Script Studio generation in the production project.
- Production env presence only: `OPENAI_API_KEY`, `OPENAI_TRANSCRIPTION_MODEL` if overridden, and `OPENAI_SCRIPT_GENERATION_MODEL` if overridden. Do not reveal values.
- Kill switch operation proof for `NATIVE_MINUTE_DISABLE_OPENAI=1` on production-like or production deployment.
- Provider outage / degraded OpenAI behavior support escalation path.
- Whether OpenAI coaching-adjacent generation remains mock/helper-derived for v1 or becomes a separately declared paid provider surface.

Readiness result:

- Web beta: `PASS/WARN` based on existing smoke and accepted small-cohort warning posture.
- Store v1: `WARN` until dashboard/alert proof and kill-switch drill are refreshed for the exact release deployment.
- Brush-up v1: OpenAI is not the mainline voice provider; OpenAI custom voice remains entitlement-sensitive and should not block ElevenLabs-first Brush-up unless explicitly selected.

## Azure Speech Readiness

Repo-confirmed:

- Azure pronunciation is selected with `PRONUNCIATION_PROVIDER=azure`.
- `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` are required by production preflight.
- `NATIVE_MINUTE_DISABLE_AZURE=1` pauses Azure pronunciation assessment.
- Azure evaluator expects PCM WAV; browser recordings are normalized client-side when decode succeeds.
- Azure live smoke and OpenAI transcription + Azure combined review/progress smoke are documented.
- Azure provider errors are separated from OpenAI transcription, upload/storage, and review persistence failures.
- Azure raw detail is not user-facing; logs are expected to stay at safe status/request/session summary level.
- Persisted score fields are not recalibrated in Gate 3. Display calibration remains a separate product/UI concern.

Human confirmation required:

- Azure Speech resource, region, subscription/billing status, quota, and usage visibility.
- Pronunciation Assessment availability for the target region/resource.
- Budget/cost alert status and alert recipient / owner.
- Production env presence only: `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION`. Do not reveal values.
- Kill switch operation proof for `NATIVE_MINUTE_DISABLE_AZURE=1`.
- Mobile Safari / Android Chrome / future WebView recording format and PCM normalization smoke.
- Azure auth/rate/quota/timeout failure branch smoke in a production-like environment without raw Azure detail.

Readiness result:

- Web beta: `PASS/WARN` based on existing human live smoke and accepted small-cohort warning posture.
- Store v1: `WARN` until dashboard/alert proof, mobile/WebView audio path, and kill-switch drill are refreshed.
- Brush-up v1: Azure does not create voice material, but Brush-up loops must continue to preserve evaluate/review/progress behavior after generated Brush-up audio is used for practice.

## ElevenLabs / Brush-up Readiness

Repo-confirmed:

- ElevenLabs is the v1 mainline voice provider with `VOICE_PROVIDER=elevenlabs`.
- `ELEVENLABS_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `ELEVENLABS_TTS_MODEL_ID` are covered by preflight expectations.
- `NATIVE_MINUTE_DISABLE_ELEVENLABS=1` pauses ElevenLabs clone / model audio provider usage.
- Voice sample audio is uploaded to app-owned `voice-samples` first; the client does not send sample audio directly to ElevenLabs.
- Current ElevenLabs consent is app-owned consent only; provider-side consent endpoint is not used in the current flow.
- ElevenLabs clone voice -> script TTS -> app-owned `script-audios` replay -> protected replay is documented as passed.
- Generated provider bytes are normalized into app-owned Storage/replay. Provider direct URLs are not the playback authority.
- `script_audios` cache reuse reduces repeated TTS calls; cache hit quota events are non-billable.
- Style presets use cache identity and provider mapping; `playbackRate` is not part of provider input or cache identity.
- ElevenLabs failure branch documentation covers sample reject, verification required, rate limit, billing/quota, deleted voice, synthesize failure, storage staging failure, and protected replay failure.
- Account deletion has a guarded ElevenLabs provider cleanup service boundary using `DELETE /v1/voices/:voice_id`, but normal checks do not call real delete and public cleanup UI/API is not exposed.

Human confirmation required:

- ElevenLabs plan, credits, voice cloning availability, and TTS API availability for the production account.
- Usage / quota / request analytics / billing visibility and alert or manual monitoring owner.
- Voice clone availability and any verification requirements for the target plan.
- Provider-side deletion semantics for normal cloned voices and future script-scoped Brush-up voice variants.
- Whether provider-side source audio / cloned voice material is retained and how deletion or revoke requests should be handled.
- Production env presence only: `ELEVENLABS_API_KEY`, `ELEVENLABS_TTS_MODEL_ID`, and `SUPABASE_SERVICE_ROLE_KEY`. Do not reveal values.
- Kill switch operation proof for `NATIVE_MINUTE_DISABLE_ELEVENLABS=1`.
- Targeted live failure smoke for rate limit / billing / deleted voice only if it can be done without exposing secrets or causing unintended account damage.

Brush-up v1 readiness blockers:

- Confirm ElevenLabs can create or select a script-scoped voice/material artifact from a selected best take under the intended plan.
- Confirm provider latency and async behavior fit Vercel Function execution for one short script-scoped candidate.
- Confirm provider deletion/cleanup can remove script-scoped Brush-up voice variants and any copied/source material.
- Confirm cost impact for clone/create voice + generated model audio per Brush-up action.
- Confirm failure behavior for sample reject, verification required, provider timeout, and storage staging before implementing Gate 3.5.
- Decide whether Brush-up generated audio is deleted or hidden on revoke; Gate 2 recommends delete/hide conservatively.

Readiness result:

- Web beta normal voice: `PASS/WARN` based on existing happy-path and cache evidence.
- Store v1 normal voice: `WARN` until cleanup proof, kill-switch drill, monitoring proof, and Store disclosure are refreshed.
- Brush-up v1: `BLOCKED` for implementation until the Brush-up-specific provider create/delete/retention/cost questions above are closed or explicitly accepted by the release owner.

## Cost Guard / Quota / Kill Switch

Existing repo guards:

- `npm run production:preflight` blocks strict production unless providers are `elevenlabs`, `openai`, `azure`, and `openai` for voice/transcription/pronunciation/script generation.
- `public_free` launch mode is blocked before DB-backed quota enforcement exists.
- E2E/test helper envs are blocked in strict production.
- Runtime kill switches exist for OpenAI, Azure, ElevenLabs, and Storage uploads.
- Upload routes check `NATIVE_MINUTE_DISABLE_STORAGE_UPLOADS=1` before storing new recordings, voice samples, or consent recordings.
- `quota_events` records text generation and voice generation attempts non-blockingly, including cache hits for voice generation.
- Cache hit model audio replay does not call ElevenLabs again.

Known limits:

- No DB-backed per-user hard quota.
- No app-side global hard cap.
- No admin usage dashboard.
- No durable retry/backoff queue.
- No automated provider cleanup job.
- No automated provider budget alert inside the app.
- Existing quota events are operational evidence, not billing enforcement.

Required Gate 3 cost checklist:

| Surface | Required before Store-facing v1 |
| --- | --- |
| OpenAI transcription | Production project/billing/alerts confirmed; repeated evaluate abuse risk accepted or capped operationally. |
| OpenAI Script Studio | Generation usage monitored; repeated draft generation risk accepted or gated before public-free launch. |
| Azure pronunciation | Speech resource/quota/billing/region confirmed; timeout/rate failure support path documented. |
| ElevenLabs voice clone | Plan/credits/clone availability confirmed; repeated setup/Brush-up clone cost risk understood. |
| ElevenLabs model audio | Cache behavior confirmed; style/script/voice cache miss cost risk understood. |
| Supabase Storage | Storage growth/egress monitored; upload kill switch known; account deletion Storage cleanup remains a Store blocker. |

## Fallback / Retry / Timeout

Current fallback posture:

- Development can return to mock providers.
- Strict production should not fall back to mock silently.
- User-facing failures should identify the phase: upload/storage, OpenAI transcription, Azure pronunciation, ElevenLabs clone/TTS, review save, replay, or progress reflection.
- Existing saved review/progress and app-owned replay should remain readable where possible when a paid provider is disabled.

Retry posture:

- No durable background retry exists for provider calls.
- User retry is acceptable for short synchronous operations while the app is small-cohort.
- Provider failure after successful provider generation but before app-owned Storage staging should be treated as partial/failure in quota metadata and investigated before retrying broadly.

Timeout posture:

- One user action should correspond to one short provider operation where possible.
- Long provider latency, async provider jobs, or cleanup operations that exceed Vercel Function limits are worker/queue trigger conditions.

## Provider Cleanup / Retention / Deletion Checklist

OpenAI:

- Confirm whether transcription audio is retained by provider under the production account settings and policy.
- Confirm Script Studio generation data handling and retention/disclosure.
- If OpenAI custom voice ever becomes enabled, confirm provider-side consent, voice/material deletion, and entitlement before use.

Azure:

- Confirm pronunciation assessment data handling / retention for the selected Speech resource.
- Confirm support path for Azure region/resource/billing failures.

ElevenLabs:

- Confirm deletion endpoint semantics for normal cloned voices.
- Confirm deleted/missing voice behavior and safe recovery.
- Confirm script-scoped Brush-up voice/material cleanup semantics before Gate 3.5.
- Confirm whether generated TTS audio or source voice material is retained by provider and how account deletion / revoke should request cleanup.

Native Minute:

- Provider cleanup must use server-owned rows; client must not submit provider voice IDs, storage keys, or row IDs as cleanup authority.
- Proof must record only safe statuses, counts, reason codes, role/owner, and commit ref.
- Account deletion order remains provider -> Storage -> DB -> Auth -> completion.

## Repo-Confirmed Checks

The repo confirms:

- Required production provider policy exists in code and `.env.example`.
- Provider preflight scripts exist for production, voice, and pronunciation.
- Cost guard envs exist and are documented.
- Upload kill switch guards new audio uploads.
- OpenAI transcription, Azure pronunciation, and ElevenLabs voice paths have safe user-facing error boundaries.
- `record -> evaluate -> review -> progress` remains server-owned and atomic at persistence time.
- Generated voice audio uses app-owned replay.
- ElevenLabs provider cleanup boundary exists behind destructive guard and self-test, but real delete is not executed by normal checks.

The repo does not confirm:

- Actual production env values.
- Provider dashboard/billing/account state.
- Current provider model availability.
- Current external API entitlements.
- Current production kill-switch operation proof.
- Provider-side retention/deletion guarantees.
- Real disposable account deletion proof.

## Human Confirmation Required

Record only safe metadata. Do not record API keys, service role keys, raw provider responses, raw audio, raw transcripts, private script text, signed URLs, object keys, storage paths, provider voice IDs, account IDs, project IDs, resource IDs, subscription IDs, invoices, or detailed billing amounts.

Required confirmations:

- OpenAI project / billing / usage limits / alert owner / model availability.
- Azure Speech resource / region / quota / billing / pronunciation assessment availability.
- ElevenLabs plan / credits / voice cloning availability / API availability / deletion capability.
- Provider dashboard usage / quota / budget alert visibility.
- Production env presence only for required provider keys and model settings.
- Kill switch operation proof for OpenAI, Azure, ElevenLabs, and Storage uploads.
- Support escalation owner and provider outage communication path.
- Provider cleanup / retention behavior for account deletion and Brush-up revoke.
- Mobile browser and future WebView provider flow smoke before Capacitor/native release.

## PASS / WARN / BLOCKED / FAIL Criteria

`PASS`:

- Production provider env presence is confirmed without revealing values.
- Dashboard/billing/quota/alert visibility is confirmed for OpenAI, Azure, ElevenLabs, and Supabase Storage.
- Kill switch drill is passed or recently proven for all provider surfaces.
- Main loop provider smoke passes on the target production deployment.
- Account deletion provider cleanup and disposable proof are complete for any provider-side user voice/material used in v1.
- Brush-up provider create/delete/retention/cost behavior is proven if Brush-up ships in v1.

`WARN`:

- Main loop works and provider dashboards are visible, but app-side hard quotas, explicit alert thresholds, or targeted failure smoke remain incomplete.
- Warnings are explicitly accepted for `private_beta` or `small_cohort`, not for broad `public_free`.

`BLOCKED`:

- Production env presence is unknown.
- Provider account/billing/quota/entitlement is unknown.
- Kill switch cannot be operated.
- Provider cleanup/deletion cannot be proven for enabled voice material.
- Brush-up implementation would require provider behavior that has not been confirmed.
- Store claims would not match actual provider retention/deletion behavior.

`FAIL`:

- Production provider smoke fails on the target release path.
- Secret/raw provider/private user data is exposed in UI, logs, docs, or evidence.
- Kill switch fails open and paid provider calls continue when paused.

## v1 Pre-Submit Blockers

- Refresh provider dashboard / billing / quota / alert proof for the exact release environment.
- Refresh production provider env presence proof without values.
- Run or record kill switch operation proof for OpenAI, Azure, ElevenLabs, and Storage uploads.
- Complete provider cleanup and disposable account deletion proof.
- Finalize provider disclosure in Privacy Policy / Terms / App Privacy / Google Data Safety.
- Prove mobile browser / future WebView upload, replay, and provider failure recovery.
- Decide whether v1 remains `small_cohort` or needs DB-backed quotas before broader free launch.

## Gate 3.5 Handoff

Gate 3.5 must take:

- Brush-up-specific ElevenLabs create/clone/material API feasibility.
- Brush-up provider deletion / retention / revoke behavior.
- Brush-up cost event design for clone/create voice and generated model audio.
- Script-scoped voice variant data model candidates from Gate 1.5.
- Consent/revoke/deletion requirements from Gate 2.
- Proof plan for one complete Brush-up loop: consent -> server-side provider submission -> app-owned replay -> listen -> revoke -> provider cleanup -> account deletion coverage.

## Worker / Queue / VPS Trigger Conditions

Do not add worker / queue / VPS now. Reconsider only if:

- Provider clone/material creation is async or regularly exceeds Vercel Function timeout.
- Provider retries must continue after the user leaves the page.
- Provider cleanup/revoke must be guaranteed without operator action.
- Batch retention/deletion jobs are required for Store proof.
- Audio conversion becomes CPU-heavy or large-file-heavy.
- Concurrent Brush-up requests need durable locking/dedupe beyond DB constraints.
- Provider rate limits require scheduled backoff.
- Store review requires stronger automated deletion proof than request-driven routes and operator proof can provide.

Until then, initial architecture remains Vercel Route Handler / API Route + Supabase Storage / DB.
