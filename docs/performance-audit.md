# Performance Audit

## 1. Current performance concern

Native Minute の次の重点は、見た目の polish ではなく体感速度です。現状の build size は大きすぎる状態ではなく、遅さの主因候補は以下に寄っています。

- auth / middleware / server component で毎回 Supabase user を確認する待ち時間
- `getProgressOverview` が複数画面で全 script / 全 take / weak words / coach feedback を hydrate すること
- listen / record / review / progress で、初期表示に必要以上の progress summary や audio library summary を読んでいる可能性
- 録音 upload -> storage download -> transcription -> pronunciation -> coach -> atomic save を 1 request 内で同期実行していること
- protected audio player が保存済み録音を client fetch -> blob URL 化してから audio に渡すため、再生前の待ちが見えること
- external provider latency と Vercel cold start が UI 上で「押しても反応が遅い」と感じられやすいこと

`npm run build` の route size は最大でも `/scripts/new` の First Load JS 109 kB 程度で、巨大 client bundle だけが主原因とは見えません。

## 2. User-visible slow paths

- `/`
  - `getCurrentUser()` を server component で呼ぶため、Home でも Supabase auth check が入ります。
  - build 上の route size は小さいですが、未ログイン / ログイン済み分岐のため dynamic route です。
- `/scripts`
  - `getProgressOverview()` と `getVoiceSetupState()` を並列で実行します。
  - `getProgressOverview()` は全 scripts と全 takes 系 table を読んで hydrate します。5本表示に対して全履歴を読むため、履歴が増えると重くなります。
- `/scripts/new`
  - First Load JS が主要画面で最大です。`NewScriptWorkspace`、entry modes、AI draft panel、form が client 側に乗ります。
  - AI draft 生成は external OpenAI の可能性があり、生成ボタン押下後は provider latency がそのまま体感されます。
- `/scripts/[id]/listen`
  - 初期 server load で `getScript()` 後、`getVoiceSetupState()`、`getCachedListenAudio()`、`getProgressOverview()` を並列実行します。
  - `getCachedListenAudio()` 内でも script / default voice / cached script audio を読みます。page 側ですでに読んだ script と重複します。
  - お手本生成は cache miss 時に voice provider synthesize、app-owned storage upload、`script_audios` insert / lookup、quota event write を含みます。
- `/scripts/[id]/record`
  - 初期 server load で `getScript()` と `getProgressOverview()` を読みます。record の first action は録音なので、全体 progress hydrate は削減候補です。
  - 録音直後 preview は local blob 優先になっており、ここは改善済みです。
  - evaluate は upload 済み storage object を再 download してから transcription / pronunciation に渡すため、provider 待ちの前に storage 往復があります。
- `/scripts/[id]/review/[takeId]`
  - `getStoredReview()` のあと `getScriptTakeComparison()` と `getProgressOverview()` を別々に呼びます。
  - `getScriptTakeComparison()` も `getProgressOverview()` も `getHydratedReviews()` を通るため、takes / weak_words / coach_feedback の全件取得が重複する可能性があります。
  - 保存済み録音は `ProtectedAudioPlayer` が client fetch で blob 化するまで再生 UI が待ちます。
- `/progress`
  - `getProgressOverview()` で全履歴を hydrate します。
  - visible slots 最大5件に対して `listSavedModelAudios()` と `listSavedBestTakes()` を script ごとに `Promise.all` で呼びます。最大10追加 query なので、5 slots では許容範囲ですが、first view の体感を押し下げる候補です。
- login / callback / auth guard
  - middleware は protected route で `supabase.auth.getUser()` を呼びます。
  - page 側も `getCurrentUser()` / `getAuthState()` を呼ぶため、protected route では middleware と page の auth check が二重に見えます。

## 3. Route-level findings

`npm run build` の出力:

| route | size | first load JS | note |
| --- | ---: | ---: | --- |
| `/` | 189 B | 96.2 kB | dynamic; auth state check |
| `/scripts` | 1.16 kB | 97.1 kB | progress overview + voice setup |
| `/scripts/new` | 12.7 kB | 109 kB | largest page JS; script studio client workspace |
| `/scripts/[id]/listen` | 7.3 kB | 103 kB | listen panel client state + server progress/voice/cache reads |
| `/scripts/[id]/record` | 9.12 kB | 105 kB | MediaRecorder / upload / evaluate panel |
| `/scripts/[id]/review/[takeId]` | 4.46 kB | 100 kB | review data + comparison + progress overview |
| `/progress` | 2.41 kB | 98.4 kB | progress overview + audio library summaries |
| middleware | 74.9 kB | - | protected route auth guard |

Local production server timing without an authenticated session:

| path | status | total |
| --- | ---: | ---: |
| `/` | 200 | 106 ms |
| `/scripts` | 307 | 3 ms |
| `/progress` | 307 | 3 ms |
| `/scripts/new` | 307 | 3 ms |
| `/scripts/test-listen/listen` | 307 | 2 ms |
| `/scripts/test-record/record` | 307 | 2 ms |

This only measures unauthenticated redirect / public Home behavior. Authenticated data-loading timings require a seeded test session or production-safe instrumentation.

## 4. Client rendering / hydration findings

- Client component count is moderate, but some components are large:
  - `components/record/record-and-evaluate-panel.tsx`
  - `components/scripts/script-studio-mock-panel.tsx`
  - `components/voice/listen-panel.tsx`
  - `components/audio/protected-audio-player.tsx`
- `/scripts/new` ships the heaviest client surface because it includes entry mode state, templates, free writing form, and AI draft panel.
- `RecordAndEvaluatePanel` legitimately needs client JS for MediaRecorder, file input, preview URL, upload and evaluate actions.
- `ListenPanel` legitimately needs client JS for a single audio element, sticky controls, playback rate, generation action, and saved audio controls.
- `ProtectedAudioPlayer` currently fetches the protected file and creates a blob URL before showing audio controls. This protects owned resources but can feel slow, especially for multiple saved takes on Progress.
- Loading / skeleton states are basic. More immediate progress states would improve perceived speed without changing data contracts.

## 5. Server data loading / Supabase findings

- `getProgressOverview()` is the main server-side hotspot candidate.
  - It calls `listScripts()`.
  - It calls `getHydratedReviews()`.
  - `getHydratedReviews()` loads all user `takes`, all related `weak_words`, and all related `coach_feedback`, then hydrates in memory.
- `getProgressOverview()` is used by `/scripts`, `/listen`, `/record`, `/review`, and `/progress`.
- Review currently calls both `getScriptTakeComparison()` and `getProgressOverview()`. Both paths call `getHydratedReviews()`, so Review can duplicate full-history loading.
- Listen reads `getScript()` at page level and `getCachedListenAudio()` reads the script again internally. This is a low-risk duplicate query candidate.
- Progress reads saved model audios and saved best takes per visible slot. It is capped at 5 slots, but still creates up to 10 extra library queries on first render.
- Middleware and page-level auth checks both call Supabase auth in many protected routes. This is safe but adds overhead.

## 6. Audio / evaluation pipeline findings

- Record local preview is already local blob-first, so it no longer waits for upload / evaluate before the user can hear a fresh take.
- Upload path:
  - client sends FormData to `/api/uploads/recording`
  - server validates ownership by fetching script
  - server reads file into Buffer and uploads to Supabase Storage
- Evaluate path:
  - `/api/evaluate` is audio-first and thin
  - `createPersistedReview()` re-fetches server-owned script
  - `loadOwnedRecordingForEvaluation()` validates path, re-fetches owned script, downloads bytes from Storage
  - transcription provider runs
  - pronunciation provider runs
  - mock coach feedback is built
  - `persist_review_bundle` RPC saves atomically
  - saved review is re-fetched
- This is correct for data integrity, but expensive as a synchronous user wait. The biggest perceived wait is likely evaluate, not page bundle.
- Review / Progress saved recording playback uses protected replay routes. `/api/takes/[takeId]/audio` does not currently implement Range responses, while `/api/script-audio/[audioId]` does. Take replay is protected and works, but full blob fetch may feel slower on mobile.

## 7. External provider latency findings

- OpenAI transcription is a network call to `https://api.openai.com/v1/audio/transcriptions`. Latency depends on audio length and provider response time.
- Azure pronunciation assessment uses the Speech SDK and continuous recognition for roughly 1-minute recordings. This can be a major wait, especially after WAV normalization.
- Voice generation cache hit is comparatively cheap, but cache miss requires provider synthesize plus storage staging plus DB cache write.
- Script Studio AI generation can wait on OpenAI and quality pipeline.
- Vercel cold starts can affect API routes and dynamic pages, especially provider routes and first authenticated page hits.

## 8. Low-risk quick wins

These should not require DB schema, API contract, auth, ownership, or provider changes.

1. Add route-level timing logs in development only.
   - Wrap key service calls in small server-side timing helpers gated by env, without returning timing to users.
   - Target `/scripts`, `/listen`, `/record`, `/review`, `/progress`, `/api/evaluate`, `/api/speak-script`.
2. Add lighter progress summary service variants.
   - `/scripts`, `/listen`, and `/record` rarely need all review history.
   - Add service functions for latest/best summaries for selected scripts only, preserving existing canonical source.
3. Remove duplicate script reads in listen.
   - Pass already-loaded script into cached-audio lookup or add a helper that accepts script content and voice.
4. Defer Progress audio library details.
   - First render selected script latest/best and script text.
   - Load saved model audios / saved best takes only when `声のログを開く` is expanded, or only for selected script.
5. Review data loading consolidation.
   - Avoid calling full `getHydratedReviews()` twice on Review.
   - Use a script-scoped comparison helper or reuse loaded overview.
6. Improve perceived speed states.
   - More explicit "保存中 / 評価中 / 文字起こし中 / 発音確認中" staged status in Record.
   - Keep button disabled/loading feedback immediate.
7. Keep local blob preview first.
   - Already implemented; preserve this as a non-negotiable performance rule.
8. Delay heavy client panels on `/scripts/new`.
   - Render AI draft panel only after selecting AI mode. This already happens visually, but dynamic import can be considered later.

## 9. Medium-risk improvements

These need targeted verification because they can affect correctness or perceived data freshness.

1. Supabase query aggregation.
   - Replace multiple table reads with a targeted RPC/view for progress summaries.
   - Risk: changes query contract and may need migration.
2. Script-scoped progress functions.
   - For listen / record / review, fetch only the current script's latest/best/previous takes.
   - Risk: must keep Progress and Review semantics identical.
3. Route caching / revalidation review.
   - Current auth-owned data should remain dynamic. Some public pages could stay static.
   - Risk: accidental cache of user-owned data.
4. Protected take audio streaming.
   - Add Range support to `/api/takes/[takeId]/audio`, similar to script audio.
   - Risk: audio replay routes are ownership-sensitive; tests must cover unauthorized access and Safari.
5. Dynamic import for large optional client panels.
   - `/scripts/new` AI panel and account deletion panel are candidates.
   - Risk: loading boundaries and test selectors may drift.
6. Provider latency instrumentation.
   - Record server-side timing for transcription / pronunciation / voice synth / storage staging without storing raw audio or transcript.
   - Risk: privacy and metadata policy must stay tight.

## 10. High-risk / avoid for now

- DB schema / index / migration changes for performance without measured bottlenecks.
- Changing `/api/evaluate` response shape or making evaluation asynchronous with a job queue.
- Moving canonical source or progress aggregation to the client.
- Caching authenticated user-owned pages at route level.
- Changing auth / ownership / storage policy to make audio faster.
- Replacing protected audio with public signed URLs without a full access design.
- Changing provider connection strategy or external provider settings.
- Recomputing persisted scores or changing best take semantics as part of performance work.

## 11. Recommended next 3 implementation steps

1. Add development-only timing instrumentation and run a local authenticated timing pass.
   - Measure page service calls and `/api/evaluate` stages.
   - Do not persist raw user content, audio, transcript, or secret-derived data.
2. Reduce progress overview usage on `/listen` and `/record`.
   - Introduce a selected-script summary helper that fetches only what those screens need.
   - Keep `/progress` full overview as the canonical broad summary page.
3. Consolidate Review data loading.
   - Avoid duplicate full-history hydration by using one script-scoped data path for current / best / latest.
   - Preserve review data, canonical source, and best take ranking.

## 12. Step 1 timing instrumentation

Development-only timing instrumentation now exists in `lib/performance/timing.ts`.

- It logs `[timing] <label> <duration>ms`.
- It is enabled automatically when `NODE_ENV !== "production"`.
- In production it stays quiet unless `NATIVE_MINUTE_ENABLE_TIMING=1` is set for an intentional short measurement window.
- Labels are static route / service / stage names only. Do not add user ids, script text, transcript text, raw provider payloads, storage paths, or audio metadata to timing labels.

Initial timing points:

- Page loads: `listen.page.*`, `record.page.*`, `review.page.*`, `progress.page.*`.
- Progress services: `progress.overview`, `progress.hydratedReviews`, `progress.scriptTakeComparison`.
- Evaluate route / service: `evaluate.route.*`, `evaluate.script`, `evaluate.audioInput`, `evaluate.transcription`, `evaluate.pronunciation`, `evaluate.coach`, `evaluate.persistenceRpc`, `evaluate.refetchStoredReview`.
- Protected replay: `takesAudio.route.*`, `scriptAudio.route.*`, `recording.storageDownload`, `voice.replay.storageDownload`.
- Voice/listen audio: `voice.setupState`, `voice.cachedListenAudio.*`, `voice.speakScript.*`.

How to use locally:

```bash
NATIVE_MINUTE_ENABLE_TIMING=1 npm run dev
```

Then exercise authenticated routes and evaluate from the browser. Compare the stage labels before changing implementation. For production-like local checks:

```bash
npm run build
NATIVE_MINUTE_ENABLE_TIMING=1 npm run start
```

The first optimization pass should use these logs to decide whether to start with selected-script progress summaries, Review loading consolidation, Progress audio-library deferral, or protected audio replay tuning.

## 13. Measurement gaps

- No authenticated production timing was measured in this audit.
- No Supabase query timing was measured per table or per route.
- No provider latency timing was measured for OpenAI, Azure, ElevenLabs, or Vercel cold starts.
- No mobile Safari real-user timing was captured.
- No bundle analyzer is configured.
- Current smoke tests verify rendering / flow, not performance budgets.
