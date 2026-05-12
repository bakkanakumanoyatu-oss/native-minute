# Script Studio Voice Generation Preflight Plan

この文書は Script Studio Phase S4d の設計メモです。MVP では saved script を canonical としたまま、見本音声生成 / script audio generation の直前に何を確認するかを固定します。Phase S4e では、この設計に沿って `/scripts/[id]/listen` に音声生成前の UX copy / preflight only 表示を追加しました。Phase S4g では、同じ表示の中で provider readiness / default voice / saved audio cache / regeneration の読み方を少し整理しました。Phase S4h では、cache hit / protected replay は quota 消費ではなく、cache miss generation / regeneration は将来 voice generation quota 対象になり得ることを UI copy として追加しました。Phase S5c では、将来 voice generation quota event を書く場合の write path design を [script-studio-quota-event-plan.md](./script-studio-quota-event-plan.md) に固定しました。Phase S5d では、最初の quota event 実装は text generation から始め、voice generation はその後にする判断を同 doc に固定しました。Phase S5g では、voice generation quota event の初回実装計画を同 doc に固定しました。Phase S5h では、voice 用 schema extension plan を同 doc に固定しました。Phase S5i では、voice quota 用の後続 migration / DB types / quota service 受け皿だけを追加しました。Phase S5j では、`speakScript` service 境界に non-blocking の voice quota event write を接続しました。

S5j でも API response shape、freeze persistence、quota enforcement、voice generation gating、provider 本接続は追加していません。既存の listen flow、`/api/speak-script` route、`script_audios` cache key、protected replay flow も変更していません。

## 1. 目的

- 見本音声生成前に saved script を server 側で読み直す理由を定義する。
- voice generation cost を守る。
- script quality が悪いまま音声生成へ進むことを減らす。
- ユーザーに「音声生成前の確認」を理解させる。
- MVP では freeze persistence を持たず、saved script を canonical とする。
- cache reuse と regeneration の意味を混同しないようにする。

## 2. 用語定義

- `Saved Script`: 既存の `scripts` table に保存された script。S4d/S4e 時点の canonical source。
- `Voice Generation Preflight`: 見本音声生成の前に、saved script / voice setup / provider / storage / cost 前提を確認する表示・判断用の check。S4e 時点では UX copy / preflight only 表示で、永続化しない。
- `Script Audio Generation`: saved script content と voice から見本音声 bytes を作り、app-owned storage / replay route に載せる処理。
- `Script Audio Cache`: `script_audios` row と app-owned storage にある保存済み見本音声。cache identity は server-owned script content、locale、voice row、provider、style などで決まる。
- `Voice Provider`: mock / ElevenLabs / OpenAI などの synthesize adapter。app の canonical source ではなく、音声 bytes を作る外部または mock 境界。
- `Default Voice`: 現在の provider に一致する `voices` row の既定 voice。listen の見本生成で使う app-owned voice source。
- `Voice Setup`: consent / default voice / provider readiness / provider requirements が満たされ、見本音声生成に進める状態。
- `Blocking Reason`: 生成前に止めるべき理由。将来 gating 対象にする候補。
- `Warning`: 生成はできるが、ユーザーに先に説明したい注意。
- `Info`: 状態説明。保存、freeze、quota 消費、cache reuse などの誤解を避けるための情報。
- `Next Action`: ユーザーが次に取るべき操作。例: voice 設定、script 複製、新しい script 作成、record へ進む、生成する。
- `Voice Generation Attempt`: provider を使って新しい script audio を作る試行。将来 voice quota 対象。
- `Voice Regeneration`: 同じ script / voice / provider 近傍で音声を作り直す操作。cache hit ではなく新規 provider call が発生する場合は quota 対象にする可能性が高い。

## 3. Source Of Truth

- saved script が canonical。
- generated draft / copied draft / manual form draft は canonical ではない。
- script audio は saved script content から生成される派生物。
- preflight は表示・判断用で、まだ保存しない。
- 音声生成時は client 送信の script text を信用せず、server 側で owned saved script を読み直す。
- `/api/speak-script` は client から `scriptId / voiceId / voiceStylePreset` を受けても、script content は `services/scripts` から user ownership 付きで再取得する。
- script audio cache key は saved script content / locale / app voice row id / provider / voice style preset から決まる前提を維持する。
- replay URL は raw provider URL ではなく、`script_audios.storage_path` に保存した app-owned replay route reference を使う。

## 4. Preflight の確認項目

### Script quality

- saved script が存在する。
- content が空でない。
- target length から大きく外れていない。
- readiness / freeze preflight に blocking reason がない。
- long sentence / long chunk が多すぎない。
- focus words が 1〜3 個に収まりやすい。
- breath point が少なすぎない。
- generated draft metadata ではなく、saved script content から quality report を再計算できる。

### Voice setup

- user がログイン済み。
- consent が必要な provider では consent がある。
- default voice がある。
- saved voice の provider が現在の `VOICE_PROVIDER` と一致する。
- provider が利用可能。
- provider env が揃っている。
- unsupported provider で silent fallback しない。
- provider requirements は factory から読み、provider 固有条件を UI / service に直書きしない。

### Storage / replay

- `script-audios` bucket を使う。
- replay route は authenticated route として protected audio を返す。
- `script_audios.storage_path` は provider 直 URL ではなく app-owned replay reference。
- provider bytes は `stageScriptAudioForReplay` で app-owned storage へ載せ替える。
- cache hit と regeneration を区別する。
- `temporary-url` source は host / fetch 方針を固定するまで本線にしない。
- replay download は `script_audios` row と stored asset metadata をもとに server-side で行う。

### Cost / quota

- script audio generation は voice quota 対象。
- cache reuse は新しい voice generation attempt ではない。
- regeneration は quota 対象にする可能性が高い。
- copy to manual form は voice quota 消費ではない。
- manual edit は voice quota 消費ではない。
- saved script creation は voice quota 消費ではない。
- text generation quota と voice generation quota は分ける。
- clone voice creation は script audio generation とは別の高コスト操作として扱う。
- quota event の詳細は `docs/script-studio-quota-event-plan.md` で扱う。

## 5. Blocking / Warning / Info

### Blocking

- saved script がない。
- saved script content が空。
- user が未ログイン。
- voice setup がない。
- consent が必要な provider で consent がない。
- default voice がない。
- saved voice の provider が現在の provider と一致しない。
- provider env がない。
- unsupported provider。
- `script-audios` bucket / replay route / storage policy の必須設定がない。
- preflight blocking reason がある。
- provider output を app-owned replay に正規化できない。

### Warning

- script が少し長い。
- long sentence がある。
- long chunk がある。
- breath point が少ない。
- focus words が多め、または未選択。
- cache reuse のため「更新」しても同じ音声に見える可能性がある。
- provider quality / voice quality は完全制御できない。
- provider style preset を変えた場合、cache identity が変わり新規生成になる可能性がある。
- mock と real provider では音声品質や latency が異なる。

### Info

- this is a saved script check.
- this is not freeze persistence.
- this may reuse cached audio.
- voice generation happens only after user action.
- generated draft metadata is not used here.
- playbackRate は client-side 再生速度であり、provider 再生成や cache key 変更ではない。
- cache hit は新規 voice generation attempt ではない。
- raw provider URL / raw provider response は UI に出さない。

## 6. UX 方針

- listen 画面で音声生成前に saved script check を見せる。
- blocking がある場合は、将来的には生成ボタンを止める可能性がある。
- MVP ではまず read-only / UX copy に留め、gating はしない。
- quota を使う操作は押す前に分かるようにする。
- cache reuse と regeneration を区別する。
- 「更新しても同じ音声に戻る可能性がある」ことを説明する。
- 編集したい場合は duplicate / new script 方針を案内する。
- in-place edit は unsafe として扱う。
- warning は不安を煽る採点ではなく、「先に直すと練習しやすい点」として見せる。
- voice setup の不足は `setup/voice` へ戻す。

## 7. 既存 listen flow との関係

- `ListenPanel` は既存の `POST /api/speak-script` / replay flow を維持する。
- S4e でも gating しない。
- S4e でも `script_audios` cache key を変えない。
- S4e でも provider 本接続には進まない。
- saved-script freeze candidate check は read-only のまま。
- S4e の `VoiceGenerationPreflightNotice` は、saved script check ではなく voice setup / cache reuse / quota boundary / freeze persistence なしを説明する補助表示として置く。
- S4g では同 component に provider readiness、default voice、saved audio、cache behavior の状態を既存データだけで追加表示する。
- `speakScript` は引き続き saved script と selected/default voice を server 側で読み直す。
- cache hit がある場合は provider synthesize を呼ばず、保存済み `storage_path` を返す。
- cache miss の場合だけ provider synthesize と app-owned replay staging に進む。
- provider unavailable でも保存済み見本音声がある場合は、listen を継続できる current flow を壊さない。
- S4e で、listen の音声生成前 UX copy / preflight only を追加済み。これは生成ボタンを止める gating ではなく、既存 listen panel の直前で読む注意喚起に留める。
- S4g で、cache hit は quota 消費ではないこと、regeneration は将来 quota 対象になり得るが force regeneration は未実装であることを UI copy に補足した。
- S4h で、quota preflight copy only として、cache hit / protected replay / preflight notice は quota 消費ではなく、cache miss の新規見本音声生成や明示的な regeneration / update は将来 voice generation quota 対象になり得ることを明示した。

## 8. 将来の API / DB 候補

今回は実装しません。今後必要になるかもしれない候補だけ整理します。

### `POST /api/script-studio/voice-preflight`

- 必要になるタイミング: listen 画面で server-side preflight result を明示的に取得し、UI 表示や将来 gating に使いたいとき。
- 触るリスク: auth、ownership、saved script re-fetch、voice setup、provider readiness、storage readiness の責務分離。
- MVPで後回しにできるか: できる。現時点では saved-script check と existing listen flow で足りる。

### `POST /api/script-studio/freeze`

- 必要になるタイミング: `この台本で練習開始` を本接続し、音声生成前の明示 boundary を保存したいとき。
- 触るリスク: freeze persistence、script versioning、quota、voice setup gate との結合。
- MVPで後回しにできるか: できる。S4d では作らない。

### `quota_events`

- 必要になるタイミング: text generation / voice generation / clone creation の回数制限や billing audit を入れるとき。
- 触るリスク: plan、reset window、失敗時の消費扱い、cache hit の扱い。
- MVPで後回しにできるか: mock 本線ではできる。real provider を広げる前に再検討する。

### `script_audio_generation_events`

- 必要になるタイミング: script audio の provider call、cache miss、latency、failure を audit したいとき。
- 触るリスク: provider internals を保存しすぎること、raw response / secret に近い情報を残すこと。
- MVPで後回しにできるか: できる。`script_audios` cache row は既に replay に必要な最小情報を持つ。

### `script_freezes`

- 必要になるタイミング: freeze event、script snapshot、voice generation audit を永続化したいとき。
- 触るリスク: saved script との不整合、freeze 後編集、script versioning との関係。
- MVPで後回しにできるか: できる。S4c 方針どおり今は作らない。

### `script_versions`

- 必要になるタイミング: review / progress / script audio の履歴意味を script snapshot と強く結びたいとき。
- 触るリスク: 既存 `takes` が full script snapshot を持たない前提から大きく広がる。
- MVPで後回しにできるか: できる。duplicate / new script 方針で当面避ける。

## 9. 推奨方針

- MVP では saved script only を維持する。
- voice generation preflight はまず read-only / UX copy として導入する。S4e では listen に preflight only 表示を追加済み。
- actual gating は quota / provider readiness / storage readiness が固まるまで延期する。
- voice generation は server 側で saved script を読み直して行う。
- cache reuse と regeneration を UI で区別する。
- `script_freezes` はまだ作らない。
- raw provider output や provider URL を UI に出さず、app-owned replay reference だけを扱う。
- provider fallback は silent に行わず、現在 provider と saved voice provider の一致を守る。

## 10. 次の実装ロードマップ

- S4d: voice generation preflight design doc。
- S4e: listen の音声生成前 UX copy / preflight only。実装済み: `/scripts/[id]/listen` の補助表示。DB / API / gating / cache key 変更なし。
- S4f: quota event design。実施済み: `docs/script-studio-quota-event-plan.md`。
- S4g: provider readiness / cache reuse UI refinement。実装済み: `/scripts/[id]/listen` の preflight notice 内表示。DB / API / gating / cache key 変更なし。
- S4h: quota preflight copy only。実装済み: `/scripts/new` と `/scripts/[id]/listen` に quota 境界の説明を追加。DB / API / enforcement / cache key 変更なし。
- S5a: quota event schema design。実施済み: `quota_events` の subject / target resource / status / idempotency / retention / privacy / RLS 方針を docs に固定。DB / API / enforcement 変更なし。
- S5b: text generation quota event write path design。実施済み: `POST /api/script-studio/generate` の service 境界を docs に固定。DB / API / write path 実装なし。
- S5c: voice generation quota event write path design。実施済み: `/api/speak-script` の cache hit / cache miss / provider synthesize / replay staging / failure 分類を docs に固定。DB / API / write path 実装なし。
- S5d: quota event implementation readiness design。実施済み: 初回実装は text generation first、voice generation は second とする判断を docs に固定。DB / API / write path 実装なし。
- S5g: voice generation quota event implementation plan。実施済み: 初回対象を `script_audio_generation_attempt` のみに絞り、cache hit / cache miss、status / failure_stage、dedupe / fingerprint、privacy、non-blocking write failure を docs に固定。DB / API / write path 実装なし。
- S5h: quota_events voice schema extension plan。実施済み: 後続 migration で広げる event_type / category / status / failure_stage / subject / target の候補を docs に固定。migration file / write path 実装なし。
- S5: 必要になった時点で freeze persistence design。
- S6: quota / billing / generation history。

## 11. 今回まだやらないこと

- code implementation。
- DB schema / migration。
- API route 追加。
- voice generation gating。
- quota implementation。
- freeze persistence。
- provider 本接続。
- script audio cache key 変更。
- listen flow redesign。
- OpenAI / voice provider live smoke。
- secret 入力。
- 手動ブラウザ確認。
