# Gate 3 Human Confirmation Package

Gate 3 repo-side provider readiness is documented in `docs/store-release-gate3-provider-readiness-cost-guard.md`. This package turns the remaining OpenAI / Azure / ElevenLabs / Supabase / Vercel dashboard, billing, quota, kill switch, cleanup, and retention checks into safe human-confirmation evidence.

This is docs/evidence-template-only. It does not operate provider dashboards, call provider APIs, change production env, alter code, add DB schema, change API contracts, implement Brush-up, change UI, add Capacitor, or introduce worker / queue / VPS infrastructure.

## Decision

- Gate 3 remains Store-facing `WARN` until this package is filled by a human reviewer for the target production deployment.
- Repo-confirmed provider boundaries remain accepted: provider calls are server-side, app-owned replay is preferred, and secrets / service credentials must not be exposed to the client.
- Human confirmation must record only safe status labels and short notes. It must not copy dashboard payloads, raw provider bodies, private user content, object keys, or credential values.
- Brush-up v1 must not move to implementation until the ElevenLabs script-scoped create / delete / retention / cost confirmations are closed or explicitly accepted by the release owner.

## Safe Evidence Policy

Allowed evidence:

- status labels such as `ready`, `configured`, `not_configured`, `unknown`, `needs_follow_up`, `PASS`, `WARN`, `BLOCKED`, and `FAIL`
- provider name, environment name, deployment provider, short commit ref, reviewer role, and check date
- presence-only env confirmation, with no values or partial values
- safe owner labels such as `project owner`, `support owner`, or `release owner`
- count-free or coarse notes such as `dashboard visible`, `alert configured`, or `cleanup semantics documented`

Forbidden evidence:

- secret values, API key values, service role values, auth headers, or partial credential fragments
- raw provider bodies, request payloads, response payloads, or dashboard JSON
- private user data, transcript text, script text, raw audio, private audio file names, object keys, signed URLs, or Storage paths
- provider voice identifiers, provider account identifiers, project identifiers, resource identifiers, subscription identifiers, invoices, or detailed billing amounts

## Status Buckets

Use these buckets consistently:

- `repo confirmed`: visible from repo docs, scripts, or code without external dashboard access
- `human confirmation required`: cannot be proven from repo and needs human dashboard or production-console review
- `confirmed by human`: safely confirmed by a human without recording forbidden evidence
- `unknown`: not checked or not available yet
- `warning`: usable now, but Store submission needs a follow-up
- `blocker`: release cannot proceed while this remains open

## OpenAI Confirmation Checklist

| Item | Required safe evidence |
| --- | --- |
| Project / billing / usage guard | Human confirms production project exists, billing is usable, usage visibility is available, and an alert or owner exists. Do not record project identifiers or billing details. |
| Transcription model availability | Human confirms the production project can use the configured transcription model. Record only availability status. |
| Script Studio / coaching model availability | Human confirms the configured Script Studio model is available. If coaching becomes a provider surface, record whether it is in or out of v1. |
| Production env presence | Confirm `OPENAI_API_KEY` and optional OpenAI model env names are present only. Do not reveal values. |
| Kill switch proof | Human confirms the proof mode and result for `NATIVE_MINUTE_DISABLE_OPENAI=1`. Prefer production-like staging if production toggling would be risky. |
| Safe error / log boundary | Confirm UI, docs, and logs reviewed during the check do not expose forbidden evidence. |
| Support escalation | Confirm who handles OpenAI outage, billing, quota, and model availability issues. |

## Azure Confirmation Checklist

| Item | Required safe evidence |
| --- | --- |
| Speech resource / region | Human confirms a production Speech resource and target region exist. Do not record resource identifiers. |
| Pronunciation Assessment availability | Confirm Pronunciation Assessment is available for the selected region/resource. |
| Quota / billing / alert | Confirm usage or quota visibility, billing readiness, and an alert or owner. Do not record detailed costs. |
| Production env presence | Confirm `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` are present only. Do not reveal values. |
| Kill switch proof | Human confirms the proof mode and result for `NATIVE_MINUTE_DISABLE_AZURE=1`. |
| Mobile / WebView audio risk | Confirm mobile browser or future WebView recording format and PCM normalization risk is either tested, accepted as warning, or blocked. |
| Safe error / log boundary | Confirm Azure auth, quota, timeout, and cancellation paths do not expose raw provider detail. |

## ElevenLabs / Brush-up Confirmation Checklist

| Item | Required safe evidence |
| --- | --- |
| Plan / credits / API availability | Human confirms the production account can use normal TTS and has enough operational visibility. Do not record detailed credit or billing amounts. |
| Normal TTS readiness | Confirm normal script model audio can remain the v1 voice surface. |
| Clone voice availability | Confirm voice clone is available under the intended plan and any verification requirements are understood. |
| Voice create / delete / cleanup semantics | Confirm normal cloned voice cleanup behavior and deleted/missing recovery. Do not record provider voice identifiers. |
| Retention / deletion semantics | Confirm source material, cloned voice, generated audio, and provider retention behavior enough for Privacy Policy and account deletion claims. |
| Brush-up script-scoped feasibility | Confirm a selected best take can be used as script-scoped voice material or equivalent under the intended plan. |
| Brush-up cost / latency / retry risk | Confirm expected per-action cost surface, provider latency, retry behavior, and whether Vercel Functions remain enough. |
| Production env presence | Confirm `ELEVENLABS_API_KEY`, `ELEVENLABS_TTS_MODEL_ID`, and `SUPABASE_SERVICE_ROLE_KEY` are present only. Do not reveal values. |
| Kill switch proof | Human confirms the proof mode and result for `NATIVE_MINUTE_DISABLE_ELEVENLABS=1`. |
| Safe error / log boundary | Confirm no forbidden evidence is exposed in UI, logs, docs, or evidence. |

Brush-up v1 pre-implementation blockers:

- script-scoped voice/material creation is not confirmed
- provider deletion cannot clean up script-scoped variants/material
- provider source material retention is unknown
- cost per Brush-up action is unknown or unacceptable
- provider latency regularly exceeds Vercel Function limits
- revoke cleanup cannot be proven without a worker / queue / VPS decision

## Supabase Confirmation Checklist

| Item | Required safe evidence |
| --- | --- |
| Storage buckets | Confirm presence of `recordings`, `script-audios`, `voice-samples`, and `voice-consents`. Do not record object keys or paths. |
| DB / RLS / ownership | Confirm ownership checks and RLS proof status for recordings, script audio, voice samples, voice consents, and account deletion support tables. |
| Protected replay | Confirm replay routes remain app-owned and authenticated; no public signed URL is used as user-facing authority. |
| Account deletion cleanup | Confirm provider -> Storage -> DB -> Auth cleanup proof status and whether disposable proof is complete. |
| Service role boundary | Confirm service role credential is server-side only by presence-only review. Do not reveal values. |
| Storage upload kill switch | Human confirms the proof mode and result for `NATIVE_MINUTE_DISABLE_STORAGE_UPLOADS=1`. |

## Vercel Confirmation Checklist

| Item | Required safe evidence |
| --- | --- |
| Production deployment | Confirm production deployment is current/ready and matches the intended commit or build ref. |
| Env presence | Confirm required provider env and kill switch env names are present only. Do not reveal values. |
| Kill switch proof approach | Record whether proof used production-like staging, production safe drill, or runbook-only status. Do not let Codex operate the switches in this package. |
| Logs boundary | Confirm logs reviewed for the release check do not expose forbidden evidence. |
| Rollback / redeploy path | Confirm a release owner knows how to rollback or redeploy without exposing credentials. |

## Safe Recording Methods

Kill switch proof:

- Record the surface, env name, proof mode, result, reviewer role, and date.
- Accept `production-like staging` when toggling production would cause avoidable user or cost risk.
- Do not paste console output if it includes secrets, raw provider detail, private content, object keys, or provider identifiers.

Billing / quota / alert proof:

- Record whether a dashboard is visible, usage/quota visibility exists, and an alert or monitoring owner exists.
- Avoid exact spend, invoices, account identifiers, or screenshots that include sensitive account details.
- If a provider has no automated alert, record the manual owner and mark the item `warning` unless accepted for small-cohort operation.

Deletion / retention / cleanup proof:

- Record whether deletion is available, documented, tested, not tested, or blocked.
- For provider cleanup, record safe result categories only. Do not record provider voice identifiers, source audio paths, object keys, or provider request payloads.
- For Brush-up, require source material retention, script-scoped variant cleanup, generated audio handling, revoke behavior, and account deletion coverage.

## PASS / WARN / BLOCKED / FAIL Criteria

`PASS`:

- OpenAI, Azure, ElevenLabs, Supabase, and Vercel required items are confirmed by a human.
- Kill switch operation proof is safely confirmed for OpenAI, Azure, ElevenLabs, and Storage uploads.
- Provider cleanup, deletion, and retention behavior is confirmed enough for Store-facing claims.
- Brush-up v1 has no ElevenLabs create/delete/retention/cost blocker.
- Evidence contains no forbidden data.

`WARN`:

- Providers are usable, but billing alert, quota, cleanup, deletion semantics, mobile/WebView provider proof, or targeted failure proof remains incomplete.
- Warnings are explicitly accepted for `private_beta` or `small_cohort`, not broad `public_free`.

`BLOCKED`:

- A required provider is unavailable.
- Production env presence is missing or unknown for a required provider.
- A required kill switch cannot be operated.
- Provider cleanup or deletion cannot be proven for enabled voice material.
- ElevenLabs clone/delete is not confirmable for Brush-up v1.

`FAIL`:

- Secret values, partial credentials, raw provider bodies, private user data, transcript text, audio paths, provider identifiers, or forbidden billing details are exposed.
- A provider boundary is violated, such as client-to-provider audio submission for voice material.
- A kill switch fails open and paid provider calls continue when paused.

## Evidence Templates

- Markdown template: `outputs/store_release_gate3_human_confirmation/gate3_human_confirmation_template.md`
- JSON template: `outputs/store_release_gate3_human_confirmation/gate3_human_confirmation_template.json`

Keep filled evidence in the same directory only after a human reviewer confirms it. Leave unknown values as `unknown`; do not infer deployment, dashboard, billing, or provider state from repo data.
