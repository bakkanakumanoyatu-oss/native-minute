# B1D2A final closeout audit result

Mode: `B1D2A_FINAL_CLOSEOUT_AUDIT_V1`

- status: `CLOSED_COMMITTED_PASS`
- closedAt: `2026-08-12T20:29:29+09:00`
- audited baseline: `803471004853fe6d73be5d3e6e26e963a027f467`
- branch: `codex/b1d2-unit-f`
- original B1D2: `REBASELINED_SPLIT`
- B1D2B: `OPEN — APP_STORE_RELEASE_BLOCKER`
- B1D2C: `DEFERRED_WITH_OWNER_AND_REVIEW_GATE`

## Scope and decision

The audit covers only the rebaselined B1D2A staging-auth core: the staging portions of D1-D9 and D13, all of D15, and M01-M20, M22, M24, and M25. It does not close original B1D2, B1D2B, or B1D2C. It did not add a case, run a new actual-device test, send a Magic Link, change source/config, start B1D2B, or start Gate 2.

All B1D2A case statuses are PASS-class, their provenance is traceable, current staging/live guards pass, and no B1D2A P0/P1 remains. B1D2A is therefore closed as `CLOSED_COMMITTED_PASS`.

## D-side closeout

| A-side DoD | Final status | Consolidated evidence |
|---|---|---|
| D1 | `PASS_AT_CLOSEOUT` | Unit A/C/E identity, exact staging owner/project mapping, and current artifact target evidence |
| D2 | `PASS_AT_CLOSEOUT` | Debug isolation and exact staging HTTPS callback guards |
| D3 | `PASS_AT_CLOSEOUT` | exact source/signed staging entitlement and fixed Associated Domain |
| D4 | `PASS_AT_CLOSEOUT` | warm/cold/foreground ingress and minimal native forwarding across M01-M03 |
| D5 | `PASS_AT_CLOSEOUT` | exact origin/CDN AASA, actual routing, fallback, and controlled association-unavailable evidence |
| D6 | `PASS_AT_CLOSEOUT` | exact staging Supabase mapping, dynamic callback binding, and same-device PKCE |
| D7 | `PASS_AT_CLOSEOUT` | every B1D2A M case is PASS-class; remaining case count is 0 |
| D8 | `PASS_ACTUAL_STAGING_USER_AB_ISOLATION` | normal User A Web resource, Mobile A visibility, Mobile B non-visibility, owner filter/RLS corroboration |
| D9 | `PASS_AT_CLOSEOUT` | negative, timeout, fallback, offline, replay, AASA-unavailable, and refresh-recovery cases |
| D13 | `PASS_AT_CLOSEOUT` | release/auth guards, self-tests, 14 files / 145 mobile tests, typecheck, lint, and build |
| D15 | `PASS_AT_CLOSEOUT` | B1D1 Keychain/PKCE/replay/refresh/logout/Bearer-only contracts remain unchanged |

## Case-level status and provenance

The provenance column names only evidence actually present. `REPO_DIRECT_EVIDENCE` and `FOCUSED_REPO_PROOF` are not actual-device claims. `HUMAN_SAFE_EVIDENCE` retains its Human-provided historical provenance.

| Case | Canonical final status | Evidence provenance |
|---|---|---|
| M01 | `PASS_ACCEPTED_HUMAN_SAFE_EVIDENCE` | `HUMAN_SAFE_EVIDENCE`; unchanged implementation/tests corroborate feasibility |
| M02 | `PASS_AT_CHECKPOINT` | `ACTUAL_DEVICE + LIVE_STAGING` |
| M03 | `PASS_ACTUAL_DEVICE_FOREGROUND_DELIVERY` | `ACTUAL_DEVICE + LIVE_STAGING` |
| M04 | `PASS_ACTUAL_DEVICE_SAFE_SAFARI_FALLBACK` | `ACTUAL_DEVICE + LIVE_STAGING`; focused repo fallback proof corroborates |
| M05 | `PASS_ACTUAL_DEVICE_FRESH_LINK_AFTER_INSTALL` | `ACTUAL_DEVICE + LIVE_STAGING`; release guard and repo implementation corroborate |
| M06A | `PASS_ACTUAL_DEVICE_CONSUMED_LINK_RETAP` | `ACTUAL_DEVICE`; replay guard is corroborating repo evidence |
| M06B | `PASS_EXISTING_TEST_REEXECUTION` | `REPO_DIRECT_EVIDENCE` |
| M07 | `PASS_EXISTING_TEST_REEXECUTION` | `REPO_DIRECT_EVIDENCE` |
| M08 | `PASS_ACTUAL_DEVICE_EXPIRED_PROVIDER_LINK` | `ACTUAL_DEVICE + LIVE_STAGING_AUTH + NATURAL_PROVIDER_EXPIRY` |
| M09 | `PASS_EXISTING_TEST_REEXECUTION` | `REPO_DIRECT_EVIDENCE` |
| M10 | `PASS_FOCUSED_REPO_PROOF` | `FOCUSED_REPO_PROOF` |
| M11 | `PASS_FOCUSED_REPO_PROOF` | `FOCUSED_REPO_PROOF` |
| M12 | `PASS_EXISTING_TEST_REEXECUTION` | `REPO_DIRECT_EVIDENCE` |
| M13 | `PASS_ACTUAL_DEVICE_OFFLINE_BEFORE_TAP` | `ACTUAL_DEVICE + CONTROLLED_NETWORK` |
| M14 | `PASS_FOCUSED_REPO_FAULT_PROOF` | `FOCUSED_REPO_PROOF` |
| M15 | `PASS_AT_CHECKPOINT` | `ACTUAL_DEVICE + LIVE_STAGING` |
| M16 | `PASS_EXISTING_TEST_REEXECUTION` | `REPO_DIRECT_EVIDENCE` |
| M17 | `PASS_ACTUAL_DEVICE_TRANSIENT_REFRESH_RECOVERY` | `ACTUAL_DEVICE + CONTROLLED_NETWORK + NATURAL_SESSION_REFRESH_TRIGGER` |
| M18 | `PASS_EXISTING_TEST_REEXECUTION` | `REPO_DIRECT_EVIDENCE` |
| M19 | `PASS_ACCEPTED_HUMAN_SAFE_EVIDENCE` | `HUMAN_SAFE_EVIDENCE`; logout implementation/tests corroborate |
| M20 | `PASS_ACCEPTED_HUMAN_SAFE_EVIDENCE` | `HUMAN_SAFE_EVIDENCE`; secure deletion/restore implementation/tests corroborate |
| M22 | `PASS_CONTROLLED_ISOLATED_AD_REAL_FAILURE_PROOF` | `CONTROLLED_ISOLATED_ASSOCIATED_DOMAIN_FAILURE + ACTUAL_DEVICE + DEVELOPMENT_MODE` |
| M24 | `PASS_ACTUAL_STAGING_USER_AB_ISOLATION` | `ACTUAL_DEVICE + LIVE_STAGING`; owner filter/RLS is corroborating repo evidence |
| M25 | `PASS_LIVE_WEB_COOKIE_MOBILE_BEARER_COEXISTENCE` | `ACTUAL_DEVICE + LIVE_STAGING` |

Case-level totals: PASS-class `24`, OPEN `0`, PENDING `0`, UNKNOWN `0`.

## Provenance constraints

- M01/M19/M20 are accepted Human-provided historical safe evidence. There is no repo-native actual-device PASS result, the cases were not rerun during reconciliation or this audit, and unknown exact timestamps/build identifiers were not invented.
- M08 used one real staging-provider link, the unchanged 3600-second policy, natural expiry, and one actual-device post-expiry tap.
- M17 used the natural session-refresh window and a controlled device-network outage; no TTL, clock, token, or Keychain manipulation was used.
- M22 was an isolated Preview/development-mode proof. It was not a fixed-staging or production outage. Protection, app, branch, deployment, and Associated Domains state were recovered before the case was closed.
- M24/M25 used a resource created through the normal authenticated User A Web UI. No service role, SQL fixture, admin API/client, direct DB insert, RLS bypass, artificial fixture, or production data was used.

## Current staging Auth target

Current normal Staging evidence remains aligned to `native-minute-staging`:

- profile `staging`, Xcode configuration `Staging`, bundle `com.nativeminutes.app.staging`
- fixed Associated Domain and fixed staging BFF/callback contract
- generated artifact metadata has `authConfigured=true`
- generated runtime contains the exact expected staging project identity and not the previously mismatched project
- no `service_role`, `sb_secret_`, or legacy-secret client credential marker was found

The M22 recovery-build mismatch was a temporary build-time env reuse. Tracked source/config did not require a change, and no evidence contradicts or invalidates M24/M25.

## Current live sanity

Read-only closeout checks:

| Surface | Result |
|---|---|
| fixed staging deployment | `dpl_C2evjjuZi35mHMp1sNdaejXJPdui`, `READY` |
| fixed staging AASA | HTTP 200, no cookie, exact staging app/path |
| Apple CDN AASA | HTTP 200, no cookie, exact staging app/path |
| `/mobile/auth/callback` | safe HTTP 303 to query-free `/mobile/auth/recovery`, no cookie |
| `/mobile/auth/recovery` | HTTP 200, fixed new-link guidance, no cookie |
| production deployment | `dpl_7FzKMVfgKdYjGWqPpJoFrpbFgruG`, `READY`, unchanged |

## Final guards

All commands passed at closeout:

- `npm run check:workspace`
- `npm run check:mobile-release:staging`
- `npm run check:auth-artifacts`
- `npm run check:mobile-release:self-test`
- `npm run check:auth-artifacts:self-test`
- `npm run mobile:test` — 14 files / 145 tests
- `npm run mobile:typecheck`
- `npm run mobile:lint`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `git diff --check`

The verified runtime source `8bdbaac7e776e84a0e495ee410eba5cb3c460bb4` and the audit baseline differ only in README/docs. No post-evidence source/config change was found.

## Severity and surviving work

- B1D2A P0: `0`
- B1D2A P1: `0`
- B1D2A P2: provider Magic Link 429 handling may later preserve the exact upstream Auth error code instead of collapsing all provider 429 responses into one UI reason. This explicit deferred observability/UX improvement does not alter the proven fail-safe behavior or block B1D2A close.
- platform/production callback-query logging audit remains in B1D2B's production scope; it is not reclassified as a B1D2A P1.
- B1D2B remains `OPEN — APP_STORE_RELEASE_BLOCKER`.
- B1D2C remains `DEFERRED_WITH_OWNER_AND_REVIEW_GATE`.
- production/distribution and M21/M23/M26-M28 were not closed by this audit.
- the 100-template body-writing/translation/editing work remains External Work and was not started.

## Authoritative references

- [B1D2 rebaseline / split decision](./b1d2-release-wide-scope-rebaseline-split.md)
- [B1D2 production mobile auth readiness plan](./b1d2-production-mobile-auth-readiness-plan.md)
- [Unit F safe evidence reconciliation](./b1d2-unit-f-safe-evidence-reconciliation-result.md)
- [remaining repo-only closeout](./b1d2a-remaining-repo-only-evidence-closeout-result.md)
- [P0 negative/timeout wave](./b1d2a-p0-repo-only-negative-timeout-wave-result.md)
- [consolidated actual-device/network wave](./b1d2a-consolidated-actual-device-network-wave-result.md)
- [M04/M05 actual-device result](./b1d2a-m04-m05-actual-device-fallback-closeout-result.md)
- [M08 natural-expiry result](./b1d2a-m08-real-provider-natural-expiry-proof-result.md)
- [M17 natural-refresh result](./b1d2a-m17-final-natural-refresh-proof-result.md)
- [M22 isolated association-failure result](./b1d2a-m22-clean-install-actual-behavior-proof-result.md)
- [M24/M25 combined actual proof](./b1d2a-m24-m25-combined-actual-proof-result.md)

The next single action is a separately authorized B1D2B release-readiness planning/execution decision. Gate 2 is not started by this closeout.
