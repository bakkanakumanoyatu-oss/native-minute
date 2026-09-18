# Listen / saved voice readiness blocker — 2026-09-17

MODE: `QSS_LISTEN_VOICE_READINESS_INCONSISTENCY_BLOCKER_FIX`

Verdict: **CAUSE_IDENTIFIED / EXISTING_FIX_CANDIDATE_VALIDATED / STAGING_RECOVERY_PENDING**. This is not a deployed fix or Human PASS. Formal 58 acceptance remains paused. P1/P2/P3/J/Gate5 remain CLOSED; Home, navigation, colors, fonts, Share, retention and Bearer contracts are unchanged.

## Preflight and original IDs

- Root `/Users/karasawatakahiro/Developer/native-minute`; branch `codex/g3-mobile-main-loop`; HEAD/upstream/remote all `910bfa46f63783966c50242b3ac6067dd4ce3f6b`.
- Initial tracked WIP: `docs/current-state.md`; 419 untracked entries, including the acceptance mapping and existing protected env backup / QA artifacts. Index empty. Existing WIP preserved.
- Read the original checklist, mapping and P1/P2/P3 checkpoints. The installed mobile source correspondence is documented in the existing mapping; it does **not** mean the BFF runs all of HEAD.
- Original **L-04** (play/pause/resume) and **L-07** (speaker playback) are **BLOCKED at reference-audio preparation**; **L-05** (media time) shares that missing prerequisite. Their playback assertions were not executed, so do not invent playback FAIL or PASS. L-02 includes the preparation button operation, but its original purpose is dock access; this report does not reinterpret that purpose as synthesis correctness. No new acceptance ID is created.
- The mapping's 1/0/2/55 counts remain the historical planning snapshot, not a post-finding execution tally. This finding adds no PASS and does not classify unobserved items. No A–K or full-58 rerun.

## Cause and evidence

The deployed BFF uses the authenticated request client to upload synthesized bytes to `script-audios`, while Staging Storage now permits authenticated SELECT only. The existing server-owned Storage writer fix from `26a8b3db85dd62322eaea16997746ecae82fb4d1` is in HEAD but absent from the deployed BFF. This is a deployment/source compatibility defect, not evidence that the saved voice needs registration again.

Read-only observations on canonical Staging (`ztlliqishddrrvqqrrlu`; Vercel project `prj_RSxUzxugEIlH28tiQOyndjP365hw`, deployment `dpl_DFFwoCYpuF8UbdeSe8ArTHJzCiBe`):

| Observation | Evidence |
| --- | --- |
| Human-time Listen request | 18:13:34.986 JST, POST Listen -> HTTP 500 |
| Persisted generation event | Attempt 18:13:38.333, completed 18:13:46.022; ElevenLabs; cache miss; provider response reference present; `failed / storage_staging / script_audio_storage_staging_failed` |
| Retry | 18:14:35.299, POST Listen -> 409; no second generation attempt in the inspected 18:10–18:20 window |
| Setup | Voice setup GET -> 200 at 18:14:05, 18:14:20, 18:14:41, 18:14:56, 18:15:13, 18:15:17 |
| Identity | The one corresponding script-audio write intent references the same current default voice; script owner, voice owner and ElevenLabs provider match |
| Stored result | Exact intended Storage catalog object absent; exact script/voice/cache row absent |
| Remaining state | That intent remains `reserved`; lease expired at observation. The reservation guard checks unresolved status, not just lease expiry |
| Storage authority | All four `storage.objects` policies are authenticated SELECT; no INSERT/UPDATE policy. No policy changes made |
| Source correspondence | All 658 prior deployment source files match their saved manifest; both affected service preimages exactly match the parent of existing fix `26a8b3d` |

The request log has no application log entries, so this is not a claim that a raw per-request RLS rejection message was captured. The persisted failure stage, actual policy catalog and exact deployed upload client establish the incompatible write authority. Exact physical Storage `info()` absence and a manual writer-recovery authority have not been established by the catalog-only check.

Safe request evidence: [request-evidence.json](../../outputs/qss-listen-voice-readiness/request-evidence.json). No tokens, raw IDs, private content or audio copied into evidence. No provider calls or live writes were made by this investigation.

## Source trace

| Path | Behavior |
| --- | --- |
| Settings / VoiceSetupScreen | Both call `PracticeApi.getVoiceSetup()` and render BFF `status=ready` |
| Mobile setup route | Bearer owner validation -> `getVoiceSetupState`; provider supported + `defaultVoice` means ready |
| Voice selection | `listVoices`: owner + current provider, `is_default DESC, created_at DESC`; setup selects `voices[0]`, Listen's `getDefaultVoice` does the same |
| Listen initial load | Loads owned script; it does not accept a client-provided voice ID or trust a locally retained ready flag |
| Prepare button | `requestListen(scriptId)` -> POST `/api/mobile/scripts/:id/listen`; only success triggers protected script-audio GET |
| Synthesis service | Re-fetch owned script/default voice -> canonical cache key -> cache lookup -> writer reservation -> ElevenLabs synthesis |
| Deployed storage stage | Passes authenticated `client` to `stageScriptAudioForReplay`; upload is rejected by current Storage authority before cache finalization |
| Current HEAD storage stage | After ownership checks/reservation, injects server-owned client into the Storage writer; owned replay reads remain authenticated |
| Error mapping | AppError 500 -> `listen_unavailable` -> mobile generic message. Subsequent reservation conflict 409 is mapped to `voice_setup_required`, although this does not prove a missing voice |

Ready confirms a saved current-provider voice and supported local configuration. It does not call synthesis, prove provider-side voice availability or test Storage writes. No setup redesign or speculative readiness/provider change is warranted by this finding.

## Prepared minimal correction

No new product-source change is needed in HEAD. The exact existing two-file fix is prepared as [staging-listen-writer.patch](../../outputs/qss-listen-voice-readiness/staging-listen-writer.patch):

- `services/voice/voice.service.ts`: reuse the server client for reservation and synthesized audio Storage upload after owned data validation.
- `services/voice/replay.service.ts`: explicit Storage client injection and existing exact-byte duplicate reconciliation.

Candidate `/tmp/qss-listen-writer-staging-candidate` reconstructs the verified prior BFF and applies only those two files. [Candidate manifest](../../outputs/qss-listen-voice-readiness/candidate-manifest.json) records baseline and resulting hashes. It excludes unrelated later consent/retention work. DB schema, ownership guards, cache identity, provider settings, mobile UI and BFF response contracts are unchanged. **Candidate not deployed.**

## Validation

- `npm run check:workspace`: PASS.
- HEAD existing scoped tests: **48/48**, 5 files (`voice-server-owned-script-audio-writer`, `script-audio-server-storage-writer`, `main-loop-routes`, `voice-setup-route`, `listen-cache-provider-order`). No live provider calls.
- Exact two-file candidate: existing server-writer and Storage tests **5/5 PASS** using candidate source aliases.
- Root `npm run lint` and `npm run typecheck`: PASS.
- Candidate `npm run build`: PASS, including Next lint/type validation. Only existing Browserslist age/cache warnings.
- Root build and native/mobile build/install not run: no root product or mobile input changed. No expanded E2E, physical-device replay, or full acceptance executed.

## Remaining recovery and build/install

A Staging-only BFF build/deploy is needed; native rebuild/install and migration are not needed. Do not deploy the whole current HEAD over the deliberately scoped BFF. Re-check the active deployment identity before applying the prepared two-file patch and preserve existing Staging environment values.

**Deployment alone cannot unblock the affected owner.** The failed attempt's reserved write intent blocks future generation even after lease expiry. Do not delete/update that row directly, relax the writer guard, or call `cancel_voice_asset_write_intent(..., p_known_no_side_effect=true)` on an unproven assertion. Its source contract in migration0019 requires `writer cancellation requires known no side effect`; migration0030 preserves that contract. Here a provider call happened, and catalog absence alone is not a complete recovery proof. The current diagnostic task does not establish a safe terminalization for this intent. This is a recovery limitation, not a reopening of Gate5 or a request to recreate the voice.

NEXT_ONE_ACTION: **Reconcile only the 18:13 script-audio write intent under the existing recovery contract and establish its permitted terminal action.** Keep the two-file deploy candidate ready; do not ask Human to retry into the unresolved reservation. Do not broaden to retention, account/voice deletion, provider deletion or unrelated users.

After that recovery and the scoped BFF deployment are complete, Human's shortest direct regression is: same Staging app/account/script -> prepare once -> hear the reference on speaker -> pause/resume -> check media time -> leave/reopen the same Listen and prepare once to confirm cache replay. Correlate the latter with `cached=true`/cache-hit evidence, not appearance alone. This covers the blocked L-04/L-05/L-07 observations without a new recording/evaluation or full acceptance run. Do not use Record-skip as PASS.

## Files/status

Added this report and the three safe evidence/patch artifacts. Added a short pointer in existing mapping and current-state docs; preserved their existing content/WIP. Product source, DB, provider configuration, native app and Staging deployment unchanged. Stage/commit/push = **0/0/0**; Production operations = **0**. Human recheck has not happened.
