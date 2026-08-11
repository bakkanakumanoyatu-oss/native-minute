# B1D2A P0 repo-only negative / timeout wave result

Status: `PASS — M10/M11/M14 REPO-ONLY PROOF COMPLETE`

- Mode: `B1D2A_P0_REPO_ONLY_NEGATIVE_TIMEOUT_WAVE_V1`
- Date: 2026-08-11
- Start branch: `codex/b1d2-unit-f`
- Start HEAD / remote: `11423d514de48213268a147bc461b9d35ff917f3`
- Scope: M10, M11, and M14 only
- Actual-device / Simulator / Magic Link / provider-live / external-service action: none
- DB / migration / Keychain envelope / Bearer BFF / dependency change: none

All three cases are repo-generated focused proof. They are not actual-device evidence.

## M10 — wrong nonce / transaction

`parseMobileAuthCallback()` requires `code`, `transaction_id`, `state`, and `nonce`. After parsing, `beginPendingPkceExchange()` compares the callback transaction ID, state, nonce, and exact redirect URI with the persisted pending PKCE envelope before setting `exchangeStartedAt` and before provider exchange.

The existing implementation was already correct. A table-driven service test now changes nonce and transaction ID independently and proves for each case:

- fixed `auth_callback_state_mismatch`
- provider exchange invocation remains zero
- no session/Keychain-session mutation
- the valid pending transaction remains unconsumed

Final status: `PASS_FOCUSED_REPO_PROOF`.

## M11 — missing required parameters

The current parser/schema and the original plan agree that the required callback parameters are exactly `code`, `transaction_id`, `state`, and `nonce`. No new required field or semantic was added. Existing parser tests already covered duplicate/extra parameters, fragment, userinfo, and wrong target.

A table-driven service test now removes each required parameter independently and proves:

- fixed `auth_callback_invalid`
- provider exchange invocation remains zero
- no session/Keychain-session mutation
- the pending transaction remains unconsumed
- the returned result contains no callback URL, parameter value, provider detail, or secret material

Final status: `PASS_FOCUSED_REPO_PROOF`.

## M14 — bounded provider exchange timeout

The prior implementation persisted `exchangeStartedAt` before provider exchange but awaited `exchangeCodeForSession()` without a timeout. Classification was therefore “timeout boundary absent; minimum source change required.”

The minimum implementation uses the already-persisted pending PKCE `expiresAt` as the exchange deadline. It does not introduce a new fixed product timeout value. `MobileAuthService` creates an `AbortSignal` for the remaining persisted pending lifetime, and the production Supabase adapter forwards that signal only to the active exchange fetch.

On timeout/abort:

- the existing fixed `auth_exchange_failed` recovery state is used with `restartRequired: true`
- the existing UI copy requires a new authentication link and exposes no raw provider detail
- session and pending PKCE material are cleared
- the in-memory replay guard marks the callback consumed
- the same callback is rejected as `auth_callback_duplicate`
- provider exchange invocation remains exactly one

The PKCE/state/nonce/transaction comparison, persistent pre-exchange mark, Keychain envelope, and provider/API response contract are unchanged.

Final status: `PASS_FOCUSED_REPO_FAULT_PROOF`.

## Focused proof

```text
npm run test --workspace @native-minute/mobile -- src/auth/mobile-auth.test.ts src/auth/callback.test.ts src/auth/session-store.test.ts src/auth/state-machine.test.ts src/auth/supabase-storage.test.ts src/App.test.tsx
```

Result: 6 files passed, 81 tests passed, 0 failed.

## Validation

- mobile source/test typecheck: PASS
- mobile lint: PASS
- root `npm run typecheck`: PASS
- root `npm run lint`: PASS
- root `npm run build`: PASS
- staging mobile build: PASS
- `npm run check:workspace`: PASS at preflight
- `git diff --check`: PASS before documentation synchronization; rerun at closeout

## Remaining B1D2A cases

B1D2A remains `OPEN`, with 10 cases:

- source + later device: M04, M05
- actual-device: M03, M06A, M08, M24, M25
- network/failure condition: M13, M17, M22

No `UNKNOWN` repo-proof case remains. B1D2B and Gate 2 were not started.

## Next single execution wave

After separate approval, execute only M04/M05 safe Safari fallback implementation and its explicitly authorized proof wave. Do not automatically begin source work, Magic Link delivery, device operation, B1D2B, or Gate 2 from this result.
