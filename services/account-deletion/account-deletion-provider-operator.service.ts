import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  ACCOUNT_DELETION_DESTRUCTIVE_GUARD_ENV,
  runElevenLabsProviderCleanupActual,
  type ElevenLabsProviderCleanupActualResult
} from "./account-deletion.service";

type ProviderOperatorRequestRow = {
  id: string;
  user_id: string | null;
  anonymized_user_ref?: string;
  status?: string;
  provider_cleanup_status?: string;
};

type ProviderOperatorRequestLookup = (input: {
  field: "id" | "anonymized_user_ref";
  value: string;
}) => Promise<{
  rows: ProviderOperatorRequestRow[];
  failed: boolean;
}>;

type ProviderCleanupActual = typeof runElevenLabsProviderCleanupActual;

type ProviderOperatorResolverInput = {
  stage?: string;
  requestRef?: string;
};

type ProviderOperatorStageInput = {
  stage?: string;
  mode?: string;
  request?: {
    userId?: string;
    deletionRequestId?: string;
  };
};

export type AccountDeletionProviderOperatorSafeStageResult = {
  status: ElevenLabsProviderCleanupActualResult["status"];
  safeReasonCode: string | null;
  safeCounts: {
    requestResolverCalls: number;
    destructiveOperationsAttempted: number | null;
    providerCandidates: null;
    providerAttempted: number | null;
    providerSucceeded: number | null;
    providerFailed: number | null;
    providerNotNeeded: number | null;
    providerBlocked: number | null;
    providerOutcomeUnknown: number;
  };
};

const PROVIDER_FAILURE_REASON_MAP: Readonly<Record<string, string>> = {
  deletion_request_id_mismatch: "request_target_mismatch",
  provider_cleanup_not_runnable: "provider_cleanup_not_runnable",
  provider_cleanup_blocked: "provider_cleanup_blocked",
  provider_cleanup_candidate_mismatch: "provider_candidate_set_changed",
  elevenlabs_cost_guard_disabled: "provider_kill_switch_active",
  elevenlabs_voice_delete_auth_failed: "provider_delete_auth_failed",
  elevenlabs_voice_delete_rate_limited: "provider_delete_rate_limited",
  elevenlabs_voice_delete_not_found: "provider_target_absence_unverified",
  elevenlabs_voice_delete_invalid_provider_reference: "provider_target_reference_invalid",
  elevenlabs_voice_delete_provider_unavailable: "provider_unavailable",
  elevenlabs_voice_delete_provider_rejected: "provider_delete_rejected",
  elevenlabs_voice_delete_failed: "provider_cleanup_failed",
  [ACCOUNT_DELETION_DESTRUCTIVE_GUARD_ENV]: "destructive_guard_missing"
};
const PROVIDER_OPERATOR_REQUEST_STATUSES = new Set(["confirmed", "provider_cleanup_failed"]);
const PROVIDER_OPERATOR_CLEANUP_STATUSES = new Set([
  "pending",
  "failed",
  "manual_required",
  "succeeded",
  "not_needed"
]);

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isAnonymizedRequestRefLike(value: string) {
  return /^adr_[0-9a-f]{32}$/i.test(value);
}

function toSafeCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

async function lookupAccountDeletionProviderOperatorRequest(input: {
  field: "id" | "anonymized_user_ref";
  value: string;
}) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("account_deletion_requests")
    .select("id,user_id,anonymized_user_ref,status,provider_cleanup_status")
    .eq(input.field, input.value)
    .limit(2);

  return {
    rows: (data ?? []) as ProviderOperatorRequestRow[],
    failed: Boolean(error)
  };
}

export async function resolveAccountDeletionProviderOperatorRequest(
  input: ProviderOperatorResolverInput,
  dependencies: {
    lookupRequest?: ProviderOperatorRequestLookup;
  } = {}
) {
  if (input.stage?.trim().toLowerCase() !== "provider") {
    return {
      ok: false,
      safeReasonCode: "provider_resolver_stage_not_allowed"
    };
  }

  const requestRef = input.requestRef?.trim() ?? "";

  if (!requestRef) {
    return {
      ok: false,
      safeReasonCode: "request_ref_required"
    };
  }

  const lookupField = isUuidLike(requestRef)
    ? "id"
    : isAnonymizedRequestRefLike(requestRef)
      ? "anonymized_user_ref"
      : null;

  if (!lookupField) {
    return {
      ok: false,
      safeReasonCode: "request_ref_invalid"
    };
  }

  try {
    const lookup = dependencies.lookupRequest ?? lookupAccountDeletionProviderOperatorRequest;
    const result = await lookup({ field: lookupField, value: requestRef });

    if (result.failed) {
      return {
        ok: false,
        safeReasonCode: "request_lookup_failed"
      };
    }

    if (result.rows.length === 0) {
      return {
        ok: false,
        safeReasonCode: "request_not_found"
      };
    }

    if (result.rows.length !== 1) {
      return {
        ok: false,
        safeReasonCode: "request_target_ambiguous"
      };
    }

    const row = result.rows[0];
    const targetMatches =
      lookupField === "id"
        ? row.id.toLowerCase() === requestRef.toLowerCase()
        : row.anonymized_user_ref?.toLowerCase() === requestRef.toLowerCase();

    if (!targetMatches) {
      return {
        ok: false,
        safeReasonCode: "request_target_mismatch"
      };
    }

    if (!isUuidLike(row.id) || !row.user_id || !isUuidLike(row.user_id)) {
      return {
        ok: false,
        safeReasonCode: "request_target_unavailable"
      };
    }

    if (
      !row.status ||
      !PROVIDER_OPERATOR_REQUEST_STATUSES.has(row.status) ||
      !row.provider_cleanup_status ||
      !PROVIDER_OPERATOR_CLEANUP_STATUSES.has(row.provider_cleanup_status)
    ) {
      return {
        ok: false,
        safeReasonCode: "request_target_not_runnable"
      };
    }

    return {
      ok: true,
      status: "resolved",
      safeReasonCode: null,
      internal: {
        userId: row.user_id,
        deletionRequestId: row.id
      }
    };
  } catch {
    return {
      ok: false,
      safeReasonCode: "request_lookup_failed"
    };
  }
}

function mapProviderFailureReason(
  status: ElevenLabsProviderCleanupActualResult["status"],
  failureReasonCode: string | null
) {
  if (status === "succeeded" || status === "not_needed" || status === "already_satisfied") {
    return null;
  }

  if (failureReasonCode && PROVIDER_FAILURE_REASON_MAP[failureReasonCode]) {
    return PROVIDER_FAILURE_REASON_MAP[failureReasonCode];
  }

  if (status === "manual_required") {
    return "provider_cleanup_manual_required";
  }

  if (status === "blocked") {
    return "provider_cleanup_blocked";
  }

  return "provider_cleanup_failed";
}

export function adaptAccountDeletionProviderOutcome(
  result: ElevenLabsProviderCleanupActualResult
): AccountDeletionProviderOperatorSafeStageResult {
  const attempted = toSafeCount(result.cleanup?.attempted);

  return {
    status: result.status,
    safeReasonCode: mapProviderFailureReason(result.status, result.failureReasonCode),
    safeCounts: {
      requestResolverCalls: 1,
      destructiveOperationsAttempted: attempted,
      providerCandidates: null,
      providerAttempted: attempted,
      providerSucceeded: toSafeCount(result.cleanup?.succeeded),
      providerFailed: toSafeCount(result.cleanup?.failed),
      providerNotNeeded: toSafeCount(result.cleanup?.notNeeded),
      providerBlocked: toSafeCount(result.cleanup?.blocked),
      providerOutcomeUnknown: 0
    }
  };
}

export async function runAccountDeletionProviderOperatorStage(
  input: ProviderOperatorStageInput,
  options: {
    env?: NodeJS.ProcessEnv;
    runProviderCleanupActual?: ProviderCleanupActual;
  } = {}
): Promise<AccountDeletionProviderOperatorSafeStageResult> {
  const env = options.env ?? process.env;

  if (input.stage?.trim().toLowerCase() !== "provider" || input.mode !== "execute") {
    return {
      status: "blocked",
      safeReasonCode: "provider_stage_not_allowed",
      safeCounts: {
        requestResolverCalls: 1,
        destructiveOperationsAttempted: 0,
        providerCandidates: null,
        providerAttempted: 0,
        providerSucceeded: 0,
        providerFailed: 0,
        providerNotNeeded: 0,
        providerBlocked: 0,
        providerOutcomeUnknown: 0
      }
    };
  }

  const userId = input.request?.userId?.trim() ?? "";
  const deletionRequestId = input.request?.deletionRequestId?.trim() ?? "";

  if (!isUuidLike(userId) || !isUuidLike(deletionRequestId)) {
    return {
      status: "blocked",
      safeReasonCode: "request_target_invalid",
      safeCounts: {
        requestResolverCalls: 1,
        destructiveOperationsAttempted: 0,
        providerCandidates: null,
        providerAttempted: 0,
        providerSucceeded: 0,
        providerFailed: 0,
        providerNotNeeded: 0,
        providerBlocked: 0,
        providerOutcomeUnknown: 0
      }
    };
  }

  if (env[ACCOUNT_DELETION_DESTRUCTIVE_GUARD_ENV] !== "1") {
    return {
      status: "blocked",
      safeReasonCode: "destructive_guard_missing",
      safeCounts: {
        requestResolverCalls: 1,
        destructiveOperationsAttempted: 0,
        providerCandidates: null,
        providerAttempted: 0,
        providerSucceeded: 0,
        providerFailed: 0,
        providerNotNeeded: 0,
        providerBlocked: 0,
        providerOutcomeUnknown: 0
      }
    };
  }

  try {
    const runProviderCleanup = options.runProviderCleanupActual ?? runElevenLabsProviderCleanupActual;
    const result = await runProviderCleanup({
      userId,
      deletionRequestId,
      env
    });

    return adaptAccountDeletionProviderOutcome(result);
  } catch {
    return {
      status: "manual_required",
      safeReasonCode: "provider_stage_result_unknown",
      safeCounts: {
        requestResolverCalls: 1,
        destructiveOperationsAttempted: null,
        providerCandidates: null,
        providerAttempted: null,
        providerSucceeded: null,
        providerFailed: null,
        providerNotNeeded: null,
        providerBlocked: null,
        providerOutcomeUnknown: 1
      }
    };
  }
}

export function createAccountDeletionProviderOperatorBridge(options: {
  env?: NodeJS.ProcessEnv;
  lookupRequest?: ProviderOperatorRequestLookup;
  runProviderCleanupActual?: ProviderCleanupActual;
} = {}) {
  const env = options.env ?? process.env;

  return {
    requestResolver: (input: ProviderOperatorResolverInput) =>
      resolveAccountDeletionProviderOperatorRequest(input, {
        lookupRequest: options.lookupRequest
      }),
    stageServices: {
      provider: (input: ProviderOperatorStageInput) =>
        runAccountDeletionProviderOperatorStage(input, {
          env,
          runProviderCleanupActual: options.runProviderCleanupActual
        })
    }
  };
}
