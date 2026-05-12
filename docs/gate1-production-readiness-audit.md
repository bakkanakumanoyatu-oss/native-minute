# Gate 1 Production Readiness Audit

Gate 1 は、Native Minute v1 を App Store / Google Play 包装へ進める前に、Next.js Web core を production に置けるかを確認する棚卸しです。ここでは実装変更、DB migration、provider contract 変更、Capacitor 導入は行わない。

## Scope

- 対象: Web production readiness、provider/env guard、Supabase Storage / RLS / ownership、quota / cost guard、failure handling、privacy / deletion / support、content / UX release readiness。
- 非対象: ElevenLabs / OpenAI / Azure の追加実装、DB schema 変更、RLS policy 変更、production deploy、Capacitor、store listing 最終文言。
- Provider 役割:
  - ElevenLabs: voice clone / model audio generation / protected replay source。
  - OpenAI: transcription / Script Studio generation / coaching-adjacent generation。
  - Azure: pronunciation evaluator。

## Summary

Gate 0 auth smoke は完了扱い。UX-R1〜UX-R5 で practice-first の情報設計と visual polish は一段整った。S12/S13 で `TRANSCRIPTION_PROVIDER=openai` + `PRONUNCIATION_PROVIDER=azure` の human microphone path は `record -> evaluate -> review -> progress` まで通過済み。ElevenLabs も clone voice / script TTS / cache hit / Audio Library metadata まで実ブラウザで確認済み。Gate 0 後の再開 smoke でも `/setup/voice -> /scripts/[id]/listen -> /api/speak-script -> /api/script-audio/[audioId]` は 200 で通り、見本音声は再生できた。今回の再開 smoke だけでは2回目生成が DB 上の cache reuse だったかは断定しないため、必要なら cost guard / cache behavior の spot check として別途確認する。

ただし Gate 1 の結論は **Web beta は `GO WITH WARNINGS`、full GO / Store ready ではない**。Gate1a で production provider/env preflight と runtime guard、Gate1b で Supabase / Storage / RLS runbook/checker と protected replay / cross-user ownership proof、Gate1c で quota / cost guard decision と env kill switch、Gate1d で privacy / support / account deletion actual path decision、Gate1e で Web beta 用 public draft route、Gate1f で Web beta manual QA runbook、Gate1g で provider budget / kill switch operations の runbook と proof template、Gate1h で deploy / rollback / smoke runbook、Gate1i で release candidate proof / deploy log template、Gate1j で final human-check batch runbook、Gate1k で final no-go checklist / human-check execution packet、Gate1l で owner acceptance / Azure live smoke 記録、RR-3a で actual account deletion implementation plan、RR-3b で ElevenLabs provider cleanup actual 境界、RR-3c で Storage cleanup actual 境界、RR-3d で DB cleanup / anonymize actual 境界、RR-3e で Supabase Auth deletion actual 境界、RR-3f で destructive audit / operator runbook と proof template、RR-3g で operator/admin execution surface design、RR-3h で internal CLI runner skeleton、RR-3i で fake-first stage service seam、RR-3j で final safety review、RR-3k で safe request resolver / wrapper seam、RR-3l で read-only request resolver / status proof、RR-3m で disposable proof request selection、RR-3n で fake-only proof log rehearsal、RR-3o で sample proof package、RR-3p で disposable fixture / dry-run proof checklist、RR-3q で read-only / fake-only final evidence sequence、RR-3r で future disposable proof package empty template は追加済み。RR-3 / Gate 1 の consolidated inventory は [current status inventory](./rr-3-gate1-current-status-inventory.md) に分けた。2026-05-10 の Azure update で、Azure Speech resource / region / quota / usage visibility と pay-as-you-go upgrade は PASS。2026-05-11 の Azure pronunciation live smoke も PASS。support contact / deletion SLA / Supabase Storage usage visibility も PASS。OpenAI project separation / app-side hard cap、ElevenLabs alert、legal/support draft clarity は WARN だが、release owner が small-cohort Web beta では受容した。account deletion completion path の disposable live proof は Store submission blocker として残る。

## Readiness Matrix

| Area | Current state | Web production before public | Store submission before review | Capacitor before wrapper | v1.1+ |
| --- | --- | --- | --- | --- | --- |
| Main loop | Script Studio -> listen -> record -> review -> progress は mock と real eval provider で通過済み。 | 本番 env で smoke を再実行する。 | 実機で同じ loop を確認する。 | iOS / Android WebView の recording / playback を確認する。 | 履歴や比較 UI の拡張。 |
| Auth | Gate 0 human smoke passed。magic link rate limit copy あり。 | Supabase Auth redirect allowlist、production origin、email template、logout/login repeated smoke。 | account deletion / support 導線と整合。 | universal link / deep link 方針を決める。 | native auth UX polish。 |
| Provider guard | Gate1a で `npm run production:preflight` と runtime provider guard を追加済み。strict production では mock provider と E2E/test helper env を blocked にする。 | deploy 前に preflight を必ず実行し、runtime でも `mock` 混入を止める。 | 同左。 | native build env でも同じ guard。 | per-provider health dashboard。 |
| OpenAI transcription | local WAV と human mic smoke passed。 | production key、quota、model、failure logging、cost budget を確認。 | mobile mic + OpenAI transcript smoke。 | WebView recording と upload を確認。 | transcription quality tuning。 |
| Script Studio OpenAI | live smoke / quality audit passed。quota event は logging only。 | production key、rate/cost budget、mock guard、raw text privacy spot check。 | store screenshot / onboarding で AI が主役に見えすぎない確認。 | WebView 影響は小さい。 | prompt quality loop。 |
| Coaching | persisted coach feedback は mock helper 由来。OpenAI coaching live provider は未分離。 | v1 で mock-derived coach のまま出すか、OpenAI coaching を正式化するか判断。 | 表示文言で「AI coach」と言い切りすぎない。 | 影響小。 | coaching provider 実装。 |
| Azure evaluator | local WAV / human mic smoke passed。 | production Azure resource、region、quota、PCM conversion、timeout/failure spot check。 | real mobile browser / WebView smoke。 | iOS Safari / Android Chrome / WebView の mic format。 | prosody tuning。 |
| ElevenLabs voice | clone voice / TTS / cache hit / Audio Library metadata passed。 | production key、quota/billing、provider failure targeted smoke、cleanup policyの実装判断。 | voice clone consent / data deletion policy を明示。 | microphone sample upload と replay in WebView。 | provider cleanup automation / style quality。 |
| Supabase DB | migrations 0001〜0012 あり。dev DB smoke は複数通過。Gate1b runbook / non-destructive checker 追加済み。 | production apply / schema reload / types alignment を維持確認。 | data deletion and privacy policy と整合。 | same backend を使うなら追加なし。 | observability / admin tools。 |
| Storage / replay | private buckets + user prefix policy + protected replay。Gate1b checker は bucket 存在と private 設定を確認し、human protected replay / cross-user ownership proof は PASS 済み。 | production bucket / policy / object count を維持確認。 | audio retention / deletion policy を公開。 | WebView upload/playback smoke。 | storage lifecycle automation。 |
| Quota / cost | Gate1c で `private_beta/small_cohort` 方針、production preflight の `public_free` block、OpenAI / Azure / ElevenLabs / Storage upload kill switch を追加済み。Gate1g で provider dashboard proof template / runbook と人間 proof を追加済み。Azure Speech dashboard/resource visibility、Azure pronunciation live smoke、Supabase Storage usage / egress は PASS。quota_events は logging only。 | OpenAI dedicated project / app-side hard cap、ElevenLabs alert は WARN だが、release owner が small-cohort Web beta では app-side limits / manual monitoring / kill switch で受容。 | store 前にも cost abuse 対策を説明可能にする。 | same guard を native env へ。 | DB-backed quota / usage dashboard / billing。 |
| Account deletion | request/status/confirm/inventory/job dry-run/preflight まで。RR-3a で stage order、RR-3b で ElevenLabs provider cleanup actual 境界、RR-3c で Storage cleanup actual 境界、RR-3d で DB cleanup / anonymize actual 境界、RR-3e で Supabase Auth deletion actual 境界、RR-3f で destructive proof runbook、RR-3g で operator/admin execution surface design、RR-3h で internal CLI runner skeleton、RR-3i で fake-first stage service seam、RR-3j で final safety review、RR-3k で safe request resolver / wrapper seam、RR-3l で status/summary 用 read-only request resolver、RR-3m で disposable proof candidate 条件、RR-3n で fake-only proof log rehearsal、RR-3o で sample proof package、RR-3p で disposable fixture / dry-run proof checklist、RR-3q で final non-destructive evidence sequence、RR-3r で future live proof empty template は固定済み。CLI は status/summary で request lifecycle と proof candidate を safe summary として読め、fake-only rehearsal は provider -> Storage -> DB -> Auth -> completion の safe proof log を出せるが、provider / Storage / DB / Auth の real actual stage services は未接続。real delete は destructive guard なしでは呼ばれず、public 実削除 UI / API は未実装。 | Web beta は request-based + support/manual cleanup で small cohort なら許容可能。Web public は completion process / SLA が必要。 | store submission では actual account/data deletion completion path の disposable live proof が blocker。 | native settings から導線必須。 | self-serve export / granular delete。 |
| Privacy / policy | Gate1d で user data inventory / external processor map / route plan を整理し、Gate1e で `/privacy`、`/terms`、`/support`、`/support/account-deletion` の Web beta draft route を追加済み。support contact と deletion SLA は 2026-05-10 に PASS。 | Draft route は WARN。copy clarity と formal legal review は正式公開前に必要。 | Apple privacy / Google Data safety 入力と actual deletion completion path が必須。 | in-app links 必須。 | legal review refresh。 |
| Content / UX | UX-R complete。templates は original 3 件。Gate1f で production-like manual QA runbook を追加済み。 | Gate1f runbook に沿って clean/existing account、main loop、mobile browser、legal/support pages を人間確認する。 | Store screenshots 用の魅力と初期 script 数は強く推奨。 | mobile first view QA 必須。 | template expansion / onboarding。 |

## Production Env Checklist

必須 env:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL` with exact production origin
- `TRANSCRIPTION_PROVIDER=openai`
- `PRONUNCIATION_PROVIDER=azure`
- `VOICE_PROVIDER=elevenlabs`
- `SCRIPT_GENERATION_PROVIDER=openai` if real AI draft is enabled in production
- `OPENAI_API_KEY`
- `OPENAI_TRANSCRIPTION_MODEL`
- `OPENAI_SCRIPT_GENERATION_MODEL`
- `AZURE_SPEECH_KEY`
- `AZURE_SPEECH_REGION`
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_TTS_MODEL_ID`
- `NATIVE_MINUTE_LAUNCH_MODE=private_beta` or `small_cohort`

Production で避けるもの:

- `VOICE_PROVIDER=mock`
- `TRANSCRIPTION_PROVIDER=mock`
- `PRONUNCIATION_PROVIDER=mock`
- `SCRIPT_GENERATION_PROVIDER=mock` if AI draft is presented as real generation
- `E2E_TEST_SECRET / E2E_TEST_EMAIL / E2E_TEST_PASSWORD`

Emergency kill switches:

- `NATIVE_MINUTE_DISABLE_OPENAI=1`
- `NATIVE_MINUTE_DISABLE_AZURE=1`
- `NATIVE_MINUTE_DISABLE_ELEVENLABS=1`
- `NATIVE_MINUTE_DISABLE_STORAGE_UPLOADS=1`

- Gate1a で追加済み:
  - `npm run production:preflight`
  - strict production runtime guard (`VERCEL_ENV=production`、`NATIVE_MINUTE_ENV=production`、または `NATIVE_MINUTE_PRODUCTION_GUARD=1`)
  - production で `VOICE_PROVIDER=elevenlabs`、`TRANSCRIPTION_PROVIDER=openai`、`PRONUNCIATION_PROVIDER=azure`、`SCRIPT_GENERATION_PROVIDER=openai` 以外を blocked にする provider guard
  - production で `E2E_TEST_SECRET / E2E_TEST_EMAIL / E2E_TEST_PASSWORD` が存在する場合の preflight block
  - production では E2E/test login helper を runtime で無効化

不足:

- production origin と Supabase Auth redirect allowlist を確認する runbook が未固定。

## Provider Readiness

### OpenAI

Ready:

- Transcription は local WAV / human mic で review / progress まで通過済み。
- Script Studio generation は live smoke / quality audit / UI smoke 通過済み。
- Raw seed / generated full text / raw provider response / secret は quota metadata に保存しない方針で spot check 済み。

Not ready:

- production quota / billing / rate limit budget が未固定。
- production mock guard は Gate1a で追加済み。deploy 前の実行運用は未固定。
- coaching は persisted feedback generation としては mock helper 境界にあり、OpenAI coaching provider としての readiness は未確定。

### Azure

Ready:

- Azure pronunciation evaluator は live 実装済み。
- `TRANSCRIPTION_PROVIDER=openai` + `PRONUNCIATION_PROVIDER=azure` は human microphone smoke passed。
- Empty transcript / env missing failure は safe error で切り分け済み。

Not ready:

- production Azure resource / region / quota / timeout の本番 smoke 未実施。
- mobile Safari / Android Chrome / WebView の browser-side wav/PCM normalization は未完了。

### ElevenLabs

Ready:

- Clone voice creation、script TTS、protected replay、cache hit / non_billable、fresh Audio Library metadata は確認済み。
- `natural / expressive / clear / slow` は別 cache key / 別 `script_audios` row として確認済み。
- v1 mainline の voice provider は ElevenLabs として docs / copy 上の整理済み。
- Gate 0 後の `/setup/voice -> listen` 再開 smoke では、setup page、listen page、speak-script route、protected replay route が 200 で通り、見本音声の再生と2回目生成 / 再生は実用上問題なし。

Not ready:

- production key / quota / billing / provider rate limit smoke は未実施。
- provider cleanup actual deletion は未実装。
- verification required / deleted voice / billing issue / rate limit の targeted live smoke は未完了。
- OpenAI voice provider code は残っているが、Gate1a 以降の strict production では `VOICE_PROVIDER=elevenlabs` 以外は blocked。
- 最新の再開 smoke では cache reuse の DB / quota event proof までは取っていない。必要なら cost guard / cache behavior 確認として、同一条件2回目の `script_audios` / quota event / response `cached` を spot check する。

## Supabase Storage / RLS / Ownership

Ready:

- Buckets: `recordings`, `script-audios`, `voice-samples`, `voice-consents`。
- Buckets are private and use authenticated user prefix policies.
- App-owned storage refs are re-fetched server-side where correctness matters.
- `script_audios` protected replay and `takes` protected audio routes avoid signed public URLs.
- `quota_events` and account deletion request tables use server-side writes / own read assumptions.

Gate1b added:

- `docs/gate1b-supabase-storage-rls-runbook.md`
- `docs/gate1b-production-supabase-spot-check-proof-template.md`
- `npm run supabase:storage-rls:check`
- checker は required migration files、required table reachability、required private buckets を non-destructive に確認する。
- checker は secret 値、raw storage path、object key、signed URL、provider voice id を出力しない。
- proof template は production human spot check の結果を `PASS / WARN / BLOCKED / FAIL`、counts、masked project ref だけで残す。secret、raw user id、raw object key、signed URL、audio id / take id、raw audio は記録しない。
- 2026-05-08 の human protected replay check で、User A own script-audio / take-audio replay は 200 相当、User B cross-user script-audio / take-audio replay は 403/404 相当として PASS。raw URL / raw id / signed URL / user id / storage path は記録していない。
- Gate1f manual QA runbook は、この checker の実行後に production-like env の human spot check を行う前提にする。

Not ready:

- production DB に 0001〜0012 が適用済みであることと bucket private 設定は checker / runbook で継続確認する。
- production Storage protected replay / cross-user ownership spot check は PASS 済み。今後は deploy 後 regression check として Gate1f QA に含める。
- account deletion actual cleanup で storage object を消す実装はまだない。

## Quota / Cost Guard

Ready:

- `quota_events` は text generation と voice generation で non-blocking logging 済み。
- Cache hit は `cache_hit / non_billable` として記録済み。
- Privacy-safe metadata allowlist はある。
- Gate1c で [quota / cost guard decision](./gate1c-quota-cost-guard-decision.md) を追加済み。
- Gate1g で [provider budget / kill switch runbook](./gate1g-provider-budget-kill-switch-runbook.md) と [proof template](./gate1g-provider-budget-kill-switch-proof-template.md) を追加済み。
- strict production preflight は `NATIVE_MINUTE_LAUNCH_MODE=private_beta | small_cohort` を要求し、DB-backed quota enforcement なしの `public_free` を blocked にする。
- Runtime kill switch として `NATIVE_MINUTE_DISABLE_OPENAI / NATIVE_MINUTE_DISABLE_AZURE / NATIVE_MINUTE_DISABLE_ELEVENLABS / NATIVE_MINUTE_DISABLE_STORAGE_UPLOADS` を追加済み。

Not ready:

- Per-user / per-day hard limits、admin visibility、alerting がない。
- billing / enforcement / usage dashboard は未実装。
- Provider quota failure は user-facing recovery へ寄せているが、app 内の automated cost ceiling は未実装。
- Provider dashboard 側の budget / alert / kill switch drill proof は、人間が Gate1g template に raw billing detail なしで記録済み。Azure Speech resource / region / quota / usage visibility と Azure upgrade は PASS になったため、Gate1g は `WARN` に下がった。

Web production before public の最低ライン:

- mock provider を production で止める。Gate1a で済み。
- provider usage の manual budget / kill switch 運用を決める。Gate1c で repo 側の kill switch は済み、Gate1g で proof template / runbook と人間記録も済み。Azure Speech dashboard/resource visibility、Azure live smoke、OpenAI / ElevenLabs / Supabase Storage の主要 visibility は記録済み。OpenAI project separation / app-side hard cap、ElevenLabs alert は WARN だが、release owner が small-cohort Web beta では受容した。
- public launch は `small_cohort` から始める。`public_free` は DB-backed quota enforcement 前には production preflight で blocked。

## Failure Handling

Checked:

- Auth callback / magic link repeated smoke passed after Gate 0.
- Magic link email rate limit has Japanese user-facing message.
- Empty transcript / too short, OpenAI env missing, Azure env missing are safe.
- Azure cancellation / start failure raw detail is not user-facing.
- ElevenLabs setup/listen failure copy is separated by failure point.

Missing:

- Upload/storage policy failure production smoke.
- ElevenLabs rate limit / billing / deleted provider voice targeted live smoke.
- Azure invalid key / quota / timeout targeted production smoke.
- OpenAI script generation rate limit / invalid response production smoke.
- Review save failure and progress reflection failure are planned but not reproduced.
- Central production logging / alerting policy is not defined.

## Privacy / Policy / Support

Ready as design:

- User data inventory and deletion planning are documented.
- Account deletion request / status / confirm and dry-run inventory/stage preflight are implemented.
- Dry-run APIs return safe counts and avoid raw storage path / provider voice id / row ids / script text / transcript / auth payload.
- Gate1d adds [privacy / support / account deletion actual path decision](./gate1d-privacy-support-account-deletion-decision.md).
- Gate1e adds public Web beta draft routes: `/privacy`, `/terms`, `/support`, `/support/account-deletion`.
- Gate1f adds [Web beta manual QA runbook](./gate1f-web-beta-manual-qa-runbook.md), including support contact / SLA and draft legal review checklists.
- RR-3a adds [actual account deletion implementation plan](./rr-3a-account-deletion-actual-implementation-plan.md), fixing provider -> Storage -> DB -> Auth -> completion order, failure statuses, retry/manual fallback, and destructive safety gates.
- RR-3b adds [ElevenLabs provider cleanup actual](./rr-3b-elevenlabs-provider-cleanup-actual.md) service / adapter boundary behind `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE=1`. It does not add a public actual cleanup route or run real ElevenLabs delete in normal checks.
- RR-3c adds [Storage cleanup actual](./rr-3c-storage-cleanup-actual.md) service boundary behind `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE=1`. It does not add a public actual cleanup route or run real Supabase Storage delete in normal checks.
- RR-3d adds [DB cleanup / anonymize actual](./rr-3d-database-cleanup-actual.md) service boundary behind `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE=1`. It does not add a public actual cleanup route or run real DB cleanup / anonymize in normal checks.
- RR-3e adds [Supabase Auth deletion actual](./rr-3e-supabase-auth-deletion-actual.md) service boundary behind `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE=1`. It does not add a public actual cleanup route or run real Supabase Auth deletion in normal checks.
- RR-3f adds [destructive audit / operator runbook](./rr-3f-destructive-audit-operator-runbook.md), fixing pre-execution approval, per-stage PASS/WARN/BLOCKED/FAIL, partial failure handling, rollback limits, and raw-data-free proof templates. It does not enable the destructive guard or run real destructive cleanup.
- RR-3g adds [operator/admin execution surface design](./rr-3g-operator-admin-execution-surface-design.md), choosing an internal one-stage CLI runner as the future minimal surface and deferring public UI/API, admin routes, server actions, and DB audit tables. It does not implement the runner or run real destructive cleanup.
- RR-3h adds [internal CLI runner skeleton](./rr-3h-internal-cli-runner-skeleton.md) and `npm run account-deletion:operator`. The runner is dry-run default, one-stage-per-invocation, and safe-output-only. It models proof path, latest dry-run runnable, prior-stage satisfaction, destructive env, and irreversible acknowledgement guards, but is intentionally not connected to actual provider / Storage / DB / Auth deletion services.
- RR-3i adds [operator CLI stage service connection](./rr-3i-operator-cli-stage-service-connection.md), giving the runner an injected fake-first stage service seam and safe service-result sanitizer. Guard failures stop before the seam; normal CLI execution still has no connected real stage services.
- RR-3j adds [final safety review](./rr-3j-final-safety-review.md), confirming stage order / guard / failure / retry / proof policy consistency and documenting the remaining request resolver / real service wrapper gap before disposable proof.
- RR-3k adds [safe request resolver / wrapper](./rr-3k-safe-request-resolver-wrapper.md), giving the runner an injected fake resolver seam before fake stage service calls. Guard failures stop before resolver/service; normal CLI execution still has no real DB lookup and no real stage services.
- RR-3l adds [read-only request resolver / status proof](./rr-3l-read-only-request-resolver-status-proof.md), connecting the default CLI `status` / `summary` stages to a server-side read-only lookup that emits only safe request lifecycle and cleanup-stage statuses. Destructive stages remain disconnected from real services.
- Web beta may proceed only as small cohort with request-based deletion plus support/manual cleanup and clear disclosure.
- Store submission should block until actual account/data deletion completion exists.

Not ready:

- Completion notification and end-to-end destructive proof are not implemented. ElevenLabs provider cleanup, Storage cleanup, DB cleanup / anonymize, and Supabase Auth deletion have guarded service boundaries only; normal checks do not run real deletes.
- Privacy Policy / Terms / Support / account deletion URL are beta drafts and are not final legal text.
- Public support contact and account deletion SLA are confirmed for Web beta, but draft copy clarity / formal legal review remains WARN.
- Apple privacy nutrition and Google Play Data safety answers are not finalized.

## Content / UX Release Readiness

Web production before public:

- Home / Practice / Review first views should get one final human review on desktop and mobile.
- Empty states and first-run states should be checked with a fresh account.
- The current 3 safe original templates are enough for a narrow Web beta, because free writing and AI draft exist.

Store submission before review:

- Store screenshot set should use production-like content and avoid provider/debug copy.
- Add a few more safe original template categories only if screenshots or first-run feel thin.
- Confirm Review first view shows short Japanese coaching and details-later behavior on mobile.

v1.1+:

- Template expansion beyond a small safe starter set.
- Onboarding walkthrough.
- More visual theming / animation / design system work.

## Release Blockers

### Web production blockers

1. Production Supabase apply / storage / RLS spot check: Gate1b runbook/checker exists; protected replay / cross-user ownership proof is PASS. Deploy 前は checker と proof template で regression 確認する。
2. Cost guard operations: Gate1c decision / kill switch and Gate1g proof template/runbook exist; human proof is recorded. Azure Speech dashboard/resource visibility, Azure pronunciation live smoke, and Supabase Storage usage / egress are PASS. OpenAI dedicated project / app-side hard cap and ElevenLabs alert remain WARN but are accepted by the release owner for small-cohort Web beta.
3. Privacy/support minimum: Gate1e draft routes exist; Gate1f checklist exists; public support contact and deletion SLA are PASS for Web beta. Draft route clarity / formal legal review remain WARN and are tracked in `docs/human-check-backlog.md`.
4. Production manual QA: run Gate1f production-like manual QA, including S13c happy path and mobile browser spot checks.
5. Production env / provider guard operation: Gate1a guard exists; deploy pipeline must run `npm run production:preflight`.
6. Web beta deploy operation: Gate1h runbook exists, Gate1i release candidate / deploy log template exists, Gate1j final human-check batch runbook exists, and Gate1l owner acceptance is recorded as `GO WITH WARNINGS`; execute deploy / rollback / post-deploy smoke only with the recorded app owner assignments.

### Store submission blockers

1. Actual account/data deletion completion path. RR-3b adds the guarded ElevenLabs provider cleanup boundary, RR-3c adds the guarded Storage cleanup boundary, RR-3d adds the guarded DB cleanup / anonymize boundary, RR-3e adds the guarded Supabase Auth deletion boundary, RR-3f adds the operator runbook / proof template, RR-3g fixes the future internal CLI execution surface design, RR-3h adds a non-destructive CLI skeleton, RR-3i adds fake-first service seam coverage, RR-3j records the final safety review, RR-3k adds fake-first request resolver / wrapper coverage, RR-3l connects read-only status/summary lookup, RR-3m fixes disposable proof request selection, RR-3n/RR-3o provide fake-only rehearsal and sample proof package, RR-3p/RR-3q fix fixture and non-destructive evidence sequencing, and RR-3r adds the empty future live-proof package template. Disposable live proof is still not complete.
2. Apple Privacy Details / Google Play Data Safety answers.
3. Support URL / privacy URL / terms URL need final legal/support review; current routes are beta drafts only.
4. Mobile device QA on iOS Safari / Android Chrome, then Capacitor WebView.
5. Store screenshots and listing copy with no debug/provider-first language.

### Capacitor blockers

1. Web production core stable under real provider settings.
2. Microphone permission / recording format / playback in iOS and Android WebView.
3. Auth redirect / deep link strategy.
4. In-app Settings links for privacy, support, account deletion.
5. Native build env guard and provider preflight.

## Recommended Next Tasks

1. Gate1a: production env/provider guard design and implementation. **Done.**
   - `npm run production:preflight` を追加。
   - strict production では `VOICE_PROVIDER=elevenlabs`、`TRANSCRIPTION_PROVIDER=openai`、`PRONUNCIATION_PROVIDER=azure`、`SCRIPT_GENERATION_PROVIDER=openai` を要求。
   - E2E/test helper env は production preflight で blocked、runtime helper も production では無効。
2. Gate1b: production Supabase / Storage / RLS runbook and spot-check. **Done as runbook/checker plus human protected replay / cross-user proof.**
   - SQL Editor / CLI checklist for migrations, buckets, policies, own read, client write denial where expected.
   - `npm run supabase:storage-rls:check` を追加。
3. Gate1c: quota/cost guard decision. **Done as decision/preflight/runtime kill switch.**
   - `NATIVE_MINUTE_LAUNCH_MODE=private_beta | small_cohort`、`public_free` block、provider/upload kill switches を追加。
4. Gate1g: provider budget monitoring / kill switch ops proof. **Done as runbook/template plus human proof; overall WARN after Azure Speech resource visibility and Azure upgrade were confirmed.**
   - OpenAI / Azure / ElevenLabs / Supabase Storage の budget / alert / quota / kill switch proof を raw secret なしで記録した。
5. Gate1h: Web beta deploy / rollback / smoke runbook. **Done as docs/runbook; no deploy performed.**
   - deploy 前 checklist、rollback criteria、post-deploy smoke、failure triage を追加。
   - Human Check Backlog は final human-check batch で処理する。
6. Gate1i: Web beta release candidate proof / deploy log template. **Done as docs/template; no deploy performed.**
   - release candidate 判定、deploy log、post-deploy smoke、rollback / incident record を raw 値なしで残す template を追加。
   - Human Check Backlog の未解消項目は PASS にしない。
7. Gate1j: final human-check batch preparation. **Done as runbook; human checks not executed.**
   - Human Check Backlog 各項目の owner、確認場所、手順、PASS/WARN/BLOCKED 条件、記録先、記録禁止 raw 値を整理。
   - Gate1i release candidate proof へ接続する。
8. Gate1k: Web beta final no-go checklist / human-check execution packet. **Done as docs packet; 2026-05-10 final human-check results recorded; deploy not executed.**
   - `docs/gate1k-web-beta-final-no-go-checklist.md` を追加。
   - Human Check Backlog、Gate1b / Gate1g / Gate1h / Gate1i / Gate1j、RR-3 disposable proof 準備を final batch の実走順にまとめた。
   - support contact / deletion SLA / Supabase Storage usage visibility / Azure Speech dashboard-resource visibility は PASS、legal/support draft clarity と provider monitoring の一部は WARN として整理した。
   - GO / GO WITH WARNINGS / BLOCKED / FAIL 条件、Gate1i 転記先、raw data 非記録ルールを固定。
9. Gate1l: GO WITH WARNINGS owner acceptance / final Azure live smoke / deploy owner record. **Done; no deploy performed.**
   - `docs/gate1l-go-with-warnings-acceptance-azure-smoke.md` を追加。
   - Gate1i に release owner acceptance、accepted WARNs、mitigation、next review date、deploy / rollback / incident / post-deploy smoke owners、Azure live smoke result を反映。
   - Azure pronunciation live smoke は human browser で `record -> evaluate -> review -> progress` PASS。raw audio、Azure key / endpoint、raw ids は記録していない。
10. Gate1d: privacy/support/account deletion actual path decision. **Done as decision doc; actual cleanup remains.**
   - Web beta can use request-based + support/manual cleanup only for small cohort.
   - Store submission should block until actual account/data deletion completion exists.
11. Gate1e: public Privacy / Terms / Support / account deletion route drafts. **Done as Web beta draft routes; final legal/support review remains.**
   - `/privacy`、`/terms`、`/support`、`/support/account-deletion` を追加。
   - Settings と global footer から最小導線を追加。
   - Destructive account deletion cleanup は未実装のまま。
12. Gate1f: production-like manual QA + support contact / SLA finalization. **Done as runbook; 2026-05-10 support contact / SLA human decisions recorded.**
   - `docs/gate1f-web-beta-manual-qa-runbook.md` を追加。
   - PASS / WARN / BLOCKED / FAIL、support contact / SLA、legal/support draft review checklist を固定。
9. RR-3a: actual account deletion implementation planning. **Done as implementation plan; destructive cleanup remains.**
   - `docs/rr-3a-account-deletion-actual-implementation-plan.md` を追加。
   - provider cleanup -> Storage cleanup -> DB cleanup / anonymize -> Supabase Auth deletion -> completion の order と safety gate を固定。
10. RR-3b: ElevenLabs provider cleanup actual implementation behind destructive guard. **Done as guarded boundary; real delete proof remains.**
   - `docs/rr-3b-elevenlabs-provider-cleanup-actual.md` を追加。
   - `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE=1` が無い限り real ElevenLabs delete は呼ばない。
11. RR-3c: Storage cleanup actual implementation behind destructive guard. **Done as guarded boundary; real delete proof remains.**
   - `docs/rr-3c-storage-cleanup-actual.md` を追加。
   - `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE=1` が無い限り real Supabase Storage delete は呼ばない。
12. RR-3d: DB cleanup / anonymize actual implementation behind destructive guard. **Done as guarded boundary; real delete proof remains.**
   - `docs/rr-3d-database-cleanup-actual.md` を追加。
   - `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE=1` が無い限り real DB cleanup / anonymize は呼ばない。
13. RR-3e: Supabase Auth deletion actual implementation behind destructive guard. **Done as guarded boundary; real Auth delete proof remains.**
   - `docs/rr-3e-supabase-auth-deletion-actual.md` を追加。
   - `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE=1` が無い限り real Supabase Auth deletion は呼ばない。
14. RR-3f: destructive audit / operator runbook / proof template. **Done as docs-only; real destructive proof remains.**
   - `docs/rr-3f-destructive-audit-operator-runbook.md` を追加。
   - destructive guard は有効化せず、real provider / Storage / DB / Auth deletion は実行していない。
15. RR-3g: operator/admin execution surface design. **Done as docs-only; runner/proof remains.**
   - `docs/rr-3g-operator-admin-execution-surface-design.md` を追加。
   - future minimum は public UI/API ではなく、内部 CLI runner、dry-run default、1 stage per invocation、proof review between stages。
   - CLI runner はまだ未実装で、destructive guard は有効化していない。
16. RR-3h: internal CLI runner skeleton. **Done as non-destructive skeleton; service connection/proof remains.**
   - `scripts/account-deletion-operator-runner.mjs` と `npm run account-deletion:operator` を追加。
   - dry-run default、1 stage per invocation、safe JSON output、raw request ref 非再掲。
   - `--execute` は proof path / latest dry-run / prior stage satisfied を含む guard modeling だけを行い、RR-3h では `actual_service_not_connected_in_skeleton` で blocked にする。
17. RR-3i: operator CLI actual stage service connection / fake-first implementation. **Done as fake-first seam; real service connection/proof remains.**
   - `runAccountDeletionOperator` に injected stage service seam と safe result sanitizer を追加。
   - fake service は destructive guard / proof / latest dry-run / prior-stage guard が通った場合だけ呼ばれる。
   - 通常 CLI は real actual stage services 未接続で、real destructive deletion は実行しない。
18. RR-3j: final safety review / real service connection readiness audit. **Done as non-destructive safety review; real service connection/proof remains.**
   - `docs/rr-3j-final-safety-review.md` を追加。
   - stage order / guard / failure / retry / proof policy の整合と、request resolver / real service wrapper の remaining gap を固定。
19. RR-3k: safe request resolver / real service wrapper fake-first implementation. **Done as fake-first seam; real DB lookup/service connection/proof remains.**
   - `docs/rr-3k-safe-request-resolver-wrapper.md` を追加。
   - fake resolver は modeled guards 後だけ呼ばれ、raw user id / email / request id は output に出さない。
20. RR-3l: read-only real request resolver / operator status proof. **Done for status/summary only; destructive stage services remain disconnected.**
   - `docs/rr-3l-read-only-request-resolver-status-proof.md` を追加。
   - CLI `status` / `summary` は request lifecycle と cleanup stage status だけを safe output にする。
21. RR-3m: disposable proof request selection / operator proof preparation. **Done as docs + fake candidate assessment; destructive proof remains unrun.**
   - `docs/rr-3m-disposable-proof-request-selection.md` を追加。
   - CLI `status` / `summary` は `--proof-candidate-*` flags で safe candidate PASS/BLOCKED を出せる。
22. RR-3n: fake-only proof log generation / final operator rehearsal. **Done as fake-only runner; destructive proof remains unrun.**
   - `docs/rr-3n-fake-only-proof-log-rehearsal.md` と `npm run account-deletion:operator:rehearsal` を追加。
   - provider -> Storage -> DB -> Auth -> completion の fake sequence を safe JSON / markdown で出し、destructive guard が有効なら `BLOCKED` にする。
23. RR-3o: operator proof package assembly / sample proof artifact. **Done as fake-only sample package; destructive proof remains unrun.**
   - `docs/rr-3o-sample-disposable-proof-package.md` と `npm run account-deletion:proof-package:self-test` を追加。
   - RR-3n output を RR-3f proof template に転記する形、PASS/WARN/BLOCKED/FAIL、raw data absence を固定。
24. RR-3p: disposable account fixture preparation checklist / dry-run proof checklist. **Done as docs-only checklist; destructive proof remains unrun.**
   - `docs/rr-3p-disposable-fixture-dry-run-proof-checklist.md` を追加。
   - disposable fixture 条件、provider / Storage / DB / Auth dry-run 順序、GO/WARN/BLOCKED/FAIL、raw data 非記録を固定。
25. RR-3 / Gate 1 current status inventory. **Done as docs-only inventory; no new implementation or destructive proof.**
   - `docs/rr-3-gate1-current-status-inventory.md` を追加。
   - RR-3b〜RR-3p の completed / docs-only / fake-self-test only / read-only / 未実行 / human-check backlog を整理。
   - 次の候補は RR-3q か final Human Check Backlog batch。Web beta GO に近いのは human-check batch、Codex-only で安全に進めるなら RR-3q。
26. RR-3q: read-only disposable request status rehearsal / final non-destructive evidence check. **Done as docs-only evidence sequence; destructive proof remains unrun.**
   - `docs/rr-3q-read-only-disposable-request-status-rehearsal.md` を追加。
   - operator `status / summary`、stage dry-run checklist、fake-only rehearsal、sample proof package、production preflight、Storage/RLS checker の実行順と proof 転記先を固定。
   - real destructive deletion、destructive guard、public UI/API、DB schema / migration は変更していない。
27. RR-3r: future disposable proof package empty template. **Done as docs-only template; destructive proof remains unrun.**
   - `docs/rr-3r-future-disposable-proof-package-template.md` を追加。
   - RR-3q evidence flow と対応する空欄、RR-3o fake sample との差分、stage-by-stage actual proof 欄、raw data 非記録ルールを固定。
   - fake / real deletion、destructive guard、real cleanup service、public UI/API、DB schema / migration は変更していない。
