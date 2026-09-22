# 保存済みTakeの30秒・1件ephemeral audio reuse

2026-09-22。**HUMAN ACTUAL-DEVICE PASS / CLOSED**。同一実機で正しい録音の短い待ちでの再生をHuman受入。今回の音声reuse差分だけをcommit・normal pushでcloseout。

## 1. MODE / preflight

`SAVED_TAKE_EPHEMERAL_AUDIO_REUSE_30S_ONE_ITEM`。Developer checkout、branch `codex/g3-mobile-main-loop`、local/upstream/remoteは指定の `78ebcb5240cbce3b7ad97d88ea6bfb69f8ae6f56` と一致。workspace guard PASS。AGENTS、current-state、native-minute-mvp、ship-checkを適用。既存metadata memory reuseの保持ロジック／TTL／再検証は変更なし。既存styles、acceptance記録、untracked WIPを保全。

## 2. exact audio identity

所有者付きcanonical reviewed Takeの `audio_path` からprivate `recordings` keyを取り出し、owner/scriptとの完全一致を検証。そのユーザーのRLS-bound Storage clientで `.info(key)` を呼ぶ。`SHA-256(JSON.stringify(["saved-take-audio-v1", owner, scriptId, key, object.id, object.version, object.etag ?? null, object.size ?? null]))` をReview JSONとaudio response headerへ返す。raw path・owner・versionを新しい公開DTOへ出さない。id/version不在は503でfail closedし、弱いkeyへのfallbackなし。

既存writerはUUID由来key＋`upsert:false`、既存migrationでclient update/deleteを撤去済み。locatorの不変性だけに依存せず、Storage objectの現行id/versionも照合する。read-onlyのlive集計でreviewed Take6件すべてにmatching object/version/ETagがあることを確認（対象実機のdatasetは従来の5 scripts／2 Takes／1 Favorite）。Storage設定・migration・provider変更なし。

binary取得ではStorage download前後のidentityが一致したときだけ返す。取得中の差し替え・削除もfail closed。既存Take/script ownership、status、MIME/container、最大15MiBの検証は維持。

## 3. reuse contract

ownerごとのPracticeApi instance内にmemory-onlyのBlobを最大1件保持。取得成功から30秒、hitでは期限を延長しない。プロセス再起動を跨がず、Filesystem／IndexedDB／localStorage／Service Worker／複数Take LRUは使わない。reference audio・Shareへのreuseなし。Shareは従来どおり毎回fresh binary取得。

各Review visitにobject-referenceの一意ticketを発行し、毎回fresh Review server requestが成功した場合だけ認可。Take/script/audio identity・現在のsession fingerprint・owner・foreground・online・TTLの一致を条件とする。session fingerprintは現行access tokenのSHA-256で、raw tokenをcache keyやlogに保持しない。refreshも保守的に失効させる。

TTLは追加の画面横断Blob参照に適用。従来の同画面再生を維持するため、すでに再生中の画面内object URLをTTLだけで途中停止しない。URLは従来どおりunmountで必ずrevokeし、画面横断で保持しない。background/logout/error等では現在のplayerも停止しURLをrevokeする。

## 4. changed files

製品: `services/takes/take-audio-identity.ts`、`take-audio.service.ts`、`lib/mobile/review-route.ts`、`take-audio-route.ts`、`apps/mobile/src/audio/saved-take-memory.ts`、`saved-take-memory-lifecycle.ts`、`src/lib/api.ts`、`src/practice/api.ts`、`src/screens/ReviewScreen.tsx`、`SavedTakeAudio.tsx`、`src/App.tsx`。

直接tests: 新規memory／lifecycle／API tests3件、既存`take-audio.test.ts`／`main-loop-routes.test.ts`更新。AGENTSの保持契約、本書、current-state先頭、sanitized証拠を追加。診断・browser fixture・build/deploy scriptは`/tmp`に置き製品差分へ含めない。

## 5. invalidation / authorization

TTL、logout開始、account切替、同ownerを含むauth/session変更、native inactive/background、visibility hidden、offline、relevant mutationの開始/終了、Review/音声取得/再生/decode error、明示cleanupで保持を解放。remote Take削除・音声削除・version変更は再訪のfresh ReviewとStorage metadataで検出する（未観測のremote mutationをpush通知なしで即検知する仕組みではない）。Review失敗時は古い音声を再生しない。Storageだけ削除された場合もidentity=nullで以前のbinaryを破棄する。

## 6. tests / validation

対象・直接影響167 tests PASS。Chromium／WebKit各13条件、計26 PASS。first GET／same-screen replay／再訪Review requestありaudio GETなし／TTL／inactive／logout／account/session切替／404/auth error／audio version／decode/play rejection／rapid A-B-A／one entry／URL cleanupを決定的に確認。Share共通codeへの影響があるためfresh export／一時file cleanup／inactive後のbusy解除も確認。

root/mobile lint、mobile source/tests typecheck、root build後typecheck、exact Staging BFF candidate build、Staging web build/sync、native build、署名/資産/source/provisioning/auth fingerprint、diff checkを確認。既知release guard3件（dist/native build metadataのdirty sourceとsource tree dirty）はNOT PASSのまま。guardの変更・一時commitによる回避なし。新env/migrationなし、READMEのsetup変更不要。full test suite／expanded E2E／実外部Share exportは未実施。

## 7. Staging identity

BFF `dpl_Evxze3rYhAL4AwgT8i7rsoJYqEbB`、専用project `prj_RSxUzxugEIlH28tiQOyndjP365hw`、alias `native-minute-staging.vercel.app`。旧base `dpl_5Pxfw3X3KDVJmMw6w4oo13Nvum5L` の658 filesから変更3＋新規1、659 source hash一致。API target名はproductionだが既存の専用Staging projectであり製品Production projectではない。

同じiPhone14 Plusの`com.nativeminutes.app.staging`へ上書きinstall（data clearなし）。中間install後、Share inactive時のbusy解除と取得失敗時のretry表示を最終候補へ反映。測定対象は最終sourceに対応する署名bundle。詳細はnative-artifact-proof／install receiptを参照。

## 8–10. before / after measurements

同じiPhone／Staging／既存5 scripts・2 Takes・1 Favorite、同じ一覧先頭Take。ネットワーク設定変更なし、従来の同じWi-Fi前提を継続。新規録音・evaluate・voice generation・DB mutationなし。今回のbeforeは旧配備5訪問（初回1＋再入場4）、afterは最終候補6訪問（初回1＋再入場5）。既に承認済みの診断baseline（初回mount4.941s N5／Review1.852s N5）は変更・再解釈せず、今回sampleと混ぜない。

| 指標 | 今回before | 最終after |
|---|---:|---:|
| 初回play tap→playing | 4.169s（N1） | 5.058s（N1） |
| 再入場後play tap→playing | 中央値3.912s（N4、3.360–4.767） | **中央値0.074s（N5、0.072–0.079）** |
| 再入場Review usable | 中央値1.919s（N4） | 中央値2.369s（N5） |
| 全訪問Review usable | 中央値1.952s（N5） | 中央値2.735s（N6） |
| 毎回のReview server GET | 各1（別途Script title GET1） | **各1（別途Script title GET1）** |
| 再入場playのbinary GET | 各1 | **全5回0** |
| 再入場playのaudio payload | 各1,285,164 bytes | **全5回0 bytes** |
| 初回binary GET／payload | 1／1,285,164 bytes | 1／1,285,164 bytes |

初回は改善していない。今回N1では0.889s遅く、Reviewにも現行Storage metadata確認の追加readがある。ネットワークの変動を含む少数sampleなので、その差全てを追加readの因果効果とは断定しない。再入場時のReview待ちを隠したり、音声初回が速くなったと解釈しない。

after全6訪問でcorrect Take、全6 object URLで最初のdownloaded BlobとのSHA-256一致を端末memory内で確認（hashそのもの／raw audio／Take IDはexportしない）。再入場5回の保持年齢は2.724／6.061／10.265／13.435／17.707秒で全てTTL内。GET0のためこの再利用に伴うbinary転送は0。beforeのbytesは受信Blob.sizeで、wire圧縮後bytesは未計測。

再生開始は`playing` eventの代理値。初回と再入場全6回でcurrentTime進行も確認し、Humanの可聴開始は未計測。短期再入場を測るため各再生開始後300msでpauseしており、約40.16秒の音声を最後まで聴いた後のhitではない。**TTLはdownload完了から30秒で、最後まで聴いた時点では期限を超える**。同画面の既存playerはTTLで止めない。300ms観測の同画面replayは一部currentTime=0のため、`playing`のみの値を全再生進行PASSに使わず、別の1.6秒観測で同画面108ms・currentTime 2.470sへの進行を確認した。

[before](../outputs/saved-take-reuse-20260922/baseline.json)／[最終after](../outputs/saved-take-reuse-20260922/after.json)／[集計](../outputs/saved-take-reuse-20260922/summary.json)。中間候補のN5 hit・TTL成功は`intermediate-*`に別保管し、最終版のsampleへ混ぜない。中間候補の測定終了後、debugger snapshot式が一度EXC_BAD_ACCESSを返したが、測定済みsnapshotは回収できた。processを復帰し新しいWebView参照でcleanup、その後の最終候補には発生していない。

最終候補のTTL失効後もReview GET1＋Script title GET1、binary GET1／1,285,164 bytesへ復帰。play開始6.023s、currentTime 1.265s、続く同画面replayはGET0・108ms・currentTime 2.470s。[TTL実測](../outputs/saved-take-reuse-20260922/ttl.json)。背景失効はdeterministic lifecycle／実UI fixtureで確認し、今回の最終実機C条件にはTTLを使用。

## 11. cleanup / race

visit identity＋epochで古いReview/audio completionを拒否。別Takeを選ぶと前の保持Blob参照とtimerを解放。error／session／lifecycleは取得中の結果も無効化し、復帰時の新しいReview validationなしで再利用しない。URLは画面で作りunmount/invalidation/errorでrevoke、listenerはunmountで解除。native listenerの登録完了前にcleanupされた場合も完了後にremoveする。Share処理中のinactiveから復帰したときもplayback busyが残らないことを追加確認。

実機probeを除去し、Home前面・audio要素0・最終asset一致を確認。端末上の診断JSONを削除、LLDB detach、local browser fixture server停止。製品source/bundleに診断を残さない。[cleanup](../outputs/saved-take-reuse-20260922/cleanup.json)。

## 12. remaining first-play bottleneck

初回・TTL切れ・background後・別Takeは従来同様に認証付きfull binary GET→全Blob受信→object URL→playを通る。追加version確認readのコストもある。streaming/range、codec、region、BFFの設計変更は行っていない。Scripts/Reviewのfresh loading、既存VP-01間欠FAIL／R-INT-02文言finding／他acceptance WIPも未解決として保持。

## 13. Human actual-device acceptance — PASS

Humanの報告:

> 保存Takeを再生し、音が出たらすぐHome→同じReview→再生。正しい録音が短い待ちで聞こえました

指定した最小1往復で、正しい保存済み録音と短い待ちをHumanが確認。今回の30秒・1件audio reuseを採用しCLOSEDとする。追加Human操作なし。この受入は初回音声高速化、原58全件、他acceptance、release guardの一括PASSを意味しない。

## 14. closeout / commit / push

実装時点ではHuman checkpointに従いcommit/pushはNOT DONE。今回のHuman PASSでcheckpointを満たし、音声reuseの製品11ファイル・直接tests5ファイル・AGENTSの保持契約・本書・current-stateの今回entry・静的な検証証拠だけをcommit／normal push対象にする。既存styles、acceptance mapping/checklist、他current-state履歴、他untracked WIPを含めない。force pushなし。

89 native source hash、BFF変更4 source hash、署名済みasset hash、strict code signatureの一致を確認し、前回の167 tests、実画面26条件、lint、mobile/root typecheck、root/exact BFF/Staging/native buildを再利用。closeoutでworkspace guard、source/署名照合、diff check、Git ref照合を実施。**新しい製品変更・tests/build再実行・install・deploy・実機再測定は行っていない。** [source一致・受入記録](../outputs/saved-take-reuse-20260922/closeout-source-reuse.json)。

初回全量取得、Reviewのfresh loadingとversion readコスト、既知release guard3件NOT PASS、VP-01間欠FAIL、R-INT-02文言finding、他acceptance WIPを維持。追加の性能修正には進まない。

## 15. NEXT_ONE_ACTION

今回のaudio reuseはCLOSED。次回は残る初回音声／Review待ち等の優先順位を別タスクとして選ぶ。追加のHuman確認は不要。
