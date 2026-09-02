import { AppError } from "@/lib/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServiceRoleKey } from "@/lib/supabase/config";
import type { Database, Json, VoiceAssetWriteIntentKind } from "@/types/database";

type IntentRow = Database["public"]["Tables"]["voice_asset_write_intents"]["Row"];
type VoiceRow = Database["public"]["Tables"]["voices"]["Row"];
type ScriptAudioRow = Database["public"]["Tables"]["script_audios"]["Row"];
type ServiceRoleClient = ReturnType<typeof createSupabaseAdminClient>;
type RpcError = { message: string };

export type VoiceAssetWriteReservation = {
  intentId: string;
  leaseToken: string;
};

function asRpcResult<TRow>(value: unknown) {
  return value as { data: TRow | null; error: RpcError | null };
}

function mapIntentError(error: RpcError) {
  const message = error.message.toLowerCase();

  if (
    message.includes("voice_deletion_active")
    || message.includes("account_deletion_active")
    || message.includes("voice_asset_writer_in_progress")
  ) {
    return new AppError(409, "削除処理または別の音声保存処理が進行中です。完了後にもう一度お試しください。");
  }

  return new AppError(500, "voice asset の安全な保存予約に失敗しました。");
}

function assertIntent(row: IntentRow | null, leaseToken: string): VoiceAssetWriteReservation {
  if (!row?.id || row.status !== "reserved" || row.lease_token !== leaseToken) {
    throw new AppError(500, "voice asset の保存予約を確認できませんでした。");
  }

  return { intentId: row.id, leaseToken };
}

export function createVoiceAssetWriteIntentRepository(
  injectedClient?: ServiceRoleClient
) {
  if (!injectedClient && !getSupabaseServiceRoleKey().trim()) {
    throw new AppError(503, "voice asset の保存に必要なサーバー設定が未完了です。");
  }

  const client = injectedClient ?? createSupabaseAdminClient();
  async function reserve(input: {
    userId: string;
    kind: VoiceAssetWriteIntentKind;
    leaseToken: string;
    leaseSeconds: number;
    scriptId?: string | null;
    voiceId?: string | null;
    cacheKey?: string | null;
    storageBucket?: string | null;
    storageObjectKey?: string | null;
  }) {
    const result = asRpcResult<IntentRow>(await client.rpc("reserve_voice_asset_write_intent", {
      p_user_id: input.userId,
      p_kind: input.kind,
      p_lease_token: input.leaseToken,
      p_lease_seconds: input.leaseSeconds,
      p_script_id: input.scriptId ?? null,
      p_voice_id: input.voiceId ?? null,
      p_cache_key: input.cacheKey ?? null,
      p_storage_bucket: input.storageBucket ?? null,
      p_storage_object_key: input.storageObjectKey ?? null
    }));

    if (result.error) {
      throw mapIntentError(result.error);
    }

    return assertIntent(result.data, input.leaseToken);
  }

  async function cancelKnownNoSideEffect(input: VoiceAssetWriteReservation & { userId: string }) {
    const result = asRpcResult<IntentRow>(await client.rpc("cancel_voice_asset_write_intent", {
      p_intent_id: input.intentId,
      p_user_id: input.userId,
      p_lease_token: input.leaseToken,
      p_known_no_side_effect: true
    }));

    if (result.error || result.data?.status !== "cancelled") {
      throw new AppError(500, "voice asset の未実行予約を安全に解除できませんでした。");
    }

    return result.data;
  }

  async function finalizeUpload(input: VoiceAssetWriteReservation & {
    userId: string;
    storageBucket: "voice-samples" | "voice-consents";
    storageObjectKey: string;
  }) {
    const result = asRpcResult<IntentRow>(await client.rpc("finalize_voice_upload_write_intent", {
      p_intent_id: input.intentId,
      p_user_id: input.userId,
      p_lease_token: input.leaseToken,
      p_storage_bucket: input.storageBucket,
      p_storage_object_key: input.storageObjectKey
    }));

    if (
      result.error
      || result.data?.id !== input.intentId
      || result.data.status !== "completed"
      || result.data.storage_bucket !== input.storageBucket
      || result.data.storage_object_key !== input.storageObjectKey
    ) {
      throw new AppError(500, "voice upload の保存完了を確認できませんでした。手動確認が必要です。");
    }

    return result.data;
  }

  async function finalizeRecordingUpload(input: VoiceAssetWriteReservation & {
    userId: string;
    storageObjectKey: string;
  }) {
    const result = asRpcResult<IntentRow>(await client.rpc("finalize_recording_upload_write_intent", {
      p_intent_id: input.intentId,
      p_user_id: input.userId,
      p_lease_token: input.leaseToken,
      p_storage_object_key: input.storageObjectKey
    }));

    if (
      result.error || result.data?.id !== input.intentId || result.data.status !== "completed" ||
      result.data.storage_bucket !== "recordings" || result.data.storage_object_key !== input.storageObjectKey
    ) {
      throw new AppError(500, "録音 upload の保存完了を確認できませんでした。手動確認が必要です。");
    }

    return result.data;
  }

  async function finalizeVoice(input: VoiceAssetWriteReservation & {
    userId: string;
    consentId: string;
    providerVoiceId: string;
    label: string;
    sampleAudioPath: string | null;
  }) {
    const result = asRpcResult<VoiceRow>(await client.rpc("finalize_voice_create_write_intent", {
      p_intent_id: input.intentId,
      p_user_id: input.userId,
      p_lease_token: input.leaseToken,
      p_consent_id: input.consentId,
      p_provider_voice_id: input.providerVoiceId,
      p_label: input.label,
      p_sample_audio_path: input.sampleAudioPath
    }));

    if (result.error || !result.data?.id) {
      throw new AppError(500, "provider voice の保存完了を確認できませんでした。手動確認が必要です。");
    }

    return result.data;
  }

  async function finalizeScriptAudio(input: VoiceAssetWriteReservation & {
    userId: string;
    provider: string;
    storagePath: string;
    storedAsset: Json;
    durationSeconds: number | null;
  }) {
    const result = asRpcResult<ScriptAudioRow>(await client.rpc("finalize_script_audio_write_intent", {
      p_intent_id: input.intentId,
      p_user_id: input.userId,
      p_lease_token: input.leaseToken,
      p_provider: input.provider,
      p_storage_path: input.storagePath,
      p_stored_asset: input.storedAsset,
      p_duration_seconds: input.durationSeconds
    }));

    if (result.error || !result.data?.id) {
      throw new AppError(500, "見本音声の保存完了を確認できませんでした。手動確認が必要です。");
    }

    return result.data;
  }

  return {
    reserve,
    cancelKnownNoSideEffect,
    finalizeUpload,
    finalizeRecordingUpload,
    finalizeVoice,
    finalizeScriptAudio
  };
}
