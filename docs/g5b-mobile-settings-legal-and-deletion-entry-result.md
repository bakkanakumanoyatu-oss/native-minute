# G5B Mobile Settings, Legal, and Account Deletion Entry

Status: `CLOSED_COMMITTED_PASS`

Scope: Minimal Mobile Settings, trusted public legal navigation, and Bearer-only account-deletion request/status entry. Gate 5 overall remains open. This work does not start any later Gate 5 unit.

## Human decision applied

`HDC_NM_V1_MOBILE_DELETION_AUTH_AND_LEGAL_NAV_V1` authorizes two narrow boundaries:

- Mobile stays Bearer-only. It does not hand a Mobile session to the Web cookie flow.
- Public Privacy, Terms, Support, and account-deletion information open in the system browser through the official Capacitor Browser plugin and a fixed allowlist.

## Mobile Settings

The authenticated Mobile practice shell now has `/settings` and `/settings/account-deletion` routes. The small Settings screen keeps the existing Scripts, Progress, Voice Setup, and Logout navigation intact and provides:

- Voice Setup with the current safe setup state;
- the canonical `pronunciation_processing` and `voice_cloning` consent statuses read from the existing Mobile consent API;
- a dedicated Mobile account-deletion entry; and
- Privacy, Terms, and Support actions.

Settings does not create a separate consent state or duplicate consent copy. It does not add a voice-only deletion action.

## Trusted legal navigation

`@capacitor/browser` `8.0.4` was added under the existing Capacitor 8 major version. One helper resolves only the configured canonical Mobile BFF origin plus these fixed paths:

- `/privacy`
- `/terms`
- `/support`
- `/support/account-deletion`

It accepts no arbitrary host or pathname and attaches no Bearer token, cookie, magic link, secret, query, or fragment. Legal copy remains on the existing public Web pages, including their draft/final-review markers.

The local-spike Mobile build and iOS Capacitor sync passed and detected both `@capacitor/browser@8.0.4` and the existing Mobile auth session plugin. The initial implementation record did not include the approved public-target fingerprint required by the Staging build guard. That limitation was subsequently removed by the exact Staging native proof recorded below.

## Bearer-only deletion request/status adapter

- `GET /api/mobile/account-deletion/status` authenticates with the existing Mobile Bearer route context and derives the user only from the validated session.
- `POST /api/mobile/account-deletion/request` accepts only the existing strict empty request schema and calls the existing `createAccountDeletionRequest(userId)` service.
- The adapter uses existing `getAccountDeletionStatus` and `createAccountDeletionRequest` domain services; it introduces no new deletion business logic, migration, or request model.
- Responses contain only `requestState`, `nextAction`, and the safe `created` result. They exclude request IDs, user IDs, email, service-role information, provider IDs, private paths, inventory, raw errors, and secrets.
- Existing active-request and race semantics remain canonical: the domain service reuses an active request rather than creating a duplicate.

## Final audit finding and P1 remediation

The prior final read-only audit found a P1 mismatch: the canonical deletion domain permits a new request after `cancelled` or `expired`, but Mobile decoded `expired` as an invalid response and displayed a start CTA only for `not_requested`. The audit history is retained; this remediation does not relabel that audit as a pass.

- Mobile now decodes every G5B-relevant canonical status, including `cancelled` and `expired`, while unknown statuses remain safe `invalid-response` failures.
- `not_requested`, `cancelled`, and `expired` are a single client-side reapplication set. Mobile preserves the terminal status and presents the appropriate start/reapply CTA; active requests do not receive a duplicate CTA.
- The Mobile POST now authenticates the Bearer session and derives the user before it reads or validates the request body. An unauthenticated malformed request therefore receives the safe 401 response; an authenticated malformed request keeps the safe validation error.
- No API field, database migration, domain model, cookie fallback, or deletion execution behavior changed. The canonical `createAccountDeletionRequest(userId)` service remains responsible for terminal-state creation and active-request reuse.

The dedicated Mobile deletion screen reaches discovery, initiation, and safe status only. It distinguishes account deletion from unsupported voice-only deletion and never starts typed confirmation, provider cleanup, Storage cleanup, DB cleanup, Supabase Auth deletion, or an operator runner. Its copy does not claim immediate or completed deletion for a newly-created request.

## Focused evidence

- Direct domain-service tests prove that `cancelled` and `expired` are excluded from active-request reuse and result in a new canonical `requested` row, while an active request is reused without an insert.
- Mobile route tests prove terminal status responses, created reapplications, safe 401 precedence for malformed unauthenticated POSTs, and the authenticated validation error.
- Mobile decoder/component tests prove terminal decoding, unknown-status rejection, reapply CTA availability only for the canonical terminal set, Settings-to-dedicated-deletion navigation, and rendering of the canonical G5A consent responses.
- Trusted legal navigation tests verify each canonical path, no query/fragment/credentials, and reject an arbitrary URL-like page value.
- Remediation-focused tests passed before the final full repository validation. No Staging build, sync, install, deploy, or native Browser smoke was run.
- The canonical domain-service focused test directly executes the active-request insert race: initial User A lookup is empty, the only insert returns PostgreSQL/Supabase-style `23505`, and the recovery lookup returns the competing User A active request. The result reuses that canonical row with `created: false`; it performs no second insert and does not expose the raw database error. The adapter fixture also contains a User B active request, which is excluded by the two `user_id = User A` lookups. A non-`23505` (`23514`) insert failure keeps the existing safe `AppError` path and does not run recovery lookup.

## Final closeout: active-request insert race

The final audit's remaining non-blocking P2 was the lack of a focused test that directly exercised the existing `23505` recovery branch in `createAccountDeletionRequest(userId)`. The implementation itself was not changed.

- `apps/mobile/tests/account-deletion-domain.test.ts` now controls only the Supabase admin boundary and directly calls the canonical service.
- It proves initial no-active-request lookup -> one insert -> `23505` -> actual second active-request lookup -> canonical User A request reused with `created: false`.
- The service does not retry the insert, create a second request, or leak the raw `23505` to the caller. A fixture User B request is not eligible for reuse because both lookups are scoped to User A.
- The negative control proves `23514` retains the pre-existing mapped safe failure behavior and does not enter the `23505` recovery path.
- Read-only review confirms the service's active statuses exactly match migration `0012_phase_rr_account_deletion_requests.sql` partial unique index `account_deletion_requests_user_active_unique_idx`: `requested`, `confirmed`, `processing`, `provider_cleanup_failed`, `storage_cleanup_failed`, `db_cleanup_failed`, and `auth_cleanup_failed`.
- No production source, migration, Staging/Production deployment, native artifact, or destructive account-deletion action changed for this closeout.

## Exact Staging BFF alignment and native proof

On 2026-08-22 JST, the clean exact source `400898e8be7489a049075ed96296ef26c32b2b52` was directly deployed only to the existing `native-minute-staging` Vercel project. The new Ready deployment `dpl_DRwFB2LhytdsEDnQGtpDcAoM9FAu` became the target of the fixed Staging alias. No Production project, source, migration, environment value, auth target, or native artifact changed. Vercel deployment metadata did not provide a Git revision, so source provenance is the clean exact local HEAD immediately before direct deploy rather than an inferred remote revision.

- Before alignment, unauthenticated `GET /api/mobile/scripts` returned a JSON auth boundary while both Mobile account-deletion routes returned HTML 404. The exact source contained both route handlers; the mismatch was therefore Staging BFF deployment drift, not a source defect.
- After alignment, unauthenticated safe GET probes to `/api/mobile/scripts`, `/api/mobile/account-deletion/status`, and `/api/mobile/account-deletion/request` each returned `403 application/json`; no unauthenticated POST was sent. This confirms route availability and the auth boundary without creating a request.
- The already-installed exact artifact was reused without rebuild or reinstall: source `400898e8be7489a049075ed96296ef26c32b2b52`, artifact SHA-256 `1f47b7938bda3957bac1b3864a64f343729d0ddb3fa82ae775ec8362fb997ee4`.
- On the iPhone 14 Plus / iOS 26.2.1, Settings opened the dedicated Mobile Account Deletion screen rather than generic Support. After the non-mutating Retry status fetch, it displayed the canonical safe `not_requested` state and the existing BFF connection indicator. No Web cookie handoff or token URL exposure was observed.
- The Account Deletion information action opened the native Browser at the Staging host with the `Account and data deletion` page. No query, fragment, or token was visible; closing Browser returned to the same native Account Deletion screen with the session intact.
- A new deletion request was intentionally not created: no independently identified disposable fixture was available, and the existing safe `not_requested` status was sufficient for this blocked-smoke resume. No provider, Storage, DB, or Auth cleanup ran.

Privacy, Terms, and Support Browser open/close evidence from the same exact artifact is reused without re-running those already-passed paths.

## G5B audit status

- P0: 0
- P1: 0
- P2: 0

`G5B_STAGING_NATIVE_BROWSER_SMOKE = PASS`. `G5B_MOBILE_SETTINGS_LEGAL_DELETION_ENTRY = CLOSED_COMMITTED_PASS`; Gate 5 overall remains `OPEN`.

G5A remains unchanged at P0=0, P1=0, P2=2. Gate 4 historical P2 remains outside this scope.

## Deliberately not implemented

- Actual account deletion, typed deletion confirmation, operator-runner invocation, provider delete, Storage cleanup, DB cleanup, or Supabase Auth deletion.
- Voice-only withdrawal/deletion or retention work.
- Final legal approval, final legal copy, reviewer destructive proof, pricing/quota work, or Gate 6.

## Remaining Gate 5 scope

Gate 5 remains `OPEN`. Remaining work includes voice-only withdrawal/deletion, retention implementation/provider retention confirmation, account-deletion operational execution, partial-failure/retry/idempotency proof, disposable destructive-deletion proof, final legal approval, and reviewer closeout. Brush-up/evolving voice remains v1.1.
