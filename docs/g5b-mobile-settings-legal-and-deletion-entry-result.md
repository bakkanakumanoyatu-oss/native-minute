# G5B Mobile Settings, Legal, and Account Deletion Entry

Status: `P1_REMEDIATED_PENDING_FINAL_READ_ONLY_REAUDIT`

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

The local-spike Mobile build and iOS Capacitor sync passed and detected both `@capacitor/browser@8.0.4` and the existing Mobile auth session plugin. The exact Staging native build was not run because the current workspace does not contain the approved public-target fingerprint required by the existing Staging build guard.

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

## G5B audit status

- P0: 0
- P1: 0 at remediation validation; independent final read-only re-audit is pending.
- P2: 1
  - Exact Staging native Browser/build behavior remains unproven. The existing Staging guard requires an approved public-target fingerprint that was not provided. This is an external validation limitation, not a fallback, URL, or authentication-contract change.

G5A remains unchanged at P0=0, P1=0, P2=2. Gate 4 historical P2 remains outside this scope.

## Deliberately not implemented

- Actual account deletion, typed deletion confirmation, operator-runner invocation, provider delete, Storage cleanup, DB cleanup, or Supabase Auth deletion.
- Voice-only withdrawal/deletion or retention work.
- Final legal approval, final legal copy, reviewer destructive proof, pricing/quota work, or Gate 6.

## Remaining Gate 5 scope

Gate 5 remains `OPEN`. Remaining work includes voice-only withdrawal/deletion, retention implementation/provider retention confirmation, account-deletion operational execution, partial-failure/retry/idempotency proof, disposable destructive-deletion proof, final legal approval, and reviewer closeout. Brush-up/evolving voice remains v1.1.
