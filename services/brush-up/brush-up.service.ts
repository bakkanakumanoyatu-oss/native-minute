import "server-only";

import { randomUUID } from "node:crypto";
import { AppError } from "@/lib/errors";
import { assertScriptBrushUpEnabled, isScriptBrushUpEnabled } from "@/lib/brush-up/capability";
import { getScriptLengthError } from "@/lib/script-length";
import { buildScriptAudioPlaybackPath, parseScriptAudioPlaybackPath } from "@/lib/voice-playback-path";
import type { AppSupabaseClient } from "@/lib/supabase/client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createConfiguredVoiceProvider, getVoiceProviderStatus } from "@/providers/voice";
import { createElevenLabsVoiceDeletionProviderAdapter } from "@/providers/voice-deletion";
import type { VoiceProvider } from "@/providers/voice";
import type { VoiceDeletionProviderAdapter } from "@/providers/voice-deletion";
import { readBetaQuotaPolicy } from "@/services/quota/beta-quota-policy";
import { reserveBetaQuota } from "@/services/quota/beta-quota.service";
import { createAccountDeletionStorageAdapter } from "@/services/account-deletion/account-deletion-storage-adapter";
import { getScript } from "@/services/scripts/scripts.service";
import { getOwnedTakeAudioIdentity } from "@/services/takes/take-audio-identity";
import { loadOwnedTakeAudio } from "@/services/takes/take-audio.service";
import { getCachedListenAudio } from "@/services/voice/voice.service";
import { encodeStoredAssetMetadata, stageScriptAudioForReplay } from "@/services/voice/replay.service";
import { buildScriptAudioStorageObjectKey } from "@/services/voice/replay-storage";
import type { Database } from "@/types/database";

type Take = Database["public"]["Tables"]["takes"]["Row"];
type Candidate = Database["public"]["Tables"]["script_brush_up_candidates"]["Row"];
type Consent = Database["public"]["Tables"]["script_brush_up_consents"]["Row"];
type Audio = Database["public"]["Tables"]["script_audios"]["Row"];
type Admin = ReturnType<typeof createSupabaseAdminClient>;

export type BrushUpView = {
  candidateId: string;
  status: Candidate["status"];
  isCurrentRevision: boolean;
  baselineAudioId: string | null;
  candidateAudioId: string | null;
  baselineAudioUrl: string | null;
  candidateAudioUrl: string | null;
  cleanupPending: boolean;
  manualCleanupRequired: boolean;
};

function failed(message: string, status = 503): never { throw new AppError(status, message); }

async function ownedTake(client: AppSupabaseClient, userId: string, scriptId: string, takeId: string, revisionId: string) {
  const script = await getScript(client, userId, scriptId);
  if (!script || script.archivedAt || script.currentRevisionId !== revisionId) {
    failed("台本の版を確認してください。", 409);
  }
  const { data, error } = await client.from("takes").select("*").eq("id", takeId)
    .eq("user_id", userId).eq("script_id", scriptId).maybeSingle();
  if (error) failed("保存済みTakeを確認できませんでした。");
  const take = data as Take | null;
  if (!take || !["reviewed", "completed"].includes(take.status)
    || !take.script_revision_id || take.script_revision_id !== revisionId) {
    failed("このTakeは台本専用のお手本候補に利用できません。", 409);
  }
  const identity = await getOwnedTakeAudioIdentity(client, userId, take);
  if (!identity) failed("保存済みTakeの録音を確認できませんでした。", 409);
  return { script, take, identity };
}

async function candidateForOwner(client: AppSupabaseClient | Admin, userId: string, candidateId: string) {
  const { data, error } = await (client as AppSupabaseClient).from("script_brush_up_candidates").select("*")
    .eq("id", candidateId).eq("user_id", userId).maybeSingle();
  if (error) failed("お手本候補を確認できませんでした。");
  const candidate = data as Candidate | null;
  if (!candidate) failed("お手本候補が見つかりません。", 404);
  return candidate;
}

async function candidateAudio(client: AppSupabaseClient | Admin, candidate: Candidate, audioId: string) {
  const { data, error } = await (client as AppSupabaseClient).from("script_audios").select("*").eq("id", audioId)
    .eq("script_id", candidate.script_id).eq("script_revision_id", candidate.script_revision_id).maybeSingle();
  if (error) failed("お手本音声を確認できませんでした。");
  const audio = data as Audio | null;
  if (!audio) failed("お手本音声が見つかりません。", 404);
  return audio;
}

async function transition(admin: Admin, userId: string, candidateId: string, action: string, providerVoiceId?: string) {
  const { data, error } = await admin.rpc("transition_script_brush_up_candidate", {
    p_user_id: userId, p_candidate_id: candidateId, p_action: action,
    p_provider_voice_id: providerVoiceId ?? null
  });
  if (error || !data) failed("お手本候補の状態を保存できませんでした。");
  return data as Candidate;
}

export async function acceptScriptBrushUpConsent(client: AppSupabaseClient, userId: string, input: {
  scriptId: string; takeId: string; revisionId: string;
}) {
  assertScriptBrushUpEnabled();
  const eligible = await ownedTake(client, userId, input.scriptId, input.takeId, input.revisionId);
  const { data, error } = await createSupabaseAdminClient().rpc("accept_script_brush_up_consent", {
    p_user_id: userId,
    p_script_id: input.scriptId,
    p_take_id: input.takeId,
    p_revision_id: input.revisionId,
    p_recording_identity: eligible.identity
  });
  if (error || !data) failed("専用同意を保存できませんでした。");
  return { consentId: (data as Consent).id };
}

export async function withdrawScriptBrushUpConsent(client: AppSupabaseClient, consentId: string) {
  assertScriptBrushUpEnabled();
  const { data, error } = await (client as unknown as { rpc(name: string, args: Record<string, unknown>): Promise<{ data: boolean | null; error: { message: string } | null }> }).rpc("withdraw_script_brush_up_consent", { p_consent_id: consentId });
  if (error) failed("候補の処理または片付けが終わってから同意を撤回してください。", 409);
  return { withdrawn: data === true };
}

export async function getScriptBrushUpView(client: AppSupabaseClient, userId: string, scriptId: string, takeId: string): Promise<BrushUpView | null> {
  if (!isScriptBrushUpEnabled()) return null;
  const { data, error } = await client.from("script_brush_up_candidates").select("*")
    .eq("user_id", userId).eq("script_id", scriptId).eq("source_take_id", takeId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) failed("お手本候補を確認できませんでした。");
  const candidate = data as Candidate | null;
  if (!candidate) return null;
  const script = await getScript(client, userId, scriptId);
  if (!script) return null;
  const baseline = candidate.baseline_script_audio_id
    ? await candidateAudio(client, candidate, candidate.baseline_script_audio_id) : null;
  const generated = candidate.candidate_script_audio_id
    ? await candidateAudio(client, candidate, candidate.candidate_script_audio_id) : null;
  const baselinePlaybackId = baseline ? parseScriptAudioPlaybackPath(baseline.storage_path) : null;
  const candidatePlaybackId = generated ? parseScriptAudioPlaybackPath(generated.storage_path) : null;
  if ((baseline && !baselinePlaybackId) || (generated && !candidatePlaybackId)) failed("お手本音声の再生参照を確認できませんでした。");
  return {
    candidateId: candidate.id,
    status: candidate.status,
    isCurrentRevision: !script.archivedAt && script.currentRevisionId === candidate.script_revision_id,
    baselineAudioId: baselinePlaybackId,
    candidateAudioId: candidate.status === "ready" || candidate.status === "adopted" ? candidatePlaybackId : null,
    baselineAudioUrl: baseline?.storage_path ?? null,
    candidateAudioUrl: candidate.status === "ready" || candidate.status === "adopted" ? generated?.storage_path ?? null : null,
    cleanupPending: !["not_created", "verified_absent"].includes(candidate.provider_cleanup_state)
      || ["pending", "failed"].includes(candidate.asset_cleanup_state),
    manualCleanupRequired: candidate.provider_cleanup_state === "create_unknown"
  };
}

async function cleanupProvider(admin: Admin, userId: string, candidateId: string, providerVoiceId: string,
  deletion: VoiceDeletionProviderAdapter) {
  // A lost DB response must not strand a known remote voice in this process.
  try { await transition(admin, userId, candidateId, "delete_pending"); }
  catch { /* A remote cleanup attempt is still required for this known ID. */ }
  await deletion.deleteVoice({ providerResourceId: providerVoiceId });
  const absence = await deletion.reconcileVoiceAbsence({ providerResourceId: providerVoiceId });
  if (absence.kind !== "verified_absent") {
    try {
      const current = await candidateForOwner(admin, userId, candidateId);
      if (current.provider_cleanup_state === "delete_pending") await transition(admin, userId, candidateId, "delete_failed");
      else if (current.provider_cleanup_state === "create_unknown") await transition(admin, userId, candidateId, "create_unknown");
    } catch { /* The existing unresolved DB state continues to block reuse. */ }
    failed("一時voiceの削除を確認できませんでした。手動確認が必要です。");
  }
  const current = await candidateForOwner(admin, userId, candidateId);
  return transition(admin, userId, candidateId,
    current.provider_candidate_voice_id === providerVoiceId ? "provider_absent" : "provider_absent_unrecorded");
}

async function removeCandidateStorage(admin: Admin, userId: string, candidate: Candidate) {
  const key = candidate.candidate_storage_object_key;
  if (!key || !key.startsWith(`${userId}/${candidate.script_id}/${candidate.id}/`)) {
    failed("候補音声の保存先を確認できませんでした。");
  }
  const storage = createAccountDeletionStorageAdapter();
  const target = { userId, targetKind: "script_audio" as const, objectKey: key };
  const deletion = await storage.deleteObject(target);
  const absence = await storage.verifyObjectAbsence(target);
  if (deletion.kind !== "request_succeeded" || absence.kind !== "absent") {
    await transition(admin, userId, candidate.id, "asset_cleanup_failed");
    failed("候補音声の削除を確認できませんでした。手動確認が必要です。");
  }
  const result = await admin.rpc("finish_script_brush_up_asset_cleanup", {
    p_user_id: userId, p_candidate_id: candidate.id
  });
  if (result.error || !result.data) failed("候補音声の片付けを確定できませんでした。");
}

export async function generateScriptBrushUpCandidate(client: AppSupabaseClient, userId: string, input: {
  scriptId: string; takeId: string; revisionId: string; consentId: string; operationId: string;
}, dependencies: { admin?: Admin; provider?: VoiceProvider; deletion?: VoiceDeletionProviderAdapter } = {}) {
  assertScriptBrushUpEnabled();
  const policy = readBetaQuotaPolicy();
  if (!policy?.script_brush_up_candidate_generation) failed("台本専用のお手本候補の利用上限設定を確認できませんでした。");
  const providerStatus = getVoiceProviderStatus();
  if (providerStatus.provider !== "elevenlabs" || !providerStatus.supported) {
    failed("台本専用のお手本候補の音声サービスを利用できません。");
  }
  const eligible = await ownedTake(client, userId, input.scriptId, input.takeId, input.revisionId);
  const lengthError = getScriptLengthError(eligible.script.content);
  if (lengthError) failed(`${lengthError} 台本本文を編集してください。`, 400);
  const { data: consentData, error: consentError } = await client.from("script_brush_up_consents")
    .select("*").eq("id", input.consentId).eq("user_id", userId).eq("status", "active").maybeSingle();
  const consent = consentData as Consent | null;
  if (consentError || !consent || consent.script_id !== input.scriptId || consent.script_revision_id !== input.revisionId
    || consent.source_take_id !== input.takeId || consent.source_recording_identity !== eligible.identity) {
    failed("選択したTakeへの専用同意を確認できませんでした。", 409);
  }
  const sourceAudio = await loadOwnedTakeAudio(client, userId, input.takeId);
  if (sourceAudio.audioIdentity !== eligible.identity) failed("録音が変更されました。選び直してください。", 409);
  const baseline = await getCachedListenAudio(client, userId, input.scriptId, {
    expectedRevisionId: input.revisionId, expectedPracticeEpoch: eligible.script.practiceEpoch
  });
  const baselinePlaybackId = baseline && parseScriptAudioPlaybackPath(baseline.audioUrl);
  if (!baselinePlaybackId) failed("先に元のお手本音声を聞いてから候補を作ってください。", 409);
  const { data: baselineRow, error: baselineError } = await client.from("script_audios").select("*")
    .eq("script_id", input.scriptId).eq("script_revision_id", input.revisionId)
    .eq("storage_path", baseline.audioUrl).maybeSingle();
  const baselineAudioRow = baselineRow as Audio | null;
  if (baselineError || !baselineAudioRow || baselineAudioRow.generation_preset === "brush_up_candidate") {
    failed("元のお手本音声を確認できませんでした。", 409);
  }
  const admin = dependencies.admin ?? createSupabaseAdminClient();
  const provider = dependencies.provider ?? createConfiguredVoiceProvider();
  const deletion = dependencies.deletion ?? createElevenLabsVoiceDeletionProviderAdapter();
  const quota = await reserveBetaQuota({ userId, kind: "script_brush_up_candidate_generation", operationId: input.operationId }, { policy });
  if (!quota.reservationId) failed("台本専用のお手本候補の利用上限を確認できませんでした。");
  const started = await admin.rpc("begin_script_brush_up_candidate", {
    p_user_id: userId, p_consent_id: consent.id, p_baseline_audio_id: baselineAudioRow.id,
    p_quota_reservation_id: quota.reservationId
  });
  if (started.error || !started.data) {
    await quota.releaseIfUnreached();
    failed("前の候補の片付けを終えてから作り直してください。", 409);
  }
  quota.acknowledgeAtomicProviderStart();
  let candidate = started.data as Candidate;
  let providerVoiceId: string | null = null;
  let cleanupAttempted = false;
  try {
    try {
      const created = await provider.createVoice({
        userId, consentId: consent.id, label: candidate.provider_operation_label,
        sampleAudioBytes: { bytes: sourceAudio.bytes, contentType: sourceAudio.contentType, filename: sourceAudio.filename }
      });
      providerVoiceId = created.providerVoiceId;
    } catch (error) {
      await transition(admin, userId, candidate.id, "create_unknown");
      throw error;
    }
    try {
      candidate = await transition(admin, userId, candidate.id, "provider_created", providerVoiceId);
    } catch (error) {
      cleanupAttempted = true;
      try { candidate = await cleanupProvider(admin, userId, candidate.id, providerVoiceId, deletion); }
      catch { /* DB or remote cleanup remains unresolved and blocks reuse. */ }
      throw error;
    }
    const synthesized = await provider.synthesize({ providerVoiceId, text: eligible.script.content, locale: eligible.script.locale });
    const storageKey = buildScriptAudioStorageObjectKey({
      userId, scriptId: input.scriptId, voiceId: candidate.id, cacheKey: candidate.id, contentType: "audio/mpeg"
    });
    const reserved = await admin.rpc("reserve_script_brush_up_asset", {
      p_user_id: userId, p_candidate_id: candidate.id, p_object_key: storageKey
    });
    if (reserved.error || !reserved.data) failed("候補音声の保存を予約できませんでした。");
    candidate = reserved.data as Candidate;
    const staged = await stageScriptAudioForReplay({
      storageClient: client, userId, scriptId: input.scriptId, voiceId: candidate.id,
      cacheKey: candidate.id,
      synthesized: { ...synthesized, playbackPath: buildScriptAudioPlaybackPath(randomUUID()) },
      reservedStorageObjectKey: storageKey
    });
    const finalized = await admin.rpc("finalize_script_brush_up_audio", {
      p_user_id: userId, p_candidate_id: candidate.id,
      p_storage_path: staged.storagePath, p_stored_asset: encodeStoredAssetMetadata(staged.storedAsset)
    });
    if (finalized.error || !finalized.data) failed("候補音声の保存を確定できませんでした。");
    candidate = finalized.data as Candidate;
    cleanupAttempted = true;
    candidate = await cleanupProvider(admin, userId, candidate.id, providerVoiceId, deletion);
    await quota.consume();
    return { candidateId: candidate.id, status: candidate.status };
  } catch (error) {
    if (providerVoiceId && !cleanupAttempted) {
      try { candidate = await cleanupProvider(admin, userId, candidate.id, providerVoiceId, deletion); }
      catch { /* durable delete_failed state prevents reuse and account deletion seal */ }
    }
    try {
      const latest = await candidateForOwner(admin, userId, candidate.id);
      if (latest.asset_cleanup_state === "pending" && latest.status === "failed") {
        try { await removeCandidateStorage(admin, userId, latest); }
        catch { /* durable asset_cleanup_state prevents replacement */ }
      }
    } catch {
      // The quota remains charged if DB cannot confirm cleanup.
    }
    await quota.failAfterProviderStart();
    throw error;
  }
}

export async function decideScriptBrushUpCandidate(client: AppSupabaseClient, userId: string, candidateId: string,
  decision: "adopt" | "reject" | "rollback") {
  assertScriptBrushUpEnabled();
  const candidate = await candidateForOwner(client, userId, candidateId);
  const script = await getScript(client, userId, candidate.script_id);
  if (!script || (decision === "adopt" && (script.archivedAt || script.currentRevisionId !== candidate.script_revision_id))) {
    failed("台本の版が変わりました。この候補は現在の台本へ採用できません。", 409);
  }
  const admin = createSupabaseAdminClient();
  const changed = await transition(admin, userId, candidateId, decision);
  if (decision !== "adopt") await removeCandidateStorage(admin, userId, changed);
  return { candidateId, status: changed.status };
}

export async function retryScriptBrushUpCleanup(userId: string, candidateId: string,
  dependencies: { admin?: Admin; deletion?: VoiceDeletionProviderAdapter } = {}) {
  assertScriptBrushUpEnabled();
  const admin = dependencies.admin ?? createSupabaseAdminClient();
  let candidate = await candidateForOwner(admin, userId, candidateId);
  if (candidate.provider_candidate_voice_id && ["present", "delete_failed", "delete_pending"].includes(candidate.provider_cleanup_state)) {
    candidate = await cleanupProvider(admin, userId, candidate.id, candidate.provider_candidate_voice_id,
      dependencies.deletion ?? createElevenLabsVoiceDeletionProviderAdapter());
  }
  if (candidate.asset_cleanup_state === "pending" || candidate.asset_cleanup_state === "failed") {
    await removeCandidateStorage(admin, userId, candidate);
  }
}

// The account-deletion Provider stage calls this before sealing its ordinary
// voice snapshot. Each invocation makes at most one external provider request.
export async function advanceAccountDeletionBrushUpProviderCleanup(userId: string,
  dependencies: { admin?: Admin; deletion?: VoiceDeletionProviderAdapter } = {}) {
  const admin = dependencies.admin ?? createSupabaseAdminClient();
  const { data, error } = await admin.from("script_brush_up_candidates").select("*")
    .eq("user_id", userId).in("provider_cleanup_state", ["create_unknown", "present", "delete_pending", "delete_failed"])
    .order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (error) failed("候補voiceの片付け状態を確認できませんでした。");
  const candidate = data as Candidate | null;
  if (!candidate) {
    // A worker may stop after strict provider absence was recorded but before
    // the composite quota reached a terminal state. Settle one such row per
    // operator step before the account Provider snapshot can seal.
    const { data: settledCandidates, error: settledError } = await admin.from("script_brush_up_candidates")
      .select("id,status,candidate_script_audio_id,quota_reservation_id")
      .eq("user_id", userId).in("provider_cleanup_state", ["not_created", "verified_absent"])
      .order("created_at", { ascending: true });
    if (settledError) failed("候補の利用上限状態を確認できませんでした。");
    for (const settled of settledCandidates ?? []) {
      const { data: quota, error: quotaError } = await admin.from("beta_quota_reservations")
        .select("status").eq("id", settled.quota_reservation_id).eq("user_id", userId).maybeSingle();
      if (quotaError || !quota) failed("候補の利用上限状態を確認できませんでした。");
      if (quota.status !== "provider_started") continue;
      const action = settled.candidate_script_audio_id && settled.status !== "failed" ? "consumed" : "failed_or_unknown";
      const result = await admin.rpc("transition_beta_provider_quota", {
        p_user_id: userId, p_reservation_id: settled.quota_reservation_id, p_transition: action
      });
      if (result.error || result.data !== action) failed("候補の利用上限状態を確定できませんでした。");
      return { kind: "progressed" as const, externalActions: 0 };
    }
    return { kind: "none" as const, externalActions: 0 };
  }
  if (candidate.provider_cleanup_state === "create_unknown" || !candidate.provider_candidate_voice_id) {
    return { kind: "manual_required" as const, externalActions: 0 };
  }
  const deletion = dependencies.deletion ?? createElevenLabsVoiceDeletionProviderAdapter();
  if (candidate.provider_cleanup_state === "delete_pending") {
    const result = await deletion.reconcileVoiceAbsence({ providerResourceId: candidate.provider_candidate_voice_id });
    if (result.kind === "verified_absent") {
      await transition(admin, userId, candidate.id, "provider_absent");
      return { kind: "progressed" as const, externalActions: 1 };
    }
    if (result.kind === "present") await transition(admin, userId, candidate.id, "delete_failed");
    return { kind: "retry_later" as const, externalActions: 1 };
  }
  await transition(admin, userId, candidate.id, "delete_pending");
  await deletion.deleteVoice({ providerResourceId: candidate.provider_candidate_voice_id });
  return { kind: "progressed" as const, externalActions: 1 };
}
