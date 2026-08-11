# B1D2A remaining repo-only evidence closeout result

## Result

- Mode: `B1D2A_REMAINING_REPO_ONLY_EVIDENCE_CLOSEOUT_BATCH_V1`
- Date: 2026-08-11
- Start branch: `codex/b1d2-unit-f`
- Start HEAD / remote: `90f3eb89a185abb021ba470eac690ae52b5c165b`
- Scope: the 19 remaining B1D2A cases only
- Result: `PARTIAL_CLOSEOUT — 6 PASS_EXISTING_TEST_REEXECUTION / 13 OPEN_OR_UNKNOWN`
- Source changes: none
- Test additions or modifications: none
- Actual-device / Simulator / Magic Link / provider / network / external-service actions: none

M01 / M02 / M15 / M19 / M20 were already closed before this batch and were not re-audited beyond checking for contradictions. No contradiction was found. In particular, this result does not change the Human-provided provenance of M01 / M19 / M20 and does not call it repo-direct evidence.

## Evidence policy used

| Class | Meaning in this result |
|---|---|
| A | `PASS_EXISTING_REPO_EVIDENCE`: exact, already-recorded repo evidence is sufficient without reexecution |
| B | `PASS_EXISTING_TEST_REEXECUTION`: existing focused tests were reexecuted and are sufficient together with the unchanged implementation/contract |
| C | `OPEN_NEEDS_SOURCE_IMPLEMENTATION`: an implementation prerequisite is absent |
| D | `OPEN_NEEDS_ACTUAL_DEVICE`: deterministic repo evidence is corroborating but the case-specific physical-device observation is absent |
| E | `OPEN_NEEDS_NETWORK_OR_FAILURE_CONDITION`: a controlled failure condition and recovery/fail-safe observation is absent |
| F | `OPEN_NEEDS_EXTERNAL_SERVICE_ACTION`: an external-service-only action is the first missing proof |
| G | `OPEN_NEEDS_HUMAN_DECISION`: current governance does not permit acceptance without a decision |
| H | `UNKNOWN`: implementation is compatible, but exact case-level proof is incomplete and no PASS is inferred |

Class A, F, and G contain no cases in this batch. Class B cases are repo-generated test evidence from this run; they are not actual-device evidence.

## Evidence sources inspected

- Governance/current status: `AGENTS.md`, `README.md`, `docs/current-state.md`, `docs/b1d2-release-wide-scope-rebaseline-split.md`, `docs/b1d2-production-mobile-auth-readiness-plan.md`
- Earlier results: B1D1 and Unit A / C / D1 / D2 / E / F3 / F4 result material, plus `docs/b1d2-unit-f-safe-evidence-reconciliation-result.md`
- Unit F history: Unit F-related tracked docs, outputs/log inventory, tests, and Git history around `fb011b9`
- Callback/auth source: `apps/mobile/src/auth/callback.ts`, `session-store.ts`, `mobile-auth.ts`, `App.tsx`, environment/profile/iOS release-staging configuration
- Focused tests: callback parser/replay, pending PKCE store, mobile auth lifecycle, app scripts refresh behavior, and native configuration guards
- BFF/isolation/coexistence corroboration: mobile scripts route tests and Web/mobile session coexistence contract tests

There is no tracked repo-native runtime result/log that fills the remaining actual-device or controlled-network gaps. The auth ingress/source surface from `fb011b9` through the start HEAD has no related source diff.

## Focused test reexecution

Command:

```text
npm run test --workspace @native-minute/mobile -- src/auth/callback.test.ts src/auth/session-store.test.ts src/auth/mobile-auth.test.ts src/App.test.tsx tests/auth-native-config.test.ts
```

Result: 5 files passed, 75 tests passed, 0 failed.

This was the only test execution in the evidence-classification phase. It reused existing tests unchanged.

## Case-by-case classification

| Case | Class / final status | Existing evidence and boundary | Exact next proof/action if still open |
|---|---|---|---|
| M03 | D — `OPEN_NEEDS_ACTUAL_DEVICE` | Unit F4 proves warm background handoff, and repo lifecycle tests prove callback delivery, but neither proves the distinct installed-app foreground UI/no-duplicate-navigation observation. | On a separately approved run, tap one fresh staging link while the installed app is already foreground and record one successful navigation with no duplicate UI/navigation. |
| M04 | C — `OPEN_NEEDS_SOURCE_IMPLEMENTATION` | The exact `/mobile/auth/callback` AASA target/config exists, but no Web route/page exists at that path. The planned privacy-safe Safari fallback therefore cannot be served. | Implement the fixed safe fallback route/page with no exchange, query rendering, analytics/referrer forwarding, or arbitrary redirect, then verify its exact response/privacy contract. |
| M05 | C — `OPEN_NEEDS_SOURCE_IMPLEMENTATION` | The missing M04 fallback also means there is no repo-owned install-after-fallback/new-link guidance to verify. Reusing the prior provider link is not assumed safe. | Complete the M04 fallback/guidance implementation, then in a separately approved device run install the app and use a newly issued link rather than reusing the fallback link. |
| M06A | D — `OPEN_NEEDS_ACTUAL_DEVICE` | Repo replay guards prove final-callback duplication safety, but they do not prove provider/OS behavior when the same already-consumed email link is tapped again. | In a separately approved run, re-tap one consumed email link and record that no second session is created; app delivery or a duplicate reason is not required. |
| M06B | B — `PASS_EXISTING_TEST_REEXECUTION` | Existing callback guard, persistent `exchangeStartedAt`, state-machine tests, and the reexecuted duplicate callback tests prove that the same final callback exchanges at most once and subsequent delivery is rejected. This is transport-independent dummy-callback behavior. | None. |
| M07 | B — `PASS_EXISTING_TEST_REEXECUTION` | The reexecuted lifecycle race test delivers the same HTTPS callback as both launch URL and retained `appUrlOpen`, reaches one authenticated session, and keeps provider exchange count at one after another event. | None. |
| M08 | D — `OPEN_NEEDS_ACTUAL_DEVICE` | The reexecuted repo test proves pending-PKCE expiry fails closed with `auth_callback_expired`, zero provider exchanges, no session, and cleared pending state. It does not prove an actual expired provider link on iOS. | In a separately approved run, open one genuinely expired staging link and record no session plus fixed retry/new-link guidance. |
| M09 | B — `PASS_EXISTING_TEST_REEXECUTION` | The reexecuted service test changes only `state`, receives `auth_callback_state_mismatch`, and asserts provider exchange count remains zero before a matching callback succeeds once. | None. |
| M10 | H — `UNKNOWN` | `beginPendingPkceExchange` compares transaction ID, state, nonce, and redirect URI before exchange, so the implementation corroborates the expected fail-closed behavior. Existing focused tests exercise state mismatch but not exact nonce and transaction-ID mismatches with a zero-exchange assertion. | Add one focused table-driven repo test covering wrong nonce and wrong transaction ID and assert provider exchange count stays zero. |
| M11 | H — `UNKNOWN` | Existing parser tests reject duplicate/extra params, fragment, and userinfo and return a fixed reason without URL detail. The exact required missing-parameter cases are not explicitly tested, so the complete case is not inferred. | Add one focused parser table for each missing required parameter and assert the same fixed safe reason with no URL detail. |
| M12 | B — `PASS_EXISTING_TEST_REEXECUTION` | Reexecuted exact-target parser/config tests reject HTTP, wrong host/path/port and unsafe target forms. Staging/Release config guards prove the Debug custom scheme is absent, while the production-capable parser is bound to exact HTTPS. | None. |
| M13 | E — `OPEN_NEEDS_NETWORK_OR_FAILURE_CONDITION` | Callback exchange failures are converted to a fixed recoverable state and the pending exchange is not safely reusable, but no controlled offline-before-tap observation proves no crash and the required new-link recovery path. | In a separately approved device run, go offline before one fresh link tap, observe fixed fail-safe behavior/no crash, restore network, and use a new link rather than the same code. |
| M14 | C — `OPEN_NEEDS_SOURCE_IMPLEMENTATION` | The callback is persistently marked started before provider exchange, which blocks same-code replay, but `exchangeCodeForSession` has no repo-owned bounded timeout/abort path. An indefinitely pending provider call cannot satisfy the timeout case. | Implement a bounded exchange timeout that ends in fixed restart/new-link guidance while retaining the consumed/replay barrier, with a focused fault-injection test. |
| M16 | B — `PASS_EXISTING_TEST_REEXECUTION` | Reexecuted tests prove near-expiry refresh and concurrent single-flight refresh. The B1D1 authoritative result records expired-BFF 401 one-refresh/one-retry behavior, and unchanged `App.tsx` performs only one retry gated by `session_expired`. | None. |
| M17 | E — `OPEN_NEEDS_NETWORK_OR_FAILURE_CONDITION` | Reexecuted tests prove a retryable 503 refresh failure preserves the authenticated state and Keychain candidate. They do not prove failure followed by successful recovery/retry, including the required no-token-detail observation. | Add one controlled transient-failure-then-recovery proof, using a focused repo fault sequence or a separately approved device/network run, and record preserved session plus successful retry. |
| M18 | B — `PASS_EXISTING_TEST_REEXECUTION` | The reexecuted invalid-refresh test injects the provider-equivalent 401 result, reaches fixed `auth_session_invalid`, and proves the Keychain session is deleted. External provider revoke itself remains the distinct B1D2B M21 surface and is not claimed here. | None. |
| M22 | E — `OPEN_NEEDS_NETWORK_OR_FAILURE_CONDITION` | Staging/Release have no production custom-scheme fallback, exact Universal Link configuration is guarded, and source is fail-safe. No controlled AASA-unavailable Edge/iOS observation proves Safari-or-unhandled behavior. | In a separately approved controlled failure run, make the AASA delivery path unavailable without adding a custom scheme and record safe Safari/unhandled behavior. |
| M24 | D — `OPEN_NEEDS_ACTUAL_DEVICE` | Route tests prove Bearer authentication, owner filtering, cookie rejection, and no cross-user row return under mocks/contracts. They do not prove staging User A then User B on the physical mobile client against actual RLS/data. | Use two controlled staging users on a separately approved device run and record each Bearer scripts response showing no cross-user data. |
| M25 | D — `OPEN_NEEDS_ACTUAL_DEVICE` | Contract tests prove mobile requests omit cookies and Web sign-out is local scope, but no live combined Web/mobile session sequence proves mutual non-destruction. | In a separately approved combined Web/device run, record Web session continuity across mobile login/logout and mobile session continuity across Web login/logout. |

## Reconciliation totals

| Class | Cases | Count |
|---|---|---:|
| A — existing repo evidence without rerun | none | 0 |
| B — existing focused test reexecution | M06B, M07, M09, M12, M16, M18 | 6 |
| C — source implementation | M04, M05, M14 | 3 |
| D — actual device | M03, M06A, M08, M24, M25 | 5 |
| E — network/failure condition | M13, M17, M22 | 3 |
| F — external-service-only action | none | 0 |
| G — Human Decision | none | 0 |
| H — unknown/exact proof gap | M10, M11 | 2 |

No Human Decision is required to accept the six Class B results under the current repo-evidence policy. The other 13 cases remain open or unknown; no PASS was inferred from compatible source alone.

## Remaining execution waves

These are planning units only. This batch does not authorize or start them.

| Priority / wave | Cases | Goal and required action | Expected evidence | Source/test change | Actual device | External/network action | Estimate |
|---|---|---|---|---|---|---|---|
| P0 / Wave 1 | M10, M11 | Add the two smallest exact negative-test tables described above. | Zero-exchange nonce/transaction mismatch proof; complete missing-parameter fixed-reason proof. | Test: yes; source: no | No | No | 0.25–0.5 day |
| P0 / Wave 2 | M04, M05 | Implement/verify the privacy-safe fallback, then perform one not-installed → install → new-link sequence. | Exact fallback response/privacy contract and one M04/M05 device result using a new link. | Yes | Yes | Yes: staging auth delivery | 0.75–1.25 days |
| P0 / Wave 3 | M14 | Add bounded provider-exchange timeout and focused fault injection. | Fixed timeout reason, replay barrier retained, same code never re-exchanged. | Yes | No | No | 0.25–0.5 day |
| P1 / Wave 4 | M03, M06A, M08 | Batch the remaining foreground/consumed/expired lifecycle observations without reusing unsafe links. | Three case-specific physical-device results with link provenance separated. | No | Yes | Yes: staging auth delivery | 0.5–0.75 day |
| P1 / Wave 5 | M13, M17 | Run controlled offline/transient failure and recovery. | No crash/new-link flow for M13; preserved Keychain and successful later retry for M17. | No initially | Yes | Yes: controlled network/provider condition | 0.5–0.75 day |
| P1 / Wave 6 | M22 | Observe Universal Link behavior while AASA delivery is deliberately unavailable. | No custom-scheme fallback; Safari or safely unhandled result. | No | Yes | Yes: controlled Edge/AASA condition | 0.25–0.5 day plus cache lead time |
| P1 / Wave 7 | M24, M25 | Batch two-user isolation and Web/mobile coexistence with controlled staging identities. | User A/B no-cross-user evidence and bidirectional session coexistence evidence. | No | Yes | Yes: staging auth/Web sessions | 0.5–0.75 day |

Estimated remaining B1D2A effort after this batch: approximately 3–5 person-days, excluding external delivery/cache waiting time and any review iteration. B1D2A remains `OPEN`; B1D2B and Gate 2 were not started.

## Contradictions

No existing result, test, implementation, or inspected Git history contradicts the six accepted Class B results or the five cases already closed before this batch. The open classifications above are evidence/implementation gaps, not observed FAIL results.

## Next single action

After separate approval, execute only **P0 / Wave 1: M10 and M11 exact repo negative-proof completion**. Do not automatically continue to source implementation, Magic Link delivery, device/network execution, B1D2B, or Gate 2.
