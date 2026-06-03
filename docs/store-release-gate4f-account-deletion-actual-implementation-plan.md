# Gate 4f Account Deletion Actual Implementation Plan

Gate 4f fixes the destructive boundary decision for v1 account deletion before any actual deletion work begins.

This is a docs/output-only planning gate. It does not run Supabase Auth deletion, Storage deletion, DB destructive cleanup, provider cleanup, dashboard operations, env changes, DB schema changes, API contract changes, Capacitor work, Store submission work, or Brush-up work.

Brush-up remains deferred to v1.1. Brush-up-specific script-scoped voice material, Brush-up generated audio, Brush-up revoke/delete, and Brush-up provider cleanup are not v1 deletion blockers.

## Existing Account Deletion Inventory

| Area | Repo status | Notes |
| --- | --- | --- |
| Request UI | Present | `/settings` renders `AccountDeletionPanel`; `/support/account-deletion` explains the request path. |
| Status UI | Present | `AccountDeletionPanel` displays request status and cleanup stage status. |
| Confirmation UI | Present | User confirmation requires typed `DELETE`; it does not start destructive cleanup. |
| Request API | Present | `app/api/account/deletion-request/route.ts` creates or returns the active request. |
| Confirmation API | Present | `app/api/account/deletion-confirm/route.ts` confirms a request after schema validation. |
| Status API | Present | `app/api/account/deletion-status/route.ts` returns the active request status. |
| Inventory dry-run | Present | `app/api/account/deletion-inventory/route.ts` and `collectAccountDeletionInventory` return safe counts only. |
| Job dry-run | Present | `app/api/account/deletion-job-dry-run/route.ts` and `runAccountDeletionJobDryRun` plan stage order. |
| Provider cleanup dry-run | Present | `planElevenLabsCleanupDryRun` counts owned ElevenLabs voice cleanup candidates without returning provider references. |
| Storage cleanup dry-run | Present | `planStorageCleanupDryRun` groups owned object candidates by bucket without returning object keys. |
| DB cleanup dry-run | Present | `planDatabaseCleanupDryRun` groups candidate rows by table and action. |
| Supabase Auth deletion dry-run | Present | `planSupabaseAuthDeletionDryRun` checks final-stage readiness without calling Auth deletion. |
| Actual provider cleanup boundary | Guarded service exists | `runElevenLabsProviderCleanupActual` is guarded by request id, request status, dry-run state, cost guard, and `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE`; it is not exposed by public UI/API. |
| Actual Storage cleanup boundary | Guarded service exists | `runStorageCleanupActual` requires provider cleanup satisfaction and the destructive guard; it is not exposed by public UI/API. |
| Actual DB cleanup boundary | Guarded service exists | `runDatabaseCleanupActual` requires provider and Storage cleanup satisfaction and the destructive guard; it is not exposed by public UI/API. |
| Actual Supabase Auth deletion boundary | Guarded service exists | `runSupabaseAuthDeletionActual` requires provider, Storage, and DB cleanup satisfaction plus service role availability and the destructive guard; it is not exposed by public UI/API. |
| Post-delete verification | Checklist only | Gate 4e defines proof package expectations. Automated post-delete verification is not yet implemented. |
| Operator actual execution surface | Not public / not finalized | The v1 path still needs an explicit operator-only execution decision before any destructive run. |

## Recommended v1 Actual Deletion Order

Use the service-stage order already modeled by the repo:

1. Deletion request creation.
2. User typed confirmation.
3. Full dry-run summary.
4. Provider cleanup dry-run.
5. Storage cleanup dry-run.
6. DB cleanup dry-run.
7. Supabase Auth deletion dry-run.
8. Disposable account dry-run proof.
9. Actual provider cleanup for normal v1 voice resources.
10. Actual Storage cleanup for app-owned audio objects.
11. Actual DB cleanup / anonymized retention.
12. Supabase Auth user deletion.
13. Post-delete verification and safe proof package.
14. Store release QA replay of the disposable proof.

Provider cleanup should run before Storage, DB, and Auth cleanup because provider voice references are stored in app-owned rows and should be resolved while the app still has owned user/resource context. Storage cleanup should run before DB cleanup so owned object references and bucket counts remain available. Supabase Auth deletion should run last because it removes the primary identity anchor.

## Destructive Boundary

Preview / non-destructive operations:

- creating an account deletion request;
- confirming the request with typed `DELETE`;
- reading request status;
- inventory dry-run;
- job stage dry-run;
- provider cleanup dry-run;
- Storage cleanup dry-run;
- DB cleanup dry-run;
- Supabase Auth deletion dry-run;
- disposable account proof package preparation;
- docs/output evidence capture with safe aliases, counts, status labels, and reason codes only.

Destructive operations begin at:

- any provider delete call for a normal v1 voice resource;
- any Supabase Storage object removal;
- any DB row delete, update, anonymization, or cleanup status mutation made as part of actual cleanup;
- any Supabase Auth admin user deletion;
- any final completion status update that depends on destructive cleanup having run.

Operator confirmation is required before:

- enabling `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE`;
- connecting a public or operator route/CLI to guarded actual service functions;
- running any actual cleanup function against a disposable account;
- re-running a failed actual cleanup stage;
- marking proof as Store-ready.

User confirmation is required before:

- creating the deletion request;
- typed confirmation with `DELETE`;
- any future real deletion execution path that could delete data after the dry-run preview;
- final human-approved copy that explains irreversible deletion.

Irreversible or rollback-limited operations:

- provider voice deletion;
- Supabase Storage object deletion;
- DB destructive cleanup / anonymization;
- Supabase Auth user deletion.

Rollback is not a v1 guarantee for deleted provider, Storage, DB, or Auth resources. The safe design is dry-run first, disposable proof second, explicit destructive approval third, and post-delete verification last.

## DB Schema / Migration Decision

No DB schema or migration is required for this Gate 4f plan.

The existing `account_deletion_requests` tracking model appears sufficient for the v1 operator-proof path because it already records request status, confirmation timing, cleanup stage status, retry count, failure stage, failure reason code, anonymized user reference, and completion timing.

For v1, proof artifacts should remain in operator evidence packages and docs/outputs, not in a new DB audit table. If Native Minute later needs in-app proof history, external audit logs, or a durable customer-visible deletion receipt, that should be scoped as a separate schema/API decision before implementation.

## Provider Cleanup v1 Scope

| Provider / store | v1 cleanup scope | Decision |
| --- | --- | --- |
| OpenAI transcription / coaching | No app-created persistent provider resource is confirmed in the current v1 path. | No provider-side delete action is planned for v1 account deletion; retain disclosure and retention review as human confirmation. |
| Azure pronunciation evaluation | No app-created persistent provider resource is confirmed in the current v1 path. | No provider-side delete action is planned for v1 account deletion; retain disclosure and retention review as human confirmation. |
| ElevenLabs normal voice path | Owned ElevenLabs voice rows may require provider-side voice cleanup when `provider_voice_id` exists and provider semantics are confirmed. | v1 provider cleanup boundary covers normal v1 voices only. Provider identifiers must stay server-side and out of proof artifacts. |
| Supabase Storage | Recordings, script-audios, voice-samples, and voice-consents are app-owned objects. | Storage cleanup is required before DB cleanup and after provider cleanup. Proof records safe bucket-level counts only. |
| Supabase DB | User-owned rows and related dependent rows must be cleaned or retained anonymized according to the dry-run table plan. | DB cleanup runs after Storage cleanup and before Supabase Auth deletion. |
| Supabase Auth | Auth user deletion is the final destructive stage. | Run only after provider, Storage, and DB cleanup are succeeded or not_needed. |
| Brush-up resources | v1.1 deferred. | Not part of v1 deletion proof or v1 Store blocker. |

## Human Confirmation Required

- Disposable test account approval and scope.
- Destructive implementation start approval.
- Actual deletion execution approval.
- Operator identity and reviewer identity.
- Provider cleanup semantics for normal v1 ElevenLabs voice resources.
- Confirmation that OpenAI and Azure do not require v1 provider-side resource deletion beyond policy disclosure.
- Final support, legal, Privacy Policy, Terms, and account deletion copy approval.
- Store disclosure consistency with actual v1 deletion behavior.
- Confirmation that no proof package records secrets, env values, raw provider responses, transcript body, private audio paths, storage object keys, provider voice ids, email addresses, or raw auth user ids.

## Next Gate Minimal Units

Recommended next gates:

1. Gate 4g: account deletion dry-run service hardening and operator checklist alignment.
2. Gate 4h: disposable account dry-run proof capture with no destructive cleanup.
3. Gate 4i: actual deletion implementation behind a guarded operator-only path.
4. Gate 4j: disposable live deletion proof run after explicit destructive approval.

Do not expose a public actual deletion button until the guarded operator path, disposable proof, support fallback, and Store copy are all accepted.

## Explicit Non-Changes

Gate 4f did not:

- execute account deletion;
- delete a Supabase Auth user;
- delete Storage objects;
- delete, update, or anonymize DB rows;
- call provider cleanup;
- add or change DB schema / migrations;
- add or change API contracts;
- change env or dashboard configuration;
- implement Brush-up;
- introduce Capacitor;
- perform App Store / Google Play work.
