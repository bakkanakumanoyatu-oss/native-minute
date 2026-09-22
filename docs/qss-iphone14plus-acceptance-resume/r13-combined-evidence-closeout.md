# R-13 combined evidence Human Decision closeout

MODE: `QSS_R13_COMBINED_EVIDENCE_HUMAN_DECISION_CLOSEOUT`

2026-09-22 **Human Decision反映済み。R-13 PASS by COMBINED DETERMINISTIC + HUMAN_DEVICE evidence。Session D 7/7 PASS / CLOSED。**

## Formal decision / evidence classification

HumanがR-13に限り、完成した決定的PCM分類・実product UI gateへの接続tests・upload/evaluate非呼出と、同じiPhoneの補助観察を合わせた証拠を正式受入として明示採用した。これを原本110行の分類未観測条項に対するR-13限定の証拠条件更新として記録する。原本自体は改変せず、過去のBLOCKED判断も履歴として保持する。

- `status`: PASS
- `acceptance_label`: **PASS by COMBINED DETERMINISTIC + HUMAN_DEVICE evidence**
- `evidence_class`: **deterministic test + actual-device supplemental evidence**
- `direct_device_low_signal_observed`: false
- `direct_device_digital_silence_observed`: false
- authority: current task Human Decision, MODE shown above。追加の実機分類再現は不要。

合成PCMのUI検証は実App/RecordScreenをheadless Chromium内で実行したもの。物理iPhone上のLOW_SIGNAL/DIGITAL_SILENCE観測とは記載しない。新規4ケースのmock upload/evaluate呼出が0、外部provider呼出も0。実機通信件数の計測値とはしない。

## Direct evidence covering original intent

| intent | 直接証拠 |
| --- | --- |
| LOW_SIGNAL classification | ±0.002 PCMを実分類関数に入力してLOW_SIGNAL |
| LOW_SIGNAL warning | 上記PCMをcapture完了から実App→RecordScreenへ通し「音声が小さめです。」を確認 |
| manual confirmation / confirmation後のみ評価可能 | preview実再生だけではcheckbox未選択・評価disabled。手動ONでenabled、OFFでdisabled |
| DIGITAL_SILENCE classification | all-zeroとnear-zero（1/32768）のPCMでDIGITAL_SILENCE |
| silent warning | 両fixtureで「音声信号を検出できませんでした。マイクを確認して、もう一度録音してください。」 |
| preview / confirmation / evaluate操作除去 | 直前の確認済み通常Takeからsilentで録り直し、全3要素が存在せず再録音可能 |
| provider callなし | 新規4ケースは評価をclickせず、停止/preview/checkbox後もmock upload/evaluate配列が空。fake auth/fetch＋CSP connect-src none＋外部origin abortで外部呼出遮断 |
| actual-device supplemental | 5〜10秒でshort warning、約30秒小声でLOW_SIGNAL warningなし、約30秒自然音でDIGITAL_SILENCE warningなしというHuman観察 |

小声/環境音について、主観的な静かさだけで低信号/デジタル無音警告を出さなかった補助証拠として採用。実PCM振幅の計測・分類文字列の報告・全環境でのfalse positive率評価は未取得であり、今回の判断から過大推論しない。short gateはsignal gateと別。

[exact source contract](r13-signal-gate.md)、[既存証拠と不足4ケースの照合](r13-evidence-reconciliation.md)、[test source](../../apps/mobile/src/screens/record-state.test.ts)。

## Session D final status

| Original ID | Final status | Evidence class |
| --- | --- | --- |
| L-08 | PASS | Human actual-device |
| L-09 | PASS | Human actual-device（既存部分証拠併用） |
| L-10 | PASS | Human actual-device（既存部分証拠併用） |
| R-INT-01 | PASS | Human actual-device |
| R-INT-02 | PASS（non-blocking copy finding保持） | Human actual-device |
| R-OFFLINE-01 | PASS | Human actual-device、foreground維持のnetwork loss |
| R-13 | PASS by combined evidence | deterministic test + actual-device supplemental evidence |

## Files / validation / Git scope

Developer checkout、branch `codex/g3-mobile-main-loop`、HEAD `80d0ef4a2ca8554d5e8a3721b94318c347043f15`。

R-13限定closeoutのstage対象:

1. `apps/mobile/src/screens/record-state.test.ts` — synthetic capture fixture選択＋4ケース。既存通常fixtureを維持し、product behavior/sourceは変更しない。
2. `docs/qss-iphone14plus-acceptance-resume/r13-signal-gate.md` — source契約と初期Human手順の履歴、最終決定への参照。
3. `docs/qss-iphone14plus-acceptance-resume/r13-evidence-reconciliation.md` — テスト補完と旧契約BLOCKED判断の履歴、最終決定への参照。
4. `docs/qss-iphone14plus-acceptance-resume/r13-combined-evidence-closeout.md` — 本正式決定・残件snapshot。
5. `docs/qss-iphone14plus-acceptance-resume/r13-validation.json` — 既存検証のsource hashと結果を保存。

`docs/current-state.md`、共通`mapping.json`/`mapping.md`/`human-checklist.md`、`session-d-resume.md`も現状へ更新したが、以前のSession C/D等の未stage WIPが混在している。HEADの原58は11 PASS等の古い記録であり、これらのファイル全体をR-13-only commitへ混入しない。作業ツリー上の正式mappingは24/4/2/28で更新済み。共通mappingの累積差分は別途、既存受入履歴全体の範囲を確定してからcommitへ含める。styles.cssのVP-01候補、他UI/診断outputs等のWIPはstageしない。

[Validation snapshot](r13-validation.json): scoped2 suites / **42 tests PASS**（新規4）、root/mobile lint PASS、mobile source/test typecheck PASS、focused self-review PASS。今回、検証対象5ファイルのhashが全一致することを再確認して再利用し、不要な再実行をしない。workspace guard・mappingの唯一R-13判定変更/集計・diff/staged diff checkは今回実行。root typecheck/製品build/native sync/installは今回未実行。外部provider呼出・commit/pushなし。

## Latest original58 aggregate / remaining items

**24 PASS / 4 FAIL / 2 BLOCKED / 28 NOT YET RUN = 58**。追加30は20 PASS / 0 FAIL / 3 BLOCKED / 7 NOT YET RUNで不変。

| 状態 | 原ID | 境界 |
| --- | --- | --- |
| FAIL (4) | P-01, P-02, P-03, VP-01 | P-01〜03は旧Progress階層findingの受入行。Stage B全体PASSとは別に、原条件への証拠再照合待ちであり新UI不具合を再認定しない。VP-01はFAIL / intermittent / not reproduced in latest diagnostic、追跡保留 |
| BLOCKED (2) | S-05, S-07 | 承認済みUI変更で旧入口なし、適用判断待ち。製品FAILではない |
| NOT YET RUN (5) | S-01, S-02, S-03, S-04, S-06 | 原Session Bの残条件 |
| NOT YET RUN (3) | L-02, L-05, L-06 | 原Session Bの残条件 |
| NOT YET RUN (10) | R-01〜R-08, R-11, R-12 | 原Session Bの残条件。今回のR-13決定を他IDへ自動適用しない |
| NOT YET RUN (6) | RV-01〜RV-05, RV-07 | 原Session Bの残条件 |
| NOT YET RUN (3) | P-04, P-06, P-07 | 原Session Bの残条件 |
| NOT YET RUN (1) | H-01 | 原Session Eの複合条件 |

今回変更した判定はR-13のBLOCKED→PASSのみ。全体実機受入完了・Production ready・Gate8完了は主張しない。

## Remaining non-blocking finding / next

R-INT-02のタイマー割り込みで「マイクの音声を取得できませんでした。マイク設定を確認して録り直してください。」と表示されたUI copy finding。機能はPASS、文言修正は今回行わない。VP-01は別の未解決FAILでありnon-blocking copyへ分類し直さない。

**NEXT_ONE_ACTION: 原Session B/Eの残件を既存証拠へ照合し、必要な未確認条件だけを整理する。** Session C/DのPASS項目再試験、追加R-13録音、template/性能Gate8/Production/UI変更は行わない。
