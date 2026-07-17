# Native Minute SOL ULTRA Phase A 発売前監査

- 監査日: 2026-07-16（JST）
- 監査対象 commit: `21bb4b82f03193d96b2d29ad8ba6ae696088c3d6`
- 判定: **HOLD / NO-GO**
- 対象: iOS / App Store、認証、プライバシー・削除、課金・採算、発音評価品質、custom/evolving voice、14日出荷計画
- Phase A 制約: 読み取り監査と本書の作成のみ。実装、migration、provider設定変更、commit、pushは行っていない。

## 根拠ラベルと監査境界

- **確認済み / repo**: 対象commitのファイルから確認した事実。`path:line-line`を併記する。
- **確認済み / 公式**: 2026-07-16に公式資料で確認した事実。末尾の「公式資料」を参照する。
- **推測**: repoや公式資料からのリスク推論であり、本番設定・契約・人手試験で未確認。
- **提案**: 発売判断に必要な設計・数値・運用案。実装済み事実ではない。
- **人手確認**: App Store Connect、provider契約、production dashboard、実機またはarchiveでのみ確定できる事項。

秘密情報保護のため、`.env*`、secret、token、cookie値、magic-link値、認証traceの本文は開いていない。正しいrepoのroot確認後、進行中のiOS auth smoke checkoutとは分離された独立worktreeで監査した。binary artifactはtracked状態だけを確認し、内容は未検査である。

---

## 1. Executive summary

**結論: 現時点でApp Review提出、外部TestFlight、課金開始、公衆向け無料公開のいずれも行わない。** Webの中核ループは小規模検証へ近いが、iOS配布・native auth・第三者AI同意・実削除・StoreKit entitlement・hard quota・品質校正に発売停止条件が残る。

### 強い部分

- **確認済み / repo**: `setup/voice -> scripts -> listen -> record -> review -> progress` のWeb本番smokeは通過済みである（`docs/current-state.md:3-16`）。
- **確認済み / repo**: `/api/evaluate` は薄いrouteで、schemaとserviceへ責務を分離している（`app/api/evaluate/route.ts:11-37`、`schemas/evaluate.ts:3-19`）。
- **確認済み / repo**: 評価時にserverがowned scriptとrecordingを再取得し、clientからcanonical script本文を受け取らない（`services/review/review.service.ts:110-186`）。
- **確認済み / repo**: take/review/weak words/coachの保存はRPCで一括化され、保存後にserver-side canonical dataを再取得する（`services/review/review.service.ts:188-229,254-273`）。
- **確認済み / repo**: 基本RLS、private storage、user-prefix policy、owned replay check、provider kill switch、script-audio cacheが存在する（`supabase/migrations/0001_init.sql:130-177`、`supabase/migrations/0005_phase5_recordings_storage.sql:1-62`、`services/storage/recording-storage.service.ts:145-252`、`lib/cost-guard.ts:3-60`）。

### 発売を止める要因

1. tracked認証test artifactにsession/cookie/request bodyが含まれる可能性があり、内容未確認のまま漏えい無しと断定できない。
2. iOSはproduction非推奨のremote `server.url` wrapperであり、local bundle、Xcode 26、archive再現性、native authが未成立である。
3. provider noticeの後にuserが評価ボタンを押すflowはあるが、そのactionは第三者AI共有への同意として明示されず、同意version・撤回状態もないため、Appleのexplicit permission適合を証明できない。
4. account deletionはUI/request/dry-runがあるが、provider→Storage→DB→Authのactual operatorが接続・実証されていない。
5. StoreKit、server canonical entitlement、restore、App Store Server Notifications、atomic usage reservationがない。表示上の「10回」もenforcementではない。
6. 無効音声、重複語、miscuing、server計測duration、score calibrationが不足し、現在の数値を学習成果や精密な発音評価として販売できない。

### 発売可能性の概算

以下は**推測**であり、story pointやテスト消化率ではない。

| 対象 | 推定完成度 | 理由 |
|---|---:|---|
| Webの限定cohort向け中核ループ | 約75% | production smoke済み。ただし同意、削除、quota、品質claimは未完。 |
| iOS internal TestFlight release candidate | 約25% | shellはあるがlocal bundle、toolchain、auth、archive pipelineが未完。 |
| 課金付きpublic launch | 約15–20% | StoreKit/entitlement/quota/cost ledger/削除証明が未実装。 |

14日で現実的に狙えるのは、意思決定を即日固定し並列作業できる場合の**internal TestFlight RC**である。App Review提出や有料公開を14日目の約束にしてはならない。

---

## 2. Current completion assessment

### Product loop

- **確認済み / repo**: Webのproduction smokeではsign-in、script、TTS、recording upload、audio-first evaluate、review、progressまで通過している（`docs/current-state.md:3-16`）。
- **確認済み / repo**: 文字起こしは実audioをOpenAIへ送るaudio-first実装で、empty transcriptは再録音を促す（`services/transcription/openai-transcriber.ts:43-65,81-94`）。
- **確認済み / repo**: pronunciation production pathはAzureで、coachは現在mock/rule-basedである（`services/pronunciation/azure-evaluator.ts:532-568`、`services/coach/mock-coach.ts:3-18`）。
- **推測**: 「AI coach」の価値訴求は現状の静的coachと乖離し得る。App metadataとpaywallでは実装通りの説明に縮める。

### iOS

- **確認済み / repo**: Capacitor 8.4 shellは存在するが、`webDir`はplaceholderで、`server.url`が本番Vercelを指す（`capacitor.config.ts:3-13`、`www/index.html:9-11`）。
- **確認済み / repo**: current stateでもremote wrapperはpreflight-only、native magic linkはMac Chromeへ開き `callback_pkce_missing` でblockedと記録されている（`docs/current-state.md:64-72`、`README.md:177-184`）。
- **確認済み / repo**: release archiveを再現するscript、CI、ExportOptions、shared scheme、Fastlane、app-owned privacy manifestは見つからない（`package.json:5-57`、`.github` 不在）。
- **確認済み / repo**: 宣言bundle IDは`com.nativeminutes.app`である（`capacitor.config.ts:4`、`ios/App/App.xcodeproj/project.pbxproj:308,329`）。
- **人手確認**: signing、App Store Connect record、App ID/provisioning profile/署名済みarchiveと宣言bundle IDの一致、agreements/tax/banking、device matrix、final archive privacy reportはrepoだけでは確定できない。

### Auth / privacy / deletion

- **確認済み / repo**: loginはemail magic-linkのみである（`app/login/page.tsx:55-84`、`components/auth/login-form.tsx:13-42`）。
- **確認済み / repo**: 通常評価はprovider noticeの後にuserが評価ボタンを押すが、そのbutton文言は第三者共有への同意ではなく、affirmative checkbox、consent version、withdrawal stateがない（`components/legal/consent-notice.tsx:14-23,57-95`、`components/record/record-and-evaluate-panel.tsx:523-528,667-685,819-833`）。
- **確認済み / repo**: account deletion request、dry-run safety、各actual関数はある（`components/account/account-deletion-panel.tsx:493-542,927-959`、`services/account-deletion/account-deletion.service.ts:1865-1870,2246-2251,3245-3250,3637-3642`）。ただしdefault operatorはactual servicesへ接続されていない（`scripts/account-deletion-operator-runner.mjs:245-250,720-750`）。

### Monetization / cost

- **確認済み / repo**: repo-wide targeted searchでStoreKit、`Transaction`/`Product`、`AppStore.sync`、`appAccountToken`、ASSN、transaction/entitlement migrationの実装は0件だった。JS dependencyにもIAP SDKはない（`package.json:31-57`）。不存在は対象commitの検索結果であり、App Store Connect設定は人手確認が必要。
- **確認済み / repo**: quota eventsは観測ledgerで、provider call前のhard enforcementやatomic reservationではない（`supabase/migrations/0009_phase_s5_quota_events.sql:1-24,47-101`、`services/quota/quota-event.service.ts:110-195,392-589`）。
- **確認済み / repo**: public-freeを許可しないpreflightは存在する（`scripts/production-readiness-preflight.mjs:111-121`、`docs/gate1c-quota-cost-guard-decision.md:31-46,95-100`）。この安全策は維持する。

---

## 3. P0 / P1 / P2 risk table

Effortは1人あたりの概算で、provider審査・Apple審査待ちは含まない。**Stop**はPhase A後も明示承認なしに変更してはならない領域を示す。

| Pri | Risk | Evidence | User / App Store / revenue impact | Required fix | Effort | Stop |
|---|---|---|---|---|---:|---|
| P0 | tracked auth test artifactの潜在漏えい | `test-results 2/auth.setup.ts-create-authenticated-storage-state-setup/trace.zip` 等がtracked。`.gitignore:7-9`は別名directoryを捕捉しない。内容は未開封。Playwright公式はauth stateやtraceに機密request/cookieが含まれ得ると警告。 | account/session compromise、incident対応、審査・信頼毀損 | security ownerが値を表示しない隔離scan。remote到達ならsession revoke、test credential rotation、artifact/history purge、再発防止。 | 0.5–2d | **Yes: destructive history rewrite/rotation** |
| P0 | iOSがremote wrapperでproduction bundleなし | `capacitor.config.ts:3-13`、`www/index.html:9-11`。Capacitor公式は`server.url`をlive reload向け・production非推奨とする。Apple 4.2はminimum functionalityを要求するが、local bundleだけで4.2適合が保証されるわけではない。 | network/auth障害で起動不能、4.2 risk、release再現不能 | local bundled mobile client + HTTPS BFFへ移行。release guardで`server.url`/placeholderを拒否し、固定1分の録音・評価・進捗というapp固有utilityも完成させる。 | 4–8d | **Yes: Capacitor architecture** |
| P0 | submission toolchainが期限要件未達 | local read-only確認はXcode 16.2。Appleは2026-04-28以降iOS 26 SDK/Xcode 26+を要求。Capacitor 8もXcode 26+を案内。 | upload不可またはunsupported build | Xcode 26+、Node LTS、Capacitor 8.4をpinしclean machine/CI archiveを再現。 | 1–2d | No |
| P0 | native authとreviewer access未成立 | magic-link only（`app/login/page.tsx:55-84`）。native callback blocked、Universal Link未実装（`docs/current-state.md:64-72`）。AppDelegateはcustom URL転送のみ（`ios/App/App/AppDelegate.swift:36-39`）、`@capacitor/app` dependencyなし（`package.json:31-57`）、repo-wide filename scanでAssociated Domains entitlement/AASAなし。 | userがsign-in不能、Apple 2.1 completeness reject | Universal Link + native PKCE/session contract、secure storage、fallback/recovery、stable reviewer demo account。 | 3–6d | **Yes: auth/session API** |
| P0 | 第三者AI共有のexplicit permission適合を証明できない | provider notice後に評価actionはあるがbutton自体はsharing consentを示さず、version/withdrawal stateもない（`components/legal/consent-notice.tsx:14-23`、`components/record/record-and-evaluate-panel.tsx:523-528,819-833`）。Apple 5.1.2(i)はthird-party AIを明記し、sharing前のexplicit permissionを要求。現flowが認められる保証はない。 | privacy reject、法務・信頼risk | provider、目的、data、retention/deletionをjust-in-time表示し明示的permissionを得る。監査可能性のためversion/time/purposeを保存しwithdrawal後のcallを停止する。 | 2–4d | **Yes: schema/privacy policy** |
| P0 | account deletion completion path未証明 | UIは実削除しないと明記（`components/account/account-deletion-panel.tsx:541-542,942-943`）。actual関数はあるが、default operatorはdisconnected（`services/account-deletion/account-deletion.service.ts:1865-1870,2246-2251,3245-3250,3637-3642`、`scripts/account-deletion-operator-runner.mjs:245-250,728-750`）。 | Apple 5.1.1、個人情報残存、support負債 | in-app initiationからprovider→4 private buckets→DB→Authを行うconnected operator/manual pathとcompletion確認を用意し、disposable accountで証明。 | 3–6d | **Yes: destructive deletion** |
| P0 | StoreKit/server entitlementなし | repo-wide targeted searchでStoreKit/transaction/product/restore/ASSN/entitlement実装0件。JS dependencyにもIAP SDKなし（`package.json:31-57`）。Apple 3.1.1はdigital feature unlockにIAPを要求。 | 課金不能、review reject、entitlement fraud | StoreKit 2 + verified transaction + server entitlement + ASSN V2 + reconciliation + restore。 | 5–10d | **Yes: StoreKit/schema/API** |
| P0 | hard quotaとactual cost ledgerなし | kill switchのみ（`lib/cost-guard.ts:3-60`）。quota log failureはprovider actionを止めない（`services/quota/quota-event.service.ts:392-589`）。UIはbeta 10回と表示（`components/record/record-and-evaluate-panel.tsx:786-790`）。 | abuse、negative gross margin、表示不一致 | provider call前atomic reservation、success settle、definitely-unbilled failure release、per-feature caps、unit/currency/price-version ledger。 | 3–6d | **Yes: schema/API** |
| P1 | RPC score偽造は可能、cross-script direct table relationはgrant依存 | `persist_review_bundle`はowned scriptを検査する一方、client supplied score/transcript等を受けauthenticatedへ明示grant（`supabase/migrations/0003_phase25_hardening.sql:51-76,83-152,194-216`）。`takes_crud_own`は`user_id`のみでowned scriptを検査しない（`supabase/migrations/0001_init.sql:239-244`）が、direct table exploitabilityはproduction grants/Data API設定に依存。 | progress integrity、条件付きcross-tenant relation、paid value毀損 | RPCをserver-onlyに限定し、production grantsを確認、takes policyへowned script EXISTSを追加。 | 2–4d | **Yes: RLS/grants/API** |
| P1 | direct Data API/Storage mutationがservice guardを迂回する可能性 | repoにproduction grantのREVOKEはなく、scripts/voices/media policiesはauthenticated direct mutationを許し得る（`supabase/migrations/0001_init.sql:158-177,192-237`、`supabase/migrations/0004_phase25_storage_guards.sql:18-54`、`supabase/migrations/0005_phase5_recordings_storage.sql:20-62`、`supabase/migrations/0006_phase6_script_audio_storage.sql:20-62`、`supabase/migrations/0007_phase7_voice_sample_storage.sql:20-62`、`supabase/migrations/0008_phase8_voice_consent_storage.sql:22-64`）。actual grantsは人手確認。 | quota/kill switch、cleanup順序、media validationの迂回 | production grants/Data APIを棚卸しし、server-only mutationに必要な最小grant/API schemaへ絞る。 | 2–4d | **Yes: grants/API architecture** |
| P1 | 発音scoreが無効音声・重複語・miscuingを正しく扱わない | Set overlap（`services/pronunciation/azure-evaluator.ts:132-135`）、miscuing false（`services/pronunciation/azure-evaluator.ts:439-448`）、raw score保存（`services/pronunciation/azure-evaluator.ts:532-568`）、client duration max600（`schemas/evaluate.ts:3-19`）。 | 誤った学習feedback、refund/churn、misleading claim | server decoded duration/SNR/silence/wrong-script gate、sequence alignment、miscuing、human calibration、score versioning。 | 5–10d + study | **Yes: score semantics/history** |
| P1 | script編集/削除でhistory意味変更とStorage orphanが起きる | scriptをin-place更新し、deleteはDB rowのみ（`services/scripts/scripts.service.ts:104-149`）。takeはfull snapshotなし（`docs/current-state.md:381`）、progressはcurrent scriptを表示（`services/progress/progress.service.ts:278-300`）。DB cascadeはStorage blobを消さない（`supabase/migrations/0001_init.sql:52-90`）のにUIは関連結果/音声も消えると表示（`components/scripts/delete-script-button.tsx:56-59`）。 | history inconsistency、orphan cost、misleading deletion copy、quality study破損 | immutable script version/snapshot方針とStorage cleanup outbox/jobを決め、copyと実動作を一致させる。 | 2–5d | **Yes: canonical history/schema** |
| P1 | upload abuse / malformed media | `request.formData()`で全parse（`app/api/uploads/recording/route.ts:15-20`）。MIME/sizeはclient metadata、server decodeなし（`services/storage/recording-storage.service.ts:53-119,175-202`）。 | memory/provider cost DoS、bad evaluation | edge size/rate/concurrency cap、magic-byte/decode、server duration、timeout/retry budget。 | 2–4d | No |
| P1 | logsとerrorがprovider/object識別子を露出 | providerVoiceId/storage key/raw messageをlog（`providers/voice/elevenlabs.ts:143-160,256-273,525-529`、`providers/voice/openai.ts:485-506`）。raw Error.message client return（`lib/errors.ts:11-20`）。 | privacy/security、support log拡散 | safe reason code + internal correlation IDへ縮退し、raw upstream body/object keyを出さない。 | 1–2d | No |
| P1 | custom voice lifecycle/slot/costが未統一 | provider interfaceにdelete/version/capabilityなし（`providers/voice/types.ts:51-63,83-130`）。新voiceは即default（`services/voice/voice.service.ts:434-481`）。 | orphaned clones、slot枯渇、rollback不能 | provider capabilities、delete SLA、max clones、candidate/active、rollback、consentをserver canonical化。 | 4–8d | **Yes: provider/schema** |
| P1 | release observability/CI不足 | release script/CI/shared scheme/export/privacy report gateなし（`package.json:5-30`、`.github`不在）。 | crash/rollback遅延、human-only release | clean archive CI、crash/health signal、release checklist、rollback runbook。 | 2–4d | No |
| P1 | legal/privacy policyがdraftでretention/withdrawalを確定していない | legal pagesはdraft（`components/legal/beta-legal-page.tsx:4-12,34`）。Privacyはdata/providerを列挙するがretention、withdrawal、actual deletionが未確定（`app/privacy/page.tsx:18-85`）。 | App Review/privacy compliance、user trust | final operator/effective date/provider terms/retention/withdrawal/deletionを法務承認し、stable public URLで公開。 | 2–4d | **Yes: privacy policy** |
| P2 | name/icon/copy/accessibility polish | `CFBundleDisplayName`はNative Minutes（`ios/App/App/Info.plist:9-10`）。 | polish/reviewer confidence/conversion | final name/icon/copy、Dynamic Type/VoiceOver/iPad/device QA。 | 2–4d | No |
| P2 | provider model pinの陳腐化 | OpenAI TTS defaultは`gpt-4o-mini-tts`（`providers/voice/openai.ts:117-118`）。公式model pageではdeprecated扱い。 | future outage/cost/quality drift | capability registry、sunset alert、golden audio regression後にmigration。 | 1–3d | **Yes: provider change** |

---

## 4. Production iOS architecture

### 現状

- **確認済み / repo**: Capacitor configは`webDir: "www"`だが、production URLを`server.url`へ設定している（`capacitor.config.ts:3-13`）。`www/index.html`は意図的placeholderである（`www/index.html:9-11`）。
- **確認済み / repo**: generated native filesをgitignoreする構成だが、release生成・同期・archiveを再現するcommandがない（`ios/.gitignore:4,14-15`、`package.json:5-30`）。
- **確認済み / repo**: native shellはSwiftPMでCapacitor 8.4、minimum iOS 15（`ios/App/CapApp-SPM/Package.swift:1-15`）。
- **確認済み / repo**: Release configは`CAPACITOR_DEBUG`を有効化するdebug xcconfigを継承しない（`ios/App/App.xcodeproj/project.pbxproj:183-240,242-335`）。これは良い。
- **確認済み / repo**: `cleartext:false`、`allowNavigation`未指定（安全側default）、ATS例外なしである（`capacitor.config.ts:10-12`、`ios/App/App/Info.plist:1-32`）。
- **確認済み / repo**: 現在はSwiftPM projectだが、既存docsは存在しない`ios/App/App.xcworkspace`を案内している（`docs/current-state.md:69`、`docs/capacitor-ios-native-smoke-checklist.md:10,32`）。release手順では`npx cap open ios`または`xcodebuild -project ios/App/App.xcodeproj`を使う。

### 推奨production形

```text
Locally bundled iOS client (Capacitor, immutable release assets)
  ├─ native microphone / playback / secure auth session
  ├─ shared design tokens, UI primitives, schemas, API contracts
  └─ HTTPS Bearer requests
          ↓
Existing Next.js / Vercel BFF
  ├─ auth validation and owned-data re-fetch
  ├─ canonical scripts / reviews / entitlements / quotas
  ├─ provider orchestration (OpenAI / Azure / ElevenLabs)
  └─ Supabase DB + private Storage
```

- **提案**: iOSはlocal bundled clientとし、`server.url`、`allowNavigation`、cleartext、placeholderをrelease configで禁止する。
- **提案**: Next.js/VercelはBFF/APIとして残す。server componentを無理にstatic exportせず、mobile専用entryに必要な画面だけをbundleする。
- **提案**: Web cookie SSRとnative session transportを分離し、共有するのはdesign tokens、component primitives、Zod/API contract、business terminologyとする。
- **提案**: provider key、canonical script、ownership、atomic review、entitlement、quotaをclientへ移さない。
- **提案**: offline対応は「録音中の一時保護、再送可否、明瞭なnetwork error」までに限定し、v1でoffline評価は約束しない。

local bundleはproduction再現性と供給網制御の必要条件だが、Apple 4.2適合の十分条件ではない。固定1分練習、録音・再生・評価・進捗の完成度、nativeらしいpermission/interrupt/error UXをreview notesと実機で示す。

### Release guard

1. Xcode 26+、supported Node LTS、npm lock、Capacitor 8.4をCIとlocalで一致させる。
2. clean checkoutからmobile build → `cap sync ios` → `xcodebuild -project ios/App/App.xcodeproj` archiveを再現する。
3. generated configに`server.url`、`allowNavigation`、cleartext、debug flagがないことをfail-fast検査する。
4. bundle内にplaceholderではなくversioned assetsがあり、network断でもlaunch/error shellが出ることを検査する。
5. archiveのsigning、entitlements、privacy manifest/report、SDK signatures、minimum OS、iconsを検査する。
6. production API base URLをbuild-time allowlistでpinし、preview/local originをrelease buildへ混入させない。

**Stop decision**: remote wrapperを短期回避策としてApp Reviewへ出さない。local bundle+BFFを承認できない場合、iOS発売日を延期する。

---

## 5. Production auth

### 現状とfailure mode

- **確認済み / repo**: Webはemail magic linkで、callbackはPKCE code exchange後にinternal pathへredirectする（`app/login/page.tsx:55-84`、`app/auth/callback/route.ts:13-106`）。
- **確認済み / repo**: native smokeではlinkがMac Chromeへ開き、開始元WebViewのPKCE verifier cookieがないため失敗する（`docs/current-state.md:64-72`）。
- **確認済み / repo**: AppDelegateはcustom URL callback forwardingだけである（`ios/App/App/AppDelegate.swift:36-39`）。`@capacitor/app` dependencyはなく（`package.json:31-57`）、current stateでもUniversal Link未実装と記録され、repo-wide filename scanでAssociated Domains entitlement/AASAは見つからない（`docs/current-state.md:71-72`）。
- **推測**: `x-forwarded-host`/`proto`からcallback originを作る現在の実装は、production proxyが厳格にsanitizeする保証がなければhost-header poisoningの余地がある（`lib/navigation.ts:114-133`、`app/api/auth/sign-in/route.ts:88-97`）。

### 推奨flow

1. locally bundled appでPKCEを開始し、verifier/sessionをKeychain-backed secure storageへ保存する。
2. verified Universal Linkをprimary callbackにする。domain ownershipを検証できずscheme hijack riskがあるcustom schemeはsimulator/dev fallbackに限定し、使う場合もscheme/host/pathをexact allowlistで検査する。
3. callback codeをin-appでexchangeし、APIにはBearer sessionを送り、BFFが毎requestで検証する。
4. DB/providerへ直接writeさせず、BFFがowned data、quota、entitlementを再取得する。
5. canonical production originとallowed redirect pathをserver configでpinし、不一致hostをrejectする。
6. recoveryとしてemail OTP codeを検討する。link scannerや別browserによるPKCE破損を減らせるが、rate limit・expiration・brute-force防止を同時に設計する。

### App Review access

- **確認済み / 公式**: Apple 2.1はloginが必要なappにactive demo account、またはAppleが事前承認したfully featured demo modeとlive backendを要求する。
- **提案**: 通常UIから使える専用email/password reviewer accountを事前作成し、固定scriptとmain loopが確実に使える状態にする。credentialsはApp Review Informationだけに置き、repoや文書へ書かない。
- **提案**: reviewer accountはproviderを実際に呼べる限定quotaを持ち、審査中に失効させない。審査後にrotateする。
- **確認済み / 公式 + 適用判断**: Guideline 4.8にはcompany-owned account setup/sign-inの例外がある。現在の自社email sign-inへその例外を適用できる可能性は高いが、審査判断はAppleにある。Google/Facebook等をprimary account loginとして追加するならSign in with Apple要件を再評価する。

**Stop decision**: native auth transport、session storage、API bearer contractをADRで承認してから実装する。hosted-cookie flowをlocal bundleへそのまま移植しない。

---

## 6. Privacy / deletion checklist

### App Privacy回答の候補

以下は**repoからの候補**で、App Store Connectのproduction設定、各provider契約、log/telemetryの実態を人手確認して確定する。

| Apple category | Native Minute data | Linked to user | Primary purpose | Confirmation needed |
|---|---|---:|---|---|
| Contact Info / Email Address | account email | Yes | App Functionality | Supabase auth retention |
| Contact Info / Name | profile / voice consent name | Yes | App Functionality | field usage |
| Identifiers / User ID | Supabase user ID、provider correlation | Yes | App Functionality | logs and hashing |
| User Content / Audio Data | practice recordings、voice sample/consent audio | Yes | App Functionality / Personalization | provider retention/deletion |
| User Content / Other User Content | scripts、transcripts、scores、feedback、weak words | Yes | App Functionality / Personalization | backup/log retention |
| Purchases / Purchase History | StoreKit product/transaction/entitlement | Yes | App Functionality | after implementation |
| Usage Data / Product Interaction | quota/operation events | Yes | Analytics/App Functionality | no tracking/ads assumption |
| Customer Support | deletion/support request content | Usually | App Functionality | support system retention |
| Diagnostics | crash/performance data | TBD | App Functionality | final SDK/archive/log inventory |
| Location / Coarse Location | production IP由来の場合のみ | TBD | App Functionality/Security | Vercel/Supabase/providerのIP use・retention |

- **確認済み / repo**: repoには広告・tracking SDKの明確な実装は見つからない。
- **人手確認**: WebView/BFF/providerを経由するcollectionもAppleの回答対象。Vercel、Supabase、OpenAI、Microsoft、ElevenLabs、将来のcrash SDKを含めて回答する。

### 必須checklist

- [ ] 通常評価の直前に、音声をOpenAIへ文字起こし、Microsoft Azureへ発音評価のため送ることを明記し、明示的同意を取る。
- [ ] consent version、timestamp、purpose、providers、policy versionをserver保存し、withdrawal後のfuture callsを止める。
- [ ] custom voiceは別同意にし、ElevenLabs名、voice clone目的、training/retention/deletion条件、撤回方法をcheckboxの近くに表示する。
- [ ] privacy/terms/supportのdraft表示を外し、operator、effective date、問い合わせ先、retention、third parties、deletionを法務承認する（`components/legal/beta-legal-page.tsx:4-12,34`、`app/privacy/page.tsx:18-85`）。
- [ ] microphone purpose string、recording indicator、stop/control、background behaviorを実機確認する（`ios/App/App/Info.plist:27-28`、`components/record/record-and-evaluate-panel.tsx:677-685`）。
- [ ] App Store privacy labelをproduction contracts/log設定と一致させる。
- [ ] final archiveでprivacy report、required-reason APIs、Capacitorを含むSDK signatures/manifestsを確認する。
- [ ] in-appからaccount deletionを開始でき、support emailだけを必須にしない。
- [ ] provider voice → voice samples/consents/recordings/script audios → DB → Authの順でretryable/idempotentに削除する。
- [ ] Supabase公式の注意どおり、Auth userより先にowned Storage objectsを削除し、削除後session invalidationを確認する。
- [ ] request受付、予告期間、進捗、完了、失敗retry、legal hold例外をuserへ通知する。
- [ ] disposable production-like accountでend-to-end deletion proofを取得し、IDだけの監査記録にする。個人データやtokenを証跡へ入れない。

**確認済み / repo（安全側の点）**: auth callback logはcode/token/cookie valueを出さず、cookie namesとerror metadataに留めている（`app/auth/callback/route.ts:52-95`）。service-role clientもserver environment keyを使いsession persistenceを無効化している（`lib/supabase/admin.ts:5-11`）。ただし`server-only` importがないため、server境界をbuild-timeで固定するhardeningは有効である（`lib/supabase/admin.ts:1-11`、`lib/supabase/config.ts:11-13`）。

### Retention policy案（法務・provider契約承認前の提案）

| Data | Proposed default | Deletion trigger |
|---|---|---|
| raw practice audio | 30日。userが明示保存したbest takeだけ継続 | take/script/account deletion |
| transcript/review/progress | account存続中、user deletionまで | take/script/account deletion |
| generated script audio cache | script/voice deleteまたは定義TTLまで | ownership cleanup job |
| app-owned voice source sample | successful clone後24時間以内に削除 | clone completion/revoke/account delete |
| app-owned voice consent recording | 法務が承認する最小audit期間。source sampleとは別管理 | revoke/account delete/retention expiry |
| active provider clone | user revoke/account delete時。provider SLAを表示 | provider delete + verification |
| consent receipt | voice/data processing存続中 + 法務が定める最小audit期間 | anonymize/delete after obligation |
| operational logs | 30日を初期上限 | automatic TTL |
| deletion tracking record | completion後30日、user IDはhash/最小化 | automatic TTL、legal exception documented。現状は`expires_at`列のみでpurge未実装（`supabase/migrations/0012_phase_rr_account_deletion_requests.sql:20`） |

**確認済み / 公式**: OpenAI API dataはdefaultでtrainingに使われないが、endpoint・organization設定ごとのretention確認が必要。Azure realtime speech/pronunciationは公式privacy資料上、customer audio/transcriptをretain/storeしない。ElevenLabsの2026-05-20公開Privacy PolicyはR&D/training利用とvoice-derived dataの長期保持（原則としてlast interaction後最大3年、契約・法的例外あり）を許容する。ZRMはselect Enterprise向けで、IVC/PVC sampleには適用されず、削除後backupに最大30日残り得る。production contract/ZRM/operation別設定で覆らない限りdefault riskとして同意・privacy policyへ明記する。

---

## 7. Monetization architecture

### v1 offering案

| Feature | Free | Pro |
|---|---:|---:|
| cached reference replay / saved history | Unlimited | Unlimited |
| pronunciation evaluations | 5 / month | 60 / month |
| generated scripts | 1 / month | 10 / month |
| fresh TTS generations | 3 / month | 20 / month |
| custom voice | None at initial launch | One initial clone only after deletion/slot proof |
| evolving voice | None | v1.1 limited beta, not v1 |

- **提案**: 最初はmonthly Pro 1 SKU、価格仮説は日本で`¥980/月`。annual、lifetime、unlimited、複数tierはD30 retentionとcostが見えるまで追加しない。
- **確認済み / 公式**: ELSAの公開価格には地域/期間/offer差があるため、競合価格は方向性にしか使わない。価格仮説はNative Minuteの継続率、成果実感、provider原価で検証する。
- **提案**: quota超過後もhistoryとcached replayは読めるようにし、新たにprovider costが生じるactionだけを止める。

### StoreKit / server canonical flow

```text
StoreKit 2 verified transaction + appAccountToken
       ↓
Server JWS verification / idempotent transaction ingest
       ↓                         ↘
Canonical entitlement        ASSN V2 ingest
       ↓                         ↘
Every billable API re-fetch ← App Store Server API reconciliation
       ↓
Atomic usage reservation → provider call → settle or safe release
```

必要なserver data model案:

1. `store_transactions`: immutable verified JWS facts、original/transaction ID、product、environment、purchase/expiry/revocation、appAccountToken、verification time。
2. `entitlements`: server materialized canonical status（active、grace、billing-retry、expired、revoked）とsource transaction。
3. `usage_buckets`: user/feature/period、limit、consumed、reserved。
4. `usage_reservations`: idempotency key、request ID、state、expiry。provider call前にatomic確保。
5. `provider_cost_ledger`: provider/model/operation、actual quantity、unit、currency、unit price、price version、billable state、correlation ID。
6. `notification_events`: ASSN V2 event ID/JWS hash/stateでidempotencyを保証。

Clientの`Transaction.currentEntitlements`とupdatesはUXの即時反映に使うが、provider accessのsource of truthはserver entitlementとする。Restoreボタンは既知transactionの再読込を先に行い、userの明示操作時のみ`AppStore.sync()`を使う。server notification欠落をApp Store Server API reconciliationで補う。

初期server判定は、`active`とAppleが確認できる`grace`だけprovider利用可とする。grace外のbilling retry、expired、revoked/refundedは利用不可にし、cached history/replayだけを残す。状態遷移はASSN V2と定期reconciliationの両方で検証する。

### Paywall truthfulness

- custom voice、評価回数、script生成回数、renewal term、price、trial、cancel方法を実際のentitlementと一致させる。
- 「unlimited」「human-level」「native score」「10回無料」など、hard enforcementやquality validationのないclaimを使わない。
- purchase success後もserver entitlement未反映なら、pending/retry状態を表示しprovider callを二重実行しない。

---

## 8. Cost-control model

### 1 practice evaluationの変動原価

```text
C_practice =
  transcription_minutes × USD 0.006
  + Azure_STT_hours × P_STT_STANDARD(region, contract, date)
  + Azure_prosody_hours × P_PROSODY_ADDON(region, contract, date)
  + fresh_TTS_chars / 1,000 × P_TTS(provider, plan, date)
  + LLM_input_tokens × P_LLM_INPUT(model, date)
  + LLM_cached_input_tokens × P_LLM_CACHED_INPUT(model, date)
  + LLM_output_tokens × P_LLM_OUTPUT(model, date)
  + storage PUT/store/egress
  + retry and failure allowance
```

- **確認済み / 公式**: repo defaultのOpenAI `whisper-1`は公式価格`$0.006/min`。
- **確認済み / 公式**: ElevenLabs public API pricingでMultilingual v2の方向値は`$0.10/1k characters`。plan/contract/discount/税で変わるため、ledgerには実契約price versionを入れる。
- **人手確認**: Azureはregion/contract/featuresで価格が変わる。baselineを`P_STT_STANDARD`、repoで有効なprosodyの追加単価を`P_PROSODY_ADDON`としてproduction subscriptionで確認するまで固定値を置かない。
- 固定plan fee、voice slot、Apple手数料・税、refund、support、failed retryもunit economicsへ加える。Apple net rateを一律値として決め打ちしない。

### Scenario model

仮定: 1 userあたり月12評価、各60秒、月2回のfresh TTS、各500文字、1 custom clone/user。Azureと固定plan費は変数のまま。

| MAU | Eval / month | OpenAI STT | Azure usage | Fresh TTS chars | TTS direction cost | Voice slots |
|---:|---:|---:|---:|---:|---:|---:|
| 100 | 1,200 | $7.20 | `20h × (P_STT_STANDARD + P_PROSODY_ADDON)` | 100,000 | 約$10 | 100 |
| 1,000 | 12,000 | $72.00 | `200h × (P_STT_STANDARD + P_PROSODY_ADDON)` | 1,000,000 | 約$100 | 1,000 |

**確認済み / 公式 + 推測**: 公開slot上限はPro 160、Scale/Business 660であり、1,000 persistent clonesはself-serveに収まらない。evolving voiceでactive+candidateを持つと約2,000 slotsが必要になる。契約拡張前にcustom voiceを全Pro userへ約束してはならない。

### Enforcement rules

1. entitlementとusageをprovider call直前にserver transactionで再取得する。
2. idempotency key単位でreservationを確保できなければcallしない。
3. successはactual quantityでsettle。明確にprovider未課金のfailureだけreleaseし、不明なtimeoutはreconciliation待ちにする。
4. per-user / per-IP rate、concurrency、daily burst、monthly limit、global emergency stopを重ねる。
5. cache hitはprovider cost 0として別記録し、fresh generationと混ぜない。
6. pre-call reservation storeが使えない場合はfail closedにする。provider call後のsettlement write failureは既発生costを消せないため、durable outboxへ置きreconciliationする。analytics event failureとは扱いを分ける。
7. **提案**: variable provider costがnet revenueの20%を継続的に超えたらquota/price/providerを再審査する。

---

## 9. Pronunciation quality validation plan

### 現状の限界

- **確認済み / repo**: word coverageが`Set`で計算され、重複語と順序を失う（`services/pronunciation/azure-evaluator.ts:132-135`）。
- **確認済み / repo**: Azure callでmiscue assessmentを無効化している（`services/pronunciation/azure-evaluator.ts:439-448`）。
- **確認済み / repo**: short audio flagはsummaryへ入るが、raw Azure scoreの保存やbest rankを止めない（`services/pronunciation/azure-evaluator.ts:532-568`、`services/progress/progress.service.ts:59-93`）。
- **確認済み / repo**: mock evaluatorはSet coverageと高めのbaseline、coachはrule-basedである（`services/pronunciation/mock-evaluator.ts:16-45`、`services/coach/mock-coach.ts:3-18`）。
- **確認済み / repo**: calibration文書自身もmockが発音評価ではなく、raw Azure scoreは未校正と認める（`docs/evaluation-calibration-options.md:18-39,75-94`）。

### Datasetと試験設計

- 30–40人の日本語母語英語学習者を初期cohortにし、初級/中級/上級、iPhone世代、静かな部屋/生活noise、内蔵mic/イヤホンを分ける。
- 5人程度のnative/reference sampleをupper anchorにするが、「nativeを唯一の正解」としない。
- 同一固定scriptを複数take収録し、重複語、連結、数字、固有名詞、主要phoneme contrastを含める。
- silence、短すぎる音声、wrong script、強いnoise、clipping、複数話者、再生音の録音をinvalid setとして別に作る。
- 2人以上のblind human pronunciation raterがaccuracy、fluency、completeness、intelligibility、weak wordsを採点し、rater agreementを先に測る。
- provider/model/config、script version、audio hash、duration/SNR、score algorithm versionを各rowへ保存する。

### Launch gate案

数値は**提案**であり、pilot後に固定する。

| Gate | Initial threshold |
|---|---:|
| invalid input rejection | ≥95% |
| overall score vs human Pearson and Spearman | each ≥0.65 |
| each dimension correlation | ≥0.50 |
| overall MAE (0–100) | ≤10 |
| weak-word precision / recall | ≥0.70 / ≥0.60 |
| same-speaker retest median / p95 delta | ≤5 / ≤10 |
| subgroup MAE gap / correlation drop | <10 / <0.15 |
| evaluation technical success | ≥95% |

Microsoft公式はscoreがSTT/reference/audio qualityに依存し、app固有thresholdをvalidationする必要があるとしている。16kHz以上、近接mic、単一話者、通常速度、低noiseを推奨する。この前提をUIとserver gateへ反映する。

### 実装前のquality仕様

1. decoded audioからserverがduration、silence、clipping、SNR、channel、sample rateを測る。
2. invalid audioはprovider call前または最小call後にrejectし、review/best scoreへ保存しない。
3. transcriptとreferenceはsequence alignmentし、重複語・挿入・省略を保持する。
4. completeness/miscueを有効化し、Azure raw valuesとproduct-calibrated scoreを分離する。
5. calibration versionをimmutableにし、過去scoreを黙って再解釈しない。
6. quality gate合格までは「精密」「native-level」「改善を保証」等のclaimを使わない。

---

## 10. Custom voice scalability

### 確認済みの実装

- provider abstractionにはconsent/create/synthesizeがあるが、delete、slot capacity、retention、version lifecycle capabilityがない（`providers/voice/types.ts:51-63,83-130`）。
- ElevenLabsには個別delete helperがある（`providers/voice/elevenlabs.ts:567-631`）。account deletionはElevenLabs cleanupを想定するが、provider共通契約ではない（`services/account-deletion/account-deletion.service.ts:1721-1827`）。
- 新しいvoiceは作成時に直ちにdefaultとなり、old defaultを外す（`services/voice/voice.service.ts:434-481`）。plan cap、rate、slot、candidate reviewはない（`services/voice/voice.service.ts:483-552`）。

### v1境界

- built-in/reference voiceをdefaultとする。
- custom voiceは初期public launchではoff、または削除・consent・slot契約を実証したPro限定の「1回の初期clone」に絞る。
- 再作成時はspare slotを予約し、candidate作成→preview/明示承認→active切替→rollback期間後のold clone削除とする。spare slotがなければ再作成を拒否し、不可逆なold clone先行削除をしない。
- app-owned source sampleはsuccessful clone後の短いTTLで削除し、provider-held sample/derived voiceは別のcontract/retention/delete stateとして追跡する。
- synthesis failure時にproviderVoiceIdやStorage keyをclient/logへ露出しない。
- provider contractに`supportsDelete`、data class/operation別retention capability（例: `tts.input/output`、`ivc.sample`、`derivedVoice`）、`maxVoices`、`requiresConsentArtifact`、`modelVersion`を持たせる。単一の`supportsZeroRetention` booleanで表現しない。
- OpenAI custom voiceはeligible customer限定で、repoのaccount deletionはElevenLabs cleanupだけである（`providers/voice/openai.ts:25-30,587-708`、`services/account-deletion/account-deletion.service.ts:1721-1827`）。consent cleanup、voice delete endpoint/retention、commercial eligibilityを契約確認するまでfeature flag offとする。

### Capacity gate

custom voice公開前に次を契約画面とload testで確認する。

1. paid planのvoice slot hard limitと追加slot契約。
2. create/delete/synthesize rate limits、concurrency、queue latency。
3. source audio、derived voice data、generated audioのtraining/retention/ZRM。
4. deletion APIの完了semantics、SLA、retry/idempotency。
5. 100/1,000 MAUでのslot、fresh TTS、support replacement rate、gross margin。

---

## 11. Evolving voice spec

### Release decision

**v1では実装しない。v1.1のPro限定small betaへ延期する。** 既存文書もv1 deferを結論としている（`docs/store-release-brush-up-v1-deferral-decision.md:1-12,42-81`）。StoreKit、quota/cost、actual deletion、quality calibration、provider slot契約より先に進めない。

### 将来のserver model

- `voice_profiles`: userごとのactive voice pointerとcapability snapshot。planの正本は持たずserver canonical entitlementを都度参照し、必要ならdecision時のentitlement snapshotだけを保存する。
- `voice_versions`: immutable payload。`version_no`、source take/review、`source_script_id`、immutable script version/content snapshot、script/audio hashes、consent version/purpose、provider/model/capability、quality-gate versionとquality snapshot、supersedes、created timestamp。
- `voice_lifecycle_events`: candidate、approve、activate、rollback、retire、provider-deleteをappend-only記録し、version payloadをstatus/timestamp更新で書き換えない。
- `voice_ab_evaluations`: current/candidateのblind comparison、quality regressions、user choice。

effective stateはlifecycle eventから`candidate -> approved -> active -> retired`を導出し、`provider_deleted`をterminal eventとして扱う。新voiceを自動activeにしない。

### Candidate creation gate

1. separate evolving-voice consentとpurposeを取得する。
2. server ownership、entitlement、monthly candidate quotaを確認する。
3. minimum duration、silence、clipping、SNR、single speaker、script coverage、phoneme coverageを満たす複数takeだけを採用する。
4. current voice/referenceとのregression testを通す。
5. userがA/B previewし明示approveするまでactive pointerを変えない。
6. active + candidate/rollback用の最大2 provider clones/userを超えない。
7. rollbackがfull synthesis可能かcache-onlyかをprovider capabilityとして明示する。
8. beta cohort上限を`floor(契約上の利用可能slot数 / 2)`以下にserverで固定する。100 usersでもactive+candidateは200 slotsとなり、公開Pro 160 slotsを超える。

### Stop conditions

- deletion不能provider、slot契約不足、consent未確定、quality gate未達、unit cost不明のどれかがあればbetaを開始しない。
- take/review/script historyをevolving voice学習へ流用することを既存consentから推定しない。

---

## 12. Before TestFlight

### Internal TestFlight RC前

- [ ] tracked auth artifact incidentをcloseし、必要なsession revoke/credential rotation/history処理を完了する。
- [ ] Xcode 26+ / supported Node LTS / Capacitor versionをpinし、clean archiveをCIと別machineで再現する。
- [ ] local bundleを作り、release configから`server.url`、placeholder、debug、cleartextを排除する。
- [ ] Universal Link、native PKCE/session、Keychain storage、logout、expired session、recoveryを実機で通す。
- [ ] reviewer demo accountとfixed scriptを用意する。credentialはrepo外。
- [ ] third-party AI explicit consentを実装し、decline/withdrawalでprovider callが止まることを確認する。
- [ ] hard quota reservation、global kill switch、timeout/retry budgetをproduction-like環境で確認する。
- [ ] microphone permission、record/stop/playback、interruption、AirPods、background/lock、network loss、iPad/rotationを実機試験する（target familyはiPhone/iPad: `ios/App/App.xcodeproj/project.pbxproj:312,333`）。
- [ ] archiveのentitlements、privacy report、SDK signatures、icons、display name、minimum OSを確認する。

### External TestFlight前

- [ ] disposable accountでactual deletionをend-to-end実証する。
- [ ] privacy/terms/supportをfinal public URLで公開する。
- [ ] invalid-audio rejectionと主要quality regressionを通す。
- [ ] paywallを含むbuildならStoreKit sandbox、purchase/renewal/expiry/revoke/restore/offlineを通す。
- [ ] crash-free、API success、provider latency/cost、support/deletion alertを監視できる。
- [ ] participant consent、known limitations、data retentionをTestFlight notesへ明示する。
- [ ] beta description、test対象、feedback email等のTest Information、provisioning profile内application identifiersを確認する。
- [ ] 初回buildをexternal groupへ追加するとBeta App Reviewへ送られること、build有効期間が90日であることを計画へ織り込む。

---

## 13. Before App Review

- [ ] 本書のP0がすべてclosedで、evidence ownerと日付がある。
- [ ] final release archiveがXcode 26+ / required SDKで生成され、App Store validationを通る。
- [ ] App Store Connect metadata、screenshots、age rating、privacy labels、export compliance、support/privacy URLsが実装と一致する。
- [ ] active reviewer demo account、review notes、main loop手順、microphone/AI consent説明、live backendを用意する。
- [ ] StoreKit productsがReady to Submitで、price/paywall/entitlement/restore/ASSN V2/reconciliationをsandboxで証明する。
- [ ] in-app deletion initiation、connected operator/manual completion path、processing period、completion noticeを証明する。
- [ ] OpenAI/Microsoft/ElevenLabsのproduction org、region、retention/training/delete、DPA/termsをownerが確認する。
- [ ] score calibration gateを満たし、App Store copyから未証明claimを除く。
- [ ] script/history semanticsとdirect Data API grantsを修正し、RLS negative testsを通す。
- [ ] custom voiceを出す場合だけ、separate consent、slot capacity、provider delete、account deletion proofを追加する。満たさなければfeature flag off。
- [ ] support SLA、incident owner、provider kill switch、rollback/release runbookを当番者が演習する。

---

## 14. 14-day shipping plan

目標は**internal TestFlight RC**。1人で順次行う場合は3–4週間を見込み、14日はarchitecture/auth/privacy/backend/iOSを並列に担当できる小チームを前提とする。

| Day | Workstream | Exit condition |
|---:|---|---|
| 0 | Security + five decisions | artifact incident owner/処置、architecture、auth、monetization、privacy/quality scopeを承認 |
| 1–2 | Toolchain / release | Xcode 26+、Node LTS、clean CI archive skeleton、release guard green |
| 1–3 | Mobile architecture spike | local bundleからhealth/auth-required APIへ到達。`server.url`なし |
| 3–5 | Core mobile bundle | login/setup/scripts/listen/record/review/progress shellがlocal assetsで動作 |
| 3–6 | Native auth | Universal Link + PKCE + secure session + logout/recoveryが2実機でpass |
| 4–7 | Privacy | AI consent/decline/withdrawal、final data map/retention/legal draft |
| 5–8 | Quota/cost | atomic reservation/settlement、hard caps、ledger、emergency stopがpass |
| 6–10 | StoreKit | transaction/entitlement/ASSN/reconcile/restoreをsandboxでpass |
| 6–10 | Deletion | actual operator/job接続、disposable account deletion proof |
| 8–11 | Quality/history | invalid gate、sequence/miscue、snapshot/version方針、golden regression |
| 11–12 | Archive/device QA | clean archive、privacy report、auth/mic/audio/network matrix |
| 13–14 | Internal TestFlight | owner-approved RC upload、smoke、monitoring、known-issues notes |

**Day 5 stop rule**: local bundleまたはnative authが成立しなければremote wrapperへ戻さず、TestFlight日程を延期する。

---

## 15. 30-day monetization validation

### Cohort plan

- **Week 1**: 20–30人のprivate cohort。paywallなしでactivation、recording成功、quality complaint、cost/event completenessを測る。
- **Week 2**: value momentとquota noticeを検証。StoreKitはsandbox/limited rollout。custom voiceはoff。
- **Week 3**: single monthly Pro `¥980`仮説を小さく提示。Free/Pro capsとserver entitlementを固定し、discountを乱用しない。
- **Week 4**: activated cohortのretention、conversion、variable margin、refund、support理由でcontinue/change/stopを決める。

### 初期decision metrics（提案）

| Metric | Continue threshold | Stop / investigate |
|---|---:|---:|
| first-loop activation | ≥60% | <45% |
| evaluation technical success | ≥95% | <95% |
| invalid-input reject rate | ≥95% | <90% |
| D7 retention among activated | ≥25% | <15% |
| engaged frequency | median 4 sessions/week | <2 |
| paywall to purchase | ≥5% | <2% |
| overall paid conversion | ≥3% | <1.5% |
| variable provider cost / net revenue | ≤20% | >25% |
| contribution margin before fixed labor | ≥70% | <60% |
| refund rate | <5% | ≥5% |
| crash-free sessions | ≥99.5% | <99% |
| account deletion completion | 100% | any unexplained failure |
| custom voice completion, if enabled | ≥80% | <70% |

paid acquisitionは、provider cost >25%、evaluation failure >5%、quality complaint >10%、deletion proof failureのいずれかで停止する。D30でretentionが弱ければfeature追加より、script quality、1分習慣、feedbackの信頼性を修正する。

---

## 16. Changes NOT to make yet

1. v1でevolving/brush-up voiceを作らない。
2. SwiftUI全面rewriteをしない。
3. 既存Next.js全体をstatic exportへ大規模変換しない。mobile entryとBFF contractに限定する。
4. annual、lifetime、複数paid tier、unlimited provider usageを追加しない。
5. social loginを急いで追加しない。追加時はSign in with Apple要件を再評価する。
6. calibration datasetなしにprovider/modelやscore formulaを変更しない。
7. ad/attribution SDK、広範なbehavior analyticsを追加しない。
8. offline speech evaluation、background upload、on-device modelをv1 scopeへ入れない。
9. candidate custom voiceを自動activeにしない。
10. 変更したcritical gate以外のE2Eを広げない。現在のminimum smoke focusを維持する。
11. five stop decisions前にschema/API/auth/Capacitor/StoreKit/provider/canonical historyを実装変更しない。

---

## 17. Exact next 10 tasks

| # | Exact task | Exit condition | Effort | Dependency / stop |
|---:|---|---|---:|---|
| 1 | tracked auth artifactをsecurity incidentとして隔離評価する | 内容を画面/文書へ出さないscan、remote reachability判定、必要なrevoke/rotation/history処置、再発防止がowner sign-off | 0.5–2d | destructive history/rotation approval |
| 2 | local bundle + Next BFFのADRとthin spikeを作る | release configに`server.url`なし、local launch、health/auth-required API、network error shellが実機pass | 1–3d | architecture decision |
| 3 | Xcode 26+/Node LTS/Capacitor release pipelineを固定する | clean checkoutからCI archive、config guard、archive/privacy inspectionが再現 | 1–2d | Task 2 |
| 4 | native authとreviewer accessを実装する | UL+PKCE+secure session、logout/expiry/recovery、2 devices、stable demo accountがpass | 3–6d | auth/API decision、Task 2 |
| 5 | third-party AI/voice consentとprivacy packageを確定する | affirmative/versioned consent、decline/withdrawal、final policy/labels/retention、provider contract owner sign-off | 2–4d | privacy/schema decision |
| 6 | actual account deletionを接続し証明する | provider→4 buckets→DB→Auth→noticeがretryable、disposable accountで0残存確認 | 3–6d | destructive approval、Task 5 |
| 7 | StoreKit 2 server entitlementを構築する | purchase/renew/expire/revoke/restore、ASSN V2、reconciliation、idempotencyがsandbox pass | 5–10d | monetization/schema/API decision |
| 8 | atomic quota reservationとprovider cost ledgerを構築する | Free/Pro capsを並列requestでも超えず、actual quantity/price version、failure settlementがtest pass | 3–6d | Task 7 schemaと共同設計 |
| 9 | evaluation validity/calibration/history integrityを修正する | server audio gate、sequence/miscue、score version、human study plan、script snapshot方針とnegative testsがpass | 5–10d + study | score/canonical history decision |
| 10 | release candidateとApp Review packetを作る | P0=0、clean archive、device smoke、privacy labels、review account、support/runbook、internal TestFlight owner sign-off | 2–4d | Tasks 1–9 |

---

## Required human decisions — maximum five

1. **Security containment**: tracked認証artifactについて、隔離scan、session revoke/credential rotation、必要ならgit history purgeを承認するか。
2. **iOS architecture + toolchain**: remote wrapperを廃止し、Xcode 26+上のlocal Capacitor bundle + existing Next BFFへ進むか。
3. **Native auth**: Universal Link + native PKCE/secure session + dedicated password reviewer accountを承認するか。
4. **Monetization + voice scope**: Free/Pro caps、monthly Pro `¥980`仮説、StoreKit/server entitlementを承認し、custom voiceは削除/slot証明後のPro 1 clone、evolving voiceはv1.1へ延期するか。
5. **Privacy/deletion/quality gates**: provider別explicit consent、retention案、actual deletion proof、quality launch thresholdsをrelease stop条件として承認するか。

---

## Official sources verified 2026-07-16

### Apple

- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) — 2.1 completeness/reviewer access、3.1.1 IAP、4.2 minimum functionality、5.1 privacy/third-party AI sharing。
- [Upcoming submission requirements](https://developer.apple.com/news/upcoming-requirements/) — 2026-04-28以降のSDK/Xcode requirement。
- [Offering account deletion in your app](https://developer.apple.com/support/offering-account-deletion-in-your-app/) — in-app initiation、associated data、manual processing conditions。
- [App privacy details](https://developer.apple.com/app-store/app-privacy-details/) — Audio Data、User Content、linked data、third-party practices。
- [Manage app privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/) — App Store Connect privacy answers。
- [StoreKit](https://developer.apple.com/storekit/) and [Transaction.currentEntitlements](https://developer.apple.com/documentation/storekit/transaction/currententitlements) — verified transactions and entitlement UX。
- [Restoring purchased products](https://developer.apple.com/documentation/storekit/restoring-purchased-products)、[AppStore.sync()](https://developer.apple.com/documentation/storekit/appstore/sync%28%29)、[Transaction.appAccountToken](https://developer.apple.com/documentation/storekit/transaction/appaccounttoken) — restore UX and account/transaction association。
- [App Store Server Notifications](https://developer.apple.com/documentation/appstoreservernotifications/enabling-app-store-server-notifications) and [App Store Server API](https://developer.apple.com/documentation/appstoreserverapi) — lifecycle notifications and reconciliation。
- [Testing in-app purchases with sandbox](https://developer.apple.com/documentation/StoreKit/testing-in-app-purchases-with-sandbox) — purchase lifecycle testing。
- [Universal Links](https://developer.apple.com/documentation/xcode/allowing-apps-and-websites-to-link-to-your-content/) and [Associated Domains](https://developer.apple.com/documentation/xcode/supporting-associated-domains) — verified app/domain callbacks。
- [Third-party SDK requirements](https://developer.apple.com/support/third-party-SDK-requirements/) — privacy manifests and signatures。
- [TestFlight overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/) — external testing、Beta App Review、build availability、Test Information。

### Capacitor

- [Capacitor configuration](https://capacitorjs.com/docs/config) — `server.url` is for live reload and not intended for production; cleartext/allowNavigation production cautions。
- [Updating Capacitor](https://capacitorjs.com/docs/updating/8-0) — Capacitor 8 toolchain requirements。

### Supabase

- [PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow)、[Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)、[Email templates](https://supabase.com/docs/guides/auth/auth-email-templates) — same-device verifier and redirect hardening。
- [Managing user data](https://supabase.com/docs/guides/auth/managing-user-data) — Auth deletion/session and Storage ownership constraints。
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)、[Securing your API](https://supabase.com/docs/guides/api/securing-your-api)、[Secure data](https://supabase.com/docs/guides/database/secure-data) — grants/RLS defense in depth。
- [Storage ownership](https://supabase.com/docs/guides/storage/security/ownership)、[Storage buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals) — private object ownership and deletion ordering。

### OpenAI

- [Whisper model](https://developers.openai.com/api/docs/models/whisper-1) — `whisper-1` pricing and model details。
- [API data privacy](https://openai.com/business-data/) — API data is not used to train by default, subject to settings/terms。
- [Endpoint data controls](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint) — endpoint retention and Zero Data Retention eligibility; production organization must be checked。
- [GPT-4o mini TTS](https://developers.openai.com/api/docs/models/gpt-4o-mini-tts) — current lifecycle/deprecation status。
- [Audio API reference](https://developers.openai.com/api/reference/resources/audio/) — custom voice/consent eligibility and available lifecycle endpoints must be checked against the production account。

### Microsoft Azure Speech

- [Pronunciation assessment](https://learn.microsoft.com/en-us/azure/ai-services/Speech-Service/how-to-pronunciation-assessment) — accuracy/fluency/completeness/prosody and miscue configuration。
- [Characteristics and limitations](https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/speech-service/pronunciation-assessment/characteristics-and-limitations-pronunciation-assessment) — app-specific validation, audio conditions, correlation limitations。
- [Speech data privacy and security](https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/speech-service/speech-to-text/data-privacy-security) — realtime speech handling and customer responsibility。
- [Azure Speech pricing](https://azure.microsoft.com/en-us/pricing/details/speech/) — region/contract-sensitive STT and pronunciation/prosody price inputs。

### ElevenLabs / competitor context

- [API pricing](https://elevenlabs.io/pricing/api?price.platform=api) — current public direction pricing; contract price must be versioned。
- [Voice slot limits](https://help.elevenlabs.io/hc/en-us/articles/24351056337937-How-many-voice-slots-do-I-get-per-tier-and-how-can-I-increase-it) — plan capacity and expansion path。
- [Delete voice API](https://elevenlabs.io/docs/api-reference/voices/delete) and [Zero Retention Mode](https://elevenlabs.io/docs/eleven-api/resources/zero-retention-mode) — deletion capability and plan-specific retention control。
- [Instant Voice Cloning](https://elevenlabs.io/docs/eleven-creative/voices/voice-cloning/instant-voice-cloning) and [Voice clone export limits](https://help.elevenlabs.io/hc/en-us/articles/23863046754193-Can-I-export-my-voice-clones) — right-to-clone consent、irreversibility、rollback constraints。
- [ElevenLabs Privacy Policy](https://elevenlabs.io/privacy-policy) — voice data processing/training/retention terms requiring contract-level confirmation。
- [ELSA product pricing](https://elsaspeak.com/en/product?variant=C) and [ELSA Japan offer](https://elsaspeak.com/ema/elsa-premium-cs/?_country_=JP&_lang_=ja) — directional competitor context only; localized/promotional pricing may differ。

### Security testing

- [Playwright authentication](https://playwright.dev/docs/auth) and [Trace Viewer](https://playwright.dev/docs/trace-viewer) — authenticated state and traces can contain sensitive cookies/headers/network data and should not be committed.

---

## Audit stop record

Phase Aでは、本書以外のrepo fileを作成・変更していない。schema、API、auth、Capacitor、StoreKit、provider、canonical source、deletion operation、production configurationには変更を加えていない。次のactionは上記5判断とincident ownerの承認後に、別Phase・別worktreeで行う。
