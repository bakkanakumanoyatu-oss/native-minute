# Gate 4d Account Deletion Request / Dry-Run Proof Scaffold

Status: `implemented`

Gate 4d reviews and lightly sharpens the existing account deletion request / dry-run / proof-first scaffold for v1 Store release. It does not run destructive deletion and does not change DB schema, migrations, API contracts, provider integrations, env, dashboards, infrastructure, Capacitor, or Store submission state.

## Existing Implementation Inventory

The repo already has these account deletion surfaces:

- `/settings`
  - authenticated Settings / Account entry;
  - account deletion request panel;
  - legal/support/deletion links.
- `/support/account-deletion`
  - public release-candidate draft explanation;
  - login-required and cannot-login guidance;
  - support and privacy links.
- `components/account/account-deletion-panel.tsx`
  - request creation;
  - typed confirmation;
  - status display;
  - inventory dry-run display;
  - job stage dry-run display;
  - provider / Storage / DB / Auth dry-run displays.
- `app/api/account/*`
  - `deletion-request`;
  - `deletion-confirm`;
  - `deletion-status`;
  - `deletion-inventory`;
  - `deletion-job-dry-run`;
  - `deletion-provider-dry-run`;
  - `deletion-storage-dry-run`;
  - `deletion-database-dry-run`;
  - `deletion-auth-dry-run`.
- `services/account-deletion/*`
  - request state;
  - safe inventory counts;
  - stage planning;
  - provider cleanup dry-run;
  - Storage cleanup dry-run;
  - DB cleanup dry-run;
  - Supabase Auth deletion dry-run;
  - destructive stage boundaries guarded for future operator use.

## Current Flow

1. User opens `/settings`.
2. User can create an account deletion request.
3. User must type `DELETE` to confirm the request.
4. The panel loads safe dry-run summaries after a request exists.
5. The UI shows counts, stage status, and guard state only.
6. The UI does not expose raw ids, email, transcript, script body, storage object key, signed URL, provider voice id, raw provider response, raw audio, or secrets.
7. The current app UI does not run provider cleanup, Storage deletion, DB cleanup / anonymization, or Supabase Auth deletion.

## Gate 4d UI / Copy Update

Gate 4d adds structure, not new deletion power:

- `/settings` copy now names the account deletion surface as request / dry-run proof scaffold.
- `AccountDeletionPanel` now shows v1 dry-run categories:
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
  - saved best-take pins;
  - saved model-audio pins;
  - quota / processing metadata;
  - normal v1 provider voice resources;
  - account deletion request tracking.
- `AccountDeletionPanel` now shows proof-first phases:
  - request;
  - confirmation;
  - dry-run summary;
  - disposable account proof;
  - actual deletion implementation;
  - provider cleanup;
  - post-delete verification;
  - Store release QA.
- `/support/account-deletion` now mirrors the same v1 scope and proof-first phases.
- Brush-up-specific data remains v1.1 deferred.

## Non-Destructive Boundary

Gate 4d does not:

- delete a Supabase Auth user;
- delete Storage objects;
- delete or anonymize DB rows;
- call provider cleanup;
- enable destructive guards;
- add a public actual deletion button;
- change DB schema or migrations;
- change API contracts;
- change provider integrations;
- change production env or dashboard settings;
- implement Brush-up.

## Dry-Run Categories

The v1 dry-run scaffold covers:

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
- saved best-take pins;
- saved model-audio pins;
- quota / processing metadata;
- provider-side normal v1 voice resources;
- account deletion request tracking.

Brush-up-specific script-scoped voice material, Brush-up generated audio, Brush-up consent/revoke state, and Brush-up provider cleanup remain v1.1.

## Human Required / Blockers

- Final legal approval for account deletion copy.
- Final support URL / inbox and operator identity.
- Disposable account live proof before Store submission.
- Provider cleanup proof for normal v1 voice resources.
- Storage / DB / Auth actual cleanup proof.
- App Privacy / Google Data Safety wording alignment with final implemented behavior.

## Verification

Required checks for this Gate:

- `npm run lint`
- `npm run build`
- `npm run typecheck`
- JSON report parse
- redaction scan for newly added evidence / copy
- `git diff --check`
