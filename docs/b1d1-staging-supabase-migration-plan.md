# Phase B1D1-S2 — staging Supabase migration admission plan

判定: **APPLIED — STAGING MIGRATION VERIFIED**

Historical admission判定: **CONDITIONAL_READY_TO_RETRY — EXACT DRY-RUN GATE REMAINS**

対象branch: `feature/mobile-auth-gate`

監査対象HEAD: `b5e2b460832fa232bc4096792fefec3975bfcda1`

Original scope: repo内migrationのread-only監査のみ。Supabase接続、SQL実行、Dashboard変更、migration変更、commit、pushは行っていない。

## Final outcome addendum

この文書本文は`0012`適用前のadmission / recovery判断を履歴として保持する。人間側の安全な適用とread-only確認により、最終状態は次のとおり確定した。

- migration `0001`〜`0012`: Local / Remote history一致
- remote-only migration: なし
- `account_deletion_requests` table / index / trigger / policy / RLS: PASS
- production data copy: なし
- service roleによるB1D1 mobile route実行: なし
- production Supabase変更: なし

以下のpending、dry-run、retry記述は適用前の監査記録であり、現在の実行待ち状態を表さない。

## 1. Executive summary

`native-minute-staging`の正確なmigration stateは、`0001`〜`0011`がLocal / Remote一致、`0012`だけがLocal pending、remote-only migrationなしである。最初の`db push`は`0012`で失敗しており、その後に`migration repair`、`db reset`、`db push`再実行は行われていない。

B1D1 live smokeの直接要件である`public.scripts`、RLS、`scripts_crud_own`は`0001`で既に適用済みである。現行repo全体のschema contractを完成させるために残っているのは`0012_phase_rr_account_deletion_requests.sql`だけである。`0001`〜`0011`を再実行しない。historyを書き換えず、staging projectの再作成も既定案にしない。

Supabase CLI v2.109.1の実装では、通常migration fileの全statementとmigration-history insertを1 transactionで実行する。人間が実施したread-only catalog proofでは、0012のhistory / table / index / trigger / policyがすべて不在であり、transaction rollbackは実DBでも**確認済み**である。dependency proofも、`pgcrypto`が`extensions` schemaに存在し、`gen_random_bytes(integer)`がqualified / unqualifiedの両方で解決し、実行権限と`public.set_updated_at()`が存在することを確認済みである。history repair、project recreate、0001〜0011の再実行は不要である。

元の失敗は現在のSQL Editor sessionでは再現しないため、failure categoryは**`ORIGINAL_FAILURE_NOT_REPRODUCED`**を維持する。最有力の説明候補は、Supabase CLIの一時login role経路とSQL Editorの`postgres` login sessionで`search_path`初期化が異なることである。ただし元のCLI sessionとsafe error detailが残っていないため、これを確定原因とはしない。

再試行の安全性は成功確率と分けて判断する。rollback clean、0012のtransaction atomicity、destructive statement不在、pending-selection仕様により、exact dry-runが0012だけを示し、CLI接続を`postgres` login sessionへ合わせた場合に限り、**0012の1回だけのretryを認可できる**。この文書更新時点ではdry-runもactual `db push`も実行していない。

## 2. Current blocker (historical pre-apply state)

B1D1は`PARTIAL — STATIC VERTICAL SLICE VERIFIED`である。staging schemaは`0001`〜`0011`まで適用済みで、残るmigration blockerは`0012`だけである。

失敗した`0012`のtransaction rollbackは実DBで確認済みである。確認結果は次のとおり。

- `history_0012_absent`: `true`
- `table_absent`: `true`
- `indexes_absent`: `true`
- `triggers_absent`: `true`
- `policies_absent`: `true`

dependency proofも次をすべて満たす。

- `pgcrypto`はinstalledで、schemaは`extensions`
- `gen_random_bytes(integer)`は存在し、unqualified / `extensions.` qualifiedの両方で解決
- SQL Editor sessionの`search_path`は`extensions`を含む
- function execute permissionあり
- `public.set_updated_at()`あり

したがってschema/history driftはなく、history repairとstaging recreateは不要である。残るgateは、SQL Editorと元のCLI migration sessionの差を踏まえた接続方式の固定と、dry-runがexactly 0012だけを示すことの確認である。

- rollback proofは**PASS**。`0012`は通常のpending migrationとして扱う。
- dependency proofはSQL Editor sessionで**PASS**。database object / permission不足は現在再現しない。
- original failureは`ORIGINAL_FAILURE_NOT_REPRODUCED`。根拠なしにtransient failureへ分類し直さない。
- exact dry-runとsession-alignment gate後の1回だけのretryは、失敗時にも0012全体がrollbackされるため安全に認可できる。同じ失敗が再発したら追加retryしない。

既存linked CLI workdirを継続使用し、同じstaging targetと同じlocal migration setを保つ。新しいlink、project recreate、history repairを通常手順へ追加しない。

### SQL Editor sessionとCLI migration sessionの差

repo内のmigrationには、migration session全体を変更する`SET search_path` / `set_config(..., false)`はない。`0001`と`0003`にある`set search_path = public`は、それぞれ`public.handle_new_user()`と`public.persist_review_bundle(...)`の**function-local configuration**であり、後続migrationのsession search pathを変更しない。`0012`自身にもsearch path変更はない。

Supabase CLI v2.109.1のofficial sourceでは、linked `db push`の接続は次の2経路を持つ。

1. DB passwordがCLI processへ安全に供給される場合、`postgres`として接続する。
2. DB passwordが供給されない場合、Management APIで一時`cli_login_*` roleを作り、そのroleで接続後に`SET SESSION ROLE postgres`する。

さらにCLIは各migration fileの直前に`RESET ALL`を実行する。PostgreSQLの`SET ROLE`は、対象roleに設定された`ALTER ROLE ... SET` session variableを読み直さない。したがって2の経路では、`current_user`が`postgres`でも、login時のsession defaultsはSQL Editorの`postgres` login sessionと一致するとは限らない。SQL Editor queryはdatabase側で`postgres` roleとしてrouteされるため、今回のSQL Editor proofは現在のdatabase dependencyを証明するが、元のCLI一時login sessionのpost-`RESET ALL`状態を完全には証明しない。

この差は、元のfailureがunqualified `gen_random_bytes(integer)`のresolutionだった場合を説明できる。ただし元のCLI connection modeとsafe error categoryが保存されていないため、root causeは確定できない。記録上は次の二層に分ける。

- confirmed category: `ORIGINAL_FAILURE_NOT_REPRODUCED`
- leading hypothesis: `CLI_TEMP_ROLE_SEARCH_PATH_DIVERGENCE`

`supabase db query --linked`はv2.109.1ではManagement API経由であり、`db push`と同じdirect PostgreSQL sessionを作らない。このため同commandを追加実行しても元のsession差の最終proofにはならない。

### Extension作成と名前解決の順序

1. `0001`先頭の`create extension if not exists pgcrypto;`がextension dependencyを宣言する。
2. 実stagingでは0001はhistory上適用済みで、現在の`pgcrypto`は`extensions` schemaに存在する。
3. `IF NOT EXISTS`は既存extensionを別schemaへ移動しない。したがって0012 retry時にextensionを再作成・再配置しない。
4. `0012` line 4のunqualified `gen_random_bytes(16)`は、`CREATE TABLE`をparse / executeするそのsessionのeffective search pathで解決される。
5. CLIは0012直前に`RESET ALL`するため、以前のmigration fileやoperator sessionで行った一時的な`SET search_path`へ依存できない。

再試行時はmigrationを編集せず、CLIを`postgres` login sessionへ合わせる。DB passwordはoperatorのlocal secret boundaryからenvironment経由でCLIへ渡し、値を文書・shell argument・terminal captureへ出さない。この経路なら`RESET ALL`は`postgres` login sessionのdefaultへ戻り、今回SQL Editorで確認したrole/session contractと整合する。

## 3. Migration inventory

共通判定:

- migration総数: **12**
- production data依存: **なし**
- seed / fixture SQL: **なし**（`supabase/seed.sql`も存在しない）
- data-destructive apply statement: **なし**
- extension: `0001`の`pgcrypto`のみ（`create extension if not exists`）
- managed schema dependency: Supabase hosted projectの`auth.users`、`storage.buckets`、`storage.objects`
- provider設定依存: **なし**
- service-role API key依存: **なし**

| Filename | Purpose / objects | Dependency | Empty project safety / side effect | Idempotency | B1D1 live smoke |
| --- | --- | --- | --- | --- | --- |
| `0001_init.sql` | `profiles`、`voice_consents`、`voices`、`scripts`、`script_audios`、`takes`、`weak_words`、`coach_feedback`; `set_updated_at` / `handle_new_user`; Auth trigger; base indexes / RLS / policies | hosted `auth.users`; `pgcrypto` | Safe。空table、trigger、policyを作る。production row不要 | Partial。tableは`if not exists`、functionはreplace、trigger/policyはdrop-create。drift済みDBを完全収束させる用途ではない | **必須** |
| `0002_phase1_hardening.sql` | voice consent/voice link、script audio voice key、take transcript/review payload columns | `0001` | Safe。旧unique constraintを新indexへ置換するが空DBでdata conflictなし | Mostly repeatable。constraint drop / column/index `if not exists` | routeには直接不要 |
| `0003_phase25_hardening.sql` | score/coach columns、delete policies、`persist_review_bundle` RPC | `0001`、`0002` | Safe。migration実行時にrow削除なし。function内のdeleteはRPC実行時だけ | Mostly repeatable。policy drop-create、function replace | 直接不要 |
| `0004_phase25_storage_guards.sql` | script audio partial unique indexes、voices / script_audios ownership hardening | `0001`、`0002` | Safe。index/policy置換のみ。row/object削除なし | **one-time前提**。新policy名をdropせずcreateするため手動再実行しない | 直接不要 |
| `0005_phase5_recordings_storage.sql` | private `recordings` bucket、user-prefix CRUD policies | hosted Storage | Safe。空private bucket作成、object生成なし。15 MiB / audio MIME allowlist | Partial。bucket conflictはno-op、policyはdrop-create。既存bucket driftは収束しない | 直接不要 |
| `0006_phase6_script_audio_storage.sql` | private `script-audios` bucket、user-prefix CRUD policies、`script_audios.stored_asset` | `0001`; hosted Storage | Safe。空private bucketとcolumnのみ。15 MiB | Partial。同上 | 直接不要 |
| `0007_phase7_voice_sample_storage.sql` | private `voice-samples` bucket、user-prefix CRUD policies | hosted Storage | Safe。空private bucketのみ。15 MiB | Partial。同上 | 直接不要 |
| `0008_phase8_voice_consent_storage.sql` | private `voice-consents` bucket、user-prefix CRUD policies | hosted Storage | Safe。空private bucketのみ。10 MiB | Partial。同上 | 直接不要 |
| `0009_phase_s5_quota_events.sql` | `quota_events`、indexes、updated trigger、own-read RLS | `0001.set_updated_at`; `auth.users` | Safe。空logging tableのみ | **one-time前提**。trigger/policyを無条件createするため手動再実行しない | 直接不要 |
| `0010_phase_s5_voice_quota_events.sql` | quota constraintをvoice event対応へ拡張 | `0009` | Safe。空tableのcheck constraint置換。既存不適合rowなし | Repeatableに近いがmigration historyで一度だけ実行 | 直接不要 |
| `0011_phase_s6_audio_library.sql` | `script_saved_model_audios`、`script_saved_best_takes`、indexes、select-only RLS | `0001`の`scripts` / `script_audios` / `takes` | Safe。空curation tableのみ | Partial。table/indexはconditional、policyはdrop-create | 直接不要 |
| `0012_phase_rr_account_deletion_requests.sql` | `account_deletion_requests`、indexes、updated trigger、own-read RLS | `0001.set_updated_at`; `auth.users`; `pgcrypto` | Safe。request tracking tableのみ。cleanup/deletionは実行しない | Partial。table/indexはconditional、trigger/policyはdrop-create | 直接不要 |

`0002`、`0004`、`0010`にはconstraint/index/policyの`drop`があるが、table、row、bucket、objectを削除しないschema置換である。`0003`のfunction bodyにはreview bundle更新時の子row置換があるが、migration applyではfunctionを定義するだけで実行しない。したがって「data-destructive migrationあり」には該当しない。

## 4. Dependency order

適用順はfilenameの昇順から変更しない。

1. `0001_init.sql`
2. `0002_phase1_hardening.sql`
3. `0003_phase25_hardening.sql`
4. `0004_phase25_storage_guards.sql`
5. `0005_phase5_recordings_storage.sql`
6. `0006_phase6_script_audio_storage.sql`
7. `0007_phase7_voice_sample_storage.sql`
8. `0008_phase8_voice_consent_storage.sql`
9. `0009_phase_s5_quota_events.sql`
10. `0010_phase_s5_voice_quota_events.sql`
11. `0011_phase_s6_audio_library.sql`
12. `0012_phase_rr_account_deletion_requests.sql`

主な依存chain:

- `0001` → `0002` → `0003` / `0004`
- `0001.script_audios` → `0006`
- hosted Storage → `0005`〜`0008`
- `0001.set_updated_at` → `0009` → `0010`
- `0001.scripts/script_audios/takes` → `0011`
- `0001.set_updated_at` / `pgcrypto` → `0012`

filenameをrenameしない。既存migrationをmerge/squashしない。個別SQLを途中から実行しない。

## 5. Destructive / side-effect review

### No data-destructive apply

- `drop table`、`truncate`、migration-timeのbusiness row `delete`なし
- Storage bucket / object deleteなし
- Auth user deleteなし
- production data/user copyなし
- provider API / external network functionなし
- seed insertなし

### Intended side effects

- `0001`: Auth user作成後にprofileを作るtrigger
- `0003`: authenticated userが所有reviewをatomic保存するsecurity-invoker RPC
- `0005`〜`0008`: private bucket 4個とauthenticated user-prefix policy
- `0009`: quota-event timestamp trigger
- `0012`: account-deletion request timestamp trigger

### Storage admission

4 bucketはすべて`public=false`で、migrationは空bucketを作るだけでobjectを投入しない。policyは`storage.foldername(name)`の第1segmentが`auth.uid()`と一致することを要求する。bucket設定はSQLで固定済みなのでprovider/storage Dashboard上の追加判断は不要である。

注意: `insert ... on conflict (id) do nothing`のため、既に同名bucketが誤設定で存在するDBを自動修復しない。今回は人間確認済みの新規projectであるため許容できる。適用前に同名bucketやcustom schemaが存在していた場合は停止する。

## 6. Required staging subset

| Scope | State | Decision |
| --- | --- | --- |
| B1D1 `/api/mobile/scripts` DB最小要件 | `0001`適用済み | `scripts`、RLS、`scripts_crud_own`は存在する前提 |
| 既適用migration | `0001`〜`0011` Local / Remote一致 | 再実行しない |
| pending migration | `0012` Localのみ | rollback / dependency proof済み。exact dry-run後の唯一の再実行候補 |
| remote-only migration | なし | history repair不要 |

現在の`types/database.ts`、Web service、既存readiness runbookは12本適用後のschemaを前提にする。ただし再開時のpending setは全12本ではなく、exactly `0012_phase_rr_account_deletion_requests.sql`だけでなければならない。

## 7. Recommended application method

### A. Supabase CLI — recommended

| Viewpoint | Assessment |
| --- | --- |
| Safety | explicit staging link、`db push --dry-run`、pending list確認後に一度だけapplyできる |
| Reproducibility | remote historyとlocal filesを比較し、現在はpendingの0012だけを適用する |
| Credentials | CLI login tokenとDB passwordを人間のlocal credential boundaryで扱える。API service-role key不要 |
| Human error | wrong-project riskは残るため、project name / empty remote historyをapply直前に再確認する |
| Migration history | `supabase_migrations.schema_migrations`へ自動記録され、`migration list`で比較できる |
| Rollback | `0012`はtransactional rollbackをcatalogで確認する。project recreateやhistory repairを既定案にしない |

Supabase公式資料:

- [Database migrations](https://supabase.com/docs/guides/deployment/database-migrations)
- [CLI `db push`](https://supabase.com/docs/reference/cli/v1/supabase-db-push)
- [Local development workflow](https://supabase.com/docs/guides/local-development/cli-workflows)

### B. Dashboard SQL Editor — not recommended

| Viewpoint | Assessment |
| --- | --- |
| Safety | paste範囲、順序、対象project tabの取り違えリスクが高い |
| Reproducibility | operator依存。12 filesの一部漏れを機械的に防ぎにくい |
| Credentials | browser session内で完結するが、それだけではCLIより安全とはいえない |
| Human error | 高い。特に`0004` / `0009`は手動再実行に弱い |
| Migration history | SQL実行だけではCLI historyと一致しない |
| Rollback | どこまで実行済みか判定しにくく、recreate判断も難しくなる |

SQL Editorを使ってmigration本文を順次実行したり、history tableを手動insertしたりしない。`migration repair`も今回の新規projectでは不要であり、要求された場合はdriftとして停止する。

## 8. Exact human steps

以下は既存linked stagingを維持するrecovery sequenceである。rollback / dependency proofは完了済みであり、次はsession-aligned dry-runである。

1. 同じlinked CLI workdir、同じCLI version `2.109.1`、同じ12 migration filesを使う。再link、`migration repair`、`db reset`、project recreateを行わない。
2. `migration list --linked`を再確認する。

   ```bash
   npx --yes supabase@2.109.1 migration list --linked
   ```

   PASS: `0001`〜`0011`はLocal / Remote一致、`0012`はLocalのみ、remote-onlyなし。

3. rollback proofとdependency proofは人間確認済みとして、boolean結果だけをoperator checklistへ転記する。SQLを再実行しない。
4. schema/history repair、project recreate、migration本文変更を行わない。
5. CLI接続をSQL Editorと同じ`postgres` login sessionへ合わせる。operatorが保有するDB passwordを短命な`SUPABASE_DB_PASSWORD` environment経由でCLI processへだけ渡す。値を表示せず、`--password` shell argument、文書、source、env fileへ保存しない。
6. dry-runを実行する。

   ```bash
   npx --yes supabase@2.109.1 db push --linked --dry-run
   ```

   PASS: pendingはexactly `0012_phase_rr_account_deletion_requests.sql` 1本。`0001`〜`0011`、seed、roles、remote-only、別repair migrationが1件でも対象なら停止する。

   `--dry-run`はpending fileを列挙するだけでSQLをtransaction実行・rollbackして検証する機能ではない。0012 SQL自体の成功保証として扱わない。

7. dry-runがexactly 0012だけなら、次の根拠により1回だけのretryを人間が承認できる。

   - 0012由来objectとhistoryが完全不在
   - dependency / execute permissionが現在正常
   - `postgres` login sessionへ合わせることで最有力のsession差を回避
   - CLIが0012 SQLとhistory insertを1 transactionで実行
   - 0012にtransaction外statementやdata-destructive statementなし
   - pending migration selectorがremote済み0001〜0011をskip

8. 承認後に限り、同じCLI version / workdir / linked stagingで1回だけretryする。

   ```bash
   npx --yes supabase@2.109.1 db push --linked
   ```

   CLIはremote historyに存在する`0001`〜`0011`をskipし、pendingの`0012`だけを実行する。`--include-all`、`--include-seed`、`--include-roles`、`--debug`を付けない。接続時に一時login role初期化が表示された場合はsession-alignment未達としてapply前に停止する。

9. 完了直後に履歴一致を確認する。

   ```bash
   npx --yes supabase@2.109.1 migration list --linked
   ```

   PASS: `0001`〜`0012`すべてLocal / Remote一致、remote-only / missingなし。

10. apply後のtable/RLS/policy queryを実行する。失敗した場合はその場で再retry、history repair、manual SQL補修を行わず停止する。

## 9. Secret handling

- project ref、DB password、login token、anon/publishable key、user access tokenをこの文書、source、shell script、terminal capture、proofへ記録しない。
- DB passwordを`--password <value>`としてshell historyへ残さない。interactive promptまたは短命environmentのみを使い、完了後にunsetする。
- Supabase `service_role` keyはmigration applyにもB1D1 route proofにも使わない。
- `NEXT_PUBLIC_SUPABASE_*`やmobile build変数はmigration applyに不要。Vercel staging setupは別Phaseとする。
- `.env.local`を開かない。既存`npm run supabase:storage-rls:check`は`.env.local`を読み、service roleを要求するため今回のstaging verificationには使用しない。
- `--debug`を使わない。CLI errorを記録する場合はfilename、status category、safe reasonだけにする。
- stagingへproduction user/data/keysをcopyしない。

## 10. Verification SQL

以下はstaging SQL Editor等の承認済みread-only surfaceで実行するqueryである。row content、Auth user、credentialは返さない。

### 0012 rollback proof — retry前

```sql
select
  not exists (
    select 1
    from supabase_migrations.schema_migrations
    where version = '0012'
  ) as history_absent,
  to_regclass('public.account_deletion_requests') is null as table_absent,
  not exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname like 'account_deletion_requests%'
  ) as table_and_indexes_absent,
  not exists (
    select 1
    from pg_catalog.pg_trigger t
    where t.tgname = 'set_updated_at_account_deletion_requests'
      and not t.tgisinternal
  ) as trigger_absent,
  not exists (
    select 1
    from pg_catalog.pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'account_deletion_requests'
  ) as policies_absent;
```

PASS: 5 booleanすべて`true`。これによりhistoryだけでなく0012由来のschema objectも残っていないことを確認する。tableが存在しない場合、tableに付属するconstraint/commentも存在できない。

FAIL: 1つでも`false`ならpartial schema/history driftとして停止する。同じ`0012`を再実行せず、`migration repair`、manual drop/create、project recreateへ自動移行しない。

### 0012 dependency proof — retry前

```sql
select
  to_regprocedure('public.set_updated_at()') is not null as updated_at_function_present,
  exists (
    select 1
    from pg_catalog.pg_extension
    where extname = 'pgcrypto'
  ) as pgcrypto_present,
  exists (
    select 1
    from pg_catalog.pg_proc p
    where p.proname = 'gen_random_bytes'
      and pg_catalog.pg_get_function_identity_arguments(p.oid) = 'integer'
  ) as random_bytes_function_present;
```

実施結果: `pgcrypto`、`gen_random_bytes(integer)`、`public.set_updated_at()`、qualified / unqualified resolution、execute permissionはすべてPASS。`pgcrypto` schemaは`extensions`で、SQL Editor sessionのsearch pathも`extensions`を含む。これはdatabase dependencyが現在正常であることのproofであり、元のCLI一時login sessionを再現したproofではない。

### Migration history

```sql
select version
from supabase_migrations.schema_migrations
order by version;
```

retry前PASS: `0001`〜`0011`がexactly 11 rows、`0012`なし、extraなし。

retry後PASS: `0001`〜`0012`がexactly 12 rows、順序一致、extraなし。最終判定はCLI `migration list --linked`との一致も必要。

### Required tables and RLS

```sql
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
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
order by c.relname;
```

PASS: 12 tablesが存在し、全rowの`rls_enabled = true`。

### Exact scripts policy

```sql
select
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_catalog.pg_policies
where schemaname = 'public'
  and tablename = 'scripts'
order by policyname;
```

PASS:

- policy名: `scripts_crud_own`
- command: `ALL`
- `USING`: `auth.uid() = user_id`
- `WITH CHECK`: `auth.uid() = user_id`
- wildcard allow policy、anon-specific allow policyなし

### scripts columns

```sql
select column_name, is_nullable, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'scripts'
order by ordinal_position;
```

PASS: `id / user_id / title / content / target_seconds / locale / created_at / updated_at`が存在し、`user_id`はnon-nullで`auth.users(id)`を参照する。

### Foreign key

```sql
select
  tc.constraint_name,
  kcu.column_name,
  ccu.table_schema as foreign_table_schema,
  ccu.table_name as foreign_table_name,
  ccu.column_name as foreign_column_name
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
 and tc.constraint_schema = kcu.constraint_schema
join information_schema.constraint_column_usage ccu
  on tc.constraint_name = ccu.constraint_name
 and tc.constraint_schema = ccu.constraint_schema
where tc.constraint_type = 'FOREIGN KEY'
  and tc.table_schema = 'public'
  and tc.table_name = 'scripts';
```

PASS: `scripts.user_id` → `auth.users.id`が存在する。

### Storage buckets

```sql
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('recordings', 'script-audios', 'voice-samples', 'voice-consents')
order by id;
```

PASS: exactly 4 rows、全bucket`public = false`、size/MIME設定がmigrationと一致。Storage object countは0のままでよい。

### Storage policy category

```sql
select policyname, cmd, roles
from pg_catalog.pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname like any (array[
    'recordings_%',
    'script-audios_%',
    'voice-samples_%',
    'voice-consents_%'
  ])
order by policyname;
```

PASS: 各bucketにSELECT / INSERT / UPDATE / DELETE policyがあり、`authenticated`向けである。predicate本文のspot checkではbucket IDとuser-id first path segmentの両方を要求する。

## 11. RLS User A/B proof

SQL Editorはowner/service相当でRLSをbypassし得るため、User A/B分離の最終proofに使わない。staging専用の2 userを通常Auth flowで作り、public anon/publishable key + 各user sessionだけを使う。service role、admin client、client指定user ID overrideは使わない。

1. Anonymous direct clientで`public.scripts`をselectする。
   - PASS: rowを1件も取得できない（通常はempty result）。
   - BFFでもBearerなしは401 `auth_required`。
2. staging専用User A sessionで1件だけscript fixtureを作る。`user_id`はsessionの`auth.uid()`と同一にする。
   - migration/seed SQLへfixtureを入れない。
   - script本文やrow IDをproofへ記録しない。
3. User Aのpublic user clientで一覧取得する。
   - PASS: Aのfixtureだけを取得できる。
4. User Bのpublic user clientで同じ一覧およびA fixture対象queryを行う。
   - PASS: Aのrowは0件。update/deleteも不可。
5. staging BFFへUser AのBearerで`GET /api/mobile/scripts`。
   - PASS: 200、Aのowned DTOだけ。
6. staging BFFへUser BのBearerで同route。
   - PASS: 200、Aのfixtureなし。
7. response boundaryを確認する。
   - `Cache-Control: private, no-store, max-age=0`
   - `Set-Cookie`なし
   - `Access-Control-Allow-Credentials`なし
   - exact `capacitor://localhost` Originだけを許可
8. fixture cleanupはUser Aのauthenticated clientでだけ行い、staging専用test user以外のdataを作らない。

このproofは二重境界を確認する。BFFは`getUser(accessToken)`でverified user IDを取得し、同じBearerを持つuser-scoped Supabase clientで`listScripts(client, verifiedUser.id)`を呼ぶ。serviceは`.eq("user_id", verifiedUser.id)`を付け、DB RLSも`auth.uid() = user_id`を強制する。cookie fallback、admin client、service roleはない。

## 12. Rollback / recreate strategy

Supabase CLI v2.109.1のofficial sourceでは、通常statementを`BEGIN` / `COMMIT`で囲み、error時は`ROLLBACK`する。Go sidecar implementationも`ExecBatch is implicitly transactional`と明記し、migration-history insertを同じbatchの末尾へ入れる。

- [`legacy-migration-apply.ts` at v2.109.1](https://github.com/supabase/cli/blob/v2.109.1/apps/cli/src/legacy/shared/legacy-migration-apply.ts)
- [`db push connection resolution` at v2.109.1](https://github.com/supabase/cli/blob/v2.109.1/apps/cli-go/internal/utils/flags/db_url.go)
- [`remote connection role handling` at v2.109.1](https://github.com/supabase/cli/blob/v2.109.1/apps/cli-go/internal/utils/connect.go)
- [`migration RESET ALL / pending selection` at v2.109.1](https://github.com/supabase/cli/blob/v2.109.1/apps/cli-go/pkg/migration/apply.go)
- [`file.go` at v2.109.1](https://github.com/supabase/cli/blob/v2.109.1/apps/cli-go/pkg/migration/file.go)
- [PostgreSQL `SET ROLE`](https://www.postgresql.org/docs/current/sql-set-role.html)
- [PostgreSQL `RESET`](https://www.postgresql.org/docs/current/sql-reset.html)
- [Supabase SQL Editor role routing](https://supabase.com/docs/guides/troubleshooting/tracking-postgres-role-activity-to-specific-dashboard-users-8d3715)

`0012`にはtransaction外実行へ切り替わるpipeline-incompatible statementがない。したがってCLI v2.109.1の通常`db push`で失敗した場合、0012のDDLとhistory insertは全体rollbackされる。今回のcatalog proofは5項目すべてtrueであり、このrollbackを実DBでも確認済みである。

今回のrecovery方針:

- migration history repairを行わない。
- staging project recreateを前提にしない。
- `0001`〜`0011`をrollback/reapplyしない。
- catalogはclean確認済み。`0012`を通常pendingとして扱う。
- catalog driftがあれば自動cleanupせず、forward-recovery reviewで停止する。
- retry後に同じ失敗が出たら追加retryせず、safe error categoryだけ記録して停止する。
- `db reset --linked`は使用しない。
- original root causeは確定していないが、clean rollbackにより「1回のretryが失敗しても0012のpartial schema/historyを残さない」ことは確認できる。これは成功保証ではなくretry safetyの根拠である。

## 13. Stop conditions

次のいずれかならapply前または途中で停止する。

- targetが`native-minute-staging`だと一意に確認できない
- production project/refの可能性がある
- migration listが`0001`〜`0011`一致 / `0012` Local-only / remote-onlyなし、という前提と異なる
- rollback proofの5 booleanに`false`がある（今回は全true確認済み）
- dependency proofが現在の確認結果と異なる
- CLIを`postgres` login sessionへ合わせられない、または一時login role経路へ入る
- dry-runが`0012`以外、seed/role/追加SQLを示す
- hosted `auth` / `storage` schema不足、bucket name conflict、custom schema driftがある
- table/bucket/object/Auth userに想定外dataがある
- service-role API key、production credential/data、provider settingが必要になる
- migration本文修正、`migration repair`、manual history insert/dropが必要になる
- migrationがdata deletion、production access、billing/permission変更を要求する
- project ref、DB password、tokenを安全に扱えない

## 14. Human decisions

0012 retry前に必要な人間判断は次の2点である。

1. DB passwordを表示・保存せずCLI processへ一時供給し、`postgres` login sessionへ合わせるoperator手順を承認する。
2. dry-runがexactly `0012`だけを示した後、1回だけのretryを承認するoperatorを決める。

Storage/provider設定、service role採用、production data copyを選ぶ判断は不要かつ禁止である。

## 15. Exact next step (historical pre-apply state)

人間がDB passwordをoperatorのlocal secret boundaryから短命な`SUPABASE_DB_PASSWORD`としてCLI processへ一時供給した状態で、同じlinked CLI workdir / CLI v2.109.1の`db push --linked --dry-run`を実行する。値は表示・保存せず、command完了後にenvironmentから除去する。pendingがexactly `0012_phase_rr_account_deletion_requests.sql` 1本で、一時login role初期化が行われないことを確認する。

その確認と人間承認まではactual `db push`、Vercel staging作成、live auth、production操作へ進まない。dry-run PASS後は、この文書の条件に限って0012の1回だけのretryを認可できる。
