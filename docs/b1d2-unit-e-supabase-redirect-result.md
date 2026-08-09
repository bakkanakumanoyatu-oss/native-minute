# B1D2 Unit E — Supabase staging redirect closeout

判定: **PASS — EXTERNAL REDIRECT MATCHES REPO CONTRACT; UNIT F NOT STARTED**

監査・文書同期日: 2026-08-09

対象branch: `codex/b1d2-unit-d`

開始HEAD: `b4cddb51386b3f8d668b5727de7802bd895edf01`

commit / push: not performed

## Human-confirmed external state

Supabase project `native-minute-staging`のAuthentication → URL Configurationは次の状態である。

- Site URL: `http://localhost:3000`
- Debug Redirect URL: `com.nativeminutes.app.debug://auth/callback**`
- staging Redirect URL: `https://native-minute-staging.vercel.app/mobile/auth/callback`
- staging HTTPS entry: exact URL、wildcardなし
- Dashboard result: `Successfully added 1 URL`を人間確認済み
- Magic Link template: default
- Custom SMTP: 未設定
- DB password rotation: 未完了または不明

このcloseoutではDashboardを操作せず、人間確認済み事実だけをrepo文書へ同期した。

## Production AASA prerequisite

Unit D2でproduction `https://native-minute-staging.vercel.app/.well-known/apple-app-site-association`を検証済みである。

- HTTP 200
- `Content-Type: application/json`
- redirectなし
- application identifier: `46P9QD3T3Q.com.nativeminutes.app.staging`
- component path: `/mobile/auth/callback`

## Repository callback consistency

- `config/mobile-profiles.json`のstaging callbackはexact `https://native-minute-staging.vercel.app/mobile/auth/callback`。
- staging BFF originは`https://native-minute-staging.vercel.app`で、callbackと同一origin。
- staging environment validatorはHTTPS、同一BFF origin、exact `/mobile/auth/callback`、no port/query/hash/credentialsを要求する。
- callback parserはprotocol、hostname、port、pathnameをexpected targetと完全一致させ、credentials、fragment、unexpected query key、duplicate fieldを拒否する。
- `transaction_id`、`state`、`nonce`、one-time consumptionを含むnative-owned PKCE contractは変更していない。

Supabaseのstaging Redirect URLとrepo contractはexact一致する。新しいcallback API/pathやauth contractは追加していない。

## Regression boundary

- Unit A: staging profile / bundle / Capacitor / callback mappingは不変。
- Unit C: Staging entitlement / signing / exact Associated Domainは不変。
- Unit D: production AASA body / header / routing contractは不変。
- Debug: `com.nativeminutes.app.debug://auth/callback`をdevelopment/local-spikeとDebug Info plistだけに維持。
- production: callbackは`unconfigured` / `null`のままで、有効化していない。
- B1D1: PKCE、Keychain、state / nonce / transaction binding、one-time consumption、refresh/logout、Bearer BFF、Web cookie separation、RLSは不変。

## Verification

- workspace guard: PASS
- callback/config focused tests: PASS
- relevant mobile auth tests: PASS
- staging release guard: PASS
- `git diff --check`: PASS

docs-only closeoutのためbuild、signed-device build、install / launchは再実行しない。

## Intentionally not started

- このcloseoutによる追加のSupabase / Vercel / Apple Dashboard変更
- callback/auth code変更
- AppDelegate / `@capacitor/app`
- DB / migration / dependency
- Magic Link送信
- iPhone install / launch
- actual Universal Link test
- Unit F

B1D2はUnit Fのactual-device smokeが未実施のため、まだ未完了である。
