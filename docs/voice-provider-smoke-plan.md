# Voice Provider Smoke Plan

この文書は S8a の provider smoke 手順確認メモです。OpenAI / ElevenLabs などの実 provider 本接続に進む前に、repo 側で確認する前提、最小 smoke 手順、失敗時の mock fallback を固定します。

S8a 作成時点では、ここに書いた内容は live smoke 前の checklist でした。その後のユーザー実ブラウザ確認で、Native Minute から ElevenLabs の clone voice を作成し、その clone voice で `/scripts/[id]/listen` の script を読み上げるところまでは成功済みとして扱います。

## 0. Current smoke status

### ElevenLabs

実ブラウザで成功済みとして扱う項目:

- `VOICE_PROVIDER=elevenlabs` の repo-side preflight が env set 状態で通る。
- `/setup/voice` から app-owned consent と voice sample upload を経由し、ElevenLabs clone voice を作成できる。
- 作成された `voices` row の `provider_voice_id` を使って、`/scripts/[id]/listen` から ElevenLabs synthesize を実行できる。
- provider bytes は `inline-bytes` として `stageScriptAudioForReplay` に渡り、app-owned `script-audios` storage と `script_audios` row に載る。
- listen 画面では protected replay route 経由で、その clone voice の script 読み上げを再生できる。
- 同一 script / voice / style の 2 回目生成は cache reuse になり、`quota_events.status=cache_hit` / `billing_status=non_billable` として記録される。
- fresh Audio Library save row には ElevenLabs の provider / voice / `voice_style_preset` / `voice_style_label` / target speed metadata が privacy-safe に入る。
- `natural / expressive / clear / slow` は同じ script / voice に対して別 cache key / 別 `script_audios` row として成立する。
- 実ブラウザの聞き比べでは style 差はあるが微量で、style 名どおりの特徴が明確に聞き分けられるほどではない。

まだ未確認として残す項目:

- ElevenLabs 実 provider 経路で `quota_events` の `script_audio_generation_attempt=succeeded/cache_hit` は dev DB で確認済み。失敗 branch の実記録はまだ未確認。
- provider 側 verification required / entitlement / rate limit / sample reject の失敗 branch。
- cleanup 運用や provider 側 voice の削除運用。

### OpenAI

OpenAI custom voice は引き続き entitlement-sensitive です。過去の manual smoke では provider-side consent / custom voice endpoint の entitlement 不足らしい失敗に到達しており、ElevenLabs と同じ意味での clone voice -> script TTS success はまだ成功済み扱いにしません。

この文書の以降の手順は、未確認 branch や別環境で再 smoke するときの checklist として残します。DB migration、API contract 変更、cache key 変更、preset 追加、UI 大改修は行いません。

## 1. 目的

- 実 provider live smoke または再 smoke の前に、repo 側の前提条件をそろえる。
- `OpenAI / ElevenLabs / mock` の現在位置を切り分ける。
- S7 で固定した `generation style / playbackRate / cache / Audio Library metadata` の境界を壊さない。
- provider smoke 失敗時に、main loop 開発を `VOICE_PROVIDER=mock` へ戻せるようにする。
- secret / API key / provider account entitlement は docs に書かず、実値も推測しない。

## 2. 現在の provider 別状況

### mock

- 既定の provider。
- provider-side consent、sample audio、entitlement を要求しない。
- `setup/voice -> listen` の contract smoke と UI 確認に使う。
- mock provider は `voiceStylePreset` を受け取るが、音質差は出さない。style mapping の境界確認用であり、実 provider の音質確認ではない。

### ElevenLabs

- `VOICE_PROVIDER=elevenlabs` で選択する。
- 必須 env は `ELEVENLABS_API_KEY` と `SUPABASE_SERVICE_ROLE_KEY`。
- `ELEVENLABS_TTS_MODEL_ID` は任意。未設定時は repo 側で `eleven_multilingual_v2` を使う。
- app-owned `voice-samples` の sample audio を `/v1/voices/add` に渡し、返った `voice_id` を voice row に保存する。
- synthesize は `/v1/text-to-speech/:voice_id` を使い、provider bytes を `inline-bytes` として app-owned `script-audios` storage へ載せ替える。
- `providers/voice/style-mapper.ts` から `voice_settings` を受け取るため、S7 の generation style 境界を最初に確認しやすい。
- provider-side consent endpoint は current repo に持ち込まない。app 内 consent row が canonical step。
- verification required の voice は pending 保存せず fail-fast する。必要なら provider 側で verification を完了してから再試行する。

### OpenAI

- `VOICE_PROVIDER=openai` で選択する。
- 必須 env は `OPENAI_API_KEY` と `SUPABASE_SERVICE_ROLE_KEY`。
- `OPENAI_VOICE_MODEL` は任意。未設定時は repo 側で `gpt-4o-mini-tts` を使う。
- custom voice は consent name / language / consent recording / sample audio / provider consent id が必要。
- `synthesize` は OpenAI speech endpoint へ `model / input / voice / response_format` を送る最小実装がある。
- current repo では OpenAI 用の stable style knob を contract 化していないため、`voiceStylePreset` を ad hoc prompt text として混ぜない。
- 過去の manual smoke では provider-side consent / custom voice endpoint の entitlement 不足らしい失敗に到達している。OpenAI は account entitlement 確認が smoke の主要 stop point になる。

## 3. 先に smoke する候補

現 repo 状態だけを根拠にすると、最初の実 provider live smoke は ElevenLabs が自然です。

- ElevenLabs は `natural / expressive / clear / slow` を `voice_settings` に変換する mapper 境界がすでにある。
- ElevenLabs は app-owned consent step のまま進められ、provider-side consent endpoint を追加で通さない。
- ElevenLabs の必要 flow は `sample upload -> voice clone -> synthesize -> protected replay` に寄せられる。
- OpenAI custom voice は consent recording / provider-side consent / sample upload / entitlement が絡み、repo 実装より provider account 状態に左右されやすい。
- OpenAI は style knob を current repo contract に持たないので、S7 の provider-specific mapping smoke としては ElevenLabs の方が確認点が明確。

ただし、これは repo 側の smoke 順の推奨であり、外部アカウントの利用可否や費用条件は推測しません。OpenAI の entitlement が確実にある場合でも、`npm run voice:style-smoke` と `npm run voice:preflight` を通してから live smoke に進みます。

## 4. 共通 preflight

実 provider live smoke または再 smoke の前に、必ず次を確認します。

1. `.env.local` で `VOICE_PROVIDER=mock` に戻せる状態にしておく。
2. `npm run voice:style-smoke` を実行する。
3. 対象 provider の env を設定したうえで `npm run voice:preflight` を実行する。
4. `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`NEXT_PUBLIC_APP_URL`、`SUPABASE_SERVICE_ROLE_KEY` が揃っていることを確認する。
5. app-owned storage flow の前提を確認する。
   - `voice-consents`
   - `voice-samples`
   - `script-audios`
6. `/setup/voice` と `/scripts/[id]/listen` は、現在の `VOICE_PROVIDER` に一致する consent / default voice / script audio だけを見ることを前提にする。
7. secret / API key / service role key の値は docs、logs、UI、チャットに貼らない。

`npm run voice:style-smoke` は provider API を呼びません。style mapping、cache key、Audio Library metadata、playbackRate separation の静的な境界確認だけを行います。

## 5. ElevenLabs live smoke 手順

実施者が secret を入力できる環境でのみ行います。初回の clone voice 作成と script TTS はユーザー実ブラウザで成功済みですが、別環境での再確認や cache/style/metadata/失敗 branch 確認ではこの手順を使います。

1. `.env.local` に provider を設定する。
   - `VOICE_PROVIDER=elevenlabs`
   - `ELEVENLABS_API_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ELEVENLABS_TTS_MODEL_ID` は必要な場合だけ設定する。
2. dev server を再起動する。
3. `npm run voice:style-smoke` を実行する。
4. `npm run voice:preflight` を実行する。
5. login して `/setup/voice` を開く。
6. Provider readiness で `ElevenLabs`、sample audio、TTS model、verification pending の説明を確認する。
7. app 内 consent を通す。
8. voice sample を upload する。
9. voice clone を 1 回だけ試す。
10. verification required / voice clone reject / permission error が出た場合は stop し、provider 側の状態を確認する。
11. voice clone が通った場合、既存 script の `/scripts/[id]/listen` を開く。
12. `natural` で見本音声を 1 回生成する。
13. protected replay route で再生できることを確認する。
14. 必要なら `clear` または `slow` を 1 回だけ試し、style が cache identity と provider mapper 境界に乗ることを確認する。
15. 同じ条件で再度生成し、cache reuse と新規 synthesize の見え方を確認する。

停止条件:

- `ELEVENLABS_API_KEY` や `SUPABASE_SERVICE_ROLE_KEY` の実値確認が必要。
- provider account の voice clone / TTS 利用可否が不明。
- verification required で provider 側操作が必要。
- provider response の raw payload を見ないと判断できない。

## 6. OpenAI live smoke 手順

OpenAI は custom voice entitlement が主要な stop point です。entitlement が未確認のまま深追いしません。

1. `.env.local` に provider を設定する。
   - `VOICE_PROVIDER=openai`
   - `OPENAI_API_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENAI_VOICE_MODEL` は必要な場合だけ設定する。
2. dev server を再起動する。
3. `npm run voice:style-smoke` を実行する。
4. `npm run voice:preflight` を実行する。
5. login して `/setup/voice` を開く。
6. Provider readiness で consent recording、sample audio、entitlement-sensitive の説明を確認する。
7. consent name / language / consent recording を保存する。
8. voice sample を upload する。
9. custom voice create を 1 回だけ試す。
10. endpoint access / entitlement wording の失敗が出た場合は、repo 側の upload / auth failure と混同せず stop する。
11. custom voice が通った場合のみ、`/scripts/[id]/listen` で見本音声を 1 回生成する。
12. OpenAI では `voiceStylePreset` を ad hoc prompt text にしないため、style 差の音質確認はこの段階の目的にしない。

停止条件:

- custom voice entitlement が必要。
- provider-side consent response を人間が判断する必要がある。
- secret / API key / provider account 状態の確認が必要。
- OpenAI の style knob 仕様を新しく設計したくなった。

## 7. mock へ戻す切り戻し手順

provider smoke が失敗したら、main loop 開発を止めずに mock へ戻します。

1. `.env.local` を `VOICE_PROVIDER=mock` に戻す。
2. dev server を再起動する。
3. `npm run voice:preflight` を実行し、provider が `mock` であることを確認する。
4. `/setup/voice` を開き、mock provider 用の default voice を作る。
5. `/scripts/[id]/listen` で mock 見本音声を生成または cache reuse できることを確認する。

注意:

- `setup/voice`、`listen`、`progress` は current `VOICE_PROVIDER` に一致する row だけを見る。
- 別 provider で作った voice row や script audio は、mock provider へ切り替えた後に自動再利用しない。
- provider smoke で作成された app-owned rows / storage objects の cleanup 運用は別設計にする。

## 8. S7 境界の維持

実 provider smoke でも次を変えません。

- `playbackRate` は provider input、cache key、saved audio identity、quota metadata、Audio Library metadata に入れない。
- `voiceStylePreset` は provider-neutral preset id として service / cache / quota metadata / provider input に渡す。
- provider-specific option は `providers/voice/style-mapper.ts` に閉じる。
- cache key は provider、saved voice row id、script locale、generation style preset、server-owned script content で決まる。
- provider raw payload、raw script text、audio bytes、signed URL、secret は Audio Library metadata や quota metadata に保存しない。
- mock provider は mapping contract smoke 用で、音質差を出す責務を持たない。

## 9. S8c residual smoke notes

S8c の repo-side / dev DB spot check では、secret や raw script/audio を表示せずに次を確認しました。

- latest ElevenLabs default voice に紐づく `script_audios` row は app-owned replay route を指し、`stored_asset` は bucket/object metadata だけを持つ。
- 同じ server-owned script content / locale / voice row / provider / generation style から cache key を再計算すると、既存 `natural` row と一致する。これにより、同一条件の次回 listen は `getCachedScriptAudio` の lookup 対象になる。
- `natural / expressive / slow` はそれぞれ別 cache key として存在する。style は cache identity に入るが、`playbackRate` は cache identity に入らない。`clear` は S8g で追加確認する。
- ElevenLabs の `quota_events` には `script_audio_generation_attempt=succeeded` があり、metadata は allowlist keys のみで、raw prompt / raw script / audio bytes / signed URL / raw provider payload は保存していない。
- Audio Library の既存 saved model audio row は ElevenLabs provider / voice metadata を持つが、style metadata は旧データ fallback 扱い。fresh save の style snapshot は別途 UI で再確認する。

後続確認:

- `clear` の実 provider style row と、各 style の実音声差は S8g で確認済み。

## 10. S8d browser cache hit / fresh metadata notes

S8d ではユーザー実ブラウザ操作後に、dev DB / code path を secret 非表示で spot check しました。

- 同一 script / voice / `natural` style の再生成後、`quota_events` に `script_audio_generation_attempt` / `status=cache_hit` / `billing_status=non_billable` が記録された。
- 同じ condition の `script_audios` row は 1 件のままで、再生成操作による重複 row は増えていない。
- `natural / expressive / slow` は引き続き別 cache key / 別 `script_audios` row。`clear` は S8g で追加確認する。
- fresh Audio Library save row には `provider=elevenlabs`、voice id / voice label、`voice_style_preset=natural`、`voice_style_label=Natural`、`target_speed`、`target_wpm`、`pause_density`、cache key hash/prefix、content type、byte length が入る。
- quota metadata と Audio Library metadata の spot check では、raw script、audio bytes、signed URL、raw provider payload、secret、user email、`playbackRate` は保存されていない。

後続確認:

- `clear` の実 provider style row と、各 style の実音声差は S8g で確認済み。
- provider failure branch / cleanup policy は S8e で設計済み。

## 11. S8e failure branch / cleanup policy

S8e では、ElevenLabs の実接続が通った後に残る failure branch と cleanup policy を固定します。DB schema、API contract、cache key、preset value は変更しません。

### Failure branch inventory

| branch | 現在の扱い | recovery 方針 |
| --- | --- | --- |
| sample reference invalid | `storage://voice-samples/...` 以外は `400` で止める | sample を app-owned upload し直す |
| sample download failed | service role / storage download failure を `500` にする | storage policy / bucket / upload 済み sample を確認する |
| sample content type missing | `500` で止める | sample を再 upload する |
| sample reject / invalid audio | ElevenLabs create voice の `422` または audio/file/sample wording を sample reject として返す | 形式・長さ・内容を見直して再 upload する |
| verification required | create voice reject または response flag で fail-fast。pending voice row は保存しない | ElevenLabs 側で verification を完了してから再試行する |
| API key / entitlement / billing issue | `401/403` は permission message と request id を返す。billing / quota wording は general provider failure として扱う | account / plan / API key を人間が確認し、必要なら `VOICE_PROVIDER=mock` へ戻す |
| rate limit | 現在は general provider failure として request id 付きで返る | retry timing / provider plan を人間が確認する。自動 retry はまだしない |
| invalid / deleted provider voice id | synthesize `404` は「voice が見つからない」として返る | Native Minute の DB row は残るが、その voice は使えない。voice を作り直すか mock fallback |
| synthesize failed | `synthesize-reject` / `synthesize-connect` として request id / failure point を server log に残す | provider 状態、voice id、model id を確認する |
| storage staging failed | provider 成功後の app-owned storage upload failure として quota event は `failed` または `partial` | `script-audios` bucket / policy / object conflict を確認する |
| protected replay failed | replay route が owned `script_audios` row と stored asset を再取得して failure message を返す | storage object / policy / row 整合を確認する。provider 再呼び出しとは分ける |

### Current recovery coverage

現時点で足りているもの:

- setup/voice の Provider readiness は `ELEVENLABS_API_KEY`、`SUPABASE_SERVICE_ROLE_KEY`、sample required、verification fail-fast、inline-bytes -> app-owned replay の前提を表示する。
- create voice 失敗時は、verification required / sample reject / permission or entitlement-ish failure をユーザー向け recovery に分ける。
- listen の synthesize 失敗時は route handler が `AppError` message を返し、既存 listen panel の recovery / quality concern / mock fallback 文脈で扱う。
- cache hit は provider synthesize を呼ばず、`cache_hit / non_billable` として記録される。
- provider bytes は app-owned storage に載せ替え、protected replay route で再生する。

足りていないもの:

- rate limit / billing exhausted / quota exceeded を provider code 別に UI で細分化していない。
- invalid/deleted provider voice を検出した後に、Native Minute 側の default voice を自動で外す実装はない。
- provider failure branch を実 provider で網羅する live smoke はまだしていない。
- provider 側 voice の削除 / cleanup API は未実装。

### Provider voice cleanup policy

MVP では provider 側 voice cleanup を自動化しません。

- Native Minute の `voices` row は app 側の source of truth であり、`provider_voice_id` は provider 呼び出し用の外部 ID に留める。
- ElevenLabs 側 voice を人間が削除した場合、Native Minute の `voices` row は自動では消えない。その voice が default のままだと、次回 synthesize は `invalid / deleted provider voice id` branch で失敗する。
- その場合の最小 recovery は、`/setup/voice` で新しい ElevenLabs voice を作り直すか、`.env.local` を `VOICE_PROVIDER=mock` に戻して main loop を継続すること。
- provider voice cleanup を実装するなら、将来の別 phase で `provider voice delete -> app voice row deactivate/delete -> default voice 再選択 -> cached script_audios / saved model audios の扱い` を同時に設計する。
- 既存の `script_audios` / Audio Library row は、provider voice cleanup だけでは削除しない。app-owned replay asset と saved entries は学習履歴として残す。
- cleanup API を作るまでは、provider console 側での手動削除を運用メモ扱いにし、削除した voice が default の場合は app 側で voice を作り直す。

ログ方針:

- server log には operation、failure point、status、request id、provider code/type、短い message を残す。
- raw provider response body、secret、audio bytes、signed URL、raw script text は log / metadata / docs に残さない。

## 12. S8f user-facing recovery polish

S8f では、S8e で整理した failure branch のうち、ユーザーが画面で次の一手を読みやすい範囲だけを small diff で整えました。DB schema、API contract、cache key、preset value、provider cleanup API は変更していません。

### Polished copy

- setup/voice の ElevenLabs voice 作成失敗では、sample reject / verification required / account or plan issue / rate limit を分けて recovery を出す。
- `sample reject` は sample の形式・長さ・内容を見直し、app-owned `storage://voice-samples/...` として再 upload する。
- `verification required` は pending voice を保存せず、ElevenLabs 側で verification を完了してから作り直す。
- `rate limit / billing / quota / API key` は、auth や upload ではなく ElevenLabs account 側の状態として扱い、必要なら `VOICE_PROVIDER=mock` に戻す。
- listen の ElevenLabs TTS 失敗では、deleted provider voice / account or rate limit / storage staging を分けて recovery を出す。
- deleted provider voice は `/setup/voice` で voice を作り直す。
- storage staging / replay preparation は provider voice を作り直す前に `script-audios` bucket / policy / replay route を見る。

### Still not implemented

- provider voice cleanup API。
- invalid/deleted provider voice を検出した後の default voice 自動解除。
- rate limit / billing / provider failure branch の網羅的 live smoke。

## 13. S8g style live smoke / S8 closing

S8g では、ElevenLabs 実 provider で残っていた `clear` style を実ブラウザで生成し、dev DB で row / quota / metadata を spot check しました。DB schema、API contract、cache key、preset value は変更していません。

確認済み:

- `clear` style の `script_audios` row が作成され、protected replay path と safe stored asset metadata を持つ。
- `clear` style の `quota_events` は `script_audio_generation_attempt / succeeded / billable_candidate` として記録された。
- 同じ script / voice に対して `natural / expressive / clear / slow` は 4 つの別 cache key / 別 `script_audios` row になった。
- quota metadata と Audio Library metadata には、raw script、raw provider payload、signed URL、audio bytes、secret、user email、`playbackRate` は保存されていない。
- `playbackRate` は引き続き provider input、cache key、saved audio identity、quota metadata、Audio Library metadata に入らない。
- 実ブラウザの聞き比べでは、Clear は Natural より少し聞き取りやすく感じられた一方、4 style 全体の差は微量で、style 名どおりの特徴が明確に反映されているかは判断しづらい。

S8 closing として、ElevenLabs の main happy path、cache reuse、Audio Library fresh metadata、style 別 cache identity、user-facing recovery copy は確認済みです。残りは意図的な provider failure live smoke、provider cleanup API、OpenAI custom voice entitlement smoke であり、S8 の範囲外に残します。

## 14. 次の phase

- OpenAI custom voice entitlement smoke only, if entitlement is available。
- または、ElevenLabs failure branch を実 provider で意図的に smoke する場合は、secret / provider account 判断が必要になった時点で停止する。

S8 closing 以降も、実 secret 入力や provider account 判断が必要になった時点で停止し、人間の操作に戻します。
