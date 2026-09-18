# iPhone 14 Plus formal acceptance 再開マッピング v2

**2026-09-18 Review→Listen→Back: HUMAN ACTUAL-DEVICE PASS / CLOSED。** 元のReview／same Takeへの復帰をHuman確認。PS-N-01とRV-06へ反映。既存Record Back・未保存退出・Favorite・Listen playback・P1/P2/P3/J/Gate5は保持。再試験不要。[closeout](listen-return-origin-focused-fix.md)。以下の待機記述は各時点の履歴であり、今回の再試験依頼ではない。

2026-09-18 latest: **Listen改善A–M HUMAN PASS / SERVER VERIFIED**。[closeout](listen-human-pass-closeout.md)。L-01/L-03/L-04/L-07のみ原58へ新規PASS。L-05は時間表示未確認、L-02/L-06/L-09/L-10は未確認小条件を保持。追加LP-01〜07はPASS（原58・既存PS30の外）。Dynamic Typeは「文字サイズを変えられなかった」理由未確定の未判定、VoiceOverもSession Cへ。P1/P2/P3/J/Gate5 CLOSEDと既存PSの17/0/3/10を再計算しない。

以下の2026-09-17再開計画・blocker・実装時記録は履歴。現在の集計と各行は2026-09-18結果を反映。

2026-09-17 Listen controls/return追記: [今回の差分・証拠・Human手順](listen-playback-controls-and-return.md)。19:53 canonical生成成功・19:56 server cache_hit、Humanは同じiPhoneの実再生のみ確認。準備blockerは解消したが、pause/resume・実機復帰・新UIは未確認。原58 ID/無関係なPASS/P3 A〜Kは保持。下記v1/v2集計は履歴。L-08/L-09の期待結果だけ今回要望で更新し、seek/速度等の追加要件は原58集計の外で管理。

2026-09-17追記: Session Bは[Listen voice readiness blocker](listen-voice-readiness-blocker.md)で停止。L-04/L-07と共有前提のL-05は音声準備に阻害され、再生assertionは未実施。以下の集計は再開計画時のsnapshotであり、今回finding後の実行集計ではない。新規ID・PASS追加なし。P1/P2/P3/J/Gate5 CLOSEDを維持。

MODE: `QSS_IPHONE14PLUS_FORMAL_ACCEPTANCE_RESUME_AFTER_P1_P3`
VERDICT: **LISTEN HUMAN ACCEPTED / SERVER VERIFIED / FORMAL ACCEPTANCE OPEN**。P1/P2/P3とGate5はCLOSED、UI/UX rebaseline COMPLETEのまま。

Baseline: `/Users/karasawatakahiro/Developer/native-minute` / `codex/g3-mobile-main-loop` / local・upstream・remote `910bfa46f63783966c50242b3ac6067dd4ce3f6b`。tracked clean / index emptyをpreflightで確認。今回の変更は本mapping/checklist文書のみ。

## 原本と判定規則

[回収原本](original-checklist-20260906.md)は2026-09-06の58 ID・目的・事前条件・操作・期待結果・証拠方法をそのまま保存。元の実行版は `/tmp/native-minute-qss-iphone14plus-device-acceptance-v1/CHECKLIST.md`。既存タスク「iPhone実機58項目受入を実施」から所在を回収し、両版のIDと原文5欄一致を確認した。Session A=1/B=40/C=9/D=7/E=1を保持。`original_purpose`は原expected resultをそのまま保持し、別目的へ書き換えていない。[機械可読の全欄](mapping.json)に原文/v2両方を収録。

- PASS: 同一build/source identity・同じiPhone14 Plus/Staging・同じ挙動・同じ試験目的・Human実観察が揃う。
- NOT YET RUN: 証拠未取得。単に未実施なだけでBLOCKEDにしない。必要データはsession前に一度確認し、欠けた小条件だけBLOCKEDへ移す。
- BLOCKED: 現時点で具体的な入口/条件/データ準備の障害がある。FAILは有効な実機試行で不一致を観察した場合のみ。
- 複合項目は一部PASSを記録しても全体をPASSへ一般化しない。未実施の小条件はNOT YET RUN、実施条件がない小条件はBLOCKED。一部FAILがあれば行全体FAIL。
- 既存実機PASSは直接影響がない限り保持。今回findingは0件だが、未検証の品質をP0/P1=0と認定しない。

## 同一buildの証拠

最初のA〜I/KとJ修正後ではbinaryが違うことを区別したうえで、Humanへ確認。**「J修正後のアプリでもA〜Kすべて確認した」**との回答を得た。最新Human authorityもJ resolved/recheck PASSと明示。以下のPASSはこのcurrent-build再観察へ紐づける。古いスクリーンショットやbrowser PASSだけでは転記していない。

J artifactは `com.nativeminutes.app.staging` 1.0(1)、iPhone14 Plus/iOS26.2.1、BFF `https://native-minute-staging.vercel.app`、Supabase ref `ztlliqishddrrvqqrrlu`。署名/上書きinstall記録とweb asset hashesあり。metadataは `af36179 + sourceDirty:true` のまま正直に保存され、変更製品入力のmanifestが910bfa4と全件一致した。commit SHAを同梱したclean-release binaryとは呼ばない。既知clean-source guardの3件はformal build identityの証拠と分離し、PASSへ改変しない。

元D-01のidentity/data削除不要という目的は成立。network route、通常/大文字設定、microphone permission、長文/複数台本条件は残り各試験の実行条件として一度だけ記録する。D-01 PASSで全58が実施可能/機能PASSとは主張しない。

証拠:
- E-BUILD: [artifact](../../outputs/qss-personal-space-p3/staging/j-native-artifact-proof.json)、[install](../../outputs/qss-personal-space-p3/staging/j-install-proof.json)、[source](../../outputs/qss-personal-space-p3/staging/j-source-manifest.json)、[P3 source](../../outputs/qss-personal-space-p3/staging/native-wip-source-manifest.json)。
- E-CURRENT-A〜K: 本taskの同一build再確認申告と元A〜K scenario。本人Takeの再生・metadata保持・Share/Files・cancel・Home復帰。
- E-FILTER: 最新依頼の「Humanが確認した Favorite filter」という明示申告。複数Take混在の除外までは広げない。
- E-SCREENSHOTS: IMG_2026/2027は補助。current-build再申告と合わせてのみ使用。
- E-BROWSER: local fixture/unit/44+148/8条件は補助証拠。実機PASSへ読み替えない。古いGate3・別buildのAuth proofも今回のPASSに使わない。

## 58の集計

**PASS 6 / FAIL 0 / BLOCKED 2 / NOT YET RUN 50**（今回RV-06のみ新規PASS。その他の判定は保持）。

| Session（原構成） | 件数 | PASS | FAIL | BLOCKED | NOT YET RUN |
| --- | ---: | ---: | ---: | ---: | ---: |
| A | 1 | 1 | 0 | 0 | 0 |
| B | 40 | 5 | 0 | 2 | 33 |
| C | 9 | 0 | 0 | 0 | 9 |
| D | 7 | 0 | 0 | 0 | 7 |
| E | 1 | 0 | 0 | 0 | 1 |

P3の機能証拠は主に追加criteriaへ一致する。Jのsaved Take playbackはL-04/L-07（お手本）やR-07（録音直後preview）とは別。My Takesの履歴はP-03/P-04（Progress history）とは別。Aは「既存または新規Take」なのでR-01〜10やH-01の新規loop全体を証明しない。

**S-05/S-07**は旧Scriptsの「録音する」secondaryを前提とし、承認済みP1で入口が除かれている。2件を別目的へ置換/自動PASS/FAILにせず適用判断待ちBLOCKED。ボタン復活・直リンク注入・再設計はしない。原目的を変えず残せる同等のHuman実行入口を既存authorityで確定するか、後続で明示的な項目適用判断が必要。この判断を58完了と偽装しない。

## 原58 IDごとのstatus・原目的・v2期待結果

同じ期待結果の行は原文維持。原事前条件と完全な手順はJSON/原本参照。Review→ProgressはHome経由へ更新するが、目的は同じ台本への到達のまま。

| ID / Session | original purpose（原期待結果そのまま） | expected version / current expected | status | evidence / 未充足理由 |
| --- | --- | --- | --- | --- |
| D-01 / A | 対象SHAのbuildで中心5画面を試せる。データ削除不要。対応不明・不足は保留 | v2: 試験対象build・実機・Staging・利用可能な本人台本/保存音声を対応づけられる。clean-release guardのPASSとは別。 | PASS | E-BUILD, E-CURRENT |
| S-01 / B | 台本title・locale・目標時間・抜粋・操作が読め、正常な一覧として表示される | v1 unchanged: 台本title・locale・目標時間・抜粋・操作が読め、正常な一覧として表示される | NOT YET RUN | このIDの原試験目的を満たすcurrent-buildのHuman観察は未記録。 |
| S-02 / B | titleが折返し、文字切れ・操作との重なり・横はみ出しがない | v1 unchanged: titleが折返し、文字切れ・操作との重なり・横はみ出しがない | NOT YET RUN | このIDの原試験目的を満たすcurrent-buildのHuman観察は未記録。 |
| S-03 / B | 全行が同等の選択肢として見え、別行の操作を誤認しない | v2: 全行が同等の選択肢として見え、別行の操作を誤認しない。旧2操作を要求しない。 | NOT YET RUN | このIDの原試験目的を満たすcurrent-buildのHuman観察は未記録。 |
| S-04 / B | Humanが「練習する」を通常開始として選べる | v1 unchanged: Humanが「練習する」を通常開始として選べる | NOT YET RUN | このIDの原試験目的を満たすcurrent-buildのHuman観察は未記録。 |
| S-05 / B | Listenを飛ばして録音へ進むsecondaryだと理解し、通常開始と混同しない | v1 retained / applicability blocked: 原目的（Listenを飛ばすsecondaryの意味理解）は保持。別目的に置換せず、適用方針のHuman判断までBLOCKED。 | BLOCKED | 承認済みP1のUI変更で旧入口なし。適用判断待ち。製品FAILではない。 |
| S-06 / B | AのListenへ移り、titleと本文が一致する | v1 unchanged: AのListenへ移り、titleと本文が一致する | NOT YET RUN | このIDの原試験目的を満たすcurrent-buildのHuman観察は未記録。 |
| S-07 / B | Listenを経由せずAのRecordへ移る。録音は自動開始しない | v1 retained / applicability blocked: 原目的（Listenを経由しない同じ台本のRecord遷移・手動開始）は保持。適用方針のHuman判断までBLOCKED。 | BLOCKED | 承認済みP1のUI変更で旧入口なし。適用判断待ち。製品FAILではない。 |
| L-01 / B | 全文を読め、途中でscroll不能にならない | v1 unchanged: 全文を読め、途中でscroll不能にならない | PASS | Human A–M: 通常文字で本文最終行までscrollでき、末尾まで読める。 |
| L-02 / B | 本文を戻さずbottom dockの該当操作へアクセスできる | v1 unchanged: 本文を戻さずbottom dockの該当操作へアクセスできる | NOT YET RUN | 再生操作自体はA–M PASS。本文上・中・下すべてでdock操作に届く条件は未確認。 |
| L-03 / B | 最終行がdockに隠れず、末尾まで読める | v1 unchanged: 最終行がdockに隠れず、末尾まで読める | PASS | Human M: 通常文字でdockが最終行を隠さない。 |
| L-04 / B | 実際の音が操作に応じて開始・停止し、二重再生しない | v1 unchanged: 実際の音が操作に応じて開始・停止し、二重再生しない | PASS | Human A–C/G/K–L: 実再生・pause・再開PASS。補足回答で二重再生なしも観察済み。 |
| L-05 / B | 実media時間に沿って進み、停止中は進み続けない。目標60秒を実音声長として誤表示しない | v1 unchanged: 実media時間に沿って進み、停止中は進み続けない。目標60秒を実音声長として誤表示しない | NOT YET RUN | 実再生・pause・位置付近から再開はPASS。時間表示の進行/停止、目標60秒と実音声長の区別は未観察のため未判定。 |
| L-06 / B | ready状態でCTAに常時アクセスでき、全文再生を強制されず同じ台本のRecordへ移る | v1 unchanged: ready状態でCTAに常時アクセスでき、全文再生を強制されず同じ台本のRecordへ移る | NOT YET RUN | 今回Recordへ進む操作は実施範囲外。各本文位置のCTA到達・全文再生不要・同一台本遷移が未確認。 |
| L-07 / B | speakerから対象音声を明瞭に聞ける | v1 unchanged: speakerから対象音声を明瞭に聞ける | PASS | Human補足回答: iPhone本体speakerで対象音声を明瞭に聞けた。 |
| L-08 / D | 選んだ出力先で聞け、切替後も操作可能・二重再生なし。非active化した場合の再準備は許容 | v3 changed: 出力先切替・二重再生なしの目的を保持。短時間の同一session復帰は再生1回で保存済み音声を取得して再開。通常の別ボタン再準備は不要。 | NOT YET RUN | このIDの原試験目的を満たすcurrent-buildのHuman観察は未記録。 |
| R-01 / B | 許可後は録音可能。拒否状態なら分かる案内を表示し無断録音しない。許可済みでpromptが出ないのは正常 | v1 unchanged: 許可後は録音可能。拒否状態なら分かる案内を表示し無断録音しない。許可済みでpromptが出ないのは正常 | NOT YET RUN | このIDの原試験目的を満たすcurrent-buildのHuman観察は未記録。 |
| R-02 / B | 1回の録音開始に対し録音中表示と経過時間が進む | v1 unchanged: 1回の録音開始に対し録音中表示と経過時間が進む | NOT YET RUN | このIDの原試験目的を満たすcurrent-buildのHuman観察は未記録。 |
| R-03 / B | 本文を読め、録音が意図せず止まったり最初から始まったりしない | v1 unchanged: 本文を読め、録音が意図せず止まったり最初から始まったりしない | NOT YET RUN | このIDの原試験目的を満たすcurrent-buildのHuman観察は未記録。 |
| R-04 / B | 停止はbottom dockに残り、本文を戻さず押せる。キャンセルもアクセス可能 | v1 unchanged: 停止はbottom dockに残り、本文を戻さず押せる。キャンセルもアクセス可能 | NOT YET RUN | このIDの原試験目的を満たすcurrent-buildのHuman観察は未記録。 |
| R-05 / B | 最終行が隠れず、読み終えて停止できる | v1 unchanged: 最終行が隠れず、読み終えて停止できる | NOT YET RUN | このIDの原試験目的を満たすcurrent-buildのHuman観察は未記録。 |
| R-06 / B | 録音が終了し、previewへ進む。timer停止とOS上の当該appのmicrophone使用終了を観察できる | v1 unchanged: 録音が終了し、previewへ進む。timer停止とOS上の当該appのmicrophone使用終了を観察できる | NOT YET RUN | このIDの原試験目的を満たすcurrent-buildのHuman観察は未記録。 |
| R-07 / B | 今録った自分の声が聞け、前のTakeとの取り違えや二重再生なし | v1 unchanged: 今録った自分の声が聞け、前のTakeとの取り違えや二重再生なし | NOT YET RUN | このIDの原試験目的を満たすcurrent-buildのHuman観察は未記録。 保存済みTakeの再生PASSを録音直後の未保存previewへ転用しない。 |
| R-08 / B | 未確認では評価不可。再生だけでは自動チェックされず、手動確認後に評価可能 | v1 unchanged: 未確認では評価不可。再生だけでは自動チェックされず、手動確認後に評価可能 | NOT YET RUN | このIDの原試験目的を満たすcurrent-buildのHuman観察は未記録。 |
| R-09 / B | 保存／評価中の状態が分かり、二重操作を促されない。正常応答なら完了する | v1 unchanged: 保存／評価中の状態が分かり、二重操作を促されない。正常応答なら完了する | NOT YET RUN | このIDの原試験目的を満たすcurrent-buildのHuman観察は未記録。 |
| R-10 / B | 同じ台本・今回のTakeのReviewへ移る。title・日時・録音の目印を照合できる | v2: 同じ台本・今回のTakeのReviewへ移り、title・日時・録音の目印を照合できる。録音名と台本名を混同しない。 | NOT YET RUN | このIDの原試験目的を満たすcurrent-buildのHuman観察は未記録。 |
| R-11 / B | 録り直しは新しい音声となり手動確認が外れる。retry分岐は同じ保持音声で再試行できる | v1 unchanged: 録り直しは新しい音声となり手動確認が外れる。retry分岐は同じ保持音声で再試行できる | NOT YET RUN | このIDの原試験目的を満たすcurrent-buildのHuman観察は未記録。 |
| R-12 / B | 短い録音と録り直し推奨の既存案内が出る。短いだけでDIGITAL_SILENCE扱いにならない | v1 unchanged: 短い録音と録り直し推奨の既存案内が出る。短いだけでDIGITAL_SILENCE扱いにならない | NOT YET RUN | このIDの原試験目的を満たすcurrent-buildのHuman観察は未記録。 |
| R-13 / D | LOW_SIGNALなら小さめ案内と手動確認gate。DIGITAL_SILENCEなら再録音案内で評価不可。観測した分類の既存挙動を保つ | v1 unchanged: LOW_SIGNALなら小さめ案内と手動確認gate。DIGITAL_SILENCEなら再録音案内で評価不可。観測した分類の既存挙動を保つ | NOT YET RUN | このIDの原試験目的を満たすcurrent-buildのHuman観察は未記録。 |
| RV-01 / B | focus words → advice →「次のTakeを録る」の順で理解できる | v2: focus words → advice →「次のTakeを録る」の順で練習内容を理解できる。identity見出しを増やしたこと自体をFAILにしない。 | NOT YET RUN | このIDの原試験目的を満たすcurrent-buildのHuman観察は未記録。 |
| RV-02 / B | scoreだけに注意が集まらず、次の練習内容と操作を説明できる | v1 unchanged: scoreだけに注意が集まらず、次の練習内容と操作を説明できる | NOT YET RUN | このIDの原試験目的を満たすcurrent-buildのHuman観察は未記録。 |
| RV-03 / B | 全文を読め、省略・文字切れ・重なりがない | v1 unchanged: 全文を読め、省略・文字切れ・重なりがない | NOT YET RUN | このIDの原試験目的を満たすcurrent-buildのHuman観察は未記録。 |
| RV-04 / B | 通常のscrollで補助説明なくCTAを見つけて押せる。到達の負担・迷いを記録する | v1 unchanged: 通常のscrollで補助説明なくCTAを見つけて押せる。到達の負担・迷いを記録する | NOT YET RUN | このIDの原試験目的を満たすcurrent-buildのHuman観察は未記録。 |
| RV-05 / B | 同じ台本のRecordへ移り、録音は手動開始できる | v1 unchanged: 同じ台本のRecordへ移り、録音は手動開始できる | NOT YET RUN | このIDの原試験目的を満たすcurrent-buildのHuman観察は未記録。 |
| RV-06 / B | 同じ台本のListenへ移る | v1 unchanged: 同じ台本のListenへ移る | PASS | 2026-09-18 Human actual-device PASS: Review → お手本を聞き直す → Listen → 戻る = 元のReview / same Take。13:37 JST上書きinstall済みStaging/iPhone14 Plus。 [closeout](listen-return-origin-focused-fix.md) |
| RV-07 / B | その台本のProgressへ移り、別台本と混同しない | v2: 同じ台本のProgressに到達して別台本と混同しない。現在は全体Progress内の同じ台本を照合し、台本filter自動適用とは主張しない。 | NOT YET RUN | このIDの原試験目的を満たすcurrent-buildのHuman観察は未記録。 |
| P-01 / B | nextStepが先に理解でき、score探索から始めなくてよい | v1 unchanged: nextStepが先に理解でき、score探索から始めなくてよい | NOT YET RUN | このIDの原試験目的を満たすcurrent-buildのHuman観察は未記録。 |
| P-02 / B | LatestとBestの意味を区別できる。同じTake注記がある場合は同一結果と分かる | v1 unchanged: LatestとBestの意味を区別できる。同じTake注記がある場合は同一結果と分かる | NOT YET RUN | このIDの原試験目的を満たすcurrent-buildのHuman観察は未記録。 |
| P-03 / B | 日時・score・Review操作が読め、任意の行を選べる | v1 unchanged: 日時・score・Review操作が読め、任意の行を選べる | NOT YET RUN | このIDの原試験目的を満たすcurrent-buildのHuman観察は未記録。 |
| P-04 / B | 選んだ台本・TakeのReviewに移り、日時等の目印が一致する | v1 unchanged: 選んだ台本・TakeのReviewに移り、日時等の目印が一致する | NOT YET RUN | このIDの原試験目的を満たすcurrent-buildのHuman観察は未記録。 JはMy Takes→Reviewであり、Progress history→Reviewの証拠ではない。 |
| P-05 / B | 同じ台本のRecordへ進み、操作先を誤認しない | v1 unchanged: 同じ台本のRecordへ進み、操作先を誤認しない | NOT YET RUN | このIDの原試験目的を満たすcurrent-buildのHuman観察は未記録。 |
| P-06 / B | latest nextStep全文が読め、文字切れ・省略・重なりなし | v1 unchanged: latest nextStep全文が読め、文字切れ・省略・重なりなし | NOT YET RUN | このIDの原試験目的を満たすcurrent-buildのHuman観察は未記録。 |
| P-07 / B | 補助説明なく通常scrollで見つけ、実用上無理なく押せる | v1 unchanged: 補助説明なく通常scrollで見つけ、実用上無理なく押せる | NOT YET RUN | このIDの原試験目的を満たすcurrent-buildのHuman観察は未記録。 |
| DT-S-01 / C | titleとbutton labelが折返し、横overflow・clipped text・重なりなし | v2: titleと現在のbutton labelが折返し、横overflow・clipped text・重なりなし。削除済み2つ目の操作は対象外。 | NOT YET RUN | このIDの原試験目的を満たすcurrent-buildのHuman観察は未記録。 |
| DT-L-01 / C | dock・最終行・button labelが読め、重なりなく操作可能 | v1 unchanged: dock・最終行・button labelが読め、重なりなく操作可能 | NOT YET RUN | 通常文字で本文末尾・dock非遮蔽はPASS。Human「文字サイズは変えられなかった」理由未確定。Dynamic TypeのPASS/FAILに変換せずSession Cに残す。 |
| DT-R-01 / C | 開始／停止／キャンセル／確認／評価の現在state操作へ到達でき、dock・最終行・折返しに破綻なし | v1 unchanged: 開始／停止／キャンセル／確認／評価の現在state操作へ到達でき、dock・最終行・折返しに破綻なし | NOT YET RUN | このIDの原試験目的を満たすcurrent-buildのHuman観察は未記録。 |
| DT-RV-01 / C | clipped text・横overflow・重なりなし。大きい文字でもCTAを自力で発見・操作できる | v1 unchanged: clipped text・横overflow・重なりなし。大きい文字でもCTAを自力で発見・操作できる | NOT YET RUN | このIDの原試験目的を満たすcurrent-buildのHuman観察は未記録。 |
| DT-P-01 / C | 全文とlabelが読め、CTAとhistoryを自力で発見・操作できる | v1 unchanged: 全文とlabelが読め、CTAとhistoryを自力で発見・操作できる | NOT YET RUN | このIDの原試験目的を満たすcurrent-buildのHuman観察は未記録。 |
| VO-NAV-01 / C | headingと画面の意味が分かるlabelを読み上げ、順序・focusが自然。非表示要素への迷入や操作不能なし | v2: 各画面のheading・現在のprimary/secondaryの意味と順序が分かり、非表示tabへの迷入や操作不能なし。Home/My Takesの追加分はPS-X-01へ同一証拠参照。 | NOT YET RUN | このIDの原試験目的を満たすcurrent-buildのHuman観察は未記録。 |
| VO-REC-01 / C | 「録音中」・「停止」が理解でき、timerが操作を妨げず、停止と手動確認を実行できる | v1 unchanged: 「録音中」・「停止」が理解でき、timerが操作を妨げず、停止と手動確認を実行できる | NOT YET RUN | このIDの原試験目的を満たすcurrent-buildのHuman観察は未記録。 |
| VO-DATA-01 / C | 各語・score・history行の意味と順序が分かり、選んだReviewへ移れる | v2: 原期待どおり語・score・historyの意味と順序を理解し、選択したReviewへ移れる。My Takesだけでは代用しない。 | NOT YET RUN | このIDの原試験目的を満たすcurrent-buildのHuman観察は未記録。 |
| VP-01 / C | Home indicatorとdock操作が衝突せず、keyboard後の回復と短いviewportで主要操作・本文末尾を使える | v2: Home indicatorと操作が衝突せず、keyboard後の回復と短いviewportで主要操作・本文末尾を使える。新しいUIの配置だけを反映し、視覚再監査はしない。 | NOT YET RUN | このIDの原試験目的を満たすcurrent-buildのHuman観察は未記録。 |
| L-09 / D | backgroundで音声を解放・停止し、復帰後は必要な再準備へ戻る。連続再生や元の秒数からの自動再開を必須にしない | v3 changed: backgroundで停止・解放し、foregroundだけでは自動再生しない。15分以内の同一session復帰は再生1回で保存済み音声を取得し位置/速度を戻す。 | NOT YET RUN | Human H–L: 別アプリ→15分以内復帰、自動再生なし、再生1回で位置付近/0.85倍復元PASS。background中の音声停止自体は明示観察なし。内部media解放はlocal test補助証拠のみ。原複合項目全体は未判定。 |
| L-10 / D | 操作不能・二重再生・意図しない自動再生なし。同じ台本を確認して練習へ戻れる | v1 unchanged: 操作不能・二重再生・意図しない自動再生なし。同じ台本を確認して練習へ戻れる | NOT YET RUN | 復帰時の自動再生なし・再生1回・二重再生なしはPASS。復帰後のpause/Record導線の未確認分だけ残す。 |
| R-OFFLINE-01 / D | 録音中・stop・cancel・scroll・dock・最終行を維持し、実停止できる。自動送信・評価・再録音開始なし | v1 unchanged: 録音中・stop・cancel・scroll・dock・最終行を維持し、実停止できる。自動送信・評価・再録音開始なし | NOT YET RUN | このIDの原試験目的を満たすcurrent-buildのHuman観察は未記録。 |
| R-INT-01 / D | 既存仕様どおり録音中Takeをcancel・破棄しmicrophoneを解放。自動再開・自動送信なし。復帰後の手動録音が可能 | v1 unchanged: 既存仕様どおり録音中Takeをcancel・破棄しmicrophoneを解放。自動再開・自動送信なし。復帰後の手動録音が可能 | NOT YET RUN | このIDの原試験目的を満たすcurrent-buildのHuman観察は未記録。 |
| R-INT-02 / D | appが非activeになったり音声入力を失った場合はcancel／errorとして終了し、意図しない継続・送信なし。回復して手動録音できる | v1 unchanged: appが非activeになったり音声入力を失った場合はcancel／errorとして終了し、意図しない継続・送信なし。回復して手動録音できる | NOT YET RUN | このIDの原試験目的を満たすcurrent-buildのHuman観察は未記録。 |
| H-01 / E | 同じ1分を繰り返す中心loopが完走し、下の6問に具体的に答えられる。重大な操作迷子・dock操作不能なし | v2: 同じ1分を繰り返すloopを完走し、原6問へ具体的に答えられる。「不要なdashboard感」は練習中の集中を問う。承認済みHome自体を再設計/再審査しない。 | NOT YET RUN | このIDの原試験目的を満たすcurrent-buildのHuman観察は未記録。 A–Kは既存Takeから開始可能で、新規録音/評価/次のTakeと原6問は保証しない。 |

## UI変更のある手順だけversion update

- **D-01 (v2)**: 起動先はHome。iPhone14 Plusの既存Staging appを対象とし、build metadataのaf36179＋WIPを、署名済みJ artifactのsource/asset manifestで910bfa4の製品sourceへ対応づける。version 1.0(1)だけで判定しない。
- **S-03 (v2)**: 一覧を縦scrollし、各行のtitleと現在の1つの「練習する →」を確認。
- **S-05 (v1 retained / applicability blocked)**: 旧「録音する」は承認済みScriptsから除去済み。Humanに存在しない操作を探させない。
- **S-07 (v1 retained / applicability blocked)**: 旧Scripts→Record直行のUI入口はない。内部routeだけをnative入口とみなさない。
- **R-10 (v2)**: 評価後の「結果」画面で今回のTake・日時・台本を照合。録音名ありなら見出しは録音名、その下が台本名。
- **RV-01 (v2)**: 小さな「結果」ラベルと録音名／台本名の下で、最初に目に入る練習内容と次に直す点を尋ねる。
- **RV-07 (v2)**: Reviewの「練習を終了（Home）」→下部「成長」→同じ台本のsectionを探す。旧「成長を見る」ボタンは探さない。
- **DT-S-01 (v2)**: 通常N/大きいLで一覧を読み、各行の現在の「練習する →」へ到達する。
- **VO-NAV-01 (v2)**: 原5画面をVoiceOverで巡回。Home/台本/成長は非練習画面だけ、Listen/Record/Reviewは「← 戻る」「練習を終了（Home）」を使う。
- **VO-DATA-01 (v2)**: 結果画面の録音名／台本名を区別し、focus words→advice→CTA、score、Progress history行へfocusして選ぶ。
- **VP-01 (v2)**: 元の縦/横/keyboard/N/L手順を保持。practice中のtop Back/Exit、bottom dock、非練習画面の下部navがsafe areaと干渉しないか見る。
- **H-01 (v2)**: Homeから「台本」へ入ってもよい。原主loopを補助説明なしで完走し、原6問へ回答。

## P1–P3追加criteria（原58のIDとは別namespace）

**30 criteria: PASS 18 / FAIL 0 / BLOCKED 3 / NOT YET RUN 9**。同じ操作を二度要求せず、原58と重なる観察は同じsession記録へ参照。original58の58という件数は変えない。wrong-ownerはFavorite/Rename/audio共通のPS-F-02に一本化。

| ID | purpose / expected | status | evidence / 実行session・不足条件 |
| --- | --- | --- | --- |
| PS-H-01 | Home first-use: 保存済みTakeなしの本人accountでfirst-use案内と開始導線が成立。既存data削除で作らない。 | BLOCKED | Session A。同じbuildの未練習account条件が未確保。準備できるまで既存ユーザーに操作させない。 |
| PS-H-02 | Home populated: 保存済み録音があるHomeから本人の録音に到達できる。 | PASS | E-CURRENT-K。 |
| PS-H-03 | Home actual data: 録音名/Favorite/Take previewが本人の保存データと一致。 | PASS | E-CURRENT-D, E-CURRENT-K。 |
| PS-H-04 | Home failure state: offline/取得失敗を空データ・0件と見せず、復旧後に正常表示へ戻れる。 | NOT YET RUN | Session D。 |
| PS-N-01 | Back: Listen→開始元（Reviewから来た場合は元のReview／same Take）。Record→同じListen／元のReview・same Take／元のProgress context。invalid/staleはListenなら既存safe origin、Recordなら同じListenへfallback。Review/My Takesの既存Backを保持。 | PASS | v4: Human actual-device PASS / CLOSED。2026-09-18 Human actual-device PASS: Review → お手本を聞き直す → Listen → 戻る = 元のReview / same Take。13:37 JST上書きinstall済みStaging/iPhone14 Plus。 Review→Record→Back、Progress→Record→Back、通常Listen→Record→Backの既存PASSを保持。自動検証122 tests/50 browser条件を再利用し再試験なし。 [closeout](listen-return-origin-focused-fix.md) |
| PS-N-02 | Review Exit Home: 「練習を終了（Home）」でHomeへ戻る。 | PASS | E-CURRENT-K。 |
| PS-N-03 | Listen / Record Exit Home: Listenと未録音Recordで明示ExitがHomeへ戻る。 | NOT YET RUN | Session B。既にPASSのReview Exitは繰返さない。 |
| PS-N-04 | 未保存録音の保護: Back/Exitで未保存破棄確認。cancelなら同じ録音を保持し、明示破棄時だけ離脱する。 | NOT YET RUN | Session B。R-11/R-12の短い試行を共用。新たな評価は不要。 |
| PS-N-05 | focused practice: Listen/Record/Reviewでは下部Home/台本/成長tabが隠れ、非練習画面に戻ると復帰。 | NOT YET RUN | Session B。VO-NAV-01/VP-01と同じ巡回で証拠取得。 |
| PS-N-06 | My Takes exact return: 録音履歴から選んだ同じTakeの結果を開き、再生/共有できる。 | PASS | E-CURRENT-J。P-04はProgress内historyなので別IDのまま。 |
| PS-C-01 | Rename persistence: 本人Takeの名前を保存し、画面移動・再読込後も保持。 | PASS | E-CURRENT-C, E-CURRENT-D。 |
| PS-C-02 | Favorite persistence: 本人TakeのFavoriteを保存し、画面移動・再読込後も保持。 | PASS | E-CURRENT-C, E-CURRENT-D。 |
| PS-C-03 | correct Take: 名前/Favoriteが操作した本人Takeへ適用され、再オープンするTakeも一致。 | PASS | E-CURRENT-C, E-CURRENT-D, E-CURRENT-J。他Takeへの非波及とwrong-owner拒否はこのPASSへ含めない。 |
| PS-C-04 | Home / My Takes synchronization: 同じTakeの名前/FavoriteがHomeとMy Takesで一致。 | PASS | E-CURRENT-D, E-CURRENT-J, E-CURRENT-K。 |
| PS-C-05 | Favorite filter basic: お気に入りfilterを選び、本人のお気に入りを開ける。 | PASS | E-FILTER。最新依頼の実機確認済みというHuman申告を採用。複数Take混在の除外判定はC-06。 |
| PS-C-06 | 複数Takeの非波及・filter exclusion: 通常loopで作る非Favoriteの別Takeがfilterから除外され、以前の名前/Favoriteは不変。 | NOT YET RUN | Session B。Session B/Eで生じた新Takeを共用。試験だけの追加録音を要求しない。wrong-ownerはPS-F-02へ一本化。 |
| PS-D-01 | Saved Take playback: 1回の再生操作で読込後に本人の実音声が再生される。 | PASS | E-CURRENT-B, E-CURRENT-J。 |
| PS-D-02 | Saved Take retry/error: 音声取得/再生失敗時に安全な案内があり、復旧後の明示retryで同じTakeを再生できる。 | BLOCKED | Session D。実機の有効な取得失敗条件未確保。offlineでdisabledだけなら部分証拠。自然発生時のみ直接retryを記録し、BFF障害を作らない。 |
| PS-D-03 | recording name + Script title: 命名済みTakeで録音名と元の台本名を区別し、同じ結果を特定できる。 | PASS | E-CURRENT-C, E-CURRENT-J, E-SCREENSHOTS。長い実テンプレートtitleの折返しはTD-01へ持越し。 |
| PS-E-01 | Share Sheet: 独立した共有操作でiOS Share Sheetが開く。 | PASS | E-CURRENT-E, E-CURRENT-J。 |
| PS-E-02 | Save to Files: 「ファイルに保存」で音声ファイルをFilesへ保存できる。 | PASS | E-CURRENT-F。 |
| PS-E-03 | external playback: Filesアプリでexportした音声が実際に再生できる。 | PASS | E-CURRENT-G。 |
| PS-E-04 | cancel: Shareをキャンセルして操作可能な状態へ復帰。 | PASS | E-CURRENT-I, E-CURRENT-J。 |
| PS-E-05 | return to same Take: Files/Share Sheetから元の同じTakeの結果へ戻る。 | PASS | E-CURRENT-H, E-CURRENT-J。 |
| PS-E-06 | state unchanged / distinct controls: 再生/共有が別操作に見え、player展開で共有が突然現れず、Take/名前/Favorite/score/Best不変。 | PASS | E-CURRENT-H, E-CURRENT-J。 |
| PS-F-01 | logout boundary: ログアウトで旧Takeの音声/Share状態が利用不能になり、再起動で旧画面・音声を復元しない。 | NOT YET RUN | Session D。P3ローカル状態のみ。Gate5再監査ではない。再ログイン手段を確認後、session最終に一度実施。 |
| PS-F-02 | account switch / wrong owner: 既存テストaccount BからAのTake/audio/metadataへアクセス不可。切替後に旧音声・名前・Favoriteが露出せず、対象外データ不変。 | BLOCKED | Session A。管理可能な既存A/B accountとexact対象・復帰手段が未確保。Codex準備を伴う限定試験。Humanへtoken/URLコピーを要求しない。PS-Cのwrong-ownerもこの1件。 |
| PS-F-03 | no public recording URL: 現在BFFのowned binary契約・認証拒否・private responseを検証し、画面/exportにpublic recording URLを出さない。 | NOT YET RUN | Session A。Codex担当。現行code＋過去Staging smokeは補助証拠。Humanに再共有・API調査を要求しない。 |
| PS-F-04 | temp file lifecycle: native share用一時fileが完了/cancel後に残存せず、同時共有/遷移/logoutで旧fileを再利用しない。 | NOT YET RUN | Session A。Codex担当の限定device/cache evidence。既存J後の状態をまず観察し、必要部分だけ追加準備。ブラウザfakeのcleanupを実機PASSにしない。 |
| PS-X-01 | new surfaces accessibility: Home/My Takesの名前/filter、Reviewの再生/共有が大きい文字でも読め、VoiceOverで識別・操作・復帰できる。 | NOT YET RUN | Session C。原DT/VO/VPの同一設定・巡回で取得。通常文字/VoiceOver OFFのJをやり直す試験ではない。 |

## template-dependent deferred（原58とは別の内容確定条件）

以下6件はすべて **BLOCKED / TEMPLATE_DEPENDENT**。正式template/catalog未確定。placeholderだけで最終PASSにしない。原58の実機構造・操作試験は既存の有効なデータで進められる範囲を進め、証拠にはsample/current dataと明記する。

| ID | 後続で確認する内容 | 原58との関係 |
| --- | --- | --- |
| TD-01 | long real titles | S-02/DT-S-01、PS-D-03の最終実content。元の折返し目的は保持。 |
| TD-02 | long real script bodies | L-01/L-03/R-03/R-05/DT-L-01/DT-R-01/VP-01の実content再確認。 |
| TD-03 | attribution/source presentation | 既存58にexact項目なし。正式template出典表示待ち。 |
| TD-04 | large catalog count | S-03は現行の複数台本選択を確認可能。大量catalog・100本は別の後続条件。 |
| TD-05 | search/filter performance | PS-C-05のFavorite機能PASSと、将来の大量catalog検索/絞込み性能を混同しない。 |
| TD-06 | final content density | S/Review/Progressの最終内容密度。現行sampleで最終template acceptanceを宣言しない。 |

長い保存済みcoach advice/nextStep（RV-03/04、P-06/07、DT-RV/P）はtemplate本文と別のdata条件。無い場合だけ当該小条件をBLOCKEDにし、長文を得るため評価を反復したり保存結果を書き換えたりしない。本文差替えに無関係なrecord/share/navigation証拠は保持可能。新templateで直接影響する内容表示だけ再確認する。

## 実行とSTOP

次に行うのは[統合Humanチェックリスト](human-checklist.md)の未確認部分だけ。Session A〜Eの所属を維持し、BとEの通常loopは同じ1回の証拠を使う。既にPASSのP3操作の再実行を要求しない。条件不足の試験は別の1項目ずつのチャット往復にせず、最後にまとめて報告。

2026-09-17初回mapping作成時はdocs-onlyでSTOP。2026-09-18の検証・配送は[closeout](listen-human-pass-closeout.md)参照。58正式acceptanceはOPEN、P1/P2/P3/Gate5はCLOSEDのまま。

FAIL時はexact再現・画面・期待/実際・証拠・影響を記録し、そのfindingだけsmall fix→直接回帰→該当ID再確認。無関係なPASSを全解除しない。NEXT_ONE_ACTION: 統合チェックリストの未確認実機項目を一続きでHumanが実施し、session単位の結果をまとめて返す。

## Listen追加criteria — 2026-09-18

| ID | 実機/サーバー判定 | status |
| --- | --- | --- |
| LP-01 | 10秒戻る/進むを実機操作 | PASS |
| LP-02 | 0.85倍へ変更し実際に遅く再生 | PASS |
| LP-03 | 15分以内の復帰で自動再生しない | PASS |
| LP-04 | 再生1回で以前の位置付近から再開 | PASS |
| LP-05 | 復帰後も0.85倍を保持 | PASS |
| LP-06 | 今回セッションに対応するcanonical/cache維持、追加provider生成/create intentなし | PASS |
| LP-07 | 通常文字で本文末尾がdockに隠れず読める | PASS |

L-09は短時間復帰UXの追加criteriaをすべて満たすが、background中の音声停止をHumanが明示観察したとは補わない。L-10のRecord導線等も自動PASSにしない。原58では部分証拠を保持し、Listen改善枝のacceptanceと区別する。既存PS30は17 PASS / 0 FAIL / 3 BLOCKED / 10 NOT YET RUNのまま。
