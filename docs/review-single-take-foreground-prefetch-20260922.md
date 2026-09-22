# Review saved Take 1件のforeground audio prefetch

2026-09-22。MODE: `REVIEW_SINGLE_TAKE_FOREGROUND_AUDIO_PREFETCH`。**HUMAN ACTUAL-DEVICE PASS / CLOSED**。Natural Dwellの初回Play待ち短縮と正しい録音、2回目以降の短い待ちをHuman受入。今回の受入済み差分だけをcommit・normal pushでcloseout。

## 1. Preflight

Developer checkout、`codex/g3-mobile-main-loop`。HEAD/upstream/remoteは指定 `02658924e1a4c2b182dcc1d0aeb73509d522f883` に一致。workspace guard PASS。AGENTS/current-state/native-minute-mvp/ship-checkを適用。開始時2695ファイルのhash、Git status、空のindexを記録。reset/stash/delete/unrelated stageなし。既存styles/acceptance mapping/checklist/current-state履歴/untracked WIPと既知FAILを保持。

## 2–3. Implementation / files

製品4ファイル:

- `apps/mobile/src/screens/SavedTakeAudio.tsx`: validated Reviewにmountした後、2回のanimation frameを経てそのvisitの1件だけ先行取得。UIはidleのまま操作可能。visitごと1回で自動retryなし。
- `apps/mobile/src/practice/api.ts`: prefetchは現在のforeground/owner/session/visitとfresh Review proofだけを利用。追加のReview取得や明示auth refresh/retryはせず、通常Playと同じloaderへ接続。
- `apps/mobile/src/audio/saved-take-memory.ts`: 既存1件memoryにpending promise/AbortControllerを追加。完了したBlobは既存30秒entryに格納。別cacheなし。
- `apps/mobile/src/lib/api.ts`: 既存bounded fetchへ呼出側のabortを接続。既存timeout、no-store、ownership、binary response contractを維持。

直接testsは既存memory/API tests2ファイルと新規`src/lib/take-audio-abort.test.ts`。説明は本書/current-state/AGENTS。診断スクリプトとbrowser fixtureは`/tmp`に置き、製品source/bundleへ追加しない。

## 4–5. Lifecycle / duplicate behavior

fresh server Review ownership＋Storage version検証 → Review usable/render → foreground prefetch。prefetchのfetch完了をReview stateがawaitすることはない。audio identityは既存SHA-256のcanonical server identity、session fingerprintも既存のもの。

Playが取得中なら同じpending promiseをawaitする。prefetch完了後なら既存entryへhitし、object URLはPlay時に画面内で作成する。prefetchだけではdecode/play/object URLを開始しない。再生/decode failureは既存playerがentryとURLを破棄する。

Review exit/route changeはpending requestをabortしvisit/proofを破棄する。**既に完了した1件は既存の30秒再入場契約どおり保持**し、再入場時のfresh validation後だけ使う。これは再入場reuse維持と両立させるための既存契約であり、退出で保持寿命を延長しない。background/inactive、offline、logout/account/session変更、mutation/delete、validation/auth/ownership/fetch/decode error、identity変更では既存の全失効処理から通信もabortする。古い応答はsignal/epoch/visit検証で捨て、新しいentryへ干渉させない。

TTLはdownload完了から30秒固定、hitで延長しない。期限到達でBlob参照/timerを解放し、自動取得し直さない。取得中は既存audio requestの30秒timeoutが上限。従来の同画面playerのobject URLはTTLだけで停止せず、unmount・lifecycle/errorではrevokeする。

prefetch失敗でReview全体をerrorにしない。後のPlayで通常のfresh Review再検証・取得/recoveryを行う。Shareは毎回fresh取得、reference/Home/My Takesからのpreloadなし。新しいpersistent storage/cache、signed URL、Range/streaming、codec、DB migration、provider/storage config、native plugin変更なし。

## 6. Tests / validation

対象・影響231 tests / 11 files PASS。ChromiumとWebKit各15、計30条件PASS。Review前GETなし/表示後開始、in-flight Play共有、完了prefetch hit、30秒再入場、同画面replay、背景abort/自動再開なし、logout/session、version、delete/not-found、fetch/decode recovery、rapid route stale response、max one entry、TTL、全URL cleanupを確認。既存auth/account隔離、Share fresh取得/cleanup、route/server ownership testsも実施。

root/mobile lint、mobile source/tests typecheck、root build＋その後typecheck、Staging Web build/sync、native build、strict署名/資産/source/profile/auth fingerprint照合、diff check PASS。既知release guardのdirty source関連3件NOT PASSは保持し、bypassなし。server製品変更なしのためBFF再build/deployなし。新env/schema/setup変更なし、README変更不要。

full test suite/expanded E2E/new recording/evaluate/voice generation/実外部Share exportは未実施。browser計測fixtureのselector/clock修正、およびViteの最初の依存再最適化に伴うfixture reloadの再実行を行った。最終sourceで30条件が完走し、製品の失敗としては集計していない。

## 7. Staging identity

既存専用BFF `dpl_Evxze3rYhAL4AwgT8i7rsoJYqEbB` / `native-minute-staging.vercel.app` を維持。Production操作なし。端末は同じiPhone14 Plus、bundle `com.nativeminutes.app.staging`。最終bundle/source/署名は[artifact proof](../outputs/review-audio-prefetch-20260922/native-artifact-proof.json)。20:56 JST 同じ端末へ上書きinstall成功、data clearなし。[install receipt](../outputs/review-audio-prefetch-20260922/install-receipt.json)・inventoryと照合。BFF alias/READY/659 source filesはread-onlyで再確認し一致。

## 8–13. Measurement / outcome

同じiPhone14 Plus・Staging・My Takes先頭の同じ保存Take、read-only操作でbefore/after各15試行（A/B/C各N5）。前後ともNWPathMonitorでWi-Fi=true/cellular=false、ネットワーク設定変更なし。各条件前に最後の全量受信から31秒以上待ち、既存30秒reuseをTRUE first-fetchと混ぜない。baseline probeはHome更新途中のbutton消失で2回停止したため、完了済み7＋3試行を保持し、不足5試行を追加した。afterは15試行連続完走。probe内のbutton lookup/clickだけを原子的に修正し、製品変更には含めていない。

| 指標（中央値） | before | after |
|---|---:|---:|
| Review usable 全15回 | 2.252s | **2.252s** |
| Review usable A / Immediate（N5） | 1.535s | 1.902s |
| Review usable B / Natural Dwell（N5） | 2.369s | 2.668s |
| Review usable C / No Play（N5） | 2.152s | 2.085s |
| A: Play tap→playing（N5） | 3.931s | **4.485s** |
| A: TRUE audio GET→全body受信 | 3.815s | 4.293s |
| B: 2秒閲覧後Play tap→playing（N5） | 4.310s | **2.365s** |
| B: TRUE audio GET→全body受信 | 4.191s | 4.250s |

**Natural Dwellのtap後待ちが中央値1.945秒（45.1%）減少**。Bの全量取得中央値は約4.2秒のままで、改善は約2秒のReview閲覧とのoverlapによるもの。今回network speedupは主張しない。

Immediateのafter範囲は3.973–10.538秒（before 3.484–4.492秒）。10.538秒の試行はaudio headers到着まで8.629秒、全量受信10.422秒で、そのまま集計に含める。Aは全5回でtapがnetwork GET開始より先に来た（同frame付近の起動競合）。したがってAを「すでに飛んでいるprefetchを実機で共有した証拠」とはしない。1 GETへの統合は実測し、意図的にprefetchを保持してから即Playする共有条件はunit/実画面testで検証。**Bは全5回で既にin-flightの1 GETをPlayが待った**。既に完了したprefetchからの再生も実画面testで確認。

Review全体中央値は変わらず、音声GETはusable観測後に開始。A/B単独のReview中央値はそれぞれ+367ms/+299msなので隠さない。server Review/title経路は未変更で、audio取得をrender完了まで開始せずawaitもしない。少数の非交互sampleでネットワーク変動と因果関係を分離した統計的非劣化保証は主張しない。

各sampleのReview入場、usable、GET開始、body完了、Play tap、playing、GET数、bytes、identity判定は[before](../outputs/review-audio-prefetch-20260922/before.json)／[after](../outputs/review-audio-prefetch-20260922/after.json)。[集計](../outputs/review-audio-prefetch-20260922/summary.json)／[測定定義](../outputs/review-audio-prefetch-20260922/measurement-method.json)。usableはcontrols表示を2 animation frames後に観測した時点、playingは可聴開始の代理でcurrentTimeも1秒後に確認。Human体感は別判定。

### GET / bytes / No Play exit

A/Bとも前後全試行で**audio GET 1回、body 1,285,164 bytes、duplicate GET 0**。TRUE first-fetch分離のため初回cache hitは0。after B全5回はin-flight共有。全15回の表示/GET対象は正しいTake、完了10 bodyは各responseのserver identity一致と端末memory内のaudio SHA-256一致を確認した。raw audio/token/path/Take IDを証拠へexportしていない。

CはReview usableから約150msで退出。beforeはGET0。afterは全5回で**GET1→abort、受信body 0 bytes、退出後object URL 0・audio element 0**。全件headers到着前に停止し、自動retryなし。0 bytesはアプリが受信したbodyであり、wire bytesやBFF→Storageの仕事がゼロになったことを意味しない。別途body受信中のabortをunit testで確認。

追加の最終実機回帰では、同画面replay **95ms / GET0**、Home→同じReview再入場はfresh Review GET1の後 **88ms / audio GET0**、ともにcurrentTime進行を確認。退出後object URL/audio elementは0。[再入場回帰](../outputs/review-audio-prefetch-20260922/reentry-regression.json)。補助試行の最初のPlayはprefetch開始後のため、`audioGets:0`はtap以降の追加GET数であって最初のdownload全体が0という意味ではない。

### Remaining latency

全量取得gate、auth/ownership/version read、BFF/Storage/networkの待ちは残る。2秒の閲覧より取得が長ければPlay後にも待つ。Immediateが速くならないことを今回のoverlap失敗と同一視せず、Bの改善と分ける。Human acceptanceは今回のprefetch範囲でPASS。既存VP-01間欠FAIL、R-INT-02文言finding、release guard3件NOT PASS、他WIPは保持。

診断probe/計測用globalを除去、Home前面・audio element/object URL 0・最終asset一致を確認。端末上の計測JSON4件を除去、LLDB detach、local fixture server停止済み。製品に診断instrumentationなし。[cleanup](../outputs/review-audio-prefetch-20260922/cleanup.json)。開始時2695ファイルのうち無関係な既存内容とcurrent-stateの全履歴はhashで保全確認、indexは空・HEAD不変。[保全証拠](../outputs/review-audio-prefetch-20260922/preservation-proof.json)。

## 14. Human actual-device acceptance — PASS

Humanの報告:

> ２回目以降の再生はすぐにできた

続いて、Reviewを1〜2秒見た後の最初のPlayについて「待ち時間が短くなった体感があり、正しい録音が聞こえたか」を確認し、Humanが次を選択:

> 待ちは短く感じられ、正しい録音だった

初回の体感改善・correct audioと反復再生を確認し、今回のforeground prefetchを採用してCLOSEDとする。追加Human操作なし。TRUE network first-fetch高速化、原58全件、他acceptanceや既知release guardの一括PASSは意味しない。

## 15. Closeout / commit / push

実装完了時はHuman checkpointに従いcommit/push = NOT DONE。本Human PASSでcheckpointを満たしたため、今回の製品4ファイル・直接tests3ファイル・AGENTS・本書・current-stateの今回entry・静的検証証拠だけをcommit／normal push対象にする。既存styles、acceptance mapping/checklist、current-stateの他履歴、他untracked WIPを含めない。force pushなし。

署名済みStaging資産・89 native source hashの一致とWIP保全を再確認し、既存231 tests、browser30条件、lint、mobile/root typecheck、root/Staging/native buildを再利用。今回のcloseoutではtests/build再実行・install・deploy・実機再測定なし。workspace guard、署名/source照合、diff check、Git ref照合を実施。[source一致・受入記録](../outputs/review-audio-prefetch-20260922/closeout-source-reuse.json)。

TRUE first-fetch全量取得、Review fresh loading、既知release guard3件NOT PASS、VP-01間欠FAIL、R-INT-02文言finding、他WIPを保持。追加性能修正には進まない。

## 16. NEXT_ONE_ACTION

今回のforeground prefetchはCLOSED。追加Human操作は不要。残るTRUE first-fetch／Review待ち等の優先順位は別タスクで選ぶ。
