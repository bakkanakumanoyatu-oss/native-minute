# B1D2A consolidated actual-device / network wave result

Mode: `B1D2A_CONSOLIDATED_ACTUAL_DEVICE_NETWORK_WAVE_V1`

判定: **PARTIAL CLOSEOUT — M03 / M06A / M13 PASS; 7 CASES REMAIN**

実施日: 2026-08-11

開始・検証HEAD: `dd89629ffdfee23742b4f347fef6c538e9ea4da2`

branch: `codex/b1d2-unit-f`

## Scope and safety boundary

統合waveの対象だったM04 / M05 / M03 / M06A / M08 / M13 / M17 / M24 / M25をcase単位で照合した。M22は明示どおり対象外であり、AASA outageやdeliberate failureは実行していない。

Magic Link、メールアドレス、callback URL、code、token、state、nonce、transaction、PKCE verifier、Keychain本文、raw user ID、device identifierは記録していない。source/test、Supabase、Vercel、Apple、production、DB fixture、service role、SQL Editor、admin clientは変更・使用していない。

## Preflight

| Check | Result |
|---|---|
| workspace root | `/Users/karasawatakahiro/Developer/native-minute` — PASS |
| branch | `codex/b1d2-unit-f` — PASS |
| local HEAD | expected `dd89629ffdfee23742b4f347fef6c538e9ea4da2` — PASS |
| remote HEAD | local HEADと一致 — PASS |
| initial working tree | clean — PASS |
| `npm run check:workspace` | PASS |

## Device and signed artifact

| Evidence | Result |
|---|---|
| device | iPhone 14 Plus |
| OS | iOS 26.2.1 |
| connection | paired / available |
| bundle | `com.nativeminutes.app.staging` |
| profile | Staging / local bundle |
| Associated Domain | exact staging host 1件 |
| `authConfigured` | `true` |
| signed build / strict codesign | PASS |
| install / launch | current HEAD相当buildをupdate installしPASS |

最初のwave用artifactはtask開始時のlocal public pairを誤って流用し、auth endpointへ到達できなかった。これはrepo source defectではない。過去のUnit F signed staging artifactに埋め込まれた既存のpublic staging pairを、値を表示・保存せずcurrent HEAD buildへ一時注入し直した。auth health 200、`authConfigured=true`、signed artifact、update installを再確認してからcase evidenceを取得した。public pair、project ref、失敗時のhostは文書へ残していない。

## Case reconciliation

| Case | Final status | Provenance | Secret-free observed outcome / exact gap |
|---|---|---|---|
| M04 | `IMPLEMENTED_LIVE_READY_PENDING_ACTUAL_DEVICE` | `LIVE_EDGE` + `REPO_DIRECT_EVIDENCE` | wave時点のlive 404は、後続承認でverified deploymentを固定staging aliasへpromoteして解消。fixed URLで303、query-free recovery、空body、no cookie、privacy headers、非PRERENDERをPASS。app-not-installed actual tapは未実施で、platform raw-query loggingは`UNKNOWN`のまま |
| M05 | `READY_PENDING_ACTUAL_DEVICE_AFTER_M04` | `LIVE_EDGE` + `REPO_DIRECT_EVIDENCE` | M04のlive fallback prerequisiteは後続promoteで解消。Link A fallback後のinstall / fresh Link Bというactual-device sequenceはまだ開始しておらず、Link A再利用も行っていない |
| M03 | `PASS_ACTUAL_DEVICE_FOREGROUND_DELIVERY` | `ACTUAL_DEVICE` + contemporaneous human observation + corroborating repo implementation | signed staging appの`/LOGIN`をforegroundにした状態からfresh linkを1回開き、`/SCRIPTS`が1回だけ表示された。duplicate UI/navigation、crash、追加tapなし |
| M06A | `PASS_ACTUAL_DEVICE_CONSUMED_LINK_RETAP` | `ACTUAL_DEVICE` + contemporaneous human observation + corroborating replay guard | M03で正常消費した同じlinkをapp processを終了せず1回だけ再tapし、既存`/SCRIPTS` sessionを維持した。新しいnavigation、visible session replacement、crashなし。exchange最大1回の内部contractは既存repo proofをcorroborating evidenceとし、actual UI観測だけからnetwork countを捏造しない |
| M08 | `PENDING_EXTERNAL_EXPIRY_WINDOW` | `UNKNOWN` + existing repo pending-expiry proof | provider TTLを変更・偽装せず、dedicatedな未消費expired staging linkを確保できなかった。M13用linkやconsumed linkは流用していない |
| M13 | `PASS_ACTUAL_DEVICE_OFFLINE_BEFORE_TAP` | `CONTROLLED_NETWORK` + `ACTUAL_DEVICE` + contemporaneous human observation | fresh linkをtapする前に機内モードONかつWi-Fi OFFを確認した。tapはSafariのoffline failureとなり、crash、false authentication、`/SCRIPTS`遷移なし。network復旧後も`/LOGIN`を維持し、同じlinkは再利用していない。fresh recovery requestはsafe rate-limit UIで抑止され、成功扱いにしていない |
| M17 | `PENDING_CONTROLLED_REFRESH_TRIGGER` | `CORROBORATING_REPO_EVIDENCE` + actual condition `UNKNOWN` | retryable refresh failure時のauthenticated state / Keychain candidate保持とsingle-flightはrepo proof済みだが、このwaveではfresh sessionを安全にrefresh条件へ到達させられなかった。device clock、provider TTL、token、external configは操作していない |
| M24 | `PENDING_PREREQUISITE_WEB_STAGING_AUTH` | `REPO_DIRECT_EVIDENCE` + `ACTUAL_STAGING` prerequisite observation | mobile `/SCRIPTS`はread-onlyで、current User Aにowned scriptがないことは正常。Webの通常User A authからowned scriptを作るのが正しいprerequisiteだが、Web cookie sessionを作れないため未実行。別userのresource探索、人工fixture、service-role/admin bypassは行っていない |
| M25 | `PENDING_PREREQUISITE_WEB_STAGING_AUTH` | `ACTUAL_STAGING` + `ACTUAL_DEVICE` + corroborating repo implementation | Web Magic Linkはstaging Web callbackへ戻らずlocalhostへ到達し、Web cookie sessionが成立しなかった。mobile Bearer/Keychain sessionがその失敗で破壊されず`/SCRIPTS`を維持したことは確認したが、Web/mobile両sessionの同時成立がないためPASSにしない |

## Evidence interpretation

- M03 / M06A / M13だけを、このwaveのactual-device / controlled-network evidenceで閉じる。
- M04 / M05のwave時点のlive deployment prerequisiteは、後続のverified deployment promoteとfixed-domain proofで解消した。actual-device proofとは混同せず、両caseを最終PASSにしない。
- M08はreal provider expiryが未成立であり、repo TTL testをactual provider proofへ昇格しない。
- M17はrepo retryable-refresh contractをactual outage proofへ昇格しない。
- M24 / M25はWeb cookie sessionが共通prerequisiteである。後続read-only Dashboard確認で未記録のmobile query wildcard redirectが見つかったため、Web callback追加前にcurrent allowlistのHuman reconciliationを必要とする。

## Defects and prerequisite gaps

1. `STAGING_FALLBACK_DEPLOYMENT_GAP`: `RESOLVED`。verified deployment `dpl_C2evjjuZi35mHMp1sNdaejXJPdui`をfixed staging aliasへpromoteし、live callback 303 / recovery 200 / exact AASAをPASS。
2. `WEB_STAGING_AUTH_PREREQUISITE`: Web sign-in emailの戻り先がlocalhostとなり、staging Web cookie sessionを確立できない。current allowlistにはlast-knownにないmobile query wildcardがあり、Web callback追加をSTOPした。
3. `EXTERNAL_AUTH_EMAIL_RATE_LIMIT`: M13 recovery用fresh requestが固定safe rate-limit UIで抑止された。古いlinkの再利用や連打は行っていない。

sourceまたはauth/security architectureは変更していない。1の後続解消と2のread-only STOP詳細は[staging prerequisite remediation result](./b1d2a-staging-prerequisite-remediation-result.md)を正とする。

## Remaining B1D2A cases

B1D2Aは`OPEN`で、残件は10件から7件へ減った。

| Priority | Cases | Minimum next proof |
|---|---|---|
| P0 | M04 / M05 | live prerequisite解消済み。別承認後、app-not-installed fallback → install → fresh linkのexact actual-device sequence |
| P0 | M24 / M25 | unexpected mobile query wildcardをHuman reconciliationし、current allowlistを正本化してからWeb callback追加可否を再判定 |
| P1 | M08 | real provider TTLを確認し、dedicatedな未消費linkが実際にexpiredになった後だけactual proof |
| P1 | M17 | token/TTL/configを偽装せず、authenticated sessionが実際にrefresh条件へ入るcontrolled outage / recovery window |
| P2 | M22 | separately approved AASA outage/cache fail-safe wave |

## Validation performed during the wave

- `npm run check:workspace`: PASS
- `npm run mobile:sync:ios:staging`: PASS with values not logged or persisted
- mobile source/test typecheck invoked by staging build: PASS
- `npm run check:mobile-release:staging`: PASS
- signed device `xcodebuild`: PASS
- strict `codesign` / bundle / exact Associated Domain / `authConfigured=true`: PASS
- live AASA: present with exact staging app/path
- live callback / recovery: HTTP 404 prerequisite gap confirmed
- source/test changes: none

- final `npm run check:workspace`: PASS
- `git diff --check`: PASS
- repo内docs validator: existing scriptなし
- final changed paths: READMEとB1D2A関連docsのみ。source/test変更なし

commit、push、clean statusはGit historyと実行報告で記録する。

## Next single action

current Supabase allowlistに存在する未記録のmobile query wildcardをHuman Decisionでreconcileする。M04/M05 actual-device、M24/M25 actual proof、M22、Web callback追加、B1D2B、Gate 2へ自動で進まない。

## Later prerequisite reconciliation — current status

The next action above was completed under Human Decision `HDC_B1D2A_REDIRECT_ALLOWLIST_RECONCILIATION_AND_WEB_CALLBACK_V1`. Human-provided historical Unit E evidence established that the existing mobile query entry was intentional and required for query-bearing mobile `redirectTo`; it is retained as `AUTHORIZED_EXISTING_MOBILE_QUERY_REDIRECT`. The exact Web callback `https://native-minute-staging.vercel.app/auth/callback?next=%2Fscripts` was then added as the only new Redirect URL. Post-check confirmed the existing three entries unchanged, four entries total, and unchanged Site URL/default templates/Custom SMTP.

Remediation B is now `WEB_STAGING_AUTH_CONFIGURATION_PREREQUISITE_RESOLVED_CONFIG_ONLY`. M24 is `READY_PENDING_WEB_COOKIE_AND_USER_AB_ACTUAL_PROOF`; M25 is `READY_PENDING_WEB_COOKIE_MOBILE_BEARER_COEXISTENCE_PROOF`. Neither case is PASS, no Magic Link or actual functional proof ran, and the remaining B1D2A case count stays seven. The next single action is a separately approved combined M24/M25 actual-proof wave after the rate limit clears naturally.
