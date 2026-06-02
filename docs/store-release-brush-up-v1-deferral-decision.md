# Brush-up v1 Deferral Decision

Native Minute will defer Brush-up from the v1 Store release scope to v1.1. The reason is release focus: App Store / Google Play listing should move forward on the proven Web core and normal voice path instead of blocking v1 on unresolved Brush-up-specific provider, deletion, and cleanup questions.

This is a docs/evidence decision only. It does not change code, DB schema, API contracts, provider integrations, provider dashboards, production env, Vercel settings, account deletion implementation, Capacitor, or Store submission state.

## Decision

- Brush-up is removed from v1 release blocker scope.
- Brush-up moves to v1.1 entry criteria.
- Existing voice / clone voice / Brush-up architecture documents stay valid as future planning material.
- v1 continues toward Store release with the current Web core, normal listen / record / evaluate / review / progress loop, normal voice setup / model audio generation, privacy/deletion readiness, provider readiness, and release QA.
- Gate 3.5 is redefined from "Brush-up MVP implementation" to "v1 core readiness and release-scope cleanup before native packaging."

## Why Defer Brush-up

Brush-up v1 inclusion still depends on unresolved items from the Gate 3 WARN queue:

| Item | Current state | v1 decision |
| --- | --- | --- |
| ElevenLabs delete / cleanup semantics | deferred | Move to v1.1 Brush-up entry criteria. |
| ElevenLabs retention / deletion semantics | deferred | Move to v1.1 Brush-up entry criteria. |
| ElevenLabs script-scoped Brush-up feasibility | deferred | Move to v1.1 Brush-up entry criteria. |
| ElevenLabs Brush-up cost / latency / retry risk | deferred | Move to v1.1 Brush-up entry criteria. |
| `NATIVE_MINUTE_DISABLE_ELEVENLABS` operation proof for Brush-up | deferred | Required before Brush-up v1.1 implementation, but not a v1 Brush-up blocker because Brush-up is out of scope. |
| Brush-up-aware account deletion cleanup proof | pending | Move to v1.1 Brush-up entry criteria. Normal account deletion proof remains a Store blocker. |

Keeping Brush-up in v1 would force provider cleanup, retention, script-scoped voice material, revoke/delete, and cost/latency proof before native packaging. That risk is larger than the current Store release goal.

## v1 Scope

Keep in v1:

- Web core: Home, `/scripts`, `/scripts/new`, listen, record, evaluate, review, progress.
- Normal voice setup and normal model audio generation using the existing server-side provider boundary.
- App-owned Storage and protected replay for existing generated audio and recordings.
- OpenAI transcription, Azure pronunciation evaluation, ElevenLabs normal voice path, Supabase Auth/DB/Storage, and Vercel deploy readiness.
- Privacy / terms / consent / account deletion planning and proof for the actual v1 feature set.
- Provider kill switch gap closure for the providers used in v1.
- Store assets, release QA, TestFlight / Google closed testing, submission, and rejection-fix loop.

Remove from v1 release blocker scope:

- Brush-up UI.
- Best-take-to-script-scoped voice material provider submission.
- Brush-up-specific consent / revoke UI.
- Brush-up script-scoped voice variants.
- Brush-up generated audio candidate acceptance flow.
- Brush-up-specific provider cleanup proof.
- Brush-up-specific account deletion proof.
- Brush-up-specific cost / latency / retry proof.

Do not delete existing docs, plans, or design decisions. They become v1.1 planning inputs.

## Gate 3.5 Redefined

Gate 3.5 is now a v1 release readiness checkpoint, not a Brush-up implementation gate.

Gate 3.5 should cover:

1. Confirm Brush-up is hidden / not implemented / not marketed as v1 functionality.
2. Close or explicitly accept remaining v1 provider kill switch gaps.
3. Confirm normal v1 voice / transcription / pronunciation provider surfaces have safe failure and support paths.
4. Confirm privacy / deletion / consent claims match the v1 feature set without Brush-up.
5. Keep Brush-up v1.1 requirements parked with owners and entry criteria.
6. Decide whether any remaining Gate 3 WARN items block Gate 4 / Capacitor or can be handled in Gate 6 release QA.

Gate 3.5 should not implement Brush-up, introduce DB schema, alter provider contracts, add env values, or run dashboards. It is a release-scope alignment step before moving deeper into privacy/deletion proof and native packaging.

## v1.1 Brush-up Entry Criteria

Before Brush-up v1.1 implementation starts, the release owner must have safe confirmation for:

1. ElevenLabs can support the chosen script-scoped best-take-to-voice-material approach.
2. ElevenLabs delete / cleanup semantics are known for normal cloned voices and script-scoped Brush-up material/variants.
3. ElevenLabs retention / deletion semantics are known enough for consent, revoke, Privacy Policy, Data Safety, and account deletion claims.
4. Brush-up cost / latency / retry behavior is understood enough to decide whether Vercel Route Handlers remain sufficient.
5. `NATIVE_MINUTE_DISABLE_ELEVENLABS` env presence and safe operation proof are recorded.
6. Account deletion proof covers Brush-up material, provider variants, generated Brush-up audio, saved pins, app-owned Storage, DB rows, and provider cleanup.
7. Protected replay proof covers Brush-up generated audio and does not rely on provider direct URLs.
8. Brush-up consent and revoke copy are finalized before any best take audio is sent to a provider as voice material.

## Handoff

Gate 4 / Capacitor can proceed only after v1 privacy/deletion/provider release readiness is sufficiently closed for the v1 feature set. Brush-up does not block Gate 4 as long as it is not user-facing, not marketed, and not included in Store metadata for v1.

Brush-up returns as v1.1 planning after Store listing or after the release owner explicitly reopens it with the entry criteria above.
