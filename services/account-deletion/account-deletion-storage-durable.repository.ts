import "server-only";

import { AppError } from "@/lib/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/types/database";
import type { AccountDeletionStorageInventory } from "./account-deletion-storage-adapter";

type RequestRow = Database["public"]["Tables"]["account_deletion_requests"]["Row"];
type TargetRow = Database["public"]["Tables"]["account_deletion_storage_targets"]["Row"];
type ServiceRoleClient = ReturnType<typeof createSupabaseAdminClient>;
type ErrorLike = { message: string; code?: string };

export type AccountDeletionStorageLease = {
  deletionRequestId: string;
  userId: string;
  leaseToken: string;
  leaseSeconds: number;
};
type LeaseTarget = Pick<AccountDeletionStorageLease, "deletionRequestId" | "userId" | "leaseToken"> & {
  targetId: string;
  expectedRunnerAttemptCount: number;
};
export type AccountDeletionStorageDeleteAttempt = LeaseTarget & { expectedDeleteAttemptCount: number };
export type AccountDeletionStorageDeleteResult = AccountDeletionStorageDeleteAttempt & {
  result:
    | "request_succeeded"
    | "invalid_target"
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
export type AccountDeletionStorageVerificationAttempt = LeaseTarget & {
  expectedVerificationAttemptCount: number;
};
export type AccountDeletionStorageVerificationResult = AccountDeletionStorageVerificationAttempt & {
  result:
    | "absent"
    | "present"
    | "invalid_target"
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
export type AccountDeletionStorageFinalization = Pick<
  AccountDeletionStorageLease,
  "deletionRequestId" | "userId" | "leaseToken"
> & { expectedRunnerAttemptCount: number };

export type AccountDeletionStorageDurableRepository = {
  getRequestForOwner(deletionRequestId: string, userId: string): Promise<RequestRow | null>;
  beginStorageSnapshot(deletionRequestId: string, userId: string, collectionToken: string): Promise<RequestRow>;
  sealStorageSnapshot(input: {
    deletionRequestId: string;
    userId: string;
    collectionToken: string;
    inventory: AccountDeletionStorageInventory;
  }): Promise<RequestRow>;
  listStorageTargets(deletionRequestId: string, userId: string): Promise<TargetRow[]>;
  claimStorageLease(input: AccountDeletionStorageLease): Promise<RequestRow | null>;
  releaseStorageLease(
    input: Pick<AccountDeletionStorageLease, "deletionRequestId" | "userId" | "leaseToken">
  ): Promise<boolean>;
  beginDeleteAttempt(input: AccountDeletionStorageDeleteAttempt): Promise<TargetRow | null>;
  recordDeleteResult(input: AccountDeletionStorageDeleteResult): Promise<TargetRow | null>;
  beginVerificationAttempt(input: AccountDeletionStorageVerificationAttempt): Promise<TargetRow | null>;
  recordVerificationResult(input: AccountDeletionStorageVerificationResult): Promise<TargetRow | null>;
  finalizeStorageStage(input: AccountDeletionStorageFinalization): Promise<RequestRow | null>;
};

function asOne<TRow>(value: unknown) {
  return value as { data: TRow | null; error: ErrorLike | null };
}
function asMany<TRow>(value: unknown) {
  return value as { data: TRow[] | null; error: ErrorLike | null };
}
function isRequest(value: unknown, requestId: string, userId: string): value is RequestRow {
  return Boolean(
    value && typeof value === "object" && !Array.isArray(value) &&
    "id" in value && value.id === requestId && "user_id" in value && value.user_id === userId
  );
}
function isTarget(value: unknown, requestId: string, userId: string, targetId?: string): value is TargetRow {
  return Boolean(
    value && typeof value === "object" && !Array.isArray(value) &&
    "id" in value && (targetId === undefined || value.id === targetId) &&
    "deletion_request_id" in value && value.deletion_request_id === requestId &&
    "user_id" in value && value.user_id === userId
  );
}
function repositoryError(operation: string, error: ErrorLike) {
  const message = error.message.toLowerCase();
  if (message.includes("writer") || message.includes("ownership") || message.includes("snapshot")) {
    return new AppError(409, `${operation}を安全に確定できませんでした。保存処理または所有関係を確認してください。`);
  }
  return new AppError(500, `${operation}に失敗しました。`);
}

export function createAccountDeletionStorageDurableRepository(
  client: ServiceRoleClient = createSupabaseAdminClient()
): AccountDeletionStorageDurableRepository {
  async function getRequestForOwner(deletionRequestId: string, userId: string) {
    const result = asOne<RequestRow>(
      await client.from("account_deletion_requests").select("*").eq("id", deletionRequestId).eq("user_id", userId).maybeSingle()
    );
    if (result.error) throw repositoryError("account deletion Storage request の取得", result.error);
    return isRequest(result.data, deletionRequestId, userId) ? result.data : null;
  }

  async function beginStorageSnapshot(deletionRequestId: string, userId: string, collectionToken: string) {
    const result = asOne<RequestRow>(await client.rpc("begin_account_deletion_storage_snapshot", {
      p_deletion_request_id: deletionRequestId,
      p_expected_user_id: userId,
      p_collection_token: collectionToken
    }));
    if (result.error || !isRequest(result.data, deletionRequestId, userId)) {
      throw repositoryError("account deletion Storage snapshot の開始", result.error ?? { message: "missing request" });
    }
    return result.data;
  }

  async function sealStorageSnapshot(input: {
    deletionRequestId: string;
    userId: string;
    collectionToken: string;
    inventory: AccountDeletionStorageInventory;
  }) {
    const result = asOne<RequestRow>(await client.rpc("seal_account_deletion_storage_snapshot", {
      p_deletion_request_id: input.deletionRequestId,
      p_expected_user_id: input.userId,
      p_collection_token: input.collectionToken,
      p_listed_inventory: input.inventory as Json
    }));
    if (result.error || !isRequest(result.data, input.deletionRequestId, input.userId)) {
      throw repositoryError("account deletion Storage snapshot の seal", result.error ?? { message: "missing request" });
    }
    return result.data;
  }

  async function listStorageTargets(deletionRequestId: string, userId: string) {
    const result = asMany<TargetRow>(
      await client.from("account_deletion_storage_targets").select("*")
        .eq("deletion_request_id", deletionRequestId).eq("user_id", userId)
        .order("created_at", { ascending: true }).order("id", { ascending: true })
    );
    if (result.error) throw repositoryError("account deletion Storage targets の取得", result.error);
    return (result.data ?? []).filter((row) => isTarget(row, deletionRequestId, userId));
  }

  async function claimStorageLease(input: AccountDeletionStorageLease) {
    const result = asOne<RequestRow>(await client.rpc("claim_account_deletion_storage_lease", {
      p_deletion_request_id: input.deletionRequestId,
      p_expected_user_id: input.userId,
      p_lease_token: input.leaseToken,
      p_lease_seconds: input.leaseSeconds
    }));
    if (result.error) throw repositoryError("account deletion Storage lease の取得", result.error);
    return isRequest(result.data, input.deletionRequestId, input.userId) ? result.data : null;
  }

  async function releaseStorageLease(
    input: Pick<AccountDeletionStorageLease, "deletionRequestId" | "userId" | "leaseToken">
  ) {
    const result = asOne<RequestRow>(await client.rpc("release_account_deletion_storage_lease", {
      p_deletion_request_id: input.deletionRequestId,
      p_expected_user_id: input.userId,
      p_lease_token: input.leaseToken
    }));
    if (result.error) throw repositoryError("account deletion Storage lease の解放", result.error);
    return isRequest(result.data, input.deletionRequestId, input.userId);
  }

  async function beginDeleteAttempt(input: AccountDeletionStorageDeleteAttempt) {
    const result = asOne<TargetRow>(await client.rpc("begin_account_deletion_storage_delete_attempt", {
      p_deletion_request_id: input.deletionRequestId,
      p_expected_user_id: input.userId,
      p_target_id: input.targetId,
      p_lease_token: input.leaseToken,
      p_expected_runner_attempt_count: input.expectedRunnerAttemptCount,
      p_expected_delete_attempt_count: input.expectedDeleteAttemptCount
    }));
    if (result.error) throw repositoryError("account deletion Storage DELETE intent の記録", result.error);
    return isTarget(result.data, input.deletionRequestId, input.userId, input.targetId) ? result.data : null;
  }

  async function recordDeleteResult(input: AccountDeletionStorageDeleteResult) {
    const result = asOne<TargetRow>(await client.rpc("record_account_deletion_storage_delete_result", {
      p_deletion_request_id: input.deletionRequestId,
      p_expected_user_id: input.userId,
      p_target_id: input.targetId,
      p_lease_token: input.leaseToken,
      p_expected_runner_attempt_count: input.expectedRunnerAttemptCount,
      p_expected_delete_attempt_count: input.expectedDeleteAttemptCount,
      p_result: input.result,
      p_retry_delay_seconds: input.retryDelaySeconds
    }));
    if (result.error) throw repositoryError("account deletion Storage DELETE result の記録", result.error);
    return isTarget(result.data, input.deletionRequestId, input.userId, input.targetId) ? result.data : null;
  }

  async function beginVerificationAttempt(input: AccountDeletionStorageVerificationAttempt) {
    const result = asOne<TargetRow>(await client.rpc("begin_account_deletion_storage_verification_attempt", {
      p_deletion_request_id: input.deletionRequestId,
      p_expected_user_id: input.userId,
      p_target_id: input.targetId,
      p_lease_token: input.leaseToken,
      p_expected_runner_attempt_count: input.expectedRunnerAttemptCount,
      p_expected_verification_attempt_count: input.expectedVerificationAttemptCount
    }));
    if (result.error) throw repositoryError("account deletion Storage verification intent の記録", result.error);
    return isTarget(result.data, input.deletionRequestId, input.userId, input.targetId) ? result.data : null;
  }

  async function recordVerificationResult(input: AccountDeletionStorageVerificationResult) {
    const result = asOne<TargetRow>(await client.rpc("record_account_deletion_storage_verification_result", {
      p_deletion_request_id: input.deletionRequestId,
      p_expected_user_id: input.userId,
      p_target_id: input.targetId,
      p_lease_token: input.leaseToken,
      p_expected_runner_attempt_count: input.expectedRunnerAttemptCount,
      p_expected_verification_attempt_count: input.expectedVerificationAttemptCount,
      p_result: input.result,
      p_retry_delay_seconds: input.retryDelaySeconds
    }));
    if (result.error) throw repositoryError("account deletion Storage verification result の記録", result.error);
    return isTarget(result.data, input.deletionRequestId, input.userId, input.targetId) ? result.data : null;
  }

  async function finalizeStorageStage(input: AccountDeletionStorageFinalization) {
    const result = asOne<RequestRow>(await client.rpc("finalize_account_deletion_storage_stage", {
      p_deletion_request_id: input.deletionRequestId,
      p_expected_user_id: input.userId,
      p_lease_token: input.leaseToken,
      p_expected_runner_attempt_count: input.expectedRunnerAttemptCount
    }));
    if (result.error) throw repositoryError("account deletion Storage stage の finalization", result.error);
    return isRequest(result.data, input.deletionRequestId, input.userId) ? result.data : null;
  }

  return {
    getRequestForOwner,
    beginStorageSnapshot,
    sealStorageSnapshot,
    listStorageTargets,
    claimStorageLease,
    releaseStorageLease,
    beginDeleteAttempt,
    recordDeleteResult,
    beginVerificationAttempt,
    recordVerificationResult,
    finalizeStorageStage
  };
}
