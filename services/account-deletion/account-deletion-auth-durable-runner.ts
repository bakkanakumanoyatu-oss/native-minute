import "server-only";

import type {
  AccountDeletionAuthAdapter,
  AccountDeletionAuthDeleteResult,
  AccountDeletionAuthGetResult
} from "./account-deletion-auth-adapter";
import {
  ACCOUNT_DELETION_AUTH_INTENT_VERSION,
  type AccountDeletionAuthDispatchOutcome,
  type AccountDeletionAuthDurableRepository,
  type AccountDeletionAuthRequestRow,
  type AccountDeletionAuthVerificationResult
} from "./account-deletion-auth-durable.repository";

type SafeStatus = "succeeded" | "not_needed" | "manual_required" | "failed" | "blocked";
type SafeMarker = "terminal" | "manual_required" | "retry_later" | "not_runnable" | "unknown";

const AUTH_SAFE_REASON_FALLBACK = "auth_stage_reason_unknown" as const;
const AUTH_SAFE_REASON_CODES = new Set([
  AUTH_SAFE_REASON_FALLBACK,
  "auth_request_not_found",
  "auth_intent_owner_unavailable",
  "auth_intent_owner_mismatch",
  "auth_prior_stages_not_terminal",
  "auth_intent_seal_stale",
  "auth_durable_state_invalid",
  "auth_owner_not_null_after_verified_absence",
  "auth_sub_finalizer_rejected",
  "auth_verification_result_stale",
  "auth_user_present_after_dispatch_manual_required",
  "auth_get_permission_denied",
  "auth_get_user_mismatch",
  "auth_get_protocol_error",
  "auth_get_rate_limited",
  "auth_get_timeout",
  "auth_get_network_error",
  "auth_get_unavailable",
  "auth_delete_dispatch_cas_lost",
  "auth_delete_permission_denied",
  "auth_delete_rate_limited_outcome_unknown",
  "auth_delete_timeout_outcome_unknown",
  "auth_delete_network_error_outcome_unknown",
  "auth_delete_malformed_outcome_unknown",
  "auth_delete_unavailable_outcome_unknown",
  "auth_delete_outcome_unknown",
  "auth_post_delete_verification_stale",
  "auth_durable_stage_result_unknown"
]);

export type AccountDeletionAuthDurableStepResult = {
  status: SafeStatus;
  safeReasonCode: string | null;
  safeProgress: {
    marker: SafeMarker;
    terminal: boolean;
    verifiedAbsent: boolean;
    authSubFinalized: boolean;
  };
  safeCounts: {
    authGetCalls: number;
    authDeleteDispatches: number;
    authAttempted: number;
    destructiveOperationsAttempted: number;
    verificationAttemptCount: number;
    completionCalls: 0;
  };
};

type StepInput = {
  requestRef: string;
  expectedUserId?: string;
};

type StepDependencies = {
  repository: AccountDeletionAuthDurableRepository;
  authAdapter: AccountDeletionAuthAdapter;
};

function isSafeCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function hasTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

function hasEmptyMetadata(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.keys(value).length === 0;
}

function validCurrentVerification(row: AccountDeletionAuthRequestRow) {
  const currentResult = row.auth_verification_result;
  const currentAttempt = row.auth_verification_result_attempt_count;

  if (currentResult === null || currentAttempt === null) {
    return currentResult === null && currentAttempt === null && row.auth_verified_absent_at === null;
  }

  return (
    ["present", "absent", "unknown"].includes(currentResult) &&
    isSafeCount(currentAttempt) &&
    currentAttempt >= 1 &&
    currentAttempt === row.auth_verification_attempt_count &&
    (currentResult === "absent" ? hasTimestamp(row.auth_verified_absent_at) : row.auth_verified_absent_at === null)
  );
}

function sanitizeAuthSafeReasonCode(value: unknown, status: SafeStatus): string | null {
  if (value === null && (status === "succeeded" || status === "not_needed")) return null;
  return typeof value === "string" && AUTH_SAFE_REASON_CODES.has(value)
    ? value
    : AUTH_SAFE_REASON_FALLBACK;
}

function priorStagesTerminal(row: AccountDeletionAuthRequestRow) {
  const providerPolarity = row.provider_cleanup_status === "not_needed"
    ? row.provider_snapshot_target_count === 0
    : row.provider_cleanup_status === "succeeded" && row.provider_snapshot_target_count > 0;
  const storagePolarity = row.storage_cleanup_status === "not_needed"
    ? row.storage_snapshot_target_count === 0
    : row.storage_cleanup_status === "succeeded" && row.storage_snapshot_target_count > 0;
  const dbCounts = [
    row.db_observed_row_count,
    row.db_deleted_row_count,
    row.db_anonymized_row_count,
    row.db_retained_row_count
  ];
  const dbEquation = dbCounts.every(isSafeCount) &&
    row.db_observed_row_count ===
      row.db_deleted_row_count + row.db_anonymized_row_count + row.db_retained_row_count;
  const dbPolarity = row.db_cleanup_status === "not_needed"
    ? row.db_deleted_row_count === 0 && row.db_anonymized_row_count === 0
    : row.db_cleanup_status === "succeeded" && row.db_deleted_row_count + row.db_anonymized_row_count > 0;

  return (
    row.provider_snapshot_version === "g5d-2a.account-provider.v1" &&
    row.provider_snapshot_status === "sealed" &&
    row.provider_snapshot_seal_version === 1 &&
    hasTimestamp(row.provider_snapshot_sealed_at) &&
    providerPolarity &&
    hasTimestamp(row.provider_sub_finalized_at) &&
    row.provider_locator_scrubbed_at === row.provider_sub_finalized_at &&
    row.provider_verified_absent_count === row.provider_snapshot_target_count &&
    row.provider_runner_lease_token === null &&
    row.provider_runner_lease_expires_at === null &&
    row.storage_snapshot_version === "g5d-2e.account-storage.v1" &&
    row.storage_snapshot_status === "sealed" &&
    row.storage_snapshot_seal_version === 1 &&
    hasTimestamp(row.storage_snapshot_sealed_at) &&
    row.storage_snapshot_fingerprint === null &&
    storagePolarity &&
    hasTimestamp(row.storage_sub_finalized_at) &&
    row.storage_locator_scrubbed_at === row.storage_sub_finalized_at &&
    row.storage_verified_absent_count === row.storage_snapshot_target_count &&
    row.storage_runner_lease_token === null &&
    row.storage_runner_lease_expires_at === null &&
    row.db_inventory_version === "g5d-2h.account-db.v1" &&
    hasTimestamp(row.db_sub_finalized_at) &&
    dbEquation &&
    dbPolarity &&
    hasEmptyMetadata(row.metadata)
  );
}

function validTerminal(row: AccountDeletionAuthRequestRow) {
  return (
    priorStagesTerminal(row) &&
    row.user_id === null &&
    (row.status === "confirmed" || row.status === "completed") &&
    row.failure_stage === null &&
    row.failure_reason_code === null &&
    row.auth_intent_version === ACCOUNT_DELETION_AUTH_INTENT_VERSION &&
    row.auth_delete_target_user_id === null &&
    hasTimestamp(row.auth_delete_requested_at) &&
    hasTimestamp(row.auth_verified_absent_at) &&
    hasTimestamp(row.auth_sub_finalized_at) &&
    isSafeCount(row.auth_verification_attempt_count) &&
    row.auth_verification_attempt_count >= 1 &&
    row.auth_verification_result === null &&
    row.auth_verification_result_attempt_count === null &&
    (
      (row.auth_cleanup_status === "not_needed" && row.auth_delete_generation === 0) ||
      (row.auth_cleanup_status === "succeeded" && row.auth_delete_generation === 1)
    )
  );
}

function validNonterminalIntent(row: AccountDeletionAuthRequestRow) {
  return (
    priorStagesTerminal(row) &&
    ["confirmed", "auth_cleanup_failed"].includes(row.status) &&
    ["pending", "failed"].includes(row.auth_cleanup_status) &&
    row.auth_intent_version === ACCOUNT_DELETION_AUTH_INTENT_VERSION &&
    typeof row.auth_delete_target_user_id === "string" &&
    row.auth_delete_target_user_id.length > 0 &&
    (row.auth_delete_generation === 0 || row.auth_delete_generation === 1) &&
    hasTimestamp(row.auth_delete_requested_at) &&
    isSafeCount(row.auth_verification_attempt_count) &&
    (row.auth_delete_generation === 0 || row.auth_verification_attempt_count >= 1) &&
    validCurrentVerification(row) &&
    row.auth_sub_finalized_at === null
  );
}

function result(input: {
  status: SafeStatus;
  safeReasonCode: string | null;
  marker: SafeMarker;
  row?: AccountDeletionAuthRequestRow | null;
  authGetCalls?: number;
  authDeleteDispatches?: number;
}): AccountDeletionAuthDurableStepResult {
  const terminal = input.row ? validTerminal(input.row) : false;
  const dispatches = input.authDeleteDispatches ?? 0;
  return {
    status: input.status,
    safeReasonCode: sanitizeAuthSafeReasonCode(input.safeReasonCode, input.status),
    safeProgress: {
      marker: input.marker,
      terminal,
      verifiedAbsent: Boolean(input.row?.auth_verified_absent_at),
      authSubFinalized: Boolean(input.row?.auth_sub_finalized_at)
    },
    safeCounts: {
      authGetCalls: input.authGetCalls ?? 0,
      authDeleteDispatches: dispatches,
      authAttempted: dispatches,
      destructiveOperationsAttempted: dispatches,
      verificationAttemptCount: isSafeCount(input.row?.auth_verification_attempt_count)
        ? input.row.auth_verification_attempt_count
        : 0,
      completionCalls: 0
    }
  };
}

function verificationResult(result: AccountDeletionAuthGetResult): AccountDeletionAuthVerificationResult {
  return result.kind;
}

function dispatchOutcome(result: AccountDeletionAuthDeleteResult): AccountDeletionAuthDispatchOutcome | null {
  return result.kind === "observed" || result.kind === "not_found" ? null : result.kind;
}

/**
 * One bounded Auth step: at most two GETs and one DELETE. Every invocation is
 * GET-first, including generation-1 response-loss recovery. Generation 1 never
 * authorizes another automatic DELETE.
 */
export async function runAccountDeletionAuthDurableStep(
  input: StepInput,
  dependencies: StepDependencies
): Promise<AccountDeletionAuthDurableStepResult> {
  let getCalls = 0;
  let deleteDispatches = 0;

  const blocked = (safeReasonCode: string, row?: AccountDeletionAuthRequestRow | null, marker: SafeMarker = "not_runnable") =>
    result({ status: "blocked", safeReasonCode, marker, row, authGetCalls: getCalls, authDeleteDispatches: deleteDispatches });

  try {
    let request = await dependencies.repository.getRequestByAuthority(input.requestRef);
    if (!request) return blocked("auth_request_not_found");
    if (validTerminal(request)) {
      return result({
        status: request.auth_cleanup_status === "not_needed" ? "not_needed" : "succeeded",
        safeReasonCode: null,
        marker: "terminal",
        row: request
      });
    }
    if (request.auth_cleanup_status === "manual_required") {
      return result({ status: "manual_required", safeReasonCode: request.failure_reason_code, marker: "manual_required", row: request });
    }
    if (!priorStagesTerminal(request)) return blocked("auth_prior_stages_not_terminal", request);

    if (request.auth_intent_version === null) {
      if (!input.expectedUserId || request.user_id !== input.expectedUserId) {
        return blocked(request.user_id === null ? "auth_intent_owner_unavailable" : "auth_intent_owner_mismatch", request);
      }
      request = await dependencies.repository.sealAuthIntent({
        deletionRequestId: request.id,
        expectedUserId: input.expectedUserId,
        intentVersion: ACCOUNT_DELETION_AUTH_INTENT_VERSION
      });
      if (!request) return blocked("auth_intent_seal_stale");
    } else if (input.expectedUserId && request.user_id !== null && request.user_id !== input.expectedUserId) {
      return blocked("auth_intent_owner_mismatch", request);
    }

    if (!validNonterminalIntent(request)) return blocked("auth_durable_state_invalid", request, "unknown");

    if (request.auth_verified_absent_at) {
      if (request.user_id !== null) {
        return result({
          status: "manual_required",
          safeReasonCode: "auth_owner_not_null_after_verified_absence",
          marker: "manual_required",
          row: request
        });
      }
      const finalized = await dependencies.repository.finalizeAuthStage({
        deletionRequestId: request.id,
        intentVersion: ACCOUNT_DELETION_AUTH_INTENT_VERSION,
        expectedDeleteGeneration: request.auth_delete_generation as 0 | 1,
        expectedVerificationAttemptCount: request.auth_verification_attempt_count
      });
      if (!finalized || !validTerminal(finalized)) return blocked("auth_sub_finalizer_rejected", finalized, "unknown");
      return result({
        status: finalized.auth_cleanup_status === "not_needed" ? "not_needed" : "succeeded",
        safeReasonCode: null,
        marker: "terminal",
        row: finalized
      });
    }

    const verify = async (row: AccountDeletionAuthRequestRow) => {
      const begun = await dependencies.repository.beginVerificationAttempt({
        deletionRequestId: row.id,
        expectedTargetUserId: row.auth_delete_target_user_id as string,
        intentVersion: ACCOUNT_DELETION_AUTH_INTENT_VERSION,
        expectedVerificationAttemptCount: row.auth_verification_attempt_count
      });
      if (!begun) return null;

      getCalls += 1;
      let observed: AccountDeletionAuthGetResult;
      try {
        observed = await dependencies.authAdapter.getUserById(begun.auth_delete_target_user_id as string);
      } catch {
        observed = { kind: "network_error" };
      }

      const recorded = await dependencies.repository.recordVerificationResult({
        deletionRequestId: begun.id,
        expectedTargetUserId: begun.auth_delete_target_user_id as string,
        intentVersion: ACCOUNT_DELETION_AUTH_INTENT_VERSION,
        expectedVerificationAttemptCount: begun.auth_verification_attempt_count,
        result: verificationResult(observed)
      });
      return recorded ? { row: recorded, observed } : null;
    };

    const first = await verify(request);
    if (!first) return blocked("auth_verification_result_stale", request, "unknown");
    request = first.row;

    if (first.observed.kind === "verified_absent") {
      if (request.user_id !== null || request.auth_cleanup_status === "manual_required") {
        return result({ status: "manual_required", safeReasonCode: request.failure_reason_code, marker: "manual_required", row: request, authGetCalls: getCalls });
      }
      const finalized = await dependencies.repository.finalizeAuthStage({
        deletionRequestId: request.id,
        intentVersion: ACCOUNT_DELETION_AUTH_INTENT_VERSION,
        expectedDeleteGeneration: request.auth_delete_generation as 0 | 1,
        expectedVerificationAttemptCount: request.auth_verification_attempt_count
      });
      if (!finalized || !validTerminal(finalized)) return blocked("auth_sub_finalizer_rejected", finalized, "unknown");
      return result({
        status: finalized.auth_cleanup_status === "not_needed" ? "not_needed" : "succeeded",
        safeReasonCode: null,
        marker: "terminal",
        row: finalized,
        authGetCalls: getCalls
      });
    }

    if (first.observed.kind !== "present") {
      const manual = request.auth_cleanup_status === "manual_required";
      return result({
        status: manual ? "manual_required" : "failed",
        safeReasonCode: request.failure_reason_code,
        marker: manual ? "manual_required" : "retry_later",
        row: request,
        authGetCalls: getCalls
      });
    }

    // Generation 1 + present is the CAS-crash/unknown-outcome ambiguity. The
    // recorded verification has already made it sticky manual; never redispatch.
    if (request.auth_delete_generation === 1) {
      return result({
        status: "manual_required",
        safeReasonCode: request.failure_reason_code,
        marker: "manual_required",
        row: request,
        authGetCalls: getCalls
      });
    }

    const authorized = await dependencies.repository.authorizeDeleteDispatch({
      deletionRequestId: request.id,
      expectedTargetUserId: request.auth_delete_target_user_id as string,
      intentVersion: ACCOUNT_DELETION_AUTH_INTENT_VERSION,
      expectedVerificationAttemptCount: request.auth_verification_attempt_count
    });
    if (!authorized || authorized.auth_delete_generation !== 1) {
      return blocked("auth_delete_dispatch_cas_lost", authorized, "unknown");
    }
    request = authorized;

    // The accounting boundary is before the adapter call so an exception or
    // response loss cannot become a false zero.
    deleteDispatches = 1;
    let deletion: AccountDeletionAuthDeleteResult;
    try {
      deletion = await dependencies.authAdapter.deleteUser(request.auth_delete_target_user_id as string);
    } catch {
      deletion = { kind: "network_error" };
    }

    const outcome = dispatchOutcome(deletion);
    if (outcome) {
      const recorded = await dependencies.repository.recordDispatchOutcome({
        deletionRequestId: request.id,
        expectedTargetUserId: request.auth_delete_target_user_id as string,
        intentVersion: ACCOUNT_DELETION_AUTH_INTENT_VERSION,
        result: outcome
      });
      const manual = recorded?.auth_cleanup_status === "manual_required";
      return result({
        status: manual ? "manual_required" : "failed",
        safeReasonCode: recorded?.failure_reason_code ?? "auth_delete_outcome_unknown",
        marker: manual ? "manual_required" : "retry_later",
        row: recorded ?? request,
        authGetCalls: getCalls,
        authDeleteDispatches: deleteDispatches
      });
    }

    // A successful/404 DELETE response is never terminal. One bounded GET must
    // strictly verify absence, producing the second and final GET this invocation.
    const second = await verify(request);
    if (!second) return blocked("auth_post_delete_verification_stale", request, "unknown");
    request = second.row;

    if (second.observed.kind === "verified_absent" && request.user_id === null) {
      const finalized = await dependencies.repository.finalizeAuthStage({
        deletionRequestId: request.id,
        intentVersion: ACCOUNT_DELETION_AUTH_INTENT_VERSION,
        expectedDeleteGeneration: 1,
        expectedVerificationAttemptCount: request.auth_verification_attempt_count
      });
      if (!finalized || !validTerminal(finalized)) return blocked("auth_sub_finalizer_rejected", finalized, "unknown");
      return result({
        status: "succeeded",
        safeReasonCode: null,
        marker: "terminal",
        row: finalized,
        authGetCalls: getCalls,
        authDeleteDispatches: deleteDispatches
      });
    }

    const manual = request.auth_cleanup_status === "manual_required";
    return result({
      status: manual ? "manual_required" : "failed",
      safeReasonCode: request.failure_reason_code,
      marker: manual ? "manual_required" : "retry_later",
      row: request,
      authGetCalls: getCalls,
      authDeleteDispatches: deleteDispatches
    });
  } catch {
    return result({
      status: "blocked",
      safeReasonCode: "auth_durable_stage_result_unknown",
      marker: "unknown",
      authGetCalls: getCalls,
      authDeleteDispatches: deleteDispatches
    });
  }
}
