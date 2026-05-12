# RR-3c Storage Cleanup Actual

RR-3c は actual account deletion path の second destructive stage である Storage cleanup を実装境界まで進めた段階です。通常実行では Supabase Storage object delete は呼ばれません。

## Scope

- 対象: app-owned Supabase Storage objects for account deletion.
- Buckets:
  - `recordings`
  - `script-audios`
  - `voice-samples`
  - `voice-consents`
- 非対象: DB cleanup / anonymize、Supabase Auth deletion、completion notification、public cleanup UI。
- 前提: provider cleanup が `succeeded` または `not_needed` でなければ Storage cleanup は実行できない。

## Implementation Boundary

追加済み:

- `runStorageCleanupActual` in `services/account-deletion/account-deletion.service.ts`
  - confirmed request を server-side で再取得する。
  - latest storage dry-run を server-side で再取得する。
  - storage object keys は server-side で user prefix から再取得する。
  - client から storage path / object key / row id を受け取らない。
  - destructive guard が off の場合は Storage delete も status update も行わない。
  - success / failed / manual_required / not_needed を safe summary として返す。
- `deleteSupabaseStorageObjectsForAccountDeletion`
  - Supabase Storage `.remove()` を service 境界内に閉じる。
  - raw storage path / object key / signed URL は client / docs / logs に出さない。
- `npm run account-deletion:storage-cleanup:self-test`
  - real Supabase Storage delete を呼ばない static/self-test。
  - destructive guard、request/status guard、provider-stage guard、fake adapter seam、safe output を確認する。

追加していない:

- Public API route for actual Storage cleanup.
- Settings の実削除ボタン。
- DB cleanup / anonymize actual。
- Supabase Auth deletion actual。
- Real Supabase Storage delete の実行。

## Destructive Guard

Actual Storage cleanup requires all of the following:

- Active request is server-side re-fetched.
- Caller provides matching deletion request id.
- Request status is `confirmed` or `storage_cleanup_failed`.
- Provider cleanup stage is `succeeded` or `not_needed`.
- Storage cleanup stage is `pending`, `failed`, or `manual_required`.
- Latest storage dry-run is not `blocked`.
- Latest actual candidate collection still matches latest storage dry-run count.
- `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE=1`.

If the destructive guard is missing, the service returns `blocked` and does not:

- call Supabase Storage `.remove()`,
- update `account_deletion_requests`,
- advance DB / Auth cleanup.

`NATIVE_MINUTE_DISABLE_STORAGE_UPLOADS=1` pauses new uploads. It does not by itself block support/admin account deletion Storage cleanup; destructive cleanup remains guarded by `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE=1` and the stage guards above.

## Status Update Behavior

The Storage cleanup actual service can update only Storage cleanup state.

| Condition | Request status | Storage cleanup status |
| --- | --- | --- |
| No storage candidates | `confirmed` | `not_needed` |
| All deletes succeed | `confirmed` | `succeeded` |
| Dry-run blocked | `storage_cleanup_failed` | `manual_required` |
| Candidate count changed | `storage_cleanup_failed` | `manual_required` |
| Bucket unavailable / permission failure | `storage_cleanup_failed` | `manual_required` |
| Transient storage delete failure | `storage_cleanup_failed` | `failed` |

Later stages remain untouched. DB cleanup must still wait for Storage cleanup to become `succeeded` or `not_needed`.

## Failure Classification

Storage delete failure is classified into safe reason codes:

- `storage_delete_bucket_unavailable`
- `storage_delete_permission_denied`
- `storage_delete_provider_unavailable`
- `storage_delete_failed`

Server logs may include operation, bucket, and safe reason code. They must not include storage object keys, signed URLs, service role keys, raw storage error payloads, user id, email, script text, transcript, raw audio, or provider ids.

## Self-Test

Run:

```bash
npm run account-deletion:storage-cleanup:self-test
```

The self-test verifies:

- actual Storage cleanup service exists,
- destructive guard is required,
- request/stage/provider guard is present,
- fake Storage adapter seam exists,
- Supabase Storage `.remove()` is isolated behind service boundary,
- Storage cleanup failure stops DB / Auth cleanup,
- upload kill switch and destructive cleanup guard are separate,
- `.env.example` documents the destructive guard as off by default.

The self-test does not call Supabase Storage.

## Remaining Before Store Submission

- Operator/admin execution surface for actual provider + Storage cleanup sequence.
- Disposable-account proof with destructive guard enabled.
- DB cleanup / anonymize actual.
- Supabase Auth deletion actual.
- Completion/status tracking after Auth deletion.
- Public policy text aligned to actual deletion behavior.
