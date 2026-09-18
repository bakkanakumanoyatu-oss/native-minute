# Listen playback controls and return UX — 2026-09-17

MODE: `QSS_LISTEN_PLAYBACK_CONTROLS_AND_RETURN_UX_V1`

**LOCAL IMPLEMENTED / DEVICE ACCEPTANCE PENDING.** P1/P2/P3/J/Gate5 remain CLOSED; formal acceptance remains PAUSED. No Staging mutation, deployment, native sync/build/install, provider call, commit or push in this task.

## Previous generation failure: fresh read-only evidence

Developer root / `codex/g3-mobile-main-loop`; HEAD/upstream/remote matched `910bfa46f63783966c50242b3ac6067dd4ce3f6b`. Initial tracked WIP was `docs/current-state.md` and `types/database.ts`; existing untracked 0032, recovery tests/reports/evidence and QA artifacts were preserved. Protected backup files and `supabase/.temp` contents were not read or changed.

Used the existing Supabase CLI credential path and fixed Staging project `ztlliqishddrrvqqrrlu` Management **database/query/read-only** endpoint. Only SELECTs; no application Listen requests, reservations, provider calls, Storage downloads/deletes, or recovery RPCs. One invalid SELECT projection was corrected before the successful reads; no mutation endpoint was used.

- Old 18:13 intent remains `failed_after_provider`, `provider_effect=occurred`, `storage_outcome=failed`, `orphan_possible=true`; recovery time unchanged. Physical orphan cleanup remains outstanding.
- New intent created **19:52:54 JST**, completed **19:53:01**. Same script / voice / cache tuple as the original attempt. Owner unresolved intents **0**.
- Exactly one canonical audio for that tuple, created **19:53:01**; owned script and voice, current default voice, stored-asset metadata and corresponding Storage catalog row present. No physical-object absence or cleanup claim.
- Target generation event **19:52:54 → 19:53:03**, `succeeded`, `cached=false`, provider request reference present, target matches canonical audio.
- **19:56:00** event is `cache_hit`, `cached=true`, same canonical audio, no provider request reference. This provides server cache evidence separate from Human's playback statement.
- Global generation-event ledger **13 → 15** since deployment: one successful generation event plus one cache-hit event; it does **not** mean two provider generations. At both **20:08** and **20:18** observations the count was 15 and the target's latest event was the cache hit. No subsequent target generation event was recorded through those observations. This is bounded ledger evidence, not a claim about unobserved future actions or all provider-side activity.
- Human confirmed real reference playback on the same iPhone 14 Plus; screenshot time **19:56**. Human pause/resume, output-route clarity, exact re-entry sequence and zero additional generation were not independently asserted. Those device assertions remain pending.

[First safe observation](../../outputs/qss-listen-playback-return/staging-readonly.json) / [second observation](../../outputs/qss-listen-playback-return/staging-readonly-after.json). No raw owner/script/audio IDs, content, audio bytes, tokens or private URLs in these artifacts. 0032 was not reapplied, recovery was not repeated and writer deployment `dpl_GFTxhyxGxhCf34wQwMmAQ58TiKhd` was not changed.

## Local behavior

- Listen dock: **10秒戻る / 再生・一時停止 / 10秒進む / 再生速度**. Values reuse Web's single definition: **0.75 / 0.85 / 1.00 / 1.15x** (default 1.00). Web retains its existing descriptions and exports; mobile shows the numeric value in a native select for compact, scalable labels.
- One stable audio element supplies actual duration/time/play/pause state. Seeks clamp to measured endpoints and never start playback while paused. Seek/rate changes do not request, generate or rewrite audio. Playing from the end restarts at zero.
- Document hidden and native inactive both stop media, detach `src` and revoke the object URL. Duplicate lifecycle notifications do not overwrite the saved position with zero. Foreground alone neither fetches nor plays.
- Within this mounted session/script, return within **15 minutes** retains audio ID, media position and speed in memory only. **再生** downloads the exact saved audio via the existing authenticated GET (including existing credential refresh) and then plays. No separate reprepare step. A longer absence discards position/speed at the next play; it still fetches the saved audio ID without generation.
- Route exit/unmount, session/owner API replacement or script change discard the bookmark and old media. Auth refresh with the same owner preserves the existing scope. Terminal 401/403/404 after saved-audio retrieval clears the bookmark and asks the user to select the script again; it cannot fall through to generation. Network/timeout/server/decode failures offer a manual saved-audio retry. Play-policy rejection offers play again without another download.
- Generation-capable `requestListen` is reached only by explicit initial preparation. A request generation counter, single pending download and play latch reject stale responses and duplicate operations. When backgrounding interrupts a pending fetch, the loading UI remains until it settles; quick return does not expose a play button that silently ignores the tap.
- No new schema, API, permission, provider, retention contract, persistent audio cache or background playback capability. Existing owner checks, authenticated replay, save atomicity and canonical server data remain unchanged.

## Changed files and verification

Product changes:
- `apps/mobile/src/screens/ListenScreen.tsx`: controls and session-scoped lifecycle/replay.
- `apps/mobile/src/styles.css`: Listen-only transport/selector sizing and existing focus outline applied to select. Existing paper/typography, script scroll, safe-area padding and dock structure retained.
- `lib/audio-playback-rate.ts` + `components/audio/playback-rate-control.tsx`: extract/re-export the existing options, without changing Web behavior.

Tests:
- `apps/mobile/tests/listen-playback-controls.test.ts` + `listen-playback-harness.{html,tsx}` + `listen-lifecycle-fixture.ts`: real component and synthetic WAV in Chromium/WebKit, mock API/native notifications. External HTTP blocked. **46 browser cases PASS**, including 320/428px × 100/200% text at 850px viewport, final-line scroll, visible controls, accessible names and at least 44px targets. Screenshots visually reviewed. These are not iPhone/VoiceOver/Dynamic Type PASS results.
- `apps/mobile/src/practice/api.test.ts`: pending Listen downloads across sign-out/owner switch and one expired-credential refresh repeating only the exact authenticated GET.
- `apps/mobile/src/screens/screens.test.tsx`: changed preparation-button expectations.
- `apps/mobile/tests/voice-upload-durable-intent.test.ts`: **existing WIP compatibility only** — five null recovery fields added to its completed-intent fixture to match the already modified 0032 database type. No upload behavior or recovery implementation changed.

Final checks: workspace guard; root lint/build/post-build typecheck; mobile lint/source+test typecheck/bundle build; **99 scoped tests + 46 browser cases = 145 PASS**; diff check. Browser command: `npm run test --workspace @native-minute/mobile -- tests/listen-playback-controls.test.ts --testTimeout=12000`. Bundle build uses `local-spike`; no native/Xcode artifact or installation is claimed. Full E2E, full 58, P3 A–K, real provider, real device, VoiceOver, actual Dynamic Type, Bluetooth and physical safe-area checks were **not run**.

Focused self-review: final diff only; checked generation call sites, stale async callbacks, unmount cleanup, owner/session boundaries, pending-fetch UI, EOF behavior, error recovery and shared-option compatibility. No remaining blocking finding in this scope; no independent-agent review claimed. No new env vars/migrations/dependencies; README setup instructions remain applicable. Existing 0032/types/recovery evidence WIP remains separate; current-state and mapping only receive this task's append/pointer.

## Acceptance mapping and next Human sequence

Original **58 IDs are retained**; no unrelated PASS, PS criteria or P3 A–K status reset.

- **L-08**: original output switching/no-double-play purpose retained. Changed expectation: on short same-session return, one play may fetch saved audio and resume; separate reprepare is no longer the normal action.
- **L-09**: background still stops/releases. Changed expectation: foreground does not auto-play; one play restores position/rate within 15 minutes through saved-audio GET.
- **L-01/02/03/04/05/07/10, DT-L-01, VO-NAV-01, VP-01**: purposes retained; directly affected observations remain for Human. Old successful playback is partial evidence, not full pause/resume or new-build acceptance.
- **Additional requirements, outside the original 58 count**: ±10 seconds including paused endpoints; four speeds without regeneration; saved identity/time/rate retention; single-play authenticated reacquisition; no generation fallback; stale-response/multiple-fetch protection; logout/owner/deletion/expiration invalidation. Locally covered above; device checks pending.

A future authorized **Staging mobile bundle sync + signed native rebuild/install is required** to put this local UI into the installed iPhone app. No native plugin/entitlement change, BFF deployment or migration is required. This task stops at local implementation/verification.

After that update: same iPhone/account/script → prepare existing reference once → play, pause, ±10 seconds (including paused start/end), choose 0.85x → while playing switch to another app and return within a minute → verify silence until one play, then resume near prior time at 0.85x → enlarge text and enable VoiceOver, read final line and operate the four controls → continue to Record without recording. Record the time of this sequence; correlate the saved-audio GET / generation ledger separately. Do not rerun P3/Share/Files or create new voice/script/provider data for this check.
