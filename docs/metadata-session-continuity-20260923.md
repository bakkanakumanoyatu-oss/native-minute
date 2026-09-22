# 表示metadataのsession継続と必要時更新

2026-09-23。Closeout MODE: `NATIVE_MINUTES_METADATA_SESSION_CONTINUITY_HUMAN_PASS_COMMIT_PUSH`。**HUMAN ACTUAL-DEVICE PASS / CLOSED、正式採用。** 実装MODEは `NATIVE_MINUTES_METADATA_SESSION_CONTINUITY_AND_EVENT_DRIVEN_REFRESH`。

## 1. Source / installed / BFF identity

Developer checkout、branch `codex/g3-mobile-main-loop`。実装・検証時とcloseout開始時のbase HEAD / upstream / remote は `54b58de2163cc1e1797168843caffbeaa49b88c5`。未commit製品sourceはHEADと区別し、107件のmanifestでbuild→dist→native同梱資産を照合。

最終Staging bundle `com.nativeminutes.app.staging` 1.0(1)、asset `index-DeMYF9z6.js`。同じiPhone 14 Plus / iOS26.2.1へ上書き、data clearなし。receipt / inventory / launchのinstallation URL一致。更新前30秒版は `index-CWSQOB0K.js`、開始時に既存105 sourceの一致を確認。

BFFは既存 `dpl_Evxze3rYhAL4AwgT8i7rsoJYqEbB`、`native-minute-staging.vercel.app`、READYを認証済みVercel CLIのread-only inspectで確認。既存同deploymentの659 source証拠を再利用。BFF再配備・Production・DB変更なし。secret本文を直接読取/hash/ログ出力していない。

## 2. 30秒以内の往復でもloadingへ戻った原因

往復時間と最後の取得成功からの時間は一致しない。既存Progress memoryは30秒timerで成功stateを消し、表示中にも再取得した。Scripts/Reviewも退出・inactive・error・mutationの一律破棄、通常token refresh後の同owner認証通知で保持を消していた。画面の再mount自体は同じAPI instanceを利用しており、主要因はこれらの失効規則。Reviewではmetadata再利用とaudio fresh確認を同じ表示gateへ結び付けていた。

新実装で時間だけによる破棄、通常再訪の余分な取得、正常token更新による全破棄を除去。hookの接続変更をenter/leaveと分離し、online復帰時の二重取得・即abortも防止した。

## 3. 保持・鮮度・容量の新ルール

| 対象 | 再利用entry上限 | 1件上限 | 合計上限 |
|---|---:|---:|---:|
| Scripts現行query | 1 | 64 KiB | 64 KiB |
| Home / Progress / My Takes共通結果 | 1（同じobjectを共有） | 512 KiB | 512 KiB |
| 閲覧済みReview metadata | 5 | 64 KiB | 256 KiB |

`metadata-policy.ts`に一元定義。再利用分合計832 KiBはUTF-8 JSONの概算量でありJS heap計測値ではない。未表示の古いentryから退避する。上限超過の現在画面は読み続けられるが、退出後の再利用には保存しない。表示中の例外分・JS object overheadはこの832 KiBに含まない。variant無制限蓄積・全履歴prefetchなし。

同じ認証session・app process内のmemoryのみ。永続化なし、raw token / private URLをmetadata cache資格にしない。5分は最後の成功確認からの**再確認目安**。timer fetch/消去なし。fresh再訪は取得0、古い対象の次回入場/復帰、手動更新、関連mutation、未解決失敗の通信復旧でだけ必要な再取得を行う。閲覧や別entityのpatchで全snapshotの確認時刻を延ばさない。Review titleはaudio確認と別に成功確認時刻を持つ。

## 4. 変更ファイル・WIP

既存30秒WIPの `display-memory.ts`、`display-loaders.ts`、`display-memory-lifecycle.ts`、`use-display-memory.ts`を統合更新。`progress-memory*.ts`と`use-saved-progress.ts`を同じ方式へ接続。`App.tsx`は既存practice-session epochを利用し、3 metadata storeのlifecycle bindingを統一。

`practice/api.ts`はmutation patch・所有権喪失の関係表示除去・音声Playの明示回復を接続。Home / Scripts / Progress / Takes / Reviewは共通 `MetadataRefresh.tsx`で控えめな更新操作を表示。`PracticeApp.tsx`はmetadata routeのscroll最大24位置とProgress選択、Takes filter/戻り先を保持。refreshによるフォームや同内容DOMのresetを防止。

実装時に追加policy・関連tests・本書・AGENTS/current-stateを更新。closeoutではHumanの明示指示に従い、current-stateを変更・stageしない。旧30秒test本文は `outputs/metadata-continuity-20260923/previous-tests/*.ts.txt`に保存。既存styles、受入mapping/checklist、無関係WIPは開始時hashで保持確認。reset/stash/unrelated stageなし。

## 5. mutation / auth / error / race / audio

- 名前/Favorite成功は返された確定値だけをReviewと既存Progress latest/best/previous/historyへpatch。follow-up GETなし。script作成は応答の台本をupdatedAt順で一覧へ反映、集計はdirty。評価保存は確定Reviewをseedし、関係集計だけdirty。将来の編集/削除APIは追加していない。
- 正常token refreshは既存App sessionを維持。logout→同owner login、owner切替、terminal authは旧instanceを不可逆revoke。backgroundでは表示を保持してpending readをabortし、復帰は既存auth authority確認後に再開。
- offline/timeout/5xx等は成功表示を残し、小さな失敗案内＋手動再試行。route往復でretry連鎖なし。Retry-Afterは容量超過時も保持。401の既存正規refreshに従い、検知済み403/404は対象と関連表示を除去。不正response/原因不明例外は通信失敗に見せかけない。
- owner/sessionとpending requestのidentity、mutation gateで遅い応答をfence。確定削除を旧応答で復活させない。初回readをmutationで中断した場合も、missing dataの再照合へ進む。フォーム/未保存録音を背景更新で消さない。
- cached ReviewにaudioVisitを保存しない。毎入場のfresh Review GETは音声認可用として表示と分離。同時に必要なmetadata readとは共有。音声は従来どおり1件・downloadから30秒、Storage versionとownership必須、Shareは毎回fresh。新しいaudio prefetch対象なし。退出/background/auth/error/mutationで中断し自動retryなし。再検証中のexact save後は、明示Playだけでfresh proofを回復できる。

## 6. Tests / build / review / install

新契約の直接検証58件を含む直接影響14 files: **228 PASS / 1 SKIP**。SKIPは既存 `take-metadata-isolated` の隔離DB環境未設定で、実DB検証PASSとはしない。Chromium/WebKitの実App・実API・実screen＋合成応答: **62条件PASS**。30秒未満/超過/1〜2分/5分、capacity、A/B/A、token/session、background、offline、manual、negative response、mutation/race、scroll/selection/filter、audioを確認。

workspace check、root/mobile lint、mobile source/tests typecheck、root build→typecheck、Staging sync/build、iPhone署名build、provisioning/auth target/同梱資産一致 PASS。native-minute-mvp / ship-check適用。Mainが最後の差分reviewを1回実施し、直接検証で確認した例外・raceを修正。別agent並行編集なし。env/README setup/DB型/migrationの変更は不要。

release guardは既知の未commit source関連3件 **NOT PASS** を保持。署名source照合を別証拠として記録し、guardをPASSへ読み替えない。

## 7. 実機シナリオ結果

同じiPhone / Wi-Fi（cellular=false）、5台本・2Take・1Favorite。最終sourceで完遂。計時中の手動debugger停止なし。route利用可能時刻は正しい内容と主要操作の描画＋2 frames。自動操作による実機観測で、Human体感判定とは分ける。

| シナリオ | N | 最終実機結果 |
|---|---:|---|
| A 短い往復 | 5周、35遷移 | Scripts 33ms（33–33）、Review 49ms（34–50）、Home 33ms（33–52、N15）、Takes 33ms、Progress 33ms（33–50）。全面loading全周0回・0ms |
| B 台本90.001秒表示後 | 1 | 表示消失なし。台本再訪33ms、Review再訪49ms。全面loading0回、scroll差0 |
| C Review A→B→A | 3組・9 Review入場 | cached 8入場は中央値34.5ms（33–50）。未閲覧Bの初回だけ3.887秒、loading 1回/3.869秒。Aへ戻る際に消失なし |
| D 設定アプリへ移動→復帰 | 1 | 約6.844秒の往復。同じprocess・同じ一覧DOM・scroll差0。復帰表示は維持。復帰→利用可能の独立ミリ秒計時はしていない |
| E 手動更新 | 3 | 全面loading0回、同じ一覧DOMとscrollを維持。更新完了中央値2.469秒（1.268–2.935）、待機中も記録を表示 |

Home件数・最新台本、Progress latest/best、選択の往復保持、全測定ReviewのTake/score/助言がcanonical応答と一致。実データへのwrite/provider/新規録音なし。filter・フォーム入力・異常応答・別owner/mutationはbrowser/直接testで確認。

最終実測は準備を除いてA–Eを分けて集計。先行bundle `index-CiYk5PWW.js`の途中試行は、未知例外分類の2箇所補強により中止し、`pre-final-partial-trial.json`へ保存。最終cohortに混在させていない。最終cohortの未完遂は0。

旧30秒版の短期hitはScripts中央値33ms/Review50msだが毎再訪GETが残り、旧代表loopは期限切れを作る31秒待機・別経路を含む。今回の90秒利用や異なる周回との改善率は算出しない。

## 8. 表示loading・metadata GET・audio確認の内訳

| 集計 | 全面loading | 表示用GET（Review共有read以外） | fresh Review GET | 音声binary GET |
|---|---:|---:|---:|---:|
| A 5周 | 0 / 0秒 | 0 | 5 | 5（退出abort） |
| B 90秒利用 | 0 / 0秒 | 0 | 1 | 1（退出abort） |
| C A/B/A 3組 | 未閲覧B初回1 / 3.869秒 | title初回1 | 9（初回metadata兼用1、再訪8） | 9（退出abort） |
| D 復帰 | 表示保持 | 0 | 0 | 0 |
| E 手動更新3回 | 0 / 0秒 | Scripts 3 | 0 | 0 |

AのReview表示は中央値49ms、audio fresh確認完了は別に中央値2.486秒（2.268–3.937、N5）。fresh確認18 GET / Review入場18回で重複0、再訪のtitle追加GET0。準備の初回Scriptsは2.835秒、初回Reviewは4.704秒（各N1）、loading計2回/7.456秒。Homeはprobe開始前に初回取得済みで、初回Home時間は未計測。準備用Home明示更新は3.134秒、表示を保持した。

準備・再生補助を含む全記録はProgress GET1、Scripts GET4（初回1＋手動3）、title GET2（各Reviewの初回）、Review GET18、binary GET17。binaryはNo Play退出による意図的abort16件と完了1件。意図的abortを通信障害として数えない。全API応答にHTTP errorなし。foregroundの自動再確認はReview音声用のみ、非表示metadataの一括refreshなし。

再生補助N1ではfresh確認後に既存prefetchとPlayが1 binary GETを共有。tap→playing 5.375秒、同画面再生125ms、再入場再生85ms。後二者のbinary追加GET0、再入場fresh Review GET1。正しいTakeとmedia時刻の進行を確認。これは音声性能のN5比較ではない。

実データの概算はScripts 3,861 bytes＋共通Progress 22,683＋Review 2件4,989＝31,533 bytes（title/状態とJS overheadを除くpayload推定）。実機heap/cacheの直接計測ではない。短期反復の厳密なstore計測はbrowser: Scripts1/Progress1/Review1、Chromium計7,361 bytes・WebKit7,346 bytesで前後不変。A/B/AでReview2件を確認、最大5件とbyte超過退避は直接test。

## 9. 残る待ちと未解決事項

未取得・退避後・process再起動後はcanonical初回取得を待つ。Reviewの音声fresh検証、保存Take初回binary取得の待ちは残る。ネットワークやserver自体を高速化した変更ではない。別端末の変更は次の必要同期まで以前の表示が残り得て、全端末5分以内同期を保証しない。

VP-01間欠FAIL、R-INT-02文言finding、release guard3件NOT PASS、既存Stage B/Session C/D・他WIPの判定を保持。本件のHuman体感受入は完了。原58全件、Gate8、全体リリースの完了を意味しない。

## 10. Human actual-device acceptance

Human verdict: **PASS**。時間制限を意識しない自然な利用で、Home → 台本 → 履歴 → Review → 録音再生 → 戻る、の一連操作がすべて問題なくスムーズだったと確認。頻繁な全面「読み込んでいます」は気にならず、再訪・表示内容に問題なし。正しい保存録音の再生を確認し、今回のmetadata session continuityを正式採用する旨の指示を受領した。

今回の受入はmetadata navigationの範囲。初回取得・true first audio fetch wait、既知FAIL/NOT PASS、他acceptance WIPを自動closeしない。追加のHuman再試行は不要。

## 11. Closeout scope / validation reuse

受入済みのmetadata store・lifecycle・hook・mutation API・対象UI接続、直接tests、AGENTSのmetadata契約、本書と今回の関連証拠をcommit/normal push対象として確定。前30秒Scripts/Review WIPを統合した最終実装を採用し、旧仕様を独立closeoutしない。

closeout時にsource **107件のhash一致**、同じ署名artifactの実行fileと全Web資産の一致、`index-DeMYF9z6.js`、製品source/同梱JSの一時diagnostic不在を確認。端末probe/timer/fileの除去証拠も一致。既報の228 tests PASS / isolated DB 1 SKIP、browser62、lint・mobile/root typecheck・関連build・signingのPASSを同一sourceで再利用した。今回tests/build/install/deployの再実行や新しいperformance修正はしていない。workspace checkとdiff checkはcloseout時に実行。

styles.css、current-state、受入mapping/checklist、他の既存tracked/untracked WIPは変更・stageしない。protected fileのhashと既存fileのsize/mtimeを照合する。current-state内の受入待ち表記は、この明示的な保全指示に従ってそのまま残し、本書を今回のHuman PASS記録とする。

証拠: `outputs/metadata-continuity-20260923/`（最終実機 `after.json`、集計 `device-summary.json`、`build-source-hashes.json`、`native-artifact-proof.json`、`review-and-validation.json`、`closeout-source-reuse.json`、install/cleanup証拠）。commit hash・normal push結果・最終HEAD/upstream/remote一致はタスク完了応答に記録する。

NEXT_ONE_ACTION: 採用済み状態を維持し、次に取り組む残件のHuman指示を待つ。新しいperformance修正はまだ開始しない。
