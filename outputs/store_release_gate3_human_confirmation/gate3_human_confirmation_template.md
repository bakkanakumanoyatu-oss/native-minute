# Gate 3 Human Confirmation Evidence Template

Use this template to record human confirmation for OpenAI / Azure / ElevenLabs / Supabase / Vercel readiness. Record safe status only. Do not paste screenshots, console output, dashboard payloads, object paths, provider identifiers, transcript text, audio file names, or credential values.

## Metadata

| Field | Value |
| --- | --- |
| checked_at | unknown |
| reviewer_role | unknown |
| environment | unknown |
| production_url | unknown |
| deployment_provider | unknown |
| deployment_project | unknown |
| deployment_id_or_name | unknown |
| deployment_status | unknown |
| commit_or_build_ref | unknown |
| overall_result | unknown |

## Redaction Affirmation

Mark each item `confirmed` before this evidence is accepted.

| Item | Status |
| --- | --- |
| No secret values or partial credential fragments are recorded | unknown |
| No raw provider bodies, request payloads, or dashboard JSON are recorded | unknown |
| No private user data, transcript text, script text, raw audio, object keys, signed URLs, or Storage paths are recorded | unknown |
| No provider voice identifiers, account identifiers, project identifiers, resource identifiers, subscription identifiers, invoices, or detailed billing amounts are recorded | unknown |

## Status Legend

Use one of:

- `repo_confirmed`
- `human_confirmed`
- `unknown`
- `warning`
- `blocker`
- `not_applicable`

## OpenAI

| Item | Status | Safe evidence | Follow-up |
| --- | --- | --- | --- |
| Project / billing / usage visibility / alert owner | unknown | unknown | unknown |
| Transcription model availability | unknown | unknown | unknown |
| Script Studio / coaching model availability | unknown | unknown | unknown |
| Production env presence only for OpenAI env names | unknown | unknown | unknown |
| Kill switch proof for `NATIVE_MINUTE_DISABLE_OPENAI=1` | unknown | unknown | unknown |
| Safe error / logging boundary | unknown | unknown | unknown |
| Support escalation owner | unknown | unknown | unknown |

## Azure

| Item | Status | Safe evidence | Follow-up |
| --- | --- | --- | --- |
| Speech resource / region readiness | unknown | unknown | unknown |
| Pronunciation Assessment availability | unknown | unknown | unknown |
| Quota / billing / alert owner | unknown | unknown | unknown |
| Production env presence only for Azure env names | unknown | unknown | unknown |
| Kill switch proof for `NATIVE_MINUTE_DISABLE_AZURE=1` | unknown | unknown | unknown |
| Mobile / WebView recording and PCM normalization risk | unknown | unknown | unknown |
| Safe error / logging boundary | unknown | unknown | unknown |

## ElevenLabs / Brush-up

| Item | Status | Safe evidence | Follow-up |
| --- | --- | --- | --- |
| Plan / credits / API availability | unknown | unknown | unknown |
| Normal TTS readiness | unknown | unknown | unknown |
| Clone voice availability and verification requirements | unknown | unknown | unknown |
| Voice create / delete / cleanup semantics | unknown | unknown | unknown |
| Retention / deletion semantics for source material and generated audio | unknown | unknown | unknown |
| Brush-up script-scoped voice/material feasibility | unknown | unknown | unknown |
| Brush-up cost / latency / retry risk | unknown | unknown | unknown |
| Production env presence only for ElevenLabs and service role env names | unknown | unknown | unknown |
| Kill switch proof for `NATIVE_MINUTE_DISABLE_ELEVENLABS=1` | unknown | unknown | unknown |
| Safe error / logging boundary | unknown | unknown | unknown |

## Supabase

| Item | Status | Safe evidence | Follow-up |
| --- | --- | --- | --- |
| Storage buckets: recordings, script-audios, voice-samples, voice-consents | unknown | unknown | unknown |
| DB / RLS / ownership proof status | unknown | unknown | unknown |
| Protected replay proof status | unknown | unknown | unknown |
| Account deletion cleanup proof status | unknown | unknown | unknown |
| Service role server-side only, presence-only confirmation | unknown | unknown | unknown |
| Storage upload kill switch proof for `NATIVE_MINUTE_DISABLE_STORAGE_UPLOADS=1` | unknown | unknown | unknown |

## Vercel

| Item | Status | Safe evidence | Follow-up |
| --- | --- | --- | --- |
| Production deployment current / ready | unknown | unknown | unknown |
| Deployment commit or build ref | unknown | unknown | unknown |
| Production env presence only for required provider and kill switch env names | unknown | unknown | unknown |
| Kill switch proof approach | unknown | unknown | unknown |
| Logs do not expose forbidden evidence | unknown | unknown | unknown |
| Rollback / redeploy owner and path | unknown | unknown | unknown |

## Kill Switch Proof

| Surface | Env name | Proof mode | Result | Safe evidence | Follow-up |
| --- | --- | --- | --- | --- | --- |
| OpenAI | `NATIVE_MINUTE_DISABLE_OPENAI` | unknown | unknown | unknown | unknown |
| Azure | `NATIVE_MINUTE_DISABLE_AZURE` | unknown | unknown | unknown | unknown |
| ElevenLabs | `NATIVE_MINUTE_DISABLE_ELEVENLABS` | unknown | unknown | unknown | unknown |
| Supabase Storage uploads | `NATIVE_MINUTE_DISABLE_STORAGE_UPLOADS` | unknown | unknown | unknown | unknown |

Allowed proof modes: `production-like staging`, `production safe drill`, `runbook only`, `unknown`.

## Billing / Quota / Alert Proof

| Provider | Dashboard visibility | Usage / quota visibility | Alert or owner | Result | Safe notes |
| --- | --- | --- | --- | --- | --- |
| OpenAI | unknown | unknown | unknown | unknown | unknown |
| Azure | unknown | unknown | unknown | unknown | unknown |
| ElevenLabs | unknown | unknown | unknown | unknown | unknown |
| Supabase | unknown | unknown | unknown | unknown | unknown |
| Vercel | unknown | unknown | unknown | unknown | unknown |

## Cleanup / Retention Proof

| Provider / platform | Retention known | Deletion / cleanup available | Brush-up impact | Result | Follow-up |
| --- | --- | --- | --- | --- | --- |
| OpenAI | unknown | unknown | unknown | unknown | unknown |
| Azure | unknown | unknown | unknown | unknown | unknown |
| ElevenLabs normal voice | unknown | unknown | unknown | unknown | unknown |
| ElevenLabs Brush-up script-scoped material | unknown | unknown | unknown | unknown | unknown |
| Supabase Storage | unknown | unknown | unknown | unknown | unknown |
| Supabase DB / Auth | unknown | unknown | unknown | unknown | unknown |

## Decision

| Field | Value |
| --- | --- |
| result | unknown |
| blockers | unknown |
| warnings | unknown |
| release owner decision | unknown |
| next action | unknown |

Result options: `PASS`, `WARN`, `BLOCKED`, `FAIL`.

## Forbidden Evidence Reminder

Do not record secret values, partial credentials, raw provider bodies, request payloads, private user data, transcript text, script text, raw audio, object keys, signed URLs, Storage paths, provider voice identifiers, account identifiers, project identifiers, resource identifiers, subscription identifiers, invoices, or detailed billing amounts.
