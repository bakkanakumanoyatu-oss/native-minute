# B1D2 Unit F — M01 / M19 / M20 safe evidence reconciliation result

Status: `PASS — HUMAN SAFE EVIDENCE ACCEPTED; NO ACTUAL-DEVICE RETEST`

- reconciliation date: 2026-08-11
- branch at reconciliation start: `codex/b1d2-unit-f`
- reconciliation start HEAD: `a3c8cf018510514166fa5ced5518e2205c50538b`
- implementation evidence checkpoint: `fb011b9c740a98a9cff267d078f9ac7d80f00dd7`
- accepted device / OS provenance: Human-provided — iPhone 14 Plus / iOS 26.2.1
- exact execution timestamp: `UNKNOWN`
- exact tested build identifier / commit: `UNKNOWN`

## Scope and evidence policy

This was a docs-only reconciliation of existing evidence for M01, M19, and M20. No Magic Link was sent, no iPhone or Simulator was operated, no actual-device test was rerun, and no provider, Apple, Supabase, Vercel, production, source, test, or migration change was made.

`PASS_ACCEPTED_HUMAN_SAFE_EVIDENCE` means that the Human-provided historical observation is accepted with its provenance intact because the repository and Git history corroborate technical feasibility and contain no contradictory result. It is not `REPO_DIRECT_EVIDENCE`, and it does not mean the case was executed during this reconciliation.

## Evidence sources inspected

- `AGENTS.md`, `README.md`, `docs/current-state.md`
- B1D1 result and Unit A/C/D1/E result documents
- B1D2 production mobile auth plan and release-wide rebaseline / split decision
- all tracked Unit F references, docs, outputs, and logs; no Unit F5 result or tracked Unit F5 runtime log existed at the reconciliation start
- Unit F-related Git history before, at, and after `fb011b9`, including the earlier mobile auth, Keychain hardening, lifecycle test, staging callback, and native Universal Link forwarding commits
- current and `fb011b9` versions of the native ingress, lifecycle plugin, mobile auth/session store, UI state, and related tests

The relevant auth and native-ingress source blobs are unchanged between `fb011b9` and the reconciliation start HEAD. The repository therefore corroborates capability at the evidence checkpoint without identifying the exact historical device build.

## Provenance matrix

| Evidence class | M01 — cold authentication | M19 — logout | M20 — logout then restart |
|---|---|---|---|
| A. `REPO_DIRECT_EVIDENCE` | No repo-native actual-device PASS. Unit F4 is direct historical evidence that cold was outside that run's scope. | No repo-native actual-device PASS. Unit F4 is direct historical evidence that logout was outside that run's scope. | No repo-native actual-device PASS. Unit F4 is direct historical evidence that logout was outside that run's scope. |
| B. `HUMAN_PROVIDED_SAFE_EVIDENCE` | On iPhone 14 Plus / iOS 26.2.1: new Magic Link, Native Minute Staging fully terminated, latest link tapped once, cold launch, launch URL / `lastURL`, JS callback, state / nonce / transaction validation, PKCE, Supabase session exchange, Keychain save, `/SCRIPTS`, and Bearer BFF all passed. Subsequent terminate/relaunch restored the Keychain session without callback re-consumption. | On the same Human-provided device / OS: logout returned to login UI; after terminate/relaunch the app remained unauthenticated and did not restore the old authenticated session. | On the same Human-provided device / OS: after logout and terminate/relaunch, the app remained unauthenticated and did not restore the old session. |
| C. `CORROBORATING_IMPLEMENTATION_EVIDENCE` | At `fb011b9`, `AppDelegate` forwards Universal Links to Capacitor; Capacitor records `lastURL`; the repo lifecycle plugin exposes the launch URL; `MobileAuthService.start()` registers listeners before consuming it through the same callback handler. Existing tests cover exact HTTPS cold/warm paths, retained pre-listener delivery, one exchange for launch URL plus retained event, target/binding validation, PKCE exchange, session persistence, and restart restore. Unit F4 directly corroborates the same post-fix staging binding, PKCE, Keychain, `/SCRIPTS`, Bearer BFF, and restore chain on the warm path. | `MobileAuthService.signOut()` serializes in-flight auth work, requests provider-local sign-out, and always clears pending PKCE and the Keychain session before transitioning to signed out. Tests cover local clear, refresh/login draining, and safe failure classification. B1D1 signed-Simulator logout is corroborating evidence only, not M19 direct evidence. | Native session clear uses `SecItemDelete`; startup loads secure state and transitions to unauthenticated when no stored session exists. Tests cover local clear and empty restore. B1D1 signed-Simulator logout-after-restart is corroborating evidence only, not M20 direct evidence. |
| D. `CONTRADICTING_EVIDENCE` | None found. The pre-fix warm ingress failure was fixed by `fb011b9`; the Unit F4 “cold not performed” statement records that run's boundary rather than a failed cold result. | None found. The Unit F4 “logout not performed” statement records that run's boundary rather than a failed logout result. | None found. The Unit F4 “logout not performed” statement records that run's boundary rather than a failed restart result. |
| E. `UNKNOWN` | Exact execution timestamp, exact tested build number/commit, and repo-native raw runtime log/result. | Exact execution timestamp, exact tested build number/commit, provider-call outcome detail, and repo-native raw runtime log/result. | Exact execution timestamp, exact tested build number/commit, and repo-native raw runtime log/result. |

## Case decisions

| Case | Final status | Provenance |
|---|---|---|
| M01 | `PASS_ACCEPTED_HUMAN_SAFE_EVIDENCE` | Human-provided historical actual-device evidence, corroborated by unchanged `fb011b9` implementation/tests; not repo-direct and not rerun now |
| M19 | `PASS_ACCEPTED_HUMAN_SAFE_EVIDENCE` | Human-provided historical actual-device evidence, corroborated by logout implementation/tests; not repo-direct and not rerun now |
| M20 | `PASS_ACCEPTED_HUMAN_SAFE_EVIDENCE` | Human-provided historical actual-device evidence, corroborated by secure deletion/startup restore implementation/tests; not repo-direct and not rerun now |

No additional Human Decision is required for these three acceptances: the current Human instruction explicitly authorizes acceptance under the provenance, consistency, and no-contradiction conditions, and the B1D2A rebaseline policy already permits safe existing evidence to prevent mechanical retesting.

This closes only the M01, M19, and M20 evidence gaps. It does not close B1D2A, begin another B1D2A case, begin B1D2B, or begin Gate 2.
