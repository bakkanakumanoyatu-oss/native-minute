# Quiet Speaking Studio — iPhone 14 Plus 実機受入 結果記録 v1

> 回収した2026-09-06の未記入テンプレート（履歴）。現在のsource・集計・次の操作は [mapping](mapping.md) / [未確認項目](human-checklist.md) を使用し、下記旧SHA/PHASE0を再開始しない。

対応: [CHECKLIST.md](CHECKLIST.md)。これは未実施のテンプレート。結果を先にPASSで埋めない。

## Run metadata

| 記録欄 | Human記入 |
| --- | --- |
| run ID / 実行者 | ____ / ____ |
| device / iOS | iPhone 14 Plus / ____ |
| app / version / build番号 | ____ / ____ / ____ |
| 対象source SHA | bd53c9ff5d16f52ca489199ff44057212f20516d |
| build対応根拠 / 実行surface | ____ / ____ |
| test date / 時刻 / timezone | ____ / ____ / ____ |
| network / audio route / Bluetooth機器 | ____ / ____ / ____ |
| 画面方向 / 表示拡大 / 文字設定N・L | ____ / ____ / ____ |
| permission開始状態 / VoiceOver状態 | ____ / ____ |
| 台本A・B / 長文結果C / historyの目印 | ____ / ____ / ____ |
| 証拠保存先 | ____ |

各checkの判定・証拠・備考はCHECKLISTの該当行へ記入する。複数日・異なるbuildの結果を混ぜず、同じIDの再試行は試行番号と条件を残す。別buildへ変更した場合は対象SHAとの関係を再確認する。

## 集計（独立IDは58。複合条件の内訳を二重加算しない）

| Phase | 対象ID | 総数 | PASS | FAIL | NOT TESTED |
| --- | --- | ---: | ---: | ---: | ---: |
| 0 | D-01 | 1 | 0 | 0 | 1 |
| 1 | S-01〜S-07 | 7 | 0 | 0 | 7 |
| 2 | L-01〜L-08 | 8 | 0 | 0 | 8 |
| 3 | R-01〜R-13 | 13 | 0 | 0 | 13 |
| 4 | RV-01〜RV-07 | 7 | 0 | 0 | 7 |
| 5 | P-01〜P-07 | 7 | 0 | 0 | 7 |
| 6 | DT-S/L/R/RV/P-01、VO-NAV/REC/DATA-01、VP-01 | 9 | 0 | 0 | 9 |
| 7 | L-09/L-10、R-OFFLINE-01、R-INT-01/02 | 5 | 0 | 0 | 5 |
| 8 | H-01 | 1 | 0 | 0 | 1 |
| 合計 | | 58 | 0 | 0 | 58 |

未実施のため上記0/0/58。実行後に更新し、各行でPASS＋FAIL＋NOT TESTED=総数となることを確認する。FAILまたは未実施のある複合項目はCHECKLISTの判定ルールに従う。

## P1-1 独立記録

| 観察欄 | 記録 |
| --- | --- |
| 対象ID / 試行番号 | R-OFFLINE-01 / ____ |
| 状態 | RESOLVED_IN_BROWSER_MOCK / DEVICE_VERIFY_PENDING |
| 実機結果 | NOT TESTED |
| online→offline方法 / 時刻 | ____ / ____ |
| appのoffline認識の証拠 | ____ |
| foreground維持の証拠 / 非active化有無 | ____ / ____ |
| 最大時間停止・background cancelとの区別 | ____ |
| 録音中 / stop / cancel / dock / scroll / 最終行 | ____ |
| 停止後のmicrophone実停止観察 | ____ |
| offline中の自動送信・評価なしの観察 | ____ |
| reconnect後の自動録音・送信・評価なしの観察 | ____ |
| 証拠ファイル / 時刻 | ____ / ____ |
| FAIL時のP1再open候補・影響 | ____ |

有効な実機試行でCHECKLISTの全期待結果がPASSした場合だけ、上の状態をDEVICE VERIFIEDへ更新する。操作方法で非active化しただけなら、R-INT-01と区別してR-OFFLINE-01はNOT TESTEDとする。

## FAIL記録（必要な件数だけ複製）

| 欄 | 記入 |
| --- | --- |
| finding ID / check ID / 試行番号 | ____ / ____ / ____ |
| build / 画面 / 文字サイズ / 向き / network / audio route | ____ |
| 事前条件 | ____ |
| reproduction steps | 1. ____ → 2. ____ → 3. ____ |
| expected / actual | ____ / ____ |
| impact（何ができないか） | ____ |
| 再現回数 / 試行回数 | ____ / ____ |
| SS / VID / H / ERR / 証拠時刻 | ____ |
| P0 / P1 / P2候補と理由 | ____ |
| 安全に停止・回復できたか | ____ |
| 次の判断・担当・状態 | ____ |

初期FAIL記録件数は0。ただし実機が未実施であるため「実機P0/P1=0を検証済み」とは記載しない。

## NOT TESTED / 部分実施 / 残るP2

| check ID / 小条件 | 完了した観察・証拠 | 未検証の理由・不足条件 | 必須 / 条件付き | 後日確認またはHuman受理の記録 |
| --- | --- | --- | --- | --- |
| ____ | ____ | ____ | ____ | ____ |

Bluetooth等の未検証分岐をPASSにしない。長文条件・Dynamic Type・dock・主要VoiceOver・P1-1・中心loopの未検証を、単なるmaintenanceへ移してcloseしない。軽微なP2は操作成立の証拠とともに記録する。

## 最終Human loopの回答

H-01結果: **NOT TESTED**。証拠: ____。同一台本で完走した時刻: ____。

1. 今どこにいるか分かる: ____
2. 次に何をすべきか分かる: ____
3. 同じ1分を繰り返す感覚が自然: ____
4. 不要なdashboard感がない: ____
5. Quiet Speaking Studioとして一貫して見える: ____
6. 重大な操作迷子がない: ____

## 最終判定（実行後のHuman記入）

| 条件 | 判定 / 根拠 |
| --- | --- |
| 対象端末・build対応確認 | NOT TESTED / ____ |
| 未解決P0件数 / P1件数 / 未分類件数 | 未評価 / 未評価 / 未評価 |
| 残るP2と処置 | 未評価 / ____ |
| P1-1 device check PASS | NOT TESTED / ____ |
| H-01中心loop完走 | NOT TESTED / ____ |
| dock操作不能なし（通常・大きい文字） | NOT TESTED / ____ |
| 最小VoiceOver実施・重大操作不能なし | NOT TESTED / ____ |
| 必須観察の未検証・未分類FAILなし | NOT TESTED / ____ |
| 条件付きNOT TESTED・軽微P2のHuman受理 | 未判断 / ____ |

- 現在のoverall: **NOT TESTED — DEVICE_ACCEPTANCE_PENDING=YES**。
- 実機試験後のoverall選択: `未完了 / 修正が必要 / CENTER_FIVE_SCREEN_DEVICE_ACCEPTANCE_PASS候補`。
- 選択と根拠: ____。
- Human確認者 / 日時 / 受入判断: ____ / ____ / ____。
- CHECKLISTの最終条件をすべて満たした場合だけPASS候補にする。候補作成だけではDEVICE_ACCEPTEDへ昇格しない。

## 受入とは別のmaintenance / 境界

- P2-7 legacy CSS cleanup: nonblocking maintenance、実機受入の項目数・PASS率から除外。今回実施しない。
- Gate 5 / G5D4 / collector / fixture / deletion proof / Library / 100 templates: 対象外。実施・承認の記録欄は設けない。
- release / deployment approval: この受入に含まない。
- 本テンプレート作成時点の実機試験・repo編集・commit・push: なし。

**次の操作:** 実機が利用可能になるまでCHECKLISTと本テンプレートを保管し、利用可能になったらPHASE 0から開始する。
