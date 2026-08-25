import "server-only";
import { AppError } from "@/lib/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  Database,
  Json,
  VoiceDeletionTargetKind
} from "@/types/database";

type VoiceDeletionOperationRow = Database["public"]["Tables"]["voice_deletion_operations"]["Row"];
type VoiceDeletionTargetRow = Database["public"]["Tables"]["voice_deletion_targets"]["Row"];
type ServiceRoleClient = ReturnType<typeof createSupabaseAdminClient>;
type PostgrestErrorLike = { message: string; code?: string };
type CreateOrGetOperationResult = { operation_id: string; created: boolean };

const ACTIVE_OPERATION_STATUSES = ["pending", "processing", "partial_failure", "manual_required"] as const;

export type VoiceDeletionSnapshotTarget = {
  targetKind: VoiceDeletionTargetKind;
  targetFingerprint: string;
  sourceRowId?: string | null;
  providerName?: string | null;
  providerResourceId?: string | null;
  storageBucket?: string | null;
  storageObjectKey?: string | null;
};

export type VoiceDeletionLeaseClaim = {
  operationId: string;
  userId: string;
  leaseToken: string;
  leaseSeconds: number;
};

export type ProviderVoiceDeleteAttempt = Pick<VoiceDeletionLeaseClaim, "operationId" | "userId" | "leaseToken"> & {
  targetId: string;
  expectedDeleteAttemptCount: number;
};

export type ProviderVoiceDeleteResult = ProviderVoiceDeleteAttempt & {
  result:
    | "deleted"
    | "not_found"
    | "credential_missing"
    | "invalid_provider_reference"
    | "auth_failed"
    | "permission_denied"
    | "rate_limited"
    | "provider_unavailable"
    | "timeout"
    | "network_error"
    | "provider_rejected"
    | "protocol_error";
  retryDelaySeconds: number;
};

export type ProviderVoiceReconciliationAttempt = Pick<VoiceDeletionLeaseClaim, "operationId" | "userId" | "leaseToken"> & {
  targetId: string;
  expectedVerificationAttemptCount: number;
};

export type ProviderVoiceReconciliationResult = ProviderVoiceReconciliationAttempt & {
  result:
    | "present"
    | "verified_absent"
    | "credential_missing"
    | "invalid_provider_reference"
    | "auth_failed"
    | "permission_denied"
    | "rate_limited"
    | "provider_unavailable"
    | "timeout"
    | "network_error"
    | "provider_rejected"
    | "protocol_error";
  ownerSignal: "true" | "false" | "unknown" | null;
  retryDelaySeconds: number;
};

export type StorageObjectTargetKind = Extract<
  VoiceDeletionTargetKind,
  "voice_sample" | "voice_consent_recording" | "script_audio_storage"
>;

export type StorageCleanupStageEntry = Pick<VoiceDeletionLeaseClaim, "operationId" | "userId" | "leaseToken"> & {
  expectedRunnerAttemptCount: number;
};

export type ConsentSnapshotSeal = Pick<VoiceDeletionLeaseClaim, "operationId" | "userId" | "leaseToken"> & {
  expectedRunnerAttemptCount: number;
};

export type ConsentWithdrawal = ConsentSnapshotSeal;
export type DatabaseCleanupStageEntry = ConsentSnapshotSeal;
export type DatabaseTargetCleanup = ConsentSnapshotSeal;
export type PostDeleteVerificationTransition = ConsentSnapshotSeal;

export type StorageObjectDeleteAttempt = Pick<VoiceDeletionLeaseClaim, "operationId" | "userId" | "leaseToken"> & {
  targetId: string;
  expectedDeleteAttemptCount: number;
};

export type StorageObjectDeleteResult = StorageObjectDeleteAttempt & {
  result:
    | "request_succeeded"
    | "timed_out"
    | "rate_limited"
    | "unavailable"
    | "network_error"
    | "auth_failed"
    | "permission_denied"
    | "rejected"
    | "protocol_error";
  retryDelaySeconds: number;
};

export type StorageObjectVerificationAttempt = Pick<VoiceDeletionLeaseClaim, "operationId" | "userId" | "leaseToken"> & {
  targetId: string;
  expectedVerificationAttemptCount: number;
};

export type StorageObjectVerificationResult = StorageObjectVerificationAttempt & {
  result:
    | "absent"
    | "present"
    | "timed_out"
    | "rate_limited"
    | "unavailable"
    | "network_error"
    | "auth_failed"
    | "permission_denied"
    | "rejected"
    | "protocol_error";
  retryDelaySeconds: number;
};

export type StorageObjectInvalidTargetManualTransition = Pick<
  VoiceDeletionLeaseClaim,
  "operationId" | "userId" | "leaseToken"
> & {
  targetId: string;
  expectedDeleteAttemptCount: number;
  expectedVerificationAttemptCount: number;
};

export type VoiceDeletionRepository = {
  createOrGetActiveOperation(userId: string): Promise<{ operation: VoiceDeletionOperationRow; created: boolean }>;
  markPreflightManualRequired(userId: string): Promise<VoiceDeletionOperationRow | null>;
  getActiveOperation(userId: string): Promise<VoiceDeletionOperationRow | null>;
  getLatestOperation(userId: string): Promise<VoiceDeletionOperationRow | null>;
  getOperationForUser(operationId: string, userId: string): Promise<VoiceDeletionOperationRow | null>;
  insertSnapshotTargets(
    operationId: string,
    userId: string,
    targets: VoiceDeletionSnapshotTarget[]
  ): Promise<VoiceDeletionOperationRow>;
  sealSnapshot(
    operationId: string,
    userId: string,
    targets: VoiceDeletionSnapshotTarget[]
  ): Promise<VoiceDeletionOperationRow>;
  listOperationTargets(operationId: string, userId: string): Promise<VoiceDeletionTargetRow[]>;
  claimExpiredOrAvailableLease(input: VoiceDeletionLeaseClaim): Promise<VoiceDeletionOperationRow | null>;
  releaseLease(input: Pick<VoiceDeletionLeaseClaim, "operationId" | "userId" | "leaseToken">): Promise<boolean>;
  beginProviderVoiceDeleteAttempt(input: ProviderVoiceDeleteAttempt): Promise<VoiceDeletionTargetRow | null>;
  recordProviderVoiceDeleteResult(input: ProviderVoiceDeleteResult): Promise<VoiceDeletionTargetRow | null>;
  beginProviderVoiceReconciliationAttempt(input: ProviderVoiceReconciliationAttempt): Promise<VoiceDeletionTargetRow | null>;
  recordProviderVoiceReconciliationResult(input: ProviderVoiceReconciliationResult): Promise<VoiceDeletionTargetRow | null>;
  enterStorageCleanupStage(input: StorageCleanupStageEntry): Promise<VoiceDeletionOperationRow | null>;
  beginStorageObjectDeleteAttempt(input: StorageObjectDeleteAttempt): Promise<VoiceDeletionTargetRow | null>;
  recordStorageObjectDeleteResult(input: StorageObjectDeleteResult): Promise<VoiceDeletionTargetRow | null>;
  beginStorageObjectVerificationAttempt(input: StorageObjectVerificationAttempt): Promise<VoiceDeletionTargetRow | null>;
  recordStorageObjectVerificationResult(input: StorageObjectVerificationResult): Promise<VoiceDeletionTargetRow | null>;
  markStorageObjectInvalidTargetManualRequired(
    input: StorageObjectInvalidTargetManualTransition
  ): Promise<VoiceDeletionTargetRow | null>;
  sealConsentSnapshot(input: ConsentSnapshotSeal): Promise<VoiceDeletionOperationRow | null>;
  withdrawCurrentConsents(input: ConsentWithdrawal): Promise<VoiceDeletionOperationRow | null>;
  enterDatabaseCleanupStage(input: DatabaseCleanupStageEntry): Promise<VoiceDeletionOperationRow | null>;
  cleanupDatabaseTargets(input: DatabaseTargetCleanup): Promise<VoiceDeletionOperationRow | null>;
  enterPostDeleteVerificationStage(input: PostDeleteVerificationTransition): Promise<VoiceDeletionOperationRow | null>;
  completePostDeleteVerification(input: PostDeleteVerificationTransition): Promise<VoiceDeletionOperationRow | null>;
  finalizeOperation(operationId: string, userId: string, leaseToken: string): Promise<VoiceDeletionOperationRow>;
};

function asSingle<TRow>(value: unknown) {
  return value as { data: TRow | null; error: PostgrestErrorLike | null };
}

function asMany<TRow>(value: unknown) {
  return value as { data: TRow[] | null; error: PostgrestErrorLike | null };
}

function asMaybeSingle<TRow>(value: unknown) {
  return value as { data: TRow | null; error: PostgrestErrorLike | null };
}

function isCreateOrGetOperationResult(value: unknown): value is CreateOrGetOperationResult {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "operation_id" in value &&
    typeof value.operation_id === "string" &&
    value.operation_id.length > 0 &&
    "created" in value &&
    typeof value.created === "boolean"
  );
}

function isOperationRow(value: unknown): value is VoiceDeletionOperationRow {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "id" in value &&
    typeof value.id === "string" &&
    value.id.length > 0
  );
}

function isTargetRow(value: unknown): value is VoiceDeletionTargetRow {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "id" in value &&
    typeof value.id === "string" &&
    value.id.length > 0
  );
}

function mapRepositoryError(operation: string, error: PostgrestErrorLike) {
  if (
    error.message.toLowerCase().includes("writer_in_progress") ||
    error.message.toLowerCase().includes("voice_asset_snapshot_stale")
  ) {
    return new AppError(409, "voice asset の保存処理中です。少し待ってから voice-only deletion を再試行してください。");
  }

  return new AppError(500, `${operation}に失敗しました。`);
}

function toSnapshotTargetPayload(targets: VoiceDeletionSnapshotTarget[]): Json {
  return targets.map((target) => ({
    target_kind: target.targetKind,
    target_fingerprint: target.targetFingerprint,
    source_row_id: target.sourceRowId ?? null,
    provider_name: target.providerName ?? null,
    provider_resource_id: target.providerResourceId ?? null,
    storage_bucket: target.storageBucket ?? null,
    storage_object_key: target.storageObjectKey ?? null
  }));
}

/**
 * This repository is intentionally server-only. It owns durable operation and target
 * records but does not call provider, Storage, consent, or deletion services.
 */
export function createVoiceDeletionRepository(client: ServiceRoleClient = createSupabaseAdminClient()): VoiceDeletionRepository {
  async function getActiveOperation(userId: string) {
    const result = asMaybeSingle<VoiceDeletionOperationRow>(
      await client
        .from("voice_deletion_operations")
        .select("*")
        .eq("user_id", userId)
        .in("status", [...ACTIVE_OPERATION_STATUSES])
        .order("requested_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    );

    if (result.error) {
      throw mapRepositoryError("進行中の voice deletion operation の取得", result.error);
    }

    return isOperationRow(result.data) ? result.data : null;
  }

  async function getOperationForUser(operationId: string, userId: string) {
    const result = asMaybeSingle<VoiceDeletionOperationRow>(
      await client
        .from("voice_deletion_operations")
        .select("*")
        .eq("id", operationId)
        .eq("user_id", userId)
        .maybeSingle()
    );

    if (result.error) {
      throw mapRepositoryError("voice deletion operation の取得", result.error);
    }

    return isOperationRow(result.data) ? result.data : null;
  }

  async function getLatestOperation(userId: string) {
    const result = asMaybeSingle<VoiceDeletionOperationRow>(
      await client
        .from("voice_deletion_operations")
        .select("*")
        .eq("user_id", userId)
        .order("requested_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    );

    if (result.error) {
      throw mapRepositoryError("最新の voice deletion operation の取得", result.error);
    }

    return isOperationRow(result.data) ? result.data : null;
  }

  async function createOrGetActiveOperation(userId: string) {
    const result = asSingle<CreateOrGetOperationResult>(
      await client.rpc("create_or_get_voice_deletion_operation", { p_user_id: userId }).single()
    );

    if (result.error || !isCreateOrGetOperationResult(result.data)) {
      throw mapRepositoryError("voice deletion operation の作成", result.error ?? { message: "operation row was not returned" });
    }

    const operation = await getOperationForUser(result.data.operation_id, userId);

    if (!operation) {
      throw mapRepositoryError("voice deletion operation の取得", { message: "operation row was not returned" });
    }

    return { operation, created: result.data.created };
  }

  async function markPreflightManualRequired(userId: string) {
    const result = asMaybeSingle<VoiceDeletionOperationRow>(
      await client.rpc("mark_voice_deletion_preflight_manual_required", { p_user_id: userId })
    );

    if (result.error) {
      throw mapRepositoryError("voice deletion preflight manual state の記録", result.error);
    }

    return isOperationRow(result.data) ? result.data : null;
  }

  async function sealSnapshot(operationId: string, userId: string, targets: VoiceDeletionSnapshotTarget[]) {
    const result = asSingle<VoiceDeletionOperationRow>(
      await client.rpc("seal_voice_deletion_snapshot", {
        p_operation_id: operationId,
        p_user_id: userId,
        p_targets: toSnapshotTargetPayload(targets)
      })
    );

    if (result.error || !result.data) {
      throw mapRepositoryError("voice deletion snapshot の atomic seal", result.error ?? { message: "operation row was not returned" });
    }

    return result.data;
  }

  async function listOperationTargets(operationId: string, userId: string) {
    const result = asMany<VoiceDeletionTargetRow>(
      await client
        .from("voice_deletion_targets")
        .select("*")
        .eq("operation_id", operationId)
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
    );

    if (result.error) {
      throw mapRepositoryError("voice deletion target の取得", result.error);
    }

    return result.data ?? [];
  }

  async function claimExpiredOrAvailableLease(input: VoiceDeletionLeaseClaim) {
    const result = asSingle<VoiceDeletionOperationRow>(
      await client.rpc("claim_voice_deletion_operation_lease", {
        p_operation_id: input.operationId,
        p_user_id: input.userId,
        p_lease_token: input.leaseToken,
        p_lease_seconds: input.leaseSeconds
      })
    );

    if (result.error) {
      throw mapRepositoryError("voice deletion operation lease の取得", result.error);
    }

    return isOperationRow(result.data) ? result.data : null;
  }

  async function releaseLease(input: Pick<VoiceDeletionLeaseClaim, "operationId" | "userId" | "leaseToken">) {
    const result = asMaybeSingle<VoiceDeletionOperationRow>(
      await client.rpc("release_voice_deletion_operation_lease", {
        p_operation_id: input.operationId,
        p_user_id: input.userId,
        p_lease_token: input.leaseToken
      })
    );

    if (result.error) {
      throw mapRepositoryError("voice deletion operation lease の解放", result.error);
    }

    return isOperationRow(result.data) && result.data.id === input.operationId;
  }

  async function beginProviderVoiceDeleteAttempt(input: ProviderVoiceDeleteAttempt) {
    const result = asMaybeSingle<VoiceDeletionTargetRow>(
      await client.rpc("begin_provider_voice_delete_attempt", {
        p_operation_id: input.operationId,
        p_user_id: input.userId,
        p_target_id: input.targetId,
        p_lease_token: input.leaseToken,
        p_expected_delete_attempt_count: input.expectedDeleteAttemptCount
      })
    );

    if (result.error) {
      throw mapRepositoryError("provider voice delete attempt の開始", result.error);
    }

    return isTargetRow(result.data) ? result.data : null;
  }

  async function recordProviderVoiceDeleteResult(input: ProviderVoiceDeleteResult) {
    const result = asMaybeSingle<VoiceDeletionTargetRow>(
      await client.rpc("record_provider_voice_delete_result", {
        p_operation_id: input.operationId,
        p_user_id: input.userId,
        p_target_id: input.targetId,
        p_lease_token: input.leaseToken,
        p_expected_delete_attempt_count: input.expectedDeleteAttemptCount,
        p_result: input.result,
        p_retry_delay_seconds: input.retryDelaySeconds
      })
    );

    if (result.error) {
      throw mapRepositoryError("provider voice delete result の記録", result.error);
    }

    return isTargetRow(result.data) ? result.data : null;
  }

  async function beginProviderVoiceReconciliationAttempt(input: ProviderVoiceReconciliationAttempt) {
    const result = asMaybeSingle<VoiceDeletionTargetRow>(
      await client.rpc("begin_provider_voice_reconciliation_attempt", {
        p_operation_id: input.operationId,
        p_user_id: input.userId,
        p_target_id: input.targetId,
        p_lease_token: input.leaseToken,
        p_expected_verification_attempt_count: input.expectedVerificationAttemptCount
      })
    );

    if (result.error) {
      throw mapRepositoryError("provider voice reconciliation attempt の開始", result.error);
    }

    return isTargetRow(result.data) ? result.data : null;
  }

  async function recordProviderVoiceReconciliationResult(input: ProviderVoiceReconciliationResult) {
    const result = asMaybeSingle<VoiceDeletionTargetRow>(
      await client.rpc("record_provider_voice_reconciliation_result", {
        p_operation_id: input.operationId,
        p_user_id: input.userId,
        p_target_id: input.targetId,
        p_lease_token: input.leaseToken,
        p_expected_verification_attempt_count: input.expectedVerificationAttemptCount,
        p_result: input.result,
        p_owner_signal: input.ownerSignal,
        p_retry_delay_seconds: input.retryDelaySeconds
      })
    );

    if (result.error) {
      throw mapRepositoryError("provider voice reconciliation result の記録", result.error);
    }

    return isTargetRow(result.data) ? result.data : null;
  }

  async function enterStorageCleanupStage(input: StorageCleanupStageEntry) {
    const result = asMaybeSingle<VoiceDeletionOperationRow>(
      await client.rpc("enter_voice_deletion_storage_cleanup_stage", {
        p_operation_id: input.operationId,
        p_user_id: input.userId,
        p_lease_token: input.leaseToken,
        p_expected_runner_attempt_count: input.expectedRunnerAttemptCount
      })
    );

    if (result.error) {
      throw mapRepositoryError("storage cleanup stage への進行", result.error);
    }

    return isOperationRow(result.data) ? result.data : null;
  }

  async function beginStorageObjectDeleteAttempt(input: StorageObjectDeleteAttempt) {
    const result = asMaybeSingle<VoiceDeletionTargetRow>(
      await client.rpc("begin_storage_object_delete_attempt", {
        p_operation_id: input.operationId,
        p_user_id: input.userId,
        p_target_id: input.targetId,
        p_lease_token: input.leaseToken,
        p_expected_delete_attempt_count: input.expectedDeleteAttemptCount
      })
    );

    if (result.error) {
      throw mapRepositoryError("storage object delete attempt の開始", result.error);
    }

    return isTargetRow(result.data) ? result.data : null;
  }

  async function recordStorageObjectDeleteResult(input: StorageObjectDeleteResult) {
    const result = asMaybeSingle<VoiceDeletionTargetRow>(
      await client.rpc("record_storage_object_delete_result", {
        p_operation_id: input.operationId,
        p_user_id: input.userId,
        p_target_id: input.targetId,
        p_lease_token: input.leaseToken,
        p_expected_delete_attempt_count: input.expectedDeleteAttemptCount,
        p_result: input.result,
        p_retry_delay_seconds: input.retryDelaySeconds
      })
    );

    if (result.error) {
      throw mapRepositoryError("storage object delete result の記録", result.error);
    }

    return isTargetRow(result.data) ? result.data : null;
  }

  async function beginStorageObjectVerificationAttempt(input: StorageObjectVerificationAttempt) {
    const result = asMaybeSingle<VoiceDeletionTargetRow>(
      await client.rpc("begin_storage_object_verification_attempt", {
        p_operation_id: input.operationId,
        p_user_id: input.userId,
        p_target_id: input.targetId,
        p_lease_token: input.leaseToken,
        p_expected_verification_attempt_count: input.expectedVerificationAttemptCount
      })
    );

    if (result.error) {
      throw mapRepositoryError("storage object verification attempt の開始", result.error);
    }

    return isTargetRow(result.data) ? result.data : null;
  }

  async function recordStorageObjectVerificationResult(input: StorageObjectVerificationResult) {
    const result = asMaybeSingle<VoiceDeletionTargetRow>(
      await client.rpc("record_storage_object_verification_result", {
        p_operation_id: input.operationId,
        p_user_id: input.userId,
        p_target_id: input.targetId,
        p_lease_token: input.leaseToken,
        p_expected_verification_attempt_count: input.expectedVerificationAttemptCount,
        p_result: input.result,
        p_retry_delay_seconds: input.retryDelaySeconds
      })
    );

    if (result.error) {
      throw mapRepositoryError("storage object verification result の記録", result.error);
    }

    return isTargetRow(result.data) ? result.data : null;
  }

  async function markStorageObjectInvalidTargetManualRequired(input: StorageObjectInvalidTargetManualTransition) {
    const result = asMaybeSingle<VoiceDeletionTargetRow>(
      await client.rpc("mark_storage_object_invalid_target_manual_required", {
        p_operation_id: input.operationId,
        p_user_id: input.userId,
        p_target_id: input.targetId,
        p_lease_token: input.leaseToken,
        p_expected_delete_attempt_count: input.expectedDeleteAttemptCount,
        p_expected_verification_attempt_count: input.expectedVerificationAttemptCount
      })
    );

    if (result.error) {
      throw mapRepositoryError("storage object invalid target の manual 記録", result.error);
    }

    return isTargetRow(result.data) ? result.data : null;
  }

  async function sealConsentSnapshot(input: ConsentSnapshotSeal) {
    const result = asMaybeSingle<VoiceDeletionOperationRow>(
      await client.rpc("seal_voice_deletion_consent_snapshot", {
        p_operation_id: input.operationId,
        p_user_id: input.userId,
        p_lease_token: input.leaseToken,
        p_expected_runner_attempt_count: input.expectedRunnerAttemptCount
      })
    );

    if (result.error) {
      throw mapRepositoryError("voice deletion consent snapshot の seal", result.error);
    }

    return isOperationRow(result.data) ? result.data : null;
  }

  async function withdrawCurrentConsents(input: ConsentWithdrawal) {
    const result = asMaybeSingle<VoiceDeletionOperationRow>(
      await client.rpc("withdraw_voice_deletion_current_consents", {
        p_operation_id: input.operationId,
        p_user_id: input.userId,
        p_lease_token: input.leaseToken,
        p_expected_runner_attempt_count: input.expectedRunnerAttemptCount
      })
    );

    if (result.error) {
      throw mapRepositoryError("voice deletion consent withdrawal", result.error);
    }

    return isOperationRow(result.data) ? result.data : null;
  }

  async function enterDatabaseCleanupStage(input: DatabaseCleanupStageEntry) {
    const result = asMaybeSingle<VoiceDeletionOperationRow>(
      await client.rpc("enter_voice_deletion_database_cleanup_stage", {
        p_operation_id: input.operationId,
        p_user_id: input.userId,
        p_lease_token: input.leaseToken,
        p_expected_runner_attempt_count: input.expectedRunnerAttemptCount
      })
    );

    if (result.error) {
      throw mapRepositoryError("database cleanup stage への進行", result.error);
    }

    return isOperationRow(result.data) ? result.data : null;
  }

  async function cleanupDatabaseTargets(input: DatabaseTargetCleanup) {
    const result = asMaybeSingle<VoiceDeletionOperationRow>(
      await client.rpc("cleanup_voice_deletion_database_targets", {
        p_operation_id: input.operationId,
        p_user_id: input.userId,
        p_lease_token: input.leaseToken,
        p_expected_runner_attempt_count: input.expectedRunnerAttemptCount
      })
    );

    if (result.error) {
      throw mapRepositoryError("voice deletion database cleanup", result.error);
    }

    return isOperationRow(result.data) ? result.data : null;
  }

  async function enterPostDeleteVerificationStage(input: PostDeleteVerificationTransition) {
    const result = asMaybeSingle<VoiceDeletionOperationRow>(
      await client.rpc("enter_voice_deletion_post_delete_verification_stage", {
        p_operation_id: input.operationId,
        p_user_id: input.userId,
        p_lease_token: input.leaseToken,
        p_expected_runner_attempt_count: input.expectedRunnerAttemptCount
      })
    );

    if (result.error) {
      throw mapRepositoryError("post-delete verification stage への進行", result.error);
    }

    return isOperationRow(result.data) ? result.data : null;
  }

  async function completePostDeleteVerification(input: PostDeleteVerificationTransition) {
    const result = asMaybeSingle<VoiceDeletionOperationRow>(
      await client.rpc("complete_voice_deletion_post_delete_verification", {
        p_operation_id: input.operationId,
        p_user_id: input.userId,
        p_lease_token: input.leaseToken,
        p_expected_runner_attempt_count: input.expectedRunnerAttemptCount
      })
    );

    if (result.error) {
      throw mapRepositoryError("post-delete verification の完了", result.error);
    }

    return isOperationRow(result.data) ? result.data : null;
  }

  async function finalizeOperation(operationId: string, userId: string, leaseToken: string) {
    const result = asSingle<VoiceDeletionOperationRow>(
      await client.rpc("finalize_voice_deletion_operation", {
        p_operation_id: operationId,
        p_user_id: userId,
        p_lease_token: leaseToken
      })
    );

    if (result.error || !result.data) {
      throw mapRepositoryError("voice deletion operation の安全な完了", result.error ?? { message: "operation row was not returned" });
    }

    return result.data;
  }

  return {
    createOrGetActiveOperation,
    markPreflightManualRequired,
    getActiveOperation,
    getLatestOperation,
    getOperationForUser,
    // A standalone target insert is deliberately unavailable: this alias preserves the
    // repository contract while routing every snapshot through the single atomic RPC.
    insertSnapshotTargets: sealSnapshot,
    sealSnapshot,
    listOperationTargets,
    claimExpiredOrAvailableLease,
    releaseLease,
    beginProviderVoiceDeleteAttempt,
    recordProviderVoiceDeleteResult,
    beginProviderVoiceReconciliationAttempt,
    recordProviderVoiceReconciliationResult,
    enterStorageCleanupStage,
    beginStorageObjectDeleteAttempt,
    recordStorageObjectDeleteResult,
    beginStorageObjectVerificationAttempt,
    recordStorageObjectVerificationResult,
    markStorageObjectInvalidTargetManualRequired,
    sealConsentSnapshot,
    withdrawCurrentConsents,
    enterDatabaseCleanupStage,
    cleanupDatabaseTargets,
    enterPostDeleteVerificationStage,
    completePostDeleteVerification,
    // Completion deliberately has no generic status-update helper: the focused RPC
    // atomically proves target verification, scrubs locators, and closes the lease.
    finalizeOperation
  };
}
