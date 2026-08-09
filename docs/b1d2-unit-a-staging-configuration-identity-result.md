# B1D2 Unit A — staging configuration / identity result

判定: **PASS — UNIT A STAGING CONFIGURATION / IDENTITY VERIFIED**

実装・検証日: 2026-08-09

対象branch: `codex/b1d2-unit-a`

開始HEAD: `71b7f7bd3a66c0dc84b805d26311b41170e4a770`

commit / push: この結果文書の記録対象外（Git履歴とremote refを正とする）

## Repository preflight

- working directory / Git top-level: `/Users/karasawatakahiro/Developer/native-minute`
- branch: `codex/b1d2-unit-a`
- HEAD: `71b7f7bd3a66c0dc84b805d26311b41170e4a770`
- initial working tree: clean
- `npm run check:workspace`: PASS

期待値はすべて一致したためUnit A実装へ進んだ。

## Human-confirmed external facts

- Apple Developer ProgramはActive。Team ID / App ID Prefixは確認済みで今回のaccountでは一致する。実値はrepoへ保存していない。
- staging Explicit App ID `com.nativeminutes.app.staging`は登録済み。production App ID `com.nativeminutes.app`は未登録。Associated Domainsは未有効化。
- Vercel project `native-minute-staging`とfixed staging domainのProduction Deployment mappingは確認済み。staging top public accessはPASS。Vercel AuthenticationはStandard Protection、Password ProtectionはOFF。AASA endpointは現在404。
- Supabase project `native-minute-staging`は確認済み。Site URLは`http://localhost:3000`、登録済みredirectはDebugの`com.nativeminutes.app.debug://auth/callback**`だけで、staging HTTPS redirectは未登録。Magic Link templateはdefault、Custom SMTPは未設定。DB password rotationは未完了または不明。

外部Dashboardは変更していない。

## Implementation前inventory

- Xcodeは単一`App` target、Debug/Releaseだけで、両configurationのbundle IDは`com.nativeminutes.app`だった。
- Debug/Releaseは共通`Info.plist`を使い、Debug custom schemeがRelease sourceにも混入していた。
- Capacitor `appId`は`com.nativeminutes.app`のhard-codeで、staging profileはなかった。
- mobile profileはdevelopment/local-spike/productionだけで、production callbackは意図的にunconfiguredだった。
- callback parser/lifecycle testにはexact staging HTTPS callback fixtureがあり、repo contractのcallback pathは`/mobile/auth/callback`へ一意に固定されていた。
- B1D1のKeychain / PKCE / replay / refresh / logout / Bearer BFF contractは既存testで固定されていた。

## Unit A configuration design

| Purpose | Mobile profile | Capacitor profile | Xcode configuration | Bundle ID | Callback |
|---|---|---|---|---|---|
| Debug development | `development` | `remote-dev` | `Debug` | `com.nativeminutes.app` | Debug custom scheme |
| B1D1 local fallback | `local-spike` | `local-spike` | `Debug` | `com.nativeminutes.app` | Debug custom scheme |
| staging | `staging` | `staging` | `Staging` | `com.nativeminutes.app.staging` | exact staging HTTPS callback |
| production placeholder | `production` | `production` | `Release` | `com.nativeminutes.app` | `unconfigured` |

`Staging`はRelease由来で、`DEBUG` compilation conditionを持たない。`DEVELOPMENT_TEAM`、provisioning profile、`CODE_SIGN_ENTITLEMENTS`は設定していない。

## Debug scheme isolation

- Debugは`Info-Debug.plist`を使い、`com.nativeminutes.app.debug`を維持する。
- Staging/Releaseはcustom URL typeを持たない`Info.plist`を使う。
- staging bundleとStaging Simulator artifactにDebug schemeがないことを確認した。
- Debug Simulator artifactにはexact Debug schemeがあることを確認した。

## Staging HTTPS callback

- origin: `https://native-minute-staging.vercel.app`
- path: `/mobile/auth/callback`
- exact target: `https://native-minute-staging.vercel.app/mobile/auth/callback`
- mobile build時にprofile/mode/target/BFF origin mismatchを拒否する。
- Supabase Redirect URLsにはまだ登録していない。

## Guards / tests

- staging release guardはsource profile、build metadata、generated Capacitor appId、Xcode Staging settings、non-Debug Info.plist、exact callback literalを照合する。
- mismatch fixtureはwrong Capacitor appId、wrong callback、wrong Xcode bundle IDをfail closedで拒否する。
- focused Unit A tests: PASS — 2 files / 21 tests
- all mobile auth/relevant tests: PASS — 12 files / 130 tests
- mobile release guard self-test: PASS
- staging release guard: PASS
- local-spike release guard: PASS
- production release guard: expected BLOCKED — AASA、Associated Domains、production HTTPS callback、production auth metadataが未実装

## Verification

- workspace guard: PASS
- mobile lint: PASS
- mobile source/test typecheck: PASS
- mobile local-spike build/sync: PASS
- mobile staging build/sync: PASS
- Xcode build settings inspection: PASS
- Debug Simulator build: PASS — normal local Simulator signing
- Staging Simulator build: PASS — normal local Simulator signing
- Debug/Staging built Info.plist inspection: PASS
- auth artifact guard + self-test: PASS
- iOS Simulator runtime signing guard self-test: PASS
- root lint: PASS
- root typecheck: PASS
- root build: PASS
- `git diff --check`: PASS

Simulator buildsはcompile/artifact verificationであり、Keychain runtime、signed physical device、Associated Domains、Universal Link ingressのPASSとは扱わない。

## B1D1 contract unchanged

- Keychain envelope / item identity / install-generation derivation: unchanged
- native-owned PKCE、pending binding、`exchangeStartedAt`、one-time consumption、replay reasons: unchanged
- restore / refresh / logout: unchanged
- Bearer-only BFF / Web cookie separation / RLS boundary: unchanged
- callback parserのexact target / query allowlist: unchanged
- callback target builderはHTTPSにも対応する実態に合わせてgeneric nameへ変更しただけで、生成内容は不変

## Intentionally left for Unit C+

- Apple Associated Domains capability
- entitlement file / `CODE_SIGN_ENTITLEMENTS`
- Team / provisioning / certificate / signed physical-device verification
- final AASA body and delivery
- Supabase staging HTTPS redirect / template / SMTP changes
- Vercel deployment/settings changes
- AppDelegate / SceneDelegate / `@capacitor/app`
- real iPhone cold/warm Universal Link ingress
- production App ID registration / production callback
- DB password rotation and DB/migration work

Unit C以降には着手していない。
