# Gate1c Quota / Cost Guard Decision

Gate1c は、Native Minute v1 を無料公開する前に paid provider / Storage の cost explosion を避けるための最小方針です。DB schema、billing、usage dashboard、本格 quota enforcement はまだ追加しません。

## Provider Roles

- ElevenLabs: voice clone / model audio generation。
- OpenAI: transcription / Script Studio generation / coaching-adjacent generation。
- Azure: pronunciation evaluator。
- Supabase: Auth / DB / private Storage / protected replay。

## Cost Surface

| Surface | Paid action | Existing mitigation | Remaining risk |
| --- | --- | --- | --- |
| OpenAI transcription | `record -> evaluate` で録音を文字起こしする。 | upload size limit、empty transcript safe error、provider env guard。 | 繰り返し evaluate / retry による累積 cost。 |
| OpenAI Script Studio | `/api/script-studio/generate` で draft を生成する。 | provider guard、quota event logging、raw seed / generated full text を metadata に保存しない。 | public user が何度も draft generation できる。 |
| OpenAI coaching-adjacent | current v1 では review coach は persisted helper 境界で、OpenAI coaching provider としては未分離。 | production provider policy では OpenAI の役割を transcription / script generation に限定。 | v1.1 以降で live coaching を入れる場合の cost guard が必要。 |
| Azure pronunciation evaluator | transcription 後に pronunciation assessment を実行する。 | provider guard、PCM WAV validation、env missing / cancellation safe error。 | 長時間録音や repeated evaluate の累積 cost。 |
| ElevenLabs voice clone | `/setup/voice` で sample から clone voice を作る。 | provider guard、sample size limit、failure copy。 | clone voice 作成の連打、provider billing / rate limit。 |
| ElevenLabs model audio | `/listen` の cache miss / regeneration で TTS を実行する。 | `script_audios` cache reuse、cache hit は non-billable quota event。 | style / script / voice を変えた cache miss の累積 cost。 |
| Supabase Storage upload | recordings / script-audios / voice-samples / voice-consents を保存する。 | file size limit、private buckets、protected replay。 | repeated upload、Storage egress / retention。 |
| Supabase Storage replay | protected replay route で audio を download する。 | server-side ownership check、private buckets。 | replay/download egress。 |

## Current Guards

- `npm run production:preflight` は strict production で provider を `VOICE_PROVIDER=elevenlabs`、`TRANSCRIPTION_PROVIDER=openai`、`PRONUNCIATION_PROVIDER=azure`、`SCRIPT_GENERATION_PROVIDER=openai` に固定する。
- production runtime guard は mock provider と E2E/test helper を止める。
- upload routes は supported content type と max bytes を validate する。
- `script_audios` cache key は provider / voice row / script locale+content / style を含み、cache hit は provider TTS を呼ばない。
- `quota_events` は text generation と voice generation を non-blocking に記録するが、enforcement はしない。
- `voice_quota_events` は別 table ではなく、`quota_events` の voice extension として扱う。
- provider failure は raw provider response / secret を user-facing に出さない。

## Adopted v1 Policy

1. Web production は `private_beta` または `small_cohort` から始める。
2. `public_free` は DB-backed quota enforcement なしでは production preflight で blocked にする。
3. Provider-specific emergency kill switch を用意する。
   - `NATIVE_MINUTE_DISABLE_OPENAI=1`
   - `NATIVE_MINUTE_DISABLE_AZURE=1`
   - `NATIVE_MINUTE_DISABLE_ELEVENLABS=1`
   - `NATIVE_MINUTE_DISABLE_STORAGE_UPLOADS=1`
4. Kill switch は user-facing に短い safe error を返し、secret / raw env / raw provider detail は返さない。
5. Manual budget monitoring を Web production 前の運用 blocker として残す。
6. quota_events は v1 では audit log とし、hard enforcement は v1.1 以降または public_free 前の必須作業に回す。

## Web Production MUST

- `NATIVE_MINUTE_LAUNCH_MODE=private_beta` または `small_cohort` を production env に設定する。
- `npm run production:preflight` を deploy 前に実行し、mock provider / E2E env / public_free launch を blocked にする。
- Provider budget / quota / billing alert を OpenAI / Azure / ElevenLabs dashboard 側で人間が設定する。
- Cost kill switch の運用手順を on-call / support 手順に含める。
- Gate1b の production Supabase spot-check proof を完了する。

## Store Submission SHOULD

- Public deletion / support / privacy policy と provider data processing の説明を整える。
- Store review 用に、small cohort での real provider budget と failure rate を確認する。
- Mobile Safari / Android Chrome / Capacitor WebView で upload / replay / provider failure copy を確認する。

## v1.1 CAN WAIT

- Per-user / per-day hard quota。
- Global daily usage dashboard。
- Billing / paid plan。
- Admin usage console。
- Automatic provider cleanup job。

## Kill Switch Behavior

| Env | Blocks | Does not do |
| --- | --- | --- |
| `NATIVE_MINUTE_DISABLE_OPENAI=1` | OpenAI transcription and Script Studio generation. | Does not delete data or change provider config. |
| `NATIVE_MINUTE_DISABLE_AZURE=1` | Azure pronunciation assessment. | Does not affect upload or review history. |
| `NATIVE_MINUTE_DISABLE_ELEVENLABS=1` | ElevenLabs voice clone / TTS provider usage. | Does not delete existing voices or cached model audio. |
| `NATIVE_MINUTE_DISABLE_STORAGE_UPLOADS=1` | User recording / voice sample / consent recording upload routes. | Does not delete Storage objects or block protected replay. |

## Manual Ops

1. Before deploy:
   - `npm run production:preflight`
   - `npm run supabase:storage-rls:check`
2. In provider dashboards:
   - Check OpenAI usage / rate limits.
   - Check Azure Speech quota / region.
   - Check ElevenLabs plan / character or generation limits.
   - Check Supabase Storage object growth and egress.
3. If cost spikes:
   - Set the relevant `NATIVE_MINUTE_DISABLE_*` env to `1`.
   - Redeploy / restart runtime.
   - Confirm the affected surface returns safe Japanese recovery copy.
   - Keep existing review/progress data intact.

## Blockers Remaining

- No DB-backed per-user or global quota enforcement.
- No admin usage dashboard.
- No automated budget alert inside the app.
- Production Supabase / Storage / RLS human spot-check proof is still required before Web production.
