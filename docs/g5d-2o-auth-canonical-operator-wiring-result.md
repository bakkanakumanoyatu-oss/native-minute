# G5D-2O Auth canonical operator wiring and fake proof result

Date: 2026-09-03 (Asia/Tokyo)

Status: `G5D_2O_CLOSED_COMMITTED_PASS`

## Accepted focused reviews and closed P1

The independent focused review `G5D_2O_AUTH_CANONICAL_OPERATOR_WIRING_INDEPENDENT_READ_ONLY_FOCUSED_REVIEW` reported P0/P1/P2/correctness UNKNOWN `0/1/1/0`. This correction addresses only its P1: terminal acceptance now requires the persisted safe-integer `auth_verification_attempt_count` to exactly equal the runner `verificationAttemptCount`. A mismatch, invalid value, failed re-fetch, or otherwise unverifiable count cannot become terminal and exposes the count only as `null`. A trusted terminal result returns the persisted exact count, never an unbound runner number.

The independent read-only focused re-review `G5D_2O_AUTH_VERIFICATION_ATTEMPT_AUTHORITY_INDEPENDENT_READ_ONLY_FOCUSED_RE_REVIEW` returned `PASS`, closed the verificationAttemptCount P1, and reported final P0/P1/P2/correctness UNKNOWN `0/0/1/0`. G5D-2O implementation is complete. The remaining P2 for the `auth_terminal_authority_missing` allowlist difference is nonblocking deferred cleanup and is not implemented in this closeout.

Repository/runtime failure after verification begin or an observed Auth GET retains the observed GET/DELETE accounting and `authOutcomeUnknown=1`, while `verificationAttemptCount` remains `null` rather than a false zero. The existing operator-level `auth_terminal_authority_missing` reason is used for terminal re-fetch/count mismatch. The known P2 concerning that reason's durable-runner allowlist entry is intentionally unchanged; the durable runner itself was not modified by this correction.

## Scope and authority

This unit accepts `G5D_POST_2N_AUTH_OPERATOR_NEXT_UNIT_RECONCILIATION_PASS` as the latest authority and wires the already-deployed G5D-2M durable Auth foundation into the canonical one-stage account-deletion operator. Canonical order is now `Provider -> Storage -> Database -> Auth -> future Completion`. G5D-2M's state machine and six RPCs were not reimplemented or changed. Completion remains unavailable and was not implemented.

The canonical entry has exact routing for `status/summary`, Provider, Storage, Database, and Auth. `completion`, future, and unknown stages fail closed. Auth has its own resolver and does not fall back to Storage, Database, or the legacy Auth path. One invocation still executes at most one stage: Database terminal in an invocation makes zero Auth calls, and Auth terminal makes zero Completion calls.

## Persisted resolver and identity authority

The Auth resolver accepts only an exact deletion-request UUID or exact existing `adr_...` authority. It requires exactly one matching persisted row and applies the shared G5D-2M durable classifier. Eligibility requires canonical Provider, Storage, and Database terminal evidence, including their sub-finalized timestamps, exact inventory versions, sealed/scrubbed/lease polarity, `g5d-2h.account-db.v1`, valid safe integer D/A/R counts, the D/A/R equation, terminal polarity, and empty protected metadata. A caller's prior-stage flag cannot substitute for persisted authority.

The shared classifier covers no-intent runnable, generation-0 intent, generation-1 recovery, valid manual nonterminal, and already-sub-finalized terminal replay. Malformed prior-stage or Auth authority stops before the durable runner and external adapter.

The Auth-only internal authority is stage-aware: `deletionRequestId` is required and `expectedUserId` is optional. Before an intent exists, the service re-fetches the request and derives the expected user only from persisted `request.user_id`. Existing intents, generation-1 recovery, manual state, and owner-null terminal replay do not require or expose the deleted user ID. The durable target is never emitted. Exact request/opaque lookup ambiguity and a pre-owner-null caller/request owner mismatch fail closed before Auth GET/DELETE.

## Exactly-one durable boundary

After the outer operator guard, Auth service guard, exact request validation, and persisted eligibility re-fetch pass, the service constructs or accepts the Auth adapter and invokes `runAccountDeletionAuthDurableStep` exactly once. The service and bridge add no GET-first loop, CAS, durable RPC orchestration, sub-finalizer, retry, or second state machine. Adapter observation enforces at most two GETs and one DELETE while preserving a dispatch count before any thrown error or response loss can become a false zero.

The existing runner remains the only destructive-recovery authority. Generation `1` recovery is GET-first and never redispatches DELETE. An observed or exact-not-found DELETE response is not terminal and still requires the runner's subsequent strict GET verification.

## Production SDK adapter and bounded transport

The production factory uses the locked installed `@supabase/supabase-js@2.99.3` / `@supabase/auth-js@2.99.3` surface and the existing canonical Supabase URL/service-role credential getters. It calls only `admin.auth.admin.getUserById(target)` and `admin.auth.admin.deleteUser(target)`. Construction is deferred until both destructive guards and persisted Auth eligibility have passed. The legacy Auth mutation client is not reused, credentials are not returned, and Provider/Storage/Database clients are unaffected.

The Auth-specific fetch seam defaults to `10_000ms`, creates one `AbortController` per request, safely forwards an existing request signal, aborts the actual fetch, removes the listener, and clears the timer in `finally`. It uses no `Promise.race` and introduces no retry. An abort/timeout becomes the fixed timeout category; other proven transport failures become network error. A DELETE timeout retains generation `1`, target authority, nonterminal outcome, and one observed dispatch; the next invocation remains GET-first with DELETE redispatch zero.

GET normalization is strict. Present requires no SDK error and an exact target ID. Absent requires the conjunction `data.user === null`, numeric `404`, and `user_not_found`. `401/403`, `429`, `5xx`, proven installed-SDK retryable/status-zero network failure, and abort/request-timeout have fixed categories. A 200/null result, partial 404, wrong types, target mismatch, and unknown shapes are malformed/mismatch, never absence.

DELETE normalization returns only observed, not-found, permission, rate-limit, unavailable, network, timeout, or malformed categories. Observed requires the exact returned target on a successful response; exact null/404/user-not-found maps to not-found. Wrong IDs and impossible response shapes are malformed. The adapter performs no DB write, retry, completion, or terminal write and never returns the raw SDK response, error, body, or user.

## Safe result, re-fetch, and replay

The service maps existing durable evidence to `authDurableRunnerCalls`, `authGetCalls`, `authDeleteDispatches`, `authAttempted`, `authOutcomeUnknown`, `authTerminal`, `authNonterminal`, `verificationAttemptCount`, `completionCalls`, and `destructiveOperationsAttempted`. Counts are accepted only as nonnegative safe integers; untrusted evidence is nullable at the operator boundary. Runtime-unknown and terminal-authority-mismatch paths expose `verificationAttemptCount=null`. An observed DELETE keeps both destructive counts at one through timeout, exception, malformed result, post-delete GET failure, runner corruption, and terminal re-fetch failure.

Auth reasons pass through the fixed Auth allowlist, preserving canonical fixed reasons such as `auth_get_user_mismatch`; unknown values become only `auth_durable_stage_result_unknown`. Operator output omits raw request and user UUIDs, durable targets, emails, phones, identities, SDK objects/errors/bodies, stacks, credentials, SQL/detail, and rogue objects.

A terminal-looking durable result causes one exact persisted re-fetch, not another runner or Auth call. Terminal is true only when the persisted row has exact request identity, all prior terminal authority, matching Auth terminal status and intent version, valid generation/status polarity, verified-absent and sub-finalized timestamps, scrubbed target/current-result fields, null owner, cleared failures, a canonical confirmed/completed parent surface, and a valid persisted verification-attempt count exactly matching the runner result. A missing or mismatched re-fetch or count becomes nonterminal manual/unknown with `auth_terminal_authority_missing`, `authOutcomeUnknown=1`, `verificationAttemptCount=null`, and observed action counts preserved. Trusted terminal output uses the persisted exact count.

An already-sub-finalized owner-null request remains reachable by exact UUID or opaque authority. It calls the durable runner once for canonical classification, performs zero external GET/DELETE, re-fetches persisted terminal authority, returns terminal, and still calls Completion zero times.

## Proof and regressions

The fake-only canonical Auth operator proof passes 50 checks. It additionally fixes the reproduced `persisted count=2 / runner count=999` case as nonterminal manual/unknown with nullable count and no second runner/Auth call, and a post-begin/post-GET repository failure as runtime unknown with nullable count while retaining observed external accounting. Positive terminal output is asserted equal to the persisted exact count, and already-terminal owner-null replay remains Auth GET/DELETE/Completion zero.

The mocked installed-SDK adapter proof passes 24 tests: all required GET and DELETE categories, strict target matching/absence, thrown network/abort redaction, exact 10-second default, real signal abortion, upstream-signal composition, timer cleanup on success and failure, one transport call, and DELETE at most once. It makes no network request.

For this correction, Auth durable `35/35`, mocked Auth adapter `24/24`, the canonical Auth operator proof `50/50`, the operator core, the legacy Auth guard, root lint, and root typecheck pass. Build was not rerun because no UI, route, schema, generated type, or build-only surface changed and typecheck was clean. The broader G5D-2O validation recorded before review remains unchanged.

## Boundaries and status

Migration and schema changes are zero. Migration `0026` is byte-unchanged at SHA-256 `4c9a34ddb0ded45e02edd345fb0dcebd171cb5aaa5866b5c9ea5b9146e312b81`; no `0027` exists. Generated DB types are unchanged. Canonical Staging remains `0001`-`0026` exact with pending zero. No `db push`, Staging/Production mutation, real Supabase Auth GET/DELETE, Provider/Storage external action, DB finalizer execution, Completion action, or destructive-guard enablement occurred. README was not changed because this focused result and the fresher current-state authority are sufficient.

P0/P1/P2/correctness UNKNOWN at final authority closeout: `0/0/1/0`. The independent focused re-review passed and the verificationAttemptCount P1 is `CLOSED`. The known `auth_terminal_authority_missing` allowlist P2 remains a nonblocking deferred cleanup and was not mixed into this scope. G5D-2O is `CLOSED_COMMITTED_PASS`. G5D-2 and Gate 5 remain `OPEN`; Completion remains `NOT IMPLEMENTED`. Real Auth GET/DELETE remained `0/0`, and Canonical Staging/Production mutation remained `0`.

## Exact next action

`G5D_POST_2O_COMPLETION_NEXT_UNIT_RECONCILIATION`

Do not proceed to Completion implementation, migration, Staging, real Auth, or another Gate in this closeout unit.
