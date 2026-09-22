# 30秒の表示metadataメモリ再利用

2026-09-22。MODE: `OWNER_SESSION_METADATA_MEMORY_REUSE_30S_COMMIT_PUSH_CLOSEOUT`。Home／成長／My Takesの30秒owner/session metadata memory reuseをHuman実機確認で採用。**HUMAN ACTUAL-DEVICE PASS / CLOSED**（今回のperformance fixのみ）。

## 実装契約

- `createPracticeApi`のauthenticated owner/sessionごとにProgressMemoryを1個生成。成功した`MobileProgress`表示metadataだけを共有し、serverのlatest/best/countsをそのまま使用。
- memory only。成功時の単調時計から最大30,000ms。参照で延長せず、成功した新しいserver responseだけ期限を更新。期限timer＋読取時の期限確認で失効。画面上で期限切れした場合も古い参照を捨てる。
- Home／成長／My Takesへ入るたび認証付きcanonical GET。cache hit時は前回の成功表示を維持し「前回取得した記録を表示しています。最新情報を確認中…」。同じgenerationのin-flight GETのみ共有。30秒server確認不要という実装ではない。
- logout開始、owner変更、同ownerの新session、native inactive／background、WebView非表示、offline、mutation開始／完了、削除、取得／revalidation error、TTL expiryでinvalidate。前面復帰・online復帰・mutation完了・期限後は、対象画面が表示中ならserver再取得。
- Favorite／録音名、台本作成、評価保存、account／voice deletionの現行mutationをbarrierで保護。複数更新が重なる間は表示／再取得を止め、最後の完了後にcanonical refetch。既存afterMetadataWritesを維持。
- generationで古いsuccess/errorを無視。同sessionの再訪はin-flightを共有するため古い要求が新要求を追い越さない。失効sessionは復活しない。古い401応答も新しい同owner sessionをlogoutしない。
- localStorage／IndexedDB／Filesystem／token／audio binary／voice sample／consent audio／private file／audioIdのcacheは追加しない。process restartを越えない。音声first-play、cold launch、DB/schema、provider、server auth／ownership／RLS／atomic save／deletion contractは変更なし。

## 変更ファイル

製品: `apps/mobile/src/practice/progress-memory.ts`、`progress-memory-lifecycle.ts`、`use-saved-progress.ts`、`api.ts`、`apps/mobile/src/App.tsx`、`screens/HomeScreen.tsx`、`ProgressScreen.tsx`、`TakesScreen.tsx`。

直接test: `progress-memory.test.ts`、`progress-memory-lifecycle.test.ts`、`api.test.ts`。ドキュメント: 本書、`docs/current-state.md`。既存styles／mapping／checklist／その他WIPを保全。診断probe・fixtureは製品bundleに含めない。

## 検証

workspace guard、root lint、mobile lint、mobile source/tests typecheck、targeted 141 tests、Chromium/WebKitの実画面20条件、root build/typecheck、Staging web build/sync、native Staging build、署名／資産／認証fingerprint／端末provisioning、diff checkを実施。

直接回帰: initial canonical data、30秒以内の3画面往復、TTL／低速再検証中の期限、background→foreground、offline、logout、別owner、同frame A→B→A、Favorite/name更新、create/evaluate/deletion barrier、重複更新、取得errorとretry、rapid navigation／古いsuccess/error順序、最新82／best91、Recent／件数／Review戻り先。更新・削除・account切替の破壊的な実データ操作は行わず、決定的test／合成データUIで検証。

既知release guardは未commit sourceに由来する3件NOT PASS（dist/native sourceDirtyとstaging_source_tree_dirty）。guardを変更せず、一時commitなし。通常Staging buildの初回はpublic auth変数未指定でfingerprint guardが停止。既存署名済みStagingの公開設定を承認fingerprintと照合して再利用しPASS。秘密env／backupの読取・変更なし。

[source一致・検証再利用記録](../outputs/metadata-memory-20260922/closeout-source-reuse.json)／[実画面結果](../outputs/metadata-memory-20260922/browser-results.json)／[署名候補identity](../outputs/metadata-memory-20260922/native-artifact-proof.json)。

## Staging identityと実機測定

同じiPhone14 Plus／iOS26.2.1(23C71)／同じWi-Fi（Human確認）。bundle `com.nativeminutes.app.staging` 1.0(1)。18:09:32 JSTに最終候補を上書きinstall、データ消去なし。HEAD `a31fe4d`＋本差分＋既存WIPをsource manifest／web asset hashで照合（HEADだけをinstalled identityに代用しない）。最初の上書き後、同owner sessionの古い401対策を追加し再検証・最終候補へ更新した。

BFFは `dpl_5Pxfw3X3KDVJmMw6w4oo13Nvum5L` / READY / `iad1`。658 source hash・同alias一致。外部deploy／region／DB／provider／Production操作なし。

計測は下表・集計JSONに保存した前回baselineと同じHome→台本→Home→成長→Home→録音履歴→既存Review（保存Take再生→停止→同画面再再生）→Home。実button.click→実データDOM＋2 framesをusableとする。physical tap／厳密paint／Human可聴時刻は未測定。MutationObserverで全面loadingとaudio準備を計時。background refreshの通信完了を即時usableと混同しない。

有効5周。6周を試み、5周目は音声再生の18秒上限で未完遂、追加1周を採用。操作0件の開始条件未成立も別保存。デバッガsetup中の一時式エラー・停止時間は本計測外。計測中はforeground／低電力OFF／thermal0、idle timerだけ一時抑止。

| 指標 | before N5 | after 有効N5 |
|---|---:|---:|
| 一周blocking合計 median | 15.283秒 | **7.777秒** |
| 同range | 13.581–18.415秒 | 5.197–17.148秒 |
| blocking回数 median | 8回 | **3回**（各4/3/3/3/3回） |
| Progressを読む5遷移のblocking合計 median | 9.131秒 | **0秒**（range0–1.781秒） |
| 同blocking回数 median | 5回 | **0回**（各1/0/0/0/0回） |
| 画面7遷移usable合計 median | 12.409秒 | 3.783秒 |

Progress関連25遷移中24回で全面loadingを回避。初回Home復帰だけ1.781秒の待ち（起点cacheの残TTLは未計測）。すべてのroute再訪でserver再検証を開始または同generationの進行中GETへ接続し、取得不要にはしていない。背景GETが終わる前の表示をfresh完了と称していない。screen/sourceと直接testsで再検証を裏付ける。

有効45操作に対応する29 GETは全て200。台本5／Take2／Favorite1、Home Recent選択／録音順序／Progress台本件数／同じReview destinationの30比較は全て一致（未完遂周の5比較も一致）。終了時object URL0。

**音声失敗1件は未解決として保持。** HTTP200 headersは2.370秒で到達したが、音声body完了／media readinessなしで18秒のplaying計測上限に達した。音声経路のsource変更はなく因果は未確定。完遂した遅い音声10.616秒を含む周も除外せず採用した。画面再訪のblocking減少は確認できるが、全操作が一様に速い、音声が改善した、恒常的に49%改善とは主張しない。Human体感の受入は下記の実機結果に基づく。

[全after本試行](../outputs/metadata-memory-20260922/actual-after-main.json)／[追加1周](../outputs/metadata-memory-20260922/actual-after-supplement.json)／[失敗の追加証拠](../outputs/metadata-memory-20260922/actual-after-failure.json)／[採用・除外・before/after集計](../outputs/metadata-memory-20260922/summary.json)。

追加の実機確認もPASS: 選択台本のlatest/bestは取得したcanonical値と一致、選択route・Home復帰も一致。Homeで最後の成功から30秒後の失効→新GET200を観測。実際にSettingsへ移動してStagingをbackground化し、同PIDへforeground復帰した際も新GET200（1.599秒）、復帰後約2.058秒でHome再表示、台本5／Take2／Favorite1を保持した。background滞在時間をblocking性能値には合算しない。

[実機latest/best](../outputs/metadata-memory-20260922/actual-metadata-check.json)／[実機TTL・background/foreground](../outputs/metadata-memory-20260922/actual-lifecycle-check.json)。logout/account switch・Favorite/name・削除は合成UI／直接testsの結果であり、同datasetを変更する実機試験とは区別する。

診断終了: probeなし／Home前面／audio要素0、idle timer通常値へ復帰、端末の診断用4ファイル削除、LLDB detach。local診断server停止、probe・browser fixtureをworkspaceの最終差分から除外。source manifest・署名bundleに診断は含まれない。[cleanup](../outputs/metadata-memory-20260922/cleanup-final.json)。

## Human実機受入とcloseout

Human actual-device result（2026-09-22）:

- perceived performance = **clearly improved**。「画面移動はかなり速くなった」「それ以外の主要画面移動はかなり速い」。
- data correctness = **PASS**。「表示内容に問題なし」。
- remaining waits = **Scripts / Review / saved Take first playback**。Humanも残る待ちを確認。これらの改善は今回の採用範囲に含めない。

Humanが今回の30秒owner/session metadata memory reuseの採用と、この修正のみのcommit・normal pushを明示承認。追加の製品変更、性能修正、deploy、rebuild、実機再測定は行わない。

87件の最終build source hashと939件のtracked preflight記録を照合し、前回のtargeted 141 tests、Chromium/WebKit 20条件、lint、mobile/root typecheck、root/Staging/native build、署名を再利用。closeoutではworkspace guard、source/署名照合、instrumentation不在、staged diff check、Git ref照合を確認。tests/buildは再実行しない。

commit対象は製品8ファイル・直接tests3ファイル・本書・current-stateの今回entry・今回の静的検証証拠だけ。既存styles、他acceptanceのmapping/checklist、current-stateの他WIP履歴、その他untracked WIP、診断probe/fixture、build/deploy scriptをstageしない。current-stateは今回entryのみ部分stageする。

Gate5／Stage B／Dynamic Type／VoiceOver／Session Dの既存判定、VP-01間欠FAIL、R-INT-02文言findingを保持。今回の性能改善を原58全体の受入PASSに代用しない。

commitとnormal pushの結果はGit commitおよびlocal/upstream/remote ref照合で確定する。NEXT_ONE_ACTION = **次の作業指示を待つ。新しい性能修正は未着手。**
