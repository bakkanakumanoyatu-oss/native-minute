# B1D2 Unit D1 — AASA repo implementation result

判定: **PASS — REPO AASA AND LOCAL DIRECT RESPONSE VERIFIED; LIVE DEPLOY PENDING**

実装・検証日: 2026-08-09

対象branch: `codex/b1d2-unit-d`

開始HEAD: `2c6a188f99b3bd89c9666f027bfe5ebc834db162`

commit / push: Unit D1実装taskでは実施しない

## Apple contract

- Appleのcurrent `Supporting associated domains`とTechnote TN3155を確認した。
- AASAはHTTPSの`/.well-known/apple-app-site-association`からextensionなし、redirectなしで直接配信する。
- recommended `appIDs` + `components`形式を採用し、legacy `appID` + `paths`と混在させない。
- query-specific componentを置かず、`"/": "/mobile/auth/callback"`だけでpathをexact matchする。
- JSON responseは`application/json`とする。

Primary sources:

- <https://developer.apple.com/documentation/xcode/supporting-associated-domains>
- <https://developer.apple.com/documentation/bundleresources/applinks/details-swift.dictionary>
- <https://developer.apple.com/documentation/technotes/tn3155-debugging-universal-links>

## Application identifier

Unit Cのsigned app entitlementとembedded provisioning profileの`application-identifier`が一致することを再確認した。bundle suffixは`com.nativeminutes.app.staging`で、prefix部分をApplication Identifier Prefixとして使用した。

AASA application identifierは次の関係で一意に固定した。

`<verified App ID Prefix>.com.nativeminutes.app.staging`

verified application identifier: `46P9QD3T3Q.com.nativeminutes.app.staging`

今回のaccountでTeam IDとApp ID Prefixが一致する人間確認事実は維持するが、Team IDからAASA identifierを一般的に導出する実装にはしていない。application identifierは公開association情報でありAASA本文に必要だが、account email、device identifier、serial、certificate owner、private key情報は含めない。

## Repository implementation

- `public/.well-known/apple-app-site-association`: extensionなしのstatic JSON artifact。
- root serviceは`applinks`だけ。
- detailはverified staging application identifier 1件だけ。
- componentはexact `/mobile/auth/callback` 1件だけ。
- wildcard app identifier/path、query/fragment binding、`webcredentials`、`activitycontinuation`、`appclips`は含めない。
- `next.config.mjs`: exact AASA pathへ`Content-Type: application/json`だけを設定する。redirect/rewriteは追加しない。
- staging release guard: exact static artifact、1 app、1 callback component以外をfail closedする。
- focused test/self-test: malformed/missing、wrong app、wildcard pathを拒否する。

## Middleware safety

既存middlewareのexact AASA pass-throughを維持した。focused testで次を確認する。

- Supabase auth clientを呼ばない。
- redirectしない。
- cookieを書かない。
- AASA response処理を妨げない。

middlewareの広範囲な設計変更は行っていない。

## Local response evidence

隔離したNext.js production build/serverへGETし、次を確認した。

- HTTP 200
- `Content-Type: application/json`
- `Location`なし
- `Set-Cookie`なし
- valid JSON
- `applinks`だけ
- verified staging application identifier 1件だけ
- exact `/mobile/auth/callback` component 1件だけ
- query付きAASA requestでもbodyは不変
- uncompressed size: 246 bytes

これはlocal response proofであり、VercelまたはApple CDNのlive proofではない。

## Unit C / B1D1 regression

- Staging bundle / Associated Domains entitlement / `CODE_SIGN_ENTITLEMENTS` / Automatic signing: unchanged
- Unit A mobile profile / Capacitor / callback mapping: unchanged
- native-owned PKCE / state / nonce / transaction / one-time consumption: unchanged
- Keychain / refresh / logout / Bearer BFF / Web cookie separation / RLS: unchanged
- callback parser / target contract: unchanged

signing/configを変更していないためsigned-device buildは再実行しない。

## Verification

- workspace guard: PASS
- focused AASA route + middleware tests: PASS — 2 files / 3 tests
- Unit A configuration/callback regression: PASS — 2 files / 21 tests
- all mobile tests: PASS — 13 files / 132 tests
- mobile lint: PASS
- mobile source/test typecheck: PASS
- root lint: PASS
- root typecheck: PASS
- root build: PASS
- staging release guard: PASS
- release guard self-test: PASS — wrong app、wildcard path、missing/malformed AASAを拒否
- auth artifact guard + self-test: PASS
- local production AASA response: PASS
- JSON parse / exact body validation: PASS
- `git diff --check`: PASS

## Deployment wiring inventory

- repoに`.vercel` project linkageはない。
- repoに`vercel.json`はない。
- repoにGitHub Actions deployment workflowはない。
- package scriptsにVercel deploy commandはない。
- docsにはVercel deploy/rollback runbookがあるが、staging projectのcurrent Production Branchをrepoから確定できない。
- 過去に`native-minute-staging`のProduction Deploymentが`feature/mobile-auth-gate`由来だったことは人間確認済みだが、現在も同じとは推測しない。

Unit D2では、Vercel Dashboardでproject/domain/current Production Branchとcurrent deployment sourceを人間確認し、環境変数やproject設定を同時変更せず、承認されたexact D1 commitだけを既存Git integration経由でstaging domainへ公開するのが最小である。mappingが確認できない場合はdeployせずSTOPする。

## External state / intentionally not started

- live AASA endpoint: current 404
- Vercel deploy / project setting / Production Branch change: not performed
- Supabase staging HTTPS redirect / Site URL / Magic Link template: not changed
- Magic Link send / actual Universal Link test: not performed
- entitlement / signing / provisioning / Apple Portal: not changed
- AppDelegate / SceneDelegate / `@capacitor/app`: not changed
- DB / migration / dependency / lockfile: not changed
- Unit E/F: not started
