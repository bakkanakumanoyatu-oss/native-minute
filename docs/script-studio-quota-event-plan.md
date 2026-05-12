# Script Studio Quota Event Plan

この文書は Script Studio Phase S4f の設計メモです。Script Studio の text generation、見本音声の voice generation、script audio generation、voice setup に関する quota event の境界を固定します。

S4f では DB schema / migration、API route、UI、billing、quota enforcement、voice generation gating は追加しません。S3d の `draft preview -> 手動フォームへコピー -> 編集 -> 既存保存`、S4a の form preflight、S4b の saved script check、S4e の listen preflight-only copy はそのまま維持します。Phase S4g では、listen の preflight notice に provider readiness / cache reuse の表示を足しました。Phase S4h では、`/scripts/new` と `/scripts/[id]/listen` に quota preflight copy only を追加し、将来 quota 対象になり得る操作と quota 消費ではない操作を押す前に読めるようにしました。Phase S5a では、将来の `quota_events` schema を migration 前の設計として整理しました。Phase S5b では、Script Studio text generation の quota event write path を design only で固定しました。Phase S5c では、見本音声生成の quota event write path を design only で固定しました。Phase S5d では、実装に入る直前の判断として、最初の対象、write service の責務、write failure、status enum 方針を固定しました。Phase S5e では、text generation quota event の初回実装計画として、migration 候補、RLS、write service interface、service 呼び出し位置を固定しました。Phase S5f では、`script_generation_attempt` だけを対象に `quota_events` migration / DB types / non-blocking write service / service 接続を追加しました。Phase S5g では、voice generation quota event の初回実装計画を docs に固定しました。Phase S5h では、その実装前に必要な `quota_events` voice schema extension の migration 案を docs に固定しました。Phase S5i では、後続 `0010` migration / DB types / quota write service の受け皿として voice schema extension を最小実装しました。Phase S5j では、`speakScript` service 境界に non-blocking の `script_audio_generation_attempt` write path を接続しました。S5k-plan では、`0009/0010` 適用後の text + voice DB smoke checklist と SQL query を統合しました。enforcement、billing、usage dashboard、voice generation gating はまだありません。

## 1. 目的

- text generation と voice generation の cost boundary を分ける。
- ユーザー要求が青天井にならないようにする。
- 何が quota 消費で、何が quota 消費ではないかを明確にする。
- 将来の billing / usage limit / provider cost control に備える。
- MVP ではまだ quota enforcement を実装しない。
- quota の設計で saved script canonical 方針を崩さない。

## 2. 用語定義

- `Text Generation Attempt`: Script Studio generation route が draft candidates を作る試行。現 repo では `POST /api/script-studio/generate` が境界。
- `Draft Regeneration`: 同じ intent 近傍で draft candidates を作り直す text generation attempt。
- `Bounded Adjustment`: `shorter`、`simpler`、`more_natural` など、選択肢で制限した text adjustment。自由文の無限 rewrite ではない。
- `Manual Edit`: ユーザーが手動フォームや保存前フォーム state を自分で編集すること。
- `Copy to Manual Form`: accepted draft の `title / englishScript / target seconds` だけを既存手動フォームへコピーすること。
- `Saved Script Creation`: 既存の script 保存 flow で `scripts` row を作ること。
- `Freeze Preflight`: script content から、将来 freeze / 音声生成に進めそうかを表示用に確認すること。S4f 時点では保存しない。
- `Voice Generation Attempt`: provider synthesize request により新しい script audio を作る試行。
- `Voice Regeneration`: 同じ saved script / voice / provider 近傍で音声を作り直す操作。cache hit ではない provider call が発生する場合は voice quota 対象候補。
- `Cache Reuse`: `script_audios` cache key が一致し、provider synthesize を呼ばず保存済み音声を返すこと。
- `Script Audio Generation`: saved script content と app-owned voice row から見本音声を作り、app-owned storage / replay route に載せる処理。
- `Voice Clone Creation`: provider 側で custom voice / voice clone を作る試行。
- `Voice Setup Upload`: voice consent recording や voice sample を app-owned storage へ upload すること。
- `Provider Entitlement Failure`: provider account / model / endpoint の権限不足で失敗すること。
- `Provider Error`: provider request 後に timeout、reject、invalid response などで失敗すること。
- `Quota Event`: quota 判断や usage audit のために将来記録する可能性がある event。
- `Billable Event`: provider cost や plan usage として課金・消費対象になり得る event。
- `Non-billable Event`: quota / billing 消費として扱わない event。

## 3. Quota Category

大きな category は分けて扱います。

- `text_generation_quota`: Script Studio draft generation / regeneration / bounded adjustment。
- `voice_generation_quota`: saved script から script audio を生成する provider synthesize。
- `voice_clone_quota`: custom voice / voice clone 作成。script audio generation より高コストな別枠。
- `storage_replay_usage`: storage upload / replay / download は将来検討。MVP では quota 本線にしない。
- `manual_workflow`: copy / edit / save / readiness / chunks / review は quota 消費ではない。

重要なのは、text 側の試行錯誤と voice 側の生成コストを混ぜないことです。text generation は draft を整えるため、voice generation は保存済み script から音声を作るため、と別の event として考えます。

## 4. Quota 消費にする候補

### Text side

将来 `text_generation_quota` の消費候補にするもの:

- `POST /api/script-studio/generate` の successful generation。
- `requestedVariants` を伴う draft generation。
- `Draft Regeneration`。
- `Bounded Adjustment`。
  - `more_natural`
  - `more_speakable`
  - `more_self_like`
  - `shorter`
  - `simpler`
  - `easier`
  - `more_confident`
  - `more_friendly`
  - `more_clear`

Text quota は、provider が mock か OpenAI かに関係なく、将来の UI / billing と矛盾しない言葉で扱います。ただし S4f では enforcement しません。

### Voice side

将来 `voice_generation_quota` または `voice_clone_quota` の消費候補にするもの:

- script audio generation の cache miss。
- 明示的な voice regeneration。
- provider への synthesize request。
- voice clone creation。
- voice sample processing が provider 側で発生する場合。
- consent recording を使った provider-side voice setup が発生する場合。

`/api/speak-script` は client の script text を信用せず、server 側で owned saved script と selected/default voice を読み直します。将来 quota event を書く場合も、この server-side boundary の後に判定します。

## 5. Quota 消費にしないもの

次は quota 消費にしない方針です。

- Script Studio draft preview をフォームへコピーする。
- manual edit。
- saved script creation。
- readiness panel。
- manual revision hints。
- practice chunks。
- freeze preflight preview。
- saved script read-only freeze candidate check。
- voice generation preflight notice。
- cache hit / cache reuse。
- protected replay。
- review / progress 表示。
- route validation failure。
- auth failure。
- user が button を押す前の local UI preview。
- `playbackRate` の変更。
- voice style preset の選択自体。

voice style preset を変えて cache miss になり provider synthesize が発生した場合は、将来 voice generation attempt として扱う可能性があります。選択 UI そのものは quota 消費ではありません。

## 6. Failed / Partial Event の扱い

将来の実装では、失敗をひとまとめにしない方針にします。

- validation error は quota 消費しない。
- auth error は quota 消費しない。
- provider env missing は quota 消費しない。
- provider entitlement missing は quota 消費しない可能性が高い。
- provider request を送る前の setup / preflight failure は quota 消費しない。
- provider timeout / provider error は要検討。
- provider request が送信された後の失敗は、provider cost が発生する可能性がある。
- app-owned storage / replay staging に失敗した場合、provider cost は発生済みかもしれないが、user-facing quota をどう扱うかは要検討。

将来は event status を `planned / attempted / succeeded / failed / not_billable / refunded` のように分ける可能性があります。MVP ではまだ status model を実装しません。

## 7. Cache Reuse / Regeneration の扱い

- cache hit は新しい voice generation attempt ではない。
- protected replay は quota 消費ではない。
- 同じ saved script / voice / provider / locale / voice style preset / cache key なら再利用される可能性がある。
- `script_audios` cache key は current flow の identity であり、S4f では変更しない。
- 「更新」ボタンは将来 regeneration として quota 対象になり得る。
- ただし条件が同じなら、更新しても同じ音声に見える場合がある。
- cache key を変えるか、force regeneration を別 route / option にするかは今回は扱わない。

UI では、cache reuse は節約であり、新しい provider call ではないと説明します。一方で regeneration は、provider call が起きるなら quota 対象候補として事前に分かるようにします。

## 8. Bounded Choice 方針

ユーザー要求を自由文で無限に受けないことを quota 設計の前提にします。

- regenerate は回数制限対象にする。
- adjustment は bounded option で受ける。
- text adjustment の候補:
  - `shorter`
  - `easier`
  - `more_natural`
  - `more_confident`
  - `more_friendly`
  - `more_clear`
  - `more_self_like`
- 自由入力の「もっとこうして」は将来制限が必要。
- 音声生成側の要求は text 側よりさらに強く制限する。
- voice style や voice regeneration は、ユーザーが押す前に cost boundary が分かるようにする。

Native Minute の価値は「青天井に生成を回す」ことではなく、1分台本を練習できる形に整えて main loop へ進めることです。

## 9. Source Of Truth との関係

- generated draft は一時 preview。
- copied draft は form state。
- manual form draft は保存前の編集状態。
- saved script が canonical。
- freeze persistence はまだない。
- quota event を導入する場合も、MVP では saved script only 方針を崩さない。
- voice generation は server 側で saved script を読み直す前提。
- generated draft metadata を保存しない間は、quota event と draft provenance は分離して考える。
- script audio は saved script content から生成される派生物。
- cache / replay の source of truth は app-owned `script_audios` row と storage asset。

S4f では `quota_events` が存在しないため、quota event は canonical data ではありません。将来導入する場合も、script content の canonical source を client や generation metadata へ移しません。

## 10. S5a Quota Event Schema Design

S5a は design only です。ここでは将来の `quota_events` table / API / service が必要になったときの schema 候補を固定します。DB schema / migration、API route、write path、enforcement、billing、usage dashboard はまだ作りません。

### 10.1 Event type

`event_type` は user action / server-side provider boundary を表す。MVP では、text generation、voice generation、voice clone を分けます。

候補:

- `script_generation_attempt`: Script Studio で最初の draft candidates を作る。
- `script_regeneration_attempt`: 同じ brief 近傍で draft を作り直す。
- `script_adjustment_attempt`: `shorter / easier / more_natural` など bounded adjustment を試す。
- `script_audio_generation_attempt`: saved script から見本音声を作る。cache miss / provider synthesize が対象。
- `script_audio_regeneration_attempt`: 保存済み音声ではなく明示的に再生成を試す。
- `voice_clone_creation_attempt`: custom voice / voice clone 作成を provider 側で試す。
- `voice_setup_upload_attempt`: voice consent recording / sample audio upload や provider-side processing の試行。

非 event 本線:

- copy to manual form、manual edit、saved script creation、readiness panel、practice chunks、freeze preflight preview、cache hit、protected replay は quota 消費 event にしない。
- 必要なら audit 用に `not_billable` として記録する余地はあるが、MVP の quota enforcement とは分ける。

### 10.2 Event status

`status` は quota 消費そのものではなく、試行の進行状態を表す。

候補:

- `planned`: user action 前、または preflight で「これから quota 対象になり得る」と分かった状態。
- `skipped`: validation / auth / provider readiness / cache hit などで provider call 前に実行しなかった。
- `cache_hit`: saved script audio を再利用し、新しい provider synthesize を呼ばなかった。
- `attempted`: provider request、OpenAI generation、または pipeline execution を実際に試した。
- `succeeded`: user-facing result を返せた。
- `failed`: 試行したが、provider error / timeout / invalid response / storage staging failure などで失敗した。
- `partial`: provider cost は発生した可能性があるが、app-owned storage / replay staging など後段が完了しなかった。
- `not_billable`: 記録対象ではあるが、quota / billing 消費にしない。
- `refunded`: いったん消費扱いにしたが、後から返却した。

S5a では status の定義だけを固定し、消費計算や refund 実装はしません。

### 10.3 Subject / target resource

`quota_events` は user-owned event として扱い、canonical script content を持たせません。対象 resource は ID 参照に留めます。

候補:

```ts
type QuotaEventSubjectCandidate = {
  subjectType:
    | "script_studio"
    | "script_audio"
    | "voice_clone"
    | "voice_setup"
    | "manual_workflow";
  targetResourceType:
    | "script"
    | "script_audio"
    | "voice"
    | "voice_consent"
    | "script_generation_request"
    | "none";
  relatedScriptId: string | null;
  relatedAudioId: string | null;
  relatedVoiceId: string | null;
  relatedConsentId: string | null;
  relatedGenerationRequestId: string | null;
};
```

方針:

- script content の snapshot は `quota_events` に保存しない。
- generated draft の raw text、prompt、raw provider response は保存しない。
- saved script が canonical である方針を崩さない。
- 将来 `script_generation_requests` や `script_freezes` を作る場合も、`quota_events` はそれらへの参照に留める。

### 10.4 Idempotency / dedupe key

将来の write path では、同じ user action が二重送信されても quota event を増やしすぎないようにする。

候補:

- `idempotency_key`: client action または server action ごとの一意 key。将来 API が受ける場合も raw request body は保存しない。
- `dedupe_key`: server 側で作る正規化 key。例: `userId:eventType:scriptId:voiceId:cacheKey:voiceStylePreset:requestWindow`。
- `request_fingerprint`: brief / bounded option / provider / model / target resource を hash 化した値。prompt や script content をそのまま保存しない。
- `provider_request_id`: provider が返す request id。secret ではない範囲だけ保存候補にする。

設計方針:

- text generation は `brief fingerprint + requestedVariants + adjustment option` を dedupe の材料にする。
- voice generation は `scriptId + voiceId + provider + locale + style preset + script audio cache key` を材料にする。
- cache hit は `cache_hit` status にし、新しい provider synthesize event として数えない。
- dedupe は billing ではなく二重記録防止のための boundary。enforcement は別 phase で扱う。

### 10.5 Failed / partial / skipped / cache_hit

失敗と非実行を分けて扱います。

- `skipped`: validation error、auth error、provider env missing、provider entitlement missing、voice setup missing、preflight blocking reason、cache hit 前の条件不一致など。provider request 前なので quota 消費しない本線。
- `cache_hit`: saved script audio を返した。新規 voice generation attempt ではなく、protected replay と同じく quota 消費にしない。
- `failed`: provider request または generation pipeline を試したが、結果を返せなかった。provider request 前後のどちらで失敗したかを `failure_stage` として sanitized metadata に残す候補。
- `partial`: provider bytes は得たが app-owned storage / replay staging に失敗した、または provider cost は発生した可能性があるが user-facing result が返らなかった。将来 refund / not_billable の判断対象。
- `not_billable`: audit には残すが quota 消費にしない。manual workflow や recovery-only event を残す場合に使う。

S5a では、この分類を設計に留めます。どの失敗を billable / refundable にするかは billing phase まで決めません。

### 10.6 Retention

quota event は provider cost / abuse prevention / support debug に使える一方、過剰な履歴保存は避ける。

推奨候補:

- MVP 初期: `quota_events` をまだ作らない。
- 導入時: raw content を保存しない sanitized event として、短期 retention を本線にする。
- text generation event: 30〜90 日程度の operational retention 候補。
- voice generation / clone event: provider cost や support 調査のため 90〜180 日程度の retention 候補。
- billing integration を入れる場合だけ、billing ledger と quota event retention を分けて再設計する。

削除方針:

- user account deletion では user-owned quota events も削除または anonymize する。
- provider request id など support 用 metadata は retention 後に削除する。
- aggregate usage が必要なら、raw event ではなく日次集計へ縮約する。

### 10.7 Privacy

保存しないもの:

- raw prompt。
- raw OpenAI / voice provider response。
- full script content。
- generated draft text。
- voice sample bytes / recording bytes。
- secret / API key / signed URL。
- provider auth header。

保存候補:

- provider name / model name。
- event type / status / category。
- related resource id。
- sanitized failure code / failure stage。
- provider request id。
- request fingerprint / dedupe key。
- estimated cost unit。

metadata は allowlist 方式にする。provider response を丸ごと `metadata` に入れない。

### 10.8 RLS / ownership

将来 `quota_events` table を作る場合の基本方針:

- `user_id` を必須にする。
- user は自分の `quota_events` だけ read できる。
- insert / update は service role 経由の server-side service に限定する。
- client から直接 insert させない。
- related `script_id / audio_id / voice_id / consent_id` は同じ `user_id` の owned resource だけにする。
- admin / support 用 read は別 policy または service role path で扱い、app UI の read model と混ぜない。

`quota_events` は ownership の source of truth ではありません。script / audio / voice の ownership は既存 table 側で引き直します。

### 10.9 Billing / enforcement からの分離

S5a の schema design は、billing と enforcement を実装しません。

- `quota_events` は将来の usage audit / enforcement input 候補。
- billing ledger ではない。
- subscription / plan / reset window / overage / refund は別設計にする。
- user-facing 残数表示や usage dashboard は別 phase。
- voice generation gating は quota event の write path が安定してから検討する。
- cache hit / protected replay は event を残すとしても non-billable で扱う。

### 10.10 MVP ではまだ実装しない範囲

- `quota_events` table。
- enum / migration / RLS policy。
- quota write service。
- text generation write path。
- voice generation write path。
- quota enforcement。
- billing / plan / subscription。
- usage dashboard。
- voice generation gating。
- cache key 変更。
- provider cost calculation。

## 11. S5b Text Generation Quota Event Write Path Design

S5b は design only です。ここでは、将来 `POST /api/script-studio/generate` が text generation quota event を記録する場合の責務境界と status 遷移を固定します。DB schema / migration、API contract change、`quota_events` table、write service、enforcement、billing、usage dashboard はまだ作りません。

### 11.1 現在の text generation flow

現在の実装境界:

```text
Client Script Studio panel
-> POST /api/script-studio/generate
-> route: auth / JSON parse / schema validation
-> service: provider selection / request mapping / pipeline call / safe response shaping
-> pipeline: prompt pack / provider call / validation / normalization / quality report / freeze preflight
-> provider adapter: mock or OpenAI raw candidates
```

重要:

- route は薄く保つ。
- client は provider selection、OpenAI adapter、server-only module、raw provider output を見ない。
- pipeline は provider raw candidates を validation / normalization し、model supplied metrics を信用しない。
- response は safe shape だけを返し、raw OpenAI response、full prompt、secret は返さない。

### 11.2 将来 quota event を書く自然な境界

推奨境界は server-side service です。

- route handler: auth / schema validation / service 呼び出しだけを担当する。quota event write は置かない。
- service: `generateScriptStudioDrafts` 相当の境界で、provider selection、request fingerprint、attempt lifecycle、safe response shaping を束ねる。将来の quota write orchestration はここに置く。
- generation pipeline: provider output を validation / normalization / quality report / freeze preflight に通す純粋寄りの処理。quota persistence を持たせない。
- provider adapter: raw candidates と sanitized provider metadata を返すだけ。quota event を直接書かない。

理由:

- auth 済み user、schema 通過済み input、provider name、pipeline result、safe error classification が service に集まる。
- route に business logic を増やさず、provider adapter に app quota の責務を持ち込まない。
- mock / OpenAI どちらでも同じ write path にできる。

### 11.3 Status 遷移

将来の text generation attempt は、次のように扱います。

```text
schema/auth 前 failure
-> no quota event

schema/auth 後、service に入る
-> planned または attempted
-> succeeded / failed / skipped / not_billable
```

候補 status:

- `attempted`: schema validation と auth を通過し、service が provider / pipeline 実行を開始した。
- `succeeded`: accepted draft が 1 件以上あり、safe response を返せた。
- `failed`: provider error、timeout、invalid provider response、pipeline exception などで user-facing result を返せなかった。
- `skipped`: provider call 前に env missing、provider unavailable、dedupe duplicate などで実行しなかった。
- `not_billable`: mock provider、internal test、または audit-only event として記録するが quota 消費しない。

S5d の判断で、`rejected` は正式 status にしません。accepted draft が 0 件の場合は `failed` + `failure_stage=pipeline_rejected` + `failure_code=no_accepted_candidate` で表します。

### 11.4 Error / outcome の扱い

- validation error: schema 通過前なので quota event 対象外。必要なら route log に留める。
- auth error: quota event 対象外。user-owned quota event を作る user が確定していない、または許可されていない。
- schema error: quota event 対象外。入力を直せばよい failure で、provider cost は発生していない。
- provider env missing: service 境界で `skipped` 候補。provider request 前なので quota 消費しない。
- provider selection invalid: `skipped` 候補。configuration issue として扱う。
- OpenAI provider error / timeout: `failed` 候補。provider request 後なら provider cost が発生した可能性があるが、billing 判断は後回し。
- invalid provider response: `failed` 候補。raw response は保存しない。
- accepted candidate あり: `succeeded` 候補。accepted count / rejected count / issue summary だけを metadata に残す候補。
- accepted candidate なし、rejected candidate あり: `failed` + `failure_stage=pipeline_rejected` 候補。raw candidate text は保存しない。
- pipeline issue warning / info のみ: `succeeded` 候補。warnings は sanitized counts / codes だけを残す。

### 11.5 Idempotency / dedupe / fingerprint

将来 write path では、同じ button press や retry で二重に quota event を増やさない。

候補:

- `idempotency_key`: 将来 client か route が発行する action 単位 key。S5b では API contract を変えないため、まだ request field には追加しない。
- `request_fingerprint`: service 側で schema 通過済み input を正規化して hash 化する。材料は `normalized brief + requestedVariants + boundedAdjustment + provider + model family`。
- `dedupe_key`: `userId:eventType:requestFingerprint:timeWindow` を基本にする。短い retry window での重複記録を抑える。

保存しない材料:

- raw prompt。
- raw user request body。
- full `userSeedText`。
- generated draft text。
- raw provider response。

`userSeedText / mustInclude / avoid` は fingerprint 用に正規化して hash 化し、quota event には raw value を残さない。

### 11.6 Provider metadata / privacy

保存候補:

- provider: `mock` または `openai`。
- model: OpenAI provider の model name。secret ではない値だけ。
- provider request id: OpenAI response id / request id が取れる場合、support 用に保存候補。ただし raw response は保存しない。
- candidate counts: raw candidate count、accepted count、rejected count。
- issue codes: sanitized issue code と severity count。
- failure stage: `provider_request / provider_response_parse / pipeline_validation / response_shaping` など。

保存しないもの:

- full hidden prompt。
- full output contract。
- raw OpenAI response。
- raw generated candidate text。
- raw rejected candidate。
- API key / auth header。
- user seed text の生値。

metadata は allowlist 方式にする。provider adapter が返した note をそのまま `metadata` に丸ごと入れない。

### 11.7 対象外の操作

次は text generation quota event の対象外です。

- accepted draft を手動フォームへコピーする。
- manual edit。
- saved script creation。
- readiness panel。
- manual revision hints。
- practice chunks。
- form freeze preflight preview。
- saved script read-only check。
- `この台本で練習開始` の将来 freeze UX。

これらは provider request を発生させず、ユーザーが script を練習可能な形へ整える manual workflow です。必要なら audit 用に `manual_workflow` を別設計できますが、MVP の text generation quota とは分けます。

### 11.8 将来の write path 擬似手順

実装する場合の順番:

```text
route: auth + schema validation
service: normalize request
service: build request_fingerprint / dedupe_key
service: create planned/attempted quota event candidate
service: select provider
service: run pipeline
service: classify result as succeeded / failed / skipped / not_billable
service: update quota event candidate with sanitized metadata
service: shape safe response
```

注意:

- API response shape は変えない。
- quota event の write failure で generation の user-facing response を壊すかは別途設計する。MVP では non-blocking write を本線候補にする。
- enforcement は write path が安定してから別 phase で扱う。
- provider raw output は quota event に保存しない。

### 11.9 S5b でまだ実装しない範囲

- `quota_events` table。
- DB schema / migration。
- quota write service。
- `POST /api/script-studio/generate` の response 変更。
- route handler の実装変更。
- provider adapter の実装変更。
- idempotency key の API field 追加。
- quota enforcement。
- billing。
- usage dashboard。
- UI 追加。

## 12. S5c Voice Generation Quota Event Write Path Design

S5c は design only です。ここでは、将来 `/api/speak-script` が見本音声生成の quota event を記録する場合の責務境界、cache hit / cache miss、provider synthesize、replay staging、failure 分類を固定します。DB schema / migration、API contract change、`quota_events` table、write service、enforcement、billing、usage dashboard、voice generation gating、cache key 変更はまだ作りません。

### 12.1 現在の voice generation flow

現在の実装境界:

```text
Client ListenPanel
-> POST /api/speak-script
-> route: auth / JSON parse / schema validation
-> service: provider readiness / owned saved script re-fetch / owned voice re-fetch
-> service: build script audio cache key
-> service: cache hit -> return existing app-owned replay reference
-> service: cache miss -> provider.synthesize
-> replay service: normalize provider output into app-owned storage / replay path
-> service: insert script_audios cache row
-> client: protected replay route /api/script-audio/[audioId]
```

重要:

- route は薄く保つ。
- client 送信の script text は信用せず、service が owned saved script を読み直す。
- `script_audios.cache_key` は current flow の cache identity であり、S5c では変更しない。
- provider URL / raw provider response は UI や cache identity の source of truth にしない。
- replay route は quota event write path ではなく、保存済み app-owned audio の読み出し境界。

### 12.2 将来 quota event を書く自然な境界

推奨境界は `speakScript` service です。

- route handler: auth / schema validation / service 呼び出しだけを担当する。quota event write は置かない。
- `speakScript` service: saved script / voice / provider readiness / cache key / cache hit / provider synthesize / replay staging / cache row insert の結果が集まる。将来の quota write orchestration はここに置く。
- provider adapter: provider request を実行し、`providerRequestId` と normalized `audioSource` を返す。quota event を直接書かない。
- replay service: provider output を app-owned storage と replay reference に正規化する。quota persistence を持たせない。
- replay route: protected audio fetch だけを担当する。replay は新規 generation attempt ではない。

理由:

- voice quota の判断材料は、owned script / owned voice / cache key / provider / style preset / cache hit or miss に依存する。
- provider adapter に app quota の責務を持たせると、mock / OpenAI / ElevenLabs の差し替えが重くなる。
- replay route は再生回数や playback failure の境界であり、provider cost の発生点ではない。

### 12.3 Cache hit / cache miss の扱い

- `cache_hit`: `script_audios` row が cache key に一致し、provider synthesize を呼ばず保存済み audio を返した。新しい voice generation attempt ではなく、quota 消費にしない。
- `cache_miss`: matching row がなく、provider synthesize に進む候補。将来 `script_audio_generation_attempt` の `attempted` 対象。
- duplicate insert: provider synthesize / staging 後、同時実行などで `script_audios` insert が duplicate になった場合は、再取得した cached row を返す。provider call が既に発生しているなら、将来は `attempted` だが `succeeded` または `partial` 寄りに分類する。
- stale or missing storage asset: `script_audios` row はあるが replay download に失敗する場合は replay route の failure。新規 provider call は起きていないため、新しい voice generation attempt とは分ける。

### 12.4 Status 遷移

将来の voice generation attempt は、次のように扱います。

```text
schema/auth 前 failure
-> no quota event

schema/auth 後、service に入る
-> saved script / voice / provider / cache key check
-> cache_hit / skipped / attempted
-> succeeded / partial / failed / not_billable
```

候補 status:

- `cache_hit`: provider synthesize を呼ばず、保存済み `script_audios` replay reference を返した。quota 消費にしない。
- `skipped`: provider unsupported、env missing、saved script missing、default voice missing、voice provider mismatch、validation/preflight blocking などで provider request 前に実行しなかった。
- `attempted`: cache miss 後、provider synthesize または mock synthesize を開始した。
- `succeeded`: provider bytes を app-owned storage に載せ、`script_audios` row または既存 duplicate row から replay reference を返せた。
- `partial`: provider synthesize は成功したが、app-owned storage upload、replay staging、または `script_audios` row の保存/再取得で user-facing result が不完全になった。provider cost が発生した可能性がある。
- `failed`: provider error、timeout、invalid synthesize result、temporary-url unsupported、storage failure などで user-facing audio を返せなかった。
- `not_billable`: mock provider、internal test、または audit-only として記録するが quota 消費しない。

S5c では status 設計だけに留めます。どの `failed / partial` を billable / refundable にするかは billing phase まで決めません。

### 12.5 Error / outcome の扱い

- validation error: schema 通過前なので quota event 対象外。
- auth error: quota event 対象外。user-owned event の user が確定していない、または許可されていない。
- saved script missing: service 境界の `skipped` 候補。provider request 前なので quota 消費しない。
- default voice missing: `skipped` 候補。`/setup/voice` recovery。
- selected voice missing / not owned: `skipped` 候補。ownership failure として扱い、quota 消費しない。
- provider unsupported / env missing: `skipped` 候補。provider request 前なので quota 消費しない。
- saved voice provider mismatch: `skipped` 候補。silent fallback しない。
- cache hit: `cache_hit`。quota 消費しない。
- provider synthesize success + storage staging success + cache row available: `succeeded`。
- provider synthesize success + storage upload failure: `partial` または `failed` 候補。provider cost が発生した可能性がある。
- provider synthesize success + `script_audios` insert duplicate + cached row re-fetch success: `succeeded` 候補。duplicate は concurrency 由来で、追加 provider call があったかは event metadata で分ける。
- provider synthesize success + `script_audios` insert failure: `partial` 候補。replay asset が存在しても canonical cache row が不完全。
- provider synthesize error / timeout / entitlement error: `failed` 候補。request id / failure point は sanitized metadata に留める。
- temporary-url unsupported: provider request 後に replay staging へ進めない場合は `partial` 候補。host / URL は保存しすぎない。
- replay route failure: protected replay / storage download の failure。新規 generation attempt ではなく、別の replay failure として扱う。

### 12.6 Idempotency / dedupe / fingerprint

将来 write path では、同じ generation action や retry で event を増やしすぎない。

候補:

- `idempotency_key`: 将来 client か route が発行する action 単位 key。S5c では API contract を変えないため、まだ request field には追加しない。
- `request_fingerprint`: service 側で owned data から作る hash。材料は `userId + scriptId + voiceId + provider + locale + voiceStylePreset + scriptAudioCacheKey`。
- `dedupe_key`: `userId:script_audio_generation_attempt:scriptId:voiceId:cacheKey:requestWindow` を基本にする。
- `provider_request_id`: provider synthesize 後に得られる request id。secret ではない範囲だけ保存候補。

保存しない材料:

- full script content。
- provider raw response。
- provider audio bytes。
- raw provider URL。
- signed URL。
- auth header / API key。

### 12.7 script audio cache key と quota dedupe key

- `script_audios.cache_key` は audio reuse の identity。材料は saved script content、locale、app-owned voice row id、provider、voice style preset。
- quota `dedupe_key` は event 二重記録防止の identity。cache key を材料にできるが、cache key そのものを billing decision にしない。
- cache key が一致して cache hit した場合は `cache_hit` とし、新規 provider synthesize event にはしない。
- cache key が変わる voice style preset / script content / voice row の変更は、将来 cache miss として新しい voice generation attempt になり得る。
- S5c では cache key 文字列、cache semantics、force regeneration は変更しない。

### 12.8 対象外の操作

次は voice generation quota event の対象外です。

- protected replay route の GET。
- saved audio playback。
- playbackRate change。
- open in new tab。
- audio element の load / seek / pause / replay。
- listen の preflight notice 表示。
- saved script read-only freeze candidate check。
- cache hit / cache reuse。
- script practice chunks。
- review / progress 表示。
- copy to manual form。
- manual edit。
- saved script creation。

これらは provider synthesize を発生させないため、voice generation quota とは分けます。必要なら将来 storage / replay usage の別 category で扱います。

### 12.9 将来の write path 擬似手順

実装する場合の順番:

```text
route: auth + schema validation
service: re-fetch owned saved script and voice
service: verify provider readiness / provider match
service: build script audio cache key
service: build request_fingerprint / dedupe_key
service: check cache
service: cache hit -> record cache_hit candidate if needed -> return
service: cache miss -> create attempted quota event candidate
service: provider.synthesize
service: stageScriptAudioForReplay
service: insert or re-fetch script_audios row
service: classify succeeded / partial / failed / skipped / not_billable
service: update quota event candidate with sanitized metadata
service: shape existing response
```

注意:

- API response shape は変えない。
- quota event write failure で見本音声生成 response を壊すかは別途設計する。MVP では non-blocking write を本線候補にする。
- enforcement は write path が安定してから別 phase で扱う。
- provider raw output、audio bytes、signed URL は quota event に保存しない。

### 12.10 S5c でまだ実装しない範囲

- `quota_events` table。
- DB schema / migration。
- quota write service。
- `/api/speak-script` の response 変更。
- route handler の実装変更。
- provider adapter の実装変更。
- idempotency key の API field 追加。
- voice generation gating。
- quota enforcement。
- billing。
- usage dashboard。
- cache key 変更。
- force regeneration。
- UI 追加。

## 13. S5d Quota Event Implementation Readiness Design

S5d は design only です。S5a / S5b / S5c で整理した quota event 設計を、実装直前の判断レベルまで具体化します。DB schema / migration、`quota_events` table、write service、API contract change、enforcement、billing、usage dashboard はまだ作りません。

### 13.1 最初の実装対象

最初の実装対象は text generation quota event にします。voice generation quota event は、その後にします。

理由:

- `POST /api/script-studio/generate` は、すでに auth / schema validation / service / provider pipeline の責務が分かれている。
- text generation は app-owned storage / replay staging / cache row insert と絡まないため、初回の write service と dedupe の検証に向いている。
- default provider が mock でも、OpenAI provider でも、service 境界で同じ event shape にしやすい。
- raw prompt / raw seed text / raw provider response を保存しない privacy 方針を先に固めやすい。
- voice generation は cache hit / cache miss / provider synthesize / replay staging / duplicate cache insert / protected replay failure の分類が多く、初回実装にすると write service と voice flow の両方を同時に揺らしやすい。

両方同時にやらない理由:

- text と voice では status の意味、dedupe 材料、failure stage、cost timing が違う。
- 初回 migration / RLS / write service / retention の問題を、2 系統の provider cost semantics と同時に解かない。
- write failure を non-blocking にする設計が正しく動くかを、小さい surface で先に確認する。
- quota event は enforcement / billing の前段なので、まず logging の安定性を確認する。

### 13.2 Quota event write service の責務

将来 `quota_events` を実装する場合、write service は route handler や provider adapter ではなく server-side service から呼ぶ補助境界にします。

責務:

- schema / auth 通過後の user と owned resource id だけを受ける。
- event payload を allowlist で正規化する。
- `event_type / category / subject_type / target_resource_type` を揃える。
- `status / failure_stage / billing_status` を明示する。
- `request_fingerprint / dedupe_key / idempotency_key` を受け取り、二重記録を抑える。
- duplicate になった場合は、新規 event を増やさず既存 event を返すか、safe metadata のみ merge する。
- provider / model / provider_request_id など secret ではない範囲だけ保存候補にする。
- failure code / issue count / accepted count / rejected count / cache result など、privacy-safe metadata だけを残す。
- raw prompt、raw seed text、full script content、generated draft text、raw provider response、audio bytes、raw provider URL、signed URL、secret、auth header は保存しない。
- write result は user-facing API response shape に混ぜない。必要なら server log / internal warning に留める。

write service は quota enforcement や billing decision を持ちません。使用量の audit input を作るだけにし、残数計算、plan、reset window、overage、refund は別 phase に分けます。

### 13.3 Write failure 時の方針

MVP の quota event write failure は non-blocking にします。

方針:

- quota event の insert / update / dedupe 失敗で、text generation や voice generation の user-facing response を壊さない。
- write failure は server log と internal warning に残す。
- client response shape は変えない。
- provider request が成功している場合でも、quota event write failure を理由に結果を捨てない。
- retry で二重 event が増えないよう、dedupe key / request fingerprint を使う。

再検討ポイント:

- quota enforcement を入れる phase では、write failure を non-blocking のままにすると利用制限をすり抜ける可能性がある。
- billing に入る phase では、provider cost が発生したのに event が残らないケースを許容できるか再検討する。
- enforcement / billing を扱うなら、transaction、outbox、retry queue、または write 成功を generation 前提にする設計を別途検討する。

S5d 時点では、quota event は canonical billing ledger ではありません。write failure は product flow を止めず、observability risk として扱います。

### 13.4 Status enum 方針

初期 migration の `status` は、試行の technical lifecycle を表す field にします。quota 消費や billing は `billing_status` のような補助 field に分けます。

初期 status 候補:

- `planned`: preflight / user action 前の候補。初期 write path では必須にしない。
- `attempted`: provider / pipeline / synthesize を開始した。
- `succeeded`: user-facing result を返せた。
- `failed`: 試行したが user-facing result を返せなかった。
- `skipped`: provider request 前に実行しなかった。
- `cache_hit`: voice generation で保存済み script audio を返し、provider synthesize を呼ばなかった。
- `partial`: provider cost は発生した可能性があるが、後段の app-owned staging / row persistence が完了しなかった。
- `not_billable`: audit には残すが quota / billing 消費にしない。
- `refunded`: billing phase まで使わないが、将来候補として残す。

`rejected` は初期 status enum には入れません。

- accepted draft が 0 件で pipeline が全 candidate を reject した場合は、`status=failed`、`failure_stage=pipeline_rejected`、`failure_code=no_accepted_candidate` として表す。
- accepted draft が 1 件以上あり、他 candidate が rejected の場合は、`status=succeeded` とし、metadata に `acceptedCount / rejectedCount` を残す。
- rejected candidate の raw text は保存しない。

`cache_hit / not_billable / partial` は status として残します。

- `cache_hit` は voice generation で provider cost が発生していない重要な lifecycle なので status にする。
- `not_billable` は audit-only / mock / internal test を明示するため status にする。
- `partial` は provider request 後に app-owned staging で失敗した可能性を示すため status にする。

補助 field 候補:

- `failure_stage`: `provider_selection / provider_request / provider_response_parse / pipeline_validation / pipeline_rejected / storage_staging / cache_row_insert / response_shaping / quota_event_write` など。
- `failure_code`: sanitized code。provider raw message は保存しない。
- `billing_status`: `not_evaluated / non_billable / billable_candidate / refund_candidate`。S5d では enforcement / billing に使わない。
- `cost_category`: `text_generation_quota / voice_generation_quota / voice_clone_quota`。

### 13.5 Billing / enforcement との分離

S5d の実装前判断でも、quota event logging は billing / enforcement から分離します。

- quota event は usage audit / future enforcement input。
- quota event は billing ledger ではない。
- `estimated_cost_unit` は将来の比較用候補で、請求額ではない。
- plan、subscription、reset window、overage、refund は別 design にする。
- user-facing 残数表示や usage dashboard は、write path が安定してから作る。
- voice generation gating は quota event write path が安定し、provider readiness / storage readiness の設計が固まってから検討する。

### 13.6 Protected replay failure の扱い

protected replay failure は、初期の `quota_events` には含めません。

理由:

- protected replay route は保存済み app-owned audio を読み出す境界であり、新規 provider cost の発生点ではない。
- playbackRate change、open in new tab、audio element の load / seek / pause / replay と同じく、voice generation quota とは分ける。
- `script_audios` row があるのに storage asset が欠けている場合は、storage / replay observability の問題であり、provider synthesize attempt とは別に見る。

将来必要なら、`storage_replay_usage` や `script_audio_replay_failure` のような別 category / log で扱います。S5d 時点では quota event schema の初期 migration へ入れません。

### 13.7 S5d でまだ実装しない範囲

- `quota_events` table。
- DB schema / migration。
- quota event write service。
- text generation quota event write path 実装。
- voice generation quota event write path 実装。
- API contract 変更。
- route response shape 変更。
- idempotency key の request field 追加。
- quota enforcement。
- billing。
- usage dashboard。
- voice generation gating。
- cache key 変更。
- provider 本接続。
- UI 追加。

## 14. S5e Text Generation Quota Event Implementation Plan

S5e は implementation plan only です。text generation quota event の初回実装に入る前に、migration 候補、RLS / ownership、write service interface、`generateScriptStudioDrafts` からの呼び出し位置を具体化します。DB schema / migration、write service 実装、API contract change、enforcement、billing、usage dashboard はまだ作りません。

### 14.1 初回実装の範囲

初回実装は `POST /api/script-studio/generate` の text generation attempt だけを対象にします。

対象:

- `script_generation_attempt`
- provider は `mock` と `openai`
- service 境界は `generateScriptStudioDrafts`
- route response shape は変えない
- UI には quota event id や残数を出さない

対象外:

- voice generation quota event
- voice clone quota event
- quota enforcement
- billing / plan / subscription
- usage dashboard
- regeneration / bounded adjustment の本格 UX
- `script_generation_requests` / `script_generation_candidates` table

### 14.2 Migration 候補

初回 migration 候補名:

```text
0009_phase_s5_quota_events.sql
```

`quota_events` は user-owned audit table として作ります。script content や raw prompt を持たず、ID と sanitized metadata だけを持つ。

候補 columns:

```sql
create table if not exists public.quota_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null,
  category text not null default 'text_generation_quota',
  status text not null,
  failure_stage text,
  failure_code text,
  billing_status text not null default 'not_evaluated',
  subject_type text not null,
  subject_id uuid,
  target_resource_type text not null default 'none',
  target_resource_id uuid,
  idempotency_key text,
  dedupe_key text,
  request_fingerprint text,
  provider text,
  provider_model text,
  provider_request_id text,
  metadata jsonb not null default '{}'::jsonb,
  attempted_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

S5f の初回実装では、`related_*` 系の FK や cost unit はまだ持たない。`subject_*` / `target_resource_*` は将来拡張のための抽象 slot とし、初回は `subject_type=script_studio`、`target_resource_type=none` に閉じる。

### 14.3 enum / text field 方針

初回 migration では Postgres enum を作らず、`text + check constraint` にします。

理由:

- event type / status / failure stage は増える可能性が高い。
- billing / enforcement に入る前なので、DB enum で早く固定しすぎない。
- check constraint なら migration で許容値を広げやすい。

check constraint 候補:

```sql
alter table public.quota_events
  add constraint quota_events_event_type_check
  check (event_type in (
    'script_generation_attempt'
  ));

alter table public.quota_events
  add constraint quota_events_category_check
  check (category in (
    'text_generation_quota'
  ));

alter table public.quota_events
  add constraint quota_events_status_check
  check (status in (
    'attempted',
    'succeeded',
    'failed',
    'skipped',
    'not_billable'
  ));

alter table public.quota_events
  add constraint quota_events_billing_status_check
  check (billing_status in (
    'not_evaluated',
    'non_billable',
    'billable_candidate',
    'refund_candidate'
  ));
```

`subject_type` と `target_resource_type` も text + check constraint にする。初回実装では許容値を狭くし、voice generation / clone / storage replay は後続 migration で広げる。

### 14.4 Index / unique / dedupe 候補

基本 indexes:

```sql
create index if not exists quota_events_user_attempted_at_idx
  on public.quota_events (user_id, attempted_at desc);

create index if not exists quota_events_user_event_type_attempted_at_idx
  on public.quota_events (user_id, event_type, attempted_at desc);

create index if not exists quota_events_user_status_attempted_at_idx
  on public.quota_events (user_id, status, attempted_at desc);

create index if not exists quota_events_user_request_fingerprint_idx
  on public.quota_events (user_id, request_fingerprint)
  where request_fingerprint is not null;

create index if not exists quota_events_provider_request_id_idx
  on public.quota_events (provider_request_id)
  where provider_request_id is not null;
```

dedupe constraint:

```sql
create unique index if not exists quota_events_user_dedupe_key_unique_idx
  on public.quota_events (user_id, dedupe_key)
  where dedupe_key is not null;
```

方針:

- `dedupe_key` は server-side retry / double submit の二重記録を抑えるために使う。
- `request_fingerprint` は分析・調査用で、unique にはしない。
- `idempotency_key` は API contract にまだ入れない。将来入れる場合は `(user_id, idempotency_key)` の partial unique を追加する。
- provider request id は provider 側で一意とは限らないため、初期 unique にはしない。

### 14.5 RLS / ownership 方針

`quota_events` は `user_id` owner 前提にする。

RLS 候補:

```sql
alter table public.quota_events enable row level security;

create policy "quota_events_select_own"
on public.quota_events
for select
using (auth.uid() = user_id);
```

insert / update / delete 方針:

- authenticated client からの direct insert は許可しない。
- authenticated client からの update / delete は許可しない。
- write service は server-side service role client で insert / update する。
- user read は自分の `quota_events` だけ許可候補にする。ただし初回 UI ではまだ読まない。
- admin / support visibility は service role path か別 policy で扱う。app UI の read model と混ぜない。

`quota_events` は ownership の source of truth ではない。related resource の ownership は、必要なときに `scripts / script_audios / voices / voice_consents` 側で再確認する。

### 14.6 Write service interface 案

将来の置き場所候補:

```text
services/quota/quota-event.service.ts
```

client:

- write service は `createSupabaseAdminClient()` を使う。
- `SUPABASE_SERVICE_ROLE_KEY` がない場合、初期 MVP では generation を止めず、quota event write skipped として server log に残す。

interface 候補:

```ts
type QuotaEventRef = {
  id: string;
};

type QuotaEventAttemptInput = {
  userId: string;
  eventType: "script_generation_attempt";
  category: "text_generation_quota";
  subjectType: "script_studio";
  targetResourceType: "none";
  provider: "mock" | "openai";
  model?: string | null;
  requestFingerprint: string;
  dedupeKey: string;
  idempotencyKey?: string | null;
  billingStatus?: "not_evaluated" | "non_billable";
  metadata?: Record<string, unknown>;
};

type QuotaEventCompletionInput = {
  event: QuotaEventRef | null;
  status: "succeeded" | "failed" | "skipped" | "not_billable";
  billingStatus?: "not_evaluated" | "non_billable" | "billable_candidate" | "refund_candidate";
  providerRequestId?: string | null;
  failureStage?: string | null;
  failureCode?: string | null;
  metadata?: Record<string, unknown>;
};

async function recordQuotaEventAttempt(input: QuotaEventAttemptInput): Promise<QuotaEventRef | null>;
async function markQuotaEventSucceeded(input: QuotaEventCompletionInput): Promise<void>;
async function markQuotaEventFailed(input: QuotaEventCompletionInput): Promise<void>;
async function markQuotaEventSkipped(input: QuotaEventCompletionInput): Promise<void>;
async function markQuotaEventNotBillable(input: QuotaEventCompletionInput): Promise<void>;
async function withNonBlockingQuotaEventWrite<T>(label: string, write: () => Promise<T>): Promise<T | null>;
```

実装時の注意:

- `recordQuotaEventAttempt` は `(user_id, dedupe_key)` conflict を処理する。
- duplicate の場合は既存 event ref を返すか、新規 event なしで `null` を返すかを実装時に統一する。推奨は既存 ref を返すこと。
- `mark*` は `event=null` のとき no-op にする。
- `mark*` で response shape は変えない。
- `metadata` は allowlist builder を通してから渡す。

### 14.7 Text generation service 呼び出し位置

将来の `generateScriptStudioDrafts` は、route から `user.id` を受け取る必要がある。

route 側の変更候補:

```ts
const user = await requireCurrentUser(supabase);
...
const result = await generateScriptStudioDrafts(parsed.data, { userId: user.id });
```

route の責務は引き続き auth / schema validation / service 呼び出しだけにする。quota event write は route に置かない。

service 側の呼び出し順:

```text
service: get providerName
service: toScriptGenerationRequest(input)
service: build normalized request fingerprint / dedupe key
service: provider config unavailable -> non-blocking record skipped -> throw existing AppError
service: recordQuotaEventAttempt(status=attempted or not_billable candidate)
service: create provider
service: runAsyncScriptGenerationPipeline
service: acceptedDrafts.length > 0 -> mark succeeded
service: acceptedDrafts.length === 0 -> mark failed, failure_stage=pipeline_rejected
service: provider / pipeline error -> mark failed with sanitized failure_stage/failure_code
service: shape existing safe response
```

分岐:

- auth error: route で止まる。quota event なし。
- schema error: route で止まる。quota event なし。
- invalid `SCRIPT_GENERATION_PROVIDER`: service で `skipped` 候補。provider request 前。
- `SCRIPT_GENERATION_PROVIDER=openai` かつ `OPENAI_API_KEY` missing: service で `skipped` 候補。provider request 前。
- mock provider: `status=not_billable` または `billing_status=non_billable` で完了。初期案では `status=not_billable` を優先する。
- OpenAI provider success + accepted draft あり: `succeeded`。
- OpenAI provider success + accepted draft なし: `failed` + `failure_stage=pipeline_rejected`。
- OpenAI provider error / timeout: `failed` + `failure_stage=provider_request`。
- provider response parse error: `failed` + `failure_stage=provider_response_parse`。
- pipeline exception: `failed` + `failure_stage=pipeline_validation` または `response_shaping`。

### 14.8 Fingerprint / dedupe 初期案

text generation の `request_fingerprint` は、schema 通過済み input を正規化して hash 化する。

材料:

- normalized `ScriptBrief` の raw 値ではなく、canonicalized JSON から SHA-256 などで hash 化した値。
- `requestedVariants`
- `boundedAdjustment`
- provider
- model family / model name
- output contract version
- guardrail version

raw value を保存しない材料:

- `userSeedText`
- `mustInclude`
- `avoid`

これらは fingerprint の input には入れてよいが、quota event row には hash / length / count だけを残す。

`dedupe_key` 初期案:

```text
userId:script_generation_attempt:requestFingerprint:shortRetryWindow
```

`shortRetryWindow` は 1〜5 分程度の bucket 候補。S5e では値を固定しないが、初回実装では 5 分以下を推奨する。dedupe は billing ではなく二重記録防止であり、同じ intent を後から再生成する UX とは別に扱う。

### 14.9 billing_status 方針

`billing_status` は初期 migration では `text + check constraint` にする。Postgres enum は使わない。

初期値:

- default: `not_evaluated`
- mock provider: `non_billable`
- OpenAI provider success: `billable_candidate`
- OpenAI provider error after request: `billable_candidate` または `refund_candidate` 候補。ただし S5e では billing に使わない。
- provider config missing / skipped: `non_billable`
- pipeline rejected: `billable_candidate` 候補。provider request が成功しているため。ただし user-facing refund 判断は billing phase までしない。

`billing_status` は user-facing billing ではなく、将来 billing / refund 設計へ渡す候補値に留める。

### 14.10 Write failure logging / alert 方針

初期 MVP では quota event write failure は non-blocking。

logging:

- `console.warn` か既存 logger 相当で `Quota event write failed` を残す。
- 残す値は `eventType / category / status / failureStage / provider / requestFingerprint prefix / dedupeKey prefix` まで。
- raw input、raw prompt、raw seed text、raw provider response は log に出さない。

alert:

- S5e では alert 実装なし。
- 将来 production observability がある場合、write failure rate が高いときだけ internal alert 候補。
- billing / enforcement に進むまでは user-facing error にしない。

API response:

- shape は変えない。
- quota event id は返さない。
- quota write warning も返さない。

### 14.11 Privacy-safe metadata

保存してよいもの:

- `requestedVariants`
- `boundedAdjustment`
- `targetLengthSeconds`
- `difficulty`
- `priority`
- `languagePreference`
- `topicCategory` / `situation` / `audience` / `tone` の option value
- `seedLength`
- `mustIncludeCount`
- `avoidCount`
- `rawCandidateCount`
- `acceptedCount`
- `rejectedCount`
- issue severity counts
- allowlisted issue codes
- prompt pack guardrail ids
- output contract version
- provider id
- model name
- provider request id

保存してはいけないもの:

- raw prompt
- full output contract text
- raw `userSeedText`
- raw `mustInclude`
- raw `avoid`
- generated draft text
- rejected candidate text
- raw OpenAI response
- secret / API key / auth header
- user email

metadata は allowlist builder で組み立てる。provider adapter notes をそのまま保存しない。

### 14.12 S5e でまだ実装しない範囲

- DB schema / migration。
- `quota_events` table。
- RLS policy 作成。
- `services/quota/quota-event.service.ts` 実装。
- route / service のコード変更。
- API contract 変更。
- idempotency key request field。
- quota enforcement。
- billing。
- usage dashboard。
- voice generation quota event。
- provider 本接続。
- UI 追加。

### 14.13 S5f first implementation

S5f では、初回対象を Script Studio の `script_generation_attempt` に絞って最小実装した。

追加済み:

- `supabase/migrations/0009_phase_s5_quota_events.sql`
- `types/database.ts` の `quota_events` table 型
- `services/quota/quota-event.service.ts`
- `generateScriptStudioDrafts(input, { userId })` からの non-blocking write 接続

実装方針:

- route は auth / schema validation / service 呼び出しのままにし、response shape は変えない。
- quota write は service 境界で orchestration する。
- `SCRIPT_GENERATION_PROVIDER=mock` は `not_billable` / `non_billable` として完了させる。
- `SCRIPT_GENERATION_PROVIDER=openai` で `OPENAI_API_KEY` がない場合は provider request 前なので `skipped + failure_stage=provider_config` として記録候補にする。
- accepted draft があれば `succeeded`、accepted draft が 0 件なら `failed + failure_stage=pipeline_rejected`。
- provider request / parse / pipeline error は sanitized `failure_stage` / `failure_code` だけを残す。
- quota event write failure は `console.warn` に留め、generation 本体を止めない。
- raw prompt、raw seed text、raw `mustInclude` / `avoid`、generated draft text、raw provider response は保存しない。fingerprint / dedupe は hash と count / option value の metadata だけを使う。

まだ未実装:

- voice generation quota event
- voice clone quota event
- quota enforcement
- billing
- usage dashboard
- UI 表示
- API response への quota event id 追加

### 14.14 S5f dev DB migration / mock provider smoke checklist

S5f-db-smoke-plan は checklist only です。Codex は secret 操作、Supabase 本番運用、手動ブラウザ確認を前提にしません。dev DB で後から確認するときは、まず `supabase/migrations/0009_phase_s5_quota_events.sql` を dev project に適用し、`SCRIPT_GENERATION_PROVIDER=mock` のまま Script Studio generation route を確認します。

#### Migration 適用後に確認すること

- `public.quota_events` table が存在する。
- `event_type` は `script_generation_attempt` だけを許可している。
- `status` は `attempted / succeeded / failed / skipped / not_billable` だけを許可している。
- `failure_stage` は allowlisted value または `null` だけを許可している。
- `billing_status` は `not_evaluated / non_billable / billable_candidate / refund_candidate` だけを許可している。
- `metadata` は JSON object で、raw text を入れる column はない。
- `(user_id, dedupe_key)` の partial unique index がある。
- `attempted_at / completed_at / created_at / updated_at` があり、`completed_at >= attempted_at` の check がある。
- RLS が enabled。
- authenticated user は自分の event を select できる。
- authenticated client から insert / update / delete を許可する policy がない。
- service role write 前提を維持している。

#### Mock provider smoke で確認すること

前提:

- dev env では `SCRIPT_GENERATION_PROVIDER=mock` を使う。
- `SUPABASE_SERVICE_ROLE_KEY` が設定されていれば quota event write が走る。
- `SUPABASE_SERVICE_ROLE_KEY` がない場合も generation 本体は止まらず、server log の non-blocking warning に留まる。
- API response shape に quota event id や quota warning は出さない。

確認項目:

- authenticated session で `POST /api/script-studio/generate` を実行できる。
- response の top-level shape は既存どおり `provider / acceptedDrafts / rejectedCandidates / issues / promptPackSummary / nextAction`。
- mock generation は成功し、accepted draft preview が返る。
- `quota_events` に `event_type=script_generation_attempt` が記録される。
- current S5f implementation では mock provider の successful generation は `status=not_billable`、`billing_status=non_billable` として完了する。
- billable provider success を確認する段階では、accepted draft がある場合に `status=succeeded`、`billing_status=billable_candidate` を期待する。ただし OpenAI live smoke はこの checklist の範囲外。
- `SCRIPT_GENERATION_PROVIDER=openai` かつ `OPENAI_API_KEY` missing のような provider config unavailable は、provider request 前なので `status=skipped`、`failure_stage=provider_config`、`billing_status=non_billable` を期待する。
- accepted draft 0件を作る provider / fixture を将来用意した場合は、`status=failed`、`failure_stage=pipeline_rejected` を期待する。現 mock provider は通常 accepted draft を返すので、この分岐は mock default だけでは作りにくい。
- quota event write が失敗しても、generation response 自体は通常どおり返る。

#### Privacy 確認

`quota_events.metadata` と top-level columns に、次が保存されていないことを確認する。

- raw prompt
- full output contract text
- raw `userSeedText`
- raw `mustInclude`
- raw `avoid`
- generated draft text
- rejected candidate text
- raw OpenAI response
- secret / API key / auth header
- user email

保存してよいものは、option value、length、count、hash、candidate count、issue code / count、guardrail ids、provider / provider model、provider request id のような allowlisted metadata だけです。

#### SQL Editor 確認クエリ例

Secret や個人値は query に書かない。SQL Editor が service role 相当で動く場合、RLS の実効確認は authenticated client / session 側でも別途確認する。

```sql
-- table exists
select to_regclass('public.quota_events') as quota_events_table;
```

```sql
-- constraints
select
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.quota_events'::regclass
order by conname;
```

```sql
-- indexes, including the partial unique dedupe index
select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'quota_events'
order by indexname;
```

```sql
-- RLS enabled
select
  relrowsecurity,
  relforcerowsecurity
from pg_class
where oid = 'public.quota_events'::regclass;
```

```sql
-- policies: expect select-only policy for authenticated users
select
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'quota_events'
order by policyname;
```

```sql
-- latest text generation quota events, inspect metadata keys without exposing raw values
select
  id,
  user_id,
  event_type,
  status,
  failure_stage,
  billing_status,
  provider,
  provider_model,
  attempted_at,
  completed_at,
  jsonb_object_keys(metadata) as metadata_key
from public.quota_events
where event_type = 'script_generation_attempt'
order by attempted_at desc
limit 50;
```

```sql
-- privacy spot check: these keys should return no rows
select id, metadata
from public.quota_events
where metadata ?| array[
  'raw_prompt',
  'userSeedText',
  'mustInclude',
  'avoid',
  'englishScript',
  'generatedDraftText',
  'raw_provider_response'
];
```

### 14.15 S5g Voice Generation Quota Event Implementation Plan

S5g は implementation plan only です。S5f で入れた text generation quota event write path と同じ原則で、将来の voice generation quota event を実装する前に、scope、schema 拡張、service 境界、status 分岐、dedupe、privacy を固定します。DB migration、write service 変更、API contract change、quota enforcement、billing、usage dashboard、手動 browser smoke、dev DB 操作はまだ行いません。

#### 初回対象

初回対象は `script_audio_generation_attempt` だけにします。

対象:

- `/api/speak-script` から呼ばれる `speakScript` service の見本音声生成。
- cache miss 後に provider synthesize へ進む script audio generation。
- app-owned replay staging と `script_audios` cache row 保存までの結果分類。
- mock provider / real provider を同じ service boundary で扱う。

対象外:

- voice clone creation。
- consent creation。
- voice sample upload。
- protected replay observability。
- playback / playbackRate change。
- cache hit replay。
- force regeneration。
- quota enforcement / billing / usage dashboard。
- UI 表示。

#### S5f schema との関係

S5f の `0009_phase_s5_quota_events.sql` は text generation first のため、check constraint を狭く切っています。S5g 実装時は、先に schema 拡張 migration が必要です。

将来拡張する候補:

- `event_type`: `script_audio_generation_attempt` を追加。
- `category`: `voice_generation_quota` を追加。
- `status`: `cache_hit` と `partial` を追加。
- `failure_stage`: `cache_lookup / ownership_check / provider_config / provider_request / storage_staging / pipeline_validation` を追加。
- `subject_type`: `saved_script` または `script_audio_generation` を追加候補にする。
- `target_resource_type`: `script_audio` / `voice` / `script` のどれを使うかは migration 前に最小設計する。

S5g 計画段階では既存 migration を変更しません。

#### 責務境界

推奨境界は `speakScript` service です。

- `/api/speak-script` route: auth / schema validation / service 呼び出しだけを担当する。quota event write は置かない。
- `speakScript` service: owned saved script / owned voice / provider readiness / cache key / cache lookup / provider synthesize / replay staging / `script_audios` insert の結果が集まるため、quota event lifecycle を orchestration する。
- provider adapter: provider-specific request を実行し、`providerRequestId` と normalized `audioSource` を返す。quota event を直接書かない。
- `stageScriptAudioForReplay`: provider output を app-owned storage / replay reference に正規化する。storage staging の success / failure は service 側の classification に渡す。
- `/api/script-audio/[audioId]`: protected replay fetch だけを担当する。新規 generation attempt ではないため、voice generation quota event は書かない。

#### 初回 implementation flow

将来実装時の順序:

```text
route: auth + schema validation
service: re-fetch owned saved script and selected/default voice
service: verify provider readiness and provider match
service: build scriptAudioCacheKey
service: build voice generation request_fingerprint / dedupe_key
service: cache lookup
service: cache hit -> optional cache_hit/not_billable event -> return existing replay reference
service: cache miss -> record attempted event candidate
service: provider.synthesize
service: stageScriptAudioForReplay
service: insert script_audios row, or handle duplicate + re-fetch
service: mark succeeded / failed / partial / not_billable
service: return existing response shape
```

S5f と同じく、quota event write failure は non-blocking にし、見本音声生成 response を止めません。

#### Cache hit / cache miss の扱い

- `cache_hit`: `script_audios` row が `scriptId + voiceId + cacheKey` に一致し、provider synthesize を呼ばずに既存 replay reference を返した状態。新規 voice generation attempt ではなく、quota 消費にしない。
- `cache_miss`: matching row がなく、provider synthesize に進む状態。ここから `script_audio_generation_attempt` の `attempted` 候補になる。
- protected replay: `/api/script-audio/[audioId]` の GET は保存済み audio の読み出しであり、新しい generation attempt ではない。
- duplicate insert: provider synthesize と staging 後、同時実行などで `script_audios` insert が duplicate になった場合、provider call は発生しているため `cache_hit` ではなく `succeeded` または `partial` 候補として扱う。
- cache key は S5g では変更しない。quota dedupe key は cache key を材料にするが、cache key そのものを quota / billing の canonical source にはしない。

#### Status 方針

将来の status:

- `cache_hit`: provider synthesize なしで保存済み audio を返した。quota 消費ではない。
- `attempted`: cache miss 後、provider synthesize を始めた。
- `succeeded`: provider synthesize、app-owned replay staging、`script_audios` row 保存または duplicate row re-fetch が完了し、user-facing replay reference を返せた。
- `failed`: user-facing audio を返せなかった。
- `skipped`: provider request 前に、owned data / provider config / voice setup / validation で止まった。
- `not_billable`: mock provider、internal test、audit-only event。S5f の mock text generation と同様に、quota / billing 消費ではない。
- `partial`: provider synthesize は成功した可能性があるが、storage staging / cache row persistence / replay reference 整合で user-facing result が不完全になった。

billing / refund の厳密判断は S5g では行いません。`billing_status` は候補値に留めます。

#### Failure stage 方針

初回候補:

- `provider_config`: provider unsupported、env missing、provider readiness false、voice provider mismatch など provider request 前の configuration failure。
- `provider_request`: provider synthesize error、timeout、entitlement reject、invalid provider response。
- `storage_staging`: provider bytes を app-owned storage / replay reference に載せ替える段階の failure。`temporary-url` unsupported もここに寄せる候補。
- `cache_lookup`: `script_audios` cache lookup / duplicate row re-fetch の failure。
- `ownership_check`: saved script missing、selected voice missing、selected voice not owned、provider mismatch。
- `pipeline_validation`: schema 通過後、service 内で必要な input shape / cache key / replay path を組めない failure。

auth error / schema validation error は route 境界で止まるため、quota event 対象外です。

#### Dedupe / fingerprint 方針

`request_fingerprint` は raw script text や provider raw output を保存せず、owned IDs と cache identity から作る hash にします。

材料候補:

- `userId`
- `scriptId`
- `voiceId`
- `provider`
- `locale`
- `voiceStylePreset`
- `scriptAudioCacheKey`

`dedupe_key` 候補:

```text
script_audio_generation_attempt:<provider>:<scriptId>:<voiceId>:<scriptAudioCacheKey>:<shortRetryWindow>
```

S5f と同じく、短い retry window は 5 分を初期候補にします。`user_id + dedupe_key` の partial unique を使う場合、dedupe key 自体に raw script text は含めません。

#### script audio cache key と quota dedupe key の違い

- `script_audios.cache_key` は audio reuse の identity。saved script content、locale、voice row id、provider、voice style preset から作られます。
- quota `dedupe_key` は event 二重記録防止の identity。cache key を材料にできますが、provider cost や billing の最終判断にはしません。
- cache hit は `script_audios.cache_key` に基づく reuse で、new generation attempt ではありません。
- cache miss で provider call が発生した場合だけ、voice generation quota 対象になり得ます。

#### Privacy-safe metadata

保存してよい候補:

- `script_id`
- `voice_id`
- `provider`
- `locale`
- `voice_style_preset`
- `script_audio_cache_key` またはその hash / prefix
- `provider_model` / provider output format の allowlisted value
- `provider_request_id`
- `cached`
- `cache_lookup_result`
- `stored_asset_content_type`
- `stored_asset_byte_length`
- `failure_stage`
- sanitized `failure_code`

保存しないもの:

- raw script text
- generated audio bytes
- provider raw response
- provider temporary URL
- signed URL
- storage signed URL
- API key / auth header
- raw provider error payload
- user email

`stored_asset.storageObjectKey` は app-owned internal path で、必要なら保存候補にできます。ただし user-facing response や UI へ直接出すものではありません。

#### Write failure 方針

S5f と揃えます。

- write failure は non-blocking。
- `speakScript` の response shape は変えない。
- quota event id / quota warning は response に出さない。
- server log / internal warning に留める。
- billing / enforcement に入る段階で、write failure を blocking にするか再検討する。

#### まだ実装しないこと

- DB migration / check constraint 拡張。
- `quota_events` schema 変更。
- `services/quota` の generic voice write helper。
- `/api/speak-script` / `speakScript` の実装変更。
- `script_audio_generation_attempt` の write path。
- voice clone quota event。
- quota enforcement。
- billing。
- usage dashboard。
- UI 追加。
- cache key 変更。
- provider 本接続。
- dev DB migration apply。
- manual browser smoke。

### 14.16 S5h Quota Events Voice Schema Extension Plan

S5h は plan only です。S5g の `script_audio_generation_attempt` を実装する前に、S5f で追加した `quota_events` schema をどう拡張するかを migration 案として固定します。DB migration file はまだ追加せず、既存 `0009_phase_s5_quota_events.sql` も変更しません。write service、`/api/speak-script` 接続、quota enforcement、billing、usage dashboard、UI もまだ実装しません。

#### 現在の 0009 schema の前提

S5f の `0009_phase_s5_quota_events.sql` は text generation first で狭く作っています。

- `event_type`: `script_generation_attempt` のみ。
- `category`: `text_generation_quota` のみ。
- `status`: `attempted / succeeded / failed / skipped / not_billable` のみ。
- `failure_stage`: text generation 用の `provider_selection / provider_config / provider_request / provider_response_parse / pipeline_validation / pipeline_rejected / response_shaping / quota_event_write`。
- `subject_type`: `script_studio` のみ。
- `target_resource_type`: `none` のみ。
- `(user_id, dedupe_key)` の partial unique は既にある。
- RLS は authenticated user の own row select のみで、client insert / update / delete は開けていない。

この narrow schema は S5f の text generation write path には合っています。voice generation へ進むときは、既存 table を作り直さず、次の migration で check constraint を差し替えて許可値を広げる方針にします。

#### Migration 方針

将来 migration 候補名は `0010_phase_s5_voice_quota_events.sql` のような後続 file にします。

方針:

- `0009` は編集しない。
- table / RLS / existing indexes / partial unique は維持する。
- 追加するのは主に check constraint の許可値拡張。
- 必要なら voice lookup 用 index を 1〜2 個だけ追加する。
- column 追加は初回では避ける。`subject_id / target_resource_id / provider / provider_model / provider_request_id / metadata` の既存 column で足りる形を優先する。

候補:

```sql
alter table public.quota_events
  drop constraint if exists quota_events_event_type_check,
  add constraint quota_events_event_type_check check (
    event_type in ('script_generation_attempt', 'script_audio_generation_attempt')
  );

alter table public.quota_events
  drop constraint if exists quota_events_category_check,
  add constraint quota_events_category_check check (
    category in ('text_generation_quota', 'voice_generation_quota')
  );

alter table public.quota_events
  drop constraint if exists quota_events_status_check,
  add constraint quota_events_status_check check (
    status in ('attempted', 'succeeded', 'failed', 'skipped', 'not_billable', 'cache_hit', 'partial')
  );

alter table public.quota_events
  drop constraint if exists quota_events_failure_stage_check,
  add constraint quota_events_failure_stage_check check (
    failure_stage is null
    or failure_stage in (
      'provider_selection',
      'provider_config',
      'provider_request',
      'provider_response_parse',
      'pipeline_validation',
      'pipeline_rejected',
      'response_shaping',
      'quota_event_write',
      'storage_staging',
      'cache_lookup',
      'ownership_check'
    )
  );

alter table public.quota_events
  drop constraint if exists quota_events_subject_type_check,
  add constraint quota_events_subject_type_check check (
    subject_type in ('script_studio', 'saved_script')
  );

alter table public.quota_events
  drop constraint if exists quota_events_target_resource_type_check,
  add constraint quota_events_target_resource_type_check check (
    target_resource_type in ('none', 'script_audio')
  );
```

必要なら追加する index:

```sql
create index if not exists quota_events_user_category_attempted_at_idx
  on public.quota_events (user_id, category, attempted_at desc);

create index if not exists quota_events_user_subject_attempted_at_idx
  on public.quota_events (user_id, subject_type, subject_id, attempted_at desc)
  where subject_id is not null;

create index if not exists quota_events_user_target_attempted_at_idx
  on public.quota_events (user_id, target_resource_type, target_resource_id, attempted_at desc)
  where target_resource_id is not null;
```

初回実装では index を増やしすぎません。`quota_events_user_attempted_at_idx` と `quota_events_user_event_type_attempted_at_idx` で足りるなら、追加 index は後回しにできます。

#### event_type 拡張案

追加する値:

- `script_audio_generation_attempt`

まだ追加しない値:

- `script_audio_regeneration_attempt`
- `voice_clone_creation_attempt`
- `voice_setup_upload_attempt`

理由:

- 初回対象を見本音声生成の cache miss / provider synthesize に絞る。
- force regeneration は未実装なので、別 event type を先に増やさない。
- voice clone / consent / sample upload は cost と ownership 境界が違うため、別 phase にする。

#### status 拡張案

追加する値:

- `cache_hit`
- `partial`

`cache_hit` は metadata や `billing_status=non_billable` だけではなく、status にします。

理由:

- cache hit は voice generation 特有の重要な lifecycle。
- provider synthesize を呼んでいないため、`attempted` と混ぜると cost boundary が曖昧になる。
- `skipped` だと setup / ownership / provider config failure と同じに見え、cache reuse の正常系を表しにくい。
- UI / usage audit で「保存済み音声を返しただけ」を集計しやすい。

`partial` も status にします。

理由:

- provider synthesize は成功した可能性があるが、storage staging / cache row persistence / replay reference 整合で user-facing result が不完全なケースを `failed` だけで潰さない。
- billing / refund 判断はまだしないが、将来の audit に残す価値がある。

#### failure_stage 拡張案

既存 text generation の値は維持します。voice 用に追加する候補:

- `storage_staging`: provider bytes を app-owned storage / replay reference に載せ替える段階。
- `cache_lookup`: `script_audios` cache lookup、duplicate insert 後の re-fetch、cache row persistence 近傍。
- `ownership_check`: saved script / selected voice / default voice / provider match の owned data check。

既存値を voice でも使うもの:

- `provider_config`: provider unsupported、env missing、provider readiness false、voice provider mismatch。
- `provider_request`: provider synthesize error、timeout、entitlement reject。
- `provider_response_parse`: provider response が invalid、request id / bytes / content type を解釈できない。
- `pipeline_validation`: schema 通過後、service 内で cache key / replay path / normalized input を作れない。
- `quota_event_write`: quota write 自体の internal warning 用。user-facing response には混ぜない。

追加しない候補:

- `replay_fetch`: protected replay は generation attempt ではないため、quota_events ではなく storage / replay observability の別枠にする。
- `billing_decision`: billing / enforcement は別責務。

#### subject / target resource 方針

初回の推奨:

- `subject_type = 'saved_script'`
- `subject_id = scripts.id`
- `target_resource_type = 'script_audio'`
- `target_resource_id = script_audios.id` when available, otherwise `null`

理由:

- voice generation の canonical input は saved script。
- script text snapshot は保存しないが、owned saved script ID を subject にすると source of truth と合う。
- output は script audio なので、成功後に `script_audios.id` を target にできる。
- provider audio / replay asset を target resource type にすると provider internals や storage object key を canonical にしやすいので、初回は避ける。

metadata に入れる補助 ID:

- `voice_id`
- `script_id`
- `script_audio_id` if available
- `script_audio_cache_key_hash` または prefix

まだ入れない subject / target 候補:

- `provider_audio`: provider raw output を source of truth に見せやすいため初回は避ける。
- `replay_asset`: storage / replay observability と混ざるため初回は避ける。
- `voice`: voice は重要な材料だが、primary subject は saved script にする。voice ID は metadata と dedupe 材料で扱う。

#### dedupe_key / request_fingerprint 方針

既存 `(user_id, dedupe_key)` partial unique はそのまま使います。text generation と voice generation が共存するため、dedupe key は event type prefix を必ず含めます。

材料:

- `userId`
- `scriptId`
- `voiceId`
- `provider`
- `locale`
- `voiceStylePreset`
- `scriptAudioCacheKey`
- short retry window

候補:

```text
script_audio_generation_attempt:<provider>:<scriptId>:<voiceId>:<scriptAudioCacheKey>:<retryWindow>
```

長さ制約:

- `dedupe_key / idempotency_key / request_fingerprint` は existing text column のまま使う。
- UUID と 24 char cache key を中心にするため、text column で問題ない。
- raw script text、raw provider response、signed URL は key に含めない。

retry window:

- S5f と同じ 5 分を初期候補にする。
- cache hit event を記録する場合も、同じ event type prefix と retry window で二重記録を抑える。

request fingerprint:

- raw script text ではなく、owned IDs と cache identity を hash 化する。
- `scriptAudioCacheKey` は script content 由来の hash なので、そのまま raw text を保存しない前提と相性がよい。

#### metadata allowlist

保存してよい候補:

- `script_id`
- `voice_id`
- `script_audio_id`
- `provider`
- `provider_model`
- `locale`
- `voice_style_preset`
- `script_audio_cache_key_hash`
- `script_audio_cache_key_prefix`
- `cache_lookup_result`
- `cached`
- `stored_asset_content_type`
- `stored_asset_byte_length`
- `provider_request_id`
- sanitized `failure_code`
- sanitized `failure_stage`

扱いに注意する候補:

- `stored_asset_storage_object_key`: app-owned internal path。debug 価値はあるが user id / script id / voice id を含むため、初回は保存しないか、必要時だけ service log に留める。
- `provider_model`: allowlisted model name のみ。raw request body は保存しない。
- `provider_request_id`: provider の request id だけ。raw response payload は保存しない。

保存しないもの:

- raw script text
- generated audio bytes
- provider raw response
- provider raw error payload
- provider temporary URL
- storage signed URL
- auth header
- API key
- user email
- full storage object bytes

#### RLS / ownership 方針

S5f の RLS を維持します。

- authenticated user は own `quota_events` select のみ可能。
- authenticated client から insert / update / delete は開けない。
- write は service role 前提。
- `quota_events` は ownership source ではない。owned saved script / voice / script_audio の再取得は既存 service 側で行う。

#### S5i first implementation

S5i では S5h の plan に沿って、voice generation quota event 用の受け皿だけを追加しました。

- `0010_phase_s5_voice_quota_events.sql` で、既存 `quota_events` の check constraint を後続 migration として拡張する。repo に migration file は追加済みだが、dev DB apply は別途 smoke 手順で確認する。
- `event_type` は `script_generation_attempt` に加えて `script_audio_generation_attempt` を許可する。
- `category` は `voice_generation_quota` を許可する。
- `status` は `cache_hit` / `partial` を許可する。
- `failure_stage` は `storage_staging` / `cache_lookup` / `ownership_check` を許可する。
- `subject_type` は `saved_script`、`target_resource_type` は `script_audio` を許可する。
- table / RLS / indexes / `(user_id, dedupe_key)` partial unique は `0009` のまま維持する。
- column 追加はしない。
- DB types は voice 用 union を含む形に同期する。
- quota write service は `script_audio_generation_attempt` の attempt / cache hit / skipped / partial を受けられる helper と、voice 用 privacy-safe metadata allowlist を持つ。

S5i でも `/api/speak-script` / `speakScript` へはまだ接続しません。実際の voice generation quota event 記録は次フェーズ以降に回します。

#### S5j first connection

S5j では `speakScript` service 境界に voice quota event write を接続しました。

- route は引き続き auth / schema validation / service 呼び出しだけを担当する。
- API response shape、`script_audios.cache_key`、provider adapter behavior は変更しない。
- cache hit は `status=cache_hit`、`billing_status=non_billable` として記録する。
- cache miss で provider synthesize に進む場合だけ `status=attempted` を作る。
- provider synthesize / replay staging / cache row persistence / duplicate re-fetch が完了した場合は `succeeded` にする。
- provider request failure は `failed + provider_request`。
- replay/storage staging failure は `failed + storage_staging`。
- cache lookup / cache row persistence failure は `failed + cache_lookup`。
- script / voice / provider ownership mismatch は `failed + ownership_check`。
- provider unsupported / config unavailable は `skipped + provider_config`。
- provider success 後に cache row persistence などが不完全になった場合だけ `partial` を使う。
- quota write failure は non-blocking。dev DB に `0009/0010` が未適用の場合も warning に留め、見本音声生成本体は止めない。

#### S5k text + voice dev DB smoke checklist

S5k-plan は checklist consolidation only です。Codex は dev DB migration apply、secret 操作、手動ブラウザ確認を前提にしません。後から dev DB で確認するときは、`0009_phase_s5_quota_events.sql` と `0010_phase_s5_voice_quota_events.sql` を順に適用し、text generation と voice generation の write path を同じ `quota_events` table で確認します。

適用後に確認すること:

- `public.quota_events` table が存在する。
- `0009` の base columns / indexes / RLS / `(user_id, dedupe_key)` partial unique が維持されている。
- `0010` 後の `event_type` は `script_generation_attempt / script_audio_generation_attempt` を許可している。
- `category` は `text_generation_quota / voice_generation_quota` を許可している。
- `status` は `attempted / succeeded / failed / skipped / not_billable / cache_hit / partial` を許可している。
- `failure_stage` は text 用の `provider_selection / provider_config / provider_request / provider_response_parse / pipeline_validation / pipeline_rejected / response_shaping / quota_event_write` と、voice 用の `storage_staging / cache_lookup / ownership_check` を許可している。
- `subject_type` は `script_studio / saved_script`、`target_resource_type` は `none / script_audio` を許可している。
- RLS が enabled で、authenticated user は自分の event を select できる。
- authenticated client から insert / update / delete を許可する policy がない。
- SQL Editor は service role 相当で動くことがあるため、RLS の実効確認には限界がある。RLS の実挙動は後で authenticated client/session から別途確認する。

Text generation smoke:

- dev env は `SCRIPT_GENERATION_PROVIDER=mock` を使う。
- authenticated session で `POST /api/script-studio/generate` を実行する。
- API response shape は `provider / acceptedDrafts / rejectedCandidates / issues / promptPackSummary / nextAction` のまま。
- `quota_events` に `event_type=script_generation_attempt`、`category=text_generation_quota` が記録される。
- mock successful generation は `status=not_billable`、`billing_status=non_billable` として完了する。
- provider config unavailable は `status=skipped`、`failure_stage=provider_config`、`billing_status=non_billable` を期待する。
- accepted draft 0件の fixture を将来用意した場合は `status=failed`、`failure_stage=pipeline_rejected` を期待する。
- raw prompt、raw seed text、raw `mustInclude / avoid`、generated draft text、raw provider response が保存されていない。

Voice generation smoke:

- dev env は `VOICE_PROVIDER=mock` を使う。
- authenticated session で、保存済み script と default voice がある状態から `POST /api/speak-script` を実行する。
- API response shape は `audioUrl / cached / cacheKey / voice` のまま。
- cache miss で provider synthesize に進む場合、`event_type=script_audio_generation_attempt`、`category=voice_generation_quota` が `attempted -> succeeded` へ進む。
- mock provider の successful generation は `billing_status=non_billable` を期待する。
- 同じ script / voice / locale / style / cache key で再実行して cache hit した場合は、`status=cache_hit`、`billing_status=non_billable` を期待する。
- cache hit / protected replay は provider synthesize を呼ばないため、新しい billable voice generation attempt ではない。
- provider config unavailable は `status=skipped`、`failure_stage=provider_config` を期待する。
- ownership / voice / provider mismatch は `status=failed`、`failure_stage=ownership_check` を期待する。
- provider synthesize failure は `status=failed`、`failure_stage=provider_request` を期待する。
- storage / replay staging failure は `status=failed` または本当に中間状態なら `partial`、`failure_stage=storage_staging` を期待する。
- cache lookup / cache row persistence failure は `status=failed` または本当に中間状態なら `partial`、`failure_stage=cache_lookup` を期待する。
- raw script text、audio bytes、signed / temporary URL、raw provider response、raw provider error payload が保存されていない。

SQL Editor 確認クエリ例:

```sql
-- table exists
select to_regclass('public.quota_events') as quota_events_table;
```

```sql
-- constraints after 0009 + 0010
select
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.quota_events'::regclass
order by conname;
```

```sql
-- indexes, including user + dedupe partial unique
select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'quota_events'
order by indexname;
```

```sql
-- RLS flag only; SQL Editor may bypass RLS as service role
select
  relrowsecurity,
  relforcerowsecurity
from pg_class
where oid = 'public.quota_events'::regclass;
```

```sql
-- policies; expect authenticated select only
select
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'quota_events'
order by policyname;
```

```sql
-- latest events, text + voice
select
  id,
  user_id,
  event_type,
  category,
  status,
  failure_stage,
  billing_status,
  subject_type,
  subject_id,
  target_resource_type,
  target_resource_id,
  provider,
  provider_model,
  attempted_at,
  completed_at
from public.quota_events
order by attempted_at desc
limit 50;
```

```sql
-- status summary
select
  event_type,
  category,
  status,
  billing_status,
  count(*) as count
from public.quota_events
group by event_type, category, status, billing_status
order by event_type, status, billing_status;
```

```sql
-- metadata keys by latest events; inspect keys without exposing values
select
  id,
  event_type,
  status,
  jsonb_object_keys(metadata) as metadata_key
from public.quota_events
order by attempted_at desc
limit 100;
```

```sql
-- privacy spot check: should return no rows
select id, event_type, metadata
from public.quota_events
where metadata ?| array[
  'raw_prompt',
  'userSeedText',
  'mustInclude',
  'avoid',
  'englishScript',
  'generatedDraftText',
  'raw_provider_response',
  'raw_script_text',
  'script_content',
  'audio_bytes',
  'signed_url',
  'temporary_url',
  'raw_provider_error',
  'authorization',
  'user_email'
];
```

```sql
-- text generation expected rows
select
  event_type,
  status,
  billing_status,
  provider,
  metadata
from public.quota_events
where event_type = 'script_generation_attempt'
order by attempted_at desc
limit 10;
```

```sql
-- voice generation expected rows
select
  event_type,
  status,
  failure_stage,
  billing_status,
  subject_id as script_id,
  target_resource_id as script_audio_id,
  provider,
  metadata
from public.quota_events
where event_type = 'script_audio_generation_attempt'
order by attempted_at desc
limit 10;
```

S5k でもまだ実施しないこと:

- dev DB migration apply。
- manual browser smoke。
- secret / env 実値の記録。
- quota enforcement。
- billing。
- usage dashboard。
- voice generation gating。
- cache key 変更。

#### S5h/S5i でまだ実装しないこと

- `0009_phase_s5_quota_events.sql` の変更。
- voice clone quota event。
- quota enforcement。
- billing。
- usage dashboard。
- UI 追加。
- cache key 変更。
- provider 本接続。
- dev DB migration apply。
- manual browser smoke。

## 15. 将来の Quota Event Model 候補

まだ migration は作りません。候補 shape だけを整理します。

```ts
type QuotaEventCandidate = {
  id: string;
  user_id: string;
  event_type:
    | "script_generation_attempt"
    | "script_regeneration_attempt"
    | "script_adjustment_attempt"
    | "script_audio_generation_attempt"
    | "script_audio_regeneration_attempt"
    | "voice_clone_creation_attempt"
    | "voice_setup_upload_attempt";
  category:
    | "text_generation_quota"
    | "voice_generation_quota"
    | "voice_clone_quota"
    | "storage_replay_usage"
    | "manual_workflow";
  status:
    | "planned"
    | "skipped"
    | "cache_hit"
    | "attempted"
    | "succeeded"
    | "failed"
    | "partial"
    | "not_billable"
    | "refunded";
  subject_type:
    | "script_studio"
    | "saved_script"
    | "script_audio"
    | "voice_clone"
    | "voice_setup"
    | "manual_workflow";
  target_resource_type:
    | "script"
    | "script_audio"
    | "voice"
    | "voice_consent"
    | "script_generation_request"
    | "none";
  provider: string | null;
  model: string | null;
  related_script_id: string | null;
  related_audio_id: string | null;
  related_voice_id: string | null;
  related_consent_id: string | null;
  related_generation_request_id: string | null;
  idempotency_key: string | null;
  dedupe_key: string | null;
  request_fingerprint: string | null;
  provider_request_id: string | null;
  estimated_cost_unit: number | null;
  billing_status:
    | "not_evaluated"
    | "non_billable"
    | "billable_candidate"
    | "refund_candidate"
    | null;
  failure_code: string | null;
  failure_stage: string | null;
  occurred_at: string;
  completed_at: string | null;
  metadata: unknown;
};
```

候補 event type:

- `script_generation_attempt`
- `script_regeneration_attempt`
- `script_adjustment_attempt`
- `script_audio_generation_attempt`
- `script_audio_regeneration_attempt`
- `voice_clone_creation_attempt`
- `voice_setup_upload_attempt`

候補 status:

- `planned`: user action 前や preflight 段階の候補。
- `skipped`: provider request 前に実行しなかった。
- `cache_hit`: saved script audio を再利用した。
- `attempted`: provider request または generation pipeline を試行した。
- `succeeded`: user-facing result を返せた。
- `failed`: 試行したが失敗した。
- `partial`: provider cost は発生した可能性があるが、user-facing result が完了しなかった。
- `not_billable`: 記録対象だが quota 消費ではない。
- `refunded`: いったん消費扱いにしたが返却した。

S5d の判断として、`rejected` は初期 status enum に入れません。accepted draft が 0 件の場合は `failed` と `failure_stage=pipeline_rejected` で表し、accepted draft が 1 件以上ある場合は `succeeded` と metadata の count で表します。

注意:

- 今回は案だけ。
- DB schema / migration は作らない。
- API は作らない。
- billing 実装はしない。
- raw prompt、raw provider response、full script content、generated draft text、secret に近い情報は保存しない。

## 16. UI 方針

将来 UI では次のように見せます。

- quota 消費の可能性がある操作は押す前に分かる。
- cache reuse は quota 消費ではないと分かる。
- copy / manual edit は quota 消費ではないと分かる。
- regeneration は quota 消費対象になり得ると分かる。
- provider readiness / default voice / saved audio cache は、既存状態の表示に留める。
- provider failure はユーザーに責任がない場合がある。
- 現時点では quota enforcement / billing / 残数表示はないので、UI に課金・残数を出さない。
- preflight-only copy では「これは quota 消費ではない」と明示する。
- quota を使う操作と、read-only check / preview を見た目と言葉で分ける。
- S4h の quota preflight notice は説明だけで、quota enforcement、残数表示、billing、`quota_events` 書き込みは行わない。
- `/scripts/new` では draft generation / copy / manual edit / save の境界を、`/scripts/[id]/listen` では cache hit / replay / generation / regeneration の境界を示す。

## 17. 実装ロードマップ

- S4f: quota event design doc。text / voice / clone / storage の event boundary を整理する。
- S4g: provider readiness / cache reuse UI refinement。実装済み: 既存 flow を壊さず、cache hit と provider readiness の説明を整える。
- S4h: quota preflight copy only。実装済み: 実際の enforcement なしで、将来 quota 対象になり得る操作を UI copy で示す。
- S5a: quota event schema design。実施済み: migration 前の model / event type / status / subject / dedupe / RLS / retention / privacy を docs に固定する。
- S5b: text generation quota event write path design。実施済み: service 境界、status 遷移、idempotency / dedupe / privacy を docs に固定する。DB / API / write path 実装なし。
- S5c: voice generation quota event write path design。実施済み: `/api/speak-script` の cache hit / cache miss / provider synthesize / replay staging / failure 分類を docs に固定する。DB / API / write path 実装なし。
- S5d: quota event implementation readiness design。実施済み: 最初の実装対象は text generation、write failure は non-blocking、`rejected` は status ではなく `failed + failure_stage` で表す方針を docs に固定する。DB / API / write service 実装なし。
- S5e: text generation quota event implementation plan。実施済み: migration 候補、RLS、write service interface、service 呼び出し位置を docs に固定する。DB / API / write service 実装なし。
- S5f: text generation quota event first implementation。実装済み: migration / DB types / write service / service 接続を小さく入れる。
- S5g: voice generation quota event implementation plan。実施済み: 初回対象を `script_audio_generation_attempt` のみに絞り、cache hit / cache miss、status / failure_stage、dedupe / privacy を docs に固定する。DB / API / write path 実装なし。
- S5h: quota_events voice schema extension plan。実施済み: 後続 migration で広げる event_type / category / status / failure_stage / subject / target の候補を docs に固定する。migration file / write path 実装なし。
- S5i: voice quota schema extension first implementation。実装済み: `0010` migration / DB types / quota write helper 受け皿を小さく入れる。
- S5j: voice generation quota event write path first implementation。実装済み: `speakScript` service 境界で cache hit / cache miss / provider synthesize / staging 結果を non-blocking に記録する。API response shape / cache key / provider behavior は変更しない。
- S5k-plan: text + voice quota_events DB smoke checklist consolidation。実施済み: `0009/0010` 適用後に text / voice quota event の warning-free write を確認するための checklist と SQL query を docs に固定する。dev DB migration apply / manual smoke は実施しない。
- S5k: dev DB quota_events migration / mock provider smoke。`0009/0010` 適用後に text / voice quota event の warning-free write を実 DB で確認する。
- S5l: quota dashboard / usage summary。ユーザーに残数や利用履歴を見せる。
- S6: billing / plan integration if needed。plan、reset window、overage、refund などを扱う。

## 18. 今回まだやらないこと

- API route 追加。
- voice clone quota event write path 実装。
- voice generation quota event write path 実装。
- quota enforcement。
- billing integration。
- user plan / subscription。
- usage dashboard。
- provider cost calculation。
- voice generation gating。
- `script_freezes` table。
- freeze persistence。
- cache key 変更。
- force regeneration。
- provider 本接続。
- OpenAI live smoke。
- secret 入力。
- 手動ブラウザ確認。
- 追加の UI 実装。

## 19. 成功条件

- text generation quota と voice generation quota の違いが明確。
- quota 消費にする操作 / しない操作が明確。
- cache reuse / regeneration の扱いが明確。
- failed / partial event の扱い方針が整理されている。
- event type / status / subject / target resource / idempotency / dedupe key が整理されている。
- text generation quota event の write boundary と status 遷移が整理されている。
- voice generation quota event の write boundary、cache hit / cache miss、provider synthesize、replay staging、failure 分類が整理されている。
- 実装開始順は text generation first、voice generation second と明確。
- quota event write service の責務が route / pipeline / provider adapter から分離されている。
- write failure は初期 MVP では non-blocking と決まっている。
- `rejected` は初期 status enum に入れず、`failed + failure_stage` で表す方針が明確。
- protected replay failure は quota event ではなく、将来の storage / replay observability として別扱いにする。
- text generation quota event 初回実装の migration 候補、RLS、write service interface、service 呼び出し位置が整理されている。
- `billing_status` は初期 migration では text + check constraint とし、default は `not_evaluated` と明確。
- quota event write failure の logging と non-blocking 方針が整理されている。
- privacy-safe metadata の allowlist と保存禁止項目が整理されている。
- retention / privacy / RLS / ownership の方針が整理されている。
- billing と enforcement から分離している。
- bounded choice によってユーザー要求を制御する方針が明確。
- 将来の `quota_events` model 候補が整理されている。
- MVP では enforcement せず、saved script canonical 方針を維持する。
- 次に実装へ進む順番が明確。
