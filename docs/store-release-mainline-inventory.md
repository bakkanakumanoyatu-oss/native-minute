# Store Release Mainline Inventory

Native Minute is now tracked as a `store-release-mainline`: the long-term target is App Store and Google Play listing, while the current work stays on the Next.js Web core until the release gates make native packaging worthwhile.

This document is docs-only. It does not change auth, DB schema, API contracts, providers, Capacitor, infrastructure, or deployment state.

## Current Position

- The fixed 1-minute practice main loop is working well in production-style use: Home, `/scripts`, `/scripts/new`, Listen, Record, Review, and Progress have no major known UX blocker.
- UI/UX improvement is paused as a phase. The product should now move from "make it easier to use" to "make it safe, operable, and reviewable for public release."
- Recent speed work has improved perceived performance: selected-script summaries, Review loading consolidation, lazy Progress audio players, protected audio feedback, and staged evaluate feedback are in place.
- The user-confirmed current app state is usable. Auth callback failure is not a current blocker.
- The next decisions should be evidence and operations decisions, not broad UI polish or provider implementation.

## Git / Deploy Snapshot

- Store release inventory started at `10e4c83 Add staged feedback for evaluate wait`.
- Gate 1 Web beta smoke evidence is pushed at `4e99304 Record Gate 1 web beta smoke pass evidence`.
- Local `main` and `origin/main` had no diff before this Gate 1.5 docs/design work.
- No staged, unstaged, or untracked changes were present before this Gate 1.5 docs/design work.
- Git alone does not prove deployment state; Gate 1 production smoke evidence is the human-confirmed production record.

## Gate Map

### Gate 1: Web Production Core / Web Beta Deploy Smoke

Goal: prove the current Web core is deployed, usable, and recoverable.

Gate 1 smoke checklist and safe evidence templates are fixed in `docs/store-release-gate1-web-beta-smoke.md` and `outputs/store_release_gate1_web_beta_smoke/`.

Status: `PASS` for the human-confirmed Web beta production smoke on Vercel Production / Current, build ref `b5c10e8`. Evidence is recorded in `outputs/store_release_gate1_web_beta_smoke/gate1_web_beta_smoke_evidence_b5c10e8.md` and `.json`. Exact deploy timestamp and exact device/browser remain `unknown`.

Confirm:

- production URL
- commit or build ref
- login and refresh session
- script creation
- listen and protected model audio replay
- record and upload
- evaluate
- review
- progress
- second take on the same script
- latest / best / progress continuity
- provider env and kill switch readiness
- no secret, raw provider response, raw audio, signed URL, or raw storage path appears in UI or docs

### Gate 1.5: Voice Consent / Clone Voice / Brush-up Server-Side Architecture Review

Goal: review voice consent, sample audio, clone voice, Brush-up, provider identifiers, storage, replay, and cleanup architecture before expanding Store-facing voice functionality.

This is an architecture review gate, not a provider implementation gate.

Status: design review is captured in `docs/store-release-gate1_5-voice-brushup-architecture.md`. Brush-up is treated as a v1 adoption candidate, but implementation requires later schema/API/provider/UI work.

### Gate 2: Privacy / Terms / Consent / Delete

Goal: make privacy, terms, consent, support, and account deletion accurate enough for public distribution and store review.

Status: design plan is captured in `docs/store-release-gate2-privacy-consent-deletion-plan.md`. Brush-up v1 requires explicit script-scoped consent before a selected best take is used as voice material, separate from normal recording/evaluation consent. Revoke and account deletion must cover provider cleanup, app-owned Storage, DB rows, generated Brush-up audio, and saved pins.

Store submission remains blocked until account/data deletion completion is proven with a disposable live proof and App Privacy / Google Data Safety answers match the final implemented behavior.

### Gate 3: OpenAI / Azure / ElevenLabs Provider Production Readiness and Cost Guard

Goal: verify production provider roles, env, budget controls, kill switches, monitoring, and safe failure recovery.

Status: checklist/design plan is captured in `docs/store-release-gate3-provider-readiness-cost-guard.md`. Repo confirms provider guard, preflight scripts, kill switches, safe provider boundaries, app-owned replay, and non-blocking quota metadata. Store v1 still requires refreshed human confirmation for dashboard/billing/quota/model availability, production env presence, kill-switch operation, provider retention/deletion behavior, and provider cleanup proof.

Human confirmation package and safe evidence templates are captured in `docs/store-release-gate3-human-confirmation-package.md` and `outputs/store_release_gate3_human_confirmation/`. They separate repo-confirmed facts, human-confirmation-required items, confirmed-by-human status, unknowns, warnings, and blockers without recording secrets, raw provider bodies, private user data, transcript text, audio paths, provider identifiers, or billing details.

Provider roles:

- ElevenLabs: voice clone and model audio generation
- OpenAI: transcription, Script Studio generation, and coaching-adjacent generation
- Azure: pronunciation evaluator
- Supabase: Auth, DB, private Storage, and protected replay

### Gate 3.5: Brush-up MVP Implementation / Revoke Delete Proof

Goal: if Brush-up remains v1 scope, implement and prove the script-scoped best-take-to-Brush-up loop after Gate 2 consent/deletion policy and Gate 3 provider readiness are settled.

### Gate 4: Capacitor iOS / Android

Goal: wrap the Web core for native shells after Web behavior, privacy, deletion, and provider operations are stable enough.

Do not start Capacitor work before Gate 1.5 and the Store-facing privacy/deletion gaps are understood.

### Gate 5: Store Assets / Metadata / Reviewer Account

Goal: prepare screenshots, icons, descriptions, support URL, privacy policy URL, review account, demo notes, and store metadata.

### Gate 6: Release QA

Goal: run cross-device, mobile WebView, upload, replay, auth, provider failure, account deletion, support, and monitoring QA before external testing.

### Gate 7: TestFlight / Google Closed Testing

Goal: validate native packaging and review-critical flows with controlled testers before store submission.

### Gate 8: App Store / Google Play Submission

Goal: submit with complete policy answers, reviewer access, support/privacy URLs, and known provider behavior.

### Gate 9: Rejection-Specific Fix and Resubmission

Goal: treat review rejection as a normal release loop. Record rejection reason, affected gate, fix, checks, and resubmission evidence.

### Gate 10: Listed

Goal: listing is live. Continue monitoring auth, provider cost, deletion requests, support, crash/error signals, and review feedback.

## Web Beta / Vercel Deploy Smoke

Current status: production URL, deploy provider, project, deployment id/name, environment, deployment status, branch, and build ref have been human-confirmed. Exact `deployedAt` timestamp and exact device/browser remain `unknown`; do not infer them from repo data.

Before claiming Web beta is current, record safe evidence for:

| Area | Confirm |
| --- | --- |
| Production URL | The intended Vercel URL opens the current app. |
| Commit / build ref | The deployed build matches the intended short ref. |
| Login | Magic link or approved auth flow reaches `/scripts`. |
| Session refresh | Refresh preserves session on protected pages. |
| Script creation | `/scripts/new` can create a script and reach listen. |
| Listen | Model audio generates or reuses cache; protected replay works. |
| Record | Microphone or safe upload path reaches evaluate. |
| Evaluate | OpenAI transcription + Azure pronunciation, or accepted provider mode, creates Review without partial failed persistence. |
| Review | Summary, score/weak words, coach note, and replay load safely. |
| Progress | Latest result, best result, and review link reflect saved data. |
| Second take | A second take on the same script keeps latest / best / progress semantics intact. |
| Provider env | Expected providers and launch mode are set; test helper env is not enabled. |
| Kill switches | OpenAI, Azure, ElevenLabs, and Storage upload kill switches are known and can be operated. |
| Redaction | UI and proof notes do not expose secrets, raw provider responses, raw audio, signed URLs, storage paths, provider voice ids, transcripts, or script text. |

## Gate 1.5 Voice Architecture Review

The following is the current server / clone voice direction:

- ElevenLabs clone voice consent recording, sample audio, and `voice_id` persistence require server-side processing.
- Do not introduce VPS, EC2, a dedicated server, or a new always-on worker now.
- Initial architecture remains Vercel Route Handler / API Route + Supabase Storage / DB.
- ElevenLabs API key, OpenAI API key, and Supabase service role key must never be exposed to the client.
- Voice sample audio and consent recording must not be sent directly from the client to ElevenLabs or OpenAI.
- The client uploads voice sample / consent recording to app-owned Supabase Storage first.
- Server-side routes read app-owned Storage objects and pass them to the provider.
- Provider `voice_id`, consent id, and owner information must stay linked to DB user ownership.
- Generated audio should not depend on provider direct URLs; normalize provider bytes or references into app-owned replay.
- Continue to prefer private buckets and authenticated replay routes.
- Provider voice identifiers are provider call inputs, not ownership or cache authority.
- Brush-up best take audio must be read from app-owned `recordings` server-side and sent to the provider only after explicit script-scoped consent.
- Brush-up should use script-scoped voice variants and app-owned generated replay; it must not replace the default voice or reuse best-take material across scripts.
- Consider VPS / worker / queue only if Vercel Functions prove insufficient for timeout, retry, provider latency, long-running cleanup, or scheduled job requirements during Gate 1.5 through Gate 3.

Gate 1.5 review questions:

- Are consent recording and sample recording lifecycle, retention, and deletion rules clear?
- Are provider voice ids, local voice rows, consent rows, and owners linked without trusting client input?
- Can all provider calls be made from server-side boundaries without leaking secrets?
- Does account deletion cover voice samples, consent recordings, generated model audio, local voice rows, and provider-side cloned voices?
- Is provider retry / failure behavior safe without adding a queue yet?
- Is Vercel Function runtime enough for expected sample upload, clone creation, TTS generation, and cleanup proof?
- Can Gate 3.5 prove Brush-up consent, generated audio, revoke, and deletion behavior before Capacitor work starts?

## Store Submission Blockers

The Store path remains blocked until these are resolved or explicitly accepted for a narrower test phase:

- account deletion disposable live proof
- privacy / terms / legal final review
- data handling and AI provider disclosure
- Brush-up explicit consent, revoke, deletion, and provider cleanup proof if Brush-up ships in v1
- support URL and privacy policy URL
- reviewer account and reviewer instructions
- Capacitor native packaging
- store assets, app icons, screenshots, and metadata
- Apple App Privacy answers and Google Play Data safety answers
- TestFlight and Google closed testing
- provider cost guard beyond small-cohort assumptions
- monitoring / error logging / incident response
- post-deploy and post-release smoke evidence
- mobile WebView upload, replay, auth callback, and provider failure QA

## First Three Moves

1. Human-confirm Web beta / Vercel deploy state.
   - Record production URL, commit/build ref, launch mode, provider choices, and post-deploy smoke result without raw ids or secrets.
2. Run Gate 1.5 voice consent / clone voice server-side architecture review.
   - Keep it docs/design first. Do not implement clone voice changes in the review task.
3. Inventory Store-facing privacy, deletion, and provider disclosure gaps.
   - Compare current `/privacy`, `/terms`, `/support`, account deletion flow, provider roles, and data safety answers before native packaging.

## Out of Scope for This Inventory

- auth callback failure fix
- login / callback / middleware code changes
- DB schema / migration changes
- API contract changes
- provider implementation changes
- ElevenLabs clone voice implementation
- OpenAI custom voice implementation
- Capacitor setup
- App Store / Google Play submission
- VPS / EC2 / dedicated server introduction
- queue / worker introduction
- broad UI redesign
