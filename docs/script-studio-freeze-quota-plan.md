# Script Studio Freeze / Quota Plan

この文書は Script Studio Phase S3e から続く freeze / quota / cost control の設計メモです。S3d までの `draft preview -> 手動フォームへコピー -> 編集 -> 既存保存` を壊さず、将来の freeze persistence / quota / voice generation cost control を入れる前に、状態遷移と source of truth を固定します。Phase S4a では、この設計に沿って `/scripts/new` に表示用の freeze UX copy / preflight preview を追加しました。Phase S4b では、`/scripts/[id]/listen` に saved script の read-only freeze candidate check を追加しました。Phase S4c では、MVP では `script_freezes` table を今すぐ作らず、saved script only で進める判断を固定します。Phase S4d では、見本音声生成直前の preflight design を [script-studio-voice-generation-preflight-plan.md](./script-studio-voice-generation-preflight-plan.md) に分離しました。Phase S4e では、`/scripts/[id]/listen` に音声生成前の UX copy / preflight only 表示を追加しました。Phase S4f では、quota event の詳細設計を [script-studio-quota-event-plan.md](./script-studio-quota-event-plan.md) に分離しました。Phase S4h では、その設計を UI copy として `/scripts/new` と `/scripts/[id]/listen` に反映しました。Phase S5a では、`quota_events` の schema design を同 quota event plan に固定しました。Phase S5b では、Script Studio text generation の quota event write path design を同 quota event plan に固定しました。Phase S5c では、voice generation quota event write path design を同 quota event plan に固定しました。Phase S5d では、実装直前の判断として text generation first、non-blocking write failure、status enum 方針を同 quota event plan に固定しました。Phase S5e では、text generation quota event 初回実装計画として migration 候補、RLS、write service interface、service 呼び出し位置を同 quota event plan に固定しました。Phase S5f では、Script Studio text generation の `script_generation_attempt` だけを `quota_events` に non-blocking で記録する初回実装を追加しました。Phase S5g では、voice generation quota event の初回実装計画を同 quota event plan に固定しました。Phase S5h では、voice generation 対応に必要な quota_events schema extension plan を同 quota event plan に固定しました。

この文書自体は設計メモです。S5f では text generation の quota event 初回 write path だけ実装しましたが、API route 追加、quota enforcement、billing、freeze 保存、voice generation quota event 実装、OpenAI / voice provider live smoke、手動ブラウザ確認は行っていません。

## 1. 目的

- Script Studio の生成、保存、freeze、音声生成、quota の境界を明確にする。
- 音声生成コストを守る。
- ユーザー要求が青天井にならないようにする。
- 既存の手動保存 flow と将来の freeze flow を衝突させない。
- `scripts` row を読む main loop (`listen -> record -> review -> progress`) の canonical source を曖昧にしない。

## 2. 用語定義

- `ScriptBrief`: ユーザーの seed、topic、situation、audience、tone、length、difficulty、priority、mustInclude、avoid をまとめた生成前の構造化入力。
- `Generated Draft`: provider / pipeline が返した生成候補。preview 用であり、保存済み script ではない。
- `Accepted Draft`: validation / normalization / quality report / freeze preflight を通った候補。UI に表示できるが、まだ canonical data ではない。
- `Rejected Candidate`: blocking issue などで accepted draft にならなかった候補。raw provider output は UI に出さず、issues だけを扱う。
- `Copied Draft`: accepted draft から `title / englishScript / target seconds` だけを手動フォームへコピーした状態。
- `Manual Form Draft`: `/scripts/new` の editable form state。ユーザーが自由に直せる保存前の入力。
- `Saved Script`: 既存の `scripts` table に保存された script。S4c 時点では main loop の canonical source。
- `Frozen Script`: 音声生成対象として明示的に確定された saved script。将来実装する境界であり、S4c 時点では永続化していない。
- `Script Audio`: saved script と voice から生成され、`script_audios` と app-owned storage に保存される見本音声。将来 freeze persistence を入れる場合は frozen script snapshot から生成する候補もある。
- `Text Generation Attempt`: Script Studio generation route を 1 回呼び、draft candidates を作る試行。
- `Draft Regeneration`: 同じ intent 近傍で候補を作り直す text generation attempt。将来 quota 対象にする。
- `Bounded Adjustment`: `more_natural / more_speakable / more_self_like / shorter / simpler` のような制限付き調整。自由文の無限 rewrite ではない。
- `Voice Generation Attempt`: provider を使って script audio を作る試行。text generation とは別の quota / cost control 対象。

## 3. 現在の Source Of Truth

S4c 時点の source of truth は次の通りです。

- generation result は一時的な preview。
- accepted draft は preview と copy source であり、canonical data ではない。
- copied draft は手動フォームの editable state。
- manual form draft は保存前の編集状態であり、canonical data ではない。
- 手動フォームで編集した後、保存された `scripts` row とその `content` が canonical。
- generation metadata / quality report / freeze preflight はまだ DB に保存しない。
- draft をコピーして編集した場合、最終的な saved script が唯一の練習元になる。
- `listen / record / review / progress` は引き続き server-owned saved script を読む。
- script audio は saved script content をもとに生成される派生物として扱う。
- frozen script persistence はまだ存在しない。
- 将来 `script_freezes` を入れるまでは、freeze 状態を canonical data として扱わない。

つまり、S3d の「コピー」は freeze でも provenance 保存でもありません。ユーザーが編集可能なフォームへ下書きを流し込むだけです。

## 4. S4c decision: saved script only

S4c の結論は、MVP では saved script only で進めることです。

- `script_freezes` table は今すぐ作らない。
- saved script を canonical として進める。
- freeze persistence は postponed decision とする。
- freeze は当面、音声生成前の read-only preflight / explicit UX boundary として扱う。
- script in-place edit は unsafe なので、編集したい場合は duplicate / new script 方針を維持する。
- voice generation は将来、server 側で saved script を読み直して preflight する。
- 本格的な freeze persistence は、script versioning / quota audit / billing / generation history が必要になった段階で再検討する。

### なぜ今 `script_freezes` を作らないか

- DB schema / migration が増える。
- script versioning と絡む。
- quota / billing audit と絡む。
- voice generation gating と絡む。
- saved script がすでに canonical として機能している。
- in-place edit を避ける方針なら、saved script content で当面足りる。
- 今作ると、MVP の main loop より先に freeze / version / audit の過剰設計になりやすい。

### MVP での freeze の扱い

- freeze は保存イベントではなく、音声生成前の明示的な UX boundary として扱う。
- read-only preflight で saved script の状態を確認する。
- blocking reason があれば、音声生成へ進む前に duplicate / new script で直す。
- quota 消費はまだ発生しない。
- script audio generation の直前で、server 側が saved script を読み直す前提にする。

### Script in-place edit 方針

- in-place edit は unsafe。
- review / progress / script audio cache / historical take と整合が崩れる。
- 編集したい場合は duplicate / new script で扱う。
- この方針により、saved script only でも当面の整合性を保ちやすい。

## 5. 将来の Source Of Truth 候補

### A. Generated metadata は保存しない。Saved script のみ canonical

メリット:
- MVP の main loop と衝突しにくい。
- `takes` が script snapshot を持たない現状と整合しやすい。
- DB schema と ownership 設計を増やさずに済む。

リスク:
- どの brief / draft から保存されたかの履歴は残らない。
- generation 改善の分析には使いにくい。

### B. Generated draft provenance を別 table / metadata に保存する

メリット:
- generation request、candidate、quality gate、copy までの履歴を追える。
- 将来の personalization や regenerate UX に使いやすい。

リスク:
- raw output / prompt / secret に近い情報を保存しないための設計が必要。
- ownership、retention、削除、UI 表示範囲を決める必要がある。
- MVP では実装面積が大きい。

### C. Freeze event を別 table に保存する

メリット:
- 「この script content を音声生成対象にした」という境界を明確にできる。
- voice generation quota と結びつけやすい。
- 将来、script の in-place edit を避ける理由を説明しやすい。

リスク:
- `scripts` row と freeze record の不整合を扱う必要がある。
- freeze 後の編集、複製、再生成のルールが必要。

### D. Script version / snapshot を導入する

メリット:
- review / progress の履歴意味を強く守れる。
- freeze 時点の script content を厳密に固定できる。

リスク:
- 現在の `takes` が script snapshot を持たない前提から広い設計変更になる。
- migration、read model、既存画面の表示意味に影響する。
- MVP の次段階としては重い。

## 6. 推奨方針

現時点の推奨は A を本線にし、C は必要条件がそろうまで延期することです。

- MVP では、まず saved script を canonical とする。
- generated draft metadata は当面保存しない。
- quota は generation request 単位で将来管理する。
- copy to manual form と manual edit は quota 消費にしない。
- voice generation は saved script を server 側で読み直し、preflight した後だけ許可する方針にする。
- script in-place edit は unsafe なので、必要なら duplicate / new script で扱う。
- freeze は「音声生成対象として script content を確定する行為」と定義する。
- MVP では freeze persistence を入れず、read-only preflight / UX boundary に留める。
- freeze persistence を入れるなら、script versioning / quota audit / billing / generation history の必要性が見えてから、full versioning より先に freeze event として検討する。
- script audio の cache semantics は `script_audios` 側に残し、draft generation の metadata と混ぜない。

## 7. 状態遷移

想定する状態遷移:

```text
User intent / seed
-> ScriptBrief
-> Generation Request
-> Generated Draft candidates
-> Accepted Draft selected
-> Copied to manual form
-> User edits
-> Saved Script
-> Freeze preflight
-> Future freeze UX boundary
-> Script Audio generation
-> Listen / Record / Review
```

実装済み:
- `ScriptBrief`
- generation route
- generated draft preview
- accepted draft selection
- copy to manual form
- manual form の表示用 freeze preflight preview
- saved script の read-only freeze candidate check
- existing save flow

未実装:
- freeze persistence
- quota
- voice generation gating
- generated draft history
- script versioning
- `この台本で練習開始` の本接続

S4c 時点では、`Frozen Script` は永続化された canonical data ではありません。将来の音声生成前に、saved script を読み直して preflight する境界として扱います。

## 8. Freeze 条件

`この台本で練習開始` または音声生成前に、最低限次を満たす必要があります。

- saved script が存在する。
- script content が空でない。
- readiness / freeze preflight に blocking reason がない。
- target length から大きく外れていない。
- focus words が 1〜3 個に収まる。
- long sentence / long chunk が多すぎない。
- ユーザーが明示的にこの script で練習すると選ぶ。
- provider / voice setup が必要な場合、その状態が確認できている。
- script audio generation は saved/frozen script の server-owned content を読み直して行う。

MVP では warnings は説明として見せる。blocking reason がある場合は、音声生成へ進む前に duplicate / new script で直す。S4c 時点では、この判定は保存や gating ではなく表示用の preflight / UX boundary です。

## 9. Quota / Cost Control 方針

Text generation と voice generation は分けて扱います。

Text 側:
- `Text Generation Attempt`: generation route の 1 回の呼び出し。
- `Draft Regeneration`: draft を作り直す操作。将来 quota 対象。
- `Bounded Adjustment`: `もっと自然に`、`もっと自分らしく`、`短く` などの制限付き操作。自由文の無限要求にはしない。

Voice 側:
- `Voice Generation Attempt`: provider で script audio を生成する 1 回の試行。
- `Voice Regeneration`: 同じ script / voice 近傍で音声を作り直す操作。
- `Clone Voice Creation`: voice clone / custom voice 作成。script audio とは別の高コスト操作。
- `Script Audio Generation`: saved/frozen script と voice から見本音声を作る操作。voice quota / cost control 対象。

重要方針:
- text 側で試行錯誤を吸収する。
- voice generation は freeze 後だけにする。
- regenerate は回数制限対象にする。
- copy to manual form は quota 消費にしない。
- manual edit は quota 消費にしない。
- saved script creation は text generation quota とは別に扱う。
- script audio generation は voice quota / cost control 対象にする。
- `script_audios` cache hit は新規 voice generation attempt として数えない方向を本線にする。
- provider が mock の場合も、UI 上の quota 語彙は将来の本接続と矛盾しないようにする。

## 10. UI 方針

将来 UI では次のように見せます。

- draft preview は一時生成。
- コピーは freeze ではない。
- 保存前に編集できる。
- freeze は音声生成前の明示 action。
- quota を使う操作は押す前に分かる。
- provider が mock / openai どちらでも raw output は見せない。
- quality gate の warning は説明として見せる。
- blocking reason がある場合は freeze させない。
- freeze 後に script を直したい場合は、in-place edit ではなく duplicate / new script を促す。

## 11. API / DB 実装候補

今回は実装しません。今後必要になるかもしれない候補を整理します。

### `script_generation_requests`

- 必要になるタイミング: generation quota、履歴、regenerate UX を本格化するとき。
- 触るリスク: prompt / raw output / user intent の保存範囲、retention、ownership。
- MVPで後回しにできるか: できる。S4c でも保存しない。

### `script_generation_candidates`

- 必要になるタイミング: 候補比較履歴や personalization を残したいとき。
- 触るリスク: rejected candidate や raw provider output を保存しない設計が必要。
- MVPで後回しにできるか: できる。accepted draft も保存前は canonical にしない。

### `script_freezes`

- 必要になるタイミング: freeze を永続化し、音声生成対象の確定境界を残したいとき。具体的には、script versioning、freeze event audit、quota / billing の厳密な記録、ユーザー単位の voice generation cost 制御、generated draft provenance 保存、音声生成時点の script snapshot 永続化、保存済み script の編集履歴、複数音声・複数 provider・複数 style の課金管理が必要になったとき。
- 触るリスク: saved script との不整合、freeze 後編集、複製時の扱い。
- MVPで後回しにできるか: できる。S4c では今すぐ作らず、saved script only で進める。

将来候補の最小 shape:

```ts
type ScriptFreezeCandidate = {
  id: string;
  user_id: string;
  script_id: string;
  script_content_snapshot: string;
  target_length_seconds: number;
  readiness_snapshot: unknown;
  focus_words_snapshot: string[];
  source: "manual" | "script_studio" | "duplicate";
  frozen_at: string;
  created_at: string;
};
```

これは案だけです。S4c では migration も API も作りません。

### `quota_events`

- 必要になるタイミング: text generation / voice generation / clone creation の回数制限を入れるとき。
- 触るリスク: billing 方針、plan、reset window、retry 失敗時の課金扱い。
- MVPで後回しにできるか: mock / small team 運用中は後回し可。ただし OpenAI live use 前には要検討。

### `script_versions`

- 必要になるタイミング: review / progress の履歴意味を script content snapshot と強く結びたいとき。
- 触るリスク: 既存 read model、takes、review、progress への影響が大きい。
- MVPで後回しにできるか: できる。まず duplicate / new script 運用で避ける。

### `POST /api/script-studio/freeze`

- 必要になるタイミング: `この台本で練習開始` を本接続するとき。
- 触るリスク: auth、ownership、saved script re-fetch、freeze preflight、voice setup gate。
- MVPで後回しにできるか: できる。S4c では作らず、必要になった時点で route handler は薄くし、service 側に判定を寄せる。

### `POST /api/script-studio/regenerate`

- 必要になるタイミング: draft regeneration を generation route から分けたいとき。
- 触るリスク: quota、bounded adjustment、request provenance。
- MVPで後回しにできるか: できる。現 route に bounded field はある。

### `POST /api/script-studio/adjust`

- 必要になるタイミング: `もっと自然に` などの bounded adjustment を明示 API にしたいとき。
- 触るリスク: text generation attempt との quota 整合、UI の自由文要求拡大。
- MVPで後回しにできるか: できる。まず choices を UI で固定してから。

## 12. 最小実装ロードマップ

- S4a: form draft freeze UX copy / preflight preview。DB なし。保存前フォームの現在内容を表示用に確認する。
- S4b: saved script -> freeze candidate read-only check。`listen` で保存済み script を canonical として確認するが、永続化や gating はしない。
- S4c: saved-script-only freeze decision doc。`script_freezes` は今すぐ作らず、freeze persistence を postponed decision とする。
- S4d: voice generation preflight design doc。音声生成直前に saved script を server 側で読み直す設計を `docs/script-studio-voice-generation-preflight-plan.md` に固定する。
- S4e: listen の音声生成前 UX copy / preflight only。実装済み: まだ gating せず、ユーザーに確認境界を見せる。
- S4f: quota event design。実施済み: text generation と voice generation を別 event として整理し、詳細を `docs/script-studio-quota-event-plan.md` に固定する。
- S4g: provider readiness / cache reuse UI refinement。実装済み: listen の preflight notice に既存状態と cache behavior を表示する。
- S4h: quota preflight copy only。実装済み: `/scripts/new` と `/scripts/[id]/listen` に quota 境界の説明を追加する。enforcement / `quota_events` 書き込みはしない。
- S5a: quota event schema design。実施済み: `quota_events` の event type / status / subject / dedupe / retention / privacy / RLS を docs に固定する。migration は作らない。
- S5b: text generation quota event write path design。実施済み: `POST /api/script-studio/generate` で将来 event を書く場合の service 境界、status 遷移、idempotency / dedupe を docs に固定する。実装はしない。
- S5c: voice generation quota event write path design。実施済み: `/api/speak-script` で将来 event を書く場合の service 境界、cache hit / cache miss、provider synthesize、replay staging、failure 分類を docs に固定する。実装はしない。
- S5f: text generation quota event first implementation。実装済み: `script_generation_attempt` だけを non-blocking に記録する。enforcement / billing / voice generation event はまだ実装しない。
- S5: 必要になった時点で freeze persistence design。script_freezes / freeze event / snapshot を再検討する。
- S6: script versioning / generation history。履歴意味や provenance が必要になったら扱う。

## 13. 今回まだやらないこと

- DB schema / migration。
- API route 追加。
- quota 実装。
- freeze 保存。
- `script_freezes` table。
- voice generation / voice clone の quota event write path。
- freeze API。
- script versioning。
- generated draft history 保存。
- voice generation gating 実装。
- billing / quota implementation。
- OpenAI live smoke。
- secret 入力。
- 手動ブラウザ確認。
- UI redesign。

S4a で追加した preflight preview も表示用です。保存、freeze、音声生成、quota 消費は行いません。
S4b で追加した saved script check も read-only です。saved script が canonical であることを示す補助表示であり、listen の音声生成を止めたり許可したりする gating ではありません。
S4c でも `script_freezes` table は作りません。freeze は当面、saved script を音声生成前に読み直すための UX boundary として扱います。

## 14. 成功条件

- generated draft と saved script の境界が明確。
- copy は freeze ではないと明確。
- saved script が当面の canonical だと明確。
- `script_freezes` を今すぐ作らない理由が明確。
- freeze は当面 read-only preflight / 音声生成前の明示 boundary だと明確。
- quota は text generation と voice generation で分けて考える。
- ユーザー要求を bounded choice で制御する方針が明確。
- 次に実装へ進む順番が明確。
