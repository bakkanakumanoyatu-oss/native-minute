# R-13 signal gate evidence reconciliation

**最終: Human DecisionによりR-13 PASS by COMBINED DETERMINISTIC + HUMAN_DEVICE evidence、Session D 7/7 PASS・CLOSED。** evidence_classはdeterministic test + actual-device supplemental evidence。実機LOW_SIGNAL/DIGITAL_SILENCE直接再現は主張しない。[正式判断・closeout](r13-combined-evidence-closeout.md)。以下のBLOCKED・証拠判断待ち・操作案内は決定前の履歴。

MODE: `QSS_R13_SIGNAL_GATE_EVIDENCE_RECONCILIATION`

2026-09-22。**決定的なsource/UI gate検証はPASS。原実機受入R-13はBLOCKED（分類分岐未観測／証拠契約の判断待ち）**。製品FAILではない。Humanへ追加試行は求めない。製品動作・source、build/install、provider、commit/pushは変更/実行しない。

## Current source contract

停止録音を端末内でmono16kHz/PCM16へ正規化し、[分類関数](../../lib/browser-pcm-wav.ts)で全sampleの振幅を計算。`DIGITAL_SILENCE`を先に判定する。

- DIGITAL_SILENCE: PCM整数の最大絶対値≤4、正規化RMS≤2/32768、絶対値≤4のsample比率≥0.999、すべて成立。
- LOW_SIGNAL: 上記以外で、正規化peak<0.01 **または** RMS<0.001。
- 通常信号のsource名は`SIGNAL_PRESENT`。上記以外。

[RecordScreen](../../apps/mobile/src/screens/RecordScreen.tsx)はLOW_SIGNALに「音声が小さめです。」とlocal previewを表示。再生だけでは確認されず、手動checkboxで評価gateが有効になる。DIGITAL_SILENCEは「音声信号を検出できませんでした。マイクを確認して、もう一度録音してください。」を表示し、preparedTake/preview/確認状態を破棄する。評価ボタンも非表示。`submitTake()`の前にguardがあり、実際のupload/evaluateは評価clickから開始する。short-recording表示は別判定。

## Existing evidence and gap

| 要件 | 既存直接証拠 | 今回補完 |
| --- | --- | --- |
| LOW_SIGNAL PCM | pcm-wav.test.tsの非ゼロ±0.002 PCM | 実App/RecordScreenまで接続 |
| DIGITAL_SILENCE PCM | all-zeroとnear-zeroの1/32768 PCM | 両fixtureを実App/RecordScreenまで接続 |
| 通常信号 | sin(i/12)×0.12→SIGNAL_PRESENT | LOW/DIGITAL警告なしとmanual gate |
| LOW_SIGNAL warning | 既存source wiringあり。既存分類unit/boolean gate testだけではUI到達の直接証拠なし | 可視warning・preview・実audio再生・checkbox非自動・手動ON/OFFの評価gate |
| DIGITAL_SILENCE表示/gate | 既存sourceとcanSubmitMobileTake(false)あり。実UIの要素除去は直接不足 | 直前の確認済み通常Takeから録り直し、silent案内、preview/checkbox/evaluate全非表示、再録音可能 |
| 送信/providerなし | 既存mock integrationで他状態のupload/evaluate呼出を計数 | 各新fixtureで録音停止/preview/手動確認後のupload/evaluate mock呼出0を直接assert。評価ボタンは押さない |

追加は[record-state.test.ts](../../apps/mobile/src/screens/record-state.test.ts)の**4ケース**（LOW_SIGNAL/通常の2、zero/near-zeroの2）。capture stubにPCM fixture選択を加え、分類結果やReact stateを注入せず、既存の正規化・分類・App→RecordScreen処理を通す。既存testの通常fixtureは同じまま。音声は合成bytesのみ、マイク・実ユーザー音声不使用。

network境界: fake auth、mock fetch、CSP `connect-src 'none'`、browserの外部origin requestをabort。新4ケースはupload/evaluateを一度も呼ばず、既存の他ケースのAPI retryはmockだけ。実provider呼出なし。これを実機での通信件数実測とは表現しない。

## Validation

- workspace guard PASS。
- scoped **2 suites / 42 tests PASS**（既存38＋追加4）。PCM unit6、Record state36。
- root lint、mobile lint、mobile source/test typecheck、diff check PASS。
- focused self-review: 実分類関数をmockしない、通常波形保持、警告の正/負、preview→確認の手動境界、silentで旧確認済みTakeが残らない、非送信、外部通信遮断、元のoffline tests維持を確認。
- installed source manifest68入力の相違は変更したtest1件だけ。分類/RecordScreen/recorderの製品sourceはHEADとも一致。製品build・native sync/installなし。root typecheckは今回未実行（mobile source/test typecheckはPASS）。新env/dependency/migrationなし、README変更不要。

[検証結果の保存版](r13-validation.json)。実行logはlocal evidence `outputs/qss-r13-reconciliation/scoped-tests.log` に保持。

## Human actual-device evidence

Human報告: 5〜10秒録音でshort warning、約30秒かなり小声でLOW_SIGNAL warningなし、約30秒自然音のみでDIGITAL_SILENCE warningなし。追加反復は行わない。

short gateが別に働き、これらの録音を主観的な静かさだけで一律LOW_SIGNAL/DIGITAL_SILENCEとして警告しなかった補助証拠として保存する。**実PCM振幅・signalClassification文字列は報告されていないため、SIGNAL_PRESENT実測や分類精度の定量証明とはしない。** このwarning未出現だけで製品FAILにはしない。実機の両分岐の直接観測は未取得であり、合成PCMの観測と区別する。R-12等の別IDを今回自動昇格させない。

## Original acceptance boundary / final status

原本SHA256 `1c3096b25ff424dbaf76bb54ddc097ba5b15aae5fbac3691eb0b28a526e3316d` と一致。変更なし。

[原本108行](original-checklist-20260906.md#L108)のR-13は条件付きで「LOW_SIGNALなら…」「DIGITAL_SILENCEなら…」「観測した分類の既存挙動を保つ」とし、両分岐の実機再現を必須とは書いていない。しかし[原本110行](original-checklist-20260906.md#L110)に以下の明示条項がある。

> R-11のretry未発生、R-13の分類未出現は備考へNOT TESTEDと記入する。静かな室内での録音をDIGITAL_SILENCEと決めつけず、通常信号しか得られなければ未検証とする。

従って、今回のuser指示7に従い**原実機受入を勝手にPASSへ変更しない**。決定的tests＋実機補助証拠で分類/UI/gateの機能契約は満たしたが、上記の実機未観測条項を変更する採用判断は別途必要。このmappingは条件不足をBLOCKEDへ正規化するため、R-13をNOT YET RUNから**BLOCKED（実機分類分岐未観測）**へ移す。原本のNOT TESTEDに対応し、製品FAILではない。

Session D: **6 PASS / 0 FAIL / 1 BLOCKED / 0 NOT YET RUN**。原58: **23 PASS / 4 FAIL / 3 BLOCKED / 28 NOT YET RUN**。追加30不変。VP-01はFAIL / intermittent / latest diagnostic未再現、追跡再開なし。R-INT-02は機能PASS、マイク設定を促すcopy findingはnon-blocking・未修正のまま。

**NEXT_ONE_ACTION: R-13に限り、原本110行の証拠条件を「決定的PCM/UI tests＋実機補助証拠」に変更して受入できるかHuman判断。** 新たな録音試行・評価送信は不要。
