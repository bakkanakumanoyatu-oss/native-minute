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
| D4 | `PARTIAL` | Unit F4 warmはPASS。coldはM01 reconciliation、foregroundはM03が残る |
| D5 | `PARTIAL` | Unit D1 repo/local response、Unit D2 live response、Unit F3 diagnosticsあり。case単位のfinal ledger closeが残る |
| D6 | `PASS_AT_CHECKPOINT` | Unit E exact redirectとUnit F4 dynamic binding / same-device PKCE success |
| D7 | `OPEN` | Aへ割り当てたmatrixにOPEN/UNKNOWNが残る |
| D8 | `OPEN` | M24 User A/B actual-device proofが残る |
| D9 | `OPEN` | Aへ割り当てたfallback/offline/replay/AASA outage等が残る |
| D13 | `PASS_AT_CHECKPOINT` | Unit F3のfocused/all mobile tests、lint/typecheck、staging/release/auth guards、signed build |
| D15 | `PASS_AT_CHECKPOINT` | Unit A/C/D/E/F3のcontract-unchanged記録とregression tests |

このledgerの`PASS_AT_CHECKPOINT`は、その行の既存evidenceを機械的に再実行する要求ではない。A全体のcloseにはOPEN/PARTIAL/UNKNOWNの解消と、採用evidenceを参照するfinal committed ledgerが必要である。

## M01〜M28 exact mapping / evidence ledger

`PASS_AT_CHECKPOINT`はcheckpointにGit-authoritativeなsafe evidenceがあるという意味に限定する。`OPEN`は未実施だけでなく、repoでcase単位のcloseoutを確定できない場合も含む。

| ID | Scope | Checkpoint status | Required close evidence / current source |
|---|---|---|---|
| M01 | A | `UNKNOWN_PENDING_SAFE_EVIDENCE_RECONCILIATION` | cold actual-device。過去会話の実施記録とrepo記述が不一致 |
| M02 | A | `PASS_AT_CHECKPOINT` | Unit F4 warm actual-device。checkpoint plan / README / current-state |
| M03 | A | `OPEN` | foreground delivery、duplicate navigationなし |
| M04 | A | `OPEN` | app-not-installed Safari fallbackとprivacy-safe surface |
| M05 | A | `OPEN` | install-after-fallback、新しいlink前提 |
| M06A | A | `OPEN` | consumed-link retapで二重sessionなし |
| M06B | A | `OPEN` | safe dummy duplicateでexchange最大1回 |
| M07 | A | `OPEN` | launch/warm raceでexchange最大1回 |
| M08 | A | `OPEN` | expired guidance、sessionなし |
| M09 | A | `OPEN` | wrong-stateをprovider exchange前に拒否 |
| M10 | A | `OPEN` | wrong nonce/transactionをprovider exchange前に拒否 |
| M11 | A | `OPEN` | malformed/duplicate/extra paramsを拒否、URL detail非表示 |
| M12 | A | `OPEN` | wrong protocol/host/path/port/Debug targetを拒否 |
| M13 | A | `OPEN` | offlineでcrashせず、新しいlinkを案内 |
| M14 | A | `OPEN` | exchange timeoutで同じcodeを再利用しない |
| M15 | A | `PASS_AT_CHECKPOINT` | Unit F4 terminate/relaunch、Keychain restore、Bearer BFF、callback非再消費 |
| M16 | A | `OPEN` | access expiry、single-flight refresh、BFF retry最大1回 |
| M17 | A | `OPEN` | transient refresh outageでsession保持、復旧後retry |
| M18 | A | `OPEN` | invalid refreshでstale sessionを残さない |
| M19 | A | `UNKNOWN_PENDING_SAFE_EVIDENCE_RECONCILIATION` | logout actual-device。過去会話の実施記録とrepo記述が不一致 |
| M20 | A | `UNKNOWN_PENDING_SAFE_EVIDENCE_RECONCILIATION` | logout-restart actual-device。過去会話の実施記録とrepo記述が不一致 |
| M21 | B | `OPEN — APP_STORE_RELEASE_BLOCKER` | provider revoke後のexpiry/refresh挙動 |
| M22 | A | `OPEN` | AASA outage時にcustom schemeへfallbackせずfail safe |
| M23 | B | `OPEN — APP_STORE_RELEASE_BLOCKER` | mail scanner/prefetch挙動とreviewer運用 |
| M24 | A | `OPEN` | User A/B cross-user isolation actual-device proof |
| M25 | A | `OPEN` | Web cookieとmobile Bearerのcoexistence |
| M26 | B | `OPEN — APP_STORE_RELEASE_BLOCKER` | production installed cold/warm |
| M27 | B | `OPEN — APP_STORE_RELEASE_BLOCKER` | production restore/refresh/logout |
| M28 | B | `OPEN — APP_STORE_RELEASE_BLOCKER` | production safe negative sample、query/tokenなし |

### B1D2A exact DoD

B1D2Aを`CLOSED_COMMITTED_PASS`にできるのは、次をすべて満たしたときだけである。

1. D1〜D9のA列とD13/D15のA列をsafe evidenceで閉じる。
2. M01〜M20、M22、M24、M25をcase単位でPASSにする。F5不整合は後述のsafe reconciliationで解消する。
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

## F5 evidence reconciliation

過去会話にはM01 cold、M19 logout、M20 logout-restartをactual deviceで実施した記録がある。一方、evidence checkpointにはUnit F5 result docがなく、README / current-state / planには未実施と読める記述が残る。このため3件の正本statusは一律`UNKNOWN_PENDING_SAFE_EVIDENCE_RECONCILIATION`とする。PASSを推測・捏造しない。

既存のsafe evidenceでcase、build、結果を確定できるなら、同じactual-device testを機械的にやり直さずledgerとUnit F resultを同期して閉じる。safe evidenceが不足する場合はUNKNOWN/OPENを維持し、別の明示承認を得るまでMagic Link送信や実機再試験へ進まない。

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

`B1D2A_SAFE_EVIDENCE_RECONCILIATION`として、M01/M19/M20の既存safe evidenceだけを照合し、Unit F5 evidenceの有無と3 caseのstatusをrepo正本へ確定する。今回のdocs-only splitから自動で実装、Magic Link送信、実機操作へ進まない。
