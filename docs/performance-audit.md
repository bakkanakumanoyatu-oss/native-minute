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
  - 初期 server load で `getScript()` 後、`getVoiceSetupState()`、`getCachedListenAudio()`、selected-script `getScriptProgressSummary()` を並列実行します。
  - `getCachedListenAudio()` 内でも script / default voice / cached script audio を読みます。page 側ですでに読んだ script と重複します。
  - お手本生成は cache miss 時に voice provider synthesize、app-owned storage upload、`script_audios` insert / lookup、quota event write を含みます。
- `/scripts/[id]/record`
  - 初期 server load で `getScript()` と selected-script `getScriptProgressSummary()` を読みます。全体 progress hydrate は外しています。
  - 録音直後 preview は local blob 優先になっており、ここは改善済みです。
  - evaluate は upload 済み storage object を再 download してから transcription / pronunciation に渡すため、provider 待ちの前に storage 往復があります。
- `/scripts/[id]/review/[takeId]`
  - 初期 server load で `getScript()` 後、selected-script `getScriptReviewProgressSummary()` を呼びます。
  - current take、best/latest comparison、status card 用 context は対象 script の hydrated reviews 1回から組み立てます。
  - 保存済み録音は `ProtectedAudioPlayer` が client fetch で blob 化するまで再生 UI が待ちます。
- `/progress`
  - `getProgressOverview()` で全履歴を hydrate します。
  - Audio Library は selected script の `listSavedModelAudios()` と `listSavedBestTakes()` だけを初期表示で読みます。
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
- `getProgressOverview()` is still used by `/scripts` and `/progress`. `/listen` and `/record` use selected-script `getScriptProgressSummary()`, and Review uses selected-script `getScriptReviewProgressSummary()`.
- Review derives current take, comparison, and progress context from one selected-script hydrated review set.
- Listen reads `getScript()` at page level and `getCachedListenAudio()` reads the script again internally. This is a low-risk duplicate query candidate.
- Progress reads saved model audios and saved best takes for the selected script only on first render.
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

## 13. Authenticated timing runbook

Use this runbook before changing performance-sensitive implementation. The goal is to capture authenticated timing labels for the existing flow, not to optimize during measurement.

### Safety setup

- Use local dev or a short, intentional production measurement window only.
- Do not paste user ids, script text, transcript text, storage paths, raw audio, raw provider responses, cookies, or secrets into notes.
- Development server logs timing automatically. Production logs timing only when `NATIVE_MINUTE_ENABLE_TIMING=1`.
- Prefer mock providers for local route timing unless the target is specifically provider latency.

Local dev:

```bash
NATIVE_MINUTE_ENABLE_TIMING=1 npm run dev
```

Optional local helper, after logging in in the same target origin or after creating `tests/e2e/.auth/user.json`:

```bash
PERFORMANCE_TIMING_BASE_URL=http://localhost:3000 \
PERFORMANCE_TIMING_SCRIPT_ID=<script-id> \
PERFORMANCE_TIMING_TAKE_ID=<take-id> \
npm run performance:timing-smoke
```

The helper prints HTTP status and request duration only. It does not print cookie values, script text, transcript, storage paths, or response bodies. The authoritative timings are still the app server console `[timing]` lines.

### Measurement order

1. Open `/scripts`.
   - Watch: `progress.overview`, `progress.hydratedReviews`, plus any page-level script list labels if added later.
   - If this is slow, the likely next step is selected-list / lightweight practice summary work.
2. Open one script's `/scripts/[id]/listen`.
   - Watch: `listen.page.script`, `listen.page.voiceSetup`, `listen.page.cachedAudio`, `listen.page.progressSummary`, `progress.scriptSummary`, `progress.hydratedReviewsForScript`, `voice.cachedListenAudio.*`.
   - If `listen.page.progressSummary` dominates, inspect the selected-script summary query shape before reintroducing broad overview loading.
   - If `voice.cachedListenAudio.*` dominates, inspect duplicate script/default voice/cache lookup cost.
3. Open `/scripts/[id]/record`.
   - Watch: `record.page.script`, `record.page.progressSummary`, `progress.scriptSummary`, `progress.hydratedReviewsForScript`.
   - If `record.page.progressSummary` dominates, inspect the selected-script summary query shape before reintroducing broad overview loading.
4. Record or upload a short test take, then evaluate.
   - Watch: `evaluate.route.auth`, `evaluate.route.validation`, `evaluate.audioInput`, `recording.storageDownload`, `evaluate.transcription`, `evaluate.pronunciation`, `evaluate.coach`, `evaluate.persistenceRpc`, `evaluate.refetchStoredReview`.
   - If provider labels dominate, prioritize staged feedback / perceived-speed UI before changing provider behavior.
   - If `recording.storageDownload` dominates, inspect storage replay/download cost before touching evaluation semantics.
5. Open `/scripts/[id]/review/[takeId]`.
   - Watch: `review.page.progressSummary`, `progress.scriptReviewSummary`, `progress.hydratedReviewsForScript`.
   - If `progress.hydratedReviewsForScript` dominates, inspect the selected-script query shape or fields read by Review.
6. Play the saved recording from Review.
   - Watch: `takesAudio.route.auth`, `takesAudio.route.storedReview`, `takesAudio.route.recordingDownload`, `recording.storageDownload`.
   - If this dominates, consider take audio replay / Range / loading UX work.
7. Open `/progress`.
   - Watch: `progress.page.overview`, `progress.page.audioLibrary`, `progress.audioLibrarySelectedScript`, `progress.overview`, `progress.hydratedReviews`.
   - If audio library labels dominate first view, consider deferring library detail reads.
8. Play saved recordings or saved model audio from Progress.
   - Take audio: `takesAudio.route.*`, `recording.storageDownload`.
   - Script audio: `scriptAudio.route.*`, `voice.replay.storageDownload`.

### What to record

Record three runs per target when possible:

- First authenticated hit after server start.
- Second hit after refresh.
- Same flow after one record -> evaluate -> review cycle.

Use a small table:

| Target | Label | Run 1 | Run 2 | Run 3 | Note |
| --- | ---: | ---: | ---: | --- |
| `/progress` | `progress.overview` | | | | |

Notes should describe stage names only, for example "progress overview dominates" or "Azure pronunciation dominates." Do not paste user-owned content.

### Next optimization decision rules

- `progress.scriptSummary` / `progress.hydratedReviewsForScript` dominate Listen or Record: inspect selected-script query shape or reduce fields read by those pages.
- `review.page.progressSummary` / `progress.scriptReviewSummary` dominate Review: inspect selected-script query shape or reduce fields read by Review.
- `progress.page.audioLibrary` / `progress.audioLibrarySelectedScript` dominate `/progress`: defer Audio Library details further or move them behind the opened log details.
- `takesAudio.route.recordingDownload` / `recording.storageDownload` dominate replay: inspect take audio replay strategy, Range support, or player loading UX.
- `evaluate.transcription` / `evaluate.pronunciation` dominate: prioritize staged feedback / async-feel UI before provider or scoring changes.
- `voice.speakScript.providerSynthesize` dominates cache miss: improve generation feedback and cache-hit reuse visibility before provider contract changes.
- Middleware/page auth dominates every protected route: investigate auth timing carefully, but do not cache user-owned pages or weaken ownership checks.

## 14. Measurement gaps

- No authenticated production timing was measured in this audit.
- No Supabase query timing was measured per table or per route.
- No provider latency timing was measured for OpenAI, Azure, ElevenLabs, or Vercel cold starts.
- No mobile Safari real-user timing was captured.
- No bundle analyzer is configured.
- Current smoke tests verify rendering / flow, not performance budgets.

## 15. Local authenticated timing run 2026-05-26

This run used local `next dev` with timing enabled, an existing E2E auth storage state, and mock providers:

- `NATIVE_MINUTE_ENABLE_TIMING=1`
- `VOICE_PROVIDER=mock`
- `TRANSCRIPTION_PROVIDER=mock`
- `PRONUNCIATION_PROVIDER=mock`

The run created a test script, mock voice, mock script audio, uploaded a fixture recording, evaluated three takes, and hit the main authenticated routes three times. Script ids, take ids, cookies, storage keys, transcript text, and raw response bodies were not recorded in this report.

### Client request durations

The first route hit may include `next dev` compile cost. Warm runs are more useful for implementation prioritization.

| Target | Run 1 | Run 2 | Run 3 | Notes |
| --- | ---: | ---: | ---: | --- |
| `/scripts` | 1944ms | 233ms | 276ms | Run 1 includes compile. |
| `/scripts/[id]/listen` | 1466ms | 306ms | 295ms | Warm route is sub-350ms locally. |
| `/scripts/[id]/record` | 800ms | 298ms | 286ms | Warm route is sub-300ms locally. |
| `/scripts/[id]/review/[takeId]` | 977ms | 431ms | 477ms | Review remains heavier than listen/record. |
| take audio replay | 638ms | 340ms | 586ms | Protected recording replay is variable. |
| script audio replay | 838ms | 295ms | 810ms | Script audio replay is variable. |
| `/progress` | 677ms | 687ms | 403ms | Progress stays comparatively heavier. |

### Server timing highlights

| Area | Labels | Observed range | Interpretation |
| --- | --- | ---: | --- |
| Scripts page | `progress.overview`, `progress.hydratedReviews` | 109-470ms | Warm overview is moderate, first post-compile route was higher. |
| Listen page | `listen.page.cachedAudio`, `listen.page.progressOverview` | 101-111ms / 118-127ms | Both are visible but not dominant in local mock timing. |
| Record page | `record.page.progressOverview` | 108-179ms | Selected-script summary could still reduce repeated work, but this was not the biggest warm cost. |
| Review page | `review.page.storedReview`, `review.page.comparison`, `review.page.progressOverview` | 100-206ms / 95-182ms / 44-79ms | Review still does duplicated history-oriented work; consolidation remains useful. |
| Progress page | `progress.page.overview`, `progress.page.audioLibrary` | 107-129ms / 174-249ms | Audio Library reads were consistently larger than overview on Progress. |
| Take audio replay | `takesAudio.route.storedReview`, `takesAudio.route.recordingDownload` | 102-156ms / 100-242ms | Replay latency is split between stored review lookup and storage download. |
| Script audio replay | `scriptAudio.route.loadReplay`, `voice.replay.storageDownload` | 165-488ms / 120-429ms | Script audio storage download was the largest replay label. |
| Evaluate mock pipeline | `evaluate.audioInput`, `recording.storageDownload`, `evaluate.persistenceRpc`, `evaluate.refetchStoredReview` | 570-723ms / 488-666ms / 124-294ms / 208-225ms | With mock providers, storage download plus persistence/refetch dominate evaluate. |

### What this run suggests

1. For page load speed, `/progress` should likely start with Audio Library deferral or selected-slot-only Audio Library reads. In this run, `progress.page.audioLibrary` was larger than `progress.page.overview`.
2. For listen/record page load, selected-script summary is still a low-risk improvement, but the local warm `progress.overview` cost was around 100-180ms rather than multi-second.
3. Review loading consolidation is justified because Review still loads stored review, comparison, and progress summary separately. The duplicate work is measurable, though not the single largest local cost.
4. For evaluate wait, storage download and save/refetch are the mock-provider bottlenecks. Real OpenAI/Azure timing still needs a separate provider-latency run before changing provider behavior.
5. Protected audio replay is variable enough to keep on the shortlist, especially `voice.replay.storageDownload` and `recording.storageDownload`.

### Recommended next implementation order from this run

1. Defer or narrow Progress Audio Library reads to selected slot / opened log details.
2. Add selected-script summary for Listen and Record, preserving Progress as the broad overview page.
3. Consolidate Review data loading so current / best / latest are derived through one script-scoped path.
4. Add a separate real-provider timing run only if provider latency, not local mock route latency, becomes the next decision point.

## Progress Audio Library deferral step

The first optimization pass narrows `/progress` Audio Library reads to the selected script only.

Before this step, `/progress` loaded saved model audios and saved best takes for every visible slot on initial render. With five visible slots, that meant up to five `listSavedModelAudios()` calls and five `listSavedBestTakes()` calls before the page could finish rendering.

After this step, `/progress` still loads the broad progress overview for the five-slot shelf, but Audio Library details are loaded only for the selected script. The selected script's latest take, best take, saved best takes, and saved model audios remain available in the detail area. Other slots keep their lightweight shelf cards until selected.

Timing labels:

- `progress.page.audioLibrary`: preserved for before/after comparison, now measuring selected-script Audio Library loading.
- `progress.audioLibrarySelectedScript`: nested timing for the selected script's saved model audio and saved best take reads.

This does not change DB schema, API contracts, ownership checks, storage policy, best-take semantics, or progress aggregation.

### Post-change local timing

Measured on 2026-05-26 with `NATIVE_MINUTE_ENABLE_TIMING=1`, mock providers, and an authenticated local timing smoke.

| Target / label | Run 1 | Run 2 | Run 3 | Notes |
| --- | ---: | ---: | ---: | --- |
| `/progress` client duration | 1519ms | 444ms | 352ms | Run 1 includes dev compile. |
| `progress.page.overview` | 430ms | 154ms | 119ms | Overview is unchanged broad progress loading. |
| `progress.page.audioLibrary` | 243ms | 167ms | 118ms | Now selected-script only; previous warm range was 174-249ms for all visible slots. |
| `progress.audioLibrarySelectedScript` | 243ms | 167ms | 118ms | New nested label for selected script library reads. |

The warm result shows the Audio Library stage is now scoped to one selected script. It is still visible enough that moving saved audio details behind the opened log details could be a later refinement, but the initial all-slot fan-out is removed.

## Listen / Record selected-script summary step

The second optimization pass removes broad `getProgressOverview()` loading from `/scripts/[id]/listen` and `/scripts/[id]/record`.

Before this step, both pages loaded the target script and then called `getProgressOverview()`, which hydrated all user scripts and all persisted takes / weak words / coach feedback. The pages only used the selected script's latest take, best comparison, improvement trend, and Focus words.

After this step, both pages call `getScriptProgressSummary()` with the already-owned script row. That helper hydrates only takes, weak words, and coach feedback for the selected script, then reuses the same latest / best / diff ranking helpers as the broad overview.

Timing labels:

- `listen.page.progressSummary`: selected-script progress summary on Listen.
- `record.page.progressSummary`: selected-script progress summary on Record.
- `progress.scriptSummary`: service-level selected script summary timing.
- `progress.hydratedReviewsForScript`: selected script take / weak words / coach feedback hydration.

This does not change DB schema, API contracts, ownership checks, storage policy, best-take ranking, progress aggregation semantics, or persisted review data.

### Post-change local timing

Measured on 2026-05-26 with `NATIVE_MINUTE_ENABLE_TIMING=1`, mock providers, an authenticated local timing smoke, and an E2E seed script.

| Target / label | Run 1 | Run 2 | Run 3 | Notes |
| --- | ---: | ---: | ---: | --- |
| `/scripts/[id]/listen` client duration | 918ms | 373ms | 292ms | Run 1 includes dev compile. |
| `listen.page.progressSummary` | 198ms | 153ms | 61ms | Replaces broad `listen.page.progressOverview`. |
| `listen.page.cachedAudio` | 288ms | 173ms | 96ms | Voice/cache lookup remains visible. |
| `/scripts/[id]/record` client duration | 561ms | 231ms | 264ms | Run 1 includes dev compile. |
| `record.page.progressSummary` | 78ms | 71ms | 95ms | Replaces broad `record.page.progressOverview`. |

The warm result shows Listen and Record no longer emit `listen.page.progressOverview` or `record.page.progressOverview`. They now hydrate only the selected script's persisted review context.

## Review data loading consolidation step

The third optimization pass removes the duplicated Review loading path from `/scripts/[id]/review/[takeId]`.

Before this step, Review loaded the current stored review, then loaded script comparison through `getScriptTakeComparison()`, then loaded broad `getProgressOverview()` to recover latest / best / status-card context. That meant Review could read persisted take context through multiple paths, including full-history hydration.

After this step, Review calls `getScriptReviewProgressSummary()` once after loading the owned script. The helper hydrates persisted takes, weak words, and coach feedback for the selected script, then derives:

- the current hydrated take review
- latest take and best take context
- current-vs-best comparison
- take count and improvement trend for the status card

Timing labels:

- `review.page.progressSummary`: page-level selected-script Review summary.
- `progress.scriptReviewSummary`: service-level Review summary.
- `progress.hydratedReviewsForScript`: selected script take / weak words / coach feedback hydration.

This keeps persisted review tables as the canonical source and does not change score calculation, best-take ranking, DB schema, API contracts, ownership checks, storage policy, or audio replay logic.

### Post-change local timing

Measured on 2026-05-26 with `NATIVE_MINUTE_ENABLE_TIMING=1`, mock providers, an authenticated local timing smoke, and a freshly evaluated E2E seed take.

| Target / label | Run 1 | Run 2 | Run 3 | Notes |
| --- | ---: | ---: | ---: | --- |
| `/scripts/[id]/review/[takeId]` client duration | 576ms | 207ms | 238ms | Run 1 includes dev compile. |
| `review.page.progressSummary` | 91ms | 54ms | 51ms | Replaces stored review + comparison + broad progress overview page path. |
| `progress.scriptReviewSummary` | 91ms | 54ms | 51ms | Service-level consolidated Review summary. |
| `progress.hydratedReviewsForScript` | 91ms | 54ms | 51ms | Selected script persisted review hydration. |
| take audio replay client duration | 646ms | 347ms | 328ms | Audio replay remains a separate visible cost. |

The warm result shows Review no longer emits `review.page.storedReview`, `review.page.comparison`, or `review.page.progressOverview`. The remaining visible cost after page load is protected take audio replay.

## Protected take audio replay feedback step

The fourth optimization pass improves the perceived wait for saved take playback without changing the protected replay route or storage policy.

Before this step, `ProtectedAudioPlayer` fetched `/api/takes/[takeId]/audio`, converted the response to a Blob URL, and only then rendered native audio controls. This protects owned recordings, but on mobile the user could see only a short text message while the client fetch, server ownership check, storage download, blob conversion, and audio element setup happened.

After this step, the player still uses the same protected URL and the same client-side Blob URL flow, but it now shows explicit states:

- `準備中`: fetch/blob preparation has started.
- `準備できました`: the Blob URL is ready and native audio controls are visible.
- Error state: failed playback fetch shows a retry button.

Development-only client timing labels were added:

- `protectedAudio.client.fetch`: client fetch duration for the protected replay route.
- `protectedAudio.client.blob`: browser Blob conversion duration.
- `protectedAudio.client.ready`: total time from player mount to Blob URL readiness.

The labels are static and do not include take ids, storage paths, script text, transcript text, cookies, raw audio, or response bodies. They only log when `NODE_ENV !== "production"`, so production user-facing behavior and logs stay quiet unless a local/dev timing run is being performed.

This does not change DB schema, API contracts, auth, ownership checks, storage access, storage policy, Range behavior, signed URL strategy, or audio replay authorization.

### Post-change local timing

Measured on 2026-05-26 with `NATIVE_MINUTE_ENABLE_TIMING=1`, mock providers, an authenticated local timing smoke, and a freshly evaluated E2E seed take.

| Target / label | Run 1 | Run 2 | Run 3 | Notes |
| --- | ---: | ---: | ---: | --- |
| take audio replay client request | 596ms | 342ms | 337ms | Route-level request timing from `performance:timing-smoke`; run 1 includes compile. |
| `takesAudio.route.storedReview` | 112ms | 116ms | 105ms | Stored review lookup remains part of the protected ownership path. |
| `takesAudio.route.recordingDownload` | 158ms | 123ms | 127ms | Storage download remains the server-side replay cost. |
| `recording.storageDownload` | 96ms | 75ms | 74ms | Supabase Storage download inside the protected route. |

A browser smoke of Review confirmed the player renders audio controls, the `準備できました` state appears, and the development-only client labels `protectedAudio.client.fetch`, `protectedAudio.client.blob`, and `protectedAudio.client.ready` are emitted. Progress with a selected script also rendered saved recording audio controls, but it can mount multiple saved-take players at once. If replay remains a perceived bottleneck there, the next low-risk candidate is to load saved-take players only when the user opens or requests them.

### Follow-up candidates

- If `takesAudio.route.recordingDownload` / `recording.storageDownload` remain dominant, consider Range support for `/api/takes/[takeId]/audio` as a medium-risk change with ownership tests.
- If Progress mounts several saved-take players, consider lazy loading the audio blob only after the user asks to hear a take.
- If client `protectedAudio.client.blob` dominates on large recordings, consider streaming or a signed-download strategy only after a separate security review.
- If latency is acceptable but still feels slow, add more staged copy around Review / Progress playback rather than changing storage behavior.

## Progress audio player lazy-load step

The second performance round keeps the protected replay route unchanged and delays Progress audio blob preparation until the user asks to hear a specific item.

Before this step, `/progress` rendered `ProtectedAudioPlayer` for the selected script's latest take, best take, previous take, saved best takes, and saved model audios as soon as those sections mounted. Each mounted player immediately fetched the protected URL and converted it into a Blob URL. A selected script with several saved recordings could therefore start multiple protected fetches at once.

After this step:

- `ProtectedAudioPlayer` supports an opt-in `lazy` mode.
- Progress passes `lazy` for latest / best / previous / saved best take / saved model audio players.
- Lazy players initially render a `聞く` button and do not fetch the protected audio.
- Pressing the button mounts the same fetch/blob flow, preserving `準備中`, `準備できました`, error, retry, playback rate, and development-only client timing states.
- Review keeps immediate playback behavior, because the first-view saved recording is part of the main Review task.

This does not change DB schema, API contracts, auth, ownership checks, storage access, storage policy, Range behavior, signed URL strategy, best-take logic, progress aggregation, or audio replay authorization.

### Expected measurement impact

Route-level `/progress` timing is not expected to change much because this is a client-side fetch deferral. The expected win is fewer immediate `takesAudio.route.*`, `scriptAudio.route.*`, `recording.storageDownload`, and `voice.replay.storageDownload` calls after `/progress` renders. In dev, those labels should appear only after the corresponding Progress `聞く` button is pressed.

### Post-change local smoke

Measured on 2026-05-26 with `NATIVE_MINUTE_ENABLE_TIMING=1`, mock providers, and an authenticated local Playwright smoke.

| Check | Result |
| --- | --- |
| `/progress?scriptId=...` initial render | `audio` elements: 0, protected audio requests: 0 |
| After pressing `この Take を聞く` | `audio` elements: 1, `準備できました`: 1, one `/api/takes/[takeId]/audio` request |
| Review saved recording | immediate audio player still appears; lazy button count: 0 |

The smoke confirms Progress no longer starts protected audio blob preparation on initial render, while Review keeps immediate playback.
