# iPhone 14 Plus — 未確認項目だけの統合チェックリスト

**2026-09-18 Dynamic Type HUMAN ACTUAL-DEVICE PASS / CLOSED。** 原DT5件PASS、PS-X-01はDynamic Type部分PASS・全体NOT YET RUN。Stage B/Gate5/P1/P2/P3/J保持。VoiceOver/viewport未確認、Session D未開始。今回それらの操作は開始しない。[closeout・最新集計・証拠](dynamic-type-global-focused-fix.md)。NEXT_ONE_ACTION: Human VoiceOver actual-device acceptance. 以下の待機/FAIL記述は各時点の履歴。

**2026-09-18 最新: Stage B全体とProgress A/BはHUMAN ACTUAL-DEVICE PASS / CLOSED。追加のUI再確認不要。** [closeout](../qss-app-wide-rebaseline-closeout.md)。次は原58＋承認済み追加条件の未確認分だけ。今回その実機操作は開始しない。Dynamic Type/VoiceOver/template/Gate8は残件。以下のStage B一周・A/B待ち記述は履歴。

**2026-09-18 Home Favorite→Review→Back: HUMAN ACTUAL-DEVICE PASS / CLOSED。** 戻り先Homeを実機確認。PS-N-01へ証拠追加、他の判定・件数は変更なし。既存CLOSED／PASSは保持。今回の再確認は完了、追加試験なし。[closeout](home-favorite-review-return-focused-fix.md)。以下の待機記述は履歴。

**2026-09-18 Review→Listen→Back: HUMAN ACTUAL-DEVICE PASS / CLOSED。** 元のReview／same Takeへの復帰をHuman確認。PS-N-01とRV-06へ反映。既存Record Back・未保存退出・Favorite・Listen playback・P1/P2/P3/J/Gate5は保持。再試験不要。[closeout](listen-return-origin-focused-fix.md)。以下の待機記述は各時点の履歴であり、今回の再試験依頼ではない。

今回のHuman操作は完了。残りの受入手順・Progress再確認は今回開始しない。

対象はListen更新を2026-09-17にinstall済みの **Native Minute Staging**（iPhone14 Plus）。`910bfa46 + accepted known WIP` と署名artifact/source manifestを対応づけ済み。2026-09-18 Human Listen A〜M PASS＋二重再生なし・本体speaker明瞭を受理。P3 A〜Kの既存証拠も保持。再install不要。

**既に完了した操作は再実施しない:** saved Takeの1タップ再生、名前/Favoriteの保存と再読込保持、My Takesから同じ録音を開く、基本Favorite filter、Homeへの反映、通常状態のShare Sheet・Files保存/外部再生・cancel・同じ結果へ戻る、Reviewの「練習を終了（Home）」。

原58のID・Session A〜Eは変更しない。詳細な各IDの原目的・期待結果・statusは [mapping.md](mapping.md)、全手順は [原本](original-checklist-20260906.md)。本書のまとまった操作から同じ証拠を複数IDへ参照し、項目ごとのチャット往復はしない。

## 記録方法と実施前の一括メモ

各session終了時に結果をまとめる。実行して期待結果を確認できたIDだけPASS。未実施はNOT YET RUN、必要なデータ/機器/条件が無ければBLOCKED、実際の不一致はFAIL。複合項目の未確認分岐をPASSへ広げない。

一度だけ記入: 日時／Wi-Fi・cellular／speaker・Bluetooth機器の有無／文字サイズN・大きいL／画面方向／VoiceOver状態／マイク許可の開始状態。Raw token、秘密URL、録音ファイルの提出は不要。

既存データから選ぶ: **A＝主loopの台本、B＝長いtitle/scrollする本文、C＝長い保存済みadvice/長いlatest nextStep**。AとBは同じでもよい。CはReviewの長文とProgressのlatestを別々に照合する。無いデータを作るため既存台本/結果を編集・削除したり、評価を繰り返したりしない。無い条件のIDは理由付きBLOCKEDにする。複数台本があるかも一度記録する。

スクリーンショットは切れ・重なり、短い動画/時刻付き観察は遷移・停止・復帰の証拠に使う。実音声・マイク使用終了・意味理解はHumanの観察文を添える。端末の画面収録が音声試験に干渉するなら観察メモ/外部撮影でよい。

## Session A — 端末・build（原D-01はPASS、再install不要）

D-01はartifact/source/install照合＋current-buildのHuman確認で充足済み。新しいbuild、再install、データclearをしない。上の実行条件だけ一度記録し、同じStagingアプリを使う。別アプリ/別buildになっていることが分かった場合だけ以降を保留する。

PS-H-01（first-use）、PS-F-02（account B/wrong owner）は既存テストaccount条件が未確保なので今回は操作しない。PS-F-03（no public URL）とPS-F-04（native temp lifecycle）はCodexの限定証拠回収待ちであり、HumanへAPI調査や再Shareを依頼しない。

## Session BとE — 普段の1回を共用する

原所属はB=40件、E=H-01のまま。**今回までのListen/P3実機証拠を先に再利用し、未確認の録音→評価→助言→次の録音を1回行ってB/Eへ共用する。** お手本の再生機能・seek・速度・短時間復帰・本文末尾は再試験不要。H-01の一続きの体験はまだ未確認であり、既に操作を熟知していることを明記する。 普通の約1分録音・評価をB用/E用に二度繰り返す必要はない。

### 最初に、詳しい操作案内を見ずに行う部分（S-04 / H-01）

- 「台本」一覧を見て、通常の練習を始める操作を自分の言葉で答える。既に画面を熟知していることも記録する（初見テストと偽らない）。
- 今回確認済みのお手本から **実録音→preview確認→評価→結果の助言→次の録音** へ自力で進める。お手本の再生試験を最初から繰り返す必要はない。最後の録音も自分で開始・停止する。最後の短いTakeは追加評価しなくてよい。
- 終了後、原H-01の6問へ一度に答える: ①画面/状態が分かったか ②次の操作が分かったか ③同じ1分を繰り返す感覚が自然か ④練習中に不要なdashboard感がないか ⑤Quiet Speaking Studioとして一貫しているか ⑥重大な操作迷子がないか。具体的に迷った操作を添える。承認済みHomeの再設計レビューにはしない。

### 同じ1回で観察できたものに印を付け、不足した部分だけ補う

1. **Scripts（S-01〜04、S-06）**: title・locale・目標時間・抜粋が読める。既存の長いtitleは折り返し、重なり/横はみ出しなし。複数行は別台本の「練習する →」と取り違えない。押すと選んだ台本のListenになり、title/本文が一致。**旧「録音する」を探すS-05/S-07は行わない**（承認済みUIから削除済み・適用判断待ち）。
2. **Listenの残りだけ（L-02/L-05/L-06）**: 本文上/中/下それぞれでdock操作に届くかを見る。次の録音へ進む前の短い再生/pause中に、時間表示が進む/止まる・実音声長と目標60秒が別であることだけ観察する。「録音へ進む」が各位置で届き、全文再生を強制されず同じ台本のRecordへ進むことを確認する。L-01/L-03/L-04/L-07、±10秒、0.85倍、短時間復帰は再試験しない。L-10の残りのpause/Record導線はこの操作が既存の復帰直後の状態を引き継ぐ場合のみ共用でき、別の復帰をB/Eのために作らない。
3. **Record通常（R-01〜10）**: 許可済み/未決定等の開始状態を記録。録音中のtimer、本文scroll、常時届く停止/cancel、最終行を確認。停止1回でtimerとactive microphone使用が終わる（OSの直近使用表示と区別）。今録った声をpreviewで再生/一時停止し、古いTakeと取り違えない。未チェックでは評価不可、再生だけでチェックされず「録音を確認した」を手動選択後に評価可能。評価中の案内→同じ台本/今回Takeの結果・日時を確認する。未観測のpermission分岐をPASSにしない。permission reset/uninstallはしない。
4. **短い試行を共用（R-11/R-12、PS-N-04）**: 最後の未保存Takeで「← 戻る」/「練習を終了（Home）」を押した際の破棄確認を確認し、まずキャンセルして同じpreviewが残ることを見る。「録り直す」で5〜10秒の普通の声を録音・停止。新音声になり手動確認が外れ、短い録音の案内が出ることを確認。短いだけでDIGITAL_SILENCE扱いにならない。最後に明示的に破棄して離れる。評価errorが自然発生した場合だけ、同じ保持音声のretryも観察する。error未発生分岐はBLOCKEDとして残す。
5. **Review（RV-01〜07）**: 録音名/台本名の下で、何を直すか・次に何をするかを自分の言葉で説明。scoreだけに注意が集まらないか記録する。既存の長いadviceがあれば全文→「次のTakeを録る」への到達を確認し、秒/swipe/迷いを記録。押した先は同じ台本のRecord（勝手に録音しない）。元の結果を開き直し「お手本を聞き直す」→同じListenを確認。Progressへの現在の道は **「練習を終了（Home）」→下部「成長」→同じ台本のsection**。ここでは未確認のProgress到達だけを記録し、既にPASSのHome復帰を別試験として繰り返さない。
6. **Progress（P-01〜07）**: 「次の練習では」から次に行うことを説明。Latest/Bestのscore・日時・同一Take注記の意味を確認。**Progress内のTake history**の行を読んで1行を開き、同じ台本/Takeの結果へ移ることを確認。My TakesのJとは別入口。戻って「もう一度練習する」→同じRecord。長いlatest nextStepがあれば全文/CTA到達、秒/swipe/迷いを記録。無い長文条件はBLOCKED。
7. **追加Navigation（PS-N-01/03/05）**: この巡回中の「← 戻る」を記録する。Listen→開始元、Record→同じListen、Review→同じRecord、My Takes→保持した戻り先。Listenと未録音Recordからの「練習を終了（Home）」だけ未確認なので各1回確認。practice3画面では下部tabが隠れ、Home等に戻ると復帰することを同じ巡回で観察。Review Exitの再試験は不要。
8. **新Takeとの比較だけ（PS-C-06）**: 今回の通常loopで保存した非Favoriteの新Takeと、既存の命名済みFavoriteを比較。基本filter操作は既にPASSなので、今回は「新しい非Favoriteが除外される」「以前の名前/Favoriteが変わっていない」という未確認部分だけを見る。新たな名前変更/Favorite保存/Share/Files試験はしない。

R-11のerror retry、R-01の未観測permission分岐、長文/複数台本など未充足条件は、完了した小条件の証拠を保持して別記する。これを理由に通常の1分loopを最初からやり直さない。

## Session C — 文字・VoiceOver・viewportを一度の設定変更で

対象: **DT-S/L/R/RV/P-01、VO-NAV/REC/DATA-01、VP-01、PS-X-01**。通常文字NのListen本文末尾PASSを再利用。Humanは「文字サイズは変えられなかった」と報告したが理由未確定で、Dynamic TypeはPASS/FAILのどちらにも変換しない。VoiceOverも未判定。

1. iPhoneの設定で大きい文字Lへ変更し、使った設定位置を記録。Scripts→Listen→Record→Review→Progressを巡回する。title/label/全文、dock・最終行、CTA/historyに届くか、横はみ出し・clipped text・重なりを見る。Recordは短い録音/停止/preview/手動確認まででよく、再評価不要。Review/Progressの長文CTAは到達の負担も記録。設定を変えても文字が変化しなかった場合も、その事実を記録する。
2. 同じ大きい文字でHome/My Takesの録音名・filterと、Reviewの再生/共有を確認（PS-X-01）。これは文字設定の未確認条件であり、通常状態のJを再試験するものではない。
3. VoiceOverをONにして5画面のheading/主要操作へ順にfocusし、読み上げたlabel・順序を記録。practice内に隠したtabへfocusが迷わないことを確認。Recordを短く開始→状態を聞く→停止→手動確認まで行い、timerの読み上げが停止を妨げないかを見る。Reviewの語/advice/scoreとProgress historyを読み、1行を開く。Home/My Takes/filter/再生/共有も別操作として識別・操作できるか見る。VoiceOverでは1回tapで選択、double-tapで実行、scrollは3本指。
4. VoiceOverをOFFにし、VP-01: Listen readyとRecord before/recording/afterのHome indicatorとdockを確認。「台本」→「台本を作る」で空のtitle/本文へfocusしてkeyboardを出し、欄が見える/scroll/keyboardを閉じる/「フォームを閉じる」を確認。**保存は押さない**。Listen/Recordへ戻ってviewport回復を確認。横向きが許可される場合だけ低い高さでも見る。向き固定や未再現の短いviewportは理由付きBLOCKED。N/L・向き・keyboardの条件を分けて記録。
5. 通常文字N・元の端末設定へ戻す。CSSの模擬200%証拠をiOS実設定の代わりにしない。

## Session D — 音声経路・offline・割り込み

対象: **L-08〜10、R-13、R-OFFLINE-01、R-INT-01/02**。条件を準備できないものはBLOCKEDとして飛ばし、1項目ずつ相談しない。

1. **Bluetooth（L-08）**: 機器があればお手本をspeaker→Bluetooth→speakerで聞き、出力先・二重再生・再操作可否を記録。機器がなければBLOCKED。
2. **Listenの残り（L-09/10）**: 2026-09-18の短時間復帰・自動再生なし・1回play・位置/0.85倍保持を再利用。原L-09ではbackground中に音が止まる観察、L-10では復帰後pause/Record導線だけ未確認。Session Dの他の音声観察に合わせて不足分だけ回収し、A〜Mを丸ごと再実行しない。
3. **Record background（R-INT-01）**: 短い別録音中にbackgroundへ移して戻る。Takeがcancel/破棄され、microphoneが解放され、自動録音/送信なし。手動の新録音/停止ができるか記録。
4. **実audio interruption（R-INT-02）**: 試験者が制御できる通常の割り込みがある場合だけ種類と影響を記録。入力喪失/非active時はcancel/errorで終了し、無断継続/送信せず、手動復帰できるか確認。通知が見えただけでは実audio interruptionのPASSにしない。緊急通話や他者への連絡は不要。
5. **foreground offline（R-OFFLINE-01）**: 事前にcellular fallbackを止め、許可された専用Wi-Fi等を外側から切断できる場合だけ実施。台本を読込んで録音開始→appをforegroundのまま切断→appのoffline表示と録音継続→本文上/中/末尾でstop/cancel/dock→offlineのまま停止→timerとactive microphone終了を確認。offlineで新規録音/自動送信/評価なし。再接続後10秒ほど自動録音/送信/評価がないことを見る。120秒上限に達する前に終える。**Control Center/設定へ移った試行はbackground条件であり、このIDへ流用しない。** appがofflineを認識しない試行もBLOCKED。安全な外側切断条件が無ければ実施しない。
6. **追加failure観察（PS-H-04 / PS-D-02）**: 同じoffline機会にHomeが失敗を0件と表示せず、再接続後に戻ることを確認。saved audioの取得errorが自然発生した場合だけ、復旧後の明示retryで同じTakeを再生できるか記録する。単にofflineでボタンがdisabledだっただけならPS-D-02全体をPASSにしない。Staging障害は作らない。
7. **小声/静かな試行（R-13）**: できる場合だけ短く録音し「録音の詳細」の実際の分類を記録。LOW_SIGNALなら小さめ案内＋手動確認、DIGITAL_SILENCEなら再録音案内＋評価不可。普通の静かな録音をDIGITAL_SILENCEと決めつけず、現れなかった分類はBLOCKEDに残す。
8. **最後だけlogout（PS-F-01）**: 全観察終了後、Stagingへ戻れる通常のログイン手段を確認できる場合だけ「設定」→「ログアウト」。旧Takeの再生/Shareが使えず、app終了/再起動で旧画面・音声へ戻らないか確認。ログイン手段が不明なら実施せずBLOCKED。account Bへの切替は準備待ちのため行わない。

## まとめて返す形式

```text
実行日時／同じStaging app：
条件：N/L、VoiceOver、network、speaker/BT、microphone許可
データ：A、長いtitle/本文Bの有無、長いadvice/latest Cの有無、複数台本の有無

Session B：確認できたIDと観察／FAIL・未実施・不足条件
Session C：画面別・N/L・VoiceOver・viewport結果／不足条件
Session D：各割り込み・offline方法と結果／機器・条件不足
Session E：loop完走結果＋原6問への回答
追加criteria：PS-N/PS-C-06/PS-H-04/PS-X-01/PS-F-01の結果

FAILがあれば：ID、画面、操作順、期待と実際、時刻/証拠、影響
```

SS/動画がなくても具体的な時刻付きHuman観察を記録できる。合格した操作をすべて再試験させるための証拠提出にはしない。既存PASSを保持し、FAILのexact findingだけを次の修正対象にする。

**現在の引継ぎ:** Listen改善枝のcloseout後、B＋Eの未確認部分だけへ進む。原58の適用待ち2件、追加の条件待ち、template-dependent6件を推測で埋めず、formal acceptance全体は未CLOSED。
