# G5C-A Voice-only Deletion Foundation

Status: `REMEDIATION_IMPLEMENTED_PENDING_INDEPENDENT_REAUDIT`

Scope: `HDC_G5C_VOICE_ONLY_DELETION_SEMANTICS_V1` の G5C-A に限定した、非破壊の inventory / snapshot / dry-run / verifier foundation。Gate 5 全体および G5C-B 以降は開始しない。

## G5C-A P1 remediation (repository only)

- `HDC_G5C_VOICE_BINDING_SERVER_OWNED_PROVENANCE_V1` を適用した。migration `0014_g5c_voice_binding_server_owned.sql` は authenticated の `voices` INSERT / UPDATE / DELETE policy を削除し、既存の owner SELECT は維持する。Staging / Production には未適用で、actual RLS proof は独立再監査で必要。
- 正規 voice 作成は request client で authenticated user を再解決し、provider `createVoice` が返した `providerVoiceId` だけを service-role server client で `voices` binding として保存する。default binding の切替も同じ server-only writer を使う。
- Storage walker は深さ4を維持する。更に下位の visible branch は `truncated` として `manual_required` candidate にし、safe dry-run の `storageListingTruncatedCount` に表す。listing error は従来どおり `unavailable` / manual review で、深い object を削除 target と推測しない。

## Implemented boundary

- `VoiceOnlyDeletionOperationStatus` と `VoiceOnlyDeletionTargetStatus` を別型にした。operation は `pending / processing / failed / manual_required / completed`、target は `pending / processing / deleted / verified_absent / failed / manual_required` を表す。
- `collectVoiceOnlyDeletionSnapshot` は認証済み route client と server-resolved `userId` のみを受ける。client が provider voice ID、Storage key、voice ID 一覧を指定する入口はない。
- ElevenLabs の app-owned voice、voice sample、legacy `voice_consents` に結び付く consent recording、当該 voice ID + provider が一致する `script_audios`、関連する `script_saved_model_audios`、default binding を内部専用 snapshot へ決定的に収集する。
- `GET /api/voice-deletion/dry-run` は内部 snapshot を返さず、safe な対象件数、保持対象、manual-required / legacy-orphan 件数、verifier readiness だけを返す。
- `verifyVoiceOnlyDeletionSnapshot` は read-only foundation として、current ElevenLabs/default binding、snapshot 上の script audio / saved model audio、snapshot Storage object、canonical voice-cloning consent を再照合する。ElevenLabs provider の absence はこの段階では `not_checked` に固定し、将来の独立した absence reconciliation を必須にする。

## Safety rules fixed

- `recordings`、practice recordings、takes、transcripts、scores、weak words、coach feedback、scripts、latest / best / progress、`script_saved_best_takes`、profile、account / auth session は target snapshot に入れない。
- `voice_id IS NULL`、unknown voice attribution、provider mismatch、invalid / empty asset reference、Storage-only object、Storage listing failure / truncation は推測削除せず `manual_required` candidate とする。
- canonical `processing_consents` は snapshot で state を読むだけで、physical delete しない。将来の execution は current `voice_cloning` consent を withdraw する必要があるが、G5C-A は consent mutation を行わない。
- `voice_consents` workflow row 自体は target に含めず、今回 scrub / delete しない。そこから安全に読める app-owned consent-recording reference だけを storage target にできる。
- account-deletion engine、provider delete interface、ElevenLabs mutation、Storage delete、DB binding delete、consent withdrawal は使用していない。

## Persistence and migration boundary

G5C-A は actual execution、retry、crash recovery を開始しないため、snapshot は serializable internal contract のみで、DB へ永続化しない。実 deletion で DB binding を消した後にも retry / reconciliation を保証する段階では durable operation + target snapshot state が必要であり、その段階では migration を追加せずに進めない。

## Repository proof

`apps/mobile/tests/voice-only-deletion-foundation.test.ts` は以下を固定する。

- User A inventory / storage listing に User B の voice、sample、consent recording、script audio、saved model audio が混入しない。
- `script_saved_model_audios` は target model-audio reference として分類される。
- recordings / takes / review / progress / saved best take は safe dry-run の保持対象であり target count に入らない。
- unknown / legacy / Storage-only object は manual-required であり target へ昇格しない。
- safe dry-run payload に provider ID、Storage path/key、user ID が含まれない。
- G5C-A service は account-deletion engine を import / invoke しない。

`apps/mobile/tests/voice-binding-server-owned-provenance.test.ts` は、migration の authenticated voice mutation policy 不在、owner read 維持、server-side re-authentication、provider-returned ID のみの binding 保存、mismatched owner の provider/write 前拒否を固定する。Repository contract test であり、actual Staging RLS proof の代替ではない。

## Deliberately not implemented

- persistent operation or snapshot rows / migration
- explicit confirmation UI
- provider common delete capability
- ElevenLabs or Storage mutation
- DB voice binding deletion
- canonical consent withdrawal runtime
- post-delete live proof

G5C-B へは自動進行しない。
