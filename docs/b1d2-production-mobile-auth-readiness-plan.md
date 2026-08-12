# B1D2 Production Mobile Auth readiness / execution plan

> Status: **REBASELINED_SPLIT — B1D2A OPEN / B1D2B APP_STORE_RELEASE_BLOCKER / B1D2C DEFERRED_WITH_OWNER_AND_REVIEW_GATE**
>
> 調査基準日: 2026-07-26
> 人間確認情報の反映日: 2026-07-29
> pre-approval preparation更新日: 2026-07-29
> Unit A更新日: 2026-08-09
> Unit C retry更新日: 2026-08-09
> Unit D1更新日: 2026-08-09
> Unit D2 / Unit E更新日: 2026-08-09
> Unit F3更新日: 2026-08-09
> Unit F4更新日: 2026-08-11
> scope rebaseline更新日: 2026-08-11
> B1D2A repo-only evidence batch更新日: 2026-08-11
> B1D2A P0 negative/timeout wave更新日: 2026-08-11
> 調査worktree: `/Users/karasawatakahiro/.codex/worktrees/b4db/native-minute`
> 調査branch: `feature/mobile-auth-gate`
> 調査HEAD: `1e344297b5bc75ac4a8dad438df231fea0242241`
> pre-approval preparation開始HEAD: `7c85ff5dab2973dd682f97ce1224c9c8b31b184f`

この文書は、B1D2実装前のreadiness調査と、将来明示承認を受けて実行するための計画である。初回plan確定ではこの文書だけを変更した。pre-approval preparationではApple identityを必要としないsynthetic callback/lifecycle test、release相当fixture、AASA middleware safetyと事実同期だけを行い、Xcode project、entitlement、AASA本文、Supabase、Vercel、DNS、Apple Developer、DB、dependency、deploy、productionは変更していない。

### 2026-08-09 Unit A authoritative update

この節は、本文中の2026-07-29時点のApple承認待ち・staging mapping未確認という記述を上書きする。今回repo内で実装・検証するのはUnit Aだけで、Unit C以降には進まない。

- Apple Developer ProgramはActive。Team IDとApplication Identifier Prefixは確認済みで今回のaccountでは一致するが、実値はrepoへ保存しない。
- staging Explicit App ID `com.nativeminutes.app.staging`は登録済み。production App ID `com.nativeminutes.app`は未登録。Associated Domainsは未有効化。
- Vercel project `native-minute-staging`と`https://native-minute-staging.vercel.app`のProduction Deployment mapping、認証なしpublic browser accessは人間確認済み。Vercel AuthenticationはStandard Protection、Password ProtectionはOFF。AASA endpointは現在404。
- Supabase project `native-minute-staging`は人間確認済み。Site URLは`http://localhost:3000`、current redirectはDebug custom scheme、staging HTTPS redirectは未登録、Magic Link templateはdefault、Custom SMTPは未設定。DB password rotationは未完了または不明。
- repoではDebug/Releaseを維持し、Release由来で`DEBUG`を持たない`Staging` configurationを追加した。Staging bundle IDは`com.nativeminutes.app.staging`、Info.plistはcustom schemeなし、Team/provisioning/entitlementはrepo固定しない。
- `staging` mobile/Capacitor profileはStaging configuration、staging bundle ID、staging BFF origin、exact `https://native-minute-staging.vercel.app/mobile/auth/callback`へ対応する。Debug custom schemeはDebug専用Info plistとdevelopment/local-spike profileだけに残す。production callbackは引き続きunconfigured。
- Apple Portal、Associated Domains、entitlement、AASA本文、Vercel/Supabase Dashboard、Magic Link template、AppDelegate、SceneDelegate、dependency、DB/migration、productionは変更していない。

### 2026-08-09 Unit C retry authoritative update

この節は、Unit A節の「Associated Domains未有効・Unit C未着手」と、本文中の古いiPhone 14 / Apple承認待ち / signing未確認という現在状態を上書きする。historical snapshot自体は書き換えない。

- Apple Portalではstaging Explicit App ID `com.nativeminutes.app.staging`のAssociated Domains capabilityが有効化・保存済み。production App IDは未登録のまま。
- Xcode Apple Accountsの対象Developer Team、Apple Development certificate、iPhone 14 Plus / iOS 26.2.1のpairing・Connected・Developer Mode enabledは確認済み。Team ID、device identifier、account credentialは文書へ保存しない。
- repoではStaging専用`App-Staging.entitlements`へexact `applinks:native-minute-staging.vercel.app`を1件だけ設定し、Staging targetだけに`CODE_SIGN_ENTITLEMENTS`、Automatic signing、対象Teamを対応させた。Debug/Releaseにはentitlement/Teamを追加していない。
- Keychain AccessでApple Development certificateに対応するprivate keyが存在することを人間確認後、usable identity 1件、wired接続中iPhone、development profileのbundle / device整合を再確認した。profileのAssociated Domains authorizationはcapability wildcard `*`として存在する。
- `-allowProvisioningUpdates` / device registrationをStaging development buildだけに限定してAutomatic Signingを再実行し、signed Staging artifactを生成した。artifactのstrict codesign、staging bundle / application identifier、exact Associated Domain 1件、embedded development profile / connected device整合、Debug scheme非混入、production callback非有効化を確認し、Unit CはPASS。
- AASA endpointは404・本文未配置、Supabase staging HTTPS redirectは未登録、Magic Linkはdefault。AASA、Vercel/Supabase設定、AppDelegate/SceneDelegate、Universal Link実機smoke、Unit D/E/F、production signingは未着手。

### 2026-08-09 Unit D1 authoritative update

この節は、Unit C節の「AASA本文未配置・Unit D未着手」というrepo状態だけを上書きする。live deploymentと後続external stateは上書きしない。

- Unit C commit `2c6a188`は`origin/codex/b1d2-unit-c`へ通常push済みで、signed Staging development artifact verificationはPASS。
- signed artifact / embedded profileと人間確認済みApplication Identifier Prefixから、staging AASA application identifierを`<App ID Prefix>.com.nativeminutes.app.staging`として一意に確定した。Team IDとPrefixが今回一致する事実を一般的な導出規則にはしていない。
- repoにextensionなしの`public/.well-known/apple-app-site-association`を追加し、`applinks`のrecommended `appIDs` + `components`形式でstaging app 1件とexact `/mobile/auth/callback` 1件だけを許可した。wildcard、query binding、他service、他app/pathは含めない。
- Next.jsはredirect/rewriteなしでstatic artifactを直接配信し、exact pathへ`Content-Type: application/json`を設定する。既存middlewareのAASA pass-throughはSupabase auth client、redirect、cookieを使用しない。
- local production serverでAASAの200、no redirect、no cookie、JSON Content-Type、valid/exact JSONを確認した。live `https://native-minute-staging.vercel.app/.well-known/apple-app-site-association`はまだ404で、Vercel deploy/project設定変更は未実施。
- Supabase staging HTTPS redirectは未登録。Magic Link送信、actual Universal Link smoke、AppDelegate/SceneDelegate変更、Unit E/Fは未着手。

### 2026-08-09 Unit D2 / Unit E authoritative update

この節は、Unit A/C/D1節のlive AASA 404、未deploy、Supabase staging HTTPS redirect未登録というexternal stateを上書きする。repoのauth contract、historical snapshot、Unit F以降の未実施状態は上書きしない。

- Unit D2ではverified commit `b4cddb51386b3f8d668b5727de7802bd895edf01`を`native-minute-staging`のProduction Branch `feature/mobile-auth-gate`へfast-forwardした。`native-minute`側のProduction Branch `main`は変更していない。
- production `https://native-minute-staging.vercel.app/.well-known/apple-app-site-association`はHTTP 200、`application/json`、no redirect、exact `46P9QD3T3Q.com.nativeminutes.app.staging`、exact `/mobile/auth/callback`をPASSした。
- Supabase project `native-minute-staging`では、人間がAuthentication → URL ConfigurationのRedirect URLsへexact `https://native-minute-staging.vercel.app/mobile/auth/callback`を追加し、`Successfully added 1 URL`を確認した。staging HTTPS entryにwildcardはない。
- Debug redirect `com.nativeminutes.app.debug://auth/callback**`は残っている。Site URLは`http://localhost:3000`から変更せず、Magic Link templateはdefault、Custom SMTPは未設定、DB password rotationは未完了または不明。
- repoのstaging profile / BFF origin / callback validator / parserとSupabaseのHTTPS redirectはexact一致する。Debug fallbackを維持し、production callbackは引き続きunconfiguredである。
- Unit EではDashboardの追加操作を再実行せず、repo code/config/auth contract、Vercel、Apple、DB/migration、dependencyを変更しない。Magic Link送信、iPhone install/launch、actual Universal Link smoke、Unit Fは未実施で、B1D2はまだ未完了。

### 2026-08-09 Unit F3 authoritative update

この節は、Unit D2 / Unit E節の「Unit F未実施」と、1.5節のstatic inspectionだけでは実機failure proofにしない状態を上書きする。修正後のactual Magic Link happy pathはまだPASS扱いしない。

- signed staging appの実機install、`authConfigured=true`、live AASA、Universal Link Diagnosticsを確認後、actual warm Magic Linkを1通だけ送信した。localhost fallback解消後、iOSはNative Minute Stagingをforegroundにしたが、JS callback handlerへ到達せず`/login`に残ったため、`WARM_UNIVERSAL_LINK_NATIVE_TO_JS_INGRESS_MISSING`を実証した。
- installed/lock/SwiftPMのCapacitor Core/iOSは8.4.0。projectはUIApplicationDelegate lifecycleで、SceneDelegate、scene methods、`UIApplicationSceneManifest`はない。AppDelegateはcustom URLだけをforwardし、Capacitor 8.4.0公式templateにある`continue userActivity` forwardingが欠けていた。
- `AppDelegate`へ公式templateどおり`ApplicationDelegateProxy.shared.application(... continue: ... restorationHandler: ...)`の最小forwardingだけを追加した。native側でURLをparseせず、repo-local plugin、JS callback pipeline、Debug custom scheme、PKCE/state/nonce/transaction、Keychain、Bearer BFF、AASA/signing/config contractは変更していない。SceneDelegate、`@capacitor/app`、dependencyも追加していない。
- delegate → Capacitor proxy `lastURL` / `capacitorOpenUniversalLink` → repo-local `MobileAuthLifecyclePlugin` → retained `appUrlOpen` → existing `handleCallbackUrl()`をfocused contract testで固定し、既存のwarm/cold lifecycle exchange testもPASSした。
- 全mobile tests、mobile lint/typecheck、staging/release/auth guards、実機destination向けsigned Staging development build、strict codesign、staging bundle/Associated Domains、`authConfigured=true`、public config pair、secret/service-role非混入、Debug scheme非混入、production callback非有効化をPASSした。既存`com.nativeminutes.app.staging`へuninstallせずupdate install済み。
- 修正後の新しいMagic Link送信、warm callback、session exchange/Keychain save、authenticated UI、session restoreは未実施。古いlinkは再利用せず、B1D2はまだ未完了である。

### 2026-08-11 Unit F4 authoritative update

この節は、直前のUnit F3節にある「修正後のMagic Link再試行は未実施」という状態を上書きする。Unit F4はwarm happy pathだけを対象とし、cold、logout、negative test、final closeoutには進まない。

- Unit F3のexact 5-file差分、signed Staging build、`authConfigured=true` artifact、既存staging appへのupdate installを維持したまま、新しいMagic Linkを1通だけ送信し、最新linkをwarm状態で1回だけ開いた。古いlink、追加link、再タップは使用していない。
- iOSのwarm OS handoff、AppDelegate `continue userActivity`、Capacitor `ApplicationDelegateProxy`、`capacitorOpenUniversalLink`、repo-local `MobileAuthLifecyclePlugin`、retained `appUrlOpen`、existing `MobileAuthService.handleCallbackUrl()`へのingressをactual-device authenticated resultまで通し、prior `WARM_UNIVERSAL_LINK_NATIVE_TO_JS_INGRESS_MISSING`が解消したことを確認した。
- exact staging callback target validation、state/nonce/transaction binding、native-owned PKCE exchange、one-time consumption、provider session exchange、device-only Keychain session save、authenticated application stateをPASSした。実値やsecret-bearing callback URLは記録していない。
- Native Minute Stagingの`/SCRIPTS`表示、Bearer BFF接続を人間/Codexで確認した。appを通常terminateして再launch後もKeychain session restoreとauthenticated UIをPASSし、callback再消費はなかった。
- email、Magic Link、dynamic callback URL、auth code、token、state/nonce/transaction、PKCE verifier、Keychain本文、device identifier、certificate ownerは文書へ保存していない。
- cold callback、logout、duplicate/expired/wrong-state、refresh強制、B1D2 final closeoutは未実施。B1D2はまだ未完了である。

### 2026-08-11 Human Decision scope rebaseline

`HDC_B1D2_RELEASE_WIDE_SCOPE_SPLIT_AND_EXTERNAL_TEMPLATE_WORK_V2`により、original B1D2を履歴を変えず`B1D2A_STAGING_AUTH_CORE`、`B1D2B_RELEASE_READINESS`、`B1D2C_DEFERRED_HARDENING`へ分割した。original B1D2は`REBASELINED_SPLIT`、Aは`OPEN`、Bは`OPEN — APP_STORE_RELEASE_BLOCKER`、Cは`DEFERRED_WITH_OWNER_AND_REVIEW_GATE`である。AだけをPASSしてもoriginal B1D2全体をPASSと表現しない。

最初の完全なscope baselineは`7c85ff5dab2973dd682f97ce1224c9c8b31b184f`、evidence checkpointは`fb011b9c740a98a9cff267d078f9ac7d80f00dd7`で、D1〜D15 / M01〜M28はすべてbaselineからoriginal、later-added D/Mは`0`である。exact mapping、DoD/evidence ledger、Unit F safe evidence reconciliation、External Template Work境界は[`b1d2-release-wide-scope-rebaseline-split.md`](./b1d2-release-wide-scope-rebaseline-split.md)を正とする。

Unit Fはphysical iPhone smoke / evidence / focused fixes、original Plan Phase Fはproduction readiness reviewであり、同名の別工程である。Unit F4のcold/logout未実施記述はそのrunの履歴として維持する。その後提示されたM01/M19/M20のHuman-provided historical actual-device evidenceは、repo implementation/testsとの整合とcontradiction不在を確認して`PASS_ACCEPTED_HUMAN_SAFE_EVIDENCE`として受理した。repo direct resultや今回の再実行とは表現せず、exact実行日時とexact tested build identifier / commitは`UNKNOWN`のままとする。case別provenanceは[`b1d2-unit-f-safe-evidence-reconciliation-result.md`](./b1d2-unit-f-safe-evidence-reconciliation-result.md)を正とする。

### 2026-08-11 B1D2A remaining repo-only evidence authoritative update

残19件をcase単位でA〜Hへ再分類し、既存focused testを変更せず5 files / 75 tests再実行した。M06B / M07 / M09 / M12 / M16 / M18はdeterministic repo contractを十分に証明するため`PASS_EXISTING_TEST_REEXECUTION`として閉じた。これはrepo-generated test evidenceであり、actual-device evidenceではない。source/test追加・変更、Magic Link、iPhone/Simulator、Supabase/Vercel/Apple/provider、network/failure操作は行っていない。

B1D2Aは13件を残して`OPEN`である。M04/M05/M14はsource implementation、M03/M06A/M08/M24/M25はactual-device、M13/M17/M22はnetwork/failure condition、M10/M11はexact focused repo proofが必要である。M01/M02/M15/M19/M20の既存status/provenanceは変更せず、contradictionと追加Human Decision requirementはなかった。case別classification、根拠、最小next proof、P0/P1 execution waveは[`b1d2a-remaining-repo-only-evidence-closeout-result.md`](./b1d2a-remaining-repo-only-evidence-closeout-result.md)を正とする。このupdateから自動で残waveへ進まない。

### 2026-08-11 B1D2A P0 repo-only negative / timeout authoritative update

M10/M11/M14だけをrepo内で実行した。M10はwrong nonce / transaction、M11はcurrent required fields `code / transaction_id / state / nonce`各欠落について、provider exchange 0、session mutationなし、pending未消費、fixed safe reasonをfocused testで証明し、両件を`PASS_FOCUSED_REPO_PROOF`とした。required fieldやvalidation semanticは追加していない。

M14は、persistent `exchangeStartedAt`は存在するがprovider exchange timeoutがなかったため、persisted pending PKCE `expiresAt`を既存deadlineとして利用した。remaining lifetimeでAbortSignalを発火し、production Supabase adapterがactive exchange fetchだけへ渡す。新しいtimeout policy値、retry、reason code、API contract、Keychain envelopeは追加していない。deterministic stalled faultでbounded abort、既存`auth_exchange_failed` + new-link recovery、session/pending clear、same callback duplicate rejection、exchange count 1をPASSし、`PASS_FOCUSED_REPO_FAULT_PROOF`とした。

これはrepo-generated proofでありactual-device proofではない。B1D2Aは10件を残して`OPEN`で、M04/M05、M03/M06A/M08/M24/M25、M13/M17/M22が残る。詳細は[`b1d2a-p0-repo-only-negative-timeout-wave-result.md`](./b1d2a-p0-repo-only-negative-timeout-wave-result.md)を正とし、このupdateからM04/M05、Magic Link、device/external operationへ自動で進まない。

### 2026-08-11 M04/M05 safe Safari fallback local-proof authoritative update

Human Decision `HDC_B1D2A_SAFARI_FALLBACK_PRIVACY_AND_LINK_REUSE_V1`に従い、exact AASA target `/mobile/auth/callback`をauthentication surfaceではなくrecovery-only entryとして実装した。entryはrequest queryを読まず、fixed `303`でquery-free `/mobile/auth/recovery`へ移す。callback/recoveryはmiddlewareのWeb auth/Supabase経路より前にbypassし、provider exchange、Web session/Set-Cookie、Keychain処理、custom scheme自動遷移を行わない。`Cache-Control: private, no-store, max-age=0`、`Referrer-Policy: no-referrer`、`X-Robots-Tag: noindex, nofollow, noarchive`を設定する。

recovery UIはNative Minuteをinstall/openした後、Safariへ到達したLink Aを再利用せずfresh Magic Link Bを発行してnative callbackへ進むよう固定した。focused proofとauth/AASA regressionはPASSしたが、actual-device、Magic Link、live provider/API operationは行っていない。M04は`IMPLEMENTED_LOCAL_PROOF_PENDING_ACTUAL_DEVICE`、M05は`READY_PENDING_ACTUAL_DEVICE_AFTER_M04`で、最終PASSではない。platform/infrastructure raw-query loggingはrepoから判断不能のため`UNKNOWN`とする。詳細は[`b1d2a-m04-m05-safe-safari-fallback-result.md`](./b1d2a-m04-m05-safe-safari-fallback-result.md)を正とする。

### 2026-08-11 consolidated actual-device / network wave authoritative update

iPhone 14 Plus / iOS 26.2.1のsigned staging buildで、M03 foreground delivery、M06A consumed-link retap、M13 offline-before-tapをcase単位のactual-device evidenceとしてPASSした。M13のoffline tapではfalse authenticationやcrashがなく、network復旧後も`/LOGIN`を維持した。復旧用fresh requestはprovider rate limitで安全に抑止され、成功扱いにはしていない。

M04はlive staging callback / recoveryがHTTP 404のため`PENDING_PREREQUISITE_STAGING_FALLBACK_DEPLOYMENT`、M05は`PENDING_PREREQUISITE_M04_STAGING_FALLBACK_DEPLOYMENT`とする。M08は`PENDING_EXTERNAL_EXPIRY_WINDOW`、M17は`PENDING_CONTROLLED_REFRESH_TRIGGER`である。mobile `/SCRIPTS`はread-onlyであり、M24 / M25に必要なWeb cookie sessionはWeb Magic Linkがlocalhostへ遷移して成立しなかったため、両件を`PENDING_PREREQUISITE_WEB_STAGING_AUTH`とする。mobile sessionがWeb auth失敗で破壊されない部分観測だけをM25 PASSへ昇格しない。

B1D2AはM22を含む7件を残して`OPEN`である。source、test、Supabase、Vercel、Apple、production設定は変更していない。case別provenance、実行しなかった条件、残件は[`b1d2a-consolidated-actual-device-network-wave-result.md`](./b1d2a-consolidated-actual-device-network-wave-result.md)を正とする。次はread-onlyの`WEB_STAGING_AUTH_PREREQUISITE_DIAGNOSTIC`で原因点を切り分け、外部変更はHuman Decisionへ戻す。

### 2026-08-11 M04/M05 live promotion and Web allowlist reconciliation update

verified staging deployment `dpl_C2evjjuZi35mHMp1sNdaejXJPdui`、source `8bdbaac7e776e84a0e495ee410eba5cb3c460bb4`をformal promoteし、fixed `native-minute-staging.vercel.app`がexact deploymentへ向いたことを確認した。public fixed URLでcallback 303、fixed recovery Location、body 0、no cookie、no-store/no-referrer/noindex、synthetic sentinel非反射、callback非PRERENDER、recovery 200、AASA 200 / no redirect / exact staging app/pathをPASSした。production `native-minute`はdeployment `dpl_7FzKMVfgKdYjGWqPpJoFrpbFgruG`、source `b0e61c0504ad3be31e2eaa4c8cfdaaafbffb280c`、branch `main`のまま変更していない。`STAGING_FALLBACK_DEPLOYMENT_PREREQUISITE_RESOLVED`とし、M04は`IMPLEMENTED_LIVE_READY_PENDING_ACTUAL_DEVICE`、M05は`READY_PENDING_ACTUAL_DEVICE_AFTER_M04`で、最終PASSではない。

Conditional Remediation Bの初回read-only確認では、Supabase staging Site URL `http://localhost:3000`、default email templates、Custom SMTP未設定、exact Web callback未登録に加え、last-known repo resultにない`https://native-minute-staging.vercel.app/mobile/auth/callback\?**`を検出したため、security-sensitive allowlist差分としてapproved STOP conditionを適用した。このSTOPは安全なhistorical checkpointとして維持する。

後続Human Decision `HDC_B1D2A_REDIRECT_ALLOWLIST_RECONCILIATION_AND_WEB_CALLBACK_V1`は、Human-provided historical Unit E evidenceに基づき、このmobile query entryをquery-bearing mobile redirectTo用の`AUTHORIZED_EXISTING_MOBILE_QUERY_REDIRECT`としてreconcileした。既存Debug / exact mobile / mobile queryの3件を変更せず、source traceどおりのexact Web callback `https://native-minute-staging.vercel.app/auth/callback?next=%2Fscripts`を1件だけ追加した。post-checkはRedirect URLs 4件ちょうど、Site URL不変、default templates不変、Custom SMTP offをPASSし、live callback 303 / recovery 200 / exact AASAも維持した。Remediation Bは`WEB_STAGING_AUTH_CONFIGURATION_PREREQUISITE_RESOLVED_CONFIG_ONLY`。M24は`READY_PENDING_WEB_COOKIE_AND_USER_AB_ACTUAL_PROOF`、M25は`READY_PENDING_WEB_COOKIE_MOBILE_BEARER_COEXISTENCE_PROOF`であり、actual proofのPASSではない。詳細は[`b1d2a-staging-prerequisite-remediation-result.md`](./b1d2a-staging-prerequisite-remediation-result.md)を正とする。B1D2Aは同じ7件を残して`OPEN`で、updated remaining engineering effortはprovider/cache待ちとreview iterationを除き約1.5〜2.75人日である。

### 2026-08-11 M24/M25 combined actual-proof STOP

User Aは通常staging Web UIからfresh Web Magic Linkを1通だけ発行して開いた。localhost fallbackや`callback_failed`ではなく、queryなしの`https://native-minute-staging.vercel.app/scripts`へ到達したが、live pageはserver-side exception（safe digest `182509400`）となった。`/scripts`表示とrefresh persistenceを確認できないためWeb cookie session成立を推定せず、approved failure policyどおりSTOPした。User A owned resource作成、Mobile User A/B、M25 coexistence、M24 isolationはすべて未着手である。

M24/M25はともに`OPEN_BLOCKED_WEB_USER_A_SCRIPTS_SERVER_EXCEPTION`。source/configを変更せず、root causeは`UNKNOWN`のまま。詳細は[`b1d2a-m24-m25-combined-actual-proof-result.md`](./b1d2a-m24-m25-combined-actual-proof-result.md)を正とする。B1D2Aは7件を残して`OPEN`で、updated remaining engineering effortは約1.75〜3.5人日。次は別承認のread-only `WEB_USER_A_SCRIPTS_SERVER_EXCEPTION_DIAGNOSTIC`である。

### 2026-08-12 M24/M25 authorized resume and PASS

後続read-only diagnosticはsafe digest `182509400`を`JWT issued at future`へ相関し、callback exchange成功、cookie persistence、`/scripts` auth resolution成功、authenticated PostgREST `takes` query前段のJWT time validation failureまで切り分けた。Human Decision `HDC_B1D2A_WEB_USER_A_EXISTING_COOKIE_SINGLE_RELOAD_AND_RESUME_M24_M25_V1`に基づき、新しいWeb Magic Linkを発行せず既存User A cookieで`/scripts`を1回だけreloadし、正常render、authenticated state維持、server exceptionなしを確認して`WEB_USER_A_EXISTING_COOKIE_RELOAD_PASS`とした。初回clock-skew exceptionは履歴として保持するが、継続blocking defectとしては再現しなかった。

通常Web UIだけでUser A owned scriptを作成し、Mobile User Aでは同resourceと正常Bearer BFFを確認した。Web User A cookieとMobile User A Bearer/Keychainを同時維持し、双方の通常navigation/reconnect後もresource/sessionが維持されたため、M25を`PASS_LIVE_WEB_COOKIE_MOBILE_BEARER_COEXISTENCE`とする。Mobile-only logout後もWeb User A cookieとresource表示は維持された。続いて正常認証/BFFのMobile User BではUser A resourceが表示されず、User A positive baseline、User B authenticated response、repoのverified-user owner filter、`scripts_crud_own` RLSを合わせ、M24を`PASS_ACTUAL_STAGING_USER_AB_ISOLATION`とする。

actual-device観測はHuman-reported current device result、Webはlive staging browser observation、runtimeはsafe log、owner filter/RLSはcorroborating repo implementation evidenceとして分離する。actual-device evidenceをrepo-generatedとは表現しない。source/test/config/DB/productionは変更していない。詳細は[`b1d2a-m24-m25-combined-actual-proof-result.md`](./b1d2a-m24-m25-combined-actual-proof-result.md)を正とする。B1D2Aは5件（M04/M05/M08/M17/M22）を残して`OPEN`で、updated remaining engineering effortはprovider/AASA/device cache待ちとreview iterationを除き約1.0〜1.75人日である。次の別承認actionはM04/M05 exact actual-device fallback sequenceであり、自動で開始しない。

## 判定ラベル

- **事実（repo）**: 上記HEADのtracked fileまたはローカルtoolchainから確認した内容。
- **事実（公式）**: 2026-07-26時点のApple、Supabase、Vercel公式資料から確認した内容。
- **事実（人間確認）**: 2026-07-29に権限者またはdevice ownerが確認した内容。secretや個人識別値は含めない。
- **推奨**: 事実を基にしたB1D2の実行方針。実装または外部変更の承認ではない。
- **未確認**: repoや公開情報からは確認できず、権限を持つ人間の確認が必要な外部状態。
- **停止**: その条件を解消するまで次工程へ進まないgate。

## 1. 現状

### 1.1 Repository preflight

| 項目 | 観測結果 | 判定 |
|---|---|---|
| `pwd` | expected worktreeと一致 | 事実（repo） |
| `git rev-parse --show-toplevel` | expected worktreeと一致 | 事実（repo） |
| branch | `feature/mobile-auth-gate` | 事実（repo） |
| HEAD | `1e344297b5bc75ac4a8dad438df231fea0242241` | 事実（repo） |
| readiness調査開始時の`git status --short` | 出力なし | 事実（repo） |
| finalization開始時の`git status --short` | この未追跡plan文書だけ | 事実（repo） |
| finalization開始時のplan `git diff` | 未追跡fileのため出力なし | 事実（repo） |
| finalization開始時のscope確認 | plan文書以外のtracked/untracked変更なし | 事実（repo） |
| recent log | `1e34429`, `ed9de92`, `b5e2b46`, `40694ef`, `ab18d05` | 事実（repo） |
| `npm run check:workspace` | このHEADの`package.json`にscriptがなく、`Missing script: check:workspace`で未実行 | 事実（repo） |
| pre-approval preparation開始時のHEAD | `7c85ff5dab2973dd682f97ce1224c9c8b31b184f` | 事実（repo） |
| pre-approval preparation開始時のlocal / remote | 一致 | 事実（repo） |
| pre-approval preparation開始時の`git status --short` | 出力なし | 事実（repo） |

`check:workspace`の欠落は今回のplan-only作業で補修しない。worktreeは`pwd`、Git top-level、branch、HEADの完全一致で確認した。将来の実装verification前には、workspace guardの正しい運用をrepo ownerが確認する。

### 1.2 読んだ正本文書と優先順位

次を読んだ。

1. `AGENTS.md`
2. `docs/current-state.md`
3. `README.md`
4. `docs/b1d1-mobile-auth-vertical-slice-result.md`
5. `docs/b1d-mobile-auth-gate-plan.md`
6. `docs/capacitor-native-auth-gate-decision.md`
7. `docs/capacitor-universal-link-preimplementation-checklist.md`
8. `docs/b1d1-staging-supabase-migration-plan.md`の関連gate、rollback、停止条件

auth contractが競合する場合、B1D1実装後の`docs/b1d1-mobile-auth-vertical-slice-result.md`と実装を正とする。古い文書にある「Universal Linkからhosted WebViewのcookie callbackへ戻す」案は履歴であり、B1D2の採用案ではない。B1D2はnative-owned PKCE callbackへHTTPS Universal Linkを追加する。

### 1.3 B1D1到達状態

- **事実（repo）**: B1D1は`PASS — LIVE VERTICAL SLICE VERIFIED`。
- **事実（repo）**: Magic Link送信、custom-scheme callback、Bearer BFF、Keychain保存、再起動復元、logout、logout後再起動を通常署名Simulatorで確認済み。
- **事実（repo）**: pending PKCEの永続pre-exchange mark、duplicate/racing callback拒否、crash/relaunch後のreplay拒否、Keychain reason-code hardening、unsigned runtime smoke拒否を実装済み。
- **事実（repo/toolchain、人間確認）**: macOS 26.6 / Xcode 26.6 baseline、iOS 26.5 Simulator通常署名build、install、launch、process生存はPASS。
- **事実（pre-approval preparation）**: HTTPS callbackのsynthetic parser/lifecycle test、release相当fixture、AASA middleware pass-through guardだけを追加した。focused testsは43/43、全mobile testsは128/128、mobile/root lint・typecheck・buildとrelease/auth artifact guardsはPASS。Apple identity実装ではない。
- **事実（repo）**: User A/Bのlive cross-user RLS proof、reviewer account、Universal Links、実iPhone Universal Link smokeは未完了。

### 1.4 iOS app identity / signing

| 項目 | 現状 | 分類 |
|---|---|---|
| Capacitor app ID | `com.nativeminutes.app` | 事実（repo） |
| Debug bundle ID | `com.nativeminutes.app` | 事実（repo） |
| Release bundle ID | `com.nativeminutes.app` | 事実（repo） |
| Xcode target/configuration | 単一`App` target、Debug/Release | 事実（repo） |
| Info.plist | Debug/Release共通 | 事実（repo） |
| Debug callback scheme | `com.nativeminutes.app.debug` | 事実（repo） |
| Releaseへのscheme混入 | 共通Info.plistのため現状はRelease sourceにも含まれる | 事実（repo） |
| signing | Debug/ReleaseともAutomatic | 事実（repo） |
| Development Team | repo未設定 | 事実（repo） |
| entitlements file | tracked fileなし | 事実（repo） |
| Associated Domains | 未設定 | 事実（repo） |
| provisioning profile | repoから確認不可 | 未確認 |
| Apple App ID登録状態 | repoから確認不可 | 未確認 |

`com.nativeminutes.app`は現行repo値であり、production bundle IDの候補にすぎない。Apple承認後にexisting App IDと利用可否を確認するまで、production / stagingのbundle ID方針は確定しない。Debug custom schemeは即削除せず、方針確定後にconfiguration-specific Info.plist等でDebug限定にする候補とする。ReleaseではUniversal Linkを主経路にする計画だが、Apple identity確定前に設定しない。

staging bundle IDを別にするか、同じbundle IDでconfiguration/profileだけ分けるかは未決である。別bundle IDは分離が強い一方、追加App ID、AASA appID、provisioning、Xcode configurationが必要になる。

### 1.5 callback / Universal Link受信経路

- **事実（repo）**: installed/lock/SwiftPMのCapacitor Core / iOS / CLIは8.4.0。
- **事実（repo）**: 公式`@capacitor/app` packageは未install・未wireである。現在はrepo-local `MobileAuthLifecycle` pluginが同じ`appUrlOpen` / `getLaunchUrl()` contractをJSへ提供する。
- **事実（公式）**: Capacitor App APIの`appUrlOpen`はcustom URL schemeとiOS Universal Linkの両方を扱い、cold launch URLは`getLaunchUrl()`で取得する。
- **事実（repo）**: JS側はlistener登録後に`getLaunchUrl()`を読み、warm/coldを同じcallback handlerへ集約する。
- **事実（repo）**: repo-local lifecycle pluginは`capacitorOpenURL`と`capacitorOpenUniversalLink`を監視し、cold launch用にCapacitor proxyの`lastURL`を読む。
- **事実（repo）**: `AppDelegate.swift`はcustom URLの`open url`だけをCapacitorへforwardし、`continue userActivity`をforwardしていない。
- **事実（repo）**: `SceneDelegate.swift`、scene lifecycle method、`UIApplicationSceneManifest`は存在しない。
- **事実（repo）**: installed Capacitor 8.4.0のproxyは`continue userActivity`を受けると`lastURL`を保存し、`capacitorOpenUniversalLink`を通知する。
- **推定**: static source上はUniversal Linkをproxyへ渡すdelegate入口が見当たらず、warm/cold delivery gapの可能性が高い。ただしstatic inspectionだけを実機failure proofにはしない。
- **未確認（実機）**: current signed binaryのままUniversal Linkがcold/warmでproxyへ到達するかは未確認。
- **推奨**: Associated Domains/AASAを備えたsigned staging buildで、AppDelegate/SceneDelegateを変更する前に現行`appUrlOpen`経路のcold/warm baselineを取る。両方PASSならnative forwardingを追加しない。
- **条件付き変更**: entitlement、AASA、signing、Apple CDNを先に除外したうえで、現行経路のcoldまたはwarm受信不足が実証された場合だけ、Capacitor 8.4標準template相当の最小`continue userActivity` forwardingを追加する。repo-local lifecycle pluginとJS handlerは維持する。
- **停止**: 原因をdelegate入口へ限定できない場合、`@capacitor/app`、SceneDelegate、追加bridgeを推測で導入しない。URL/queryをlogせず、`delegate -> proxy -> plugin -> JS`のsafe boolean markerだけで境界を切り分ける。

Capacitor公式:

- [App API](https://capacitorjs.com/docs/apis/app)
- [Deep Linking with Universal and App Links](https://capacitorjs.com/docs/guides/deep-links)

### 1.6 callback identity / one-time consumption

- **事実（repo）**: parserはconfigured callbackとscheme、host、port、pathを完全一致比較する。
- **事実（repo）**: userinfo、fragment、未知・重複・不足queryを拒否し、許可するのは`code`、`state`、`nonce`、`transaction_id`だけである。
- **事実（repo）**: pending transaction、state、nonce、redirect URIを照合し、provider exchange前に`exchangeStartedAt`をKeychainへ永続化する。
- **事実（repo）**: in-memoryとpersistentの両方でduplicate/racing/relaunch replayをfail closedにする。
- **推奨**: HTTPS callbackでもこのidentityとone-time contractをそのまま使う。Universal Link追加を理由にqueryを緩めたり、Web cookie callbackへ戻したりしない。

### 1.7 current profiles / hosting

| 項目 | 現状 | 分類 |
|---|---|---|
| development callback | Debug custom scheme | 事実（repo） |
| local-spike callback | Debug custom scheme | 事実（repo） |
| production BFF candidate | `https://native-minute.vercel.app` | 事実（repo） |
| production auth callback | `unconfigured` / `null` | 事実（repo） |
| dedicated staging profile | なし | 事実（repo） |
| staging Vercel project | 既存`native-minute-staging` projectを使用する前提 | 事実（人間確認） |
| dedicated staging auth origin | `https://native-minute-staging.vercel.app`を選定済み | 事実（人間確認） |
| staging originのexternal mapping | Vercel projectとのexact mapping、Deployment Protection、public AASA条件、redirect、loggingは未確認 | 未確認 |
| final production domain | repo candidateはあるが外部確定を確認できない | 未確認 |
| AASA | file/routeなし | 事実（repo） |
| `/mobile/auth/callback` fallback | route/pageなし | 事実（repo） |

production release guardは、未設定callback、AASA欠落、Associated Domains欠落、production metadata欠落、custom scheme存在を意図どおり拒否する。一方、選択されたnative ingressのbehavior、実配信AASAのheaders、signed archiveのentitlementはまだ検査しない。

### 1.8 AASA / App Store toolchain

- **事実（公式）**: AASAはHTTPSで、拡張子なしの`/.well-known/apple-app-site-association`からHTTP 200、redirectなし、JSONとして配信する。各subdomainは自身のAASAを配信する。
- **事実（公式）**: AASAのapp identifierは`<Application Identifier Prefix>.<Bundle Identifier>`。Application Identifier PrefixがTeam IDと異なる可能性があるため、Portalまたは署名済みappで確認する。
- **事実（公式）**: AASAはuncompressed 128 KB以下に保つ。
- **事実（公式）**: Apple CDNのorigin取得やdevice cacheは即時ではなく、instant invalidationはない。資料上の目安はorigin取得が最大およそ24時間、deviceの更新確認がおよそ週次だが、保証SLAとして扱わない。開発時のdeveloper modeは補助で、最終合格はpublish-before-install、通常CDN、fresh install/deviceで行う。
- **事実（公式、2026-07-26時点）**: 2026-04-28以降のApp Store Connect uploadはXcode 26以上かつiOS 26 SDK以上が必要である。これはdeployment targetをiOS 26へ上げる要件ではない。
- **事実（公式）**: Xcode 26.0はmacOS Sequoia 15.6以降を必要とする。Appleのcurrent matrixではXcode 26.0〜26.3はmacOS Sequoia 15.6以降、26.4以降はmacOS Tahoe 26.2以降であり、選ぶ26.x版ごとに条件を確認する。
- **事実（人間確認）**: 対象機はMacBook Air、Model Identifier `Mac15,12`、Apple M3。current macOSは26.6である。
- **事実（repo/toolchain）**: Xcode 26.6 baseline、iOS 26.5 Simulator通常署名build、install、launch、process生存はPASS。
- **未確認**: App Store提出時点の最新Apple要件と、Apple membership有効化後のdistribution signing / archive。
- **停止**: Simulator baselineをApple identity、Associated Domains、distribution provisioning、実機Universal Link proofの代用にしない。提出直前にAppleの最新公式要件を再確認する。

#### Toolchain開始前gate

toolchain更新時に定めた次の順序を維持する。1〜4は完了済みで、5はApple membershipとidentity確定待ちである。

1. **backup**: 完了。
2. **macOS update**: macOS 26.6へ更新済み。
3. **Xcode 26系導入**: Xcode 26.6導入済み。
4. **既存branchのbaseline build**: B1D1 baselineとiOS 26.5 Simulator runtime smokeはPASS。
5. **signed actual-device build**: 未開始。Apple membership有効化、identity、signing条件を満たした後だけ行う。

実行順序は`backup → macOS update → Xcode 26系導入 → 既存branchのbaseline build → signed actual-device build`で固定する。OS更新とXcode導入はこのplan確定作業では行わない。

Apple公式:

- [Supporting universal links](https://developer.apple.com/documentation/xcode/supporting-universal-links-in-your-app)
- [Supporting associated domains](https://developer.apple.com/documentation/xcode/supporting-associated-domains)
- [Associated Domains entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.associated-domains)
- [TN3155: Debugging universal links](https://developer.apple.com/documentation/technotes/tn3155-debugging-universal-links)
- [Universal Links archived guide](https://developer.apple.com/library/archive/documentation/General/Conceptual/AppSearch/UniversalLinks.html)
- [Xcode SDK and system requirements](https://developer.apple.com/xcode/system-requirements)
- [Xcode 26 Release Notes](https://developer.apple.com/documentation/xcode-release-notes/xcode-26-release-notes)
- [Upcoming Requirements](https://developer.apple.com/news/upcoming-requirements/)

### 1.9 Human Decision Table

分類は次の3つだけを使う。

- **B1D2開始前に必須**
- **staging実装中に決定可**
- **production前までに決定**

| # | Human decision | 現在確認できる事実 | 人間が決める/確認する内容 | 分類 |
|---|---|---|---|---|
| 1 | macOS current versionとXcode 26導入可否 | MacBook Air / `Mac15,12` / Apple M3、macOS 26.6 / Xcode 26.6 baseline PASS | 提出時点のApple公式要件を再確認 | **B1D2開始前に必須** |
| 2 | Apple Developer Program加入状況・予定 | 申込み済み、Apple側の承認待ち。membershipはまだ有効ではない | membership有効化後にroleとIdentifiers/Capabilities/Profiles権限を確認 | **B1D2開始前に必須** |
| 3a | staging final domain | `native-minute-staging.vercel.app`を選定済み。Vercel mapping / public条件は未確認 | Vercel projectとのexact mapping、BFF/callback共通origin、public AASA、TLS、Deployment Protection、redirect、logging、owner | **B1D2開始前に必須** |
| 3b | production final domain | 未決定。repoにcurrent candidateはあるがfinal確定ではない | final BFF/callback common originとowner | **production前までに決定** |
| 4 | Debug / staging / production bundle identifier | repoのDebug/Releaseは現在`com.nativeminutes.app`、staging configurationはない。最終3環境mappingは未決 | Debug維持、staging別IDの要否、production App IDとの一致 | **B1D2開始前に必須** |
| 5 | Apple Team ID / App ID Prefix | repo未設定。申込み済みだがmembership承認待ちであり、両者は同一と推定できない | membership有効化後、Portal/signed entitlementによる実値とAASA app identifier | **B1D2開始前に必須** |
| 6a | Supabase staging project対応 | 既存staging projectを使う前提だが、B1D2のexact project/profile対応は未確認 | 実装前にstaging project mapping、Site URL、redirect allowlist/template ownerを再確認 | **B1D2開始前に必須** |
| 6b | Supabase production project対応 | repoからDashboard/project mappingを確認できない | production project、final callback、change owner | **staging実装中に決定可** |
| 7 | reviewer login方式 | current mobileはMagic Link-only、password UIなし | Magic Link継続とpassword optionの比較、最終方式、credential owner | **production前までに決定** |
| 8 | 実iPhoneの利用可否 | iPhone 14 / iOS 26.2.1を利用可能 | actual-device smoke前にsigning prerequisites、test ownerと日程を確認 | **B1D2開始前に必須** |

### 1.10 B1D2開始前に必須の人間判断

この表の「B1D2開始前に必須」は、値を消費するgated implementationの開始条件であり、membership前でも可能なPhase Aのrepo-only preparationまで停止する意味ではない。phaseごとのgateは8章で定義する。

- Phase AのうちApple identityを消費しないsynthetic test / guard preparationは実施可能。identity、bundle ID、Xcode configurationは未開始。
- Phase Bのtoolchain baselineは完了。
- Phase Cはmembership有効化、bundle identity、Team ID/App ID Prefix確認後に開始する。
- Phase Dは選定済みstaging originのVercel exact mapping / public条件とSupabase staging mapping確定後に開始する。
- Phase EはC/Dを通過してから、確認済みのiPhone 14 / iOS 26.2.1で開始する。

未確定情報を推測で補わず、Phase C〜Eは必要情報が揃うまでPASS扱いにしない。

### 1.11 External decision packet

Apple承認後とexternal設定前に、人間が次を確認する。秘密値や実credentialは記録せず、status、owner、確認日だけを残す。

| Surface | 人間確認事項 | 現在状態 |
|---|---|---|
| Apple | Team ID、Application Identifier Prefix、existing App ID、current bundle ID利用可否 | membership承認待ちのため未確認 |
| Supabase | staging project、Site URL、redirect allowlist、Magic Link template | Dashboard mapping未確認 |
| Vercel | `native-minute-staging.vercel.app`とprojectのexact mapping、Deployment Protection | 未確認 |
| AASA delivery | public HTTP 200、no redirect、no auth、JSON content type | AASA本文・deployとも未実施 |
| Callback privacy | platform / middleware / runtime / analytics / log drainでquery全文を保持しないこと | 未確認 |

## 2. B1D1から維持する固定前提

以下はB1D2で再設計しない固定前提である。

1. mobile authはnative-owned Supabase email Magic Link + PKCEであり、hosted WebView cookie handoffへ戻さない。
2. mobile product dataはBearer-only BFFから取得し、Web cookie sessionとは分離する。
3. `/api/mobile/scripts`の認可、user-owned data、RLS、canonical server dataの境界を変更しない。
4. full sessionとpending PKCEを別Keychain itemで保存する。
5. Keychainはdevice-only、non-synchronizable、弱いfallbackなしを維持する。
6. Keychain envelope version、service/item identity、既存profile/install namespaceとその導出規則を変更しない。first-class staging profileは同じ導出規則から新しいstaging namespaceを得る。
7. callbackはexact target + transaction + state + nonce + pending PKCEへbindingする。
8. exchange開始の永続mark、single-consumption、duplicate/racing/relaunch replay拒否を維持する。
9. callback成功後の内部遷移は固定されたlocal `/scripts`であり、外部`next`や任意redirectを受けない。
10. Debug custom schemeはB1D2中に削除せず、Debug限定fallbackとして残す。
11. production Releaseの主経路はHTTPS Universal Linkとし、custom schemeへfallbackしない。
12. stagingを最初の検証場所とし、実iPhoneを通過する前にproductionを変更しない。
13. token、code、verifier、callback URL全文、実メール、secretをlog、artifact、文書へ残さない。
14. B1D2のためのDB schema/migration、provider secret、dependency追加は行わない。
15. voice provider、ElevenLabs、OpenAI、Azureの実装論点へscopeを広げない。

**停止**: いずれかを変えなければUniversal Linkが成立しない場合、それは最小B1D2ではない。実装を止め、auth contract変更として別承認を得る。

## 3. B1D2のDefinition of Done

このDoDは将来のB1D2実装・設定・検証の完了条件であり、今回のplan-only調査が達成したという意味ではない。

| ID | 完了条件 | 必要なsafe evidence |
|---|---|---|
| D1 | Human Decision Tableの各項目がphase別期限までに埋まり、staging/prod host、bundle identity、Apple prefix、Supabase project、ownerが明示される | 値を必要最小限にした承認checklist。secretなし |
| D2 | Debug schemeはDebugだけ、Releaseはexact HTTPS callbackだけを持つ | resolved build settings、Release Info.plist inspection |
| D3 | Associated Domainsがconfiguration別にexact hostへ限定される | source entitlementとsigned app entitlement |
| D4 | current Capacitor-compatible `appUrlOpen`経路でwarm/cold Universal Linkが既存native callback handlerへ入り、Web callbackへ流れない。current wiringで不足が実証された場合だけ最小native forwardingを追加する | redacted boolean boundary traceと実機結果 |
| D5 | AASAがexact app identifierと`/mobile/auth/callback`だけを許可し、128 KB以下、public 200 / JSON / no redirectで配信される | headers、size、body hash、Apple CDN確認。identifier以外の秘密なし |
| D6 | Supabase allowlistとtemplateがdynamic transaction/state/nonceを保ち、one-time codeを同一device PKCEへ返す | redacted Dashboard checklist、test result |
| D7 | stagingの通常CDN経路を使う署名済み実iPhone smoke matrixがPASSする | 10章のstaging必須行 |
| D8 | User A/BでBearer BFF + RLS cross-user isolationを実機から再確認する | status/reasonだけのredacted evidence |
| D9 | callback/query/log、open redirect、fallback、offline/replayのsecurity stop条件を全て閉じる | security checklist |
| D10 | reviewerが人手介入なしで繰り返しloginできる方式が承認・検証される | safe aliasとPASS/FAILのみ。credentialなし |
| D11 | Human-confirmed Mac compatibility、必要なOS更新、Xcode 26以上 / iOS 26 SDK以上の導入を順に完了し、そのtoolchainでarchiveとsigned actual-device buildを確認する | macOS/Xcode/SDK version、build ID、entitlement summary |
| D12 | staging PASS後、別承認されたproduction additive cutoverと実iPhone production smokeがPASSする | production smoke summary。callback全文なし |
| D13 | release guard/self-testが実構成を検査し、lint/build/type/test regressionsがない | command result summary |
| D14 | rollback owner、互換期間、AASA cacheを含むrollback手順が承認される | rollback checklist |
| D15 | B1D1のKeychain envelope/item identity、PKCE pending binding、`exchangeStartedAt`、replay/reason code、refresh/logout、Bearer-only BFF contractが無変更でregression PASSする | B1D1 regression resultとcontract diff review |

B1D2 DoDにはApp Store審査提出そのもの、一般公開、Android auth、global device-management UI、account deletion implementation/compliance completionは含めない。

## 4. repo変更予定一覧

以下は将来の承認済み実装で想定する最小差分である。今回変更していない。

| 対象 | 予定する変更 | 変更しない境界 |
|---|---|---|
| `config/mobile-profiles.json` | explicit staging profileとproduction `universal-link` callbackをexact URIで定義 | B1D1 Debug callbackを削除しない |
| `config/capacitor-profiles.json` | staging local-bundle configurationを明示し、productionと分離 | hosted `server.url`をStore architectureに戻さない |
| `capacitor.config.ts` | stagingを別bundle IDにする場合だけprofile-resolved app IDへ変更し、Xcode bundle IDと一致させる | 同一bundle ID案ならhard-coded app IDを不要に動かさない |
| root / mobile `package.json` scripts | staging build/sync/checkの入口とprofile mappingを明示 | production scriptの暗黙overrideを許可しない |
| `apps/mobile/vite.config.ts` | profile別にcustom scheme / HTTPS callbackを厳格検証 | secret envを追加しない |
| `apps/mobile/src/lib/environment.ts` | production/stagingのexact HTTPS callbackを許可し、Debug schemeを非Release限定にする | storage namespaceの導出規則/envelopeを変えない |
| `apps/mobile/src/auth/callback.ts` | debug専用helper名を汎用化し、HTTPS fixtureを追加 | exact parser、allowed params、replay contractを緩めない |
| `apps/mobile/src/auth/mobile-auth.ts` | HTTPS modeを通すために必要なconfig/test plumbingだけを最小調整 | PKCE、pending transaction、`exchangeStartedAt`、Keychain、replay/reason code、refresh/logout、redirect bindingを変えない |
| `ios/App/App/AppDelegate.swift` | current signed staging baselineでcold/warm不足が実証され、原因がdelegate入口に限定された場合だけ、Capacitor 8.4標準template相当の`continue userActivity` forwardingを最小追加 | baseline PASSなら変更しない。SceneDelegateや新lifecycle dependencyを足さない |
| Xcode project/scheme + config-specific entitlements | Release由来のStaging configuration/scheme、bundle/Info.plist/entitlement mapping、staging/prod `applinks:<host>`、Team wiring | 不要なKeychain access groupを追加しない |
| config-specific Info.plist | Debugだけcustom URL type、Releaseはschemeなし | Debug fallbackを即廃止しない |
| `public/.well-known/apple-app-site-association` | human-confirmed app identifierとexact callback component | domain/path wildcardを使わない |
| `app/mobile/auth/callback/*` | app未install時のsafe browser fallbackと固定clean-URLへのhistory replacement | code exchange、queryのDOM/analytics/referrer転送、任意redirectを行わない |
| `next.config.mjs`または最小hosting config | AASAのJSON content type、callbackの`no-store`、`Referrer-Policy: no-referrer`等 | bypass secretを埋め込まない |
| `scripts/check-mobile-release.mjs` | resolved Release Info.plist、選択されたURL-delivery wiring、staging/prod AASAを検査し、Application Identifier PrefixをTeam IDとは別に検証可能にする。unexpected appID/path/wildcardを拒否する | 特定AppDelegate methodを無条件に必須化せず、callbackを許可するだけの広いAASAをPASSさせない |
| `scripts/check-mobile-release-self-test.mjs` | wrong host/path/appID、Debug-only scheme、selected delivery wiring欠落、staging gateをfixture化 | conditional native changeを最初からrequired fixtureにしない |
| dedicated signed-artifact checker | `.app`/`.xcarchive`のresolved Info.plist、codesign entitlements、embedded profile、application identifierを検査 | source guardをsigned artifact proofと呼ばない |
| mobile auth/config tests | HTTPS、warm/cold、wrong target、duplicate、expired、offline/timeout、environment mismatchを追加 | B1D1 reason-code contractを壊さない |
| docs | 実装後result、外部redacted checklist、rollback/current-stateを更新 | credential、実メール、callback全文を残さない |

### 4.1 明示的に変更予定へ含めないもの

- Keychain session/pending envelopeとitem identity
- pending PKCE/state machine、`exchangeStartedAt`、replay/reason code、refresh/logout semantics
- Bearer BFF contractとWeb cookie contract
- Supabase DB schema、RLS、migration
- auth/provider dependency
- `@capacitor/app`追加、SceneDelegate追加、別native lifecycle bridge
- Web `/auth/callback`
- global revoke/device management
- account deletion UI/API/provider/deletion contract
- Android

### 4.2 staging profileの選択

**推奨**: `staging`をfirst-class mobile/capacitor/build profileにし、release guardのUniversal Link contractをstagingにもparameterizeする。Xcode Staging configurationはRelease由来、`DEBUG`なし、schemeなしとし、storage profileだけをstaging namespaceへ分離する。`local-spike` custom scheme PASSをactual-device Universal Link proofの代用にしない。

bundle IDは次のどちらかを実装前に決める。

- **分離優先**: staging専用bundle ID/App ID。side-by-side installとAASA/Supabase分離が明確だが、Apple作業が増える。
- **最小差分**: productionと同じbundle ID、configuration-specific Associated Domainsとprofile namespace。side-by-side install不可で、誤build防止guardがより重要。

どちらを選んでも、mobile profile、Capacitor app ID、Xcode configuration/scheme、`PRODUCT_BUNDLE_IDENTIFIER`、`INFOPLIST_FILE`、`CODE_SIGN_ENTITLEMENTS`、AASA artifact/deploymentを1対1のmapping表で固定する。staging/prodは別hostなので、同名の`public/.well-known/apple-app-site-association` sourceをdeploy時に取り違えないbuild/deploy mappingが必要である。

## 5. Apple側の人間操作一覧

### 5.1 Apple Developer Program承認前にできること

- **事実（人間確認）**: Apple Developer Programは申込み済みで、Apple側の承認待ち。membershipはまだ有効ではない。
- macOS 26.6 / Xcode 26.6 baselineとiOS 26.5 Simulator runtime smoke。
- Apple identityを必要としないHTTPS callback parser/lifecycle synthetic test、release相当fixture、AASA middleware safety。
- bundle ID、staging identity、domain、callback pathのdecision packet作成。
- AASA draftとpublic endpointのsynthetic validation。
- 無料Personal Teamの範囲で限定的な自端末buildを試す。

**事実（公式）**: Associated Domainsは無料Personal Teamでは利用できない。無料実機signingは有効期間・device/capabilityに制限があり、B1D2の最終proofにはならない。

repo-only preparationはmembership有効化前でも可能である。一方、App ID登録、Associated Domains capability、provisioning、App Store Connect、正式なsigned actual-device gateはmembership有効化に依存する。membershipが有効になる前にApple側の状態を完了扱いしない。

### 5.2 Apple Developer Program加入後に行うこと

| 順序 | 人間操作 | 完了確認 |
|---|---|---|
| A1 | Apple Developer AccountでIdentifiers/Capabilities/Profilesを管理できる権限を確認 | operation別permissionだけ記録。個人情報は残さない |
| A2 | App Store Connectでapp record/review情報を管理できるroleを別に確認 | Developer Account権限の代用にしない |
| A3 | Team IDとApplication Identifier Prefixを確認 | AASA用prefixをPortalまたはsigned entitlementから二重確認 |
| A4 | production explicit App IDと選定後のbundle ID一致を確認 | Portal確認後に選定したexact bundle IDとの一致 |
| A5 | staging App ID方針を決定・必要なら登録 | staging/prodの識別表 |
| A6 | 対象App IDでAssociated Domains capabilityを有効化 | capability status |
| A7 | capability変更後のdevelopment/distribution provisioning profileを再生成またはautomatic signingで更新 | signed appでentitlement確認 |
| A8 | Xcode target/configurationへ正しいTeam/profileを割り当て | resolved settings |
| A9 | App Store Connect app recordとbundle IDを確認または作成 | record IDのみ。credentialなし |
| A10 | physical staging build、次にRelease buildへ署名 | archive/signing summary |

**事実（公式）**: capability変更時は既存profileの再生成が必要になり得る。App Store upload後にbundle identityを気軽に変更できないため、A4/A5を先にfreezeする。

**停止**:

- Team IDをApplication Identifier Prefixと推定で同一視する。
- existing App ID/App Store recordが別bundle/prefixを使っている。
- capability追加のためKeychain access groupまたはbundle IDを変更する必要が出る。
- signed appの`application-identifier`、AASA app identifier、bundle IDが一致しない。

Apple公式:

- [Supported capabilities (iOS)](https://developer.apple.com/help/account/reference/supported-capabilities-ios)
- [Enable app capabilities](https://developer.apple.com/help/account/identifiers/enable-app-capabilities/)
- [Create an App Store provisioning profile](https://developer.apple.com/help/account/provisioning-profiles/create-an-app-store-provisioning-profile)
- [Membership comparison](https://developer.apple.com/support/compare-memberships/)

## 6. Supabase側の人間操作一覧

Dashboard状態はrepoから確認できない。以下は権限者がstagingから順に行い、値を伏せたchecklistだけを残す。

| 順序 | 人間操作 | 境界 |
|---|---|---|
| S1 | staging/prodが別projectか、同projectのどの環境かを確定 | stagingをprodの最初のtestにしない |
| S2 | Site URLを確認 | mobile callbackへ安易に変更しない。Web regressionを守る |
| S3 | stagingのexact Universal Link callbackをRedirect URL allowlistへ追加 | host wildcard、preview wildcardを避ける |
| S4 | Debug custom schemeをdevelopment/staging用途だけに維持 | productionの主callbackとして追加しない |
| S5 | production callback entry案をレビューし、staging PASS後だけ追加 | production直接変更禁止 |
| S6 | Magic Link templateが`.ConfirmationURL` / `.RedirectTo`を正しく保持するか確認 | `.SiteURL`固定でredirectを落とさない |
| S7 | one-time/expiry、rate limit、new-user creationを確認し、password option選択時だけpassword policyも確認 | Dashboard実値を文書へ写さず、PASS/設定ownerだけ残す |
| S8 | custom SMTP、SPF/DKIM/DMARC、link tracking、scanner prefetch耐性を確認 | credential/API keyを読まない |
| S9 | reviewer方式が決まった場合だけ、その方式に必要な通常accountを作成・検証 | repoに実メール/passwordを置かない |

### 6.1 Redirect URL matchingの重要な未確認

B1D1はcallback queryへrandomな`transaction_id`、`state`、`nonce`を含める。Supabase公式はproductionでexact pathを推奨する一方、実際のallowlist entryがdynamic queryをどうmatchするかはproject設定とmatcherで実測が必要である。

**推奨**:

1. harmlessなsynthetic値でRedirect URL matcherを検証する。
2. exact HTTPS origin + exact `/mobile/auth/callback`に限定する。
3. queryを許可するためpatternが必要でもhost/path wildcardへ広げない。
4. app側は引き続きexact targetと4つのquery parameterだけを許可する。

**停止**: Supabaseが既存queryを保持できない、または安全なnarrow allowlistを表現できない場合、B1D1 identityを弱めずauth contract判断へ戻す。

### 6.2 Magic Link template / mail transport

- **事実（公式）**: `redirectTo` / `emailRedirectTo`はallowlistに一致する必要がある。
- **事実（公式）**: `.ConfirmationURL`にはprovider verification URLとredirect先が含まれ、`.RedirectTo`はcall時のredirectである。
- **事実（公式）**: email scannerのprefetchがone-time linkを先に消費する場合がある。
- **事実（公式）**: Supabase built-in SMTPはproduction一般配信用途に適さず、production deliveryはcustom SMTPとdomain authenticationの確認が必要である。
- **推奨**: templateは必要がなければ変更せず、stagingでWeb loginとmobile loginの両方をregression testする。

Supabase公式:

- [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Passwordless email logins](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow)
- [Production checklist](https://supabase.com/docs/guides/deployment/going-into-prod)
- [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)

## 7. Vercel / domain側の人間操作一覧

### 7.1 domain decision

- **事実（repo）**: current production candidate originは`https://native-minute.vercel.app`。
- **事実（人間確認）**: staging originは`https://native-minute-staging.vercel.app`を選定済み。
- **未確認**: そのoriginと既存Vercel project/environmentのexact mapping、TLS ownership、Deployment Protection scope、public AASA条件、redirect、logging。
- **未確認**: これをfinal production auth domainとして維持するか、custom domainを使うか。
- **未確認**: staging Vercel environment、TLS ownership、Deployment Protection scope。
- **事実（repo）**: current release guardは各environmentのUniversal Link callbackとBFF base URLに同一originを要求する。
- **推奨**: stagingとproductionにそれぞれstableなBFF/callback共通originを割り当て、各hostが自身のAASAとcallback fallbackを持つ。別auth-only originを選ぶ場合は現contract/guard変更になるため、最小B1D2では停止して再判断する。
- **停止**: staging originはHTTPSで、AASAを認証なし、redirectなしで取得できなければならない。Deployment Protectionとの整合が取れないstable originを採用しない。

このplan確定作業ではVercelへ接続せず、project設定、domain、Deployment Protection、secretを確認または変更しない。

### 7.2 人間操作

| 順序 | 人間操作 | 完了確認 |
|---|---|---|
| V1 | staging/prodのBFF/callback共通hostとownerをfreeze | exact origin表 |
| V2 | DNS/TLSとVercel environment/projectを確認 | public HTTPS 200 |
| V3 | Deployment Protection scopeを確認 | AASAとfallbackがApple/Safariからpublic |
| V4 | AASAを`/.well-known/apple-app-site-association`から直接配信 | 200、`application/json`、128 KB以下、no redirect、明示cache rollout |
| V5 | `/mobile/auth/callback` fallbackをpublic配信 | queryをbody/DOM/analytics/referrerへ渡さず、exchangeなし、固定案内 |
| V6 | callback fallbackのprivacy headersを確認 | `no-store`、`no-referrer`、必要最小CSP |
| V7 | AASAのcache/publish手順を確認 | instant invalidationに依存せず、publish-before-installとfresh install/device |
| V8 | edge/runtime/access logがqueryを保持・exportしないことを確認 | dummy queryでredacted audit |
| V9 | Apple CDNからAASA取得を確認 | CDN診断と実機 |
| V10 | productionはstaging PASS後に同じ順序で実施 | change recordとrollback owner |

### 7.3 Deployment Protectionとの境界

- **事実（公式）**: Deployment Protectionは対象deploymentの全requestに認証を要求する。
- **事実（公式）**: Apple CDNはVercel loginやautomation bypass secretを送れない。
- **推奨**: AASA hostとSafari fallbackはpublicにする。bypass secretをAASA、Magic Link、query、mobile bundleへ埋め込まない。
- **停止**: stable staging hostをpublicにできない場合、protected ephemeral previewをUniversal Link proofとして使わない。

Vercelの`/.well-known`はrewrite/redirect対象にできないため、現release guardと整合するstatic AASAを第一候補にする。route方式を選ぶ場合はguardと実配信検証を同時に変更する。

### 7.4 callback queryのhosting log

app未install時はSupabaseからHTTPS callbackへbrowser遷移し、one-time code等がqueryへ含まれ得る。初回requestではSafariのaddress bar/historyにqueryが一時的に現れ得るため、「画面に一切現れない」とは保証しない。fallbackはqueryをpage body/DOM/analytics/referrerへ渡さず、network redirectを増やさない固定clean-URLへの`history.replaceState`等を検討し、実機でhistory残存を確認する。Vercel公式Runtime Logs資料だけでは、全request/access log、analytics、外部drainを含むquery retention/redactionを断定できない。

**停止**: dummy callbackで、platform、middleware、function、analytics、log drainのどこにも全文queryが残らないことを権限者が確認できるまでproductionへ進まない。address bar/historyの一時露出も許容できない場合は、fallback designを変更するまで停止する。

Vercel公式:

- [Environments](https://vercel.com/docs/deployments/environments)
- [Deployment Protection](https://vercel.com/docs/deployment-protection)
- [Deployment Protection bypass methods](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection)
- [Rewrites](https://vercel.com/docs/routing/rewrites)
- [Runtime Logs](https://vercel.com/docs/logs/runtime)

## 8. staging検証計画

stagingはproductionと同じcontractを、別host/project/profileで先に証明する。`local-spike` custom schemeは補助であり、合格証拠ではない。

### B1D2分割工程とphase gate

B1D2を一つの巨大作業として扱わず、次の独立したgateに分ける。Apple membershipやdomain未確定をプロジェクト全体の停止条件にはしないが、各phaseの未充足gateを越えてPASSとはしない。

| Phase | 内容 | 開始条件 | PASS条件 |
|---|---|---|---|
| A | membership前でも可能なrepo-only preparation | preflight一致、B1D1固定前提を維持 | profile/config/test/guardの最小差分案が外部値を推測せず検証可能 |
| B | toolchain更新後のbaseline build | update時点のApple公式要件とMac対応を再確認し、`backup → macOS update → Xcode 26系導入`を完了 | 既存branchのB1D1 baseline buildがchosen toolchainでPASS |
| C | Apple identity確定後のAssociated Domains / signing | membership有効、bundle IDs、Team ID/App ID Prefix、App ID方針が確定 | capability/profile/signed entitlementがexact identityで一致 |
| D | staging domain確定後のAASA / Universal Link | exact stable staging origin、public AASA条件、Supabase staging mappingが確定 | AASA/edge/Supabaseとcold/warm ingressの前提がstagingでPASS |
| E | iPhone 14によるsigned actual-device smoke | C/D PASS、iPhone 14のcurrent iOS version確認、signed build install可能 | 10章のstaging必須matrixがPASS |
| F | production readiness review | E PASS、production domain/project/reviewer/rollback ownerが確定 | security、reviewer、rollback、toolchainのsign-offが揃い、別承認用change packetが完成 |

Phase Aは今後別途承認された実装turnで先行可能である。Phase C〜Eは必要情報が揃うまでPASS扱いにしない。production変更はPhase Fの完了にも含めず、別承認後の9章でのみ行う。

### Stage 0 — decision freeze

1. Phase C/Dの開始前に、選定済み`native-minute-staging.vercel.app`のVercel mapping/public条件、bundle ID方針、Apple prefix、Supabase staging projectを確定し、production domain/projectとreviewer方式には決定期限とownerを付ける。
2. staging callback候補を`https://native-minute-staging.vercel.app/mobile/auth/callback`に固定する。ただしVercel/Supabase確認前にruntime/production configへ有効化しない。
3. AASA scopeをcallback単一pathに固定する。
4. log/query、Deployment Protection、SMTPのownerを決める。

### Stage 1 — repo-only verification

1. HTTPS callback parser、wrong target、duplicate/malformed、warm/cold unit tests。
2. current repo-local `appUrlOpen` / `getLaunchUrl()` bridgeとCapacitor notification contractをtestする。AppDelegate forwarding追加を前提にしない。
3. config-specific Info.plist/entitlement test。
4. stagingにもproduction同等Universal Link guardを実行。
5. mobile tests、release guard/self-test、lint、typecheck、build。
6. B1D1のKeychain/PKCE/replay/refresh/logout/Bearer BFF/Web auth contractが無変更であることをdiff reviewし、既存regression suiteをPASSさせる。

### Stage 2 — public staging edge

1. staging AASAとsafe fallbackだけを承認済みstagingへdeploy。
2. AASAのstatus、content type、redirect chain、body、uncompressed size、exact-only rules、cache rolloutを検証。
3. callbackへdummy queryを付け、body/DOM、address bar/history、headers、全log surfaceのredactionを検証。
4. Deployment Protection/bypass不要でApple CDNとSafariから到達できることを確認。
5. Supabase staging allowlist/templateをhumanが設定し、Web regressionを先に確認。

### Stage 3 — signed staging app

1. source guardとは別のsigned-artifact checkerで、resolved Info.plist、embedded provisioning profile、codesign entitlement、application identifierを照合。
2. Developer ModeのCDN bypassは反復debugだけに使う。
3. Simulatorでrouting sanityを確認する。
4. 確認済みのiPhone 14 / iOS 26.2.1へ通常signed staging buildをinstallし、通常Apple CDN経路でAASAを確認する。
5. AppDelegate/SceneDelegateを変更していないbaselineで、cold/warm Universal Linkが`delegate/proxy -> repo-local plugin -> JS handler`へ届くかsafe boolean markerだけで確認する。
6. baselineがPASSならnative ingressを変更しない。FAILならentitlement、AASA、signing、CDNを先に除外する。
7. 受信不足がdelegate入口に限定された場合だけ、Capacitor 8.4標準template相当の最小forwardingを追加し、同じsigned actual-device matrixを再実行する。

### Stage 4 — actual-device smoke

10章の`AD-real` / `AD-synth`行を同一signed buildで実行する。`Repo` / `Edge`行は対応する主surfaceで先にPASSさせ、実provider callbackを加工してnegative testへ流用しない。

使用予定端末はiPhone 14 / iOS 26.2.1である。evidenceにはOS versionだけを必要最小限に記録し、個人情報、UDID、Apple ID、端末名は記録しない。

- installed / not installed
- cold / warm
- one-time / email-link再tap / dummy duplicate / expired / synthetic wrong-state / malformed
- offline / timeout
- session restore / refresh / logout / logout後再起動 / external revoke
- Safari fallback
- User A/B cross-user RLS
- Web cookie authとのcoexistence

### Stage 5 — production readiness review

次を全て満たした時だけproduction change requestを作る。

- staging actual-device matrix PASS
- Human-confirmed compatible macOS上のchosen Xcode 26.x / iOS 26 SDKでarchiveとsigned actual-device build PASS
- AASA/log/query/security gates PASS
- Supabase template/allowlist/SMTP owner sign-off
- reviewer path sign-off
- rollback ownerと互換期間sign-off

## 9. production移行計画

この章は将来の別承認後の手順であり、今回実行しない。

1. **Change freeze**: stagingでPASSしたcommit、domain mapping、AASA hash、Supabase checklistを固定する。
2. **Read-only recheck**: Apple IDs/prefix、production domain/TLS、Deployment Protection、Supabase current state、Xcode requirementを再確認する。
3. **Additive web first**: production AASAとsafe fallbackを追加し、既存Web authを変えずpublic deliveryを確認する。
4. **Cache allowance**: Apple CDN取得を確認し、必要な待ち時間を取る。developer-mode bypassをproduction proofにしない。
5. **Additive Supabase**: production exact callbackをallowlistへ追加する。既存Web callbackと旧互換entryは直ちに削除しない。
6. **Release build**: Apple公式matrixと人間確認済みmacOS上のchosen Xcode 26.x / iOS 26 SDK以上でclean archiveし、Info.plist、entitlement、profile、bundle ID、callback metadataをartifactから確認する。
7. **Controlled actual-device smoke**: 指定した非秘密test identityでcold/warm、restore、refresh、logout、duplicate、Safari fallback、RLSを確認する。
8. **Observe**: token/queryなしの固定event/reasonだけでauth failure rateを短時間監視する。
9. **Readiness closeout**: production smoke、rollback readiness、reviewer pathを記録する。
10. **Old entry retirement**: installed build互換期間とAASA cacheを考慮し、別承認で不要entryを削除する。

productionを最初のUniversal Link検証場所にしない。staging failureをproduction変更で切り分けない。

## 10. 実機smoke matrix

Evidenceにはcase ID、build/profile、OS version、時刻、PASS/FAIL、固定reason codeだけを残す。URL、query、token、実メール、Keychain value、provider response bodyは残さない。

verification surface:

- **AD-real**: signed実iPhone + staging/productionのreal Magic Link。
- **AD-synth**: signed実iPhoneへ秘密を含まないdummy callbackを注入。
- **Repo**: unit/integration/native lifecycle injection。racingやparser edgeの主証拠。
- **Edge**: Safari、AASA、mail、hostingの外側からの確認。

| ID | Primary surface | 環境/状態 | 操作 | 期待結果 |
|---|---|---|---|---|
| M01 | AD-real | staging / installed / app cold | 新規Magic Linkをtap | app cold launch、exact callbackを1回処理、local `/scripts`へ |
| M02 | AD-real | staging / installed / app warm | background中に新規linkをtap | existing appへdelivery、同じhandlerで成功 |
| M03 | AD-real | staging / installed / foreground | linkをtap | duplicate UI/navigationなしで成功 |
| M04 | Repo local + AD-real + Edge | staging / not installed | fresh Link Aをtap | local proofはfixed 303 → query-free recovery、body/application log/provider exchange/Web session/custom schemeなし。Safari actualとplatform logging確認が残る |
| M05 | Repo local + AD-real | staging / install after M04 | Link Aを再利用せずfresh Link Bを発行 | guidance/procedureはlocal ready。Link Bでnative callback成功のactual-device proofが残る |
| M06A | AD-real | staging / consumed Magic Link | 同じemail linkを再tap | providerで消費済み等によりappへ再deliveryされない場合を許容し、二重sessionなし。duplicate reasonを必須としない |
| M06B | Repo + AD-synth | staging / final callback duplicate | 同一dummy final callbackを2回delivery | exchange最大1回、2回目はduplicate/replay reason |
| M07 | Repo | staging / racing delivery | warm eventとlaunch URLを同時injection | session二重生成なし、最大1回exchange |
| M08 | AD-real + Repo | staging / expired link | provider/pending expiry後にtap | sessionなし、expired/retry guidance |
| M09 | Repo + AD-synth | staging / wrong state | dummy state mismatch | provider exchangeなし、wrong-state reason |
| M10 | Repo + AD-synth | staging / wrong nonce/transaction | dummy mismatch | provider exchangeなし、mismatch reason |
| M11 | Repo + AD-synth | staging / malformed | missing/duplicate/extra param、fragment、userinfo | parserが拒否、URL detailを表示しない |
| M12 | Repo + AD-synth | staging / wrong target | http、wrong host/path/port、Debug schemeをReleaseへ送る | Releaseは拒否しsessionなし |
| M13 | AD-real | staging / offline before tap | networkを切ってlinkをtap | crashなし。同じcodeは再利用せず、復旧後に新しいlinkが必要 |
| M14 | Repo fault injection | staging / timeout during exchange | provider timeoutを再現 | 同じcodeを再exchangeせず、新しいlinkを案内 |
| M15 | AD-real | staging / authenticated restart | appをterminate/relaunch | Keychainからsession restore、Bearer scripts取得 |
| M16 | AD-real + Repo | staging / access expiry | refresh条件を作る | single-flight refresh、BFF retry最大1回 |
| M17 | Repo + AD-real network | staging / transient refresh outage | 一時network/provider failure | `authenticated`を維持しKeychain sessionを残す。復旧後retry可能、token detailなし |
| M18 | Repo + AD-real | staging / invalid refresh | external invalidation後にrefresh | `auth_session_invalid`でauth-requiredへ戻り、stale Keychain sessionなし |
| M19 | AD-real | staging / logout | app内logout | local session/Keychain/pendingをpurge |
| M20 | AD-real | staging / logout then restart | logout後terminate/relaunch | session復元せずloginへ |
| M21 | AD-real + human provider action | staging / provider revoke | staging sessionを外部revoke後、expiry/refresh | access tokenの`exp`までは即時失効と仮定せず、refresh時に`auth_session_invalid` |
| M22 | Edge + AD-real | staging / AASA unavailable | origin/CDN failureを診断 | custom schemeへproduction fallbackせず、安全にSafariまたは未処理 |
| M23 | Edge/mail | staging / mail scanner | test mailbox scanner/prefetch経路 | link消費挙動を記録。silent successを仮定しない |
| M24 | AD-real | staging / User A then B | 各userのBearer scriptsを取得 | cross-user dataを取得できない |
| M25 | AD-real + Web | staging / Web coexistence | mobile login/logout前後にWeb authを確認 | mobile BearerとWeb cookieが相互破壊しない |
| M26 | AD-real | production / installed cold+warm | staging全gate後に最小happy path | M01/M02相当PASS |
| M27 | AD-real | production / restore/refresh/logout | controlled identityで実行 | M15/M16/M19/M20相当PASS |
| M28 | Edge + AD-synth | production / safe negative sample | secretなしdummy fallback/targetだけを確認 | fail closed、query/token evidenceなし |

M01〜M25の各surfaceがstaging必須である。real provider callbackを加工してnegative testへ再利用しない。M26〜M28は別承認されたproduction cutover後の最小再確認である。

この行はoriginal scope provenanceとして維持する。Human Decision後のexecution ownerは、AがM01〜M20/M22/M24/M25、Bがstaging release-readiness surfaceのM21/M23とproduction M26〜M28である。stagingで行うという元のverification environmentは変更しない。

## 11. security / privacy境界

### 11.1 秘密・sensitive value

次をconsole、OS log、Vercel log、Supabase screenshot、screen recording、artifact、issue、文書へ残さない。

- access token / refresh token
- authorization code / token hash
- PKCE verifier
- state / nonce / transaction ID
- callback URL全文またはquery
- Keychain value
- 実メール、reviewer password、SMTP/API secret

safe evidenceは固定event name、allowlisted reason code、build/profile、timestamp、status、body hashに限定する。

### 11.2 callback target / open redirect

- HTTPS scheme、exact host、default port、exact `/mobile/auth/callback`を完全一致させる。
- subdomain suffix match、path prefix match、fragment、userinfo、未知queryを許可しない。
- AASAも同じcallback単一pathとexpected app identifierだけを対象にし、unexpected wildcard/path/appIDをguardで拒否する。rollback互換entryが必要な場合は明示manifestと期限を持たせる。
- callbackから外部`next`、`redirect_to`、return URLを受けない。
- 成功後のnative遷移は固定local `/scripts`だけにする。
- browser fallbackはcode exchangeせず、queryをDOM/analytics/referrerへ渡さない。初回address bar/historyの一時露出は別riskとして判定し、可能ならnetwork requestを増やさず固定clean URLへ置き換える。

### 11.3 one-time / replay

- B1D1のpending bindingとpre-exchange persistent markを維持する。
- warm/coldのfinal callback duplicate、crash/relaunch、provider timeoutを最大1 exchangeにする。同じemail linkの再tapはprovider側で消費済みとなりappへ再deliveryされない場合も許容する。
- offline/timeoutで結果が不明な場合、同じcodeを安全と仮定してretryしない。

### 11.4 Keychain / Bearer contract

- Associated Domains追加はKeychain envelope変更理由にならない。
- bundle IDまたはApplication Identifier Prefix変更が必要ならKeychain namespace影響を調査するまで停止する。
- staging profile追加時は既存namespaceを変えず、同じ導出規則で新しいstaging namespaceを作る。Staging configurationを`DEBUG`扱いにしない。
- `keychain-access-groups`を便宜的に追加しない。
- Bearer-only BFF、exact Origin/CORS、`no-store`、RLS、Web cookie分離を維持する。

### 11.5 privacy headers / logging

callback fallback候補の最小header:

- `Cache-Control: no-store`
- `Referrer-Policy: no-referrer`
- restrictive `Content-Security-Policy`
- analytics/session replayなし

実際のVercel edge/access logと外部log drainのquery扱いは未確認であり、dummy query auditをproduction stop条件にする。

AASAはcallbackと別に、`application/json`、128 KB以下、public 200、no redirectと、Apple CDN/device cacheを前提にした明示cache rolloutを検証する。

## 12. reviewer account計画

### 12.1 事実と未確認

- **事実（公式）**: account機能にはactive demo accountまたはfully featured demo modeを提供し、backendをreview中利用可能にする必要がある。
- **事実（公式）**: App Store Connectのreview sign-in情報にはusername/password欄がある。
- **未確認**: Magic Link-onlyをAppleが安定して審査できるという公式保証は見つからない。明示禁止も確認できない。
- **事実（repo）**: current mobile UIはMagic Link-onlyで、password loginは未実装。

### 12.2 推奨方針

1. reviewer専用の通常production userを使い、特権role、bypass、static OTP、master codeを作らない。
2. reviewer identityはsafe aliasでのみ文書化する。
3. 実メールと、password方式を選んだ場合のpasswordは、App Store Connectの非公開Review Informationまたは承認済みsecret managerだけに置く。
4. reviewer instructionsには、選択したlogin方式、起動画面、再試行、main loop、logout、support contact、障害時の手順を書く。Magic Link方式ならdelivery時間、再送、mailbox前提も明示する。
5. backend、mail delivery、rate limit、account expiryをreview期間中安定運用する。

### 12.3 decision gate

password導線を既定路線にしない。Human Decision Tableの期限まで、次を同格の比較候補として扱う。

| 候補 | 利点 | 制約/リスク | B1D1 contractへの影響 |
|---|---|---|---|
| Magic Link-only | current UIとB1D1 PKCE/Keychainをそのまま使い、追加auth surfaceがない | reviewer mailbox、mail scanner、rate limit、delivery、App Store Connectのusername/password欄との運用整合を実証する必要 | なし。current contractをそのまま検証 |
| reviewer password option | mailbox/link scannerへ依存せず、reviewerが繰り返し操作しやすい可能性 | password UI、policy、credential lifecycleという新auth surface。別設計・security review・明示承認が必要 | Magic Link PKCEを置換しない。同じsession store/Bearer BFFへ加算する場合だけ候補 |

次の順で比較する。

1. 外部testerがreviewer相当端末・自身のmailboxだけでMagic Link loginを人手介入なしに複数回完了できるか検証する。
2. Apple review guidanceまたは事前問い合わせでMagic Link-only運用を確認する。
3. Magic Linkの再現性、reviewer運用、mail riskと、password optionの追加scope/security costを比較し、人間がproduction前までに選択する。
4. password optionを選ぶ場合だけ、B1D2 base scope外の明示承認sub-phaseとして設計・実装・検証する。

operatorによるlink転送や共有mailbox passwordを前提にしない。隠しbackdoor、共有master credential、review専用の認可迂回は採用しない。

### 12.4 account creation / deletion

- **事実（repo）**: mobileの`signInWithOtp`は`shouldCreateUser: true`を要求する。
- **未確認**: Supabase project側でsignupが許可され、実際に未登録userを作成できるか。
- **範囲外依存**: account creationが有効な場合のApp Store account deletion要件とcurrent deletion surfaceの整合は、B1D2の実装/DoD/停止条件に含めない。App Review submissionを止め得るpost-B1D2 dependencyとして別gateへhandoffする。
- **境界**: B1D2中にaccount deletion UI/API、provider設定、deletion contractを変更しない。

Apple公式:

- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [App Store Connect platform version information](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information/)

## 13. rollback計画

### 13.1 rollback原則

- AASA、Supabase allowlist、domain mappingはadditiveに導入する。
- installed old buildが参照するapp identifier/path/redirect entryを即削除しない。
- AASAはApple CDN/device cacheがあるため、origin fileを戻せば即時rollbackできると仮定しない。
- production custom schemeを緊急fallbackとして有効化しない。
- DB rollbackは存在しない。B1D2でDBを変更しないためである。

### 13.2 trigger

次のどれかで新build配布とproduction cutoverを停止する。

- wrong app/domainがlinkをclaimする。
- callback query/codeがlogまたはartifactへ残る。
- duplicate exchangeまたはcross-user data access。
- signed entitlement/AASA/prefix mismatch。
- mail scanner/rate limitでreviewer loginが不安定。
- restore/refresh/logoutがB1D1 contractから退行。

### 13.3 rollback手順

1. 新Release buildの配布を停止し、既存安定buildを維持する。
2. redacted event/reasonだけでincident scopeを確定する。
3. callback fallback deploymentを前のsafe versionへ戻す。ただしAASA互換entryは維持する。
4. Supabase新redirect entryは、対象buildが未配布または利用停止を確認してから削除する。
5. 必要ならstaging/test sessionだけをrevokeする。実user一括revokeは別承認とする。
6. AASA cache更新を待ち、fresh install/deviceで回復を確認する。
7. root cause、影響build、互換期限を記録してから再cutoverする。

## 14. 未決事項

| ID | 未決事項 | 推奨owner | blocking point |
|---|---|---|---|
| U1 | final production BFF/callback common origin | product/infra | repo config前 |
| U2 | stable public staging BFF/callback common origin | infra | staging deploy前 |
| U3 | stagingを別bundle IDにするか | iOS/product | Apple App ID作成前 |
| U4 | Apple Program承認時期、membership有効化、Developer Account権限、Team ID、Application Identifier Prefix | Developer Account owner | Phase C / AASA確定前 |
| U5 | existing App ID / App Store Connect recordとASC role | release owner | signing前 |
| U6 | 提出時点のApple toolchain要件再確認とdistribution archive | device owner/iOS engineer | production readiness前。macOS 26.6 / Xcode 26.6 baselineはPASS |
| U7 | staging/prod Supabase project分離 | auth owner | allowlist変更前 |
| U8 | dynamic callback queryのnarrow allowlist pattern | auth owner | Magic Link staging前 |
| U9 | Magic Link template、expiry、rate limit、new-user policy | auth owner | staging smoke前 |
| U10 | custom SMTP、domain authentication、tracking/scanner behavior | mail/auth owner | production readiness前 |
| U11 | Vercel query log/redactionとlog drain | infra/security | production readiness前 |
| U12 | reviewer Magic Link-onlyとpassword optionの比較・最終選択 | product/release | production前 |
| U13 | account creation/deletion review compliance | product/legal | post-B1D2 submission gate。B1D2実装/DoDはblockしない |
| U14 | global revokeの期待値とB1D2範囲 | security/product | smoke expected result確定前 |

## 15. 外部待ち事項

- Apple Developer Program申込みは完了。現在はApple承認、membership有効化、role付与待ち。
- Team ID/Application Identifier Prefix/App ID/Associated Domains capabilityの確認。
- provisioning profile再生成と正式な実機署名。iPhone 14 / iOS 26.2.1は確認済み。
- production domain、DNS、TLS、Vercel environment。staging originは`native-minute-staging.vercel.app`を選定済みだが、project mappingとpublic条件は未確認。
- Deployment Protection scopeとpublic AASA endpoint。
- Supabase staging/prod Auth管理権限。
- mail provider/DNS authentication、link tracking設定。
- reviewer account方式のhuman approval。
- Apple CDNのAASA取得。初回反映やdevice cacheには待ち時間がある。

これらは「repoに値がない」ことを理由に推測で埋めない。owner、依頼日、expected response、blocking phaseだけを安全なtrackerへ記録する。

## 16. 推奨実装順序

1. **Pre-approval repo preparation**: Apple identity不要のHTTPS parser/lifecycle tests、release相当fixture、AASA middleware safetyは完了。profile、identity、Xcode configurationは未開始。
2. **Phase B — toolchain baseline**: macOS 26.6 / Xcode 26.6とiOS 26.5 Simulatorで完了。
3. **Phase C — Apple identity / signing**: membership有効化後にbundle ID、Team ID/App ID Prefix、App ID、Associated Domains、profileを確定し、signed entitlementを確認する。
4. **Phase D — staging AASA / Universal Link**: 選定済みstaging originのVercel mapping/public条件確定後、AASA/fallback/headers、Supabase staging allowlist/template、edge deliveryを検証する。
5. **Phase E — iPhone 14 smoke**: Phase C/D通過後、iPhone 14 / iOS 26.2.1でcurrent repo-local `appUrlOpen` ingressのcold/warm baselineとM01〜M25の対象surfaceを確認する。
6. **Conditional minimal native forwarding**: Phase Eで受信不足をdelegate入口に限定できた場合だけ最小forwardingを比較・承認し、同じmatrixを再実行する。baseline PASSならskipする。
7. **Phase F — production readiness review**: security、reviewer方式比較、rollback、toolchain、owner sign-offをまとめる。
8. **Separately authorized production cutover**: Phase F完了後も別承認を必須とし、9章のadditive順序で実施する。
9. **Production actual-device closeout**: M26〜M28、result/current-state更新。

順序は必ず`staging → actual device → production readiness → separately approved production`とする。

## 17. 各工程の停止条件

| 工程 | 停止条件 |
|---|---|
| Preflight | worktree/branch/HEAD不一致、dirty tree |
| Phase A / repo preparation | B1D1固定前提を維持できない、外部値の推測、secret閲覧、source差分がApple identity/domain確定を必須とする |
| Phase B / Toolchain | backupなし、`Mac15,12`の更新先macOS対応を公式要件で確認できない、必要OSへ更新不可で代替Macなし、chosen Xcode 26.x / iOS 26 SDKでbaseline buildできない |
| Phase C / Apple identity | membership未有効、bundle ID、Apple prefix、App ID、Associated Domains、profileをfreezeできない |
| Phase D / staging edge | exact stable origin、public AASA、Deployment Protection、Supabase staging mappingをfreezeできない |
| Phase E / actual device | Phase C/D未PASS、signed install不可、staging smoke必須行がFAIL。iPhone 14 / iOS 26.2.1は確認済み |
| Repo implementation | Keychain envelope/item identity、PKCE binding、pre-exchange mark、replay/reason code、refresh/logout、Bearer BFF、DB、dependencyの重大変更が必要 |
| Native ingress | current baseline failureだけでAppDelegate変更へ進む、外部association/signing原因を除外できない、または条件付き最小forwarding後もcold/warmを安全に渡せない |
| Callback | state/nonce/transactionを保持できない、またはexact targetを緩める必要がある |
| AASA | public 200/JSON/no redirect不可、128 KB超過、prefix/appID/path不一致、unexpected wildcard/ruleが必要 |
| Hosting | callback全文/queryがlogに残る、bypass secretが必要、address bar/history riskを受容できない |
| Supabase | narrow allowlist不可、templateがredirectを落とす、scannerで安定運用不可 |
| Signing | Releaseにcustom schemeが残る、entitlement/profile/appID不一致 |
| Staging smoke | M01〜M25の指定surfaceでsecurity/auth必須行が1件でもFAIL |
| Reviewer | production前までに方式を選択・検証できない、または選択方式がB1D1固定contract/認可境界を壊す |
| Production readiness | rollback ownerなし、Xcode requirement未達、staging evidence不足 |
| Production | 明示承認なし、productionを切り分けの最初の場所にする必要がある |
| Any phase | secret、実credential、`.env.local`閲覧、production変更が調査の続行に必要 |

停止時はcustom scheme、Web callback、host wildcard、log出力、認可迂回で回避しない。

## 18. 工数見積もり

前提: Apple/domain/Supabase/Vercelのownerが応答し、B1D1 Keychain/PKCE/Bearer contractを変更せず、1つのiOS release targetを維持する。macOS/Xcode baselineとpre-approval synthetic testsは完了済みとして除外する。

| 残Unit | Engineer effort |
|---|---:|
| Unit A — identity / configuration mapping | 0.75〜1.25人日 |
| Unit B — final configでのlifecycle regression、conditional gap diagnosis | 0.25〜0.5人日 |
| Unit C — Associated Domains / signing / signed artifact check | 0.5〜1.0人日 |
| Unit D — staging AASA / fallback / headers / edge verification | 0.75〜1.25人日 |
| Unit E — Supabase staging redirect/template設定支援とWeb regression | 0.5〜1.0人日 |
| Unit F — physical iPhone smoke / evidence / focused fixes | 1.0〜2.0人日 |
| production readiness review | 0.5〜1.0人日 |
| **remaining base合計** | **4.25〜8.0人日** |

手戻りbufferは`+1〜2人日`を別枠にし、remaining engineering effortは**5.25〜10人日**を目安とする。Apple承認、profile、DNS/mail、AASA CDN/device cacheの待ちはengineer effortに含めない。

追加可能性:

- staging専用bundle ID/target: `+0.5〜1.5人日`
- conditional AppDelegate forwarding: gapが実証された場合だけbase内で最小差分。追加bridge/Scene migrationは別見積もり
- reviewer password surface: 選択された場合だけ`+1〜3人日`、base外・別承認
- SMTP/domain deliverability remediation: `+1〜3人日`相当、DNS待ち別
- App Store account deletion gap: B1D2範囲外。post-B1D2 gateで別見積もり

external elapsed timeはApple承認、DNS/mail、profile、AASA CDN cacheを含めて概ね1〜3週以上になり得る。これはengineer effortと分けて管理する。

## 19. B1D2完了後に初めて進める次工程

B1D2のDoDを満たした後に初めて、次へ進む。

1. TestFlight / App Store release candidateの配布計画。
2. app-displayでのfinal screenshot captureとStore asset最終化。
3. App Store Connectへのreviewer credential/instructions入力。
4. B1D2とは独立したfinal privacy/account deletion/release QA gate。
5. submission直前のApple SDK requirement、signed archive、production auth smoke再確認。
6. 明示承認後のApp Store submission。

B1D2完了前にStore用credential入力、screenshot最終撮影、TestFlight外部配布、App Review提出を進めない。
