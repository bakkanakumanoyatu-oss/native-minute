# R-13 — current source分類・表示・Human最小確認

**最終: Human DecisionによりR-13 PASS by COMBINED DETERMINISTIC + HUMAN_DEVICE evidence、Session D 7/7 PASS・CLOSED。** evidence_classはdeterministic test + actual-device supplemental evidence。実機LOW_SIGNAL/DIGITAL_SILENCE直接再現は主張しない。[正式判断・closeout](r13-combined-evidence-closeout.md)。以下のBLOCKED・証拠判断待ち・操作案内は決定前の履歴。

**最新: Human追加試行不要。R-13の決定的分類/UI/gate testsはPASS。原本110行の未観測条項により原実機受入BLOCKED、証拠方式判断待ち。** [reconciliation](r13-evidence-reconciliation.md)。以下の操作案内は過去時点の履歴。

2026-09-22、製品sourceはread-only。製品変更・build/install・commit/push・provider呼出なし。

## 確定したsource条件

RecordScreenは停止した録音を端末内でmono/16kHz/16-bit PCM WAVへ正規化し、`lib/browser-pcm-wav.ts` の `analyzePcm16WavSignal` を呼ぶ。音声認識・発話内容・外部providerの判定ではない。

| 分類 | exact条件（PCM全体で計算） | current UI / gate |
| --- | --- | --- |
| DIGITAL_SILENCE | PCM整数sampleの最大絶対値≤4、正規化RMS≤2/32768（約0.000061035）、絶対値≤4のsample比率≥0.999をすべて満たす。先に判定 | 「音声信号を検出できませんでした。マイクを確認して、もう一度録音してください。」。preparedTake/preview/確認checkboxをクリア。評価ボタンは**disabledで残るのではなく表示されない**。「録音する」から再録音可能 |
| LOW_SIGNAL | DIGITAL_SILENCEに該当せず、正規化peak<0.01 **または** RMS<0.001。境界は厳密な小なり | 「音声が小さめです。」＋local preview＋「録音を確認した」。未チェックでは評価disabled。手動チェック後は他の通常前提を満たせばenabled |
| SIGNAL_PRESENT | 上記以外 | LOW_SIGNAL警告なし。R-13のquiet/silent分岐の証拠にはならない |

「録音の詳細」の `signalClassification:` で実際の分類を読む。DIGITAL_SILENCEはデジタルゼロに極めて近いPCMのことであり、人が黙った/部屋が静かという条件と同一ではない。実マイクの環境音・入力処理・タップ音等が残ればLOW_SIGNALやSIGNAL_PRESENTになり得る。小声でもLOW_SIGNALになる保証はない。通常の実機操作だけでDIGITAL_SILENCEを確実に発生させる方法は、このsourceからは提示できない。権限拒否、入力切断、割り込み、ファイル注入で代用しない。

根拠: [分類実装](../../lib/browser-pcm-wav.ts)（repo path `lib/browser-pcm-wav.ts:268–320`）。UIは `apps/mobile/src/screens/RecordScreen.tsx:54–62,257–322,559–565,620–674`、正規化は `lib/browser-pcm-wav.ts:326` 以降。

## Human最小手順

同じiPhone/StagingのRecord、online・同意済み・マイク許可済み。前のoffline試験用automationは終了・解除した通常状態で行う。

1. 静かな環境で、ごく小声で5〜10秒録音→停止。「録音の詳細」で実分類を確認する。
2. LOW_SIGNALなら「音声が小さめです。」とpreviewを確認。評価ボタンは未チェックで無効。previewを再生してもチェックが勝手に付かないことを見て、手動で「録音を確認した」をON→評価ボタンが有効になることだけを見る。**評価ボタンは押さない**。
3. 「録り直す」から、発声せず5〜10秒録音→停止。実分類を確認する。DIGITAL_SILENCEなら上記の再録音案内が出て、preview/確認checkbox/評価ボタンが出ないことを見る。
4. DIGITAL_SILENCEが出なくても、それだけでFAILとしない。実際に出た分類・文言・gateだけを報告し、未観測分岐は未確認/条件不足のまま残す。発生させるための反復試行は求めない。途中でDIGITAL_SILENCEが先に出れば、その試行の表示をその分岐の証拠に使ってよい。

5〜10秒は記録が空になることを避けつつ短く確認するための手順上の長さで、分類閾値ではない。「短めの録音」案内が併記されるのは別の既存仕様。target60秒の短い録音閾値は36秒だが、これは推奨表示であり、短さ自体をこのclient gateの評価禁止条件にはしていない。

## Provider境界

録音・停止・PCM変換/分類・blob URLのpreview再生・確認checkboxの変更は端末内。checkboxのonChangeはstate変更のみ。`submitTake()` は「この録音で評価する」のclickから呼ばれ、`api.uploadRecording` → `api.evaluateRecording`へ進む。**評価を押さなければ、このR-13操作で音声upload/evaluation/provider呼出は開始しない。** 画面表示に伴う台本/同意取得・通常auth通信まで0と主張しない。

DIGITAL_SILENCE分岐の人工PCMによる既存unit testとcanSubmitMobileTakeのgate testはsource確認済み。今回再実行しておらず、それらをHuman actual-device PASSには代用しない。
