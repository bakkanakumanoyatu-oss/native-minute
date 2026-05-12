# Script Studio Plan

Script Studio は、Native Minute の script 作成入口として計画している設計メモです。Phase S1 では local contract / type / pure helper、Phase S2 では `/scripts/new` の UI mock、Phase S2.5 では generation contract / output validation / freeze boundary、Phase S2.6 では generation provider / pipeline boundary、Phase S3a では OpenAI adapter、Phase S3b では server route / service boundary、Phase S3c では `/scripts/new` draft preview 接続、Phase S3d では accepted draft を既存手動フォームへコピーする橋渡しまで実装済みです。Phase S3e では freeze / quota / cost control の詳細設計を [script-studio-freeze-quota-plan.md](./script-studio-freeze-quota-plan.md) に分離し、Phase S4a では表示用の freeze preflight preview を `/scripts/new` に、Phase S4b では saved script の read-only freeze candidate check を `/scripts/[id]/listen` に追加しました。Phase S4c では MVP は saved script only で進め、`script_freezes` table は今すぐ作らない判断を同 doc に固定しました。Phase S4d では見本音声生成直前の preflight design を [script-studio-voice-generation-preflight-plan.md](./script-studio-voice-generation-preflight-plan.md) に固定し、Phase S4e では `/scripts/[id]/listen` に音声生成前の UX copy / preflight only 表示を追加しました。Phase S4f では quota event design を [script-studio-quota-event-plan.md](./script-studio-quota-event-plan.md) に固定し、Phase S4h では `/scripts/new` と `/scripts/[id]/listen` に quota preflight copy only を追加しました。Phase S5a〜S5e では quota event の schema / write path / implementation plan を固定し、Phase S5f では Script Studio text generation の `script_generation_attempt` だけを non-blocking に記録する初回実装を追加しました。Phase S5g では voice generation quota event の初回実装計画を、Phase S5h では `quota_events` voice schema extension plan を docs に固定しました。現時点では quota enforcement、voice generation quota event 実装、voice provider 本接続、本番 freeze は含みません。

## 1. 目的

Script Studio の目的は、ユーザーの曖昧な「言いたいこと」を、1分で話せる英語に変換することです。

単なる翻訳ではなく、Native Minute の `listen -> record -> review` で練習できる英語台本に整えます。ユーザーが最初から明確な英語文を持っていなくても、選択肢と制約によって意図を育てながら、話せる形へ近づける前提にします。

## 2. Native Minute Script の定義

Native Minute Script は、次の条件を満たす台本です。

- ユーザーの言いたいことを保つ。
- 英語として自然である。
- 1分以内で話せる。
- 意味の塊に分けられる。
- 息継ぎしやすい。
- focus words を 1〜3 個に絞れる。
- 見本音声で読みやすい。
- 録音、review、weak words、次に練習する chunk に接続しやすい。

## 3. ユーザー入力の設計

自由入力だけにしない。自由入力は seed として使い、選択肢で要求を制御します。

入力スロット:

- `topic / seed text`: ざっくり言いたいこと。
- `situation`: meeting、self-introduction、travel、small talk、presentation、lesson、interview など。
- `audience`: friend、colleague、teacher、customer、interviewer、group、general listener など。
- `mood / tone`: friendly、calm、confident、polite、casual、enthusiastic、reflective など。
- `length`: 既定は 60 秒。
- `difficulty`: easy、standard、challenging。
- `priority`: 何を優先して整えるか。

`priority` の候補:

- 正確さ: 元の意味をできるだけ保つ。
- 話しやすさ: 口に出しやすい長さと構造を優先する。
- 自分らしさ: ユーザーの言い方や人格を残す。
- ネイティブっぽさ: 英語として自然な表現を優先する。

「もっと自然に」「もっと話しやすく」「もっと自分らしく」のような bounded choice を本線にし、青天井な自由文 regenerate を主導線にしない。

## 4. ScriptBrief 案

`ScriptBrief` は生成前の構造化入力案です。これは実装済み API contract ではありません。

```ts
type ScriptBrief = {
  userSeedText: string;
  topicCategory: string;
  situation: string;
  audience: string;
  tone: string;
  targetLengthSeconds: number;
  difficulty: "easy" | "standard" | "challenging";
  priority: "accuracy" | "speakability" | "self_likeness" | "native_likeness";
  mustInclude: string[];
  avoid: string[];
  languagePreference: "mostly_english" | "simple_english" | "japanese_summary_supported";
};
```

設計意図:

- `userSeedText` はユーザーの意図の出発点として保持する。
- `mustInclude` は落としてはいけない内容を守る。
- `avoid` は避けたい話題、語調、単語を明示する。
- `priority` は、正確さ・話しやすさ・自分らしさ・自然さの tradeoff を隠さない。

## 5. ScriptDraft 案

`ScriptDraft` は freeze 前にユーザーへ見せる候補です。これも実装済み API contract ではありません。

```ts
type ScriptDraft = {
  title: string;
  englishScript: string;
  japaneseSummary: string;
  tone: string;
  targetLengthSeconds: number;
  estimatedSpeakingTime: {
    practicePaceSeconds: number;
    naturalPaceSeconds: number;
  };
  wordCount: number;
  chunks: Array<{
    index: number;
    text: string;
    cue: string;
  }>;
  focusWords: string[];
  readiness: {
    status: "ready" | "needs_small_edit" | "too_long" | "too_short";
    warnings: string[];
  };
  revisionHints: Array<{
    kind: "length" | "breath" | "chunk" | "focus" | "tone";
    message: string;
  }>;
  generationNotes: string[];
};
```

`ScriptDraft` は、現在の repo にある readiness / practice chunks / manual revision hints と同じ学習信号を持つ前提にします。

## 6. Quality Gate

Quality gate は、既存の表示用導出と接続します。

- readiness: word count、estimated speaking time、長い文、息継ぎ不足を見る。
- practice chunks: 意味の塊、長すぎる chunk、cue を見る。
- manual revision hints: ユーザーが手で直せる短いヒントを出す。
- review focus: focus words を 1〜3 個に抑え、次に練習する chunk へつなぐ。

チェック観点:

- word count が目標時間に収まるか。
- estimated speaking time が 1分練習から大きく外れていないか。
- chunk count が listen / record で扱いやすいか。
- long sentence が freeze 前に見えているか。
- breath point が少なすぎないか。
- focus words count が 1〜3 個に収まるか。
- TTS friendliness があるか。長すぎる文、読みづらい記号、詰まった構造を避ける。
- user intent preservation が保たれているか。特に `mustInclude` と選択された `priority` を守る。

Quality gate は採点ではなく練習前の安全確認です。「目安」「少し長め」「区切りを足すとよい」「練習しやすい」のように断定しすぎない表現にします。

## 7. 生成回数とコスト制限

音声生成はコストが高いので、試行錯誤はテキスト側に寄せます。

- 音声生成は script freeze 後だけにする。
- draft variants は最大 2〜3 件にする。
- regenerate は制限する。
- 「もっと自然に」「もっと自分らしく」「もっと話しやすく」「少し短く」などを選択肢で制御する。
- 自由文だけで青天井な rewrite 要求を受けない。
- draft generation と `script_audios` cache semantics を混ぜない。

ユーザーは修正できるが、毎回の regenerate が意図を持つようにする。

Phase S2.5 では、将来 OpenAI に渡す prompt pack と output contract を `lib/script-studio/generation.ts` に固定した。AI 出力に `wordCount / estimatedSpeakingTime / chunks / readiness` が含まれていても、その値は信用しない。`englishScript` だけを canonical input として、既存の readiness / practice chunks helper から quality report を再計算する。

Phase S2.6 では、`lib/script-studio/generator.ts` に provider / pipeline boundary を追加した。provider は raw candidates を返すだけで、pipeline が validation / normalization / quality report / freeze preflight を担当する。現在の mock generator もこの boundary 経由で動き、UI は provider raw output を直接見ない。

Phase S3a では、`lib/script-studio/openai.ts` に OpenAI Responses API adapter を追加した。adapter は Structured Outputs の JSON schema で `candidates` を要求し、response text を `ScriptGenerationCandidate` へ変換する。ただし、AI が返した候補はそのまま UI や保存へ出さず、`runAsyncScriptGenerationPipeline` で validation / normalization / quality report / freeze preflight を必ず通す。server-side からは `lib/script-studio/server.ts` 経由で import し、client 向け barrel には混ぜない。

Phase S3b では、`schemas/script-studio.ts`、`services/script-studio/script-generation.service.ts`、`POST /api/script-studio/generate` を追加した。route は auth / schema validation / service 呼び出しだけを担当する。provider は `SCRIPT_GENERATION_PROVIDER=mock | openai` で選び、default は mock。openai を選んだときだけ `OPENAI_API_KEY` を要求する。response は accepted drafts / rejected candidates / issues / prompt summary / freeze preflight に整形し、raw OpenAI response、full hidden prompt、secret は返さない。

Phase S3c では、`/scripts/new` の `ScriptStudioMockPanel` から `POST /api/script-studio/generate` を呼ぶようにした。client component は OpenAI adapter、`lib/script-studio/server.ts`、`services/script-studio` を import しない。UI は provider / accepted drafts / quality report / freeze preflight / issues / next action だけを表示し、raw OpenAI response、full prompt、secret、provider internals は表示しない。`この台本で練習開始` は引き続き disabled で、script 保存、freeze 保存、voice generation、quota には接続しない。

Phase S3d では、accepted draft の `title / englishScript / target seconds` だけを既存の手動 script 作成フォームへコピーできるようにした。`japaneseSummary / qualityReport / freezePreflight / generationNotes` は script 本文に混ぜない。コピーは freeze ではなく、ユーザーがフォーム内で編集してから既存の script 保存 flow を使う。

Phase S3e では、generated draft、copied draft、saved script、frozen script、script audio、text generation quota、voice generation quota の境界を `docs/script-studio-freeze-quota-plan.md` に固定した。S3e は docs-only で、DB / API / UI 実装は追加していない。

Phase S4a では、`/scripts/new` の manual form に freeze UX copy と local preflight preview を追加した。フォーム内の現在台本から readiness / freeze readiness を表示用に見るだけで、freeze persistence、quota、voice generation gating、API 追加は行わない。generated draft の preflight と、コピー後に編集したフォーム内容の preflight は別の目安として扱う。

Phase S4b では、`/scripts/[id]/listen` に saved script の read-only freeze candidate check を追加した。S4a は保存前フォームの preview、S4b は保存済み script を canonical として読む check と分ける。見本音声生成、cache、replay はこの check で止めず、freeze persistence、quota、voice generation gating、API 追加も行わない。

Phase S4c では、MVP では saved script only で進め、`script_freezes` table は今すぐ作らない判断を `docs/script-studio-freeze-quota-plan.md` に固定した。freeze は当面、保存イベントではなく音声生成前の read-only preflight / explicit UX boundary として扱う。script in-place edit は unsafe なので、編集したい場合は duplicate / new script 方針を維持する。

Phase S4d では、saved script を canonical としたまま、見本音声生成直前に確認する preflight design を `docs/script-studio-voice-generation-preflight-plan.md` に固定した。`/api/speak-script` は引き続き server 側で owned saved script を読み直し、cache reuse / regeneration / voice setup / storage / quota の確認観点を docs に整理する。S4d は docs-only で、listen flow、cache key、API、DB、UI、gating は変更しない。

Phase S4e では、`/scripts/[id]/listen` に音声生成前の UX copy / preflight only 表示を追加した。saved script から見本音声を作ること、cache reuse と regeneration の違い、voice setup / provider readiness が必要なこと、freeze 保存 / quota 消費 / gating ではないことを説明するだけで、既存の listen flow、cache key、API、DB、voice generation gating は変更しない。

Phase S4f では、text generation quota / voice generation quota / voice clone quota の event boundary を `docs/script-studio-quota-event-plan.md` に固定した。copy、manual edit、saved script creation、readiness、freeze preflight、cache hit、protected replay は quota 消費にしない方針を明記し、将来の `quota_events` model 候補だけを整理する。S4f は docs-only で、DB、API、UI、billing、quota enforcement は変更しない。

Phase S4h では、S4f の quota event design を UI copy として `/scripts/new` と `/scripts/[id]/listen` に反映した。draft generation / regeneration、cache miss の script audio generation、provider synthesize request は将来 quota 対象になり得る一方、copy、manual edit、saved script creation、cache hit、protected replay は quota 消費ではないと押す前に説明する。quota enforcement、billing、`quota_events` 書き込み、cache key 変更、voice generation gating は追加しない。

Phase S5a では、`quota_events` の schema design を `docs/script-studio-quota-event-plan.md` に固定した。event type、event status、subject / target resource、idempotency / dedupe key、failed / partial / skipped / cache_hit、retention、privacy、RLS / ownership、billing / enforcement からの分離を整理する。これは docs-only で、DB schema / migration、API route、write path、quota enforcement、billing、usage dashboard は追加しない。

Phase S5b では、Script Studio text generation の quota event write path design を `docs/script-studio-quota-event-plan.md` に固定した。将来 event を書く場合は route ではなく server-side service 境界を orchestration point にし、route は auth / schema validation、pipeline は validation / normalization、provider adapter は raw candidates 返却に留める。`attempted / succeeded / failed / skipped / not_billable` の扱い、idempotency / dedupe / request fingerprint、provider metadata の privacy 方針を整理する。これは docs-only で、DB schema / migration、API contract change、write path 実装、quota enforcement、billing は追加しない。

Phase S5c では、voice generation の quota event write path design を `docs/script-studio-quota-event-plan.md` に固定した。将来 `/api/speak-script` で event を書く場合は `speakScript` service 境界で orchestration し、cache hit / cache miss / provider synthesize / replay staging / protected replay failure を分ける。これは docs-only で、DB schema / migration、API contract change、write path 実装、quota enforcement、billing、cache key 変更は追加しない。

Phase S5d では、quota event implementation readiness design を `docs/script-studio-quota-event-plan.md` に固定した。最初の実装対象は text generation、voice generation はその後、write failure は当面 non-blocking、`rejected` は status ではなく `failed + failure_stage` で表す。これは docs-only で、DB schema / migration、`quota_events` table、write service、API contract change、quota enforcement、billing は追加しない。

Phase S5e では、text generation quota event implementation plan を `docs/script-studio-quota-event-plan.md` に固定した。将来の `quota_events` migration 候補、RLS / ownership、write service interface、`generateScriptStudioDrafts` からの呼び出し位置、`billing_status`、write failure logging、privacy-safe metadata を具体化する。これは docs-only で、DB schema / migration、`quota_events` table、write service、API contract change、quota enforcement、billing は追加しない。

Phase S5f では、Script Studio の `script_generation_attempt` だけを対象に `quota_events` migration / DB types / non-blocking write service / `generateScriptStudioDrafts` 接続を追加した。route response shape は変えず、raw prompt、raw seed text、generated draft text、raw provider response は保存しない。voice generation quota event、enforcement、billing、usage dashboard はまだ実装しない。

Phase S9a では、`/scripts/new` を Script Studio の入口として整理し、4つの最小 entry mode を追加した。

- テンプレから選ぶ: repo 内の安全な自作テンプレだけを少数持ち、既存フォームへコピーして編集する。
- フリーライティング / 既存原稿貼り付け: 既存の manual form を入口として明示し、readiness / chunks / freeze preflight を見る。
- AI自動生成: 既存の generation route preview を入口の1つとして置く。既定は mock provider の確認用 draft で、本番AI生成の品質確認ではない。accepted draft はフォームへコピーしてから編集・保存する。
- このアプリに向いている文章ガイド: 1分で話しやすい長さ、意味の塊、息継ぎ、focus words、語尾まで言い切ることを短く案内する。

テンプレ本文は Native Minute original の短い自作英文に限定する。映画のセリフ、近年の有名スピーチ、著作権的に危ない本文は repo に内蔵しない。S9a は UI / local data structure の整理だけで、DB schema、API contract、script 保存形式、freeze、voice provider は変更しない。

Phase S10g では、AI draft を本格 OpenAI 生成へ進める前に、seed 例と品質期待値を整理した。UI では `seed 例を見る` と `draft の見方` を details に置き、通常表示を重くしない。docs では次を採用基準にする。

- seed は、仕事で小さく成功した話、最近少し困ったこと、自分の好きなもの、これから挑戦したいこと、感情がある短い出来事のような、自分の言葉で短く語れるものを優先する。
- 良い draft は、45〜75秒、1テーマ、自分が本当に言いそうな英語、長すぎない文、意味の塊で練習しやすい構成、見本音声でまねしやすい語尾を満たす。
- 微妙な draft は、意味は合っているが少し説明が長い、focus words が多い、難しい固有名詞や抽象語が多い、chunk が見えにくいもの。これはフォームへコピー後に短く直す。
- 直すべき draft は、ユーザーの意図を変えすぎている、45〜75秒から大きく外れる、1文が詰まりすぎる、言いそうにない表現が多い、見本音声で真似しづらいもの。

AI draft は完成品を保証する入口ではなく、フォームで編集する候補として扱う。本格 OpenAI 生成へ進む場合も、AI supplied metrics は信用せず、`englishScript` から readiness / chunks / freeze preflight を再計算する。

Phase S10h では、AI mock preview の browser smoke を実施した。`seed 例を見る` で例を選び、mock draft を作成し、`draft の見方` を確認し、フォームへコピーして編集・保存し、`/scripts/[id]/listen?created=1` へ進む流れを確認した。これは mock provider の確認であり、OpenAI live smoke、本格生成品質確認、DB schema、API contract、script 保存 flow は変更しない。

Phase S10i では、OpenAI script generation の live smoke 前 readiness を整理した。既定 provider は `SCRIPT_GENERATION_PROVIDER=mock` で、`openai` は明示的に切り替えたときだけ使う。`POST /api/script-studio/generate` は引き続き auth / schema validation / service call の薄い route とし、client は OpenAI adapter、`lib/script-studio/server.ts`、secret、raw provider response、full prompt を見ない。OpenAI adapter が返した candidate は、mock と同じ provider pipeline で validation / normalization / quality report / freeze preflight を通し、AI supplied metrics は信用しない。

OpenAI live smoke 前の checklist:

1. `.env.local` で `SCRIPT_GENERATION_PROVIDER=openai`、`OPENAI_API_KEY`、必要なら `OPENAI_SCRIPT_GENERATION_MODEL` を設定する。通常開発や smoke 前は `mock` のままにする。
2. `npm run lint`、`npm run build`、`npm run typecheck` が通ることを確認する。
3. `/scripts/new` にログイン済みで入り、AI draft 入口から日本語 seed を 1 つ入れる。
4. `draft を作る` を押した後、provider 表示が `openai` になり、accepted draft / quality report / freeze readiness が safe response として表示されることを確認する。
5. raw OpenAI response、full prompt、API key、auth header、provider request id が UI に出ていないことを確認する。
6. 生成結果が 45〜75秒、1テーマ、自分が言いそう、意味の塊で練習しやすいかを確認する。微妙な draft はフォームへコピー後に編集する。
7. `この draft をフォームへコピー` で title / English script / target seconds だけが manual form に入り、summary / quality report / generation notes が本文へ混ざらないことを確認する。
8. 軽く編集して保存し、`/scripts/[id]/listen?created=1` へ進むことを確認する。
9. 失敗時は、OpenAI error / invalid JSON / accepted draft 0件 / quota or rate limit などを user-facing copy で読めるか確認する。復旧は seed を短くする、bounded option を変える、時間を置く、または `SCRIPT_GENERATION_PROVIDER=mock` に戻す。
10. quota event は non-blocking で、raw prompt / raw seed text / generated draft text / raw provider response を保存しないことを spot check する。

Live smoke では成功/失敗の判断だけを行い、同じ turn で品質改善 prompt の大改造や DB / API contract 変更へ進まない。

Phase S10j では、OpenAI script generation の live smoke を小さく実施した。`.env.local` の値は表示せず、Playwright webServer の process env だけ `SCRIPT_GENERATION_PROVIDER=openai` にして確認した。日本語 seed「これから挑戦したいこと」から 59 words の accepted draft が出て、quality report / freeze preflight / form copy / 軽い編集保存 / `/scripts/[id]/listen?created=1` まで通った。`quota_events` では `script_generation_attempt=succeeded`、`billing_status=billable_candidate`、provider request id は内部 metadata として保持される。metadata は `user_seed_text_length` や `raw_candidate_count` のような count / length / option 値に留め、raw seed text、generated draft text、raw provider response、secret、playbackRate は保存しない。

S10j は live smoke の成功/失敗確認であり、生成品質改善 loop ではない。draft は完成品ではなく、フォームへコピーして自分の言葉に直す候補として扱う。

Phase S10k では、OpenAI draft quality を 5 種類の日本語 seed で小さく監査した。初回は accepted draft が全件出た一方で、60秒目標に対して 41〜67 words と短めに寄った。そこで大規模 prompt rewrite ではなく、prompt pack に `targetWordRange` を追加し、60秒目標では 75〜100 words を目安にしつつ、短い seed でも具体的な理由と例を1つ足す指示を加えた。再確認では全 seed が accepted、78〜93 words、blocking reason なしになった。短すぎる傾向は改善したが、favorite / future challenge 系では long chunk warning が残ることがあるため、引き続きフォームへコピー後に区切りを直す候補として扱う。

S10k の privacy spot check では、OpenAI `script_generation_attempt` の quota metadata は count / length / option 値と provider request id に留まり、raw seed text、generated draft text、raw provider response、secret、playbackRate は保存していない。

Phase S10l では、OpenAI draft の実 UI browser smoke を行った。`/scripts/new` の AI 入口で seed 例を選び、real OpenAI draft を作成し、accepted draft / quality report / freeze readiness を確認したうえで、フォームへコピー、軽い編集、保存、`/scripts/[id]/listen?created=1` まで通ることを確認した。UI 上では seed を入力欄以外で raw text として再掲せず、`draft の見方` に long chunk warning はエラーではなくコピー後に区切りを直す目安だと追記した。DB schema、API response shape、script 保存 flow、cache key は変更しない。

Phase S10m では、OpenAI draft の long chunk / editability を小さく改善した。対象は long chunk warning が出やすい favorite / future challenge / emotional short event 系の少数 seed に絞り、生成全文は docs や metadata に保存しない。prompt pack には次を追加した。

- 60秒 script は 75〜100 words 目安を維持する。
- 8〜12 個程度の短い sentence / clause で、自然な意味の流れを保つ。
- breath group は 6〜12 words 程度に寄せ、comma / period で区切る。
- 長くなった thought は自然な境界で区切るが、具体性を削って短くしすぎない。

再 smoke では 3 seed が 79〜89 words、全件 accepted、long chunk 0、blocking reason なし、freeze preflight 可になった。UI の warning copy は、long chunk warning をエラーではなくコピー後に comma / period で区切る編集目安として扱う。DB schema、API response shape、script 保存 flow、cache key は変更しない。

Phase S10n では、Script Studio の integrated entry smoke を行った。対象は `テンプレから選ぶ / フリーライティング / AI自動生成` の 3入口で、それぞれ次を確認した。

- テンプレ: safe original template をフォームへコピーし、少し編集して保存し、`/scripts/[id]/listen?created=1` へ進む。
- フリーライティング: フォームに直接短い英文を入れ、readiness / 保存前チェック / quota 補足を確認し、保存して listen へ進む。
- AI自動生成: seed 例から real OpenAI draft を作り、accepted draft / quality report / freeze readiness / warning copy を確認し、フォームへコピー、少し編集、保存して listen へ進む。

この smoke では、入口間の体験差、保存前チェックの重さ、quota 補足の目立ち方、AI warning が怖いエラーに見えないかを確認した。大きな UI 修正は不要で、DB schema、API response shape、script 保存 flow、cache key は変更しない。

Phase S5g では、voice generation quota event の初回実装計画を `docs/script-studio-quota-event-plan.md` に固定した。初回対象は `script_audio_generation_attempt` のみに絞り、`/api/speak-script` の cache hit / cache miss、provider synthesize、replay staging、status / failure_stage、dedupe / fingerprint、privacy、non-blocking write failure を整理する。DB schema / migration、write service、API contract、quota enforcement、billing、usage dashboard はまだ変更しない。

Phase S5h では、voice generation 対応に必要な `quota_events` schema extension plan を `docs/script-studio-quota-event-plan.md` に固定した。既存 `0009` は変更せず、後続 migration で `script_audio_generation_attempt / voice_generation_quota / cache_hit / partial / saved_script / script_audio` などの check constraint 許可値を広げる案を整理する。migration file、write service、`speakScript` 接続はまだ追加しない。

## 8. Freeze 条件

音声生成に進む前に、次を満たす必要があります。

- ユーザーが draft を 1 つ選ぶ。
- readiness が最低限 OK。
- focus words が 1〜3 個。
- target length が大きく外れていない。
- ユーザーが `この台本で練習開始` を押す。

Freeze 後の script は `listen / record / review` の練習元になります。見本音声生成や cache は、この frozen script を前提に扱います。

## 9. UX Flow

想定 flow:

1. ユーザーが日本語で言いたいことを書く。
2. アプリが situation、audience、tone、difficulty、length、priority を選択肢で整理する。
3. 2〜3 案の英語 draft を生成する。
4. readiness / chunks / focus words / revision hints を表示する。
5. ユーザーが 1 つ選ぶ。
6. `この台本で練習開始` で freeze する。
7. 既存 main loop の `listen -> record -> review -> progress` へ進む。

Script Studio は独立した作文プロダクトではなく、Native Minute の main loop 入口として扱います。

## 10. 今回まだやらないこと

- `この台本で練習開始` の本接続。
- 自動 rewrite 実装。
- 本番 freeze の UI 実装。
- DB schema / migration 変更。
- API contract 変更。
- quota 実装。
- voice provider 本接続。
- auth callback の追加修正。

## 11. 今後の実装フェーズ

- Phase S0: 設計文書。
- Phase S1: contract / type / helper。実装済み: `lib/script-studio`。
- Phase S2: UI mock。実装済み: `/scripts/new` の `ScriptStudioMockPanel`。
- Phase S2.5: generation contract / output validation / freeze boundary。実装済み: `lib/script-studio/generation.ts`。
- Phase S2.6: generation provider / pipeline boundary。実装済み: `lib/script-studio/generator.ts`。
- Phase S3a: OpenAI script generation adapter。実装済み: `lib/script-studio/openai.ts`。
- Phase S3b: server route / service boundary。実装済み: `POST /api/script-studio/generate`。UI 本接続は未実装。
- Phase S3c: `/scripts/new` draft preview 接続。実装済み: route 経由の accepted draft / quality / freeze 表示。
- Phase S3d: draft-to-form bridge。実装済み: accepted draft を既存手動フォームへコピーし、編集後に既存保存 flow へ渡す。
- Phase S3e: freeze / quota / cost control plan。実装済み: `docs/script-studio-freeze-quota-plan.md`。
- Phase S4a: freeze UX copy / preflight preview。実装済み: `/scripts/new` の manual form 内表示。DB / API / freeze 保存なし。
- Phase S4b: saved script read-only freeze candidate check。実装済み: `/scripts/[id]/listen` の補助表示。DB / API / gating なし。
- Phase S4c: saved-script-only freeze decision。実施済み: `script_freezes` table は今すぐ作らない判断を docs に固定。DB / API / UI 変更なし。
- Phase S4d: voice generation preflight design。実施済み: `docs/script-studio-voice-generation-preflight-plan.md`。DB / API / UI / gating 変更なし。
- Phase S4e: listen voice generation UX copy。実装済み: `/scripts/[id]/listen` の preflight only 補助表示。DB / API / gating / cache key 変更なし。
- Phase S4f: quota event design。実施済み: `docs/script-studio-quota-event-plan.md`。DB / API / UI / billing / enforcement 変更なし。
- Phase S4g: provider/cache UI refinement。実装済み: `/scripts/[id]/listen` の provider readiness / cache reuse 表示。DB / API / gating / cache key 変更なし。
- Phase S4h: quota preflight copy only。実装済み: `/scripts/new` と `/scripts/[id]/listen` の quota 境界 copy。DB / API / enforcement / billing 変更なし。
- Phase S5a: quota event schema design。実施済み: `docs/script-studio-quota-event-plan.md`。DB / API / write path / enforcement 変更なし。
- Phase S5b: text generation quota event write path design。実施済み: `docs/script-studio-quota-event-plan.md`。DB / API contract / write path / enforcement 変更なし。
- Phase S5c: voice generation quota event write path design。実施済み: `docs/script-studio-quota-event-plan.md`。DB / API contract / cache key / write path / enforcement 変更なし。
- Phase S5d: quota event implementation readiness design。実施済み: `docs/script-studio-quota-event-plan.md`。DB / API contract / write service / enforcement 変更なし。
- Phase S5e: text generation quota event implementation plan。実施済み: `docs/script-studio-quota-event-plan.md`。DB / API contract / write service / enforcement 変更なし。
- Phase S4: freeze / quota / cost control。
- Phase S5: personalization / learning history。

推奨順:

1. まず local type と pure helper を作る。
2. 既存の readiness / practice chunks helper と接続する。
3. 外部生成より先に static / mock draft で UI を確認する。
4. freeze 条件を固めてから OpenAI generation を足す。
5. regenerate UX を広げる前に quota / cost control を入れる。

## 12. 成功条件

- ユーザーが最初から明確な英語文を持っていなくても始められる。
- アプリが選択肢で意図を整理できる。
- 出力が汎用翻訳ではなく、Native Minute の練習形式に合う。
- 音声生成前に script の品質を確認できる。
- ユーザー要求が青天井にならない。
- frozen script が `listen / record / review` に自然につながる。
- practice chunks、playback speed、weak word review、readiness guidance が同じ学習対象を説明している。
