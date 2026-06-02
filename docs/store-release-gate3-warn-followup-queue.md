# Gate 3 WARN Follow-up Queue

Gate 3 human confirmation is `WARN`, not `PASS`. This queue breaks down the remaining WARN / pending / deferred items and defines what must be closed before Gate 3.5 implementation starts.

This is docs/evidence-only planning. It does not change code, DB schema, API contracts, provider integrations, provider dashboards, production env, Vercel settings, Brush-up, Capacitor, worker / queue / VPS, or Store submission state.

## Source

- Gate 3 human confirmation result: `WARN`
- Evidence package: `docs/store-release-gate3-human-confirmation-package.md`
- Structured evidence: `outputs/store_release_gate3_human_confirmation/gate3_human_confirmation_template.json`
- Latest confirmed safe status: major provider dashboard / env / logs / storage surfaces are human-confirmed, but provider-specific kill switches, Azure alerting, ElevenLabs cleanup / retention / Brush-up checks, Supabase protected replay, and account deletion cleanup proof remain incomplete.

## Classification Legend

| Class | Meaning |
| --- | --- |
| Gate 3.5 before implementation | Must be resolved before any Brush-up schema/API/provider/UI implementation starts. |
| Gate 3.5 during implementation | Can be verified during the Brush-up proof loop, but must be tracked explicitly. |
| Gate 6 release QA | Can wait for release QA / native wrapper QA if it does not affect Brush-up architecture. |
| Human dashboard confirmation required | Requires a human to inspect provider/Vercel/Supabase dashboards without recording sensitive values. |
| Env / infrastructure change required | Requires env presence, alert configuration, or console setup by a human operator. |
| Code change required | Requires repo implementation work in a later task. |
| Defer possible | Can remain WARN for small-cohort planning if explicitly accepted, but cannot be claimed as PASS. |

## Queue Summary

| Provider | Item | Current status | Classification | Gate 3.5 impact | Next safe action |
| --- | --- | --- | --- | --- | --- |
| OpenAI | `NATIVE_MINUTE_DISABLE_OPENAI` missing from Vercel env | warning | Env / infrastructure change required; human dashboard confirmation required | Not a Brush-up blocker if OpenAI is not used for Brush-up, but Store-facing Gate 3 PASS needs proof. | Add env presence only, then record safe kill switch operation proof. |
| OpenAI | `OPENAI_TRANSCRIPTION_MODEL` missing from Vercel env | warning | Defer possible; human dashboard confirmation required | Not a blocker; code defaults to repo model when absent. | Either add env for explicitness or record accepted default. |
| OpenAI | support escalation owner not recorded | pending | Gate 6 release QA; human dashboard confirmation required | Not a Brush-up implementation blocker. | Assign support / provider outage owner before Store PASS. |
| Azure | `NATIVE_MINUTE_DISABLE_AZURE` missing from Vercel env | warning | Env / infrastructure change required; human dashboard confirmation required | Not a Brush-up voice-material blocker, but evaluate/review proof should stay recoverable. | Add env presence only, then record safe kill switch operation proof. |
| Azure | alert not configured | warning | Env / infrastructure change required; human dashboard confirmation required | Not a Brush-up implementation blocker, but Store-facing cost guard remains WARN. | Configure alert or record accepted manual owner. |
| Azure | Pronunciation Assessment availability not confirmed | pending | Human dashboard confirmation required; Gate 6 release QA | Not a Brush-up voice-material blocker, but required before Store PASS. | Confirm availability for the selected resource/region without recording identifiers. |
| Azure | mobile / WebView audio risk not confirmed | pending | Gate 6 release QA; human confirmation required | Can wait until Capacitor/native QA unless Brush-up changes record/evaluate audio path. | Test mobile browser / future WebView recording, upload, PCM normalization, evaluate recovery. |
| ElevenLabs | delete / cleanup semantics deferred | deferred | Gate 3.5 before implementation; human dashboard confirmation required | Blocking for Brush-up implementation because script-scoped voice/material cleanup must be known. | Confirm normal cloned voice and future script-scoped variant cleanup semantics without provider identifiers. |
| ElevenLabs | retention semantics deferred | deferred | Gate 3.5 before implementation; human dashboard confirmation required | Blocking for Brush-up consent, revoke, deletion, and policy claims. | Confirm source material and generated audio retention / deletion behavior. |
| ElevenLabs | Brush-up script-scoped feasibility deferred | deferred | Gate 3.5 before implementation; human dashboard confirmation required | Blocking for Brush-up implementation. | Confirm selected best-take-to-script-scoped voice/material feasibility under the intended plan. |
| ElevenLabs | Brush-up cost / latency / retry deferred | deferred | Gate 3.5 before implementation; human dashboard confirmation required | Blocking for deciding whether Vercel Functions are enough. | Confirm expected latency, retry behavior, and cost surface; keep values out of docs. |
| ElevenLabs | `NATIVE_MINUTE_DISABLE_ELEVENLABS` proof deferred | deferred | Gate 3.5 before implementation; human dashboard confirmation required | Blocking for Brush-up implementation if ElevenLabs is the Brush-up provider. | Confirm env presence and safe operation proof. |
| Supabase | policy SQL detail not reviewed | warning | Gate 6 release QA; human dashboard confirmation required | Not a Brush-up blocker unless new Brush-up buckets/tables are introduced. | Confirm RLS / Storage policy detail before Store PASS. |
| Supabase | protected replay behavior not confirmed in this pass | pending | Gate 3.5 during implementation; Gate 6 release QA | Brush-up generated audio must use app-owned replay, so proof is needed during Brush-up candidate replay. | Confirm replay for normal audio now; repeat for Brush-up generated audio in Gate 3.5. |
| Supabase | account deletion cleanup proof not confirmed | pending | Gate 3.5 before implementation for Brush-up data; Store blocker | Brush-up cannot ship without cleanup proof covering Brush-up material and generated audio. | Complete disposable cleanup proof or define Gate 3.5 proof extension. |
| Vercel | provider-specific kill switch gaps | warning | Env / infrastructure change required; human dashboard confirmation required | ElevenLabs gap blocks Brush-up implementation; OpenAI/Azure gaps can stay WARN only with explicit acceptance. | Add/confirm missing env names and record safe proof. |
| Vercel | rollback / redeploy owner not recorded | pending | Gate 6 release QA | Not a Brush-up implementation blocker. | Assign owner before release QA / native packaging. |

## Kill Switch Support Inventory

Repo-side support is present for the four cost guard surfaces:

| Surface | Env name | Code support | Current Gate 3 status | Interpretation |
| --- | --- | --- | --- | --- |
| OpenAI transcription / Script Studio | `NATIVE_MINUTE_DISABLE_OPENAI` | Supported by `lib/cost-guard.ts`, `services/transcription/factory.ts`, and `services/script-studio/script-generation.service.ts`. | Vercel env missing; operation proof incomplete. | Code appears present; env presence and human proof are missing. |
| Azure pronunciation | `NATIVE_MINUTE_DISABLE_AZURE` | Supported by `lib/cost-guard.ts` and `services/pronunciation/factory.ts`. | Vercel env missing; operation proof incomplete. | Code appears present; env presence and human proof are missing. |
| ElevenLabs voice | `NATIVE_MINUTE_DISABLE_ELEVENLABS` | Supported by `lib/cost-guard.ts`, `providers/voice/factory.ts`, and account deletion provider cleanup guard behavior. | Proof deferred. | Code appears present; env presence / operation proof must be confirmed before Brush-up implementation. |
| Supabase Storage uploads | `NATIVE_MINUTE_DISABLE_STORAGE_UPLOADS` | Supported by `lib/cost-guard.ts` and upload routes for recordings, voice samples, and voice consent recordings. | Presence confirmed; operation proof optional for PASS. | Code appears present; proof can be run later without changing Brush-up architecture. |

`OPENAI_TRANSCRIPTION_MODEL` is optional in the current repo: `services/transcription/openai-transcriber.ts` and `scripts/pronunciation-provider-preflight.mjs` default to the repo model when it is absent. Its absence is a release explicitness warning, not a code blocker.

## Gate 3.5 Entry Criteria

Gate 3.5 implementation may start only after these are closed or explicitly accepted in writing:

1. ElevenLabs script-scoped Brush-up feasibility is confirmed for the intended plan.
2. ElevenLabs delete / cleanup semantics are confirmed for normal cloned voices and future script-scoped Brush-up variants/material.
3. ElevenLabs retention / deletion semantics are confirmed enough to support Brush-up consent, revoke, account deletion, Privacy Policy, and Store disclosure.
4. ElevenLabs cost / latency / retry behavior is confirmed enough to decide whether Vercel Route Handlers are still sufficient.
5. `NATIVE_MINUTE_DISABLE_ELEVENLABS` env presence and safe operation proof are confirmed.
6. Supabase account deletion cleanup proof has a plan for Brush-up material, script-scoped variants, generated Brush-up audio, saved pins, and provider cleanup.
7. Protected replay is confirmed for the normal path or explicitly scheduled as the first proof during Gate 3.5, because Brush-up generated audio must use app-owned replay.

OpenAI and Azure kill switch env gaps should be closed before claiming Gate 3 `PASS`, but they do not block a docs/design-only Gate 3.5 planning task if Brush-up remains ElevenLabs-first and no provider/env implementation occurs.

## Gate 3.5 During Implementation

The following can be verified during Gate 3.5 if the entry criteria above are met:

- Brush-up generated audio uses app-owned replay and does not expose provider direct URLs.
- Supabase protected replay works for Brush-up generated audio.
- Brush-up revoke deletes or hides generated Brush-up audio and prevents future provider use.
- Provider cleanup status is recorded as safe status only.
- Vercel Function timing stays inside acceptable limits for one script-scoped Brush-up candidate.
- Quota/cost metadata remains privacy-safe and does not store raw provider bodies, transcript text, script text, raw audio, object keys, or provider identifiers.

## Gate 6 / Release QA Handoff

These WARN items can be carried to release QA if explicitly accepted for Gate 3.5:

- OpenAI optional transcription model env explicitness.
- OpenAI support escalation owner.
- Azure alert setup if a manual owner is accepted for small-cohort testing.
- Azure Pronunciation Assessment availability refresh for the final resource/region.
- Azure mobile / WebView recording, upload, PCM normalization, evaluate, and recovery smoke.
- Supabase policy SQL detail review.
- Vercel rollback / redeploy owner and proof.

These items still block Store submission if they remain open at release QA exit.

## Next Safe Work Order

1. Human-only dashboard/env pass:
   - add or confirm provider kill switch env presence,
   - configure or accept Azure alert ownership,
   - confirm ElevenLabs cleanup / retention / Brush-up feasibility,
   - record safe proof without values.
2. Gate 3.5 design entry check:
   - confirm the entry criteria above,
   - decide whether any missing item forces Brush-up to v1.1.
3. Gate 3.5 implementation planning:
   - only after the entry check, define schema/API/provider/UI work for Brush-up.
