# Phase B1B-Plan: App Store向けlocal Capacitor bundle + Next.js BFF成立性

調査日: 2026-07-17

対象: 隔離worktreeのHEAD 9dea006（Phase B1A）

今回の範囲: 設計・read-only成立性調査。実装、設定変更、migration、auth方式変更、Xcode操作は含まない。

## 1. Executive summary

**判定: FEASIBLE_WITH_MAJOR_CHANGES**

推奨方式は、**同一repo内にCapacitor用のclient-only mobile frontendを分離し、既存Next.jsをWeb版とHTTPS BFFとして維持する**構成である。

現行アプリ全体をそのままNext.js static exportする案は成立しない。14 page routeのうち、そのままlocal assetへ移せるのは法務・サポートの4 routeだけで、残る10 routeはServer Component、cookie認証、middleware、動的params、server-side DB/provider処理、同一originの相対APIに依存する。app/apiのnon-test route module 28件は、現行のownership、canonical data、private Storage、provider secret、service role、atomic persistenceという安全境界を維持するため、すべてBFFに残す。test-only 3件は現在もNext route treeに含まれ、runtime guardされているため、release clientから利用せずproductionで404または構造的に不在であることを検証する。別に /auth/callback もhosted server routeとして残る。

local bundle化はApp Review Guideline 4.2の合格を保証しない。ただし、remote server.urlでWebサイト全体を表示する構成より、local UI、録音、音声再生、評価、progressというapp固有の継続的utilityを説明しやすい。よってremote wrapperのまま提出するより妥当である。

最初の実装スパイクは、authやDBを含めず、**local bundleの /login shellとpublic HTTPS BFF health endpoint**だけに限定する。これはlocal asset、Capacitor copy/sync、HTTPS/CORS/ATS、offline shell、release guardを最小コストで判定する。authは現在のsame-WebView smokeが未完了であり、本Phaseでは方式を決めない。

主要数値:

- UI page route: 14
- そのままlocalへ移行可能: 4
- client化・API/auth契約変更が必要: 10
- non-test app/api module: 28（35 method handler）
- test-only app/api module: 3（release対象外）
- hosted BFFに残すnon-test API module: 28
- /auth/callbackを含む全server route module: 32
- internal TestFlight RCまでの標準見積り: 160時間 / 20営業日

## 2. Confirmed facts / assumptions / unknowns

### Confirmed facts

| 種別 | 確認した事実 | 根拠 |
|---|---|---|
| Repo | 調査対象は隔離worktree、detached HEAD 9dea006。開始時の既存dirtyは未追跡 docs/ultra-release-audit.md のみ | git status、git log |
| Capacitor | Capacitor 8.4.0、webDirは www、server.urlは hosted Vercel URL。コメントでもpreflight-only | capacitor.config.ts:3-14、package.json |
| Bundle | www/index.htmlは説明用placeholderで、production web bundleではない | www/index.html |
| Next build | next.config.mjsに output: "export" はなく、package.jsonにもCapacitor build/copy/sync scriptはない | next.config.mjs:2-5、package.json:5-34 |
| iOS | iOS deployment targetは15、Capacitorは8.4.0 exact。microphone purpose stringはある | ios/App/CapApp-SPM/Package.swift:7-13、ios/App/App/Info.plist:27 |
| iOS links | Associated Domains / Universal Link entitlementは現状確認できない | ios/App/App |
| Auth | WebはSupabase SSR cookie、middleware、Next Route Handlerに依存 | middleware.ts:51-71、lib/supabase/server.ts、lib/supabase/route.ts |
| Auth smoke | Developer checkoutで /login 表示まではPASSしたが、メール送信とsame-WebView callbackは未実施。auth smokeはPENDING | docs/current-state.mdと依頼背景 |
| Node | 調査環境はNode.js v25.8.1で、Capacitor 8の最低要件22以上を満たす。release採用versionでのinstall/build互換性は未検証 | node --version、Capacitor support policy |
| Client API | client fetchは相対 /api と credentials: "same-origin" を前提とする。local Capacitor originからhosted BFFへはそのまま届かない | components/auth/login-form.tsx、components/auth/sign-out-button.tsx、components/audio/protected-audio-player.tsxほか |
| BFF | evaluateはowned scriptとrecordingを再取得し、provider評価後にatomic RPCで保存する | services/review/review.service.ts:119-228 |
| Private media | recording、script audio、voice sample、voice consentはprivate Storageとownership checkを前提とする | services/storage、services/voice/replay.service.ts |
| Current toolchain | 報告済み環境はmacOS 14.6.1 / Xcode 16.2 | 依頼背景 |

### Official requirements and documented platform behavior

以下は2026-07-17時点で確認した公式資料である。

- Apple Guideline 4.2は、repackaged websiteを超える機能、content、UI、継続的utilityを要求する。2.1はログイン必須アプリについて、稼働中backendと審査用demo accountを求める。2.5.2は審査後に機能を変更するコードのdownload/executeを制限し、2.5.6はweb contentにWebKitを要求し、2.5.14は録音時の明示同意と明確な表示を要求する。デジタル機能の有料解除・購読は3.1.1のIn-App Purchase要件に従う。[App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- ATSは安全なHTTPS/TLS接続を既定とし、例外は限定・説明可能である必要がある。[Preventing Insecure Network Connections](https://developer.apple.com/documentation/security/preventing-insecure-network-connections)
- CapacitorのwebDirは最終index.htmlを含むcompiled web assets directoryである。server.url、server.cleartext、allowNavigationはproduction用途ではない。server.cleartextの公式説明は特にAndroidのcleartext制限を扱うため、iOS ATSとは別設定として検査する。[Capacitor Configuration](https://capacitorjs.com/docs/config)
- web build後、Capacitor syncがweb bundleをnative projectへコピーする。[Capacitor Workflow](https://capacitorjs.com/docs/basics/workflow)
- 環境別のCapacitor設定はscheme/targetと明示的な設定分岐で構成できる。[Environment-specific Configurations](https://capacitorjs.com/docs/guides/environment-specific-configurations)
- Next.js static exportは output: "export" を使う。cookies、redirects、middleware、Request依存Route Handler、generateStaticParamsのないdynamic routeなどは非対応である。[Next.js 14 Static Exports](https://nextjs.org/docs/14/app/building-your-application/deploying/static-exports)、[Latest Static Exports](https://nextjs.org/docs/app/guides/static-exports)
- Next Route HandlerはBFFとして使えるがpublic endpointであり、認証、authorization、入力検証、rate limitをserver側で実施すべきである。[Next.js Backend for Frontend](https://nextjs.org/docs/app/guides/backend-for-frontend)
- Capacitor 8の公式support条件はNode.js 22以上、Xcode 26以上、iOS deployment target 15以上である。[Capacitor Support Policy](https://capacitorjs.com/docs/main/reference/support-policy)
- 2026-04-28以降、App Store ConnectへのuploadにはXcode 26以上とiOS 26 SDK以上が必要である。[Apple Upcoming Requirements](https://developer.apple.com/news/upcoming-requirements/)
- Xcode 26.0から26.3のhost範囲はmacOS Sequoia 15.6からTahoe 26.x、Xcode 26.4.1から26.6はmacOS Tahoe 26.2から26.xである。[Xcode Support Matrix](https://developer.apple.com/support/xcode)

### Assumptions / engineering inferences

| 項目 | 推論 | 検証Gate |
|---|---|---|
| 4.2 | local bundle + 録音/評価/progressの一貫体験はremote wrapperより審査説明力が高い。ただし合格保証ではない | App Review notes、実機UX、review candidate |
| Repo構成 | mobile frontend分離はWeb版の回帰面積を最小化し、shared pure codeを再利用できる | prototype後のdependency graph |
| Audio | MediaRecorder、Blob preview、protected fetchはWKWebViewでも再利用可能性が高い | 実機record/upload/replay spike |
| Auth | native PKCE + secure storage + bearer BFFは境界が明確だが、現時点で採用を決定しない | pending same-WebView smoke後のAuth ADR |
| CORS | local originからHTTPS BFFを呼ぶには、実際のOriginを測定し、exact allowlistとCSRF方針が必要 | health/authenticated scripts spike |

### Unknowns

- Macの正確なmodel/year、Apple siliconかIntelか、Sequoia/Tahoe対応可否
- releaseで固定するNode.js versionと、そのversionでのinstall/build/全script互換性
- production用Apple Team、App ID、distribution certificate、provisioning profileの状態
- WKWebView上のmobile auth最終方式とsession保持先
- local originでのcross-origin cookie、Universal Link復帰、WebKit ITP挙動
- 実機でMediaRecorderが生成するMIME/container、長さ、background/interrupt挙動
- staging BFF/Supabase/providerの分離済みresourceと運用責任者

## 3. Current architecture

現在は「Next.jsがUIとBFFを同じoriginで提供し、Capacitorがhosted URLをWKWebViewに表示する」構成である。

1. Browser / Capacitor WKWebViewがNext.js pageへアクセスする。
2. middlewareがSupabase SSR cookieをrefreshし、/scripts、/setup、/progress、/settings配下をguardする。
3. Server Componentがcookie-backed Supabase clientでuser、scripts、progress、voice状態を読む。
4. Client Componentは相対 /api をsame-origin fetchする。
5. Next Route Handlerがauth/ownership/schemaを検証し、Supabase、private Storage、OpenAI、Azure、ElevenLabsを呼ぶ。
6. evaluateはclient payloadをcanonical sourceにせず、owned script/recordingをserverで再取得し、結果をatomicに保存する。

この構成の安全な部分はBFFであり、local化すべき部分は表示・routing・browser media UIである。Next server runtime、cookies、provider modules、service role、Node APIをmobile bundleへ移してはいけない。

### Dependency counts

数え方を固定するため、appとcomponents配下のTSX moduleを対象にした。

| 指標 | 数 | 定義 |
|---|---:|---|
| page module | 14 | app/**/page.tsx |
| layout module | 2 | app/**/layout.tsx |
| route UI entry server-default | 16 | 14 page + 2 layout。すべてuse clientなし |
| 全server-default TSX | 26 | 上記16 + shared component 10 |
| explicit client TSX | 23 | use clientを持つmodule |
| 全TSX | 49 | server-default 26 + client 23 |
| app/api route module | 31 | non-test 28 + test-only 3。test routeも現状はroute tree内 |
| app/api method handler | 38 | GET 13 / POST 19 / PATCH 3 / DELETE 3 |
| /auth/callback込みserver route | 32 module / 39 handler | callback GETを追加 |
| middleware protected prefix | 4 | /scripts、/setup、/progress、/settings |
| middleware影響page route | 8 | scripts配下5 + setup/voice + progress + settings |
| next/navigation依存 | 16 module | runtime到達15、未使用component込み16 |
| next/headers直接依存 | 4 module | scripts layout、Supabase server/route、voice factory |
| dynamic path route | 10 module | UI 3 + API 7。generateStaticParamsは0 |
| query-driven UI route | 5 | login、progress、scripts/new、listen、setup/voice |
| node:crypto依存 | 10 module | account deletion、audio library、quota、review、storage、voice等 |
| Buffer runtime依存 | 7 implementation module | provider、pronunciation、storage、replay |
| route到達process.env依存 | 15 module | Supabase/provider/env/cost/E2E guards |

## 4. Route classification matrix

分類:

- S: 現状の内容をlocal static assetへ移植可能
- C: client-side routing/data fetchへ変更すれば移行可能
- SC: Server Component依存
- B: Route Handler / hosted BFF依存
- M: middleware / server cookie依存
- D: dynamic paramsまたはrequest-time query依存
- U: platform spikeまで未確定

| Route | 分類 | 現在の依存とコード根拠 | local bundleへの方針 |
|---|---|---|---|
| / | C / SC / M | getCurrentUserで表示分岐。app/page.tsx:40-42,74-97 | local Home shell + mobile session state + BFF read |
| /login | C / B / M / D / U | searchParamsとserver env判定、same-origin sign-in。app/login/page.tsx:17-21,50-53、components/auth/login-form.tsx:13-28 | UIはlocal化。auth transport/callbackはAuth ADR後 |
| /privacy | S | Metadata、Link、純表示。app/privacy/page.tsx | local contentとして共有 |
| /terms | S | Metadata、Link、純表示。app/terms/page.tsx | local contentとして共有 |
| /support | S | Metadata、Link、純表示。app/support/page.tsx | local contentとして共有 |
| /support/account-deletion | S | Metadata、Link、純表示。app/support/account-deletion/page.tsx | local説明はbundle、実処理はBFF |
| /progress | C / SC / B / M / D | auth/redirect、DB read、scriptId query、protected audio。app/progress/page.tsx:22-65,262,299,335,366 | local view + BFF read/audio |
| /scripts | C / SC / B / M | layoutでheaders/auth、pageでprogress/voice/provider状態。app/scripts/layout.tsx:1-11,47-48、app/scripts/page.tsx:82-104 | local list view + authenticated BFF |
| /scripts/new | C / SC / B / M / D | auth/DB、from query、create/generate BFF。app/scripts/new/page.tsx:11-30 | local form + BFF create/generate |
| /scripts/[id]/listen | C / SC / B / M / D | dynamic id、created query、owned script/voice/cache/progress、TTS。app/scripts/[id]/listen/page.tsx:19-50,81-84 | local player view + BFF script/TTS/audio |
| /scripts/[id]/record | C / SC / B / M / D / U | auth/DB/provider status。MediaRecorder、upload/evaluate。app/scripts/[id]/record/page.tsx:17-41、components/record/record-and-evaluate-panel.tsx:299-453 | recorder UIは共有候補。実機MIME spike後、BFF upload/evaluate |
| /scripts/[id]/review/[takeId] | C / SC / B / M / D | 2 dynamic params、auth/DB/review、protected take audio、saved library mutations。app/scripts/[id]/review/[takeId]/page.tsx:26-50,122,331 | local review view + BFF read/audio/mutations |
| /settings | C / SC / B / M | auth/deletion state、sign-out、account deletion。app/settings/page.tsx:11-36 | local settings view + BFF auth/deletion |
| /setup/voice | C / SC / B / M / D / U | next query、auth/voice state、consent/sample/create。app/setup/voice/page.tsx:80-107 | local consent/recorder UI + BFF upload/provider |

集計:

- そのままlocalへ移せるroute: 4 / 14
- client化、auth/API base、BFF contract変更が必要なroute: 10 / 14
- middlewareの影響を受けるpage route: 8 / 14
- dynamic pathを持つpage route: 3 / 14
- 未確定要素を持つroute: /login、record、setup/voice

/auth/callbackはpageではなくNext Route Handlerである。request cookie、PKCE code/token交換、response cookie、redirectを扱うためlocal bundleに入れずhosted auth endpointに残す。middlewareもlocal asset originでは実行されないため、local UIにはUX上のroute guardを設ける。ただし真正のauthorizationは必ずBFF側で再検証する。

## 5. API / BFF matrix

凡例:

- Admin: service-role/admin clientを直接またはservice内部で使用
- Re-fetch: user所有権、canonical row、private object pathをserver側で再確認
- Direct: mobileからSupabase data/storageを直接呼ぶ可否
- Control: 将来のrate limit、entitlement、idempotency、cost guardの優先度

| Route / method | Auth | Admin | Re-fetch / I/O / provider | Localからの呼出 | Direct | BFF / Control |
|---|---|---:|---|---|---|---|
| /api/account/deletion-auth-dry-run GET | 必須 | Yes | user IDからAuth削除plan | HTTPS | No | BFF必須。高rate、safe summary |
| /api/account/deletion-confirm POST | 必須 | Yes | owned deletion requestの確認状態更新。実削除は行わない | HTTPS | No | BFF必須。idempotency、再認証、rate |
| /api/account/deletion-database-dry-run GET | 必須 | Yes | user IDからDB cleanup plan | HTTPS | No | BFF必須。高rate |
| /api/account/deletion-inventory GET | 必須 | Yes | 全削除対象inventory | HTTPS | No | BFF必須。高rate、出力最小化 |
| /api/account/deletion-job-dry-run GET | 必須 | Yes | cleanup job全体のdry-run | HTTPS | No | BFF必須。operator境界 |
| /api/account/deletion-provider-dry-run GET | 必須 | Yes | ElevenLabs cleanup plan | HTTPS | No | BFF必須。provider rate/cost |
| /api/account/deletion-request POST | 必須 | Yes | owned deletion request作成 | HTTPS | No | BFF必須。idempotency、rate |
| /api/account/deletion-status GET | 必須 | No | owned request state | HTTPS | No | BFF維持。read rate |
| /api/account/deletion-storage-dry-run GET | 必須 | Yes | private Storage cleanup plan | HTTPS | No | BFF必須。高rate |
| /api/auth/sign-in POST | pre-auth | No | Supabase PKCE、continuity cookie、email provider | HTTPS | Auth ADRまでNo | BFF維持。abuse/email rate、CSRF |
| /api/auth/sign-out POST | session | No | Supabase sessionとtransient cookie clear | HTTPS | No | BFF維持。CSRF、idempotent |
| /api/coach POST | 必須 | No | owned takeからpersisted coach read | HTTPS | No | BFF維持。read rate |
| /api/create-voice POST | 必須 | provider依存Yes | owned consent/sample、adminによるprivate sample read、voice provider、quota event | HTTPS | No | BFF必須。entitlement、provider cost/rate |
| /api/evaluate POST | 必須 | No | owned script/recording再取得、OpenAI/Azure、atomic persistence | HTTPS | No | BFF必須。entitlement、cost/rate/idempotency |
| /api/script-audio/[audioId] GET | 必須 | No | owned script audio、private download、Range | HTTPS | No | BFF必須。download/range rate |
| /api/script-studio/generate POST | 必須 | quota経由 | OpenAI生成、quota event | HTTPS | No | BFF必須。entitlement、cost/rate |
| /api/scripts/[id] GET/PATCH/DELETE | 必須 | No | user ID + script IDでownership | HTTPS | No | BFF維持。mutation rate、idempotency |
| /api/scripts/[id]/saved-best-takes/[savedBestTakeId] PATCH/DELETE | 必須 | Yes | script/take/owner再確認、library mutation | HTTPS | No | BFF必須。mutation rate |
| /api/scripts/[id]/saved-best-takes GET/POST | 必須 | write時Yes | owned list、owned takeをlibraryへ保存 | HTTPS | No | BFF必須。write rate/entitlement |
| /api/scripts/[id]/saved-model-audios/[savedAudioId] PATCH/DELETE | 必須 | Yes | script/audio/owner再確認、library mutation | HTTPS | No | BFF必須。mutation rate |
| /api/scripts/[id]/saved-model-audios GET/POST | 必須 | write時Yes | owned list、owned model audioを保存 | HTTPS | No | BFF必須。write rate/entitlement |
| /api/scripts GET/POST | 必須 | No | user所有scripts read/create | HTTPS | No | BFF維持。create rate/plan limit |
| /api/speak-script POST | 必須 | quota経由 | canonical script/voice、provider、cache/private Storage | HTTPS | No | BFF必須。entitlement、cost/rate |
| /api/takes/[takeId]/audio GET | 必須 | No | owned persisted take、private recordingの全体200 response。現状Range非対応 | HTTPS | No | BFF必須。download rate。Rangeは将来検証 |
| /api/uploads/recording POST | 必須 | No | multipart、MIME/size、owned key、private upload | HTTPS | No | BFF必須。size/rate/quota/idempotency |
| /api/uploads/voice-consent POST | 必須 | No | multipart、file validation、authenticated user-owned keyへのprivate upload。consent row作成前 | HTTPS | No | BFF必須。size/rate/audit |
| /api/uploads/voice-sample POST | 必須 | No | multipart、MIME/size、consent、private upload | HTTPS | No | BFF必須。size/rate/entitlement |
| /api/voice-consent POST | 必須 | No | owned consent state作成 | HTTPS | No | BFF必須。audit/idempotency |
| /api/test-login POST | test guard | Yes | E2E test user login | release呼出禁止 | No | 現状runtime guard。production 404/不在をassert |
| /api/test-seed-script POST | test guard + auth | No | E2E smoke script seed | release呼出禁止 | No | 現状runtime guard。production 404/不在をassert |
| /api/test-voice-state POST | test guard + auth | Yes | provider voice state/reset cookie | release呼出禁止 | No | 現状runtime guard。production 404/不在をassert |

集計と方針:

- non-test app/api: 28 module / 35 method handler。**28件すべてをhosted BFFに残す**。
- test-only: 3 module / 3 handler。現状はroute tree内でruntime guardされる。mobile clientに実装せず、productionでは各routeが404または構造的に不在であることをserver-side smokeで保証する。
- /auth/callback GETはapp/api外だが、同様にhosted serverへ残す。
- Supabase clientから直接data/storageへ接続する設計変更はB1Bでは行わない。RLSだけに責任を移すと、canonical script、ownership re-fetch、private path、atomic review、provider/quota境界を弱める。
- mobileからのSupabase直接利用候補は将来のAuthのみであり、pending smoke後のAuth ADRが承認されるまで未決定とする。

## 6. Local bundle options comparison

| 方式 | 4.2相対リスク | 共有率 | Auth / audio | Deploy / 移行工数 | Web影響 | Rollback | 推奨 |
|---|---|---|---|---|---|---|---|
| 1. 現行Next全体をstatic export | 中 | 表面上高いがserver codeを分解する必要 | cookies/middleware/dynamic routes非互換。audio APIも別origin化 | 大。現行14 route中10を再設計 | 高 | 難 | No。単純exportは不成立 |
| 2. 現行treeをclient-only shell + remote BFF化 | 中低 | 高 | mobile auth契約が必要。Media UIは共有可能 | 大。Web runtimeもclient化 | 高 | 中 | No。Web回帰面積が大きい |
| 3. 同一repoでmobile frontend分離 + Next Web/BFF | 中低 | pure UI/schema/domainを共有 | mobile auth adapterが必要。audio UIを段階共有 | 大だが段階化可能。deployはWeb/BFFとmobile bundleの2 target | 低 | 容易 | **Yes** |
| 4. remote server.url継続 | 高 | 現状100% | 現行cookieに最も近いがsmoke未完 | 小 | 低 | 容易 | production No。開発preflightのみ |
| 5. SwiftUI等へ全面native rewrite | 低 | 低 | auth/audioを全面再実装 | 最大 | 低 | 難 | MVPには過剰 |
| 6. local launcher + remote page/iframe混在 | 高 | 中 | origin/cookie/navigationが複雑 | 中 | 中 | 中 | No。4.2改善が弱い |

Appleはremote WebViewそのものを一律禁止していないため、4.2列は公式な合否ではなく本アプリへの工学的リスク評価である。local化だけでも合格保証はなく、録音、評価、progress、offline/error shell、native permission UXを一貫した製品体験として示す必要がある。

## 7. Recommended architecture

### 7.1 Local Capacitor bundle

最終的にbundleするもの:

- Home、login shell、setup/voice、scripts、new、listen、record、review、progress、settings、legal/supportのUI
- client-side router、route-level loading/error/offline state
- design tokens、styles、pure UI components
- MediaRecorderによる録音UI、local Blob preview
- protected audioをauthenticated fetchして再生するplayer
- typed API client、public environment reader、auth adapter interface
- schemaのうちbrowser-safeなrequest/response validation

bundleしてはいけないもの:

- Supabase service role、provider key、private Storage path
- Next server component、middleware、next/headers、server-only module
- account deletion operator、quota admin、provider implementation
- transcription、pronunciation、voice generation implementation
- production秘密値、.env file、test route helpers

### 7.2 Hosted Next.js Web + BFF

残す責任:

- Web版のServer ComponentとSSR cookie auth
- mobile requestのsession検証とauthorization
- canonical script、take、review、progress、voice stateの取得
- user IDとresource IDを使ったownership再取得
- private recording/voice uploadとprotected audio download
- OpenAI transcription、Azure pronunciation、OpenAI/ElevenLabs voice、Script Studio
- evaluateのatomic persistence
- quota、rate limit、将来のentitlement/cost guard
- account deletion request、inventory、provider/storage/database/Auth cleanup
- auth callbackと、選択されたmobile auth transportのserver half

### 7.3 Session and API base

- Web: 現行のSupabase SSR cookie方式を維持する。
- iOS: 本Phaseでは未決定。候補は、(a) native/client PKCE + Keychain相当secure storage + bearer BFF、(b) cross-origin credentialed cookie + Universal Link/WKWebView callback。
- localStorageへlong-lived session tokenを保存しない。
- mobile API baseはbuild-time public valueとし、development/staging/productionごとにexact HTTPS hostをallowlistする。
- production bundleはlocalhost、127.0.0.1、HTTP、任意host overrideを拒否する。
- BFFはmobile transportを1方式に収束させ、cookieとbearerを無期限に二重運用しない。

### 7.4 Data and media paths

- Protected audio: local player → authenticated BFF GET → ownership re-check → private Storage read → Blob/stream playback。script audioは現行Range/Content-Range対応を維持する。take audioは現状全体200 responseであり、Range対応は別spikeで必要性を判定する。
- Recording: local MediaRecorder → multipart HTTPS BFF → auth + MIME/size/duration/owned key validation → private Storage。
- Voice provider: local UI → BFF → ownership/consent/quota → provider → private Storage/cache → protected playback。
- Pronunciation: local UI → BFF evaluate → owned canonical script/recording → transcription/pronunciation providers → atomic DB persist → safe review DTO。
- Account deletion: local settings UI → BFF → re-auth/idempotent request → server-side inventory/provider/storage/DB/Auth workflow。

## 8. Web / iOS shared-code boundary

推奨境界:

| 層 | WebとiOSで共有 | Web専用 | iOS専用 |
|---|---|---|---|
| Domain | fixed-script rules、DTO、Zod schema、error code、formatters | Server Component用adapter | mobile route state |
| UI | pure presentational components、tokens、icons、record/player state machine | Next Link/redirect wrapper | Capacitor router/navigation wrapper |
| API | typed contract、request/response type | same-origin server invocation | absolute HTTPS client、auth header/cookie adapter |
| Auth | auth state interface、safe error taxonomy | SSR cookies、middleware | secure storage/Universal Link adapterはADR後 |
| Media | recorder/player logicのbrowser-safe部分 | Web permission UX | iOS permission/lifecycle adapter |
| Server | 共有しない | Supabase server/admin、providers、storage、quota、deletion | bundleへimport禁止 |

共有の単位は「pure code」であり、page fileのコピーではない。全面二重実装を避ける一方、Next固有のserver/runtimeコードをmobile bundlerへ無理に持ち込まない。

依存guardとして、apps/mobileから以下へのimportを禁止する:

- app、middleware.ts
- lib/supabase/server.ts、route.ts、admin.ts
- providers
- services/account-deletion、quota、storageのserver implementation
- node:*、server-only、next/headers、next/server

## 9. Auth impact

**現在のsame-WebView auth smokeは未完了でPENDINGである。本Phaseはauth方式を変更・決定しない。**

| 選択肢 / 要素 | 影響する層 | 今回の扱い |
|---|---|---|
| same-WebView cookie auth | login UI、BFF CORS/cookie、callback、WebKit storage | 既存baseline smokeを後日完了。成功してもproduction採用を自動決定しない |
| Universal Links | @capacitor/app、appUrlOpen、Apple entitlement、AASA、email redirect URL、AppDelegate、router | production email-link復帰の候補。別Gate |
| native PKCE | mobile auth client、callback、BFF bearer検証、token refresh | 境界は明確だがauth変更。Auth ADR後 |
| email OTP | login UI、Supabase template、BFF verify endpoint、reviewer運用 | link復帰依存を減らす候補。方式変更なので別Gate |
| secure storage | refresh/session token、logout、device restore | native PKCE採用時にKeychain相当を使用。localStorageは禁止 |
| reviewer account | App Review 2.1、staging data、provider quota、account deletion | review candidate前に人間が用意し、backendを稼働 |

Auth ADRで最低限比較するもの:

- session theft/CSRF/XSS境界
- WKWebView終了・再起動後のsession継続
- Universal Linkとemail clientからの復帰
- refresh/revocation/logout
- BFFのcookie/bearer検証方法
- App Review demo accountとメール受信に依存しない審査導線

## 10. Audio / recording / provider impact

### Recording

components/record/record-and-evaluate-panel.tsxとcomponents/voice/browser-voice-recorder.tsxはMediaRecorder、getUserMedia、Blobを使うため、browser-safe UIの共有候補である。ただし実機で以下を証明するまで互換扱いにしない。

- microphone permissionの初回、拒否、Settings復帰
- WKWebViewが生成するMIME/containerとserver validation
- 1分録音のmemory、Blob size、upload timeout
- interruption、background、画面lock、route離脱
- 録音中の視覚表示と明示同意（Guideline 2.5.14）

### Upload and evaluation

- multipart uploadはBFFを維持する。
- BFFでauth、size、MIME、owned object keyを再検証する。
- evaluateはaudio-firstのまま、clientのscript textをcanonicalとしない。
- owned script/recordingを再取得し、provider結果とreview/progressをatomicに保存する。

### Protected replay

- Storage URLやobject keyをclientへ直接公開しない。
- BFFがownershipを再確認する。script audioは現在のRange responseを維持し、take audioは現在の全体200 responseをbaselineとして、Range追加の必要性を実機で判定する。
- mobile API clientは選択されたsessionを付与し、Blob URLまたはstreamへ変換する。
- cross-originでAuthorization、Range、Content-Type、Content-Length、Content-Range、Accept-Rangesを検証する。

### Providers

- OpenAI、Azure、ElevenLabs呼出はすべてBFF。
- provider secret、voice ID inventory、quota event、cost guardはserver-only。
- evolving voiceをv1へ追加しない。現在のprovider abstractionとfixed-script MVP境界を維持する。

## 11. Dev / staging / production configuration

| 環境 | Capacitor web content | BFF / data | Native network policy | 用途 |
|---|---|---|---|---|
| Development | localhost server.urlをdev schemeだけで許可。またはlocal bundle + local API | localhost BFF、development Supabase/provider | 必要時のみcleartext=true、allowNavigationはlocalhost限定 | Simulator開発のみ |
| Staging / TestFlight | **local compiled bundle**。server.urlなし | HTTPS staging BFF、staging Supabase、server-side staging provider config | cleartextなし、localhostなし、exact HTTPS API host | internal/reviewer smoke |
| Production | **local compiled bundle**。server.urlなし | HTTPS production BFF、production Supabase/provider | HTTPS only、localhost/allowNavigation/ATS例外なし | App Store |

設計原則:

- Capacitor server.cleartextとiOS Info.plistのATSは別の制御である。development HTTPが必要なら両者を限定的に設計し、productionではcleartext flagとATS例外を独立にFAILさせる。
- CAPACITOR_ENV等の明示値とXcode scheme/targetを対応させる。
- Archiveはproduction profile以外を拒否する。
- stagingとproductionはBFF host、Supabase project、provider server configを分離する。
- public API baseだけをbundleし、secretはBFF deploy environmentに限定する。
- generated native configと最終.app/archiveをsource configと同じ基準で検査する。

## 12. Release guards

production buildを次の条件でFAILさせる。

1. **resolved production profile**、production generated config、built .app/archiveのいずれかにserver.urlが存在する。development専用source configの存在自体はFAILにせず、それがReleaseへ選択・copyされないことを別assertionで検証する。
2. cleartextがtrue。
3. allowNavigationが非空、またはlocalhostを含む。
4. localhost、127.0.0.1、::1、http://のAPI/server URLがclient assetに存在する。
5. webDir/index.htmlがない、placeholder文言が残る、compiled assetが欠落する。
6. HTTPS BFF baseが承認済みproduction allowlistと一致しない。
7. NSAllowsArbitraryLoadsや広域ATS例外がある。
8. client bundleからserver-only/provider/admin/storage implementationへのimportがある。
9. .env file、service-role/provider private keyの名前またはsecret patternをbundle/archive内で検出する。guardは値を出力せずpath/categoryだけでFAILする。
10. test-login、test-seed-script、test-voice-stateへのclient参照またはproduction露出がある。
11. npx cap sync後のgenerated configとarchive内configがsource guardと不一致。
12. network offでlocal shellが表示されずblankになる。
13. exact CORS origin、OPTIONS、未認証401、他user resource拒否のsmokeが失敗する。
14. ReleaseでWeb Inspector、verbose auth/provider logging、debug menuが有効。
15. CIのNode、Xcode、iOS SDKが承認version未満。

既存のproduction-readiness preflightは.env.localを読むため、このPhaseでは実行しない。将来のbundle guardはsecretをloadせず、生成物をread-only scanする独立scriptにする。

## 13. Minimum vertical spike

### 選択

**local bundleの /login shell + unauthenticated public HTTPS /api/mobile/health**

authenticated /scripts、record upload、protected replayは判定力が高いが、未決定auth方式まで同時に持ち込む。最初のsliceではpackaging/networkの成立性だけを分離して証明する。

### Scope

- separate mobile frontendがlocal assetsをbuildする。
- server.urlを使わずCapacitorへcopy/syncする。
- /login shell、loading、reachable、offline/error stateを表示する。
- public health endpointへHTTPS GETする。
- API baseはbuild-time public configから取得する。
- production release guardをsource/generated/built assetに実行する。
- DB、Supabase Auth、provider、recording、migrationは触らない。

### Success conditions

1. server.urlなしでmobile build、cap sync、iOS build、install、launchが通る。
2. network offでも /login shellがblankにならず表示される。
3. network onでapproved HTTPS BFF healthが200を返す。
4. BFF停止時に秘密値を含まない明確なerror UIを表示する。
5. Web版のbuild/runtime動作に変更がない。
6. source、generated config、built .app/archiveのrelease guardがPASSする。
7. bundleにsecret、server-only import、localhost、test route参照がない。

### Failure conditions

- remote server.urlがないと画面が表示されない。
- local index/assetsがnative bundleへcopyされない。
- BFF requestがCORS、ATS、Origin、TLSで失敗する。
- offline launchがblank screenになる。
- dev configまたはsecret patternがproduction生成物へ残る。
- spikeのためにauth、migration、provider、Web pageの大改修が必要になる。

### Human operation

- 対応toolchainのMacでproduction-like schemeを選択する。
- Simulatorと最低1台の実機でinstall/launchする。
- network on/off、BFF on/offの4状態を目視する。
- Safari toolbarやremote pageへの外出がないことを確認する。
- build artifact guardのsafe summaryを確認する。

### Time

- core slice実装: 12〜20時間
- skeleton統合、self-test、guard、失敗系、文書化、bufferを含むprototype milestone: 楽観16時間 / 標準32時間 / 悲観56時間
- 人間のXcode/実機操作: 上記内に1〜2時間を見込む
- toolchain upgrade/download待ちは除外

## 14. Exact files expected to change in the spike

次Phaseで想定する最小候補。今回は作成・変更しない。

1. apps/mobile/package.json
2. apps/mobile/index.html
3. apps/mobile/tsconfig.json
4. apps/mobile/vite.config.ts
5. apps/mobile/src/main.tsx
6. apps/mobile/src/App.tsx
7. apps/mobile/src/lib/api.ts
8. apps/mobile/src/lib/environment.ts
9. app/api/mobile/health/route.ts
10. capacitor.config.ts
11. package.json
12. package-lock.json
13. .gitignore
14. www/index.html（obsolete placeholderを削除）
15. scripts/check-capacitor-release.mjs
16. scripts/check-capacitor-release-self-test.mjs

条件:

- .env.localは変更・参照しない。
- migrationは0件。
- health responseはstatus、safe build label、server time程度に限定し、env/provider/Supabase情報を返さない。
- apps/mobileは既存Next server moduleをimportしない。
- root packageをnpm workspace rootとし、lockfileはroot package-lock.jsonだけを更新する。
- capacitor webDirはapps/mobile/distを指し、apps/mobile/distとiOS生成copyはgenerated/ignoredとする。compiled assetをsourceとしてcommitしない。
- root package scriptはmobile build、sync、guardを明示的に分離する。

## 15. Risks and rollback

| Risk | 影響 | Mitigation / Gate |
|---|---|---|
| Auth transport未決定 | login後の全protected flowが止まる | pending same-WebView smoke完了後にAuth ADR。prototypeにauthを含めない |
| App Review 4.2 | local化してもreject | app固有utility、録音/評価/progress、offline/error UXをreview notesで説明 |
| CORS/CSRF/cookie | local originからBFFへsessionを送れない | exact origin、one auth transport、実機spike、CSRF設計 |
| Audio互換性 | MIME、permission、Rangeで失敗 | record/upload/replayを別vertical sliceで実機検証 |
| Bundle/config drift | remote URLやsecretをArchiveへ混入 | source/generated/.app/archiveの多段guard |
| Web/mobile divergence | 二重実装と修正漏れ | pure domain/schema/UI共有、contract tests、page copy禁止 |
| Toolchain incompatibility | TestFlight/App Store upload不能 | Mac compatibilityを先に人間確認しXcode 26環境を確保 |
| Backend availability | local appでも主要機能停止 | loading/retry/offline shell、health/observability、App Review用稼働backend |
| Test endpoint露出 | auth bypass/seed risk | production route/build guard、client参照禁止 |

Rollback:

- spikeはmigrationなし、既存Web/BFFのroute変更をhealth追加以外に広げない。
- spike commitを9dea006 baselineへrevertすれば、Web版と既存BFFにdata rollbackは不要。
- mobile build/sync scriptとgenerated assetsを外し、preflight用remote shellへ戻すことはdevelopment rollbackとしてのみ許容する。
- remote wrapperをproduction release fallbackにはしない。
- Auth、StoreKit、voice providerへ波及した場合はscope breachとしてspikeを中止する。

## 16. Effort estimate

前提: 経験あるengineer 1名、1営業日=8時間。下表は各milestoneまでの累積engineering時間で、Apple審査待ち、toolchain download、Developer Program待ち、外部provider審査は含まない。

| Milestone | 楽観 | 標準 | 悲観 | 主な内容 |
|---|---:|---:|---:|---|
| 1. local bundle成立性prototype | 16h / 2日 | 32h / 4日 | 56h / 7日 | mobile skeleton、health、sync、offline shell、release guard |
| 2. internal TestFlight RC | 96h / 12日 | **160h / 20日** | 280h / 35日 | auth、全主要UI、scripts、record/upload/evaluate/replay、env分離、実機QA |
| 3. App Store technical review candidate（無料提供・有料解除なし） | 200h / 25日 | 320h / 40日 | 520h / 65日 | reviewer flow、deletion、privacy、observability、failure UX、release rehearsal、review package |

標準見積りの最大変動要因は、auth方式、WKWebView audio、Mac/toolchain upgrade、Web/mobile共有componentの純化量である。StoreKitはこの見積りに含めないため、デジタル機能の有料解除・購読を含む実提出には、Guideline 3.1.1に基づく別IAP Gateと追加見積りが必要である。

## 17. Prerequisites

現行報告のmacOS 14.6.1 / Xcode 16.2は、2026-07-17時点のCapacitor 8およびApp Store upload要件を満たさない。Simulator preflightが通ることと、RCをuploadできることは別である。

### Human verification before implementation

1. About This MacでMac model/year、chip、memory、空きdiskを記録する。
2. [macOS Sequoia compatibility](https://support.apple.com/en-ie/120282)または[macOS Tahoe compatibility](https://support.apple.com/en-ie/122867)で公式対応を照合する。推測しない。
3. 対応する場合は、Sequoia 15.6〜Tahoe 26.x上のXcode 26.0〜26.3、またはTahoe 26.2〜26.x上のXcode 26.4.1〜26.6のどちらを採るか決める。
4. 非対応なら、対応MacまたはApple signing可能なmacOS build environmentを用意する。unsupported patchや非公式回避をrelease pathにしない。
5. OS更新前にbackup、十分なdisk、管理者権限、復旧時間を確保する。
6. XcodeとCommand Line Toolsをinstallし、license、xcode-select、xcodebuild -version、iOS 26 SDKを確認する。iOS 26 Simulator runtimeはupload要件ではないが、target OSでのSimulator QA用に推奨する。
7. release用Node.jsを22以上で固定し、そのversionでnpm install、Next/mobile build、既存scriptsの互換性を確認する。調査shellのv25.8.1をそのままrelease標準とはみなさない。
8. Apple Developer membership、Team、bundle ID、distribution signing、provisioning、App Store Connect accessを確認する。
9. staging BFF/Supabase/providerとproduction resourceの分離方針を承認する。
10. clean machine/CIでmobile build → guard → cap sync → archiveを再現する。

macOS/Xcode更新、sudo、runtime再install、signing変更はこの設計Phaseで実行しない。

## 18. What must not be implemented yet

- remote server.urlのままApp Store提出
- 現行Next tree全体への output: "export" 追加
- Web版とiOS版のpage全面コピー・二重実装
- auth、StoreKit、voice provider更新の同時実装
- evolving voiceのv1投入
- local bundle移行と大規模UI redesignの同時実施
- Supabase service role、provider secret、private Storage pathのclient bundle投入
- mobileからSupabase tables/private Storageへの直接write
- ownership、canonical script、atomic reviewをclientへ移すこと
- auth方式決定前のUniversal Links/native PKCE/email OTP実装
- productionでlocalhost、cleartext、allowNavigation、remote server.urlを許可
- test-only APIをrelease clientへ接続
- DB schema / migration
- broad refactor

## 19. Human decisions, maximum 5

1. **Architecture承認**: 同一repo内mobile frontend分離 + 既存Next Web/BFF維持を採用するか。
2. **Auth Gate**: pending same-WebView smoke後、cookie + Universal Linksかnative PKCE + secure storage + bearer BFFかをAuth ADRで選ぶ。
3. **Toolchain path**: Mac modelを確認し、Sequoia/Xcode 26またはTahoe/current Xcodeへ更新できるか。不可なら代替Mac/CIを用意するか。
4. **Environment分離**: staging/productionのBFF domain、Supabase project、provider server config、CORS originを分離するか。
5. **Spike承認**: 最初のsliceを /login shell + public HTTPS health + release guardだけに固定し、auth/audioを入れないか。

## 20. Exact next 10 tasks

1. 本文書をArchitecture Gateとしてreviewし、Human decision 1、4、5を承認する。
2. Mac model/year/chipとOS互換性を人間が確認し、Xcode 26 + iOS 26 SDK + Node 22の実行環境を確保する。
3. spike用branch/worktreeを作り、apps/mobileのVite/React skeletonとlocal /login shellを追加する。
4. secretを使わない /api/mobile/healthとexact Origin/CORS contractを追加する。
5. development/staging/productionの明示configとresolved production/generated/.app/archive release guardを追加し、test-only 3 routeがproductionで全て404または不在であるserver smokeも追加する。
6. server.urlなしでmobile build → guard → cap sync → xcodebuild → install/launchを行い、online/offline/BFF-downのshellを検証する。
7. Developer checkoutのpending same-WebView auth smokeを元の指示どおり完了し、結果をbaselineとして凍結する。B1B spikeと混ぜない。
8. Auth ADRを作成し、Universal Links/cookieとnative PKCE/secure storage/bearerを比較してHuman decision 2を確定する。
9. 選択authでauthenticated /scripts一覧だけをlocal mobile → BFFの次vertical sliceとして実機検証する。
10. record upload → evaluate → protected audio replayを順に独立spikeし、全てPASS後に残りUI移行とinternal TestFlight RC計画へ進む。

ここでPhase B1B-Planを停止する。実装、auth変更、StoreKit、voice provider変更、B1B implementationには進まない。
