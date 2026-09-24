# Revision / archive / active-10 foundation — final closeout

2026-09-24 JST / `NATIVE_MINUTES_REVISION_ARCHIVE_FOUNDATION_FINAL_CLOSEOUT_RESUME`。

**Verdict: foundation CLOSED for Staging and the specified Human acceptance.** Productionは変更していない。前回のSTOPは正しい。先行する実provider一周のTakeは別script `Speech1-4` に属していたため、対象revisionの証拠には採用しない。その後Humanが指定scriptで一周し、今回その新TakeのDB identityをread-onlyで確認した。同じHuman操作やprovider呼出しは再実行していない。

## Evidence boundaries

| 層 | 採用した証拠 |
|---|---|
| LOCAL | foundation実装時の506 tests・隔離DBのrevision/archive/active-10・lint/typecheck/build、legacy read-path remediationの158 tests、follow-upの関連6/44 checksを既存記録から再利用。今回source変更・製品test再実行なし。 |
| STAGING | 専用Supabase project `native-minute-staging`（ref `ztlliqishddrrvqqrrlu`、`ap-northeast-1`、`ACTIVE_HEALTHY`）を`supabase_read_only_user` / `transaction_read_only=on`で照合。migration `0033`/`0034`適用済み。対象script、Take、Review関連行、legacy行、archive/active数を限定確認。 |
| HUMAN | legacy Home / Progress / Review read-path PASS、archive / restore UX PASS、title-only edit PASS、本文revision edit PASS。今回の対象でReview到達、本人録音、弱点語、coach、Progressのcurrent latest/best 89とall-time 2件をHumanが確認。 |
| PROVIDER E2E | Humanが対象のcurrent revisionでお手本生成・再生・録音・評価を一周。DBではrevision 2のお手本音声1行、新しい`reviewed` Takeと評価payload、weak words 4行、coach feedback 1行を確認。providerへの再呼出しやprovider側ログ検証は今回行っていない。 |

## Target and saved Review identity

Staging観測は2026-09-24 23:41–23:42 JST。scriptはタイトルだけでなくstable IDで固定した。

| 項目 | Staging read-only結果 |
|---|---|
| Script | `58テストtest` / `ca20d28c-3b90-4cb7-8a02-dc3e4b330871`、active、lock version 3 |
| Current revision | `1c26e8d2-ed2d-49fa-a487-8c1dd9f9cc04`、revision no. 2、origin `edit`、practice epoch 2 |
| 新Take | `f50120a8-f219-460b-909e-2ed4d2c74d13`、作成2026-09-24 23:35:07 JST、`reviewed` 23:35:32 JST、score 89 |
| 新Takeの固定identity | `script_id=ca20d28c-3b90-4cb7-8a02-dc3e4b330871`、`script_revision_id=1c26e8d2-ed2d-49fa-a487-8c1dd9f9cc04`、`script_practice_epoch=2`。title snapshot・evaluation payloadあり |
| Review関連 | weak words 4行、coach feedback `92533ebc-23cc-4527-bed3-52712a03fcdd` 1行（同Take参照）。評価結果はTakeに永続化 |
| Reference audio | 対象revision 2に1行 |

上のscript/revision/epoch 3値は指定必須条件とすべて一致。別scriptの先行score 92 Takeを今回の対象証拠に混ぜていない。

## Legacy preservation and read-model separation

- Cutover前からのlegacy Take 7件は`script_revision_id` / `script_practice_epoch` / title snapshotが全件NULLのまま。6件`reviewed`、1件`completed`。旧Take列digest `d19b3b4a29340a118053fd6f2cb8639e`、legacy weak words digest `d9a3a5edea9b54d0e9064a65fbad6066`、legacy coach feedback digest `924745cbfdb283b7719e5479ced9ad7e`はcutover postflightと一致。backfill・再関連付け・削除なし。
- 対象scriptの旧Take `19399729-0acc-4fe7-a299-32d78ca04137` は2026-09-18のscore 88、revision NULLで保持。対象のall-time reviewedは2件（88 / 89）、current revision reviewedは新89の1件。current latest / bestはいずれも新Take `f50120a8-f219-460b-909e-2ed4d2c74d13`、score 89。旧88は同一revision比較へ入らない。
- `services/progress/progress.service.ts` は`takeHistory`を全履歴から作り、`latestTake` / `bestTake` / current `takeCount`をcurrent revisionに一致するreviewed Takeだけで作る。Reviewはversioned Takeの保存時revisionを読み、legacy NULLから現在本文を推測しない。HumanのProgress / Review表示結果とDB上の分離は一致した。
- 対象ownerの今回の限定観測はactive 5、archived 2、対象script active。上限10以内。archive/restoreのHuman PASSと既存隔離DBのactive-10競合証拠を採用し、全件再監査はしていない。

## Deployment, scope, and validation

- `0033` / `0034` は専用Stagingへ適用済み。legacy read-pathとarchive UXのremediationは`949423c`、confirmation/restore入口follow-upは`09db1a2ca1865a5da6771ae2526b9fe76876a82e`。Human PASSはその後のStaging実機結果を採用。
- Production DB、provider、app、deploymentへの操作は今回0。Staging以外の`native-minute` projectのPreview ignored-build設定はread-onlyで再確認済み。Productionが今回のcloseout対象になったとは扱わない。
- 今回は`npm run check:workspace` PASS、Staging read-only照合とdocs diff検査のみ。docs-onlyなのでlint / build / typecheck / 製品testは再実行しない。既存のmobile release guard 3件、旧completed Takeの既知Storage欠落は別の制限として残る。
- quota、script-length `8e80a78`、AI-generation disable `a8a3751e`、voice recording guide `0145c981`、brand/logoは別WIP。このfoundation closeoutに実装・merge・判定を混ぜない。

Earlier evidence: [foundation実装](script-revision-archive-foundation-implementation-20260923.md)、[legacy remediation](foundation-legacy-readpath-remediation-20260924.md)。local execution recordsは`outputs/foundation-preview-isolation-20260923/completion-report.md`と`outputs/foundation-legacy-remediation-20260924/completion-report.md`に保持。これらの文書にある当時の`PENDING`は履歴時点の記述であり、今回の最終判定へ巻き戻さない。
