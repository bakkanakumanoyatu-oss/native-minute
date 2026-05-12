# RR-3d DB Cleanup / Anonymize Actual

RR-3d は actual account deletion path の third destructive stage である DB cleanup / anonymize を実装境界まで進めた段階です。通常実行では DB row delete / update / anonymize は呼ばれません。

## Scope

- 対象: account deletion に必要な app-owned DB rows.
- Tables:
  - `weak_words`
  - `coach_feedback`
  - `script_saved_best_takes`
  - `script_saved_model_audios`
  - `quota_events`
  - `takes`
  - `script_audios`
  - `voice_consents`
  - `voices`
  - `scripts`
  - `profiles`
  - retained tracking: `account_deletion_requests`
- 非対象: Supabase Auth deletion、completion notification、public cleanup UI。
- 前提:
  - provider cleanup が `succeeded` または `not_needed`
  - Storage cleanup が `succeeded` または `not_needed`

## Implementation Boundary

追加済み:

- `runDatabaseCleanupActual` in `services/account-deletion/account-deletion.service.ts`
  - confirmed request を server-side で再取得する。
  - latest DB dry-run を server-side で再取得する。
  - candidate count / classification が actual run 前に一致することを確認する。
  - client から row id / table name / user id / cleanup target を受け取らない。
  - destructive guard が off の場合は DB delete / update / anonymize も status update も行わない。
  - success / failed / manual_required / not_needed を safe summary として返す。
- `executeOwnedDatabaseCleanupForAccountDeletion`
  - DB delete / retain behavior を service 境界内に閉じる。
  - raw row ids、script body、transcript、coach feedback、provider metadata、storage path、email は client / docs / logs に出さない。
- `npm run account-deletion:database-cleanup:self-test`
  - real DB delete / update / anonymize を呼ばない static/self-test。
  - destructive guard、request/status guard、provider-stage guard、storage-stage guard、fake adapter seam、safe output を確認する。

追加していない:

- Public API route for actual DB cleanup.
- Settings の実削除ボタン。
- Supabase Auth deletion actual。
- Completion notification。
- Real DB cleanup / anonymize の実行。

## Destructive Guard

Actual DB cleanup requires all of the following:

- Active request is server-side re-fetched.
- Caller provides matching deletion request id.
- Request status is `confirmed` or `db_cleanup_failed`.
- Provider cleanup stage is `succeeded` or `not_needed`.
- Storage cleanup stage is `succeeded` or `not_needed`.
- DB cleanup stage is `pending`, `failed`, or `manual_required`.
- Latest DB dry-run is not `blocked`.
- Latest actual candidate classification still matches latest DB dry-run.
- `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE=1`.

If the destructive guard is missing, the service returns `blocked` and does not:

- call DB delete / update / anonymize operations,
- update `account_deletion_requests`,
- advance Supabase Auth deletion.

## Status Update Behavior

The DB cleanup actual service can update only DB cleanup state.

| Condition | Request status | DB cleanup status |
| --- | --- | --- |
| No DB cleanup candidates | `confirmed` | `not_needed` |
| All DB cleanup operations succeed | `confirmed` | `succeeded` |
| Dry-run blocked | `db_cleanup_failed` | `manual_required` |
| Candidate classification changed | `db_cleanup_failed` | `manual_required` |
| Constraint / permission failure | `db_cleanup_failed` | `manual_required` |
| Transient DB cleanup failure | `db_cleanup_failed` | `failed` |

`account_deletion_requests` is retained during DB cleanup. Its `user_id` remains until the later Supabase Auth deletion stage makes it `null` through `on delete set null`.

Later stages remain untouched. Supabase Auth deletion must still wait for DB cleanup to become `succeeded` or `not_needed`.

## Failure Classification

DB cleanup failure is classified into safe reason codes:

- `db_cleanup_constraint_failed`
- `db_cleanup_permission_denied`
- `db_cleanup_unavailable`
- `db_cleanup_delete_failed`
- `db_cleanup_candidate_mismatch`

Server logs may include operation, table, action, and safe reason code. They must not include row ids, raw user id, email, script text, transcript, coach feedback text, provider metadata, raw storage path, signed URL, auth payload, or secrets.

## Self-Test

Run:

```bash
npm run account-deletion:database-cleanup:self-test
```

The self-test verifies:

- actual DB cleanup service exists,
- destructive guard is required,
- request/stage/provider/storage guard is present,
- fake DB cleanup adapter seam exists,
- DB cleanup operations are isolated behind service boundary,
- DB cleanup failure stops Supabase Auth deletion,
- retained request tracking stays server-owned,
- `.env.example` documents the destructive guard as off by default.

The self-test does not call DB delete / update / anonymize.

## Remaining Before Store Submission

- Operator/admin execution surface for provider + Storage + DB cleanup sequence.
- Disposable-account proof with destructive guard enabled.
- Supabase Auth deletion actual.
- Completion/status tracking after Auth deletion.
- Public policy text aligned to actual deletion behavior.
