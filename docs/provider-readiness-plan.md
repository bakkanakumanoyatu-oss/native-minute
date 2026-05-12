# Provider Readiness Plan

S12a では、mock provider 前提で固まった main loop を、実 provider へ差し替える前の readiness として整理する。ここでは実 API 呼び出し、DB schema 変更、API response shape 変更、cache key 変更は行わない。

## 目的

- `listen -> record -> review -> progress` の main loop を壊さず、実 provider を段階的に差し替える。
- OpenAI transcription、Azure pronunciation evaluator、voice provider、Script Studio OpenAI generation の現在地を混同しない。
- secret / raw provider response / raw audio / raw script を UI、DB metadata、docs に残さない。
- 実 provider smoke に失敗した場合でも、mock provider へ戻して main loop 開発を継続できるようにする。

## Fixed Main Loop 前提

- `/api/evaluate` は audio-first。client request の script text は信用しない。
- `/api/evaluate` route は auth、schema validation、service 呼び出し、safe response に留める。
- 評価時は server 側で owned `scripts` row を読み直し、`script.content / targetSeconds / locale` を使う。
- 録音実体は app-owned `recordings` bucket から読み直し、`userId/scriptId` prefix と owned script を確認する。
- transcription provider は `TranscriptionResult` を返し、pronunciation evaluator は `EvaluateResult` を返す。
- review 保存は `persist_review_bundle` RPC で atomic に行う。
- review / progress の canonical source は `takes` scalar fields、`weak_words`、`coach_feedback`。
- `takes` は full script snapshot を持たないため、script in-place edit は unsafe。直したい場合は duplicate / new script を使う。
- mock transcription / mock pronunciation / mock voice は、main loop を止めないための fallback として維持する。

## 壊してはいけない Contract

### Evaluate Request / Response

- Request は `scriptId` と app-owned recording reference を中心にする。
- `audioPath` または `audioStorageKey` は必須。raw audio bytes を client から直接 `/api/evaluate` に渡す形へ戻さない。
- Response は `{ takeId, evaluation, coach }` の current shape を維持する。
- provider 固有の raw response、request id、session detail は response に出さない。

### Transcription Result

- `transcriptText` と provider 名を返す current shape を維持する。
- transcription provider は pronunciation evaluator や review persistence の schema を知らない。
- OpenAI transcription を使う場合も、raw provider response body を UI / DB metadata に保存しない。

### Pronunciation Evaluation Result

- `score / accuracyScore / fluencyScore / rhythmScore / summaryJa / strengthsJa / weakWords / scriptWordCount / transcriptWordCount` の current shape を維持する。
- Azure 固有の segment / session / cancellation detail を canonical review schema に混ぜない。
- weak words は current UI が扱える数と shape に収める。

### Review Persistence

- `takes`、`weak_words`、`coach_feedback` の persisted shape を変えない。
- provider failure が起きたときに partial review を保存しない。
- review / progress は保存済み canonical data から読む。

### Ownership / Storage

- `recordings`、`script-audios`、`voice-samples`、`voice-consents` は app-owned storage として扱う。
- protected replay / recording fetch は signed public URL ではなく authenticated route 経由を優先する。
- provider adapter は app-owned object を server-side に読む。client が provider URL や storage path の正当性を決めない。

## Provider 別 Readiness

| Provider area | 現在の状態 | 必要 env | Migration / storage | Smoke 手順 | 主な recovery |
| --- | --- | --- | --- | --- | --- |
| OpenAI transcription | `TRANSCRIPTION_PROVIDER=openai` のときだけ optional transcriber を使う。既定は mock。local-only WAV smoke と実ブラウザ人間マイク smoke は通過済み。 | `OPENAI_API_KEY`、任意で `OPENAI_TRANSCRIPTION_MODEL` | `recordings` bucket / policy が必要。追加 migration は不要。 | `npm run pronunciation:preflight` で env を見てから、record -> upload -> evaluate -> review -> progress。 | env missing なら mock に戻す。provider failure は raw body を出さず、録音と env を確認して retry。 |
| Azure pronunciation evaluator | `PRONUNCIATION_PROVIDER=azure` の optional evaluator がある。Azure live manual smoke と OpenAI transcription 併用 smoke は通過済み。既定は mock。 | `AZURE_SPEECH_KEY`、`AZURE_SPEECH_REGION` | `recordings` bucket / policy が必要。追加 migration は不要。PCM WAV 前提。 | `npm run pronunciation:preflight` 後、wav/PCM または browser-side 正規化済み録音で evaluate。review / progress 保存を確認。 | env missing、unsupported audio、Azure auth/rate/timeout を分け、開発継続は `PRONUNCIATION_PROVIDER=mock` へ戻す。 |
| voice provider | mock fallback を維持。ElevenLabs は clone voice -> script TTS -> protected replay -> cache hit / Audio Library metadata まで確認済み。OpenAI custom voice は entitlement-sensitive。 | mock は不要。ElevenLabs は `ELEVENLABS_API_KEY` と `SUPABASE_SERVICE_ROLE_KEY`。OpenAI voice は `OPENAI_API_KEY` と `SUPABASE_SERVICE_ROLE_KEY`。 | `script-audios`、`voice-samples`、`voice-consents` buckets / policies が必要。quota events は logging only。 | `npm run voice:style-smoke`、`npm run voice:preflight`、`/setup/voice`、`/scripts/[id]/listen`。 | provider unavailable、deleted voice、storage staging failure は user-facing recovery を出し、必要なら `VOICE_PROVIDER=mock` に戻す。 |
| Script Studio OpenAI generation | `SCRIPT_GENERATION_PROVIDER=openai` で server-side route 内から optional adapter を使う。OpenAI live smoke / quality audit / UI smoke は通過済み。既定は mock。 | `OPENAI_API_KEY`、任意で `OPENAI_SCRIPT_GENERATION_MODEL` | quota event `0009` は logging only。script 保存用の追加 migration は不要。 | `/scripts/new` AI draft -> accepted draft -> quality / freeze preflight -> form copy -> save -> `/listen?created=1`。 | missing env / invalid provider response / provider error は safe response。raw provider output や secret は返さず、mock に戻せる。 |

### S12b Azure smoke note

S12b では `.env.local` 上で Azure / OpenAI transcription の required env が set であることだけを確認し、secret 実値は表示しないまま manual smoke を行った。

- `TRANSCRIPTION_PROVIDER=openai` + `PRONUNCIATION_PROVIDER=azure` の組み合わせでは、短い fixture audio の OpenAI transcription が空 transcript を返し、Azure evaluator へ進む前に安全に 502 で止まった。これは Azure failure ではなく transcription branch の smoke limitation として扱う。
- Azure evaluator 自体の本接続確認は、`TRANSCRIPTION_PROVIDER=mock` + 補助 transcript + `PRONUNCIATION_PROVIDER=azure` で実施し、record upload -> Azure pronunciation assessment -> review -> progress まで通過した。
- review には score grid / transcript / weak words が表示され、progress には該当 review link が反映された。
- Azure cancellation / start failure の user-facing error は raw Azure detail を混ぜず、server log も `sessionId / errorCode / hasErrorDetails` 程度に抑える。
- DB schema、API response shape、evaluate contract、review persistence、cache key は変更していない。

### S12c OpenAI transcription smoke note

S12c では、OpenAI transcription の live smoke は短すぎる fixture ではなく、30〜60秒程度のはっきりした英語音声で確認する方針に固定し、local-only の一時 WAV で二段階 smoke を行った。

- 前回の空 transcript は Azure evaluator ではなく、OpenAI transcription branch で止まったものとして切り分ける。短い / 無音が多い / 発話が不明瞭 / 言語 mismatch / content type mismatch / storage download failure を混同しない。
- smoke 用音声は、script 本文に近い自然な英語、長い無音なし、30〜60秒程度を目安にする。個人音声や秘密情報を repo に commit せず、local-only / git ignored / 一時 artifact として扱う。
- まず `TRANSCRIPTION_PROVIDER=openai` + `PRONUNCIATION_PROVIDER=mock` で OpenAI transcription 単体が空でない transcript を返すことを確認し、その後 `TRANSCRIPTION_PROVIDER=openai` + `PRONUNCIATION_PROVIDER=azure` で combined main loop を確認する。
- OpenAI provider error の raw response body は user-facing response に混ぜない。server log は status / request id 程度に留め、secret / auth header / raw provider payload / raw audio bytes は UI、docs、DB metadata に残さない。
- OpenAI transcription が空の場合は、provider failure として扱いすぎず、録音長・無音・英語の明瞭さを確認して再録音する recovery を優先する。
- `TRANSCRIPTION_PROVIDER=openai` + `PRONUNCIATION_PROVIDER=mock` では、空でない transcript が review に保存され、progress の script card / review link まで反映された。
- `TRANSCRIPTION_PROVIDER=openai` + `PRONUNCIATION_PROVIDER=azure` でも同じ音声で review / progress まで通り、Azure score grid と weak words 保存が壊れないことを確認した。
- smoke 用の一時音声と isolated Next dist は確認後に削除した。DB schema、API response shape、evaluate contract、review persistence、cache key は変更していない。

### S12d human microphone smoke checklist

S12d では、local-only WAV ではなく browser microphone から `OpenAI transcription + Azure pronunciation evaluator` へ進む実利用寄りの確認を行う。Codex 単独では人間のマイク入力と肉声を生成できないため、以下は人間が実ブラウザで実施する checklist として扱う。

成功条件:

- `npm run pronunciation:preflight` で `TRANSCRIPTION_PROVIDER=openai`、`PRONUNCIATION_PROVIDER=azure`、`OPENAI_API_KEY`、`AZURE_SPEECH_KEY`、`AZURE_SPEECH_REGION` が set であることだけ確認する。secret 実値は表示しない。
- `/scripts/[id]/record` で `マイクで録音する` を使い、30〜60秒程度の明瞭な英語を録音する。
- browser 録音は多くの環境で webm になる。Azure 使用時は client-side で upload 前に wav/PCM へ正規化される。変換できない場合は wav/PCM file を選び直すか `PRONUNCIATION_PROVIDER=mock` へ戻す。
- upload 後、OpenAI transcription が空でない transcript を返し、Azure pronunciation evaluator が score / weak words を返す。
- `/scripts/[id]/review/[takeId]` に transcript / score grid / weak words / coach feedback が表示される。
- `/progress` に該当 script の latest result と review link が反映される。

切り分け:

- マイク権限・録音なし・短すぎる録音は record phase の問題として扱う。provider bug と混同しない。
- upload/storage 失敗は recordings bucket / policy / ownership を確認する。OpenAI / Azure failure と混同しない。
- OpenAI transcription の空結果は、短すぎる / 無音が多い / 英語が不明瞭な録音として切り分け、同じ録音を押し切らず録り直す。
- Azure failure は PCM WAV 前提、Azure key/region/resource、rate/timeout を確認する。raw Azure detail は UI / docs に貼らない。
- secret、auth header、raw provider payload、raw audio bytes、signed URL は UI、docs、DB metadata に残さない。

### S12e human microphone smoke result

S12e では、ユーザーが実ブラウザで人間マイク録音を行い、`TRANSCRIPTION_PROVIDER=openai` + `PRONUNCIATION_PROVIDER=azure` の real-provider evaluation loop が通過した。

- `/scripts/[id]/record` で人間マイク録音から evaluate し、`/scripts/[id]/review/[takeId]` へ遷移した。
- transcript は空ではなく、score grid と weak words が review に表示された。
- `/progress` に結果が反映され、表示上の気になる点はなかった。
- 録音時間の詳細は未記録だが、S12d の checklist どおり、今後の再 smoke では 30〜60秒程度の明瞭な英語を目安にする。
- DB schema、API response shape、evaluate contract、review persistence、canonical source、cache key は変更していない。

### S12 close status

S12f では、S12b〜S12e の結果をもって real-provider evaluation loop を一区切りにする。

- Azure pronunciation evaluator は `mock transcription + 補助 transcript` と `OpenAI transcription` の両方で review / progress まで確認済み。
- OpenAI transcription は local-only WAV と browser microphone の両方で空でない transcript を返し、review / progress に保存済み。
- 実 provider へ切り替えても `/api/evaluate` audio-first、server-owned script re-fetch、atomic review persistence、canonical review/progress source、ownership/storage access は維持されている。
- ここから先は、新しい provider contract 追加よりも targeted failure branch smoke、本番前 manual QA checklist、UI density の人間レビューを優先する。

## S13a 本番前 Manual QA Checklist

S13a では、S12 で real-provider evaluation loop が通過した後に、人間が本番前に確認する成功条件と targeted failure smoke の優先順位を固定する。ここでは DB schema、API response shape、evaluate contract、review persistence、canonical source、cache key は変更しない。

### Completed 扱いの flow

- `/scripts/new` の Script Studio で、テンプレ / フリーライティング / AI draft から script を作成できる。
- 保存後は `/scripts/[id]/listen?created=1` に遷移し、created handoff から見本確認へ進める。
- `listen` では見本音声生成 / cache reuse / protected replay / Audio Library 保存を確認済み。
- `record` では app-owned recording upload 後、`/api/evaluate` が server-owned script と recording を読み直す。
- `TRANSCRIPTION_PROVIDER=openai` + `PRONUNCIATION_PROVIDER=azure` で transcription / pronunciation assessment が通り、review に non-empty transcript、score grid、weak words、coach feedback が表示される。
- review persistence は atomic RPC 経由で、progress は `takes` / `weak_words` / `coach_feedback` の canonical source から latest / best / review link を表示する。
- 同じ script で 2 回練習しても latest / best / 改善の流れ / record-review-progress の戻り導線は崩れない。

### Happy-path manual QA

1. 環境確認
   - `npm run lint`
   - `npm run build`
   - `npm run typecheck`
   - `npm run pronunciation:preflight`
   - secret 実値は表示しない。必要 env が set かだけを見る。
2. script 作成
   - `/scripts/new` で template または AI draft から 1 本作る。
   - 45〜75秒程度 / 1テーマ / 自分が言いそうな英語に少し編集する。
   - 保存後 `/scripts/[id]/listen?created=1` に進む。
3. listen
   - created handoff が通常 guidance と衝突しない。
   - 見本音声の生成または cache reuse が読める。
   - replay ができ、cache と Audio Library 保存済みが混同されない。
4. record
   - `TRANSCRIPTION_PROVIDER=openai`、`PRONUNCIATION_PROVIDER=azure` で 30〜60秒程度の明瞭な英語を録音する。
   - browser 録音が webm でも、Azure 選択時は upload 前に wav/PCM へ正規化される。
   - unsupported / too large / too short の案内が provider failure と混ざらない。
5. evaluate / review
   - evaluate 後に `/scripts/[id]/review/[takeId]` へ進む。
   - transcript が空でない。
   - score grid、weak words、coach next step が表示される。
   - secret、raw provider response、raw audio、signed URL が画面に出ない。
6. progress
   - latest result と review link が反映される。
   - 同じ script で 2 回目も練習し、latest / best / 改善の流れが自然に読める。
7. navigation / viewport
   - desktop と mobile 幅で、`scripts -> listen -> record -> review -> progress` の主導線が見える。
   - refresh / back navigation 後も、保存済み review と progress が canonical data から復元される。
   - script in-place edit に誘導せず、直したい場合は duplicate / new script 方針と矛盾しない。

### Targeted failure smoke 候補

| 優先度 | 候補 | 意図的に起こすこと | 成功条件 | User-facing message 期待 | 出してはいけないもの | Codexだけで確認 | 人間確認 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P0 | empty transcript / too short / silent | 短すぎる、無音が多い、または聞き取りにくい録音で evaluate する | review を保存せず、録り直し recovery を出す | 短い / 無音 / 聞き取りにくい可能性として案内し、30〜60秒程度で録り直す | raw OpenAI response、raw audio、secret | 一部可能。local-only fixture で再現しやすい | browser microphone の実感確認は人間 |
| P0 | OpenAI transcription env missing | `TRANSCRIPTION_PROVIDER=openai` で `OPENAI_API_KEY` を unset にする | preflight / record recovery で止まり、mock fallback が読める | OpenAI transcription の設定不足として案内する | secret 名以外の実値、raw stack | 可能 | 不要 |
| P0 | Azure env missing | `PRONUNCIATION_PROVIDER=azure` で Azure key / region を unset にする | provider diagnostics / record recovery で止まり、mock fallback が読める | Azure evaluator の設定不足として案内する | secret 実値、raw Azure detail | 可能 | 不要 |
| P1 | upload failure | recordings bucket / policy 不足、または大きすぎる / unsupported file を使う | upload/storage failure と provider failure を分けて表示する | recording upload / storage の問題として案内する | storage signed URL、raw object body | bucket/policy 変更なしでは一部のみ可能 | 実 storage policy smoke は人間または dev DB |
| P1 | browser wav normalization failure | browser decode できない形式を選ぶ | upload 前または record phase で wav/PCM file の選び直しを案内する | Azure の PCM WAV 前提と file 差し替えを短く案内する | raw audio bytes | 自動化は難しい | 必要 |
| P1 | Azure auth / cancellation / provider error | invalid key / wrong region / cancellation を起こす | review を保存せず、Azure failure と transcription failure を分ける | Azure 接続 / 認証 / 一時失敗として mock fallback or retry を案内する | raw Azure detail、session raw payload | env 操作で一部可能 | secret 操作は人間 |
| P2 | review save failure | RPC failure や DB unavailable を起こす | partial review を保存しない | 保存失敗として retry / progress 確認を案内する | DB raw error detail | 意図再現は重い | dev DB 操作が必要 |
| P2 | progress reflection failure | saved review はあるが progress が更新されない状態を探す | canonical data から再読込し、review link が一致する | refresh / progress 再確認を案内する | raw DB detail | 一部可能 | 人間確認が自然 |
| P2 | listen audio replay failure | saved `script_audios` replay が失敗する | provider failure と replay/storage failure を混同しない | 保存済み音声の再生成または設定確認へ案内する | signed URL、storage raw error | 一部可能 | 人間確認が自然 |

### S13b で優先する failure smoke

まずは安全で再現性が高く、secret や billing 状態に依存しにくいものに絞る。

1. empty transcript / too short / silent
   - local-only fixture または短い browser recording で再現しやすい。
   - 期待は「review を保存しない」「録り直し recovery」「raw OpenAI response を出さない」。
2. OpenAI transcription env missing
   - env unset / preflight / record recovery の確認で再現しやすい。
   - 期待は「transcription provider 設定不足として止める」「mock fallback が読める」。
3. Azure env missing
   - env unset / diagnostics / recovery の確認で再現しやすい。
   - 期待は「Azure evaluator 設定不足として止める」「OpenAI transcription failure と混同しない」。

upload failure、browser wav normalization failure、Azure auth/rate/billing、review save failure は、本番前 QA では重要だが、環境操作や人間確認の比重が高いので S13b では後回しにしてよい。

### S13b targeted failure smoke result

S13b では、S13a で優先した 3 件だけを小さく確認した。DB schema、API response shape、evaluate contract、review persistence、canonical source、cache key は変更していない。

- `empty transcript / too short / silent`: local-only の短すぎる PCM WAV を OpenAI transcription に渡し、provider non-OK が safe error になることを確認した。user-facing message は raw provider body を出さず、音声形式 / 録音長 / 無音の可能性と、30〜60秒程度のはっきりした英語音声での録り直しを案内する。record recovery は `声が入った録音に差し替える` へ進み、同じ録音の再評価ではなく録り直しを促す。
- `OpenAI transcription env missing`: `.env.local` の実値を壊さず、isolated env で `TRANSCRIPTION_PROVIDER=openai` かつ `OPENAI_API_KEY` missing を再現した。preflight / factory は unsupported として止まり、OpenAI transcription 設定不足として切り分ける。secret 実値、auth header、raw provider response は出さない。
- `Azure env missing`: `.env.local` の実値を壊さず、isolated env で `PRONUNCIATION_PROVIDER=azure` かつ Azure key / region missing を再現した。preflight / factory は unsupported として止まり、Azure evaluator 設定不足として切り分ける。OpenAI transcription failure、upload failure、raw Azure detail と混同しない。
- `createPersistedReview` は transcription / pronunciation artifacts 作成後にのみ `persistReviewBundle` を呼ぶため、上記 failure branch では partial review / progress を保存しない前提を維持している。
- provider request id が server log に出る場合はあるが、secret、raw provider response body、raw audio、auth header は UI / DB metadata / docs に出さない。

## S13c 本番前 Manual QA 実走パック

S13c では、S12/S13b で通った real-provider loop と targeted failure branch を、人間が本番前に再確認できる checklist と記録テンプレートとして閉じる。ここでも DB schema、API response shape、evaluate contract、review persistence、canonical source、cache key は変更しない。

### Completed / checked status

- Script Studio では、テンプレ / フリーライティング / AI draft から script を作り、フォームで編集して保存し、`/scripts/[id]/listen?created=1` へ進む流れを確認済み。
- listen では、created handoff、見本音声生成 / cache reuse / protected replay / Audio Library 保存の導線を確認済み。
- record では、browser recording / upload から `/api/evaluate` へ進み、server-owned script と owned recording を読み直す前提を維持している。
- `TRANSCRIPTION_PROVIDER=openai` + `PRONUNCIATION_PROVIDER=azure` は、local-only WAV と human browser microphone の両方で review / progress まで通過済み。
- review / progress は `takes`、`weak_words`、`coach_feedback` を canonical source とし、同じ script の 2 回練習で latest / best / review link が崩れないことを確認済み。
- S13b では、empty transcript / too short、OpenAI env missing、Azure env missing が review persistence 前で安全に止まり、partial review / progress を保存しないことを確認済み。

### Manual QA pass criteria

1. Desktop browser
   - ログインできる。
   - `/scripts/new` で script を 1 本作れる。
   - 保存後 `/scripts/[id]/listen?created=1` に進む。
   - created handoff が通常 guidance と衝突せず、次に `見本音声を聞く -> record へ進む` と読める。
2. Listen
   - 見本音声を生成または cache reuse できる。
   - replay ができる。
   - cache と Audio Library 保存済み音声が混同されない。
   - secret、raw provider response、signed URL が画面に出ない。
3. Record / evaluate
   - `TRANSCRIPTION_PROVIDER=openai`、`PRONUNCIATION_PROVIDER=azure` で 30〜60秒程度の明瞭な英語を録音できる。
   - browser recording が webm の場合、Azure 選択時は upload 前に wav/PCM へ正規化される。正規化できない場合は wav/PCM file の選び直しとして案内される。
   - evaluate 後に review へ進む。
4. Review
   - transcript が空ではない。
   - score grid が表示される。
   - weak words が表示される。
   - coach / next step が表示される。
   - raw provider response、raw audio、auth header、secret が画面や DB metadata に出ない。
5. Progress / continuity
   - progress に latest result と review link が反映される。
   - 同じ script で 2 回目練習ができる。
   - latest / best / 改善の流れ / 最新とベストの差が自然に読める。
   - refresh / back navigation 後も saved review / progress が canonical data から復元される。
6. Error observation
   - failure が出た場合、phase を `upload/storage`、`OpenAI transcription`、`Azure pronunciation`、`review save`、`progress reflection` のどれかに切り分ける。
   - user-facing message に次の行動がある。
   - terminal log を共有する場合も secret、raw provider response、raw audio、auth header は貼らない。

### Mobile / Safari 注意点

- Microphone permission: 初回 permission prompt を許可できるか、拒否時に record で止まれるかを見る。
- Recording format: Safari / mobile では録音形式や browser decode 可否が desktop と違う可能性がある。Azure 選択時は wav/PCM 正規化できない場合に file 選び直しへ案内されることを見る。
- Audio playback: listen replay と review recording replay が再生できるか、mute / autoplay 制約に見える挙動がないかを見る。
- Refresh / back navigation: recording 中の refresh は失われる前提でよいが、保存済み review / progress は復元されることを見る。
- Layout density: mobile では primary action が fold の下に埋もれすぎないかだけ見る。mobile 専用 redesign は S13c では行わない。

### Manual QA result template

以下を issue / handoff / QA note にそのまま貼れる形式で記録する。secret 実値、raw provider response、auth header、raw audio、個人音声 file は貼らない。

```text
Native Minute manual QA result
Date:
Tester:
Environment:
- Browser / version:
- Desktop or mobile:
- OS:
- TRANSCRIPTION_PROVIDER:
- PRONUNCIATION_PROVIDER:
- VOICE_PROVIDER:
- Script source: template / free writing / AI draft

Happy path:
- Login: pass / fail / blocked / not tested
- Script creation: pass / fail / blocked / not tested
- Listen generation or cache reuse: pass / fail / blocked / not tested
- Replay: pass / fail / blocked / not tested
- Record 30-60 sec English: pass / fail / blocked / not tested
- Evaluate -> review: pass / fail / blocked / not tested
- Non-empty transcript: pass / fail / blocked / not tested
- Score grid: pass / fail / blocked / not tested
- Weak words: pass / fail / blocked / not tested
- Coach / next step: pass / fail / blocked / not tested
- Progress latest result: pass / fail / blocked / not tested
- Second practice latest / best: pass / fail / blocked / not tested
- Refresh / back navigation: pass / fail / blocked / not tested
- Secret / raw provider response not visible: pass / fail / blocked / not tested

Recording:
- Approx recording duration:
- Audio path used: browser microphone / file upload
- Browser asked microphone permission: yes / no / not applicable

If failed:
- Failure phase: upload/storage / OpenAI transcription / Azure pronunciation / review save / progress reflection / unknown
- User-facing message:
- Next action was clear: yes / no
- Notes without secrets:

General notes:
- UI felt heavy: yes / no / where
- Mobile/Safari issue: yes / no / not tested
```

### Codex automated sanity vs human QA

- Codex can run: `npm run lint`, `npm run build`, `npm run typecheck`, `npm run pronunciation:preflight`, mock baseline e2e where env allows, and static spot checks for docs / code paths.
- Human confirmation is still required for: microphone permission, 30〜60秒の肉声録音、mobile / Safari recording format, perceived UI density, real provider account status / quota, and audio playback feel.
- Automated checks passing does not close manual QA by itself. It only confirms that the repo can be handed to a human tester without known build/type/provider-preflight blockers.

## Env / Migration / Storage Checklist

### Shared

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL`
- 実 provider が server-side storage を読む場合は `SUPABASE_SERVICE_ROLE_KEY`

### Evaluation

- `TRANSCRIPTION_PROVIDER=mock | openai`
- `OPENAI_API_KEY` は OpenAI transcription または Script Studio / voice の live use 時だけ必要。
- `OPENAI_TRANSCRIPTION_MODEL` は任意。未設定時は repo default を使う。
- `PRONUNCIATION_PROVIDER=mock | azure`
- `AZURE_SPEECH_KEY`
- `AZURE_SPEECH_REGION`
- `recordings` bucket と policy が適用済みであること。

### Voice

- `VOICE_PROVIDER=mock | elevenlabs | openai`
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_TTS_MODEL_ID` は任意。
- `OPENAI_VOICE_MODEL` は任意。
- `script-audios`、`voice-samples`、`voice-consents` buckets と policy が適用済みであること。

### Script Studio

- `SCRIPT_GENERATION_PROVIDER=mock | openai`
- `OPENAI_SCRIPT_GENERATION_MODEL` は任意。
- `quota_events` migration は write logging 用。generation response shape や enforcement には使わない。

## Manual Smoke 手順

### 0. 共通 baseline

1. `npm run lint`
2. `npm run build`
3. `npm run typecheck`
4. mock provider で `/scripts/new -> listen -> record -> review -> progress` が通ることを先に確認する。

### 1. Azure pronunciation evaluator

1. `.env.local` を人間が設定する。secret 実値は表示しない。
2. `PRONUNCIATION_PROVIDER=azure` にする。
3. 必要なら `TRANSCRIPTION_PROVIDER=mock` のまま transcript fallback を使う。実 transcription も見る場合だけ `TRANSCRIPTION_PROVIDER=openai` にする。
4. `npm run pronunciation:preflight` を実行する。
5. dev server を再起動する。
6. `/scripts/[id]/record` を開く。
7. browser recording または wav/PCM file を使う。非 wav は browser-side normalization が成功する場合だけ進める。
8. evaluate して `/scripts/[id]/review/[takeId]` へ進む。
9. `score / weak words / coach feedback` が保存され、`/progress` に反映されることを確認する。
10. 失敗時は provider raw detail を貼らず、`PRONUNCIATION_PROVIDER=mock` に戻して再起動する。

### 2. OpenAI transcription

1. `TRANSCRIPTION_PROVIDER=openai` と `OPENAI_API_KEY` を人間が設定する。
2. `npm run pronunciation:preflight` で transcription section を確認する。
3. 30〜60秒程度のはっきりした英語音声を用意する。個人情報や秘密を含む音声は repo に残さない。
4. まず `PRONUNCIATION_PROVIDER=mock` と組み合わせ、`/scripts/[id]/record` から audio-first evaluate を実行する。
5. `transcriptText` が保存済み review に反映され、`/progress` へ反映されることを確認する。
6. 次に必要な場合だけ `PRONUNCIATION_PROVIDER=azure` と組み合わせ、同じ main loop が通ることを確認する。
7. provider error の raw response を UI / docs / metadata に残していないことを spot check する。

### 3. Voice provider

1. `npm run voice:style-smoke` を実行する。
2. 対象 provider の env を人間が設定する。
3. `npm run voice:preflight` を実行する。
4. `/setup/voice` で consent / sample upload / default voice を確認する。
5. `/scripts/[id]/listen` で synthesize / protected replay / cache hit を確認する。
6. 失敗時は `VOICE_PROVIDER=mock` に戻す。

### 4. Script Studio OpenAI generation

1. `SCRIPT_GENERATION_PROVIDER=openai` と `OPENAI_API_KEY` を人間が設定する。
2. `/scripts/new` の AI draft 入口で日本語 seed から draft を作る。
3. accepted draft、quality report、freeze preflight、form copy、save、`/listen?created=1` を確認する。
4. quota metadata に raw seed / generated full text / raw provider response / secret が入っていないことを spot check する。
5. 失敗時は `SCRIPT_GENERATION_PROVIDER=mock` に戻す。

## Failure / Recovery 注意点

- Missing env は provider bug と混同しない。preflight で先に止める。
- Azure は PCM WAV 前提。browser-side normalization が失敗したら wav file を選び直すか mock に戻す。
- OpenAI transcription の provider error は raw provider body を user-facing に出さない。empty transcript は短すぎる / 無音が多い / 英語が不明瞭な録音として切り分け、30〜60秒程度の自然な英語音声で再試行する。
- Provider timeout / rate limit / billing issue は retry と mock fallback を分けて案内する。
- Storage staging failure は provider 成功と replay 失敗を混同しない。
- Protected replay failure は quota event ではなく storage / replay observability として扱う。
- `created=1` handoff や review / progress guidance は provider failure recovery と重複させない。
- secret、auth header、raw provider payload、raw audio bytes、signed URL は docs / metadata / UI に出さない。

## 推奨実装順

S12 close 後に次へ進むなら、第一候補は targeted failure branch smoke / 本番前 manual QA checklist です。Azure pronunciation evaluator の happy path は、local-only WAV と browser microphone の両方で `OpenAI transcription + Azure pronunciation evaluator -> review -> progress` まで通過済みです。

理由:

- Native Minute の価値は `record -> evaluate -> review -> progress` の成長 loop にある。
- Azure evaluator と OpenAI transcription の happy path は、追加 DB / API contract 変更なしで smoke 済み。
- 次のリスクは happy path 追加より、empty transcript、upload/storage failure、Azure auth/rate/timeout、browser-side wav normalization failure の切り分けにある。
- voice provider は ElevenLabs の主要 happy path がすでに確認済み。
- Script Studio OpenAI generation も live smoke と品質小改善が通過済み。
- OpenAI custom voice は entitlement-sensitive で、次の本線にすると外部 account 状態に引っ張られやすい。

ただし、targeted smoke で API contract、review persistence、storage ownership、script snapshot 方針を変えたくなった場合は実装せず止める。

## 今回まだやらないこと

- Azure API 呼び出しの追加実装
- OpenAI transcription の prompt / model 改修
- voice provider cleanup API
- DB schema / migration 変更
- `/api/evaluate` response shape 変更
- review persistence 変更
- quota enforcement / billing
- auth / ownership / storage access 設計変更
- script in-place edit
