# Gate 3 Mobile Main Loop Final Result

## Decision

`G3_MOBILE_MAIN_LOOP = CLOSED_COMMITTED_PASS`

This result closes the Mobile actual-device canonical learning-loop gate only. It does not approve the current Mobile product shell as final UX, close the historical Store-release Gate 3 provider-readiness `WARN`, or start Gate 4.

## Provenance

- Runtime source: `b93ea20d9e04486bf9f7cbe614f78fb8edf35d67`
- Runtime branch at proof time: `feature/mobile-auth-gate`
- Implementation branch before this docs-only closeout: `codex/g3-mobile-main-loop` at the same source SHA
- Fixed staging origin: `https://native-minute-staging.vercel.app`
- Staging deployment: `dpl_3VwSqKyGmUtsr4QMkMBmd2FgZbkh`, `READY`
- Production remained isolated at deployment `dpl_7FzKMVfgKdYjGWqPpJoFrpbFgruG`, source `b0e61c0504ad3be31e2eaa4c8cfdaaafbffb280c` on `main`
- Actual-device provenance: Human-observed iPhone 14 Plus / iOS 26.2.1 behavior, reconciled with privacy-safe staging logs, read-only canonical DB state, and current repo contracts
- Provider policy at proof time: ElevenLabs voice/TTS, OpenAI transcription, and Azure pronunciation evaluation were present on staging; secret values were not read or recorded

The closeout commit is documentation-only. It is not promoted to the fixed staging runtime branch because the proven runtime remains the exact source SHA above.

## Actual-device learning-loop result

The following canonical loop was established on the actual device:

`owned script -> listen -> record -> upload -> OpenAI transcription -> Azure pronunciation -> persisted review -> canonical progress -> subsequent Takes`

### Listen and ElevenLabs

- A Human-authorized staging voice fixture completed the existing Web consent/setup path using the Human's own newly recorded sample.
- The usable default voice and valid consent were present after setup, and Mobile reference playback sounded like the Human's clone voice.
- The tested script/voice/style produced one canonical `script_audios` row.
- The first Listen was a cache miss and caused exactly one ElevenLabs synthesis call.
- Later Listen requests were cache hits and reused the same persisted audio; no additional synthesis occurred.
- Backgrounding stopped playback, unloaded the local audio element, revoked the local object URL, and reset the local Listen state. Returning to “お手本を準備” reflects local cleanup, not deletion of server cache or provider regeneration.

### Recording and audio

- Microphone capture succeeded for an approximately 57-second recording.
- The normalized upload was mono, 16-bit, 16 kHz PCM WAV.
- Preview playback was audible and the Human confirmed it contained their own recorded voice.
- The bounded remediation checks track existence/live/enabled/muted/ended state, classifies PCM as `SIGNAL_PRESENT`, `LOW_SIGNAL`, or `DIGITAL_SILENCE`, blocks conservative digital silence, and requires preview confirmation before evaluation.
- The pre-remediation silent-audio root cause was not identified: `ORIGINAL_ROOT_CAUSE = UNKNOWN`. What is proven is that the remediated current path works on the target device.

### Transcription, evaluation, and review

- Three intentional Human recordings completed upload, non-empty OpenAI transcription, Azure pronunciation evaluation, and persisted canonical review.
- The first observed review showed Overall 88, Accuracy 94, Fluency 89, and Rhythm 81.
- A later review around 13:56 JST showed Overall 88, Accuracy 94, Fluency 88, and Rhythm 81.
- Both observations included evaluation, weak-word or priority feedback, Japanese coach, and next step. Transcript, coach, and weak-word text are intentionally not recorded here.
- Review reads the persisted canonical result; Mobile does not independently calculate score, coach, weak words, latest, or best.

### Progress and multiple Takes

- Canonical DB state contained three reviewed Takes for the proof script, matching three distinct, intentional Human submissions and timestamps.
- The three rows had distinct recording identities and durations of approximately 48, 51, and 57 seconds.
- Progress showed reviewed Takes = 3, Latest = 88, and Best = 88.
- Server progress filters to reviewed Takes, orders history newest first, and chooses Best by score with the canonical review/creation identity tie-break. The observed Latest/Best result is consistent with that rule.
- No unexpected duplicate or incomplete failed pre-remediation attempt appeared in reviewed progress.

### Offline, recovery, and auth close sanity

- With Airplane Mode on and Wi-Fi off, Scripts and Progress remained rendered with a safe offline banner and retry controls. There was no crash or unexpected logout.
- Privacy-safe staging logs after reconnection showed Mobile health `200`, Progress preflight `204`, and Progress GET `200` at approximately 14:03 JST. `NETWORK_RECOVERY = PASS_CANONICAL_PROGRESS`.
- Normal logout rendered `/LOGIN`; terminate/relaunch remained logged out with no unexpected session restore.

## Provider-call reconciliation

Counts are limited to the correlated Gate 3 proof window and separate provider generation from cache replay and intentional Takes.

| Provider operation | Safe reconciled count/result |
| --- | --- |
| ElevenLabs voice creation | 2 correlated calls: 1 failed before provider voice creation because the staging value was a key identifier rather than a secret credential; 1 later success after staging-only secret replacement and same-source redeploy |
| ElevenLabs synthesis | 1 successful synthesis; later Listen requests were cache hits with 0 additional synthesis |
| OpenAI transcription | 3 successful calls for 3 intentional Human Takes |
| Azure pronunciation evaluation | 3 successful evaluations for the same 3 intentional Human Takes |

The failed voice-create attempt left no provider orphan voice. Consent/sample persistence from setup remained valid, and no cleanup mutation was required.

## Canonical data reconciliation

Read-only state was consistent with the actual-device observations:

- valid ElevenLabs consent: 1
- usable ElevenLabs voice: 1, proven usable as the selected default by successful Listen
- cached script audio for the tested script/voice/style: 1
- reviewed Takes: 3, all intentional and distinct
- coach feedback rows: 3
- weak-word rows existed for the reviewed Takes; text was not read into this result
- no pending/incomplete Take was included in canonical Progress

The staging voice fixture is intentional proof data, not an active temporary override. No temporary source, build, provider, or deployment state requires cleanup.

## Planning-assumption correction

Gate 3 originally assumed the staging test user already had a default ElevenLabs voice. Live staging instead showed `voices = 0` and `voice_consents = 0`. The Human-authorized `TEST_FIXTURE_ONLY` setup was therefore required.

The first setup attempt persisted consent/sample state but failed provider voice creation because `ELEVENLABS_API_KEY` contained an identifier rather than a secret credential. After a valid secret was configured only on staging and the same source SHA was redeployed, setup succeeded. This is classified as a `TEST_ENVIRONMENT / CREDENTIAL PREREQUISITE ISSUE`, not a Gate 3 learning-loop architecture defect, and it does not prove Gate 4 fresh-user Mobile voice onboarding.

## Validation and Web regression boundary

Final source validation at `b93ea20d9e04486bf9f7cbe614f78fb8edf35d67` passed:

- `npm run check:workspace`
- `npm run mobile:test` — 23 files / 239 tests
- `npm run typecheck`
- `npm run mobile:typecheck`
- `npm run lint`
- `npm run mobile:lint`
- `npm run build`
- `npm run check:mobile-release:staging`
- `npm run check:auth-artifacts`
- `git diff --check`

The two targeted Web Playwright regressions remain `EXTERNAL_ENVIRONMENT_BLOCKED` by test Supabase hostname `ENOTFOUND`; they are not recorded as PASS. Closeability is based on the passing root/mobile validation, shared server service contracts, canonical actual-device behavior, and no observed Web semantic regression. Infrastructure debugging was not opened in this closeout.

## Residual severity and temporary scope

- `P0 = 0`
- `P1 = 0`
- `P2`:
  - Listen background cleanup returns to wording that can look like server cache was discarded, although replay remains cache-backed.
  - The conservative low-signal threshold needs broader real-device calibration.
  - A process failure can strand the current non-reclaimable pending review claim; safe token/lease reclaim requires a later atomic DB/RPC design.
  - Authenticated-owner direct table/RPC self-forging hardening remains a later RLS/grant/migration decision; the current claim is an application concurrency guard, not an adversarial security boundary.
  - Rich Web/Mobile presentation parity remains deferred.

Gate 3 does not approve the current inline script creation/template UI, Listen presentation, Review presentation, or Progress presentation as final product UX. The official 100-template library, final script-selection UX, rich Listen/Review/Progress shell, fresh-user Mobile voice setup, privacy/deletion final Mobile surfaces, phoneme coverage, Brush-up, StoreKit, and B1D2B production release work remain future gates. The current fixed-script adapter can connect to the later official template inventory because canonical script ownership and server-owned script rows remain unchanged.

## Closeout

All Gate 3 close conditions are satisfied: actual-device canonical learning semantics, Listen/provider/cache, recording/WAV, OpenAI, Azure, persisted review, canonical multi-Take progress, safe offline behavior, canonical recovery, logout/relaunch, required validation, `P0 = 0`, and `P1 = 0`.

`G3_MOBILE_MAIN_LOOP = CLOSED_COMMITTED_PASS`

Gate 3 remaining implementation effort is `0`. P2 and Gate 4+ work is explicitly deferred and must be separately planned and authorized. No later gate starts from this result.
