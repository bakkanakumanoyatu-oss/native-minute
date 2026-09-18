# Quiet Speaking Studio — iPhone 14 Plus 実機受入チェックリスト v1

MODE: `UIUX_QSS_IPHONE14PLUS_DEVICE_ACCEPTANCE_CHECKLIST_PREPARATION_V1`

**準備用。実機試験は未実施。全58項目の初期判定は NOT TESTED。**

## 対象と使い方

- 対象は現在の Scripts / Listen / Record / Review / Progress のみ。
- 受入対象source: `bd53c9ff5d16f52ca489199ff44057212f20516d`、branch: `codex/g3-mobile-main-loop`。
- 準備時のauthority: `QSS_CENTER_FIVE_SCREEN_BASE_INTEGRATION_PASS_DEVICE_PENDING`。5画面すべて `FRONTEND_IMPLEMENTED=YES / BROWSER_VERIFIED=YES / DEVICE_ACCEPTANCE_PENDING=YES`。browser closeoutのP0=0 / P1=0を継承し、実機のP0/P1件数は試験後に別途記録する。
- P1-1は現在 `RESOLVED_IN_BROWSER_MOCK / DEVICE_VERIFY_PENDING`。この文書の作成では昇格しない。
- 既存データと接続条件が揃う場合、所要時間の計画目安は40–60分。音声準備・評価待ちは別。同じ操作の証拠を複数IDへ参照し、IDごとに録音や遷移を繰り返さない。
- フェーズ順に進める。L-09 / L-10はbackground試験をまとめるためPHASE 7に配置した。
- 実行者は各行の判定を `PASS / FAIL / NOT TESTED` のいずれかへ更新し、証拠・備考を埋める。結果の集約には [RESULT_TEMPLATE.md](RESULT_TEMPLATE.md) を使う。
- 未実施・条件不足・観察不能はNOT TESTED。機器やデータがない項目を穴埋めのために推測でPASSにしない。

## 実行記録・既存データの選択

| 記録欄 | Human記入 |
| --- | --- |
| run ID / 実行者 | ____ / ____ |
| device | iPhone 14 Plus（実機で照合: ____） |
| iOS version | ____ |
| app名 / version / build番号 | ____ / ____ / ____ |
| buildと対象source SHAの対応根拠 | 配布記録・既存build情報等: ____ |
| 実行surface | インストール済みiOSアプリ等: ____（Safari等の別surfaceは区別） |
| test date / 開始・終了時刻 / timezone | ____ / ____ / ____ |
| network | Wi-Fi / cellular: ____、切替時刻: ____ |
| audio route / Bluetooth機器 | speaker / Bluetooth等: ____ / ____ |
| 画面方向 / 表示拡大設定 | ____ / ____ |
| 通常文字サイズ N / 大きい文字サイズ L | 端末設定の実際の位置・値・設定画面の証拠: ____ / ____ |
| VoiceOver開始時の状態 | ____ |
| microphone permission開始時の状態 | 未決定 / 許可済み / 拒否等: ____ |
| ログイン・voice準備・pronunciation consent | 既存の利用可能状態を確認: ____ |
| A: 主loop用の既存1分台本 | 識別用alias / 覚えておくタイトル・冒頭・末尾: ____ |
| B: 長いtitle・scroll可能な既存台本 | alias / 目印: ____（Aと同じでも可） |
| C: 長いadviceの保存済みReview / 長いlatest nextStep | alias / 日時等の目印: ____（別台本でも可） |
| 複数台本 / Latest・Best・historyの既存状態 | 件数・目印: ____（2本以上、既に5本あれば全行を見る） |

既存台本や履歴を削除・書換えして条件を作らない。長いtitle、長い保存済みadvice、複数台本等がなければ対応項目をNOT TESTEDにする。短い録音等は通常UIで行い、音声データの加工・API直叩き・provider設定変更を必要条件にしない。長いnextStepを得るためだけの評価反復も不要。

build対応が不明、対象SHAと異なる、ログイン・通常音声の前提が未準備ならPHASE 0で保留し、今回の実機受入の証拠として扱わない。このチェックリスト自体はbuild作成・配布・環境変更の手順を含まない。

## 証拠の残し方

- `SS`: screenshot、`VID`: screen recordingまたは外部撮影、`H`: Human observation、`ERR`: 表示error text、`REPRO`: reproduction steps。
- 証拠欄には実ファイル名と時刻、または具体的な観察文を記入する。例: `run01_R-OFFLINE-01_01.mp4 00:12–00:31`。同じ証拠を複数IDで参照してよい。
- SSは切れ・重なり・最終行、VIDは遷移・dock・停止、Hは実際の音・理解・迷いの記録に使う。画面収録だけから「音が聞こえた」「microphoneが終了した」と推定しない。
- 端末の画面収録が録音・再生の妨げになる場合は、外部撮影または時刻付きHへ替える。通知・アカウント情報など不要な個人情報を証拠に含めない。
- FAILは必ず `REPRO / impact / 証拠 / P0・P1・P2候補` を結果テンプレートに残す。

## PHASE 0 — 端末・build確認（1項目）

| ID | 対象画面 | 事前条件 | 操作 | 期待結果 | PASS / FAIL / NOT TESTED | 証拠欄 | 備考欄 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D-01 | 起動 / Scripts | iPhone 14 Plusと既存の対象buildが使える | 上の実行記録を埋め、既存アプリを開いて端末・build・台本・音声前提を照合 | 対象SHAのbuildで中心5画面を試せる。データ削除不要。対応不明・不足は保留 | NOT TESTED | build根拠＋H: ____ | 不足条件: ____ |

## PHASE 1 — Scripts（7項目）

S-04 / S-05は遷移先を説明する前に尋ね、Humanの最初の言葉を記録する。S-06 / S-07はその後に行う。画面を既に熟知している場合は、その前提も記録する。

| ID | 対象画面 | 事前条件 | 操作 | 期待結果 | PASS / FAIL / NOT TESTED | 証拠欄 | 備考欄 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S-01 | Scripts | D-01完了、online、Aあり | 一覧を開き、上端から下端を見る | 台本title・locale・目標時間・抜粋・操作が読め、正常な一覧として表示される | NOT TESTED | SS＋H: ____ | ____ |
| S-02 | Scripts | Bの長いtitleあり | 該当行を読む | titleが折返し、文字切れ・操作との重なり・横はみ出しがない | NOT TESTED | SS: ____ | titleの長さの目安: ____ |
| S-03 | Scripts | 複数の既存台本あり | 一覧を縦scrollし、各行のtitleと2操作を見る | 全行が同等の選択肢として見え、別行の操作を誤認しない | NOT TESTED | SSまたはVID＋H: ____ | 実件数: ____ |
| S-04 | Scripts | 遷移先をまだ説明していない | 「通常の練習はどれから始めると思うか」を尋ねる | Humanが「練習する」を通常開始として選べる | NOT TESTED | H（最初の回答）: ____ | 迷い・事前知識: ____ |
| S-05 | Scripts | S-04直後、補足説明前 | 「録音する」は何が違うと思うかを尋ねる | Listenを飛ばして録音へ進むsecondaryだと理解し、通常開始と混同しない | NOT TESTED | H（最初の回答）: ____ | 誤認した意味: ____ |
| S-06 | Scripts → Listen | Aのtitle・本文の目印を確認済み | Aの「練習する」を押す | AのListenへ移り、titleと本文が一致する | NOT TESTED | VIDまたは前後SS＋H: ____ | ____ |
| S-07 | Scripts → Record | Aの目印を確認済み | Scriptsへ戻り、Aの「録音する」を押す | Listenを経由せずAのRecordへ移る。録音は自動開始しない | NOT TESTED | VIDまたは前後SS＋H: ____ | 終了後Scripts経由でListenへ: ____ |

## PHASE 2 — Listen（8項目、残る2項目はPHASE 7）

既存の通常UIで必要な場合だけお手本を準備する。実際に聞ける既存音声を用い、provider contractを変更しない。L-01〜L-07は同じ再生・scroll操作にまとめてよい。

| ID | 対象画面 | 事前条件 | 操作 | 期待結果 | PASS / FAIL / NOT TESTED | 証拠欄 | 備考欄 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| L-01 | Listen | online、scrollが必要な台本を読込済み | 本文を上端から末尾までscrollし戻す | 全文を読め、途中でscroll不能にならない | NOT TESTED | VIDまたはH: ____ | 台本alias: ____ |
| L-02 | Listen | L-01と同じ | 本文の上・中・下で、現在stateの準備／再生・一時停止操作を触る | 本文を戻さずbottom dockの該当操作へアクセスできる | NOT TESTED | VID＋H: ____ | ____ |
| L-03 | Listen | 本文末尾までscroll済み | 最終行とHome indicator付近を見る | 最終行がdockに隠れず、末尾まで読める | NOT TESTED | 末尾SS: ____ | ____ |
| L-04 | Listen | 実音声がready | 再生 → 一時停止 → 再生を1回ずつ行う | 実際の音が操作に応じて開始・停止し、二重再生しない | NOT TESTED | H（聞こえた結果）＋VID任意: ____ | ____ |
| L-05 | Listen | L-04と同じ | 再生中と一時停止中に時間表示を観察 | 実media時間に沿って進み、停止中は進み続けない。目標60秒を実音声長として誤表示しない | NOT TESTED | VIDまたは時刻付きH: ____ | 観測した時間: ____ |
| L-06 | Listen → Record | online、台本ready | 本文上・中・末尾で「録音へ進む」を確認し、最後に押す | ready状態でCTAに常時アクセスでき、全文再生を強制されず同じ台本のRecordへ移る | NOT TESTED | VID＋H: ____ | offline/loadingの既存gateは解除要求しない |
| L-07 | Listen | speaker選択、聴ける音量 | お手本を数秒再生する | speakerから対象音声を明瞭に聞ける | NOT TESTED | H（出力先・聞こえ方）: ____ | 音量: ____ |
| L-08 | Listen | 使用可能なBluetooth機器がある場合 | speakerで再生確認後、Bluetoothへ切替え再生し、speakerへ戻す | 選んだ出力先で聞け、切替後も操作可能・二重再生なし。非active化した場合の再準備は許容 | NOT TESTED | H＋VID任意: ____ | 任意。機器・切替前後route・非active化有無: ____ |

L-06でRecordへ移る前にL-07 / L-08をまとめて実行してよい。L-08ができない場合は理由を残す。

## PHASE 3 — Record（13項目）

通常の録音・preview・評価1回でR-02〜R-10をまとめる。通常録音はAを約1分読み、上限120秒に達する前に停止する。短い録音・録り直しは追加の短い試行にまとめ、失敗を発生させるための外部操作はしない。

| ID | 対象画面 | 事前条件 | 操作 | 期待結果 | PASS / FAIL / NOT TESTED | 証拠欄 | 備考欄 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R-01 | Record / OS permission | online、台本ready、既存consent条件を満たす | permission開始状態を記録し「録音する」を押す。未決定なら通常のOS案内に応答 | 許可後は録音可能。拒否状態なら分かる案内を表示し無断録音しない。許可済みでpromptが出ないのは正常 | NOT TESTED | H＋SS任意: ____ | 観測したpermission分岐: ____、未観測分岐はNOT TESTED |
| R-02 | Record | microphone許可済み | 「録音する」を押してAを読む | 1回の録音開始に対し録音中表示と経過時間が進む | NOT TESTED | VIDまたはH: ____ | ____ |
| R-03 | Record recording | R-02の録音中、長い本文 | 声を出しながら本文を上・中・末尾へscroll | 本文を読め、録音が意図せず止まったり最初から始まったりしない | NOT TESTED | VID＋H: ____ | ____ |
| R-04 | Record recording | R-03と同じ | 各scroll位置で停止・キャンセルの位置と到達性を確認 | 停止はbottom dockに残り、本文を戻さず押せる。キャンセルもアクセス可能 | NOT TESTED | VID: ____ | ____ |
| R-05 | Record recording | 本文末尾 | 最終行とdock境界を見る | 最終行が隠れず、読み終えて停止できる | NOT TESTED | SS: ____ | ____ |
| R-06 | Record recording → after | 通常の約1分録音中 | 停止を1回押す | 録音が終了し、previewへ進む。timer停止とOS上の当該appのmicrophone使用終了を観察できる | NOT TESTED | H＋VID任意: ____ | OSの直近使用表示とactive使用を区別: ____ |
| R-07 | Record after | R-06のpreviewあり | native previewを再生・一時停止する | 今録った自分の声が聞け、前のTakeとの取り違えや二重再生なし | NOT TESTED | H（声・冒頭末尾・音質）: ____ | ____ |
| R-08 | Record after | 新しいpreview、確認checkbox未選択 | 評価操作の無効を確認し、再生した後「録音を確認した」を選択する | 未確認では評価不可。再生だけでは自動チェックされず、手動確認後に評価可能 | NOT TESTED | 前後SSまたはVID: ____ | ____ |
| R-09 | Record evaluating | R-08完了、online、通常評価を利用可能 | 「この録音で評価する」を1回押す | 保存／評価中の状態が分かり、二重操作を促されない。正常応答なら完了する | NOT TESTED | VIDまたはH、error時ERR: ____ | 待ち時間・error: ____ |
| R-10 | Record → Review | R-09成功 | 遷移先の台本と今回の結果を確認 | 同じ台本・今回のTakeのReviewへ移る。title・日時・録音の目印を照合できる | NOT TESTED | 前後SS＋H: ____ | 照合した目印: ____ |
| R-11 | Record after / retry | previewのある短い別試行、必要なら自然発生した一時評価error | 「録り直す」→録音→停止→新previewを確認。評価errorが自然発生した場合のみ「同じ録音で評価を再試行」を使う | 録り直しは新しい音声となり手動確認が外れる。retry分岐は同じ保持音声で再試行できる | NOT TESTED | H＋VID、error時ERR: ____ | 録り直し結果: ____、retry結果: ____（未発生はNOT TESTED） |
| R-12 | Record after | Aの目標60秒、microphone利用可能 | 5〜10秒ほど普通の声で録音して停止する | 短い録音と録り直し推奨の既存案内が出る。短いだけでDIGITAL_SILENCE扱いにならない | NOT TESTED | 案内SS＋H: ____ | 実duration: ____ |
| R-13 | Record after | 安全に小声／静かな試行ができる場合 | 小声または静かな試行を停止し、「録音の詳細」の分類と案内を見る | LOW_SIGNALなら小さめ案内と手動確認gate。DIGITAL_SILENCEなら再録音案内で評価不可。観測した分類の既存挙動を保つ | NOT TESTED | 分類・案内SS＋H: ____ | 任意。LOW_SIGNAL: ____、DIGITAL_SILENCE: ____ |

R-01のために既存データ削除・再インストール・permission resetを要求しない。R-11のretry未発生、R-13の分類未出現は備考へNOT TESTEDと記入する。静かな室内での録音をDIGITAL_SILENCEと決めつけず、通常信号しか得られなければ未検証とする。内部Take IDやupload回数の証明へ試験を拡張しない。

## PHASE 4 — Review（7項目）

R-10のReviewでRV-01 / RV-02を確認する。長文は既存のCを使用し、RV-03 / RV-04のために本文や保存済み結果を編集しない。遷移確認後は同じ保存済みReviewをhistory等から開き直してよい。

| ID | 対象画面 | 事前条件 | 操作 | 期待結果 | PASS / FAIL / NOT TESTED | 証拠欄 | 備考欄 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RV-01 | Review | focus wordsのある保存済み結果 | 最初に目に入る内容と「次に何を直すか」をHumanに尋ねる | focus words → advice →「次のTakeを録る」の順で理解できる | NOT TESTED | H（最初の回答）＋SS: ____ | focusなしの場合は該当部分NOT TESTED |
| RV-02 | Review | RV-01と同じ | 最も重要に見えた内容を尋ねる | scoreだけに注意が集まらず、次の練習内容と操作を説明できる | NOT TESTED | H（回答）: ____ | ____ |
| RV-03 | Review | Cの長い保存済みadvice | adviceを先頭から末尾まで読む | 全文を読め、省略・文字切れ・重なりがない | NOT TESTED | SSまたはVID: ____ | Cの目印: ____ |
| RV-04 | Review | RV-03と同じ | advice先頭から「次のTakeを録る」へ到達する | 通常のscrollで補助説明なくCTAを見つけて押せる。到達の負担・迷いを記録する | NOT TESTED | VID＋H: ____ | 所要秒・swipe数・迷い: ____ |
| RV-05 | Review → Record | 保存済みReviewの台本を確認済み | 「次のTakeを録る」を押す | 同じ台本のRecordへ移り、録音は手動開始できる | NOT TESTED | 前後SSまたはVID: ____ | ____ |
| RV-06 | Review → Listen | 同じReviewを開き直す | 「お手本を聞き直す」を押す | 同じ台本のListenへ移る | NOT TESTED | 前後SSまたはVID: ____ | ____ |
| RV-07 | Review → Progress | 同じReviewを開き直す | 「成長を見る」を押す | その台本のProgressへ移り、別台本と混同しない | NOT TESTED | 前後SSまたはVID: ____ | ____ |

## PHASE 5 — Progress（7項目）

| ID | 対象画面 | 事前条件 | 操作 | 期待結果 | PASS / FAIL / NOT TESTED | 証拠欄 | 備考欄 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P-01 | Progress | latest結果のある台本 | 最初に見える内容から、次に行う練習をHumanが説明する | nextStepが先に理解でき、score探索から始めなくてよい | NOT TESTED | H（回答）＋SS: ____ | ____ |
| P-02 | Progress | Latest / Bestを表示できる既存履歴 | ラベル・score・日時を読む | LatestとBestの意味を区別できる。同じTake注記がある場合は同一結果と分かる | NOT TESTED | SS＋H: ____ | 同一／別Takeの観測条件: ____ |
| P-03 | Progress | historyあり | Take historyまでscrollし各行を読む | 日時・score・Review操作が読め、任意の行を選べる | NOT TESTED | SSまたはVID: ____ | ____ |
| P-04 | Progress → Review | P-03、選ぶ行の目印を記録済み | historyの1行を押す | 選んだ台本・TakeのReviewに移り、日時等の目印が一致する | NOT TESTED | 前後SS＋H: ____ | ____ |
| P-05 | Progress → Record | 結果のある台本のProgressへ戻る | 「もう一度練習する」を押す | 同じ台本のRecordへ進み、操作先を誤認しない | NOT TESTED | 前後SS＋H: ____ | ____ |
| P-06 | Progress | Cの長いlatest nextStep | adviceを先頭から末尾まで読む | latest nextStep全文が読め、文字切れ・省略・重なりなし | NOT TESTED | SSまたはVID: ____ | 長文がlatestである目印: ____ |
| P-07 | Progress | P-06と同じ | advice先頭から再練習CTAへ到達する | 補助説明なく通常scrollで見つけ、実用上無理なく押せる | NOT TESTED | VID＋H: ____ | 所要秒・swipe数・迷い: ____ |

## PHASE 6 — Accessibility / enlargement / safe area（9項目）

通常文字サイズNの観察をPHASE 1〜5から参照し、実機設定で実用上大きい文字サイズLへ変更して以下を実行する。設定値と実際の表示変化を両方記録する。ブラウザの200%拡大・画像の拡大をDynamic Typeの代用にしない。設定しても対象文字が変化しない場合はその事実を残し、対応PASSとは扱わない。

各DT項目の備考には `N: 判定・証拠 / L: 判定・証拠 / 実際に拡大した文字` を記録する。長文条件が不足する場合は該当部分NOT TESTED。CTA距離は秒・swipe数・迷いの有無を観察し、今回新たな一律の秒数上限は設けない。文字を小さく戻さないと押せない、操作を探せない場合はFAIL。

| ID | 対象画面 | 事前条件 | 操作 | 期待結果 | PASS / FAIL / NOT TESTED | 証拠欄 | 備考欄 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DT-S-01 | Scripts | N/L設定を記録、B・複数行あり | 両設定で一覧を読み、各行の2操作に到達する | titleとbutton labelが折返し、横overflow・clipped text・重なりなし | NOT TESTED | N/LのSS＋H: ____ | N: ____ / L: ____ / 拡大変化: ____ |
| DT-L-01 | Listen | N/L、長い本文、online、音声ready | 両設定で本文末尾へscrollしplay/pause・Record CTAを操作 | dock・最終行・button labelが読め、重なりなく操作可能 | NOT TESTED | N/LのSSまたはVID: ____ | N: ____ / L: ____ / 拡大変化: ____ |
| DT-R-01 | Record | N/L、長い本文、録音可能 | 両設定でbefore → 短いrecording → stop → preview・確認状態を確認 | 開始／停止／キャンセル／確認／評価の現在state操作へ到達でき、dock・最終行・折返しに破綻なし | NOT TESTED | N/LのVID＋H: ____ | N: ____ / L: ____ / 拡大変化: ____ |
| DT-RV-01 | Review | N/L、Cの長いadvice | 両設定で全文を読み「次のTakeを録る」へ到達 | clipped text・横overflow・重なりなし。大きい文字でもCTAを自力で発見・操作できる | NOT TESTED | N/LのVID＋H: ____ | N/Lの秒・swipe・迷い: ____ |
| DT-P-01 | Progress | N/L、Cの長いlatest nextStep | 両設定で全文・再練習CTA・historyへ到達 | 全文とlabelが読め、CTAとhistoryを自力で発見・操作できる | NOT TESTED | N/LのVID＋H: ____ | N/Lの秒・swipe・迷い: ____ |
| VO-NAV-01 | 5画面 | VoiceOver ON、A・保存済み結果を利用可 | 各画面headingを探し、primary / secondaryへ順にfocusして必要な操作を実行 | headingと画面の意味が分かるlabelを読み上げ、順序・focusが自然。非表示要素への迷入や操作不能なし | NOT TESTED | H（画面別の読み上げ順・label）: ____ | 5画面別結果: ____ |
| VO-REC-01 | Record | VoiceOver ON、録音可能 | 録音を開始し、状態を確認して停止へfocus・実行。preview確認へ進む | 「録音中」・「停止」が理解でき、timerが操作を妨げず、停止と手動確認を実行できる | NOT TESTED | H＋VID任意: ____ | 状態・stop・checkboxのlabelとfocus順: ____ |
| VO-DATA-01 | Review / Progress | VoiceOver ON、focus words・score・historyあり | focus words → advice → CTA、score、history行へfocusし1行を開く | 各語・score・history行の意味と順序が分かり、選んだReviewへ移れる | NOT TESTED | H（実際の読み上げ・順序）: ____ | 欠けたデータ部分はNOT TESTED: ____ |
| VP-01 | Scripts / Listen / Record | N/L、長い本文、VoiceOver OFF | 下記viewport手順を実行し、safe area・keyboard・短い表示高さを確認 | Home indicatorとdock操作が衝突せず、keyboard後の回復と短いviewportで主要操作・本文末尾を使える | NOT TESTED | 条件別SS/VID＋H: ____ | 縦・横・keyboard・N/L別結果: ____ |

### VP-01の操作（同一ID内の条件記録）

1. 縦向きのListen ready、Record before / recording / afterで、bottom safe areaとdock・Home indicatorを確認する。大きい文字Lと長い本文でも末尾まで読む。
2. Scriptsの「台本を作る」でフォームを開き、空のタイトル／英語台本欄へfocusしてkeyboardを出す。入力欄が見え、通常のscroll・keyboardを閉じる操作・「フォームを閉じる」へ到達できることを確認する。保存は押さず、新規台本を作らない。
3. keyboardを閉じてListen／Recordへ戻り、viewport・dockが回復することを見る。Listen／Recordに存在しない入力欄を作ったり、keyboard常設を前提にしたりしない。
4. appが横向き表示を許す場合だけ、低い表示高さでListen ready／Recordの操作を確認する。向きが固定ならその事実と横向きNOT TESTEDを記録し、native設定を変えない。端末上で未再現の短いviewport条件は未検証として残す。
5. N/L・向き・keyboard有無・見えていた範囲を証拠に添える。長文／大きい文字だけを根拠に、未再現のshort viewportまでPASSへ広げない。

VoiceOverは上記8種の要素（heading、primary、secondary、focus words、score、history row、Record状態、stop）を中心に見る。網羅的accessibility監査へ拡張しない。PHASE 7前に通常文字サイズ・VoiceOver OFFへ戻す。

## PHASE 7 — interruption / connectivity（5項目）

| ID | 対象画面 | 事前条件 | 操作 | 期待結果 | PASS / FAIL / NOT TESTED | 証拠欄 | 備考欄 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| L-09 | Listen | 実音声を再生中、N、VoiceOver OFF | 通常操作で短くbackgroundへ移しforegroundへ戻る | backgroundで音声を解放・停止し、復帰後は必要な再準備へ戻る。連続再生や元の秒数からの自動再開を必須にしない | NOT TESTED | H＋VID任意: ____ | 戻る前後のscroll・状態: ____ |
| L-10 | Listen | L-09の復帰直後 | 表示された再準備・再生・一時停止・Record導線を使う | 操作不能・二重再生・意図しない自動再生なし。同じ台本を確認して練習へ戻れる | NOT TESTED | H＋VID任意: ____ | ____ |
| R-OFFLINE-01 | Record recording | foregroundを保ってonline→offlineにできる安全な接続条件、台本ready・microphone利用可 | 下の独立手順を実行 | 録音中・stop・cancel・scroll・dock・最終行を維持し、実停止できる。自動送信・評価・再録音開始なし | NOT TESTED | 時系列VIDまたは外部撮影＋H: ____ | 遷移方法・app非active化有無: ____ |
| R-INT-01 | Record | 短い別録音中、online | アプリを短くbackgroundへ移しforegroundへ戻す。その後手動で新録音・停止する | 既存仕様どおり録音中Takeをcancel・破棄しmicrophoneを解放。自動再開・自動送信なし。復帰後の手動録音が可能 | NOT TESTED | H＋VID任意: ____ | timer・preview・scroll・stateの前後: ____ |
| R-INT-02 | Record | 安全な通常のaudio interruptionを起こせる場合 | 種類を記録して短い録音中に1回割り込み、終了後に画面とmicrophone・回復操作を見る | appが非activeになったり音声入力を失った場合はcancel／errorとして終了し、意図しない継続・送信なし。回復して手動録音できる | NOT TESTED | H＋VID、必要ならERR: ____ | 任意。割込種類・観測した影響: ____ |

R-INT-02のために緊急通話や他者への連絡を要求しない。試験者が安全に制御できる通常の割り込みがなければNOT TESTED。画面通知が出ただけで音声やapp stateに変化がなければ、audio interruptionを検証できたとは扱わない。OSごとの影響を推測で補わず、観測結果と既存回復動作を記録する。

### R-OFFLINE-01 — P1-1独立必須手順

**有効な試行の条件**

- onlineで台本を読み込み、microphoneを利用できる。試行は最大録音時間120秒に達する前に終える。
- 録音をforegroundで継続したまま、appが実際にofflineを認識する必要がある。
- 例: 事前にcellularへのfallbackを止めた試験端末を、許可された専用Wi-Fiへ接続し、別担当者がその専用接続を停止する。他者の通信へ影響する接続操作はしない。
- 設定アプリやControl Centerへの移動等でappが非active化すると、既存のbackground cancelが働く場合がある。その試行はR-INT-01の観察に分ける。R-OFFLINE-01のPASSやP1再発と即断しない。
- 単なる通信errorや、Wi-Fi接続を保ったままの外部到達不能を「app認識offline」と同一視しない。offline表示と録音継続を確認できなければNOT TESTED。

**操作**

1. Recordで録音開始。台本・録音中表示・timer・dock・microphone使用を記録する。
2. appをforegroundに保ったまま、上の方法でofflineへ切り替える。切替時刻と方法を記録する。
3. appのoffline表示を確認し、録音中表示・timer・stop・cancelが残ることを見る。
4. 本文をscrollし、途中と末尾でdock・stop・cancelの到達性、最終行の非遮蔽を確認する。
5. offlineのまま「停止」を1回押す。録音中表示／timerが終了し、OS上で当該appのactive microphone使用が終了したことを観察する。OSの直近使用表示だけで継続中と判定しない。実停止を確認できなければNOT TESTED。
6. offlineのまま、送信・評価中表示や自動Review遷移が起きないこと、新規録音開始が許可されないことを確認する。
7. 必要なら再接続し、少なくとも10秒程度観察する。別録音が自動開始せず、送信・評価も自動開始しないことを見る。準備済み音声が戻れば、その同じ短い録音であることをpreviewで確認し、評価は押さない。
8. 結果と証拠時刻を記入する。microphoneが終了しない、停止が消える等の明確な問題なら安全に録音を終えて試行を止め、P1再open候補として報告する。

**期待結果の照合欄（各欄にPASS / FAIL / NOT TESTED）**

| 観察点 | 判定 / 証拠時刻 |
| --- | --- |
| app認識offlineへ移行し、録音中表示が維持される | NOT TESTED / ____ |
| stopが消えず、cancelへアクセス可能 | NOT TESTED / ____ |
| script scroll・dock・最終行非遮蔽を維持 | NOT TESTED / ____ |
| stop後に録音とactive microphone使用が終了 | NOT TESTED / ____ |
| offlineで新規録音・自動upload・自動evaluateが始まらない | NOT TESTED / ____ |
| reconnectで別録音・自動upload・自動evaluateが始まらない | NOT TESTED / ____ |
| background cancel／最大時間停止との混同なし | NOT TESTED / ____ |

証拠は端末上で観測したUI・音声・microphone状態を示す。自動upload/evaluateなしのHuman観察を内部の通信件数0の証明と表現しない。内部契約のbrowser証拠と、今回の実機観察の範囲を区別する。

全期待結果を有効な試行で確認できた場合だけ、同じbuild・条件についてP1-1を `DEVICE VERIFIED` と記録できる。R-OFFLINE-01だけのPASSで5画面全体をDEVICE_ACCEPTEDにしない。

## PHASE 8 — final Human loop（1項目）

| ID | 対象画面 | 事前条件 | 操作 | 期待結果 | PASS / FAIL / NOT TESTED | 証拠欄 | 備考欄 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| H-01 | Scripts → Listen → Record → Review → Record（必要ならProgress） | A、通常文字サイズ、online、音声条件復帰、重大な未解決障害なし | Humanが補助説明なしでAを聴き、約1分録音・preview確認・評価し、Reviewの助言から次のRecordへ戻る。最後の録音も自分で開始・停止する | 同じ1分を繰り返す中心loopが完走し、下の6問に具体的に答えられる。重大な操作迷子・dock操作不能なし | NOT TESTED | H（回答）＋VID任意: ____ | 完走時刻・困った操作: ____ |

| Human確認 | 回答・具体例 / PASS・FAIL・NOT TESTED |
| --- | --- |
| 1. 今どの画面・状態にいるか分かる | ____ / NOT TESTED |
| 2. 次に何をすべきか分かる | ____ / NOT TESTED |
| 3. 同じ1分を繰り返す感覚が自然 | ____ / NOT TESTED |
| 4. 不要なdashboard感がない | ____ / NOT TESTED |
| 5. Quiet Speaking Studioとして一貫して見える | ____ / NOT TESTED |
| 6. 重大な操作迷子がない | ____ / NOT TESTED |

最後に録音・再生を手動で終え、変更した端末設定を元へ戻す。試験で増えた保存済み結果を自動で削除しない。

## 判定・close条件

- **PASS**: 記載した事前条件で操作し、期待結果を実機証拠から確認できた。
- **FAIL**: 有効な条件で期待結果と違う挙動を観測した。手順・影響・証拠・重大度候補を残す。
- **NOT TESTED**: 未実施、条件／データ／機器不足、操作で別stateに移った、証拠が不十分等。理由を必ず記入する。
- 複合項目で一部が未検証なら項目全体はNOT TESTEDとして、備考に完了した部分の結果を分けて残す。一部でも明確な不具合があればFAILとする。未観測のpermission分岐・signal分類・retry・画面条件へPASSを一般化しない。
- P0候補: releaseを止める破壊的・重大な問題。P1候補: 中心loop、録音停止、dock、主要accessibility操作等、実機受入を妨げる明確な問題。P2候補: 操作は成立するが実用性・軽微な表示等の改善を要する事項。重大度はHumanと確認し、未分類問題を0件として扱わない。

次のすべてを証拠で満たしたときだけ **`CENTER_FIVE_SCREEN_DEVICE_ACCEPTANCE_PASS` 候補**とする。

1. 実施buildが対象SHAへ対応し、実機での未解決P0=0 / P1=0。
2. R-OFFLINE-01が有効な試行でPASSし、P1-1の実機確認が完了。
3. H-01の中心loopを完走。
4. Listen / Recordのdockに操作不能なし。通常／大きい実機文字サイズで現在stateの操作・本文末尾に到達できる。
5. 最小VoiceOver確認を実施し、主要操作に重大な操作不能なし。
6. 必須観察にNOT TESTEDや未分類FAILを残していない。データ不足で長文条件等を未確認のまま全体PASS候補へ進めない。

Bluetooth、初回permission等の未到達分岐、自然発生しなかった評価retry、得られなかったsilence/low-signal分類、安全に起こせないaudio interruption、appが対応しない向き等は、未検証の範囲と理由を残して候補判断へ提示できる。これらをPASSへ書き換えず、Humanが残余リスクを明示的に受理した場合だけ条件付きの候補として扱う。必須P1-1・中心loop・dock・主要accessibilityの未検証は代替できない。

軽微なP2のFAILが残る場合は、操作可能な根拠と後続maintenanceを記録してHumanが判断する。候補作成は自動承認ではない。候補のHuman確認が終わるまでは `DEVICE_ACCEPTANCE_PENDING=YES` を維持する。

## 別欄: maintenanceと対象外

- P2-7 `legacy CSS cleanup`: nonblocking maintenance。実機受入58項目に含めず、今回cleanupしない。
- Gate 5 / G5D4 / collector / fixture / deletion proof / Library / 100 templates は、このチェックリストの試験対象外。これらの実行項目や完了判定は設けない。
- この実機受入はrelease approval・deployment approvalを与えない。準備段階で実機試験・repo変更・commit・pushは行わない。

## 項目数と既存実装の参照

| Phase | 内容 | 項目数 |
| --- | --- | ---: |
| 0 | device/build | 1 |
| 1 | Scripts | 7 |
| 2 | Listen（L-01〜L-08） | 8 |
| 3 | Record | 13 |
| 4 | Review | 7 |
| 5 | Progress | 7 |
| 6 | Dynamic Type 5 / VoiceOver 3 / viewport 1 | 9 |
| 7 | Listen復帰2 / offline1 / Record interruption2 | 5 |
| 8 | final Human loop | 1 |
| 合計 | 独立ID数。照合欄・条件別記録は重複加算しない | **58** |

手順の既存動作確認に用いたsource（実機PASSの証拠ではない）:

- [Listenの非active時音声解放](/Users/karasawatakahiro/Developer/native-minute/apps/mobile/src/screens/ListenScreen.tsx:112)
- [Recordの非active時cancelと復帰](/Users/karasawatakahiro/Developer/native-minute/apps/mobile/src/screens/RecordScreen.tsx:332)
- [録音中stop / cancelの独立表示](/Users/karasawatakahiro/Developer/native-minute/apps/mobile/src/screens/RecordScreen.tsx:578)
- [Scriptsの既存入力フォーム](/Users/karasawatakahiro/Developer/native-minute/apps/mobile/src/screens/ScriptsScreen.tsx:193)

**次の操作:** 実機が利用可能になるまでこの成果物を保管する。利用可能になったらPHASE 0から実機受入を開始する。今回の準備では先へ進まない。
