# Speed / Voice Style Plan

この文書は Phase S7a の design-only メモです。S6 で Audio Library MVP が完了したので、次は「保存できる」から「練習しやすい見本音声を作る」ために、速度設計と voice style 設計を固定します。

今回は DB migration、API contract 変更、UI 実装、provider 本接続には進みません。

S7b では、provider-neutral な preset / speed intent の local type と定義を `lib/voice-style.ts` に追加し、provider-specific な変換を `providers/voice/style-mapper.ts` に閉じました。既存 UI / API が受ける `natural / expressive / clear / slow` は互換維持のためそのままです。

S7c では、既存4 preset の user-facing copy を「生成 style」として整理し、`slow` は将来 `slow-practice` へ寄せる互換 alias としてコード上に明記しました。public schema、request value、cache key に入る値は変更していません。

S7d では、`/scripts/[id]/listen` の小さな copy refinement として、voice style selector を「生成 style」、playbackRate control を「聞く速さだけ」と読めるように整理しました。API / DB / cache key / public schema は変更していません。

S7f では、`/scripts/[id]/listen` の表示密度を下げ、最初に見える領域を見本音声の生成・再生・速度・保存・record 導線に寄せました。台本 check / voice preflight / quota / cache の詳しい説明は details に逃がし、さらに生成・更新・保存・保存解除の pending feedback を短く明示しました。API / DB / cache key / public schema は変更していません。

S7g では、saved model audio の metadata snapshot を少し読みやすくしました。新しく保存する見本音声では、既存 cache key から分かる範囲で generation style / speed intent / WPM / pause density を安全な metadata に残し、listen と progress では provider / voice / style を短く表示します。旧データや推定不可の保存済み音声では `style: 旧データ / 詳細なし` と表示します。playbackRate は保存済み音声の identity に含めず、API / DB / cache key / public schema は変更していません。

S7h では、provider-specific mapping の境界を mock 前提で確認しました。`speakScript` は `voiceStylePreset` を cache key、quota metadata、provider `synthesize` input に渡しますが、`playbackRate` は client-side の聞く速さだけで provider adapter には渡しません。mock provider は同じ contract を受けるものの音声自体には style を反映しないため、mock smoke は「境界確認」であり音質確認ではありません。ElevenLabs など実 provider は `providers/voice/style-mapper.ts` の mapper 内で provider-specific option に変換し、provider raw payload は UI / Audio Library metadata / cache key に漏らしません。

S7i では、実 provider 本接続前の lightweight smoke と checklist を追加しました。`npm run voice:style-smoke` は provider API を呼ばず、`voiceStylePreset` が provider input / cache / Audio Library metadata の境界を通ること、`playbackRate` が provider / cache / saved audio identity に混ざらないこと、OpenAI が ad hoc style prompt text を受け取らないことを静的に確認します。

S8a では、実 provider live smoke に入る前の前提条件と切り戻し手順を [voice-provider-smoke-plan.md](./voice-provider-smoke-plan.md) に固定しました。repo の現状では、S7 の provider-specific mapper を最初に実音声で確認しやすい ElevenLabs を先行候補にし、OpenAI custom voice は entitlement-sensitive な stop point を明示してから進めます。どちらの場合も、live smoke 前に `npm run voice:style-smoke` を必ず通します。

## 1. 目的

- 見本音声が速すぎる問題を、再生速度だけでごまかさず、script / generation / playback の各層で扱う。
- Native Minute の script を、1分で話しやすく、意味の塊で真似しやすい形に寄せる。
- `playbackRate` と生成時の話速指定を混同しない。
- voice style preset を、表現の好みだけでなく練習目的にも結びつける。
- Audio Library に保存した見本音声が、どの style / speed 意図で作られたかを後から読めるようにする。

## 2. 現在の前提

- `listen` の見本音声と `review` の保存済み録音には client-side `playbackRate` がある。
- `playbackRate` は `0.75x / 0.85x / 1.0x / 1.15x` で、provider 再生成や `script_audios.cache_key` 変更を伴わない。
- `listen` の見本音声生成には `natural / expressive / clear / slow` の voice style preset がある。
- ElevenLabs では style preset を `voice_settings` に変換し、preset は `script_audios.cache_key` に含める。
- Audio Library の saved model audio は `script_audios` を pin する curation layer であり、audio bytes の canonical source ではない。
- `/scripts/new` の readiness、practice chunks、review practice focus は、script content から表示用に導出する。

## 3. Speed の層

### playbackRate

`playbackRate` は、既存音声を client-side で聞く速さです。

- 目的: 学習者が聞き取りや shadowing の難度を調整する。
- 対象: `listen` の見本音声、`review` の保存済み録音、将来の Audio Library playback。
- cache key: 変えない。
- provider request: 変えない。
- saved model audio identity: 変えない。
- quota: 消費しない。

推奨 UI copy:

- 「再生速度」
- 「音声を作り直さず、聞く速さだけを変えます」
- 「保存済み音声や cache とは別の表示設定です」

### target_wpm

`target_wpm` は、script がどれくらいの速さで話される想定かを示す設計値です。

- 目的: Script Studio / readiness で、1分台本の長さを判断する。
- 例:
  - slow practice: 95-115 wpm
  - clear practice: 115-135 wpm
  - natural: 135-155 wpm
  - native-leaning: 155-175 wpm
- 保存: MVP ではまず Script Studio draft / quality report の表示用候補に留める。
- provider request: 直接渡さない。provider-specific speed に変換する場合は別段階。

### target_speed

`target_speed` は、UI / contract で扱う coarse な速度意図です。

候補:

- `slow_practice`
- `clear_practice`
- `natural`
- `native_leaning`

`target_wpm` より UI に出しやすく、provider ごとの `speed` 数値より product intent に近い値として扱います。

### pause_density

`pause_density` は、息継ぎや意味の塊の間をどれくらい作るかの意図です。

候補:

- `low`: 自然な流れを優先する。
- `medium`: 練習しやすい標準。
- `high`: chunk ごとに真似しやすくする。

MVP では音声生成へ直接渡すより、Script Studio の punctuation / chunk guidance に反映するのが安全です。provider が pause を細かく制御できない場合でも、script 側の comma / period / chunk length で練習しやすさを上げられます。

### chunk length

chunk length は、生成時 speed より先に整えるべき script quality です。

- practice chunk はおおむね 4-10 words。
- 長い chunk は、話速を落としても真似しづらい。
- 「速すぎる」問題が出たときは、まず script の長さ / chunk / breath point を確認する。

## 4. Voice Style Preset 案

S7 では style を増やす前に、preset の責務を分けます。

### 練習目的 preset

- `slow-practice`
  - 目的: まず真似できる見本。
  - speed: slow practice。
  - pause density: high。
  - style: 控えめ。
- `my-voice-clear`
  - 目的: 自分の声に近いまま聞き取りやすくする。
  - speed: clear practice。
  - pause density: medium。
  - style: 控えめ。
- `presentation`
  - 目的: 1分発表として語尾まで言い切る。
  - speed: natural。
  - pause density: medium。
  - style: 安定。

### 表現目的 preset

- `calm`
  - 落ち着いた読み。
- `friendly`
  - 柔らかく親しみやすい読み。
- `excited`
  - 少し明るく抑揚を出す。
- `serious`
  - 低めで落ち着いた読み。
- `storytelling`
  - 意味の流れと間を少し強める。
- `native-leaning`
  - 自然寄りだが、MVP では速くしすぎない。

### 既存 preset との関係

既存の `natural / expressive / clear / slow` は、初期実装として残します。

- `natural` -> default / natural。
- `expressive` -> 将来 `friendly` または `storytelling` へ寄せる候補。
- `clear` -> `my-voice-clear` または `presentation` の基礎。
- `slow` -> `slow-practice` へ寄せる候補。

いきなり多くの preset を UI に並べると迷いやすいので、MVP の次段階では 4-5 個に絞るのが安全です。

### S7c 互換方針

- public request value は `natural / expressive / clear / slow` のまま維持する。
- `slow` は今すぐ rename せず、将来 `slow-practice` へ移行するときの compatibility alias として扱う。
- `clear` と `expressive` も、将来の expanded preset へ寄せられるように alias metadata を持つ。
- cache key に入る値は今まで通り request preset id を使う。`slow` の cache key を `slow-practice` に変えない。
- provider-specific mapper は alias 情報を持つが、現時点では既存4 preset の provider mapping を壊さない。
- playbackRate は generation preset ではないので、alias / cache / provider mapper に入れない。

## 5. Script Studio との接続

Script Studio は、音声生成前に script と intent を整える場所です。

持たせたい値:

- `targetSpeed`
- `targetWpm`
- `pauseDensity`
- `recommendedVoiceStylePreset`
- `practiceIntent`
  - `shadowing`
  - `presentation`
  - `clear_delivery`
  - `native_leaning`

使い方:

- draft generation では、最初から長すぎる英文を作らない。
- readiness では、estimated time を `natural` と `practice` の両方で出す。
- quality gate では、long sentence / long chunk / breath point を speed 問題として扱う。
- freeze 前に「生成時 style / speed 意図」を選ぶが、音声生成は saved script を読み直して行う。

MVP では、Script Studio の draft contract にいきなり DB 保存項目を増やさず、local type / helper から始めるのがよいです。

## 6. Listen との接続

listen は、実際に見本音声を作って聞く場所です。

分けるべき UI:

- `voice style preset`
  - 音声そのものを作るときの style / speed 意図。
  - cache key に影響する。
  - 将来 quota 対象になり得る。
- `playbackRate`
  - 既存音声の再生速度。
  - cache key に影響しない。
  - quota 消費ではない。
- `practice chunks`
  - どこで区切って真似するか。
  - 音声生成と独立した学習補助。

listen では、まず「slow practice で生成する」よりも、「通常生成を 0.85x で聞く」と「slow-practice 音声を生成する」の違いを明確にします。

推奨 copy:

- 「再生速度は聞く速さだけを変えます」
- 「style を変えて更新すると、別の見本音声として生成されることがあります」
- 「速すぎる場合は、まず chunk と語尾を優先します」

## 7. Audio Library との接続

Audio Library は、良い見本音声や自分の録音を残す場所です。

saved model audio に残したい metadata:

- `voice_style_preset`
- `target_speed`
- `target_wpm`
- `pause_density`
- `provider`
- `voice_id`
- `locale`
- `script_audio_cache_key_hash`
- `content_type`
- `byte_length`
- `generated_at`
- `saved_at`

MVP で既にある snapshot metadata は安全な範囲に留め、raw script text、provider response、signed URL、audio bytes は保存しません。

`playbackRate` は音声 identity ではないため、saved model audio metadata には入れません。将来「この saved audio をいつも 0.85x で聞く」ような個人 preference が必要になったら、audio identity とは別の user preference として扱います。

### S7h provider mapping boundary

- Provider adapter に渡す情報は `SynthesizeInput` の `providerVoiceId / text / locale / voiceStylePreset` までに留める。
- UI 専用の `playbackRate` は provider mapping、cache key、saved model audio identity、quota metadata に入れない。
- `mapVoiceGenerationStyleForProvider(provider, { presetId })` は provider-neutral preset definition から provider-specific option を作る唯一の境界にする。
- ElevenLabs は現時点で `voice_settings` に変換する。OpenAI は安定した同等 knob を repo contract に持たないため、ad hoc prompt text にせず fallback 境界として扱う。
- mock provider は `voiceStylePreset` を受けるが、返す mock audio bytes / replay path は style で変えない。mock flow では request/cache/metadata の分離だけを確認する。
- saved model audio metadata には `voice_style_preset / voice_style_label / target_speed / target_wpm / pause_density / provider / voice label / cache key hash or prefix` のような safe snapshot だけを残す。raw provider payload、raw script text、signed URL、audio bytes は保存しない。

### S7i smoke checklist

実 provider 本接続前に、まず repo 内で以下を確認します。

1. `npm run voice:style-smoke` が通る。
2. `SynthesizeInput` にある生成条件は `voiceStylePreset` で、`playbackRate` は含まれない。
3. `speakScript` は `voiceStylePreset` を `buildScriptAudioCacheKey` と `provider.synthesize` に渡す。
4. `buildScriptAudioCacheKey` は provider-neutral preset id を含めるが、provider raw payload / signed URL / audio bytes / `playbackRate` は含めない。
5. `providers/voice/style-mapper.ts` が provider-specific option を作る唯一の境界になっている。
6. ElevenLabs は `voice_settings` を mapper から受け、OpenAI は安定 knob が定義されるまで ad hoc prompt text にしない。
7. mock provider は style contract を受けるだけで、音質差を出す責務を持たない。
8. saved model audio metadata は safe snapshot だけを持ち、`playbackRate` や raw provider payload を保存しない。

OpenAI / ElevenLabs live smoke に進む場合も、この checklist が通ってから provider-specific な音質・entitlement・response を別に確認します。

### S8a provider smoke boundary

実 provider live smoke の準備手順は [voice-provider-smoke-plan.md](./voice-provider-smoke-plan.md) に分けます。

- 先に `npm run voice:style-smoke` を通す。
- 対象 provider の `.env.local` 設定後に `npm run voice:preflight` を通す。
- ElevenLabs は `voice_settings` mapper と app-owned sample -> voice clone -> protected replay の確認を先行候補にする。
- OpenAI は custom voice entitlement と provider-side consent が stop point になるため、endpoint access 失敗を repo bug と混同しない。
- 失敗時は `VOICE_PROVIDER=mock` に戻して dev server を再起動し、main loop 開発を続ける。
- `playbackRate` は live smoke でも provider input / cache key / saved audio identity / quota metadata に混ぜない。

## 8. MVP でやる範囲

S7 の次段階で小さく実装するなら、推奨範囲は次です。

- 既存 `natural / expressive / clear / slow` の定義を整理し、UI copy を「生成 style」として明確化する。
- `slow` を `slow-practice` へ rename するか、互換 alias として扱う設計を決める。
- style preset に `targetSpeed / pauseDensity` の local definition を持たせる。
- provider adapter へ渡す値は provider-specific mapper に閉じ込める。
- `script_audios.cache_key` は style / generation speed intent を含める。
- `playbackRate` は cache key に入れない方針を維持する。
- saved model audio の metadata snapshot に style / speed intent を安全に残す。
- Script Studio readiness に、target speed に応じた estimated time 表示を足す。

## 9. 後回しにする範囲

- DB migration。
- public API contract 変更。
- 大量の style preset UI。
- provider ごとの高度な prosody / pause / SSML 制御。
- native-like ladder。
- 自動 rewrite。
- Audio Library の global preference / per-audio default playbackRate。
- quota enforcement。
- billing。
- Azure / voice provider live connection。

## 10. 実装前に決めるべき論点

- `slow` を残すか、`slow-practice` へ移行するか。
- style preset の数を MVP で 4 個に保つか、5 個まで増やすか。
- `target_speed` を string enum として local type に入れるか、preset definition の内部値に留めるか。
- `target_wpm` を Script Studio quality report に出すか、voice generation preflight に出すか。
- `pause_density` を script guidance のみで扱うか、provider request mapper に渡すか。
- ElevenLabs の `speed` と OpenAI speech の指定可能範囲の違いを、provider mapper でどう吸収するか。
- saved model audio metadata に `target_wpm / pause_density` をいつから保存するか。
- cache key に含めるのは preset id だけでよいか、provider-specific speed 値まで含めるべきか。
- style / speed 変更時に quota preflight copy をどう出すか。

## 11. 推奨ロードマップ

- S7a: speed / voice style design only。
- S7b: local type / preset definition / provider mapper boundary。`lib/voice-style.ts` と `providers/voice/style-mapper.ts` に受け皿を追加済み。UI / DB / API contract は未変更。
- S7c: existing preset copy cleanup and compatibility aliases。既存4 preset の copy と alias metadata を整理済み。public schema / cache identity は未変更。
- S7d: listen UI small refinement for generation style vs playback speed。`/scripts/[id]/listen` で生成 style と再生速度の copy を整理済み。API / DB / cache key は未変更。
- S7e: listen generation style / playback speed copy browser check。
- S7f: listen UI density reduction / progressive disclosure。listen の主操作を先に見せ、cache / quota / preflight の詳細は details に整理し、生成・保存操作の pending feedback も明示済み。
- S7g: saved model audio metadata snapshot refinement。新規保存分の safe metadata に generation style / speed intent を残し、listen / progress で短く表示済み。旧データは `style: 旧データ / 詳細なし` として明示する。
- S7h: provider-specific mapping smoke with mock and docs。mock provider では style を音質に反映せず、`voiceStylePreset` が service/cache/metadata/provider input の境界を通ることだけを確認済み。実 provider の変換は mapper 内に閉じ、playbackRate は混ぜない。
- S7i: provider mapping smoke checklist / lightweight test。`npm run voice:style-smoke` で provider API を呼ばずに mapping boundary / playbackRate separation / saved model audio metadata の安全条件を確認できる。
