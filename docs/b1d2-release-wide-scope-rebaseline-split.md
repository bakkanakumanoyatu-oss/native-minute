# B1D2 release-wide scope rebaseline / split decision

Decision: `HDC_B1D2_RELEASE_WIDE_SCOPE_SPLIT_AND_EXTERNAL_TEMPLATE_WORK_V2`

- 適用日: 2026-08-11
- original scope baseline: `7c85ff5dab2973dd682f97ce1224c9c8b31b184f`
- evidence checkpoint: `fb011b9c740a98a9cff267d078f9ac7d80f00dd7`

## 結論

original B1D2は最初からrelease-wideだった。`7c85ff5`の初回完全版にD1〜D15とM01〜M28がすべて存在し、later-added D/Mは`0`である。後から膨らんだscopeをstaging-onlyへ戻すのではない。App Storeまでのcritical pathを正常化するHuman Decisionにより、履歴を維持したまま次の3 trackへ意図的に分割する。

| Scope | Status | 意味 |
|---|---|---|
| original B1D2 | `REBASELINED_SPLIT` | A/B/Cへ追跡可能な形で分割済み。単独のPASS対象ではない |
| `B1D2A_STAGING_AUTH_CORE` | `OPEN` | 次に`CLOSED_COMMITTED_PASS`を目指す |
| `B1D2B_RELEASE_READINESS` | `OPEN — APP_STORE_RELEASE_BLOCKER` | App Store release前に閉じる。削除・deferしない |
| `B1D2C_DEFERRED_HARDENING` | `DEFERRED_WITH_OWNER_AND_REVIEW_GATE` | ownerとreview gateを維持し、必要ならHuman DecisionでBへ昇格する |

B1D2Aだけが`CLOSED_COMMITTED_PASS`になっても、original B1D2全体を`CLOSED_COMMITTED_PASS`またはPASSと表現してはいけない。Aのclose後もBはApp Store release blocker、Cはreview対象として残る。

この文書を今後のB1D2 scope/status/mappingの正本とする。元planとUnit result docsは、baseline定義、詳細contract、時系列evidenceの正本として保持する。

## D1〜D15 exact mapping

`staging`と`production`を含む行は責務を分割する。元IDと完了条件は変更しない。

| Original ID | B1D2A — staging auth core | B1D2B — release readiness |
|---|---|---|
| D1 | staging host、bundle identity、Apple prefix、Supabase project、owner | production host、bundle identity、Apple prefix、Supabase project、release owner |
| D2 | Debug scheme隔離とstaging exact HTTPS callback | production Releaseのexact HTTPS callback |
| D3 | staging exact Associated Domain、source/signed entitlement | production exact Associated Domain、distribution signed entitlement |
| D4 | staging warm/cold/foreground ingressと必要最小native forwarding | production cold/warm ingress再確認 |
| D5 | staging AASA exact app/path、public 200/JSON/no redirect、CDN/device確認 | production AASA exact app/path、public delivery/cache確認 |
| D6 | staging Supabase mapping、dynamic binding、same-device PKCE | production Supabase mapping、dynamic binding、same-device PKCE |
| D7 | Aに割り当てたstaging matrix: M01〜M20、M22、M24、M25 | release-readiness staging surfaces M21/M23とproduction M26〜M28 |
| D8 | staging User A/B Bearer BFF + RLS isolation（M24） | — |
| D9 | staging callback/query/open redirect/fallback/offline/replay stop conditions | production log/query auditとproduction negative surface（M28） |
| D10 | — | reviewer repeated login方式の承認・検証 |
| D11 | — | compatible toolchain、distribution archive、signed artifact evidence |
| D12 | — | separately approved production additive cutoverとproduction smoke |
| D13 | staging guard/self-testとregression command evidence | production guard/self-test、archive/release regression evidence |
| D14 | — | rollback owner、compatibility window、AASA cache strategy |
| D15 | B1D1 Keychain/PKCE/replay/refresh/logout/Bearer-only BFF contract regression | — |

### B1D2A D evidence ledger at checkpoint

| A-side DoD | Status | Git-authoritative evidence / remaining gap |
|---|---|---|
| D1 | `PARTIAL` | Unit A/C/Eにstaging identity/config/external mappingあり。A ownerとfinal ledger closeが残る |
| D2 | `PASS_AT_CHECKPOINT` | Unit AのDebug/Staging/Release Info.plistとexact staging callback isolation |
| D3 | `PASS_AT_CHECKPOINT` | Unit Cのsource/signed entitlement、profile、exact staging domain |
| D4 | `PASS_AT_CHECKPOINT` | Unit F4 warm、accepted Human safe evidenceのM01 cold、このwaveのM03 foreground actual-deviceをcase単位でPASS |
| D5 | `PARTIAL` | Unit D1 repo/local response、Unit D2 live response、Unit F3 diagnosticsあり。case単位のfinal ledger closeが残る |
| D6 | `PASS_AT_CHECKPOINT` | Unit E exact redirectとUnit F4 dynamic binding / same-device PKCE success |
| D7 | `OPEN` | M03/M04/M05/M06A/M13/M24/M25をactual-device/network proofで閉じ、3件（M08/M17/M22）が残る |
| D8 | `PASS_ACTUAL_STAGING_USER_AB_ISOLATION` | 通常Web User A flowでowned scriptを作成。Mobile User Aでは表示、正常認証/BFFのUser Bでは非表示をactual stagingで確認。Bearer verified user filterとRLSがcorroborate |
| D9 | `OPEN` | M10/M11 negative、M14 bounded timeout、M13 offline、M04/M05 fallback/install-after-fallback actualはPASS。M17 refresh failure/recoveryとM22 AASA outage等が残る |
| D13 | `PASS_AT_CHECKPOINT` | Unit F3のfocused/all mobile tests、lint/typecheck、staging/release/auth guards、signed build |
| D15 | `PASS_AT_CHECKPOINT` | Unit A/C/D/E/F3のcontract-unchanged記録とregression tests |

このledgerの`PASS_AT_CHECKPOINT`は、その行の既存evidenceを機械的に再実行する要求ではない。A全体のcloseにはOPEN/PARTIAL/UNKNOWNの解消と、採用evidenceを参照するfinal committed ledgerが必要である。

## M01〜M28 exact mapping / evidence ledger

`PASS_AT_CHECKPOINT`はcheckpointにGit-authoritativeなsafe evidenceがあるという意味に限定する。`PASS_ACCEPTED_HUMAN_SAFE_EVIDENCE`はHuman-provided historical actual-device evidenceを、repo implementationとの整合とcontradiction不在を確認してprovenance付きで受理したことを意味し、repo direct evidenceや今回の再実行を意味しない。`PASS_EXISTING_TEST_REEXECUTION`は既存focused testを変更せず再実行し、unchanged implementation/contractと合わせてcaseを閉じたrepo-generated evidenceであり、actual-device evidenceではない。`OPEN_*` / `UNKNOWN`は未実施だけでなく、repoでcase単位のcloseoutを確定できない場合も含む。

| ID | Scope | Checkpoint status | Required close evidence / current source |
|---|---|---|---|
| M01 | A | `PASS_ACCEPTED_HUMAN_SAFE_EVIDENCE` | Human-provided cold actual-device evidence。repo direct resultなし、実装/tests整合、contradictionなし。[reconciliation result](./b1d2-unit-f-safe-evidence-reconciliation-result.md) |
| M02 | A | `PASS_AT_CHECKPOINT` | Unit F4 warm actual-device。checkpoint plan / README / current-state |
| M03 | A | `PASS_ACTUAL_DEVICE_FOREGROUND_DELIVERY` | iPhone 14 Plus / iOS 26.2.1。fresh linkから`/SCRIPTS`を1回表示しduplicate UI/navigationなし。[wave result](./b1d2a-consolidated-actual-device-network-wave-result.md) |
| M04 | A | `PASS_ACTUAL_DEVICE_SAFE_SAFARI_FALLBACK` | app不在を確認後、fresh Link Aを1回tap。Safari safe recovery、非認証、秘密値非表示、custom scheme遷移/crashなし。[actual result](./b1d2a-m04-m05-actual-device-fallback-closeout-result.md) |
| M05 | A | `PASS_ACTUAL_DEVICE_FRESH_LINK_AFTER_INSTALL` | 同じverified signed Staging artifactをinstallし、Link Aを再利用せずfresh Link Bを1回tap。native `/SCRIPTS`とBearer BFFをPASS。[actual result](./b1d2a-m04-m05-actual-device-fallback-closeout-result.md) |
| M06A | A | `PASS_ACTUAL_DEVICE_CONSUMED_LINK_RETAP` | M03で消費した同じlinkを再tapし`/SCRIPTS` sessionを維持。duplicate navigation/crashなし。[wave result](./b1d2a-consolidated-actual-device-network-wave-result.md) |
| M06B | A | `PASS_EXISTING_TEST_REEXECUTION` | duplicate final callbackのexchange最大1回。既存focused test再実行PASS |
| M07 | A | `PASS_EXISTING_TEST_REEXECUTION` | launch URL / retained warm raceのexchange最大1回。既存focused test再実行PASS |
| M08 | A | `PENDING_EXTERNAL_EXPIRY_WINDOW` | repo pending-expiryはPASS。dedicatedな未消費provider linkのreal expiry conditionが残る |
| M09 | A | `PASS_EXISTING_TEST_REEXECUTION` | wrong stateをprovider exchange前に拒否。既存focused test再実行PASS |
| M10 | A | `PASS_FOCUSED_REPO_PROOF` | wrong nonce/transactionをprovider exchange前に拒否し、exchange 0、session mutationなし |
| M11 | A | `PASS_FOCUSED_REPO_PROOF` | 4 required params各欠落をfixed safe reasonで拒否し、exchange 0、raw detailなし |
| M12 | A | `PASS_EXISTING_TEST_REEXECUTION` | wrong protocol/host/path/portとStaging/ReleaseのDebug target隔離。既存focused test再実行PASS |
| M13 | A | `PASS_ACTUAL_DEVICE_OFFLINE_BEFORE_TAP` | tap前に機内モードON/Wi-Fi OFF。offline failure、crash/false authなし、復旧後LOGIN維持、同link非再利用。[wave result](./b1d2a-consolidated-actual-device-network-wave-result.md) |
| M14 | A | `PASS_FOCUSED_REPO_FAULT_PROOF` | persisted pending expiryをdeadlineにexchangeをabortし、same callbackのexchange最大1回 |
| M15 | A | `PASS_AT_CHECKPOINT` | Unit F4 terminate/relaunch、Keychain restore、Bearer BFF、callback非再消費 |
| M16 | A | `PASS_EXISTING_TEST_REEXECUTION` | access expiry、single-flight refresh、BFF retry最大1回。既存focused testとB1D1 contract再確認PASS |
| M17 | A | `PENDING_CONTROLLED_REFRESH_TRIGGER` | retryable failure時のsession/Keychain保持はrepo PASS。actual authenticated refresh failure→recovery条件が残る |
| M18 | A | `PASS_EXISTING_TEST_REEXECUTION` | invalid refresh 401で`auth_session_invalid`、Keychain clear。external revokeは別のM21 |
| M19 | A | `PASS_ACCEPTED_HUMAN_SAFE_EVIDENCE` | Human-provided logout actual-device evidence。repo direct resultなし、実装/tests整合、contradictionなし。[reconciliation result](./b1d2-unit-f-safe-evidence-reconciliation-result.md) |
| M20 | A | `PASS_ACCEPTED_HUMAN_SAFE_EVIDENCE` | Human-provided logout-restart actual-device evidence。repo direct resultなし、実装/tests整合、contradictionなし。[reconciliation result](./b1d2-unit-f-safe-evidence-reconciliation-result.md) |
| M21 | B | `OPEN — APP_STORE_RELEASE_BLOCKER` | provider revoke後のexpiry/refresh挙動 |
| M22 | A | `OPEN_NEEDS_NETWORK_OR_FAILURE_CONDITION` | source/configはfail safe、AASA unavailable時のEdge/actual-device proofが残る |
| M23 | B | `OPEN — APP_STORE_RELEASE_BLOCKER` | mail scanner/prefetch挙動とreviewer運用 |
| M24 | A | `PASS_ACTUAL_STAGING_USER_AB_ISOLATION` | 通常Web UIでUser A owned scriptを作成。Mobile User Aでは表示し、正常なauthenticated Bearer/BFF responseのUser Bでは非表示。repo owner filter/RLSがcorroborate。[combined proof result](./b1d2a-m24-m25-combined-actual-proof-result.md) |
| M25 | A | `PASS_LIVE_WEB_COOKIE_MOBILE_BEARER_COEXISTENCE` | Web User A cookieとMobile User A Bearer/Keychainを同時維持し、両方でowned script/BFFを確認。Mobile-only logout後もWeb cookieは維持。[combined proof result](./b1d2a-m24-m25-combined-actual-proof-result.md) |
| M26 | B | `OPEN — APP_STORE_RELEASE_BLOCKER` | production installed cold/warm |
| M27 | B | `OPEN — APP_STORE_RELEASE_BLOCKER` | production restore/refresh/logout |
| M28 | B | `OPEN — APP_STORE_RELEASE_BLOCKER` | production safe negative sample、query/tokenなし |

### B1D2A exact DoD

B1D2Aを`CLOSED_COMMITTED_PASS`にできるのは、次をすべて満たしたときだけである。

1. D1〜D9のA列とD13/D15のA列をsafe evidenceで閉じる。
2. M01〜M20、M22、M24、M25をcase単位でPASSにする。M01/M19/M20のsafe reconciliationは完了済みである。
3. staging identity/config/signing、Associated Domains/AASA/Supabase mapping、warm/cold/foreground/fallback/negative/auth lifecycle、User A/B、Web coexistence、final staging guardsを1つのevidence ledgerへ固定する。
4. B1D1のKeychain envelope/item identity、native-owned PKCE binding、`exchangeStartedAt`、one-time/replay reasons、refresh/logout、Bearer-only BFF、Web cookie separationを変えない。
5. Unit F result、`docs/current-state.md`、`README.md`を同期し、docs/code/verificationの対象commitをpushしてworking treeをcleanにする。

現checkpointではB1D2Aは`OPEN`であり、上記未充足caseのPASSを主張しない。

## B1D2B release blockers

B1D2Bは`OPEN — APP_STORE_RELEASE_BLOCKER`として次を保持する。

- production App ID / bundle / callback / entitlement / AASA / Supabase mapping
- distribution archive evidenceとproduction guard
- reviewer repeated login方式、production mail scanner運用
- rollback owner、compatibility window、AASA cache strategy
- production callback/query/log audit、provider revoke
- production cold/warm、restore/refresh/logout、safe negative surfaces
- D10〜D12、D14、production側D1〜D6/D9/D13、M21/M23/M26〜M28

B1D2A close後も、B1D2Bを閉じるまでApp Store releaseへ進めない。

## B1D2C deferred hardening

| Deferred item | Owner | Review gate |
|---|---|---|
| reviewer password surface（その方式を採用した場合） | product/release + auth/security | B1D2B reviewer方式決定時。採用ならHuman DecisionでBへ昇格 |
| OTP recovery | auth + product | App Store RC auth recovery review |
| immediate revoke denylist | security + auth | provider revoke evidenceでrelease blockerと判明した時 |
| global device management UI | product + security | App Store RC account/session scope review |
| custom domain migration | product + infra | production domain/brand/operation要件が確定した時 |
| additional chaos testing | auth + QA + security | A/B evidence後のresidual-risk review |
| release blockerと証明されていない追加hardening | 該当subsystem owner | App Store RC risk review |

Cの項目は消さない。App Store RCに必要と判明した場合だけ、ownerの提案とHuman DecisionによりBへ昇格する。今回新しいD/M IDは作らない。

## Unit F safe evidence reconciliation

M01 cold、M19 logout、M20 logout-restartは、Human-provided historical actual-device evidenceをcase単位で受理し、`PASS_ACCEPTED_HUMAN_SAFE_EVIDENCE`とした。repo-native Unit F5 result / runtime logは存在せず、今回actual-device testを再実行したものでもない。iPhone 14 Plus / iOS 26.2.1というHuman-provided provenanceは記録するが、exact実行日時とexact tested build identifier / commitは`UNKNOWN`のまま捏造しない。

`fb011b9`時点のnative ingress、launch URL保持、JS callback、validation / PKCE / Keychain / Bearer BFF、logout secure deletion、restart restore実装とtestsを照合し、候補結果を技術的に成立させ得ることを確認した。関連sourceはreconciliation start HEADまで同一で、失敗result/logその他のcontradictionはなかった。Unit F4のcold/logout未実施記述は同runのscope boundaryであり、後続Human-provided historical evidenceのFAILを示さない。case別分類とUNKNOWNは[Unit F safe evidence reconciliation result](./b1d2-unit-f-safe-evidence-reconciliation-result.md)を正とする。

## B1D2A remaining repo-only evidence closeout batch

残19件をA〜Hへcase単位で再分類し、既存focused test 5 files / 75 testsを変更せず再実行してM06B / M07 / M09 / M12 / M16 / M18を`PASS_EXISTING_TEST_REEXECUTION`として閉じた。これはrepo-generated test evidenceであり、actual-device testの再実行ではない。source/test追加・変更、Magic Link、iPhone/Simulator、network/external service操作は行っていない。

残13件は、source implementation 3件（M04/M05/M14）、actual-device 5件（M03/M06A/M08/M24/M25）、network/failure condition 3件（M13/M17/M22）、exact repo proof不足の`UNKNOWN` 2件（M10/M11）である。contradictionと追加Human Decision requirementはなかった。case別根拠、focused command、最小next proof、execution waveは[remaining repo-only evidence closeout result](./b1d2a-remaining-repo-only-evidence-closeout-result.md)を正とする。

## B1D2A P0 repo-only negative / timeout wave

M10/M11は既存semanticを変えず、wrong nonce/transactionと4 required params欠落のcase-level testを追加して`PASS_FOCUSED_REPO_PROOF`とした。いずれもprovider exchange 0、session mutationなし、fixed safe reasonを証明する。

M14はexisting pending PKCE `expiresAt`を新しいpolicy値を作らずexchange deadlineとして使い、AbortSignalをactive Supabase exchange fetchへ渡す最小実装とdeterministic stalled-fault testを追加した。timeout後は既存`auth_exchange_failed` + new-link recovery、session/pending clear、同一callbackのduplicate拒否、exchange count 1を証明し、`PASS_FOCUSED_REPO_FAULT_PROOF`とした。repo-generated proofでありactual-device proofではない。詳細は[P0 repo-only negative / timeout wave result](./b1d2a-p0-repo-only-negative-timeout-wave-result.md)を正とする。

## B1D2A M04/M05 safe Safari fallback local/live proof

exact AASA target `/mobile/auth/callback`にrecovery-only entryを追加し、callback queryを読まずfixed `303`でquery-free `/mobile/auth/recovery`へ移す。callback/recoveryはmiddlewareのWeb auth/Supabase経路より前にbypassし、provider exchange、Web session/Set-Cookie、Keychain処理、custom scheme遷移を行わない。response/pageには`no-store`、`no-referrer`、`noindex`を設定し、recovery UIはinstall/open後に到達済みLink Aを再利用せずfresh Link Bを取得するよう案内する。

focused repo proofはquery値のbody/header非混入、application logging/query reader/provider/session primitive不在、malformed/extra queryの同一safe response、AASA exact contract regressionをPASSした。後続承認でrequest-time runtime sourceをverified deploymentとしてfixed staging aliasへpromoteし、callback 303、recovery 200、exact AASA、production isolationもPASSした。platform/infrastructure raw-query loggingはrepoから判断不能のため`UNKNOWN`であり、「ログされない」とは推定しない。actual-deviceとMagic Linkは未実施で、M04/M05を最終PASSとはしない。詳細は[M04/M05 safe Safari fallback result](./b1d2a-m04-m05-safe-safari-fallback-result.md)と[staging prerequisite remediation result](./b1d2a-staging-prerequisite-remediation-result.md)を正とする。

後続actual-device closeoutでは、Mobile用Link Aを通常Staging `/LOGIN`から1通だけ発行し、未開封のままappをuninstallして端末上の不在を確認した。Link Aの1回tapはSafari safe recoveryを表示し、app起動、認証成功、秘密値表示、custom scheme遷移、crashはなかったためM04を`PASS_ACTUAL_DEVICE_SAFE_SAFARI_FALLBACK`とした。その後、同じverified signed Staging artifactを再buildせずinstallし、Link Aを再利用せずfresh Link Bを1回tapしてnative `/SCRIPTS`とBearer BFF、duplicate/crashなしを確認し、M05を`PASS_ACTUAL_DEVICE_FRESH_LINK_AFTER_INSTALL`とした。actual-device、live Web/Auth、corroborating repo evidenceはprovenanceを分離する。詳細は[actual-device fallback closeout result](./b1d2a-m04-m05-actual-device-fallback-closeout-result.md)を正とする。

Conditional Remediation Bの初回確認は、last-known repo resultにないmobile query wildcardを検出したためapproved STOP conditionを適用した。このhistorical STOPは保持する。後続Human DecisionはHuman-provided historical Unit E evidenceと照合し、`https://native-minute-staging.vercel.app/mobile/auth/callback\?**`をquery-bearing mobile redirectTo用のauthorized entryとしてreconcileした。既存Debug / exact mobile / mobile queryを維持し、exact Web callback `https://native-minute-staging.vercel.app/auth/callback?next=%2Fscripts`を1件だけ追加した。post-checkは4 entriesちょうど、Site URL / default templates / Custom SMTP不変をPASSした。Remediation Bは`WEB_STAGING_AUTH_CONFIGURATION_PREREQUISITE_RESOLVED_CONFIG_ONLY`で、M24/M25は上表のactual proof pendingへ移行する。

M24/M25 combined actual proofの初回User A `/scripts`はserver-side exception（safe digest `182509400`）でSTOPした。後続read-only diagnosticは`JWT issued at future`を特定し、callback exchange成功、cookie persistence、auth resolution成功、authenticated PostgREST `takes` query前段のtime validation failureまで安全に切り分けた。承認済みの既存cookie 1回reloadは正常表示となり、replacement Web linkなしでproofを再開した。通常Web UIでUser A owned scriptを作成し、Web cookieとMobile Bearer/Keychainの同時維持、Mobile-only logout後のWeb cookie維持、Mobile User Aではresource表示、正常認証/BFFのUser Bでは非表示を確認した。M24は`PASS_ACTUAL_STAGING_USER_AB_ISOLATION`、M25は`PASS_LIVE_WEB_COOKIE_MOBILE_BEARER_COEXISTENCE`で、残件は5件とする。provenanceは[combined proof result](./b1d2a-m24-m25-combined-actual-proof-result.md)を正とする。

## 名前の衝突

- `Unit F`: current execution unitsでのphysical iPhone smoke / evidence / focused fixes。
- original Plan `Phase F`: production readiness review。

両者は別物である。今後は必ず`Unit F`または`original Plan Phase F`と完全表記し、`F`だけで参照しない。

## External Template Work boundary

公式テンプレート100本の本文制作は別チャット / Workでユーザーが担当する。

External Work / user側:

- 100本のテーマ企画
- 英文台本執筆と日本語対訳
- 有名スピーチ等の選定・編集
- 自己啓発系コンテンツ編集
- 不合格コンテンツの書き直し
- 100本の完成

Native Minute mainline / Codex側（後続の別Gate）:

- versioned phoneme inventory
- handoff / intake schema
- `/library`
- deterministic phoneme coverageとduration calculation
- rights/provenance、duplicate、malformed validation
- version/hash、import
- search/filter/display
- 100件追加後のperformance validation

Codexは外部Workのテンプレート本文を制作、翻訳、編集、補完しない。不足分を独自に作成せず、validation不合格はreasonと必要修正条件をExternal Workへ返す。

## 次のsingle action

M04/M05 evidenceをcommitした時点で停止する。次の別承認actionはM08のreal provider-expiry proofである。ここから自動でMagic Link発行、expiry待ち、M17/M22、source/config変更、B1D2B、Gate 2へ進まない。
