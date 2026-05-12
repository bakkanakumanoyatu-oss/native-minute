# Gate1b Supabase / Storage / RLS Runbook

Gate1b は、Native Minute v1 の Web production core を公開する前に、Supabase project 側の migrations、Storage buckets、RLS、ownership、protected replay を確認するための runbook です。ここでは DB schema、RLS policy、bucket 設定を変更しません。

## Scope

- 対象: migrations `0001`〜`0012`、private Storage buckets、RLS / ownership spot check、protected replay route。
- 非対象: DB migration 追加、RLS policy 変更、bucket 作成・変更・削除、実データ削除、account deletion actual cleanup、provider 実装変更。
- Provider 役割:
  - ElevenLabs: voice clone / model audio generation。
  - OpenAI: transcription / Script Studio generation / coaching-adjacent generation。
  - Azure: pronunciation evaluator。

## Non-Destructive Checker

ローカルまたは production-like env で、secret 値を出さずに機械確認できる範囲だけを確認します。

```bash
npm run supabase:storage-rls:check
```

この checker が確認するもの:

- required migration file が repo に存在する。
- `NEXT_PUBLIC_SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` が set。
- service role 経由で required table に到達できる。
- Storage buckets `recordings / script-audios / voice-samples / voice-consents` が存在し、`public=false`。

この checker が確認しないもの:

- 他ユーザー data が見えないこと。
- authenticated client の insert/update/delete が拒否されるべき場所で拒否されること。
- protected replay route が cross-user audio を 404/403 相当にすること。
- SQL Editor 上の RLS 実効性。SQL Editor は service-role 相当になりやすく、RLS の user-session 実効確認には限界があります。

PASS:

- checker が exit 0。
- secret 値、raw storage path、object key、signed URL、provider voice id は出力されない。

BLOCKED:

- required table / bucket が missing。
- bucket が public。
- env が missing。

Proof を残すときは [Gate1b production Supabase spot-check proof template](./gate1b-production-supabase-spot-check-proof-template.md) を使います。template には command result、table / bucket count、own / cross-user status だけを記録し、secret、raw user id、raw object key、signed URL、audio id / take id、raw audio は貼りません。

## Migration Readiness

production project には次の順で適用します。

| Migration | Role |
| --- | --- |
| `0001_init.sql` | core tables、base RLS、profiles / scripts / voices / takes / weak_words / coach_feedback / script_audios。 |
| `0002_phase1_hardening.sql` | voice consent link、script audio voice key、take review payload columns。 |
| `0003_phase25_hardening.sql` | review score columns、coach fields、delete policies。 |
| `0004_phase25_storage_guards.sql` | script audio cache uniqueness、voices / script_audios ownership hardening。 |
| `0005_phase5_recordings_storage.sql` | `recordings` bucket と user-prefix Storage policies。 |
| `0006_phase6_script_audio_storage.sql` | `script-audios` bucket と user-prefix Storage policies。 |
| `0007_phase7_voice_sample_storage.sql` | `voice-samples` bucket と user-prefix Storage policies。 |
| `0008_phase8_voice_consent_storage.sql` | `voice-consents` bucket と user-prefix Storage policies。 |
| `0009_phase_s5_quota_events.sql` | text generation quota event logging table / RLS。 |
| `0010_phase_s5_voice_quota_events.sql` | voice generation quota event extension。 |
| `0011_phase_s6_audio_library.sql` | script-scoped Audio Library tables / select-only client RLS。 |
| `0012_phase_rr_account_deletion_requests.sql` | account deletion request tracking / own read RLS。 |

SQL Editor 適用時の注意:

- production project を開いていることを人間が確認する。
- migration を順番に適用する。
- 適用後に `NOTIFY pgrst, 'reload schema';` を実行する。
- secret、service-role key、API key を SQL に貼らない。
- destructive SQL (`delete`, `truncate`, `drop table`, bucket object delete) は実行しない。

適用済み確認 SQL 例:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'profiles',
    'voice_consents',
    'voices',
    'scripts',
    'script_audios',
    'takes',
    'weak_words',
    'coach_feedback',
    'quota_events',
    'script_saved_model_audios',
    'script_saved_best_takes',
    'account_deletion_requests'
  )
order by table_name;
```

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'profiles',
    'voice_consents',
    'voices',
    'scripts',
    'script_audios',
    'takes',
    'weak_words',
    'coach_feedback',
    'quota_events',
    'script_saved_model_audios',
    'script_saved_best_takes',
    'account_deletion_requests'
  )
order by tablename;
```

```sql
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'profiles',
    'voice_consents',
    'voices',
    'scripts',
    'script_audios',
    'takes',
    'weak_words',
    'coach_feedback',
    'quota_events',
    'script_saved_model_audios',
    'script_saved_best_takes',
    'account_deletion_requests'
  )
order by tablename, policyname;
```

Migration drift が疑われる場合:

- `types/database.ts` に required table / column があるか確認する。
- `npm run build` と `npm run typecheck` が通るか確認する。
- production SQL Editor で table / policy / index を spot check する。
- drift を直す場合は follow-up migration を作り、既存 migration を production 適用後に直接編集しない。

## Storage Bucket Readiness

| Bucket | Purpose | Expected visibility | Ownership expectation |
| --- | --- | --- | --- |
| `recordings` | user recording upload / evaluation / review replay。 | private | object key prefix starts with `userId/scriptId/`。 |
| `script-audios` | generated model audio staged for protected replay。 | private | object key prefix starts with `userId/scriptId/voiceId/`。 |
| `voice-samples` | user sample audio for ElevenLabs voice clone。 | private | object key prefix starts with `userId/consentId/`。 |
| `voice-consents` | app-owned consent recording. | private | object key prefix starts with `userId/`。 |

Storage UI / SQL spot check:

```sql
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('recordings', 'script-audios', 'voice-samples', 'voice-consents')
order by id;
```

PASS:

- 4 buckets が存在する。
- `public = false`。
- MIME type と file size limit が migration と一致する。

BLOCKED:

- bucket missing。
- bucket public。
- upload / download policy が user prefix を見ていない。

## RLS / Ownership Spot Check

Production SQL Editor は service-role 相当のため、own-user RLS の最終確認は browser/API の authenticated user session で行います。

Manual user-session checks:

1. User A で script を作成する。
2. User A で recording、review、script audio、Audio Library save を作る。
3. User B は別ブラウザ / private window で `/login?next=%2Fscripts` から login する。replay API URL や存在しない internal path を login `next` にしない。
4. User B で同じ route / API にアクセスし、他ユーザー data が見えないことを確認する。
5. User B で User A の `audioId` / `takeId` を使い、protected replay が 404/403 相当になることを確認する。
6. authenticated client から service-role 前提の write ができないことを確認する。

Table-specific expectations:

- `scripts`, `takes`: own read / own write only。
- `weak_words`, `coach_feedback`: parent take ownership で read/write。
- `voice_consents`, `voices`: own provider setup data only。
- `script_audios`: script/voice ownership を server-side に再確認。
- `script_saved_model_audios`, `script_saved_best_takes`: client は own select only。write は API/service-role 経由。
- `quota_events`: own read only。write は server-side service。
- `account_deletion_requests`: own read only。request / confirm は API/service-side。

## Protected Replay Spot Check

対象 route:

- `GET /api/script-audio/[audioId]`
- `GET /api/takes/[takeId]/audio`

PASS:

- own user の audio は 200。
- `Content-Type` が storage object の audio type と一致する。
- `Cache-Control` は private。
- raw storage path、signed URL、provider voice id は response body / client UI に出ない。
- 別ユーザーの `audioId` / `takeId` は 404/403 相当。

BLOCKED:

- signed URL や raw object key が client に出る。
- cross-user audio が再生できる。
- bucket が public のため route を経由せず読める。

## Production PASS / WARN / BLOCKED / FAIL

- PASS: checker が通り、manual SQL / Storage / RLS / protected replay spot check が期待通り。
- WARN: SQL Editor では確認できるが user-session RLS smoke が未実施。
- BLOCKED: migration / bucket / policy / required env が不足。
- FAIL: cross-user data / audio が見える、bucket が public、raw storage path / signed URL が client に出る。

## Human Checklist Before Web Production

1. `npm run production:preflight`
2. `npm run supabase:storage-rls:check`
3. [Gate1b proof template](./gate1b-production-supabase-spot-check-proof-template.md) を複製または issue / handoff に貼る。
4. production SQL Editor で table / RLS / policy / bucket query を確認。
5. production Storage UI で 4 buckets が private であることを確認。
6. User A / User B で own data / cross-user denial を確認。
7. `script-audio` replay と `take audio` replay を own / cross-user で確認。
8. `NOTIFY pgrst, 'reload schema';` 実行後、API smoke を再確認。
9. proof template に `PASS / WARN / BLOCKED / FAIL`、checked_at、reviewer、masked project ref だけを記録する。

## Remaining Decisions

- Production Supabase apply の担当者と実行記録の保存先。
- Production RLS spot check を誰がどの user で行うか。
- Account deletion actual cleanup 実装前に public Web を出せるか。
- Quota / cost guard を Web public 前にどこまで入れるか。
