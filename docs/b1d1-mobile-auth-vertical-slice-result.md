# Phase B1D1 — Mobile Auth minimum vertical slice result

判定: **PASS — LIVE VERTICAL SLICE VERIFIED**

実装日: 2026-07-19
closeout記録日: 2026-07-26
対象branch: `feature/mobile-auth-gate`
設計checkpoint: `40694efd9aa9049ba58e61c203c3199efd877b08`

## 結論

local mobile frontendの最小経路を、Web cookie sessionとは分離したMobile Authとして実装した。

`local /login → Supabase email Magic Link + PKCE → Keychain session → Bearer GET /api/mobile/scripts → local /scripts → restore → logout`

static checkpointでは、code、mock callback、契約test、local bundle、Capacitor sync、Debug Simulator向けcompile-only xcodebuildまでをPASSとした。その後、公開staging BFFとstaging Supabaseを使うsigned Simulator live smokeで、実メールMagic Link、Debug callback、Keychain session、Bearer BFF、再起動restore、logout、logout後の再起動を一連でPASSした。

B1D1はlocal mobile authの最小vertical sliceとして完了した。production callback、Universal Links、reviewer account、App Store提出toolchainの完了は主張しない。

## 実装済みscope

### Mobile Auth

- 明示状態: `unauthenticated`、`requesting_link`、`link_sent`、`awaiting_callback`、`exchanging_code`、`authenticated`、`restoring`、`refreshing`、`expired`、`signing_out`、`recoverable_error`、`fatal_error`
- email Magic Link + Supabase PKCE
- email存在有無を漏らさない送信済みcopy
- 60秒のclient resend cooldown
- 固定reason codeだけをUIへ渡し、raw provider errorを表示しない
- custom URL schemeのexact callback parserとtransaction/state/nonce照合
- warm-open eventとcold-start URLを同じcallback handlerへ集約
- callback重複、期限切れ、target不一致、state不一致をfail closed
- provider exchange前にpending transactionへ永続的な開始markを付け、crash/relaunch後のcode/verifier再交換を拒否
- provider内rotation後のKeychain再読込を含むsession restore、single-flight refresh、retryable outage時のKeychain保持、expired 401だけの1回refresh/retry、local logout
- Magic Link要求、callback exchange、sign-outをcontroller側で直列化し、busy stateではUI操作も無効化
- token、callback URL、provider errorをReact stateやlogへ保存しない

### Keychain session store

- repo-localの薄いCapacitor pluginを採用し、外部secure-storage pluginは追加していない
- sessionとpending PKCEを別Keychain itemとして保存
- build profileとinstall generationをKeychain namespaceへ含め、development/local-spike間のcross-readとreinstall後の旧session復元を防止
- install generationだけは非secret UUID markerとしてUserDefaultsへ保存し、credentialは保存しない
- `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`
- `kSecAttrSynchronizable = false`
- atomic update/add、replace、load、clear
- versioned Supabase SDK session envelopeと短命pending PKCE envelope
- corrupt、expired、locked/unavailableをvalue-freeな固定errorへ縮退
- UserDefaults、Preferences、localStorage、IndexedDB、cookie、filesystemへのcredential fallbackなし
- test専用in-memory fakeのみ許可

### Debug callback

- Debug/local-spike限定URI: `com.nativeminutes.app.debug://auth/callback`
- iOS URL typeとCapacitor native lifecycle bridgeを追加
- generated `packageClassList`にsession storeとlifecycleの両plugin classが入ることを確認
- custom schemeはtemporaryであり、production primaryではない
- Associated Domains、AASA、Apple Developer設定、Universal Linksは未実装

### Bearer-only BFF

- `GET /api/mobile/scripts`
- `Authorization: Bearer <access credential>`だけをprincipalとして使用
- missing/malformed/invalid/expired credentialをsafe 401へ縮退
- `getUser(jwt)`でverified userを取得
- 同じBearerを持つuser-scoped Supabase clientで既存`listScripts(client, verifiedUser.id)`を実行
- client指定user ID、cookie fallback、service role、admin clientなし
- explicit owner filterと既存RLSの二重境界
- owned scriptsに必要な最小DTOだけを返す
- `Cache-Control: private, no-store`、`Set-Cookie`なし
- exact Capacitor Origin、development限定Vite Origin、wildcardなし
- OPTIONSはGETとAuthorization headerだけを許可
- `Access-Control-Allow-Credentials`なし
- middlewareは`/api/mobile/*`をWeb cookie session初期化から分離

### local `/scripts`

- authenticated loading
- owned scripts read-only一覧
- empty state
- retryable error
- `session_expired`時だけのrefresh 1回とlogout recovery
- local logout
- create、edit、listen、record、review、progressは未実装

## Sessionとcredential境界

Mobile sessionはWeb cookie sessionと独立する。Supabase SDKがPKCE exchange/refreshに必要とするsession envelopeはKeychainにのみ永続化し、BFF request時だけaccess credentialをprocess memoryへ読み出して`Authorization` headerへ渡す。fetchは`credentials: "omit"`と`cache: "no-store"`を使用する。

publicなmobile接続値はbuild processから一時注入する契約にした。実値をsource、profile JSON、docs、environment fileへ保存していない。server secret、service role、bypass credentialはmobile bundleへ入れていない。

## Verification

| Gate | Result |
|---|---|
| Mobile lint | PASS |
| Mobile source typecheck | PASS |
| Mobile test typecheck | PASS |
| Mobile Vitest | PASS — 11 files / 96 tests |
| Auth artifact checker + self-test | PASS |
| Mobile release guard self-test | PASS |
| local-spike build | PASS |
| local-spike `cap sync ios` | PASS |
| generated local config safety | PASS — local bundle、server configなし、両native plugin登録 |
| local-spike release guard | PASS |
| root lint | PASS |
| root typecheck | PASS |
| root build | PASS |
| root test command | PASS — Mobile Auth / UI / BFF contract 11 files / 96 tests |
| CLI xcodebuild Debug / generic iOS Simulator | PASS |
| 通常署名Simulator Debug build | PASS — `signed=true`、`application_identifier_present=true`、`keychain_entitlement_ready=true` |
| signed Simulator live auth | PASS — Magic Link、callback、Keychain save/restore/clear、Bearer BFF、logout |

root lint/typecheck/buildは、worktreeの`.env.local`を開かずNext.jsの自動読込も避けるため、environment fileを除外した一時copyで実行した。secret値は表示していない。

### Production release guard

`npm run check:mobile-release`は今回**意図どおりFAIL**した。拒否categoryは次の5種類である。

- AASA contract missing
- Associated Domains missing
- production auth build metadata invalid
- custom scheme callback present
- production HTTPS auth callback missing

production buildをready扱いしないためのrelease gateであり、実装失敗ではない。production deploy、production environment変更、Apple/Supabase設定変更は行っていない。

## Testsで証明した境界

- Keychain adapterのsave / replace / load / clear、corrupt fail-closed、locked/unavailable safe error
- pending PKCE TTL、provider exchange開始前の永続mark、interrupted replay拒否
- Magic Link送信、cooldown、callback match/mismatch、expiry、duplicate、exchange success/failure
- cold/warm callback、provider内rotation後のrestore、near-expiry refresh、single-flight、in-flight auth処理をdrainするlocal logout
- restore / callback exchange / refresh / sign-out中のMagic Link要求拒否とbusy UI無効化
- profile namespace分離とnonsecret install-generation marker
- login generic copy、scripts loading/empty/list/error
- missing/malformed/invalid Bearer、cookie-only拒否、client user ID injection無視
- verified user IDだけをowned list serviceへ渡すこと
- provider/DB errorのsafe mapping、429/503/500
- allowed/disallowed Origin、OPTIONS、no-store、no credentials、no Set-Cookie
- `/api/mobile/*`でWeb cookie middlewareを使わないこと
- Debug callback profileとproduction unconfigured contract

実DBにUser A/Bを作って行うRLS live proofは未実施であり、mock/contract testをlive proofとは扱わない。

## Live smoke closeout

**PASS — SIGNED SIMULATOR LIVE VERTICAL SLICE**

時系列:

1. static checkpointで96 tests、local build、Capacitor sync、compile-only Debug xcodebuildをPASSした。
2. 最初のlive attemptは、起動時のpending PKCE restoreでKeychain accessに失敗して停止した。
3. safe failure categoryは`KEYCHAIN_MISSING_ENTITLEMENT`、OSStatus categoryは`errSecMissingEntitlement (-34018)`だった。
4. 原因はSimulator runtime buildへ`CODE_SIGNING_ALLOWED=NO`を指定したことだった。plugin registered / available、Keychain API到達はすべて`true`で、stale buildやsource defectではなかった。
5. signing overrideを外した通常署名Debug buildで、`signed`、`application_identifier_present`、`keychain_entitlement_ready`がすべて`true`になり、`-34018`は再発しなかった。
6. local `/login`からMagic Linkを送信・受信し、Debug callback後にlocal `/scripts`を表示した。mobile BFFはBearer principalで接続し、cookie fallbackやservice roleを使わなかった。
7. app再起動後にKeychain sessionを復元して`/scripts`を再表示した。
8. logoutでKeychain sessionを削除して`/login`へ戻り、さらにappを再起動しても`/login`のままであることを確認した。

このlive smokeでは、secret、メールアドレス、Magic Link、callback code、token、PKCE verifier、Keychain保存値、DB passwordを記録していない。source、environment file、production、Developer checkoutも変更していない。

User A/Bを使うcross-user RLS live proofはB1D1 closeoutの確認事実には含めず、release hardeningとして残す。

## Known limitations / deferred

- Debug custom schemeは別appによるscheme claimを防げないため、PKCEでcode theftを限定してもproduction primaryにはしない。
- Universal Links、Associated Domains、AASA、Apple Developer設定、physical-device callbackはB1D2以降。
- reviewer password loginは未実装。backdoorやreviewer専用権限も追加していない。
- durable server-side rate limiterはprovider/運用選定を要するため追加していない。client cooldownとupstream 429のsafe mappingだけを実装した。
- device-loss時の個別session revoke、all-device sign-out、account deletion mobile UIは後続scope。
- production callback、staging/production分離のlive値、App Store提出toolchainは未達。
- Developer checkoutの旧same-WebView auth smokeはPENDINGのままで、本線へ統合していない。
- User A/B cross-user RLS live proofとreviewer accountは未実施。

## Exact next phase

B1D1はここでcloseする。次の正式PhaseはB1D2だが、別の明示指示があるまでUniversal Links、Associated Domains、AASA、Apple Developer設定、production callback、reviewer account実装へ進まない。

## Rollback

checkpoint commitをrevertすれば、mobile auth UI、repo-local Keychain/lifecycle plugin、`/api/mobile/scripts`、Bearer middleware boundary、auth release guardsをまとめて除去できる。DB schema、migration、RLS、Supabase Dashboard、Apple Developer、production deploymentには変更がないため、external rollbackは不要である。
