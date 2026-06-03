# Gate 4e Disposable Account Deletion Proof Checklist

Status: `checklist_ready`

Gate 4e defines the operator checklist and proof package shape for a future disposable account deletion proof. It does not run actual deletion and does not change DB schema, migrations, API contracts, provider integrations, env, dashboards, infrastructure, Capacitor, or Store submission state.

Brush-up remains deferred to v1.1. The v1 proof package must not include Brush-up-specific script-scoped voice material, generated Brush-up audio, Brush-up consent/revoke state, or Brush-up provider cleanup.

## Operator Checklist

Use a disposable test account created only for deletion proof. Do not use a real personal account or a production user account with meaningful data.

### 1. Prepare the Test Account

- Create or choose a disposable test account.
- Record only a safe account summary:
  - `account_type`: disposable test account;
  - `auth_provider`: safe provider label only;
  - `account_identifier`: masked or internal proof alias only;
  - `created_for`: deletion proof;
  - `private_email_or_user_id_recorded`: no.
- Confirm the account is not reused for real practice or support.

### 2. Create v1 Test Data

Create only enough data to prove the v1 deletion categories:

1. Log in.
2. Create a script from `/scripts/new`.
3. Open `/scripts`.
4. Open `/scripts/[id]/listen`.
5. Generate or reuse normal model audio.
6. Record a take from `/scripts/[id]/record`.
7. Evaluate the take.
8. Open `/scripts/[id]/review/[takeId]`.
9. Open `/progress`.
10. If needed, run `/setup/voice` to create normal v1 voice data.
11. Optionally save a model audio or best take pin if the proof needs saved pin coverage.

Record only safe summaries:

- counts;
- status labels;
- route names;
- PASS / WARN / BLOCKED / FAIL;
- whether normal voice data exists.

Do not record:

- script body;
- transcript body;
- raw audio;
- storage path;
- object key;
- signed URL;
- provider voice id;
- provider raw response;
- email;
- auth user id;
- API key or env value.

### 3. Start Account Deletion Request

1. Open `/settings`.
2. Confirm the account deletion panel is visible.
3. Create an account deletion request.
4. Confirm the request by typing `DELETE`.
5. Record only safe status:
   - request created: yes / no;
   - confirmation status: requested / confirmed / blocked;
   - request timestamp: exact timestamp may be recorded if it does not identify a private user;
   - request id: do not record raw id.

### 4. Capture Dry-Run Evidence

Use the Settings panel and safe API summaries only:

- inventory dry-run;
- job stage dry-run;
- provider cleanup dry-run;
- Storage cleanup dry-run;
- DB cleanup dry-run;
- Supabase Auth deletion dry-run.

Record safe counts and status only. The proof package may include:

- per-category counts;
- stage status;
- guard status;
- safe reason code;
- human confirmation status;
- skipped / deferred item status.

The proof package must not include raw target references or private content.

### 5. Stop Before Actual Deletion

Gate 4e stops before destructive execution.

Do not:

- run actual account deletion;
- delete Supabase Auth user;
- delete Storage objects;
- delete or anonymize DB rows;
- call provider cleanup;
- enable destructive guard;
- add env;
- operate dashboards;
- run Store submission.

## Proof Target Categories

The disposable proof package should cover the v1 data categories:

- auth user;
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

Brush-up-specific categories are v1.1:

- script-scoped best-take voice material;
- Brush-up generated model audio;
- Brush-up consent / revoke state;
- Brush-up script-scoped voice variants;
- Brush-up provider cleanup;
- Brush-up-specific account deletion proof.

## Operator Proof Package Fields

Use this shape for the future proof package. Fill only safe values.

| Field | Safe value only |
| --- | --- |
| proof_id | operator-generated safe alias |
| executed_at | timestamp |
| environment | production / preview / local label only |
| operator | role or safe owner label |
| reviewer | role or safe reviewer label |
| test_account_summary | masked proof alias, not email or auth id |
| created_test_data_summary | counts and route labels only |
| voice_setup_summary | normal voice data exists yes/no/unknown |
| deletion_request_status | requested / confirmed / blocked / unknown |
| inventory_counts | category counts only |
| provider_cleanup_dry_run | required / not_needed / blocked + safe counts |
| storage_cleanup_dry_run | required / not_needed / blocked + bucket counts |
| database_cleanup_dry_run | required / not_needed / blocked + table counts |
| auth_deletion_dry_run | ready / waiting / blocked + safe preflight status |
| skipped_items | reason-coded list |
| deferred_items | reason-coded list |
| human_required | unresolved human confirmations |
| redaction_check | pass / warn / fail |
| stop_point | `actual_deletion_not_run` |
| overall_result | PASS / WARN / BLOCKED / FAIL |

## Actual Deletion Implementation Blockers

Before real deletion proof can run, confirm:

- DB schema / migration is sufficient for request tracking and anonymized completion tracking.
- Request tracking can survive Auth user deletion without leaking private identifiers.
- Destructive execution surface is scoped and operator-only.
- Supabase Auth user deletion runs last.
- Storage cleanup runs after provider cleanup and before DB/Auth cleanup.
- DB cleanup / anonymization runs after Storage cleanup.
- Provider cleanup can delete or safely mark normal v1 voice resources as not applicable.
- Post-delete verification can prove absence or safe anonymized retention without exposing raw targets.
- Safe proof package can be generated without raw user data, raw provider response, transcript body, private audio path, storage object key, provider voice id, or secret values.

## PASS / WARN / BLOCKED / FAIL

- `PASS`: disposable account data exists, request and confirmation work, dry-run summaries cover all v1 categories, redaction passes, and the stop point is before actual deletion.
- `WARN`: dry-run works but some counts are zero, optional normal voice data is absent, or human confirmation remains before actual deletion proof.
- `BLOCKED`: request cannot be created/confirmed, dry-run cannot load, service role boundary is unavailable, provider/Storage/DB/Auth dry-run is blocked without an accepted reason, or proof package cannot be made safely.
- `FAIL`: any secret, raw provider response, transcript body, private audio path, storage object key, provider voice id, raw account identifier, or private user data is recorded.

## Human Required

- Disposable test account owner approval.
- Final operator and reviewer identity.
- Final environment selection.
- Confirmation that support URL / privacy URL / deletion URL are Store-ready.
- Provider cleanup semantics for normal v1 voice resources.
- Final legal approval for account deletion copy and proof language.

## Handoff

Next work can prepare a non-destructive dry-run evidence capture using this checklist. Actual deletion implementation and disposable live proof must stay separate, scoped tasks with explicit destructive guard decisions.
