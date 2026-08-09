# B1D2 Unit C — Associated Domains / signing retry result

判定: **PASS — SIGNED STAGING DEVELOPMENT ARTIFACT VERIFIED**

実装・検証日: 2026-08-09

対象branch: `codex/b1d2-unit-c`

開始HEAD: `a12980295e4b1edf591e80bfde2055fdde6fa96a`

commit / push: この結果文書の記録対象外（Git履歴とremote refを正とする）

## Repository preflight

- working directory / Git top-level: `/Users/karasawatakahiro/Developer/native-minute`
- source branch: `codex/b1d2-unit-a`
- source local / remote HEAD: `a12980295e4b1edf591e80bfde2055fdde6fa96a`
- initial working tree: clean
- Unit C branch: `codex/b1d2-unit-c`
- `npm run check:workspace`: PASS

## Human-confirmed external facts

- Apple Developer ProgramはActive。Team ID / App ID Prefixは確認済みで今回のaccountでは一致する。
- staging Explicit App ID `com.nativeminutes.app.staging`は登録済みで、Associated Domains capabilityはApple Portalで有効化・保存済み。
- production App ID `com.nativeminutes.app`は未登録。
- Xcode Apple Accountsに対象Developer Teamがあり、Manage CertificatesにApple Development certificateが1件表示される。
- Keychain Accessのlogin / My Certificatesで、そのApple Development certificateに対応するprivate keyが存在することを人間確認済み。certificateは再作成していない。
- iPhone 14 Plus / iOS 26.2.1はpaired / Connected、Developer Mode enabled。
- AASA endpointは404で本文未配置。Supabase staging HTTPS redirectは未登録、Magic Linkはdefault。

Team ID、Apple Account、certificate owner、device identifier、serial、profile UUIDは記録しない。

## Repo implementation

- Staging専用`ios/App/App/App-Staging.entitlements`を追加した。
- Associated Domains valueは`applinks:native-minute-staging.vercel.app`の1件だけ。
- Staging targetだけに`CODE_SIGN_ENTITLEMENTS = App/App-Staging.entitlements`を設定した。
- Automatic signingを維持し、Xcodeで一意に確認できた対象TeamをStagingだけへ設定した。
- Debug / Releaseには`CODE_SIGN_ENTITLEMENTS`も`DEVELOPMENT_TEAM`も追加していない。
- staging bundle ID `com.nativeminutes.app.staging`、Info.plist、HTTPS callback、mobile/Capacitor profileはUnit A contractを維持した。

## Guard changes

- staging guardはexact bundle、Automatic signing、Team形式、exact entitlement path、exact 1-domainを検査する。
- Debug / Releaseにentitlement mappingがあればfail closedする。
- self-testはwrong Associated Domains valueを拒否するfixtureを追加した。
- focused configuration testはDebug / Staging / Release isolationとexact domainを検査する。

## Signing / provisioning attempt

1. 前回retryではApple Development identityとstaging development profileを取得したが、`codesign`がprivate-key signature待ちで完了しなかった。
2. private keyの人間確認後、`security find-identity -v -p codesigning`でusable Apple Development identity 1件を再確認した。
3. `devicectl`でiPhone 14 Plus / iOS 26.2.1、wired接続、Developer Mode enabledを再確認した。
4. current staging profileはapplication identifier suffixが`com.nativeminutes.app.staging`、development profile、接続端末を含むことを確認した。
5. profileの`com.apple.developer.associated-domains` authorizationはcapability wildcard `*`として存在する。signed app側はrepo entitlementどおりexact host 1件へ限定する。
6. Staging development buildへAutomatic Signing、`-allowProvisioningUpdates`、device registration、`-jobs 1`を限定して再実行し、既存の有効なstaging development profileを使用して成功した。
7. certificate/profileの削除・再作成、production/distribution signingは行っていない。

## Signed artifact result

接続中iPhoneをdestinationにしたsigned Staging `.app`が生成され、次をartifactから直接確認した。

- strict codesign verification: PASS
- `CFBundleIdentifier`: `com.nativeminutes.app.staging`
- built `application-identifier`: staging bundle suffixと一致
- built `com.apple.developer.associated-domains`: exact `applinks:native-minute-staging.vercel.app` 1件
- embedded profile: application identifier一致、development、接続端末を含む、Associated Domains authorizationあり
- Debug custom scheme: 非混入
- production callback: 非有効化
- staging callback: existing exact contractを維持

install / launch、AASA、Magic Link、Universal Link smokeはUnit C verificationに含めず、後続Unitも開始していない。

## Verification

- workspace guard: PASS
- focused Unit C configuration tests: PASS — 1 file / 6 tests
- Unit A focused tests: PASS — 2 files / 21 tests
- all mobile tests: PASS — 12 files / 130 tests
- mobile lint: PASS
- mobile source/test typecheck: PASS
- staging build/sync: PASS
- staging release guard: PASS
- mobile release guard self-test: PASS
- auth artifact guard + self-test: PASS
- root lint: PASS
- entitlements plist validation: PASS
- Xcode Debug/Staging/Release resolved setting isolation: PASS
- signed Staging development build: PASS
- signed artifact / embedded profile final inspection: PASS
- `git diff --check`: PASS

root typecheck / root buildはWeb UI/routes/runtimeに変更がないため再実行していない。

## B1D1 contract unchanged

- native-owned PKCE / state / nonce / transaction binding: unchanged
- one-time consumption / replay handling: unchanged
- Keychain envelope / namespace derivation: unchanged
- refresh / logout: unchanged
- Bearer-only BFF / Web cookie separation / RLS boundary: unchanged
- callback target/path/parser: unchanged

## Closeout

Unit C PASS条件のusable private-key signing、Associated Domainsを許可するdevelopment provisioning、signed artifact inspectionを満たした。Unit CだけをPASSとして閉じ、後続Unitへは進まない。

## Intentionally not started

- Unit D AASA body / deployment
- Unit E Supabase staging HTTPS redirect / template
- Unit F Magic Link / Universal Link physical-device smoke
- AppDelegate / SceneDelegate / `@capacitor/app`
- production App ID / production signing / distribution / TestFlight
- DB / migration / dependency changes
