import "server-only";

import { AppError } from "@/lib/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

type AccountDeletionRequestRow = Database["public"]["Tables"]["account_deletion_requests"]["Row"];
type AccountDeletionProviderTargetRow = Database["public"]["Tables"]["account_deletion_provider_targets"]["Row"];
type ServiceRoleClient = ReturnType<typeof createSupabaseAdminClient>;
type PostgrestErrorLike = { message: string; code?: string };

export type AccountDeletionProviderLease = {
  deletionRequestId: string;
  userId: string;
  leaseToken: string;
  leaseSeconds: number;
};

type LeaseOwnedTarget = Pick<AccountDeletionProviderLease, "deletionRequestId" | "userId" | "leaseToken"> & {
  targetId: string;
  expectedRunnerAttemptCount: number;
};

export type AccountDeletionProviderDeleteAttempt = LeaseOwnedTarget & {
  expectedDeleteAttemptCount: number;
};

export type AccountDeletionProviderDeleteResult = AccountDeletionProviderDeleteAttempt & {
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

export type AccountDeletionProviderReconciliationAttempt = LeaseOwnedTarget & {
  expectedReconciliationAttemptCount: number;
};

export type AccountDeletionProviderReconciliationResult = AccountDeletionProviderReconciliationAttempt & {
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

export type AccountDeletionProviderFinalization = Pick<
  AccountDeletionProviderLease,
  "deletionRequestId" | "userId" | "leaseToken"
> & {
  expectedRunnerAttemptCount: number;
};

export type AccountDeletionProviderDurableRepository = {
  getRequestForOwner(deletionRequestId: string, userId: string): Promise<AccountDeletionRequestRow | null>;
  sealProviderSnapshot(deletionRequestId: string, userId: string): Promise<AccountDeletionRequestRow>;
  listProviderTargets(deletionRequestId: string, userId: string): Promise<AccountDeletionProviderTargetRow[]>;
  claimProviderLease(input: AccountDeletionProviderLease): Promise<AccountDeletionRequestRow | null>;
  releaseProviderLease(
    input: Pick<AccountDeletionProviderLease, "deletionRequestId" | "userId" | "leaseToken">
  ): Promise<boolean>;
  beginDeleteAttempt(input: AccountDeletionProviderDeleteAttempt): Promise<AccountDeletionProviderTargetRow | null>;
  recordDeleteResult(input: AccountDeletionProviderDeleteResult): Promise<AccountDeletionProviderTargetRow | null>;
  beginReconciliationAttempt(
    input: AccountDeletionProviderReconciliationAttempt
  ): Promise<AccountDeletionProviderTargetRow | null>;
  recordReconciliationResult(
    input: AccountDeletionProviderReconciliationResult
  ): Promise<AccountDeletionProviderTargetRow | null>;
  finalizeProviderStage(input: AccountDeletionProviderFinalization): Promise<AccountDeletionRequestRow | null>;
};

function asMaybeSingle<TRow>(value: unknown) {
  return value as { data: TRow | null; error: PostgrestErrorLike | null };
}

function asMany<TRow>(value: unknown) {
  return value as { data: TRow[] | null; error: PostgrestErrorLike | null };
}

function isRequestRow(
  value: unknown,
  deletionRequestId?: string,
  userId?: string
): value is AccountDeletionRequestRow {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "id" in value &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    (deletionRequestId === undefined || value.id === deletionRequestId) &&
    (userId === undefined || ("user_id" in value && value.user_id === userId))
  );
}

function isTargetRow(
  value: unknown,
  targetId?: string,
  deletionRequestId?: string,
  userId?: string
): value is AccountDeletionProviderTargetRow {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "id" in value &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    (targetId === undefined || value.id === targetId) &&
    (deletionRequestId === undefined || ("deletion_request_id" in value && value.deletion_request_id === deletionRequestId)) &&
    (userId === undefined || ("user_id" in value && value.user_id === userId))
  );
}

function mapRepositoryError(operation: string, error: PostgrestErrorLike) {
  const normalized = error.message.toLowerCase();

  if (normalized.includes("writer intent") || normalized.includes("object_in_use")) {
    return new AppError(409, "voice asset の保存処理が解決してから account deletion provider cleanup を再試行してください。");
  }

  return new AppError(500, `${operation}に失敗しました。`);
}

/**
 * Account-specific provider durable authority. Reads use the service-role client;
 * every mutation is restricted to a focused SECURITY DEFINER RPC.
 */
export function createAccountDeletionProviderDurableRepository(
  client: ServiceRoleClient = createSupabaseAdminClient()
): AccountDeletionProviderDurableRepository {
  async function getRequestForOwner(deletionRequestId: string, userId: string) {
    const result = asMaybeSingle<AccountDeletionRequestRow>(
      await client
        .from("account_deletion_requests")
        .select("*")
        .eq("id", deletionRequestId)
        .eq("user_id", userId)
        .maybeSingle()
    );

    if (result.error) {
      throw mapRepositoryError("account deletion provider request の取得", result.error);
    }

    return isRequestRow(result.data, deletionRequestId, userId) ? result.data : null;
  }

  async function sealProviderSnapshot(deletionRequestId: string, userId: string) {
    const result = asMaybeSingle<AccountDeletionRequestRow>(
      await client.rpc("seal_account_deletion_provider_snapshot", {
        p_deletion_request_id: deletionRequestId,
        p_expected_user_id: userId
      })
    );

    if (result.error || !isRequestRow(result.data, deletionRequestId, userId)) {
      throw mapRepositoryError(
        "account deletion provider snapshot の seal",
        result.error ?? { message: "request row was not returned" }
      );
    }

    return result.data;
  }

  async function listProviderTargets(deletionRequestId: string, userId: string) {
    const result = asMany<AccountDeletionProviderTargetRow>(
      await client
        .from("account_deletion_provider_targets")
        .select("*")
        .eq("deletion_request_id", deletionRequestId)
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
    );

    if (result.error) {
      throw mapRepositoryError("account deletion provider targets の取得", result.error);
    }

    return (result.data ?? []).filter((target) => isTargetRow(target, undefined, deletionRequestId, userId));
  }

  async function claimProviderLease(input: AccountDeletionProviderLease) {
    const result = asMaybeSingle<AccountDeletionRequestRow>(
      await client.rpc("claim_account_deletion_provider_lease", {
        p_deletion_request_id: input.deletionRequestId,
        p_expected_user_id: input.userId,
        p_lease_token: input.leaseToken,
        p_lease_seconds: input.leaseSeconds
      })
    );

    if (result.error) {
      throw mapRepositoryError("account deletion provider lease の取得", result.error);
    }

    return isRequestRow(result.data, input.deletionRequestId, input.userId) ? result.data : null;
  }

  async function releaseProviderLease(
    input: Pick<AccountDeletionProviderLease, "deletionRequestId" | "userId" | "leaseToken">
  ) {
    const result = asMaybeSingle<AccountDeletionRequestRow>(
      await client.rpc("release_account_deletion_provider_lease", {
        p_deletion_request_id: input.deletionRequestId,
        p_expected_user_id: input.userId,
        p_lease_token: input.leaseToken
      })
    );

    if (result.error) {
      throw mapRepositoryError("account deletion provider lease の解放", result.error);
    }

    return isRequestRow(result.data, input.deletionRequestId, input.userId);
  }

  async function beginDeleteAttempt(input: AccountDeletionProviderDeleteAttempt) {
    const result = asMaybeSingle<AccountDeletionProviderTargetRow>(
      await client.rpc("begin_account_deletion_provider_delete_attempt", {
        p_deletion_request_id: input.deletionRequestId,
        p_expected_user_id: input.userId,
        p_target_id: input.targetId,
        p_lease_token: input.leaseToken,
        p_expected_runner_attempt_count: input.expectedRunnerAttemptCount,
        p_expected_delete_attempt_count: input.expectedDeleteAttemptCount
      })
    );

    if (result.error) {
      throw mapRepositoryError("account deletion provider DELETE intent の記録", result.error);
    }

    return isTargetRow(result.data, input.targetId, input.deletionRequestId, input.userId) ? result.data : null;
  }

  async function recordDeleteResult(input: AccountDeletionProviderDeleteResult) {
    const result = asMaybeSingle<AccountDeletionProviderTargetRow>(
      await client.rpc("record_account_deletion_provider_delete_result", {
        p_deletion_request_id: input.deletionRequestId,
        p_expected_user_id: input.userId,
        p_target_id: input.targetId,
        p_lease_token: input.leaseToken,
        p_expected_runner_attempt_count: input.expectedRunnerAttemptCount,
        p_expected_delete_attempt_count: input.expectedDeleteAttemptCount,
        p_result: input.result,
        p_retry_delay_seconds: input.retryDelaySeconds
      })
    );

    if (result.error) {
      throw mapRepositoryError("account deletion provider DELETE result の記録", result.error);
    }

    return isTargetRow(result.data, input.targetId, input.deletionRequestId, input.userId) ? result.data : null;
  }

  async function beginReconciliationAttempt(input: AccountDeletionProviderReconciliationAttempt) {
    const result = asMaybeSingle<AccountDeletionProviderTargetRow>(
      await client.rpc("begin_account_deletion_provider_reconciliation_attempt", {
        p_deletion_request_id: input.deletionRequestId,
        p_expected_user_id: input.userId,
        p_target_id: input.targetId,
        p_lease_token: input.leaseToken,
        p_expected_runner_attempt_count: input.expectedRunnerAttemptCount,
        p_expected_reconciliation_attempt_count: input.expectedReconciliationAttemptCount
      })
    );

    if (result.error) {
      throw mapRepositoryError("account deletion provider reconciliation intent の記録", result.error);
    }

    return isTargetRow(result.data, input.targetId, input.deletionRequestId, input.userId) ? result.data : null;
  }

  async function recordReconciliationResult(input: AccountDeletionProviderReconciliationResult) {
    const result = asMaybeSingle<AccountDeletionProviderTargetRow>(
      await client.rpc("record_account_deletion_provider_reconciliation_result", {
        p_deletion_request_id: input.deletionRequestId,
        p_expected_user_id: input.userId,
        p_target_id: input.targetId,
        p_lease_token: input.leaseToken,
        p_expected_runner_attempt_count: input.expectedRunnerAttemptCount,
        p_expected_reconciliation_attempt_count: input.expectedReconciliationAttemptCount,
        p_result: input.result,
        p_owner_signal: input.ownerSignal,
        p_retry_delay_seconds: input.retryDelaySeconds
      })
    );

    if (result.error) {
      throw mapRepositoryError("account deletion provider reconciliation result の記録", result.error);
    }

    return isTargetRow(result.data, input.targetId, input.deletionRequestId, input.userId) ? result.data : null;
  }

  async function finalizeProviderStage(input: AccountDeletionProviderFinalization) {
    const result = asMaybeSingle<AccountDeletionRequestRow>(
      await client.rpc("finalize_account_deletion_provider_stage", {
        p_deletion_request_id: input.deletionRequestId,
        p_expected_user_id: input.userId,
        p_lease_token: input.leaseToken,
        p_expected_runner_attempt_count: input.expectedRunnerAttemptCount
      })
    );

    if (result.error) {
      throw mapRepositoryError("account deletion provider sub-finalization", result.error);
    }

    return isRequestRow(result.data, input.deletionRequestId, input.userId) ? result.data : null;
  }

  return {
    getRequestForOwner,
    sealProviderSnapshot,
    listProviderTargets,
    claimProviderLease,
    releaseProviderLease,
    beginDeleteAttempt,
    recordDeleteResult,
    beginReconciliationAttempt,
    recordReconciliationResult,
    finalizeProviderStage
  };
}
