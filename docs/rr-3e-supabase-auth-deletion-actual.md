# RR-3e Supabase Auth Deletion Actual

RR-3e は actual account deletion path の final destructive stage である Supabase Auth deletion を実装境界まで進めた段階です。通常実行では Supabase Auth user delete は呼ばれません。

## Scope

- 対象: deletion request に紐づく Supabase Auth user deletion stage.
- 非対象: provider cleanup actual、Storage cleanup actual、DB cleanup / anonymize actual、completion notification、public cleanup UI。
- 前提:
  - provider cleanup が `succeeded` または `not_needed`
  - Storage cleanup が `succeeded` または `not_needed`
  - DB cleanup が `succeeded` または `not_needed`
  - Auth deletion は必ず最後

## Implementation Boundary

追加済み:

- `runSupabaseAuthDeletionActual` in `services/account-deletion/account-deletion.service.ts`
  - confirmed request を server-side で再取得する。
  - latest Auth dry-run を server-side で再取得する。
  - client から Auth user id、email、token、cleanup target を受け取らない。
  - destructive guard が off の場合は Supabase Auth delete も status update も行わない。
  - success / failed / manual_required を safe summary として返す。
- `deleteSupabaseAuthUserForAccountDeletion`
  - Supabase Auth admin `.deleteUser()` を service 境界内に閉じる。
  - service role key、token、raw Auth response、email は client / docs / logs に出さない。
- `npm run account-deletion:auth-cleanup:self-test`
  - real Supabase Auth delete を呼ばない static/self-test。
  - destructive guard、request/status guard、provider/storage/DB stage guard、fake auth adapter seam、safe output を確認する。

追加していない:

- Public API route for actual Auth deletion.
- Settings の実削除ボタン。
- Completion notification。
- Real Supabase Auth user delete の実行。

## Destructive Guard

Actual Supabase Auth deletion requires all of the following:

- Active request is server-side re-fetched.
- Caller provides matching deletion request id.
- Request status is `confirmed` or `auth_cleanup_failed`.
- Provider cleanup stage is `succeeded` or `not_needed`.
- Storage cleanup stage is `succeeded` or `not_needed`.
- DB cleanup stage is `succeeded` or `not_needed`.
- Auth cleanup stage is `pending`, `failed`, or `manual_required`.
- Latest Auth dry-run is runnable.
- Service role / admin boundary is available server-side.
- `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE=1`.

If the destructive guard is missing, the service returns `blocked` and does not:

- call Supabase Auth admin `.deleteUser()`,
- update `account_deletion_requests`,
- create any public deletion surface.

## Status / Completion Tracking

The Auth deletion actual service can update only Auth cleanup and completion tracking state.

| Condition | Request status | Auth cleanup status | Notification status |
| --- | --- | --- | --- |
| Auth cleanup already satisfied | unchanged | unchanged | unchanged |
| Dry-run blocked | `auth_cleanup_failed` | `manual_required` | unchanged |
| Auth delete permission / missing user state | `auth_cleanup_failed` | `manual_required` | unchanged |
| Auth delete transient/provider failure | `auth_cleanup_failed` | `failed` | unchanged |
| Auth delete succeeds | `completed` | `succeeded` | `not_needed` |

After Supabase Auth deletion succeeds, `account_deletion_requests.user_id` is expected to become `null` through `on delete set null`. Completion tracking uses the retained request row by request id and the opaque `anonymized_user_ref`. No schema change was needed for RR-3e.

Completion notification is not implemented in this phase. For the guarded v1 path, successful Auth deletion marks `notification_status=not_needed`.

## Failure Classification

Supabase Auth deletion failure is classified into safe reason codes:

- `auth_delete_permission_denied`
- `auth_delete_user_not_found`
- `auth_delete_rate_limited`
- `auth_delete_unavailable`
- `auth_delete_failed`
- `auth_cleanup_blocked`

Server logs may include operation and safe reason code. They must not include raw user id, email, session, token, service role key, raw Auth payload, provider response, storage path, script text, transcript, or raw audio.

## Self-Test

Run:

```bash
npm run account-deletion:auth-cleanup:self-test
```

The self-test verifies:

- actual Supabase Auth deletion service exists,
- destructive guard is required,
- request/stage/provider/storage/DB guard is present,
- fake Auth admin adapter seam exists,
- Supabase Auth admin `.deleteUser()` is isolated behind service boundary,
- Auth deletion waits for all prior stages,
- completion tracking uses existing schema after `user_id` can become null,
- `.env.example` documents the destructive guard as off by default.

The self-test does not call Supabase Auth.

## Remaining Before Store Submission

- Operator/admin execution surface for provider -> Storage -> DB -> Auth sequence.
- Disposable-account proof with destructive guard enabled.
- End-to-end destructive audit that confirms provider, Storage, DB, Auth, and completion behavior on a sacrificial account.
- Completion/support communication policy and public policy text aligned to actual deletion behavior.
