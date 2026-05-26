# Evaluation calibration options

## 目的

production 確認で「評価が甘すぎる」印象が出たため、scoring logic / provider contract / DB schema / 過去履歴の意味を変える前に、repo 上で分かる原因と安全な改善余地を整理する。

今回は調査メモのみで、実装は行わない。

## 現在の provider 状態

- `PRONUNCIATION_PROVIDER=mock` のときは `services/pronunciation/mock-evaluator.ts` を使う。
- `PRONUNCIATION_PROVIDER=azure` のときは `services/pronunciation/azure-evaluator.ts` を使う。
- local / development の既定は mock。`.env.example` も `PRONUNCIATION_PROVIDER=mock`。
- strict production では production provider guard により `PRONUNCIATION_PROVIDER=azure` が要求される。
- Azure は `AZURE_SPEECH_KEY` と `AZURE_SPEECH_REGION` が必要。`NATIVE_MINUTE_DISABLE_AZURE` が有効なら cost guard で止まる。
- `/api/evaluate` は audio-first を維持している。request validation 後、owned script を server 側で引き直し、owned recording を読み、transcribe -> evaluate -> coach -> atomic persist の順で保存する。

## mock evaluator が甘く見える理由

mock evaluator は main loop 開発用 fallback であり、実際の発音評価ではない。

- `accuracyScore` は、保存済み script と transcript の単語 overlap / coverage でほぼ決まる。
- `fluencyScore` はおおむね 82 点台から始まり、coverage が高いとさらに上がる。
- `rhythmScore` はおおむね 80 点台から始まり、coverage が高いとさらに上がる。
- 録音が短い場合は小さな duration penalty が入るが、音声そのものの発音、間、抑揚、崩れ、ノイズは見ていない。
- transcript に script の単語が多く入っていれば、発音が不自然でも高得点に見える。
- weak words も主に transcript に出なかった script words なので、「聞き取られたが発音は悪い」単語は拾いにくい。

つまり mock は persistence / review / progress の動作確認には便利だが、ユーザーには厳密な発音 score として見せすぎない方がよい。

## Azure evaluator の現在地

Azure evaluator は live API 呼び出し実装済みで、Azure Speech Pronunciation Assessment を使う。

- PCM WAV input を前提に continuous recognition で1分前後の録音を評価する。
- Azure の pronunciation / accuracy / fluency / prosody を segment の word count などで weighted average している。
- `rhythmScore` は en-US の prosody score を優先し、prosody がない場合は fluency に fallback する。
- weak words は Azure の word-level accuracy / error type から拾い、足りない場合は script にあるが transcript にない単語を補う。
- 現状は Azure の生スコアを app 側で大きく厳しめ補正せず、persisted score として保存している。

Azure 側で安全にできそうなのは、provider raw score を変えることではなく、表示上の解釈を調整すること。

- `score` を通知表ではなく `参考スコア` / `今日の目安` として見せる。
- `Focus words` / `次はここだけ` / coach memo を score より強くする。
- 高得点でも weak words や coach focus があれば、次に直す1点を必ず見せる。
- 将来的には persisted score を変えず、表示専用の level label を足す余地がある。

## DB / API 変更なしでできる小さな改善案

1. mock 時だけ簡易評価ラベルを出す
   - 例: `練習用の簡易評価です`
   - score 計算は変えない。
   - false confidence を減らせる。

2. score label を弱める
   - `score` ではなく `参考スコア` / `今日の目安` に寄せる。
   - Review / Progress の情報設計と相性がよい。

3. Review の主役をさらに `次はここだけ` に寄せる
   - numeric score は残す。
   - Focus words / coach memo / もう一度録る CTA を score より先に読ませる。

4. Progress では score をログ marker として扱う
   - latest / best の比較は維持する。
   - score だけで成功失敗を判断させない。

5. mock-only の軽い cap / penalty
   - coverage だけで高 80 点になりすぎないよう、mock の fluency / rhythm baseline を下げる。
   - ただし future mock take の点数意味が変わり、smoke expectation に影響し得るため、表示改善後の次段階にする。

6. coach feedback を少し厳しめにする
   - 高得点でも weak words / missing words がある場合、必ず具体的な next action を出す。
   - persisted score fields は変えずにできる。

## 今は避けるべき変更

- persisted `score / accuracy_score / fluency_score / rhythm_score` の算式変更。
- old take の score 再計算。
- `/api/evaluate` response shape の変更。
- canonical script / review source を client 側へ移すこと。
- migration なしに新しい review field を増やすこと。
- Azure provider settings や production provider behavior の変更。
- OpenAI transcription の結果を発音品質として扱うこと。
- best take 判定を、過去 progress の意味整理なしに変えること。

## 今すぐおすすめの一手

まずは表示だけの calibration pass に留める。

1. mock 時だけ `簡易評価` と分かる copy を出す。
2. visible score label を `参考スコア` または `今日の目安` にする。
3. `次はここだけ` / `Focus words` を score より主役に保つ。

それでも甘く見える場合だけ、次段階として mock-only cap / penalty を検討する。Azure aggregation や persisted historical score semantics は、別タスクで明示的に product 判断してから触る。
