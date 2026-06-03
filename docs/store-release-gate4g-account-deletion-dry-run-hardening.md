# Gate 4g Account Deletion Dry-Run Hardening

Status: `implemented_non_destructive`

Gate 4g aligns the account deletion dry-run service and Settings UI with the Gate 4e disposable proof checklist and Gate 4f destructive boundary decision.

It does not run actual account deletion, Supabase Auth deletion, Storage object deletion, DB destructive cleanup, provider cleanup, DB schema changes, destructive API routes, env changes, dashboard operations, Capacitor work, Store submission work, or Brush-up work.

Brush-up remains deferred to v1.1 and is represented only as a deferred category in the dry-run summary.

## Code Inventory Reviewed

Reviewed account deletion dry-run surfaces:

- `services/account-deletion/account-deletion.service.ts`
  - request status;
  - inventory;
  - provider cleanup dry-run;
  - Storage cleanup dry-run;
  - DB cleanup dry-run;
  - Supabase Auth deletion dry-run;
  - job-stage dry-run;
  - guarded actual service boundaries.
- `services/account-deletion/index.ts`
  - exports dry-run and guarded actual service boundaries.
- `app/api/account/deletion-*`
  - request, confirm, status, inventory, job dry-run, provider dry-run, Storage dry-run, DB dry-run, Auth dry-run.
- `components/account/account-deletion-panel.tsx`
  - Settings UI request / confirm / status / dry-run summary.
- `app/settings/page.tsx`
  - authenticated Settings / Account entry.
- `app/support/account-deletion/page.tsx`
  - release-candidate account deletion explanation.

## Hardened Dry-Run Summary

`runAccountDeletionJobDryRun` now returns a `summary` object in addition to the existing per-stage dry-run output.

The summary contains safe operator-proof fields only:

- `stopPoint`: always `actual_deletion_not_run`;
- `destructiveActionsCalled`: always `false`;
- `coverage`: safe coverage items for Gate 4e v1 categories;
- `missingCoverage`: explicit list, currently empty when all v1 categories are represented;
- `skipped`: actual provider / Storage / DB / Auth / post-delete stages that are not run;
- `deferred`: Brush-up-specific v1.1 categories;
- `humanRequired`: operator, reviewer, provider cleanup semantics, legal/support, and Store disclosure confirmations;
- `blockers`: request / provider / Storage / DB / Auth dry-run blockers;
- `operatorChecklist`: Gate 4e proof checklist alignment;
- `redaction`: forbidden raw fields.

The summary does not include raw ids, email, script body, transcript body, raw audio, storage object keys, private paths, signed URLs, provider voice ids, provider raw responses, secrets, or env values.

## Covered v1 Categories

The hardening explicitly maps the Gate 4e v1 proof targets:

- Auth user;
- profile / account rows;
- scripts;
- recordings;
- takes;
- weak_words;
- coach_feedback;
- script-audios;
- voice-samples;
- voice-consents;
- voices;
- saved best-take pins and saved model-audio pins;
- quota / processing metadata;
- normal v1 provider voice resources;
- account deletion request tracking.

Brush-up-specific data is marked `deferred`:

- script-scoped best-take voice material;
- Brush-up generated audio;
- Brush-up consent / revoke state;
- Brush-up script-scoped voice variants;
- Brush-up provider cleanup.

## UI Alignment

`AccountDeletionPanel` now shows a Gate 4g safe summary inside the existing dry-run details:

- stop point;
- destructive actions called: no;
- missing coverage count;
- human-required list;
- blocker list;
- deferred list;
- skipped actual stages;
- coverage alignment details;
- operator checklist alignment details.

The UI continues to say this is dry-run only and does not provide an actual deletion button.

## Operator Checklist Alignment

The dry-run summary maps to the Gate 4e proof package:

| Gate 4e proof item | Gate 4g summary source |
| --- | --- |
| deletion request status | `runGuard`, request status, stage status |
| inventory counts | `summary.coverage`, `inventory` |
| provider cleanup dry-run | `providerCleanup`, provider checklist item |
| Storage cleanup dry-run | `storageCleanup`, storage checklist item |
| database cleanup dry-run | `databaseCleanup`, database checklist item |
| Auth deletion dry-run | `authDeletion`, Auth checklist item |
| skipped / deferred items | `summary.skipped`, `summary.deferred` |
| human confirmation required | `summary.humanRequired` |
| redaction check | `summary.redaction` |
| stop point | `summary.stopPoint` |

## Human Required / Blocker / Deferred

Human required:

- disposable test account approval;
- operator and reviewer identity;
- normal v1 ElevenLabs cleanup semantics;
- support / legal copy final approval;
- Store disclosure consistency.

Blockers are generated from safe dry-run state:

- deletion request is not confirmed or not retryable;
- provider cleanup dry-run is blocked;
- Storage cleanup dry-run is blocked;
- DB cleanup dry-run is blocked;
- Auth deletion dry-run is blocked.

Deferred:

- Brush-up-specific script-scoped voice material;
- Brush-up generated audio;
- Brush-up consent / revoke state;
- Brush-up provider cleanup.

## Non-Destructive Boundary

Gate 4g did not:

- execute actual account deletion;
- call ElevenLabs provider cleanup;
- remove Storage objects;
- delete, update, or anonymize DB rows;
- delete a Supabase Auth user;
- add a destructive API route;
- change DB schema or migrations;
- change env or dashboard settings;
- implement Brush-up.

## Handoff

Next recommended work is Gate 4h: disposable account dry-run proof capture. It should use the Gate 4g `summary` fields and Gate 4e proof checklist, stop before actual deletion, and record only safe counts / statuses / reason codes.
