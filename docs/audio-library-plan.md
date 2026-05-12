# Audio Library Plan

この文書は Phase S6a の design-only メモです。Audio Library は、生成した見本音声と自分の録音を script ごとに少数だけ残し、あとから聞き返せるようにするための設計です。

S6b の migration / RLS / service interface / API boundary plan は [docs/audio-library-migration-plan.md](./audio-library-migration-plan.md) に分けています。

S6c では、`0011_phase_s6_audio_library.sql`、DB types、`services/audio-library` の service skeleton まで追加しました。S6d では saved model audio 側、S6e では saved best take 側の API boundary を追加しました。S6f では listen で現在再生できる見本音声を保存 / 保存解除する小さな UI を追加しました。S6g では review で現在の録音 take をベスト保存 / 保存解除する小さな UI を追加しました。S6h では `/progress` に script ごとの Audio Library summary を追加しました。S6i では listen -> review -> progress をまたぐ保存導線、replay / review link、保存解除後の underlying data preservation を smoke 済みです。global library 表示、quota enforcement、provider 本接続はまだ追加していません。

## 1. 目的

- 生成した見本音声を、各 script ごとに最大 5 件まで保存できるようにする。
- 自分のベストな録音を、各 script ごとに最大 5 件まで保存できるようにする。
- `listen -> record -> review -> progress` の main loop の中で、「また聞きたい見本」「残したい録音」を見失わないようにする。
- `script_audios` の cache semantics、`takes` / `review` / `progress` の persisted result semantics を崩さない。
- 保存操作そのものを quota 消費や音声生成として扱わない。

## 2. 現在の audio / take / progress 構造

### Model audio

- `script_audios` は、見本音声の cache row として使われている。
- cache identity は `provider + voice row id + script locale + script content + voice style preset` から作る `cache_key`。
- `script_audios.storage_path` は provider 直 URL ではなく、app-owned replay route で解決する参照。
- `script_audios.stored_asset` は `script-audios` bucket の `storageBucket / storageObjectKey / contentType / byteLength` を持つ。
- `/api/script-audio/[audioId]` は `script_audios.storage_path` から owned row を引き直し、`stored_asset` の app-owned object を server-side download して返す。
- cache hit は「同じ条件の見本音声を再利用した」という状態であり、「ユーザーが保存したお気に入り音声」ではない。

### User recording / take

- 録音ファイルは `recordings` bucket に `userId/scriptId/...` の object として保存される。
- `takes.audio_path` はその録音 object への app-owned `storage://recordings/...` 参照。
- `takes` は score / transcript / evaluation payload / coach payload / reviewed_at を持つ。
- `weak_words` と `coach_feedback` は `take_id` に紐づき、review / progress の表示に使われる。
- `/api/takes/[takeId]/audio` は `take` を user ownership で引き直し、`takes.audio_path` の recording object を server-side download して返す。

### Progress

- `progress` は `takes` / `weak_words` / `coach_feedback` を hydrate して、script ごとの latest / best / previous を組み立てる。
- best take は現状、score / reviewed_at / created_at / id から計算される。
- `takes` は script 全文 snapshot を持たない。in-place script edit は過去 review / progress の意味を崩しやすいため、必要なら duplicate / new script 方針を維持する。

## 3. Audio Library の scope

MVP の推奨 scope は script-scoped library です。

- 各 script ごとに saved model audios 最大 5 件。
- 各 script ごとに saved best takes 最大 5 件。
- user 全体の横断 library は将来の aggregate view として後回しにする。
- global library を先に作るより、listen / review / progress の文脈で script 単位に残せることを優先する。

将来の user-wide library は、script-scoped saved entries を集約して見せる read model として扱えます。MVP で source of truth を user-wide table に寄せる必要はありません。

## 4. Source of truth 方針

Audio Library は、音声 bytes の canonical source にならない方針にします。

- 見本音声 bytes の canonical source は、引き続き `script_audios` + `script-audios` bucket。
- 自分の録音 bytes と review の canonical source は、引き続き `takes` + `recordings` bucket + `weak_words` + `coach_feedback`。
- Audio Library は「どの `script_audio` / `take` をユーザーが残したいか」を表す curation layer。
- saved entry を削除しても、原則として underlying `script_audios` / `takes` / storage object は削除しない。
- cache hit / replay / quota event は Audio Library の保存状態とは別概念にする。

## 5. Saved model audios

### 推奨 source of truth

将来実装では、`script_audios` に `is_saved` のような状態を直接足すより、別テーブルで curation entry を持つ案を推奨します。

候補名:

- `saved_model_audios`
- `script_saved_model_audios`
- `audio_library_model_audios`

推奨は `script_saved_model_audios` です。script-scoped であることが名前から分かり、cache table と混ざりにくいためです。

### 参照先

- `user_id`
- `script_id`
- `script_audio_id`

`script_audio_id` が実体参照です。`script_audios` は cache row のままにし、saved model audio はその row を pin するだけにします。

### 持つとよい metadata

MVP で必要になりそうなもの:

- `label`
- `note`
- `saved_at`
- `sort_order` または `slot`
- `source`
  - `listen`
  - `auto_suggested` は将来候補
- `provider`
- `voice_id`
- `voice_style_preset`
- `locale`
- `script_audio_cache_key`
- `generated_at`
- `content_type`
- `byte_length`

`provider / voice_id / voice_style_preset / locale / generated_at / content_type / byte_length` は、UI 表示と将来の audit のための snapshot に留めます。replay の canonical source は `script_audio_id` から引く `script_audios` row です。

### playback speed

`playbackRate` は client-side 再生速度であり、provider 再生成や `script_audios` cache identity ではありません。

保存済み見本音声の identity に `playbackRate` は入れない方針を推奨します。将来「この音声を練習では 0.85x で聞く」ような preference が必要になった場合は、audio identity とは別の display preference として扱います。

## 6. Saved best takes

### 推奨 source of truth

将来実装では、`takes` に `is_best_saved` を直接足すより、別テーブルで curation entry を持つ案を推奨します。

候補名:

- `saved_best_takes`
- `script_saved_takes`
- `audio_library_best_takes`

推奨は `script_saved_best_takes` です。script-scoped で、progress の計算上の best とは別の「ユーザーが残したい録音」であることを表せるためです。

### 参照先

- `user_id`
- `script_id`
- `take_id`

`take_id` が実体参照です。`takes` / `weak_words` / `coach_feedback` は review / progress の canonical source のままにします。

### 持つとよい metadata

MVP で必要になりそうなもの:

- `label`
- `note`
- `saved_at`
- `sort_order` または `slot`
- `source`
  - `review`
  - `progress`
- `score_snapshot`
- `accuracy_score_snapshot`
- `fluency_score_snapshot`
- `rhythm_score_snapshot`
- `reviewed_at_snapshot`

score snapshot は一覧表示の補助です。正確な review を再表示するときは `take_id` から persisted review を引き直します。

### “score が高い” と “残したい” の違い

- `progress` の best は、現状どおり score / reviewed_at / created_at / id から計算される。
- Audio Library の saved best take は、ユーザーが明示的に pin した録音。
- 高 score の録音を自動保存しない。自動推薦は将来追加できるが、MVP では user action を source of truth にする。
- 低 score でも「声の雰囲気が好き」「発音の変化を残したい」という理由で保存できる。

## 7. 最大 5 件制限

最大 5 件は product invariant として扱います。

### 推奨方針

MVP の初回実装では、service 層で transaction 的に count / insert / replace を扱い、UI では 5 件に達したときに replace を明示させる方針を推奨します。

DB だけで count <= 5 を表すには trigger か slot model が必要になり、初回 migration が重くなります。一方で service-only は race に弱いので、実装時には次のどちらかを選ぶ必要があります。

### Option A: service 層 count guard

- `select count(*)` して 5 未満なら insert。
- 5 件以上なら replace target を要求。
- 実装は小さい。
- 同時操作に弱い。

### Option B: slot model

- saved entry に `slot` 1〜5 を持たせる。
- unique `(user_id, script_id, slot)` を library type ごとに張る。
- replace は slot を指定して upsert する。
- 5 件制限を DB constraint に寄せやすい。
- reordering / empty slot の扱いを UI と service で決める必要がある。

### 推奨

S6b で migration plan に進むなら、`slot` 1〜5 を持つ Option B を推奨します。ただし S6a では migration を作りません。

### UX

- 5 件未満なら `保存` で追加。
- 5 件に達している場合は、既存 5 件から 1 件を選んで `入れ替え`。
- 何を置き換えるかをアプリが勝手に決めない。
- `保存を外す` は library entry だけを削除し、underlying audio / take は削除しない。

## 8. UI flow 案

### listen

- 見本音声が生成済みまたは cache reuse で再生可能になった後に、`この見本音声を保存` を出す。S6f で最小 UI 追加済み。
- 保存対象は現在の `script_audio_id`。
- UI copy は「これは cache を増やす操作ではなく、あとで聞き返すための保存」とする。
- 5 件に達している場合は replace UI を出す。
- 保存後は同じ listen 画面か script detail で saved model audios を確認できるようにする。

### review

- 保存済み録音が再生可能な review で、`この録音をベスト保存` を出す。
- S6g で review に最小 UI 追加済み。
- 保存対象は現在の `take_id`。
- UI copy は「progress の自動 best とは別に、自分で残したい録音」とする。
- 5 件に達している場合は replace UI を出す。

### progress / script detail

- MVP では script detail 相当の場所に、saved model audios と saved best takes の count と再生導線を置く。
- S6h では `/progress` の script card に「保存済み見本音声 n/5 / ベスト録音 n/5」の入口を追加した。
- saved model audio は既存 `/api/script-audio/[audioId]` replay route の audio control で聞き返す。
- saved best take は既存 review page への link を優先し、score 上の best とは別の user pin として表示する。
- progress では削除・slot 入れ替え・label 編集を行わず、管理は listen / review 側に寄せる。
- user-wide library page は後回し。まずは script ごとの context を優先する。

## 9. Cache / replay / quota_events との関係

### Cache

- cache hit は `script_audios` の再利用であり、saved model audio ではない。
- saved model audio は、既存または新規の `script_audios` row を user が pin した状態。
- cache key は変更しない。
- cache cleanup を将来入れる場合、saved model audio が参照する `script_audio` は消さない guard が必要。

### Replay

- saved model audio の再生は既存 `/api/script-audio/[audioId]` を使う。
- saved best take の再生は既存 `/api/takes/[takeId]/audio` を使う。
- replay route は今と同じく owned server-side lookup を行う。
- signed URL や raw provider URL を Audio Library に保存しない。

### Quota events

- `保存` / `保存を外す` / `ラベル変更` / `並び替え` は quota 消費ではない。
- cache hit / protected replay は quota 消費ではない。
- 新しく見本音声を生成する cache miss は、既存 S5j の `script_audio_generation_attempt` 対象。
- Audio Library の保存操作そのものを `quota_events` に入れない。必要なら将来 observability / product analytics として別 event にする。

## 10. Privacy / ownership

- Audio Library entry は必ず `user_id` と `script_id` を持つ。
- `script_audio_id` / `take_id` は、同じ user の同じ script に属することを service で確認する。
- RLS は `user_id = auth.uid()` を基本にする。
- replay は既存 route 経由にし、raw storage object key や signed URL を UI に出さない。
- saved entry metadata に raw script text、audio bytes、signed URL、raw provider response は保存しない。

## 11. Future data model sketch

まだ migration は作りません。次 phase で検討する候補です。

```sql
-- candidate only
script_saved_model_audios (
  id uuid primary key,
  user_id uuid not null,
  script_id uuid not null,
  script_audio_id uuid not null,
  slot integer not null check (slot between 1 and 5),
  label text,
  note text,
  source text not null default 'listen',
  metadata jsonb not null default '{}'::jsonb,
  saved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, script_id, slot),
  unique (user_id, script_id, script_audio_id)
);

-- candidate only
script_saved_best_takes (
  id uuid primary key,
  user_id uuid not null,
  script_id uuid not null,
  take_id uuid not null,
  slot integer not null check (slot between 1 and 5),
  label text,
  note text,
  source text not null default 'review',
  metadata jsonb not null default '{}'::jsonb,
  saved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, script_id, slot),
  unique (user_id, script_id, take_id)
);
```

この sketch は S6b 以降の migration design のたたき台です。S6a では実装しません。

## 12. 実装前に決めるべき論点

- 最大 5 件を service-only で守るか、slot model で DB constraint に寄せるか。
- 保存済み見本音声の label 初期値をどうするか。
- `voice_style_preset` を saved metadata snapshot に必ず入れるか、`script_audio.cache_key` 由来として扱うか。
- saved model audio の source を `listen` のみにするか、将来 `script detail` からも保存できるようにするか。
- saved best take を review だけで保存するか、progress の best result からも保存できるようにするか。
- saved entry を削除したとき、underlying unused `script_audios` cleanup をいつ考えるか。
- global Audio Library page を作る時期。
- in-place script edit を引き続き避ける方針を UI でどこまで説明するか。

## 13. 実装ロードマップ

- S6a: Audio Library design-only doc。
- S6b: migration / RLS / service interface plan。詳細は [docs/audio-library-migration-plan.md](./audio-library-migration-plan.md)。
- S6c: DB migration / DB types / service skeleton。`0011_phase_s6_audio_library.sql` と `services/audio-library` まで追加済み。
- S6d: saved model audio save / unsave API。`GET/POST/PATCH/DELETE` の model audio API boundary まで追加済み。UI は未実装。
- S6e: saved best take save / unsave API。`GET/POST/PATCH/DELETE` の best take API boundary まで追加済み。UI は未実装。
- S6f: listen の saved model audio 保存 / 保存解除 UI。
- S6g: review の saved best take 保存 / 保存解除 UI。
- S6h: progress の script-scoped Audio Library summary。
- S6i: listen / review / progress をまたぐ Audio Library E2E smoke。保存 / 保存解除、replay route、review link、invalid slot、duplicate save の確認まで完了。

## 14. 今回まだやらないこと

- DB schema / migration。
- `types/database.ts` 更新。
- API route 追加。
- UI 実装。
- 保存ボタン追加。
- quota enforcement。
- voice style preset 実装追加。
- Azure / voice provider 本接続。
- Audio Library の global view。
- storage cleanup。
