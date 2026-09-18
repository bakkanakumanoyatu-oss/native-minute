# App-wide UI/UX rebaseline — Stage B CLOSED

MODE: `QSS_APP_WIDE_VISUAL_AND_PRACTICE_UX_REBASELINE_STAGE_B_CLOSEOUT`

2026-09-18 Human actual-device acceptance: **「すごく良くなっています」**。その後のProgress最終確認も **A（same Script Listenへ練習開始）PASS / B（指定注意文削除）PASS**。今回のapp-wide visual/UX改修を **HUMAN PASS / CLOSED** とする。

## 確定scope

- cream / sand / ink / coralの共通visual language、Homeの練習優先階層・Recent本文preview・Favoriteと録音履歴の分離。
- Scriptsの選択/作成配置と現行上限5表示。上限の変更なし。
- Listenの5戻る / 3戻る / play-pause / 3進む / 5進む。既存速度・位置保持・復帰時no autoplayを維持。
- Record / Review / My Takes / Settings / consent / deletion / Loginのvisual consistency。
- Progressの全体summary→選択台本→助言→最新/ベスト→履歴。練習CTAはsame Script Listen。「回数は上達度を表しません。」だけ削除。
- 既存navigation/return-origin、Home終了を保持。return-origin修正は既に `f39977c` / `fd5dbd4` にcommit済み。今回それを再実装しない。

Gate5/P1/P2/P3/J CLOSED、ownership/auth/security、audio-first評価とatomic保存、Saved Take再生/Share/Favorite、未保存退出保護、全文scroll/bottom dockを保持。visual変更によるprovider再生成なし。

## 正確なstage範囲

製品・関連testは次の20ファイル。Home/Progressの開始前WIPも最終Stage B受入scopeに含まれることを確認した。

| 区分 | ファイル（repository相対） |
|---|---|
| 共通 | `apps/mobile/src/main.tsx`, `app-theme.css`, `styles.css`（後二者も同src配下） |
| Home | `apps/mobile/src/screens/HomeScreen.tsx`, `HomeScreen.css`, `HomeScreen.test.tsx` |
| 主画面 | `apps/mobile/src/screens/ScriptsScreen.tsx`, `ListenScreen.tsx`, `ProgressScreen.tsx`, `ProgressScreen.test.tsx` |
| 補助画面 | `apps/mobile/src/screens/SettingsScreen.tsx`, `VoiceSetupScreen.tsx`, `AccountDeletionScreen.tsx`, `VoiceDeletionScreen.tsx`（class/危険操作styleのみ） |
| 対象test | `apps/mobile/src/screens/screens.test.tsx`, `record-state.test.ts`, `apps/mobile/tests/listen-playback-controls.test.ts`, `listen-playback-harness.tsx` |
| 上限共有 | `lib/practice-limits.ts`, `services/scripts/scripts.service.ts`（値5の定数共有、server制約変更なし） |

文書は本書＋`docs/current-state.md`・受入`human-checklist.md`・`mapping.md`・`mapping.json`の今回closeout追記だけ。既存文書に混在した評価障害調査・server照合・過去の独立受入記録は、working treeに保持してstage対象外とする。indexはHEAD文書＋今回追記として作成し、working treeの既存内容を上書きしない。

### prototype / productの区別

- Stage A専用: `apps/mobile/visual-candidates/` と `outputs/qss-app-wide-rebaseline/`。製品entryからimportされず、stage対象外。Aの画像・電子音・架空fixtureを製品へ持ち込まない。
- 製品統合: 上記20ファイル。Stage B・最終fixのsource manifestと一致するものをstage。
- ローカルworkpaper: `docs/qss-app-wide-rebaseline-stage-a.md`、`...stage-b.md`、Progress fix記録、`outputs/qss-app-wide-rebaseline-b/`、`outputs/qss-progress-entry-copy-fix/`等はローカルに保持。本書に必要な受入・検証要約を収録し、大量の生成物・beforeコピーをcommitしない。
- `.env.local.save`、`supabase/.temp`、その他unknown WIPは未読・未hash・未変更・未stage。

## 再利用したvalidation / build identity

- Stage B: 関連10ファイル232 tests PASS。Chromium/WebKit 320/428px・16/32px文字、主要144＋他画面68条件とsupport状態PASS。root/mobile lint/typecheck、root/Staging/native build、focused review PASS。
- Progress最終fix: 88 tests / 24 browser journeys PASS。same-script Listen、Record往復、同じProgress/選択台本へのBack、Home終了、指定copy削除を確認。lint/typecheck/build/diff review PASS。
- 最終実機: 2026-09-18 **17:49 JST**、同じiPhone14 PlusへStaging上書きinstall。`com.nativeminutes.app.staging` 1.0(1)。data clear/uninstall/自動起動なし。
- `outputs/qss-progress-entry-copy-fix/` の `build-source-hashes.json` / `native-artifact-proof.json` / `install-status.json` にsource→署名artifact→exact receipt→端末inventoryの照合証拠。今回source hash再照合で製品変更なしを確認。Stage B後の差分はHumanが受け入れたProgress2行だけ。
- build metadataは親HEAD `fd5dbd4ff5f16a19c2666337992763663f08ea91`＋`sourceDirty=true`のまま。今回commit SHA入りの新binaryを作ったとは主張しない。既存dirty-source release guard 3件は当時NOT PASSのまま、closeoutで改変しない。
- closeoutではworkspace/index差分/manifest整合性のみ確認。無関係なfull test/build/install、外部配備、provider、DB/Storage、Production操作は再実行していない。

## 正式受入との境界

[acceptance mapping](qss-iphone14plus-acceptance-resume/mapping.json) の `appWideRebaselineAcceptance` と [受入案内](qss-iphone14plus-acceptance-resume/human-checklist.md) にHuman authorityを追記。

今回のUI受入と原58の詳細assertionは区別する。P-01〜03に記録されたvisual findingは解決したが、旧status/集計を今回一括PASSに書き換えない。同一Take注記、履歴の特定行・identity、長文条件等の個別証拠は正式再開時に既存Human証拠と照合し、未確認部分だけを残す。旧P-05のRecord直行は履歴。現在のCTA遷移先はListenであり、Human Aがそのauthorityとなる。

原58全件PASS、Dynamic Type/VoiceOver PASS、正式template移植、max5→10決定、performance Gate8完了ではない。過去の個別実機証拠と未確認分岐を保持。未commitの独立文書記録も失わず、当closeoutのために勝手な集計統合を行わない。

**NEXT_ONE_ACTION:** 原58＋承認済み追加条件の正式実機受入へ戻り、未確認項目だけを続行する。今回その操作は開始しない。
