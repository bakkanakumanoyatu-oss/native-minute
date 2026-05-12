# Audio Library Migration / RLS / Service Plan

この文書は Phase S6b の design-only メモです。S6a の [Audio Library Plan](./audio-library-plan.md) を前提に、script-scoped Audio Library を実装する前の DB schema / RLS / service interface / API boundary を固定します。

S6b では migration file、DB types、API route、UI、保存ボタン、quota enforcement は追加しません。

S6c では、この plan に沿って `0011_phase_s6_audio_library.sql`、DB types、`services/audio-library` の service skeleton まで追加しました。

S6d では、saved model audio 側だけ `GET/POST /api/scripts/[id]/saved-model-audios` と `PATCH/DELETE /api/scripts/[id]/saved-model-audios/[savedAudioId]` を追加しました。

S6e では、saved best take 側も `GET/POST /api/scripts/[id]/saved-best-takes` と `PATCH/DELETE /api/scripts/[id]/saved-best-takes/[savedBestTakeId]` を追加しました。UI、保存ボタン、quota enforcement はまだ追加していません。

## 1. 前提

- saved model audios は `script_audios` を pin する。
- saved best takes は `takes` を pin する。
- cache と saved audio は別概念。
- score 上の best と saved best take は別概念。
- 保存 / unsave / label / reorder は quota 消費ではない。
- 保存解除しても underlying `script_audio` / `take` / storage object は削除しない。
- `script_audios` と `takes` は canonical source のままにする。

## 2. 推奨 schema

次の migration 候補名は `0011_phase_s6_audio_library.sql` です。ただし S6b では作成しません。

### 2.1 `script_saved_model_audios`

`script_audios` を user/script 単位で pin する curation table です。

推奨 columns:

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references auth.users (id) on delete cascade`
- `script_id uuid not null references public.scripts (id) on delete cascade`
- `script_audio_id uuid not null references public.script_audios (id) on delete cascade`
- `slot smallint not null`
- `label text not null`
- `source text not null default 'listen'`
- `metadata jsonb not null default '{}'::jsonb`
- `saved_at timestamptz not null default now()`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

推奨 constraints / indexes:

- `check (slot between 1 and 5)`
- `check (char_length(label) between 1 and 80)`
- `check (jsonb_typeof(metadata) = 'object')`
- `check (source in ('listen', 'script_detail'))`
- `unique (user_id, script_id, slot)`
- `unique (user_id, script_id, script_audio_id)`
- index `(user_id, script_id, slot)`
- index `(script_audio_id)`

`metadata` に保存してよい snapshot 候補:

- `provider`
- `voice_id`
- `voice_style_preset`
- `locale`
- `script_audio_cache_key_hash`
- `script_audio_cache_key_prefix`
- `generated_at`
- `content_type`
- `byte_length`

保存しないもの:

- raw script text
- audio bytes
- signed / temporary URL
- raw provider response
- raw provider error payload
- secret / auth header
- user email

### 2.2 `script_saved_best_takes`

`takes` を user/script 単位で pin する curation table です。

推奨 columns:

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references auth.users (id) on delete cascade`
- `script_id uuid not null references public.scripts (id) on delete cascade`
- `take_id uuid not null references public.takes (id) on delete cascade`
- `slot smallint not null`
- `label text not null`
- `source text not null default 'review'`
- `metadata jsonb not null default '{}'::jsonb`
- `saved_at timestamptz not null default now()`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

推奨 constraints / indexes:

- `check (slot between 1 and 5)`
- `check (char_length(label) between 1 and 80)`
- `check (jsonb_typeof(metadata) = 'object')`
- `check (source in ('review', 'progress', 'script_detail'))`
- `unique (user_id, script_id, slot)`
- `unique (user_id, script_id, take_id)`
- index `(user_id, script_id, slot)`
- index `(take_id)`

`metadata` に保存してよい snapshot 候補:

- `score`
- `accuracy_score`
- `fluency_score`
- `rhythm_score`
- `duration_seconds`
- `reviewed_at`
- `weak_word_count`
- `focus_word_count`

保存しないもの:

- raw transcript text
- raw script text
- recording audio bytes
- signed / temporary URL
- raw evaluator/provider response
- secret / auth header
- user email

## 3. 最大 5 件制限

推奨は `slot` 1〜5 を DB schema に持たせる方針です。

理由:

- `check (slot between 1 and 5)` と `unique (user_id, script_id, slot)` で、script ごとの最大 5 件を DB 側の invariant にできる。
- count guard だけより race に強い。
- UI で「どの slot を置き換えるか」をそのまま扱える。
- `reorder` は slot の入れ替えとして扱える。

service 側でも guard します。

- slot 未指定の save は 1〜5 の空き slot を探す。
- 空きがないときは `library_full` error を返し、UI に replace 対象を選ばせる。
- replace は明示 slot を受け取り、その slot の entry を差し替える。
- 同じ `script_audio_id` / `take_id` がすでに保存済みなら、新規追加ではなく existing entry を返すか、label / saved_at 更新に留める。

RPC は初回必須にはしません。まずは server route + service + DB unique constraints で進めます。将来、複数 slot の reorder を完全 atomic にしたくなった場合だけ RPC を検討します。

## 4. Ownership / RLS 方針

### 基本方針

- authenticated user は自分の saved entries だけ select できる。
- authenticated client から insert / update / delete は直接許可しない。
- write は server route 経由に寄せる。
- route は auth / schema validation / service call のみを担当し、ownership check は service で行う。
- service は user-owned `script`、`script_audio`、`take` を server-side に再取得して同じ `user_id / script_id` に属することを確認する。

### RLS 案

`script_saved_model_audios`:

- `select`: `auth.uid() = user_id`
- `insert/update/delete`: policy を作らない。server route + service role write 前提。

`script_saved_best_takes`:

- `select`: `auth.uid() = user_id`
- `insert/update/delete`: policy を作らない。server route + service role write 前提。

### service role write の注意

service role は RLS を bypass できるため、必ず service 内で次を検証します。

For model audio:

- `scripts.id = script_id`
- `scripts.user_id = userId`
- `script_audios.id = script_audio_id`
- `script_audios.script_id = script_id`
- `script_audio` の replay path / stored asset は client から受け取らない。

For best take:

- `scripts.id = script_id`
- `scripts.user_id = userId`
- `takes.id = take_id`
- `takes.user_id = userId`
- `takes.script_id = script_id`
- recording path は client から受け取らない。

DB 側の defense-in-depth として、S6c migration で `before insert/update` validation trigger を追加する案もあります。ただし初回は route/service の再取得検証を source of truth とし、trigger は必要性が出たときに検討します。

## 5. Service interface 案

候補ファイル:

- `services/audio-library/audio-library.service.ts`
- `services/audio-library/types.ts`
- `services/audio-library/index.ts`

### Model audio functions

```ts
type SaveModelAudioInput = {
  scriptId: string;
  scriptAudioId: string;
  label?: string;
  slot?: number;
};

type ReplaceSavedModelAudioSlotInput = {
  scriptId: string;
  scriptAudioId: string;
  slot: number;
  label?: string;
};

async function listSavedModelAudios(client, userId, scriptId): Promise<SavedModelAudio[]>;
async function saveModelAudio(client, userId, input: SaveModelAudioInput): Promise<SavedModelAudio>;
async function replaceSavedModelAudioSlot(client, userId, input: ReplaceSavedModelAudioSlotInput): Promise<SavedModelAudio>;
async function unsaveModelAudio(client, userId, savedModelAudioId): Promise<void>;
async function renameSavedModelAudio(client, userId, savedModelAudioId, label): Promise<SavedModelAudio>;
async function reorderSavedModelAudios(client, userId, scriptId, orderedIds): Promise<SavedModelAudio[]>;
```

### Best take functions

```ts
type SaveBestTakeInput = {
  scriptId: string;
  takeId: string;
  label?: string;
  slot?: number;
};

type ReplaceSavedBestTakeSlotInput = {
  scriptId: string;
  takeId: string;
  slot: number;
  label?: string;
};

async function listSavedBestTakes(client, userId, scriptId): Promise<SavedBestTake[]>;
async function saveBestTake(client, userId, input: SaveBestTakeInput): Promise<SavedBestTake>;
async function replaceSavedBestTakeSlot(client, userId, input: ReplaceSavedBestTakeSlotInput): Promise<SavedBestTake>;
async function unsaveBestTake(client, userId, savedBestTakeId): Promise<void>;
async function renameSavedBestTake(client, userId, savedBestTakeId, label): Promise<SavedBestTake>;
async function reorderSavedBestTakes(client, userId, scriptId, orderedIds): Promise<SavedBestTake[]>;
```

### Service behavior

- list functions can use authenticated server client and RLS.
- write functions use service role write only after route auth and explicit ownership validation.
- all write functions return safe saved entry shape only.
- no raw storage object key, signed URL, provider payload, transcript text, or script text is returned from Audio Library writes.
- replay remains separate via existing protected routes.

## 6. API boundary 案

Route handlersは薄く保ちます。

### Model audio routes

候補:

- `GET /api/scripts/[id]/saved-model-audios`
- `POST /api/scripts/[id]/saved-model-audios`
- `PATCH /api/scripts/[id]/saved-model-audios/[savedAudioId]`
- `DELETE /api/scripts/[id]/saved-model-audios/[savedAudioId]`
- `PUT /api/scripts/[id]/saved-model-audios/slots/[slot]`

S6d では `PUT /slots/[slot]` は作らず、次の 4 route だけを実装します。

`GET /api/scripts/[id]/saved-model-audios`:

```json
{
  "ok": true,
  "data": {
    "savedModelAudios": []
  }
}
```

POST body:

```json
{
  "scriptAudioId": "uuid",
  "slot": 1,
  "label": "Natural 0.85x practice"
}
```

`slot` は optional。未指定なら service が空き slot を探します。

`POST /api/scripts/[id]/saved-model-audios` response:

```json
{
  "ok": true,
  "data": {
    "savedModelAudio": {}
  }
}
```

`PATCH /api/scripts/[id]/saved-model-audios/[savedAudioId]` は label update か、現在の saved entry slot を明示した replacement だけを扱います。slot 移動 / reorder はしません。

Label update body:

```json
{
  "label": "保存名"
}
```

Replacement body:

```json
{
  "scriptAudioId": "uuid",
  "slot": 1,
  "label": "置き換え後の保存名"
}
```

`DELETE /api/scripts/[id]/saved-model-audios/[savedAudioId]` response:

```json
{
  "ok": true,
  "data": {
    "deleted": true,
    "savedModelAudio": {}
  }
}
```

DELETE は Audio Library entry だけを削除し、underlying `script_audio` / storage object は削除しません。

### Best take routes

候補:

- `GET /api/scripts/[id]/saved-best-takes`
- `POST /api/scripts/[id]/saved-best-takes`
- `PATCH /api/scripts/[id]/saved-best-takes/[savedTakeId]`
- `DELETE /api/scripts/[id]/saved-best-takes/[savedTakeId]`
- `PUT /api/scripts/[id]/saved-best-takes/slots/[slot]`

S6e では `PUT /slots/[slot]` は作らず、次の 4 route だけを実装します。

`GET /api/scripts/[id]/saved-best-takes`:

```json
{
  "ok": true,
  "data": {
    "savedBestTakes": []
  }
}
```

POST body:

```json
{
  "takeId": "uuid",
  "slot": 1,
  "label": "Best ending"
}
```

`POST /api/scripts/[id]/saved-best-takes` response:

```json
{
  "ok": true,
  "data": {
    "savedBestTake": {}
  }
}
```

`PATCH /api/scripts/[id]/saved-best-takes/[savedBestTakeId]` は label update か、現在の saved entry slot を明示した replacement だけを扱います。slot 移動 / reorder はしません。

Label update body:

```json
{
  "label": "保存名"
}
```

Replacement body:

```json
{
  "takeId": "uuid",
  "slot": 1,
  "label": "置き換え後の保存名"
}
```

`DELETE /api/scripts/[id]/saved-best-takes/[savedBestTakeId]` response:

```json
{
  "ok": true,
  "data": {
    "deleted": true,
    "savedBestTake": {}
  }
}
```

DELETE は Audio Library entry だけを削除し、underlying `take` / `weak_words` / `coach_feedback` / recording object は削除しません。

### Error shape

既存 route と同じく user-facing message を返します。

候補 error code:

- `library_full`
- `slot_occupied`
- `already_saved`
- `saved_entry_not_found`
- `script_audio_not_found`
- `take_not_found`
- `ownership_mismatch`
- `invalid_slot`
- `label_too_long`

API response shape は S6c/S6d で固定します。S6b では route を作りません。

## 7. listen / review / progress との接続方針

### listen

- `listSavedModelAudios` を使って saved model audios を表示する。
- 現在の見本音声が `script_audio_id` として特定できるときだけ `この見本音声を保存` を出す。
- 保存後も `script_audios` cache key は変えない。
- cache hit は saved state ではないことを UI copy に残す。
- replay は `/api/script-audio/[audioId]` を使う。

### review

- `listSavedBestTakes` を使って、現在の `take_id` が保存済みか確認する。
- `この録音をベスト保存` は `take_id` を pin するだけ。
- score 上の best と saved best take を混同しない copy にする。
- replay は `/api/takes/[takeId]/audio` を使う。

### progress

- script ごとの saved counts を表示する。
- 最初は count / entry point に留め、progress で保存操作を増やしすぎない。
- 将来、best result card から `この録音をベスト保存` を出す場合も、review と同じ service を使う。

### scripts / script detail

- script card に saved model audios / saved best takes の count を出す候補はある。
- global Audio Library page は MVP 後回し。

## 8. Metadata 方針

metadata は UI 表示の snapshot に留め、canonical data にはしません。

Model audio metadata allowlist:

- `provider`
- `voice_id`
- `voice_label`
- `voice_style_preset`
- `locale`
- `cache_key_hash`
- `cache_key_prefix`
- `generated_at`
- `content_type`
- `byte_length`

Best take metadata allowlist:

- `score`
- `accuracy_score`
- `fluency_score`
- `rhythm_score`
- `duration_seconds`
- `reviewed_at`
- `weak_word_count`
- `focus_word_count`

禁止:

- raw script text
- raw transcript text
- audio bytes
- raw storage object key if not already exposed through protected route
- signed / temporary URL
- raw provider response
- raw evaluator response
- secret / auth header
- user email

## 9. Quota との関係

- save / unsave / rename / reorder / replace は quota 消費ではない。
- cache hit / protected replay も quota 消費ではない。
- Audio Library write は `quota_events` に記録しない。
- 将来 product analytics が必要なら、quota とは別 event にする。

## 10. 実装前に決めるべき論点

S6c に入る前に決めること:

- `slot` model で確定するか。
- label を required にするか、service-generated default を許すか。
- server write は service role で行うか、security definer RPC に寄せるか。
- DB validation trigger を初回 migration に入れるか。
- list route を作るか、server component は service 直読みで済ませるか。
- replace slot 時、同じ target が別 slot に保存済みなら move とみなすか error にするか。
- reorder を初回 API に含めるか、save/replace/unsave の後に回すか。
- saved model audio の metadata に `voice_label` を snapshot するか。
- saved best take の metadata に weak words / focus words の counts だけ入れるか、label 表示は都度 review hydrate するか。

## 11. S6c 推奨順序

1. `0011_phase_s6_audio_library.sql` migration を追加する。
2. `types/database.ts` を同期する。
3. `services/audio-library` に list / save / replace / unsave の service skeleton を追加する。
4. service-level ownership validation tests または focused smoke helper を追加する。
5. API route は S6d/S6e に回す。S6c では service skeleton まででもよい。

S6c 実装では 1〜3 を完了し、API route / UI は S6d 以降に残しています。focused smoke helper は API boundary と合わせて追加する候補として残します。

## 12. 今回まだやらないこと

- migration file 作成。
- DB schema 実装。
- `types/database.ts` 更新。
- API route 実装。
- UI 実装。
- 保存ボタン追加。
- quota enforcement。
- voice style preset 実装追加。
- Azure / voice provider 本接続。
- large refactor。
