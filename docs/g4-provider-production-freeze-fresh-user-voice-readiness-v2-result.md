# G4 Provider Production Freeze and Fresh-user Voice Readiness V2

## Status

`G4_PROVIDER_PRODUCTION_FREEZE_AND_FRESH_USER_VOICE_READINESS_V2 = IMPLEMENTED_PENDING_ACTUAL_DEVICE_EVIDENCE`

This result does not close Gate 4. It records the focused repository work after Gate 3 and the remaining Human-owned staging/device proof. No provider account, environment, deployment, or destructive provider operation was changed.

## Preflight and Gate 3 reconciliation

- Workspace: `/Users/karasawatakahiro/Developer/native-minute`
- Current branch and HEAD at implementation start: `codex/g3-mobile-main-loop` / `020a93a1b0c33f8068008de84ac879dbf7637443`
- `npm run check:workspace`: PASS
- Worktree was clean before this Gate 4 scope started.
- [Gate 3 Mobile Main Loop Final Result](./g3-mobile-main-loop-final-result.md) is canonical and states `G3_MOBILE_MAIN_LOOP = CLOSED_COMMITTED_PASS`.
- Gate 3 runtime source `b93ea20d9e04486bf9f7cbe614f78fb8edf35d67` is an ancestor of the closeout HEAD.

## Gate 4 remaining-gap matrix

| Area | Gate 3 / existing evidence | Gate 4 result |
| --- | --- | --- |
| Fresh-user Mobile setup | Gate 3 used an authorized fixture only; no Mobile setup UI existed. | Implemented as a Bearer-only Mobile setup flow; actual-device proof remains required. |
| ElevenLabs consent, sample, clone, default binding | Existing server-owned services enforce current-provider and ownership checks. | Mobile now reuses those services without returning consent, voice, provider, or storage identifiers. |
| Reference audio and cache | Gate 3 actual-device proof: one synthesis on miss, later replay with zero synthesis. | `REUSE_EXISTING_EVIDENCE`; Mobile background return now says `保存済みのお手本を再準備` after it has prepared audio. |
| Provider safe failure | Existing cache-first service, cost guard, and safe server errors remain unchanged. | New Mobile setup has Japanese re-record/retry recovery and no mock fallback. Actual provider-failure device proof remains pending. |
| OpenAI transcription / Azure evaluation | Gate 3 actual-device loop and persisted Review/Progress are canonical. | `REUSE_EXISTING_EVIDENCE`; no evaluator contract changed. |
| Production mock guard | Existing strict production policy requires ElevenLabs / OpenAI / Azure / OpenAI for voice / transcription / pronunciation / script generation. | `REUSE_EXISTING_EVIDENCE`; final guard validation is recorded with the implementation checks. |
| Observability | Existing quota/cache events and safe timing infrastructure exist. | New setup operations emit only fixed timing labels: `mobile.voiceSetup.state`, `consent`, `sampleUpload`, and `createVoice`. |

## Fresh-user Mobile flow

The Mobile app now supports a fresh authenticated user through:

`consent_required -> sample_required -> ready -> Listen`

- The Mobile BFF accepts only Bearer authentication and does not use a Web cookie fallback.
- Consent is an explicit checkbox. The server uses the existing canonical `voice_consents` service.
- The app records a 10–45 second sample, requires local playback confirmation, then uploads it only to the existing app-owned `voice-samples` storage path.
- The server resolves the current owned consent, uploads the sample, and calls the existing `createUserVoice` path through a default-voice recheck/coalescing helper.
- The client receives only `ready`, `consent_required`, or `sample_required`, plus a creation flag. It never receives a provider voice ID, consent ID, private storage path, raw provider response, or secret.
- A repeated request after the canonical default voice is persisted returns `ready` before another sample upload or clone attempt. Concurrent creates in one server runtime are coalesced; a second persisted-state check precedes the provider call.

No migration, auth-model change, provider contract change, or provider cleanup/deletion was added.

## Required actual-device staging evidence

Gate 4 cannot close until a Human runs this exact sequence on a fresh staging user with `voices = 0` and `voice_consents = 0`:

1. Open Mobile Listen, choose `お手本ボイスを準備する`, accept consent, record at least 10 seconds, play it back, confirm it, and create the voice.
2. Confirm a current ElevenLabs clone becomes the owned default voice without exposing provider or storage details.
3. Return to Listen: first request is one cache miss / synthesis and protected replay; the second identical request is a cache hit with no new synthesis.
4. Background then foreground the app after playback. The next action must say `保存済みのお手本を再準備`, not imply that the server cache was deleted.
5. Exercise a safe provider-unavailable or timeout condition already authorized for staging. Cached personalized audio must replay when available; otherwise Mobile must show retry/later recovery with no mock fallback, data loss, or secret/raw-response exposure.
6. Run one normal record -> OpenAI transcription -> Azure evaluation -> persisted Review -> Progress regression check. Do not repeat the full Gate 3 suite without a new contradiction.

Use safe counts, outcomes, and fixed reason codes only. Do not record sample audio, script or transcript text, provider IDs, private paths, request headers, or secret values.

## Repository validation

- `npm run check:workspace`: PASS
- `npm run lint`: PASS
- `npm run typecheck`: PASS
- `npm run build`: PASS; includes `/api/mobile/voice-setup`
- `npm run mobile:test`: PASS — 24 files / 249 tests
- `npm run mobile:lint`: PASS
- `npm run mobile:typecheck`: PASS
- Focused fresh-user BFF, route, safe-copy, and cached-CTA tests: PASS — 27 tests
- `npm run voice:style-smoke`: PASS; cache identity and provider mapper boundaries remain unchanged
- `npm run check:mobile-release:self-test`: PASS
- Strict-production mock attempt: expected `FAIL_CLOSED` for all four mock provider selections.
- Strict-production role-lock preflight with non-secret temporary mode/model values: PASS for ElevenLabs voice, OpenAI transcription, Azure pronunciation, and OpenAI script generation.
- `npm run check:mobile-release:staging`: expected `FAIL_CLOSED` in this uncommitted worktree for stale build provenance / dirty source.
- `npm run mobile:build:staging`: expected `FAIL_CLOSED` because the approved Staging public auth-target fingerprint is not available to this checkout. No substitute target, deployment, or bundle was created.

## Deferred and unknown

- Actual-device fresh-user setup, live clone, cache replay, and provider-unavailable evidence are not claimed by this repository change.
- Cross-instance provider-create idempotency would require a durable database/RPC contract. It is not introduced because Gate 4 forbids migrations; the current implementation prevents normal retry/double-tap duplication through canonical rechecks and in-runtime coalescing.
- ElevenLabs provider voice cleanup/deletion remains Gate 5 work. No live destructive deletion was attempted.
- Final environment/provider credential readiness and production deployment state remain Human-owned.

## Severity

- `P0 = 0` from repository review and targeted verification.
- `P1 = 0` from repository review and targeted verification.
- `P2`: the actual-device evidence listed above is still pending; durable cross-instance clone idempotency is intentionally outside the migration-free Gate 4 change.
