# G5B Mobile Settings, Legal, and Account Deletion Entry

Status: `IMPLEMENTED_VALIDATED`

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

The dedicated Mobile deletion screen reaches discovery, initiation, and safe status only. It distinguishes account deletion from unsupported voice-only deletion and never starts typed confirmation, provider cleanup, Storage cleanup, DB cleanup, Supabase Auth deletion, or an operator runner. Its copy does not claim immediate or completed deletion for a newly-created request.

## Focused evidence

- Mobile routes round-trip Settings and the dedicated account-deletion entry.
- Trusted legal navigation tests verify each canonical path, no query/fragment/credentials, and reject an arbitrary URL-like page value.
- Mobile deletion route tests verify unauthenticated 401, Bearer-derived User A request creation, User B status isolation, safe response redaction, duplicate request reuse, and rejection of a client-supplied user ID.
- Targeted Mobile tests, Mobile typecheck, Mobile lint, local-spike Mobile build, and Capacitor iOS sync passed during implementation.

## G5B audit status

- P0: 0
- P1: 0
- P2: 1
  - The exact Staging native build/sync could not be run from this workspace because the existing Staging guard requires an approved public-target fingerprint that was not provided. This is an external validation limitation, not a fallback, URL, or authentication-contract change.

G5A remains unchanged at P0=0, P1=0, P2=2. Gate 4 historical P2 remains outside this scope.

## Deliberately not implemented

- Actual account deletion, typed deletion confirmation, operator-runner invocation, provider delete, Storage cleanup, DB cleanup, or Supabase Auth deletion.
- Voice-only withdrawal/deletion or retention work.
- Final legal approval, final legal copy, reviewer destructive proof, pricing/quota work, or Gate 6.

## Remaining Gate 5 scope

Gate 5 remains `OPEN`. Remaining work includes voice-only withdrawal/deletion, retention implementation/provider retention confirmation, account-deletion operational execution, partial-failure/retry/idempotency proof, disposable destructive-deletion proof, final legal approval, and reviewer closeout. Brush-up/evolving voice remains v1.1.
