# Gate 4n Account Deletion Actual Proof Approval Packet

Recorded: 2026-06-07

Status: `APPROVAL_PACKET_READY / NOT_APPROVED_FOR_ACTUAL_DELETION`

Gate 4n defines the approval packet, operator boundary, and stop points required before any actual account deletion proof. It does not execute account deletion, Supabase Auth deletion, Storage object deletion, DB destructive cleanup, provider cleanup, provider API calls, env/dashboard operations, Store Console work, screenshot capture, Capacitor work, DB schema/migration changes, or API/service logic changes.

## Scope

The only eligible target for a future actual deletion proof is the disposable deletion test account safe alias:

- `plus_delete_test_account`

The target must not be:

- a real user account;
- the support account;
- the demo account;
- the reviewer account;
- any account whose ownership or purpose is ambiguous.

No full email, full user id, deletion request id, Storage path, object key, token, cookie, secret, raw provider response, transcript body, or raw audio may be recorded in the approval packet or proof package.

## Evidence Available Before Approval

Gate 4h:

- disposable account candidate login: human-confirmed PASS;
- account deletion request: human-created;
- typed confirmation: human-completed;
- request / confirmed timestamps: visible to human, exact values not recorded;
- safe dry-run summary: human-observed PASS;
- provider / Storage / database / Auth statuses: pending;
- destructive actions called: false;
- blockers: none.

Gate 4m:

- Storage cleanup proof readiness is documented;
- Storage dry-run covers `recordings`, `script-audios`, `voice-samples`, and `voice-consents`;
- Gate 4h Storage summary is `not_needed / listed 0 / known 0`;
- actual Storage cleanup proof remains a Store submission blocker until separately approved.

## Operations That May Be In Scope After Approval

A later explicitly approved destructive proof may include these stages only for the disposable account:

1. Provider cleanup
2. Storage cleanup
3. DB cleanup
4. Supabase Auth deletion
5. Post-delete verification

Each stage must be executed and recorded separately. A later stage must not run until the previous stage is `succeeded` or `not_needed`.

## Execution Order Principle

The execution order must remain:

1. Provider cleanup
2. Storage cleanup
3. DB cleanup
4. Supabase Auth deletion
5. Post-delete verification

Reason:

- Provider cleanup may need app DB/provider mappings before DB rows are removed.
- Storage cleanup must happen while DB-known references can still be compared against listed Storage objects.
- DB cleanup should only run after provider and Storage stages are satisfied.
- Supabase Auth deletion must be last because it removes the login identity.
- Post-delete verification must use only safe status/count evidence.

## Stop Points

Provider cleanup stop point:

- Stop after provider cleanup reports `succeeded`, `not_needed`, `blocked`, `failed`, or `manual_required`.
- Do not continue to Storage cleanup unless provider cleanup is `succeeded` or `not_needed`.

Storage cleanup stop point:

- Stop after Storage cleanup reports `succeeded`, `not_needed`, `blocked`, `failed`, or `manual_required`.
- Do not continue to DB cleanup unless Storage cleanup is `succeeded` or `not_needed`.
- Do not record Storage paths, object keys, signed URLs, raw Storage errors, or private audio data.

DB cleanup stop point:

- Stop after DB cleanup reports `succeeded`, `not_needed`, `blocked`, `failed`, or `manual_required`.
- Do not continue to Supabase Auth deletion unless DB cleanup is `succeeded` or `not_needed`.
- Do not record row ids, script text, transcript bodies, coach feedback bodies, raw metadata, or full user identifiers.

Supabase Auth deletion stop point:

- Stop after Auth deletion reports `succeeded`, `not_needed`, `blocked`, `failed`, or `manual_required`.
- Do not mark the proof complete unless Auth deletion is `succeeded` or explicitly accepted as `not_needed`.
- Do not record auth raw payloads, session details, tokens, cookies, or full identifiers.

Post-delete verification stop point:

- Stop after safe verification summary is captured.
- Verify only safe status/count outcomes and route-level expectations.
- Do not attempt login retry, magic link resend, dashboard edits, provider API calls, Store Console operations, or screenshot capture unless a later gate explicitly asks for them.

## Human Confirmation Required Before Approval

Before a future actual deletion proof can start, a human must confirm all of the following:

- target account is the disposable deletion test account safe alias `plus_delete_test_account`;
- target is not a real user account;
- target is not the support account;
- target is not the demo account;
- target is not the reviewer account;
- account deletion request has been created;
- typed confirmation has been completed;
- safe dry-run summary is PASS;
- Storage cleanup readiness is confirmed;
- provider cleanup dry-run coverage is sufficient;
- Storage cleanup dry-run covers all four v1 buckets;
- DB cleanup dry-run coverage is sufficient;
- Auth deletion dry-run coverage is sufficient;
- operator and reviewer are identified by role, not by personal identifiers in the proof artifact;
- raw identifiers, secrets, object keys, paths, tokens, cookies, raw provider responses, transcript bodies, and raw audio will not be recorded;
- rollback limitations are understood;
- Store/legal owner accepts that this is a destructive disposable-account proof.

## Approval Phrase

The future approval phrase is:

`I APPROVE ACTUAL DELETION FOR DISPOSABLE ACCOUNT ONLY`

This Gate 4n packet defines the phrase only. The phrase has not been provided as approval in this gate, and this gate must not be interpreted as authorization to execute actual deletion.

## Do Not Execute If

Do not proceed to actual deletion if any of these are true:

- target account is ambiguous;
- target could be a real user account;
- target could be the support, demo, or reviewer account;
- disposable account safe alias is missing or disputed;
- authenticated disposable session or server-side request resolution is missing;
- account deletion request is missing;
- typed confirmation is missing;
- safe dry-run summary is not PASS;
- provider, Storage, DB, or Auth dry-run coverage is incomplete;
- Storage dry-run is blocked;
- missing known Storage object count is greater than `0`;
- provider cleanup is not `succeeded` or `not_needed` before Storage cleanup;
- actual target counts differ from latest dry-run counts;
- proof would require recording full email, full user id, full Storage path, object key, token, cookie, secret, transcript body, raw audio, raw provider response, provider voice id, or raw DB identifiers;
- DB schema/migration, Auth policy, Storage policy, or ownership-boundary changes are needed;
- human has not explicitly provided the approval phrase in a later gate.

## Approval Packet Status

Gate 4n is `ready_for_future_human_approval`.

Actual deletion remains `not_approved`.

The next safe step is to either:

- keep this packet as the Store submission blocker record; or
- open a later destructive approval gate where a human explicitly provides the approval phrase and target confirmation.
