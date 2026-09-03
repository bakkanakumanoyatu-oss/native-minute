import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

export const ACCOUNT_DELETION_AUTH_INTENT_VERSION = "g5d-2m.auth-delete.v1" as const;

type RequestRow = Database["public"]["Tables"]["account_deletion_requests"]["Row"];
type ServiceRoleClient = ReturnType<typeof createSupabaseAdminClient>;
type ErrorLike = { message?: string; code?: string };

export type AccountDeletionAuthRequestRow = Pick<
  RequestRow,
  | "id"
  | "user_id"
  | "anonymized_user_ref"
  | "status"
  | "failure_stage"
  | "failure_reason_code"
  | "provider_cleanup_status"
  | "provider_snapshot_version"
  | "provider_snapshot_status"
  | "provider_snapshot_seal_version"
  | "provider_snapshot_sealed_at"
  | "provider_snapshot_target_count"
  | "provider_verified_absent_count"
  | "provider_runner_lease_token"
  | "provider_runner_lease_expires_at"
  | "provider_sub_finalized_at"
  | "provider_locator_scrubbed_at"
  | "storage_cleanup_status"
  | "storage_snapshot_version"
  | "storage_snapshot_status"
  | "storage_snapshot_seal_version"
  | "storage_snapshot_sealed_at"
  | "storage_snapshot_fingerprint"
  | "storage_snapshot_target_count"
  | "storage_verified_absent_count"
  | "storage_runner_lease_token"
  | "storage_runner_lease_expires_at"
  | "storage_sub_finalized_at"
  | "storage_locator_scrubbed_at"
  | "db_cleanup_status"
  | "db_inventory_version"
  | "db_observed_row_count"
  | "db_deleted_row_count"
  | "db_anonymized_row_count"
  | "db_retained_row_count"
  | "db_sub_finalized_at"
  | "auth_cleanup_status"
  | "auth_intent_version"
  | "auth_delete_target_user_id"
  | "auth_delete_generation"
  | "auth_delete_requested_at"
  | "auth_verification_attempt_count"
  | "auth_verification_result"
  | "auth_verification_result_attempt_count"
  | "auth_verified_absent_at"
  | "auth_sub_finalized_at"
  | "retry_count"
  | "last_attempted_at"
  | "metadata"
>;

export type AccountDeletionAuthVerificationResult =
  | "verified_absent"
  | "present"
  | "permission_denied"
  | "rate_limited"
  | "unavailable"
  | "network_error"
  | "timeout"
  | "malformed"
  | "mismatched_user";

export type AccountDeletionAuthCurrentVerificationResult =
  | "present"
  | "absent"
  | "unknown";

export type AccountDeletionAuthDispatchOutcome =
  | "permission_denied"
  | "rate_limited"
  | "unavailable"
  | "network_error"
  | "timeout"
  | "malformed";

export type AccountDeletionAuthDurableRepository = {
  getRequestByAuthority(requestRef: string): Promise<AccountDeletionAuthRequestRow | null>;
  sealAuthIntent(input: {
    deletionRequestId: string;
    expectedUserId: string;
    intentVersion: typeof ACCOUNT_DELETION_AUTH_INTENT_VERSION;
  }): Promise<AccountDeletionAuthRequestRow | null>;
  beginVerificationAttempt(input: {
    deletionRequestId: string;
    expectedTargetUserId: string;
    intentVersion: typeof ACCOUNT_DELETION_AUTH_INTENT_VERSION;
    expectedVerificationAttemptCount: number;
  }): Promise<AccountDeletionAuthRequestRow | null>;
  recordVerificationResult(input: {
    deletionRequestId: string;
    expectedTargetUserId: string;
    intentVersion: typeof ACCOUNT_DELETION_AUTH_INTENT_VERSION;
    expectedVerificationAttemptCount: number;
    result: AccountDeletionAuthVerificationResult;
  }): Promise<AccountDeletionAuthRequestRow | null>;
  authorizeDeleteDispatch(input: {
    deletionRequestId: string;
    expectedTargetUserId: string;
    intentVersion: typeof ACCOUNT_DELETION_AUTH_INTENT_VERSION;
    expectedVerificationAttemptCount: number;
  }): Promise<AccountDeletionAuthRequestRow | null>;
  recordDispatchOutcome(input: {
    deletionRequestId: string;
    expectedTargetUserId: string;
    intentVersion: typeof ACCOUNT_DELETION_AUTH_INTENT_VERSION;
    result: AccountDeletionAuthDispatchOutcome;
  }): Promise<AccountDeletionAuthRequestRow | null>;
  finalizeAuthStage(input: {
    deletionRequestId: string;
    intentVersion: typeof ACCOUNT_DELETION_AUTH_INTENT_VERSION;
    expectedDeleteGeneration: 0 | 1;
    expectedVerificationAttemptCount: number;
  }): Promise<AccountDeletionAuthRequestRow | null>;
};

const REQUEST_SELECT = [
  "id", "user_id", "anonymized_user_ref", "status", "failure_stage", "failure_reason_code",
  "provider_cleanup_status", "provider_snapshot_version", "provider_snapshot_status",
  "provider_snapshot_seal_version", "provider_snapshot_sealed_at", "provider_snapshot_target_count",
  "provider_verified_absent_count", "provider_runner_lease_token", "provider_runner_lease_expires_at",
  "provider_sub_finalized_at", "provider_locator_scrubbed_at", "storage_cleanup_status",
  "storage_snapshot_version", "storage_snapshot_status", "storage_snapshot_seal_version",
  "storage_snapshot_sealed_at", "storage_snapshot_fingerprint", "storage_snapshot_target_count",
  "storage_verified_absent_count", "storage_runner_lease_token", "storage_runner_lease_expires_at",
  "storage_sub_finalized_at", "storage_locator_scrubbed_at", "db_cleanup_status",
  "db_inventory_version", "db_observed_row_count", "db_deleted_row_count",
  "db_anonymized_row_count", "db_retained_row_count", "db_sub_finalized_at",
  "auth_cleanup_status", "auth_intent_version", "auth_delete_target_user_id",
  "auth_delete_generation", "auth_delete_requested_at", "auth_verification_attempt_count",
  "auth_verification_result", "auth_verification_result_attempt_count",
  "auth_verified_absent_at", "auth_sub_finalized_at", "retry_count", "last_attempted_at", "metadata"
].join(",");

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isOpaqueRefLike(value: string) {
  return /^adr_[0-9a-f]{32}$/i.test(value);
}

function isRequestRow(value: unknown, expectedRequestId?: string): value is AccountDeletionAuthRequestRow {
  return Boolean(
    value && typeof value === "object" && !Array.isArray(value) &&
    "id" in value && typeof value.id === "string" &&
    (expectedRequestId === undefined || value.id === expectedRequestId)
  );
}

function asMany(value: unknown) {
  return value as { data: AccountDeletionAuthRequestRow[] | null; error: ErrorLike | null };
}

function asOne(value: unknown) {
  return value as { data: AccountDeletionAuthRequestRow | null; error: ErrorLike | null };
}

function repositoryFailure() {
  return new Error("account_deletion_auth_durable_repository_failed");
}

export function createAccountDeletionAuthDurableRepository(
  client: ServiceRoleClient = createSupabaseAdminClient()
): AccountDeletionAuthDurableRepository {
  async function getRequestByAuthority(requestRef: string) {
    const normalized = requestRef.trim();
    const field = isUuidLike(normalized)
      ? "id"
      : isOpaqueRefLike(normalized)
        ? "anonymized_user_ref"
        : null;
    if (!field) return null;

    const response = asMany(
      await client.from("account_deletion_requests")
        .select(REQUEST_SELECT)
        .eq(field, normalized)
        .limit(2)
    );
    if (response.error) throw repositoryFailure();
    return response.data?.length === 1 && isRequestRow(response.data[0]) ? response.data[0] : null;
  }

  async function callRequestRpc(
    name: keyof Database["public"]["Functions"],
    args: Record<string, unknown>,
    expectedRequestId: string
  ) {
    const response = asOne(await client.rpc(name, args as never));
    if (response.error) throw repositoryFailure();
    return isRequestRow(response.data, expectedRequestId) ? response.data : null;
  }

  return {
    getRequestByAuthority,
    sealAuthIntent: (input) => callRequestRpc("seal_account_deletion_auth_intent", {
      p_deletion_request_id: input.deletionRequestId,
      p_expected_user_id: input.expectedUserId,
      p_auth_intent_version: input.intentVersion
    }, input.deletionRequestId),
    beginVerificationAttempt: (input) => callRequestRpc("begin_account_deletion_auth_verification_attempt", {
      p_deletion_request_id: input.deletionRequestId,
      p_expected_target_user_id: input.expectedTargetUserId,
      p_auth_intent_version: input.intentVersion,
      p_expected_verification_attempt_count: input.expectedVerificationAttemptCount
    }, input.deletionRequestId),
    recordVerificationResult: (input) => callRequestRpc("record_account_deletion_auth_verification_result", {
      p_deletion_request_id: input.deletionRequestId,
      p_expected_target_user_id: input.expectedTargetUserId,
      p_auth_intent_version: input.intentVersion,
      p_expected_verification_attempt_count: input.expectedVerificationAttemptCount,
      p_result: input.result
    }, input.deletionRequestId),
    authorizeDeleteDispatch: (input) => callRequestRpc("authorize_account_deletion_auth_delete_dispatch", {
      p_deletion_request_id: input.deletionRequestId,
      p_expected_target_user_id: input.expectedTargetUserId,
      p_auth_intent_version: input.intentVersion,
      p_expected_verification_attempt_count: input.expectedVerificationAttemptCount
    }, input.deletionRequestId),
    recordDispatchOutcome: (input) => callRequestRpc("record_account_deletion_auth_dispatch_outcome", {
      p_deletion_request_id: input.deletionRequestId,
      p_expected_target_user_id: input.expectedTargetUserId,
      p_auth_intent_version: input.intentVersion,
      p_result: input.result
    }, input.deletionRequestId),
    finalizeAuthStage: (input) => callRequestRpc("finalize_account_deletion_auth_stage", {
      p_deletion_request_id: input.deletionRequestId,
      p_auth_intent_version: input.intentVersion,
      p_expected_delete_generation: input.expectedDeleteGeneration,
      p_expected_verification_attempt_count: input.expectedVerificationAttemptCount
    }, input.deletionRequestId)
  };
}
