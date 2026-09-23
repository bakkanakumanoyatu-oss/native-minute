# Foundation Staging safe cutover — push admission STOP

2026-09-23 / `NATIVE_MINUTES_SCRIPT_FOUNDATION_STAGING_SAFE_CUTOVER`。
改訂指示に従い、local検証を再実行せず候補を保存する。**LOCAL PASS / local candidate commit対象確定、PUSH・STAGING APPLY・SMOKE・HUMAN DEVICEは未実施。CLOSEDではない。** exact commit SHAと最終index検証は `outputs/foundation-safe-cutover-20260923/commit-receipt.json` に記録する。

## 到達点と停止理由

**停止理由はpushの自動配備連動。** `codex/g3-mobile-main-loop` はVercelの2プロジェクトに接続され、両方で `gitProviderOptions.createDeployments=enabled`。Staging以外の `native-minute` プロジェクトでも、基準HEAD `392700a229a55307a57582f0722d2b41ff66c5d3` の同ブランチからPreview `dpl_96kWKLocbjFVR4NFZt4GLowLwwuw` が自動作成されている。同PreviewにはSupabase URL/anon/service-roleと実providerの環境変数名が設定されている。値や接続先DBは読んでおらず、Production DBを指すと断定しない。しかしStaging限定の反映・書込み保護を保証できないため、今回候補はpushしない。

Stagingプロジェクト自身のPreviewには環境変数がなく、通常のStaging aliasは別の手動配備を参照する。自動PreviewとStaging alias、Vercelのtarget名 `production` と製品のProduction環境を混同しない。

改訂指示§3の「未承認のProduction操作や切替順序を破る自動反映が起きるならpush前にSTOP」を適用した。プロジェクト設定変更、Git連携解除、抑止設定の新設、別ブランチへの迂回pushは実行していない。次の一点は、当該ブランチpushによる両プロジェクトへの自動Previewを安全に抑止できる設定を確定すること。

## Candidateと証拠再利用

開始時のrootはDeveloper checkout、HEAD/upstream/remoteはすべて上記基準SHA、index空。関連する別タスクはidleで、並行編集・重複適用の証拠なし。workspace guardを新規実行しPASS。

実装manifest87ファイルすべてが `implementation-hashes.json` と一致。既存31 files / 506 tests、隔離PostgreSQLのlegacy/RLS/ACL/immutable history/atomic save/競合/active10/削除v2/v1証跡、root/mobile lint・typecheck、Next/local Vite buildを再利用。修正済みP1のparser round tripとWeb退出後の遅延startは最終506 testsおよびWeb単独PASSログで確認した。途中の失敗ログを最終結果と取り違えない。

今回のcandidateにはfoundationの製品差分・関連tests・契約文書だけを含める。`docs/current-state.md` はfoundation checkpointだけをindexへ入れ、以前の60行の未commit履歴追記はworktreeに保持する。styles.css、受入checklist/mapping3件は実装前hashと一致し、stageしない。既存untracked WIP、secret backup、`.env.local.save`、repo `supabase/.temp` を読取/hash/変更しない。今回新規検証の証拠は `outputs/foundation-safe-cutover-20260923/`。

styles.cssの既存4行（縦横回転時のtext adjustment）はfoundation外の実機修正WIPとして保持。今後同じworktreeからnative buildする場合はその差分も別manifestに記録し、commitだけとbinaryが一致したと扱わない。今回はbuild/install前に停止。

## 切替互換性と書込み保護

| DB / BFF | 旧Web・旧mobile | 新Web・新mobile |
|---|---|---|
| 0032 / 旧BFF | 従来契約。旧Web編集・物理DELETEも生きている | 新revision契約は未成立 |
| 0032 / 新BFF | 対応schema不足。安全な配備順序として採用しない | revision/archive query・RPCが未存在で利用不可 |
| 0033のみ / 旧BFF | direct script CRUD/Take claimや旧practice予約をDBが拒否。全体互換ではない | account deletion v2が未成立、開放しない |
| 0033+0034 / 旧BFF | 旧writer失敗。読めてもlegacy表示・削除契約を保証できずrollback先にしない | 対応BFF必須 |
| 0033+0034 / 新BFF | versionなしpractice/editを拒否。旧Web DELETEだけowner確認後のarchive互換。旧mobile全体の利用継続は保証しない | 同版契約で利用可能、live受入は別途必要 |

0033は通常rolesのscripts直接INSERT/UPDATE/DELETEとTake直接claimを閉じ、旧予約signatureの実行権限を廃止。新BFFはexpected revision/epoch、editはrevision/lock versionを要求し、通常削除をarchiveへ変更する。0034はrevisionとsource-useをaccount inventory v2へ含め、fence/finalizer/count/残存検証と既存v1 terminal evidenceを維持する。ここはsource一致と既存隔離DB証拠による確認で、live適用の証明ではない。

既存計画の採用順序は候補固定・復旧確認・BFF/native準備 → 全旧writerのadmission停止とdrain → 0033 → 0034（途中で再開しない）→ 対応BFF/Web/native → postflight後再開。今回、最初のpush admissionで停止。**実際の書込み停止は未設定**であり、瞬間的なpending=0を停止保証の代用にしていない。旧deployment URL・Web・mobile・workerを含む停止方式の実行確認は次の切替gate。未解決intentをcancel/deleteしていない。

## DB・復旧と現行配備

CLIを非secretの明示Staging refだけを置いた隔離workdirへ向け、`BEGIN READ ONLY` 内でlive状態を確認した（read_only=on）。ledgerは0001–0032、Scripts13 / Takes7（reviewed6・completed1）/ script_audios7、script_revisions未存在。pending Take0、reserved practice writer0、inflight v1 deletion0。0033/0034適用もpostflightも実行していない。旧DBにはrevision列がまだないため、local設計のNULL保持をlive適用後確認済みとは書かない。

Supabase既存backup catalog読取は `backups=null`、physical backup一覧空、PITR=false。利用可能な復元用backupはまだ証明していない。counts/hashはbackupではない。push gate停止後のdump/backup作成・復元検証へは進んでいない。既存計画どおりcommit後のschema問題はwritesを閉じforward recoveryを検討し、旧BFF無条件復帰・revision drop・legacy backfill・破壊的restoreを自動実行しない。DB backupがStorage音声を復元するとは扱わない。

現行Staging alias `native-minute-staging.vercel.app` は `dpl_Evxze3rYhAL4AwgT8i7rsoJYqEbB` / READYのまま。再配備なし。同じiPhone 14 Plusの `com.nativeminutes.app.staging` 1.0(1) の現inventory URLは最新metadata continuity install receiptと一致。既存署名artifactのassetは `index-DeMYF9z6.js`、sourceRevisionは `54b58de…` + dirty manifestであり、現在Git HEADとは別。新規署名/build/install、アプリ削除、data clearなし。

## 実行範囲・Human受入

新規実行はworkspace guard、source/index/WIP照合、Vercel設定・alias・deploy identity読取、Staging read-only SQLとbackup catalog読取、device inventory、候補のdiff check・local commit確認。506 tests、lint/typecheck/build、隔離DB試験はsource一致を確認して再利用し、今回は再実行しない。live smoke・provider生成/評価・clone・Storage変更は0。最新正式metadata continuity Human PASS/CLOSEDを保持し、古いcurrent-state WIPの「Human待ち」を再判定根拠にしない。

**Humanが新機能を試せるStagingにはまだ到達していない。** 停止解除後にStaging切替と限定smokeを完了してから、新規テスト台本1本でtitle編集 → 本文編集 → archive → 復元 → 既存の正常な保存結果/録音 → Home/台本/履歴の自然な往復を依頼する。archiveは一覧から外す操作で、録音・履歴を残し復元できる。10本作成や競合試験はHumanへ要求しない。

VERSIONED PROVIDER E2EはPENDING。次の追加承認案は、新revisionへのお手本生成1回、録音1回、その録音への評価送信1回（必要な文字起こし・発音評価・助言を含む）でrevision付き保存とReview/Progressを直接確認すること。失敗時の自動追加試行はしない。旧Take再生では代替しない。
