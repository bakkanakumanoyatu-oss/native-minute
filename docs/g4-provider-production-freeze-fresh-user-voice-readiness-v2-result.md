# G4 Provider Production Freeze and Fresh-user Voice Readiness V2

## Status

`G4_PROVIDER_PRODUCTION_FREEZE = REMEDIATED_PENDING_FINAL_READ_ONLY_AUDIT`

- Implementation checkpoint: `b6663a7b21a190779fd3d9facfd6c5efc8abaeeb`
- Actual-device proof mode: `G4_CHECKPOINT_ARTIFACT_AND_ACTUAL_DEVICE_PROOF_V1`
- Actual-device proof date: `2026-08-22` (`Asia/Tokyo`)
- Device: iPhone 14 Plus / iOS 26.2.1
- `P0 = 0`, `P1 = 0 at remediation validation`, `P2 = 2`

The historical closeout below remains intact. A subsequent final read-only audit found and reopened one Mobile cache-recovery P1; its remediation is validated but must receive an independent final read-only audit before Gate 4 can be closed again. This does not start Gate 5, approve provider deletion, or claim production identity / TestFlight readiness.

## Preflight and Gate 3 reconciliation

- Workspace: `/Users/karasawatakahiro/Developer/native-minute`
- Branch: `codex/g3-mobile-main-loop`
- The implementation checkpoint was committed with a clean worktree before artifact creation.
- Gate 3 closeout `020a93a1b0c33f8068008de84ac879dbf7637443` is an ancestor.
- Gate 3 runtime source `b93ea20d9e04486bf9f7cbe614f78fb8edf35d67` is an ancestor.
- [Gate 3 Mobile Main Loop Final Result](./g3-mobile-main-loop-final-result.md) remains canonical as `G3_MOBILE_MAIN_LOOP = CLOSED_COMMITTED_PASS`.
- Gate 3 login/logout, multiple-take latest/best/progress, offline matrix, recording-format audit, and ownership audit were not broadly rerun.

## Exact Staging artifact and runtime

- Source SHA: `b6663a7b21a190779fd3d9facfd6c5efc8abaeeb`
- Build configuration: `Staging`
- Bundle identifier: `com.nativeminutes.app.staging`
- Artifact: `/private/tmp/native-minute-g4-staging-b6663a7-TUEvkO/Build/Products/Staging-iphoneos/App.app`
- Executable SHA-256: `415ad240ae5b41b25d6005dbd0f7314c36ee4418113b000493a8a474b21ca99b`
- Mobile Staging build, iOS sync, release/auth guards, source provenance, strict codesign, provisioning/device inclusion, microphone usage description, and exact Associated Domain all passed.
- The exact artifact was update-installed and launched on the approved device. No fallback bundle was built.
- The fixed Staging BFF initially lacked the new route. The clean exact source was therefore deployed to the isolated `native-minute-staging` project as deployment `dpl_69p6PxhyhqEwnYvTQZwPxSEQqYNY`, and the fixed alias remained `native-minute-staging.vercel.app`.
- Deployment source metadata matched `b6663a7b21a190779fd3d9facfd6c5efc8abaeeb`. The separate production application project, production auth target, provider credentials, and provider resources were not changed.

## Gate 4 remaining-gap matrix

| Area | Result | Evidence disposition |
| --- | --- | --- |
| Fresh-user Mobile setup | PASS | New actual-device proof on the exact artifact. |
| ElevenLabs consent / sample / clone / default | PASS | Canonical readiness states, one consent request, one sample/create request, `ready`, and subsequent personalized Listen. |
| First reference synthesis | PASS | First post-ready request returned the cache-miss UI and one successful Listen POST. |
| Cache replay | PASS | Second identical request returned the persisted-audio reuse UI and audible replay. |
| Background return | PASS | Foreground state showed `保存済みのお手本を再準備`, not an ungenerated state. |
| Provider unavailable | `REMEDIATED_PENDING_FINAL_READ_ONLY_AUDIT` | Shared Staging kill switch was not mutated. The prior closeout's Mobile cache-first inference was invalidated, then remediated with a focused Mobile route proof for cache hit and safe cache miss behavior. |
| OpenAI transcription / Azure evaluation | PASS | One new normal Take on device; broader Gate 3 semantics reused. |
| Production mock guard | PASS | Exact artifact/release guard plus frozen strict-production provider-role evidence. |
| Safe observability | PASS | Fixed route/status/request counts and cache outcome were available without content, IDs, paths, or credentials. Detailed timing labels remain opt-in. |

## Fresh-user Voice Setup actual-device result

The Human used a fresh Staging auth account. Apple Mail Link C opened the exact Native app and reached `/SCRIPTS`; the account initially had no scripts and Voice Setup had not been started.

The canonical Mobile BFF then reported the following sequence:

`consent_required -> sample_required -> ready -> Listen`

- Explicit consent was accepted once.
- A 10–45 second voice sample was recorded once and locally played back before submission.
- The sample/create action was tapped once; the UI reached `voice ready`.
- Safe Staging logs showed Voice Setup `POST 200` twice in total: one consent step and one sample/create step. No retry or duplicate create request was made.
- `ready` is returned only after the canonical current owned/default voice is available. The subsequent personalized Listen succeeded.
- No provider ID, consent ID, private Storage path, raw provider body, sample bytes, email, token, or secret was captured in this result.

A direct administrative SQL count of `voices = 0` / `voice_consents = 0` was not available because the Staging database credential is a protected Vercel value and was not decrypted or exposed. The fresh Human account plus the authenticated canonical `consent_required` and `sample_required` states are the accepted functional zero-state evidence. This provenance limitation is not represented as a direct database observation.

## ElevenLabs synthesis, cache, and playback result

Before voice readiness, one expected Listen `POST 409` was recorded. It is not counted as a synthesis attempt.

### First request

- After `ready`, one new Listen `POST 200` occurred.
- The UI said `お手本の準備ができました。`, which is the frozen `cached: false` result.
- The generated protected audio was 29 seconds.
- The first cache-miss path maps to one ElevenLabs synthesis and persisted app-owned audio in the frozen implementation contract.

### Background return and second request

- After the audio player left transient screen state, the app showed `保存済みのお手本を再準備`.
- The button was tapped once. A second Listen `POST 200` occurred.
- The UI said `保存済みのお手本を再利用しました。`, which is the frozen `cached: true` result.
- The Human confirmed audible playback. Protected audio retrieval returned `GET 200`.
- The cache-hit branch returns before provider synthesis, so the second identical request added zero ElevenLabs synthesis calls.
- Across the proof there were exactly two successful post-ready Listen POSTs: first miss and second hit. There was no retry.

Detailed provider timing labels were disabled in this Staging runtime, so provider-internal request IDs or raw provider logs are not claimed. The evidence is the canonical server cache flag exposed as safe UI state, bounded request counts, successful protected replay, and the exact frozen cache contract.

## Provider-unavailable decision

Actual-device fault injection is `NOT_RUN_SAFE_LIMITATION`.

- The available kill switch is project-wide, not scoped to this user/session.
- Mutating and redeploying the shared fixed Staging runtime would affect unrelated Staging activity and was not required to prove the successful exact-artifact mainline.
- No provider credential was damaged, no ElevenLabs voice was deleted, no production project was changed, and no mock fallback was enabled.

The historical closeout treated Gate 4 DoD item 6 as satisfied by `REUSE_EXISTING_AUTOMATED_EVIDENCE` from this exact frozen implementation lineage, not by pretending an actual-device outage ran:

- the existing provider-unavailable recovery test shows fixed recovery without a cached audio;
- the existing cached-audio/provider-unavailable test keeps protected playback available and removes generation;
- Mobile API tests drop raw error messages/details and map provider failures to fixed safe states;
- strict production guards fail closed for mock voice, transcription, pronunciation, and script-generation providers;
- cache-first service behavior and safe Japanese recovery were not changed after those checks.

That evidence is not actual-device provider-failure evidence. The final read-only audit subsequently found that the Mobile POST path checked provider availability before its owned cache lookup, so the historical cache-first conclusion did not cover the Mobile background recovery path.

## Reopened P1 cache-recovery remediation

`G4_PROVIDER_PRODUCTION_FREEZE = REOPENED_P1_CACHE_RECOVERY` was recorded after the final read-only audit found one P1: an owned cached reference audio could not be reused by Mobile when the current voice provider was unavailable.

- `speakScript` now resolves the owned script, the owned current-provider voice, provider binding, canonical cache key, and owned cached audio before it rejects provider availability.
- Focused Mobile route proof: authenticated owner + owned script + owned current-provider voice + cached reference audio + unavailable provider returns `200` with only `{ audioId, cached: true }`; cache-hit quota recording occurs, provider construction/synthesis is `0`, and no mock fallback or provider detail is returned.
- Focused Mobile route proof: the same authenticated owned request on cache miss returns the existing safe `503 listen_unavailable`; provider construction/synthesis and mock fallback remain `0`, and the private provider detail is absent from the response.
- Focused ownership regression proof: missing/foreign script, unowned explicit voice, and wrong provider binding do not execute a cache lookup.
- The existing actual-device cache miss -> persisted audio -> background return -> cache-hit playback evidence remains valid for the normal provider-available path. No shared Staging kill switch, credential, provider voice, or external resource was changed.
- Cost/usage observability remains `PASS_WITH_LIMITATION`; this remediation adds no quota, pricing, dashboard, or usage-policy behavior.
- Remediation validation passed: `npm run check:workspace`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run mobile:test` (253 tests), `npm run mobile:lint`, `npm run mobile:typecheck`, and `npm run check:mobile-release:self-test`.

The focused remediation validation has `P0 = 0`, `P1 = 0`, and `P2 = 2`. It is not a new closeout decision: the next required action is an independent final read-only audit.

## Normal evaluation regression

One normal Take was run after Listen playback:

1. local recording playback was confirmed;
2. recording persistence returned `POST 201` once;
3. evaluation returned `POST 201` once;
4. persisted Review retrieval returned `GET 200` once.

The Human confirmed that the Review displayed all four required categories without sharing their contents: transcription, pronunciation score, weak-word/none state, and Japanese coaching. This is the new OpenAI transcription -> Azure Pronunciation Assessment -> persisted Review regression proof. Gate 3 remains the reused evidence for multiple Take, latest/best, full Progress, offline/reconnect, and logout/relaunch semantics.

## Auth delivery prerequisite observation

Yahoo Mail Links A and B opened the browser fallback. They were not retried. Secret-free query-free and query-bearing Notes probes both opened the exact app, the origin and Apple CDN AASA matched the exact app/path contract, and Apple Mail Link C opened the app and reached `/SCRIPTS`.

This isolates the observed failure to the Yahoo Mail link-opening context rather than the query, Associated Domain, AASA path, native callback implementation, or Gate 4 route. The exact client-internal reason remains unknown. Gate 3 auth was not broadly re-audited or reimplemented.

## Repository validation

- `npm run check:workspace`: PASS
- `npm run lint`: PASS
- `npm run typecheck`: PASS
- `npm run build`: PASS
- `npm run mobile:test`: PASS
- `npm run mobile:lint`: PASS
- `npm run mobile:typecheck`: PASS
- `npm run check:mobile-release:self-test`: PASS
- `git diff --check`: PASS
- Exact Staging build/sync/release/auth/signing checks: PASS before device installation.
- Focused fresh-user BFF/route/copy/cache tests, voice style/cache boundary smoke, provider-unavailable recovery tests, and strict-production role/mock checks: `REUSE_EXISTING_EVIDENCE` from implementation checkpoint validation.

## Severity and remaining unknowns

- `P0 = 0`
- `P1 = 0 at remediation validation`
- `P2-1`: Yahoo Mail opened two fresh links in browser fallback while Apple Mail and direct probes opened the app. The Yahoo client-internal reason remains unknown.
- `P2-2`: cross-instance clone idempotency would require a durable database/RPC contract and remains outside this migration-free Gate 4. Canonical rechecks and in-runtime coalescing cover normal retry/double tap.
- A direct administrative numeric query of the fresh account's initial voice/consent rows was not performed; canonical authenticated readiness states are the functional evidence.
- Provider-unavailable actual-device behavior remains `NOT_RUN_SAFE_LIMITATION`; the DoD decision uses the explicit automated evidence above.
- Detailed provider timing was disabled in the exact Staging runtime; safe cache outcome and request counts were still observed.
- ElevenLabs provider-resource deletion and account deletion remain Gate 5 Human-authorized work. No destructive proof was run.

## Historical closeout decision

`G4_PROVIDER_PRODUCTION_FREEZE = CLOSED_COMMITTED_PASS`

This was the historical closeout decision at commit `7b24e41af8b55eac5bc96058aff8ed3c920cc86b`; it was reopened by the later final read-only audit's Mobile cache-recovery P1.

## Current remediation decision

`G4_PROVIDER_PRODUCTION_FREEZE = REMEDIATED_PENDING_FINAL_READ_ONLY_AUDIT`

The P1 remediation validation is complete with `P0 = 0`, `P1 = 0`, and `P2 = 2`. Gate 5 must not start automatically; an independent final read-only audit is the next action.
