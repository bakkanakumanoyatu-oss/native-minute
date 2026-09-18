# Global Dynamic Type focused fix

MODE: `QSS_DYNAMIC_TYPE_GLOBAL_SUPPORT_CLOSEOUT`

2026-09-18: **HUMAN ACTUAL-DEVICE PASS / CLOSED**。iPhone 14 Plus / iOS 26.2.1で「さらに大きな文字」変更後、Native Minute全体の文字が実際に拡大し、Humanが主要画面を確認してPASSと報告。原Dynamic Type 5件のPASS更新を明示承認。18:38 Staging 1.0(1)の実装・検証を再利用してcloseoutする。Stage B CLOSED / UI・UX Human PASS / Gate5・P1・P2・P3・Jは保持。VoiceOver / viewport正式受入 / Session Dは未着手。以下の初回FAIL・実装時guardは歴史証拠。

closeoutではworkspace・source manifest 68件・index範囲・集計を確認するだけで、lint/typecheck/build/install/full testは再実行しない。既存WIPを保持し、今回の製品6ファイル＋test1ファイル＋本書・受入4文書の対象部分のみcommit/pushする。

## Preflight / Human finding

- Developer root、`codex/g3-mobile-main-loop`、HEAD/upstream/remote=`9a3eb7dcf9801ecf191aaeba3d89b927e432f1a3`。workspace guard PASS。開始時tracked変更は既存受入4文書だけ、index空。unknown/unrelated WIP保持、reset/stash/deleteなし。
- Human: iPhone 14 Plus / iOS 26.2.1で「アクセシビリティ → 画面表示とテキストサイズ → さらに大きな文字」を有効化し十分拡大。同じ端末のWeb検索・他アプリでは拡大するが、Home/Scripts/Listen/Record/Review/Progress/My Takesすべて変化なし。
- 対象は前Session Cでsource/asset/receipt/inventory照合済みの17:49 Stage B受入済みStaging 1.0(1)。正確な設定category・Human実行時刻は未提供であり推定しない。

## Root cause / mechanism choice

`styles.css`のrootは通常のfont-family指定だけで、remの基準はWKWebViewの初期16px。`main.tsx`はthemeを追加してReactをmountするだけ。AppDelegate/標準CAPBridgeViewController/Capacitor config/既存pluginにcontent size category連携がない。`-webkit-text-size-adjust:none`等の抑止、`@font-face`/外部custom font loaderはない。既存familyはsystem fallback/Georgia等、Stage Bの色tokenは共通CSSにあり、文字の大半はrem、一部共通header/count等はpx固定だった。

Simulator iPhone 14 Plus / iOS 26.5のWKWebView probeで再現:

| OS category | generic 1rem | `-apple-system-body`（Georgia維持） | UIFontMetrics body・基準16 |
|---|---:|---:|---:|
| Large（通常基準） | 16 | 17 | 16 |
| XXXL | 16 | 23 | 21 |
| Accessibility XXXL | 16 | 53 | 45 |

**Bを採用:** `UIFontMetrics(forTextStyle: .body).scaledValue(for: 16, compatibleWith: category)` → Capacitor `DynamicType` → `--nm-root-font-size` →既存rem階層。Aも拡大に追従するがrootへ直接適用すると通常基準も17pxになる。Bは既存16px基準・family・weightを維持し、OSの実scaleを使える。独自倍率表・scale上限・system font一括置換・CSS zoom/transform・pinch zoomを使わない。

参照: [WebKitのremとOS文字サイズ](https://bugs.webkit.org/show_bug.cgi?id=260880)、[Apple UIFontMetrics](https://developer.apple.com/documentation/uikit/uifontmetrics/scaledvalue(for:compatiblewith:))。

Stage Bが原因でDynamic Typeを壊したとの証拠はなく、共通bootstrapの未接続が全画面に影響する欠落。Stage Bのtypographyにも作用するため現行7画面を確認するが、旧UIには戻さない。

## Changed product files / runtime

- `ios/App/MobileAuthSessionStore/ios/Sources/MobileAuthSessionStorePlugin/DynamicTypePlugin.swift`（新規独立plugin）: OSのcategoryを読み、変更通知とdidBecomeActiveで再取得。既存ローカルCapacitor packageの仕組みを使い、auth/session plugin自体は変更しない。
- `apps/mobile/src/lib/dynamic-type.ts`（新規）: listener登録後に初期値を取得。途中の変更eventを古い初期responseで上書きしない。React/StrictMode外で1回初期化し、dispose/HMR時に解除。iOS以外はbridgeを呼ばず既定表示。
- `apps/mobile/src/main.tsx`: bootstrapへの接続。
- `apps/mobile/src/styles.css`: root変数、共通header/count/My Takes等のpx文字を16px基準で等価remへ。
- `apps/mobile/src/app-theme.css`: 10px captionを等価remへ、必要な拡大時layout保護。
- `apps/mobile/src/screens/HomeScreen.css`: 28px countを等価remへ。
- `apps/mobile/src/lib/dynamic-type.test.ts`（新規）: normal/large/accessibility・runtime増減・初期response競合・dispose・invalid値・非iOSを確認。

native observerはload二重登録を防ぎdeinitで解除。OS設定変更通知、foreground復帰、cold launch/new documentで現在値を取得する。categoryを永続保存しない。bridge不在の旧binaryでは可読な16pxへfallbackするがDynamic Type PASSとはしない。AppDelegate/storyboard/native config policy、navigation、provider、API、保存/ownership/DB/schemaは変更なし。

## Minimal layout protection

補助browser検証で最大文字・320px幅のseek label overflow、Record preview dockによる本文領域消失を検出。**accessibility category時だけ**共通practice headerをwrap可能な2列＋step行へ、seek labelを折返し可能にし、dockを最大45dvhの独立scroll領域にする。dockは画面下部に残り、長いpreview/確認/評価/録り直し操作にも到達でき、本文側には読める高さを残す。通常categoryの配置、font family、cream/sand/ink/coral、階層・safe area・全文scrollを維持。

## Tests / native evidence

- root/mobile lint・typecheck、root build、Staging sync/build、署名付きnative build、Simulator build PASS。
- 関連9 files **197 tests**: 最初の並列実行は194 PASS・WebKit media3件が5秒timeout。該当Listen suiteだけ20秒timeoutで再実行し46/46 PASS（test source/期待値変更なし）。最終root連携＋Record suite36/36 PASS。
- browser補助: Chromium/WebKit、320/428px、16/21/32/45px、7画面＋Scripts form / Listen ready / Record before-recording-preview、合成長title/本文/助言。最終結果は[layout evidence](../../outputs/qss-dynamic-type-fix/layout-states.json)。CSS値注入はlayout補助でありDynamic Type実機証拠にしない。
- 実native bridge経由のSimulator（iOS 26.5、合成データだけの別bundle）: OS設定Large→XXXL→AX Medium→AX XXXL→Largeでroot **16→21→24.666666→45→16px**、family不変、再起動なし。foreground復帰、cold launch通常/最大もPASS。[runtime](../../outputs/qss-dynamic-type-fix/simulator-runtime.json) / [restore](../../outputs/qss-dynamic-type-fix/simulator-restore.json)。実iPhoneのiOS 26.2.1のHuman受入とは区別。
- 別Simulator fixtureは実機artifactへ含めない。署名、bundle ID、Staging BFF/public auth fingerprint、端末provisioning、dist→同期先→署名asset一致、DynamicTypePlugin登録と現CSS内包を確認。[artifact proof](../../outputs/qss-dynamic-type-fix/native-artifact-proof.json)。
- dirty-source release guardは既存と同じ3種NOT PASS（dist/native metadataとsource tree）。Human受入前の未commit差分を含むことを正直に保持し、guard/metadataの書換えや一時commitなし。
- focused self-reviewで責務/競合/cleanup/通常基準/最大文字を確認。env/schema/DB types/setup変更なし、migration/README更新不要。全E2E・provider・DB試験は今回実行しない。

### Native install

**18:38 JST、同じiPhone 14 PlusへStaging 1.0(1)を署名付き上書きinstall成功。** 新receiptのinstallation URLと直後の端末inventoryが一致、source manifest不変を再照合。data clear/uninstall/自動起動なし。metadataは`9a3eb7d + sourceDirty=true`のままで、今回commitのSHAを同梱したbinaryではない。その同じ実装をHumanが今回受入。[install proof（install時点の記録）](../../outputs/qss-dynamic-type-fix/install-status.json)。

最終browser補助は **176条件 / finding 0**。本文領域が1行分以上あり、dock末尾の有効buttonにもscrollして到達できることを追加確認。Simulator native bridge証拠に加え、今回のHuman actual-device PASSを受理した。

## Formal mapping

Human証拠`E-DYNAMIC-TYPE-HUMAN-PASS-20260918`を追加。原ID `DT-S-01 / DT-L-01 / DT-R-01 / DT-RV-01 / DT-P-01`を **PASS**へ更新。初回FAIL証拠は保持。実行時刻・正確なsize category値は申告されていないため補完しない。

最新作業台帳の原58: **PASS14 / FAIL3 / BLOCKED2 / NOT YET RUN39**。追加30: **19 / 0 / 3 / 8**。原Session C9: **5 / 0 / 0 / 4**。残る原FAIL3件はP-01〜03の既存Stage B visual解決済みformal複合行で、今回再判定しない。VoiceOver3件とVP-01は未実施。Session D・template等の保留も維持。

`PS-X-01`のexact intentは「Home/My Takesの名前/filter、Reviewの再生/共有が大きい文字でも読め、VoiceOverで識別・操作・復帰できる」。今回の全画面Dynamic Type PASSを部分証拠として記録し、不追従FAILを解決。全体statusは **NOT YET RUN**（partial evidenceあり）。VoiceOverの識別/操作/復帰、共有等の個別未確認条件までPASS/CLOSEDにしない。

### 選択stageと集計の境界

作業台帳には今回と無関係な未commit受入結果が既に混在する。それらのrow/証拠/文書差分はworking treeに保持し、stageしない。index上のmappingはHEADの他行を維持して今回5件とPS-X-01部分証拠だけを反映し、自身の行から集計する（原58 **11/0/2/45**、追加30 **18/0/3/9**）。これは別件WIPを除いた保存範囲で、最新作業台帳 **14/3/2/39**を取り消すものではない。今回のcloseout metadataと本書に両者の境界を記録する。Session Cの判定はどちらも5 PASS/4未実施で一致。

## Humanが受理したretest範囲（完了）

1. 同じStagingアプリで、通常文字サイズのHomeを見る。
2. iOS「設定 → アクセシビリティ → 画面表示とテキストサイズ → さらに大きな文字」を大きくする。
3. Native Minuteへ戻る（再起動不要で追従する想定）。
4. Home / Scripts / Listen / Record / 保存済みReview / Progress / My Takesをざっと見る。

**PASS:** 全画面で文字が実際に拡大する。主要操作が切れず/重ならず/横にはみ出さず押せる。Listen/Recordは本文末尾へ到達できdockと両立する。最大文字ではdock内もscrollできる。録音・評価の追加送信、VoiceOver、viewport正式受入、Session Dは不要。

上記に対するHumanの「Dynamic Type = PASS」と原5件の明示的closeout指示を受理。追加の実機操作は今回開始しない。

**NEXT_ONE_ACTION: Human VoiceOver actual-device acceptance.**
