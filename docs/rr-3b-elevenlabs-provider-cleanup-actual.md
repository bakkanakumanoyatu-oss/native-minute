# RR-3b ElevenLabs Provider Cleanup Actual

RR-3b は actual account deletion path の最初の destructive stage である ElevenLabs provider cleanup を実装境界まで進めた段階です。通常実行では ElevenLabs voice delete は呼ばれません。

## Scope

- 対象: ElevenLabs provider-side cloned voice cleanup stage.
- 非対象: Storage cleanup、DB cleanup / anonymize、Supabase Auth deletion、completion notification、public cleanup UI。
- Provider 役割: voice provider は ElevenLabs。OpenAI voice ではない。

## Implementation Boundary

追加済み:

- `deleteElevenLabsVoiceForAccountDeletion` in `providers/voice/elevenlabs.ts`
  - `DELETE /v1/voices/:voice_id` を adapter 境界に閉じる。
  - `xi-api-key` は server-only。
  - `provider_voice_id` は server-only。
  - raw provider response body は DB / client / docs に保存しない。
- `runElevenLabsProviderCleanupActual` in `services/account-deletion/account-deletion.service.ts`
  - owned `voices` rows を server-side で再取得する。
  - `provider_voice_id` を client から受け取らない。
  - destructive guard が off の場合は provider delete も status update も行わない。
  - success / failed / manual_required / not_needed を safe summary として返す。
- `npm run account-deletion:provider-cleanup:self-test`
  - real ElevenLabs API を呼ばない static/self-test。
  - destructive guard、request/status guard、fake adapter seam、safe output を確認する。

追加していない:

- Public API route for actual provider cleanup.
- Settings の実削除ボタン。
- Storage / DB / Auth cleanup actual。
- Real ElevenLabs delete の実行。

## Destructive Guard

Actual provider cleanup requires all of the following:

- Active request is server-side re-fetched.
- Caller provides matching deletion request id.
- Request status is `confirmed` or `provider_cleanup_failed`.
- Provider cleanup stage is `pending`, `failed`, or `manual_required`.
- Latest provider dry-run is not `blocked`.
- `NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE=1`.
- `NATIVE_MINUTE_DISABLE_ELEVENLABS` is not enabled.

If the destructive guard is missing, the service returns `blocked` and does not:

- call ElevenLabs,
- update `account_deletion_requests`,
- advance Storage / DB / Auth cleanup.

## Status Update Behavior

The provider cleanup actual service can update only provider cleanup state.

| Condition | Request status | Provider cleanup status |
| --- | --- | --- |
| No ElevenLabs candidates | `confirmed` | `not_needed` |
| All deletes succeed | `confirmed` | `succeeded` |
| Dry-run blocked | `provider_cleanup_failed` | `manual_required` |
| Provider not found / invalid reference | `provider_cleanup_failed` | `manual_required` |
| Auth/rate/provider failure | `provider_cleanup_failed` | `failed` |

Later stages remain untouched. Storage cleanup must still wait for provider cleanup to become `succeeded` or `not_needed`.

## Failure Classification

ElevenLabs delete failure is classified into safe reason codes:

- `elevenlabs_voice_delete_auth_failed`
- `elevenlabs_voice_delete_rate_limited`
- `elevenlabs_voice_delete_not_found`
- `elevenlabs_voice_delete_invalid_provider_reference`
- `elevenlabs_voice_delete_provider_unavailable`
- `elevenlabs_voice_delete_provider_rejected`

Server logs may include operation, failure point, HTTP status, classification, request id, provider code/type when available. They must not include `provider_voice_id`, API key, raw provider body, script text, transcript, raw audio, signed URL, or storage path.

## Self-Test

Run:

```bash
npm run account-deletion:provider-cleanup:self-test
```

The self-test verifies:

- actual provider cleanup service exists,
- destructive guard is required,
- request/stage guard is present,
- fake adapter seam exists,
- ElevenLabs adapter uses `DELETE /v1/voices/:voice_id`,
- delete failure logs use safe classification,
- provider cleanup failure stops later stages,
- `.env.example` documents the destructive guard as off by default.

The self-test does not call ElevenLabs.

## Remaining Before Store Submission

- Operator/admin execution surface for actual provider cleanup.
- Disposable-account proof with destructive guard enabled.
- Storage cleanup actual.
- DB cleanup / anonymize actual.
- Supabase Auth deletion actual.
- Completion/status tracking after Auth deletion.
- Public policy text aligned to actual deletion behavior.
