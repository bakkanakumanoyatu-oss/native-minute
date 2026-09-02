import { createElevenLabsVoiceDeletionProviderAdapter, type VoiceDeletionProviderAdapter } from "@/providers/voice-deletion";
import { ACCOUNT_DELETION_DESTRUCTIVE_GUARD_ENV } from "./account-deletion.service";
import {
  runAccountDeletionProviderDurableStep,
  type AccountDeletionProviderStepResult
} from "./account-deletion-provider-durable-runner";
import {
  createAccountDeletionProviderDurableRepository,
  type AccountDeletionProviderDurableRepository
} from "./account-deletion-provider-durable.repository";

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

type ProviderDurableStep = typeof runAccountDeletionProviderDurableStep;

export type AccountDeletionProviderOperatorProgressMarker =
  | "seal_only"
  | "progressed"
  | "retry_later"
  | "manual_required"
  | "target_verified"
  | "terminal"
  | "busy"
  | "not_runnable"
  | "stale_result"
  | "blocked"
  | "unknown";

type ProviderOperatorStatus =
  | "succeeded"
  | "not_needed"
  | "failed"
  | "manual_required"
  | "blocked";

export type AccountDeletionProviderOperatorSafeStageResult = {
  status: ProviderOperatorStatus;
  safeReasonCode: string | null;
  safeProgress: {
    marker: AccountDeletionProviderOperatorProgressMarker;
    terminal: boolean;
    retryable: boolean;
    manualReviewRequired: boolean;
  };
  safeCounts: {
    requestResolverCalls: number;
    destructiveOperationsAttempted: number | null;
    providerCandidates: null;
    providerAttempted: number | null;
    providerSucceeded: null;
    providerFailed: null;
    providerNotNeeded: null;
    providerBlocked: number | null;
    providerOutcomeUnknown: number;
    providerSnapshotSeals: number;
    providerDurableRunnerCalls: number;
    providerExternalActions: number;
    providerTerminal: number;
    providerNonterminal: number;
  };
};

type ProviderStageOptions = {
  env?: NodeJS.ProcessEnv;
  repository?: AccountDeletionProviderDurableRepository;
  providerAdapter?: VoiceDeletionProviderAdapter;
  runDurableStep?: ProviderDurableStep;
  createRepository?: () => AccountDeletionProviderDurableRepository;
  createProviderAdapter?: () => VoiceDeletionProviderAdapter;
};

const PROVIDER_OPERATOR_REQUEST_STATUSES = new Set(["confirmed", "provider_cleanup_failed"]);
const PROVIDER_OPERATOR_CLEANUP_STATUSES = new Set([
  "pending",
  "failed",
  "manual_required",
  "succeeded",
  "not_needed"
]);
const PROVIDER_SNAPSHOT_VERSION = "g5d-2a.account-provider.v1";

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isAnonymizedRequestRefLike(value: string) {
  return /^adr_[0-9a-f]{32}$/i.test(value);
}

function progress(
  marker: AccountDeletionProviderOperatorProgressMarker,
  options: { terminal?: boolean; retryable?: boolean; manualReviewRequired?: boolean } = {}
) {
  return {
    marker,
    terminal: options.terminal === true,
    retryable: options.retryable === true,
    manualReviewRequired: options.manualReviewRequired === true
  };
}

function stageResult(input: {
  status: ProviderOperatorStatus;
  safeReasonCode: string | null;
  marker: AccountDeletionProviderOperatorProgressMarker;
  terminal?: boolean;
  retryable?: boolean;
  manualReviewRequired?: boolean;
  providerSnapshotSeals?: number;
  providerDurableRunnerCalls?: number;
  providerExternalActions?: number;
  providerOutcomeUnknown?: number;
}): AccountDeletionProviderOperatorSafeStageResult {
  const providerExternalActions = input.providerExternalActions ?? 0;
  const terminal = input.terminal === true;

  return {
    status: input.status,
    safeReasonCode: input.safeReasonCode,
    safeProgress: progress(input.marker, {
      terminal,
      retryable: input.retryable,
      manualReviewRequired: input.manualReviewRequired
    }),
    safeCounts: {
      requestResolverCalls: 1,
      destructiveOperationsAttempted: providerExternalActions,
      providerCandidates: null,
      providerAttempted: providerExternalActions,
      providerSucceeded: null,
      providerFailed: null,
      providerNotNeeded: null,
      providerBlocked: null,
      providerOutcomeUnknown: input.providerOutcomeUnknown ?? 0,
      providerSnapshotSeals: input.providerSnapshotSeals ?? 0,
      providerDurableRunnerCalls: input.providerDurableRunnerCalls ?? 0,
      providerExternalActions,
      providerTerminal: terminal ? 1 : 0,
      providerNonterminal: terminal ? 0 : 1
    }
  };
}

async function lookupAccountDeletionProviderOperatorRequest(input: {
  field: "id" | "anonymized_user_ref";
  value: string;
}) {
  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
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
    return { ok: false, safeReasonCode: "provider_resolver_stage_not_allowed" };
  }

  const requestRef = input.requestRef?.trim() ?? "";
  if (!requestRef) {
    return { ok: false, safeReasonCode: "request_ref_required" };
  }

  const lookupField = isUuidLike(requestRef)
    ? "id"
    : isAnonymizedRequestRefLike(requestRef)
      ? "anonymized_user_ref"
      : null;
  if (!lookupField) {
    return { ok: false, safeReasonCode: "request_ref_invalid" };
  }

  try {
    const lookup = dependencies.lookupRequest ?? lookupAccountDeletionProviderOperatorRequest;
    const result = await lookup({ field: lookupField, value: requestRef });
    if (result.failed) {
      return { ok: false, safeReasonCode: "request_lookup_failed" };
    }
    if (result.rows.length === 0) {
      return { ok: false, safeReasonCode: "request_not_found" };
    }
    if (result.rows.length !== 1) {
      return { ok: false, safeReasonCode: "request_target_ambiguous" };
    }

    const row = result.rows[0];
    const targetMatches =
      lookupField === "id"
        ? row.id.toLowerCase() === requestRef.toLowerCase()
        : row.anonymized_user_ref?.toLowerCase() === requestRef.toLowerCase();
    if (!targetMatches) {
      return { ok: false, safeReasonCode: "request_target_mismatch" };
    }
    if (!isUuidLike(row.id) || !row.user_id || !isUuidLike(row.user_id)) {
      return { ok: false, safeReasonCode: "request_target_unavailable" };
    }
    if (
      !row.status ||
      !PROVIDER_OPERATOR_REQUEST_STATUSES.has(row.status) ||
      !row.provider_cleanup_status ||
      !PROVIDER_OPERATOR_CLEANUP_STATUSES.has(row.provider_cleanup_status)
    ) {
      return { ok: false, safeReasonCode: "request_target_not_runnable" };
    }

    return {
      ok: true,
      status: "resolved",
      safeReasonCode: null,
      internal: { userId: row.user_id, deletionRequestId: row.id }
    };
  } catch {
    return { ok: false, safeReasonCode: "request_lookup_failed" };
  }
}

function mapDurableStepResult(
  result: AccountDeletionProviderStepResult,
  counts: { providerExternalActions: number; providerDurableRunnerCalls: number }
): AccountDeletionProviderOperatorSafeStageResult {
  const common = {
    providerExternalActions: counts.providerExternalActions,
    providerDurableRunnerCalls: counts.providerDurableRunnerCalls
  };

  switch (result.kind) {
    case "provider_stage_finalized":
    case "already_finalized":
      return stageResult({
        ...common,
        status: result.status,
        safeReasonCode: null,
        marker: "terminal",
        terminal: true
      });
    case "manual_required":
      return stageResult({
        ...common,
        status: "manual_required",
        safeReasonCode: "provider_cleanup_manual_required",
        marker: "manual_required",
        manualReviewRequired: true
      });
    case "progressed":
      return stageResult({
        ...common,
        status: "blocked",
        safeReasonCode: "provider_progressed_continue_required",
        marker: "progressed",
        retryable: true
      });
    case "target_verified":
      return stageResult({
        ...common,
        status: "blocked",
        safeReasonCode: "provider_target_verified_continue_required",
        marker: "target_verified",
        retryable: true
      });
    case "retry_later":
      return stageResult({
        ...common,
        status: "blocked",
        safeReasonCode: "provider_retry_later",
        marker: "retry_later",
        retryable: true
      });
    case "busy":
      return stageResult({
        ...common,
        status: "blocked",
        safeReasonCode: "provider_busy",
        marker: "busy",
        retryable: true
      });
    case "stale_result":
      return stageResult({
        ...common,
        status: "blocked",
        safeReasonCode: "provider_stale_result",
        marker: "stale_result",
        retryable: true
      });
    case "not_runnable":
      return stageResult({
        ...common,
        status: "blocked",
        safeReasonCode: "provider_cleanup_not_runnable",
        marker: "not_runnable"
      });
  }

  const compileTimeExhaustive: never = result;
  void compileTimeExhaustive;

  return stageResult({
    ...common,
    status: "manual_required",
    safeReasonCode: "provider_stage_result_unknown",
    marker: "unknown",
    manualReviewRequired: true,
    providerOutcomeUnknown: 1
  });
}

function createOneActionProviderAdapter(providerAdapter: VoiceDeletionProviderAdapter) {
  let adapterInvocations = 0;
  let externalActions = 0;
  const adapter: VoiceDeletionProviderAdapter = {
    async deleteVoice(input) {
      adapterInvocations += 1;
      if (externalActions >= 1) return { kind: "protocol_error" };
      externalActions += 1;
      return providerAdapter.deleteVoice(input);
    },
    async reconcileVoiceAbsence(input) {
      adapterInvocations += 1;
      if (externalActions >= 1) return { kind: "protocol_error" };
      externalActions += 1;
      return providerAdapter.reconcileVoiceAbsence(input);
    }
  };

  return {
    adapter,
    getAdapterInvocations: () => adapterInvocations,
    getExternalActions: () => externalActions
  };
}

export async function runAccountDeletionProviderOperatorStage(
  input: ProviderOperatorStageInput,
  options: ProviderStageOptions = {}
): Promise<AccountDeletionProviderOperatorSafeStageResult> {
  const env = options.env ?? process.env;
  let durableRunnerCalls = 0;
  let oneActionAdapter: ReturnType<typeof createOneActionProviderAdapter> | null = null;
  if (input.stage?.trim().toLowerCase() !== "provider" || input.mode !== "execute") {
    return stageResult({ status: "blocked", safeReasonCode: "provider_stage_not_allowed", marker: "blocked" });
  }
  if (env[ACCOUNT_DELETION_DESTRUCTIVE_GUARD_ENV] !== "1") {
    return stageResult({ status: "blocked", safeReasonCode: "destructive_guard_missing", marker: "blocked" });
  }

  const userId = input.request?.userId?.trim() ?? "";
  const deletionRequestId = input.request?.deletionRequestId?.trim() ?? "";
  if (!isUuidLike(userId) || !isUuidLike(deletionRequestId)) {
    return stageResult({ status: "blocked", safeReasonCode: "request_target_invalid", marker: "blocked" });
  }

  try {
    const repository = options.repository ?? (options.createRepository ?? createAccountDeletionProviderDurableRepository)();
    const request = await repository.getRequestForOwner(deletionRequestId, userId);
    if (!request) {
      return stageResult({ status: "blocked", safeReasonCode: "provider_cleanup_not_runnable", marker: "not_runnable" });
    }

    if (request.provider_snapshot_status === "pending") {
      if (
        request.provider_snapshot_version !== PROVIDER_SNAPSHOT_VERSION ||
        request.provider_snapshot_seal_version !== 0 ||
        request.provider_snapshot_sealed_at !== null
      ) {
        return stageResult({ status: "blocked", safeReasonCode: "provider_cleanup_not_runnable", marker: "not_runnable" });
      }
      await repository.sealProviderSnapshot(deletionRequestId, userId);
      return stageResult({
        status: "blocked",
        safeReasonCode: "provider_snapshot_sealed_continue_required",
        marker: "seal_only",
        retryable: true,
        providerSnapshotSeals: 1
      });
    }

    if (
      request.provider_snapshot_status !== "sealed" ||
      request.provider_snapshot_version !== PROVIDER_SNAPSHOT_VERSION ||
      request.provider_snapshot_seal_version !== 1 ||
      !request.provider_snapshot_sealed_at
    ) {
      return stageResult({ status: "blocked", safeReasonCode: "provider_cleanup_not_runnable", marker: "not_runnable" });
    }

    const providerAdapter = options.providerAdapter ?? (options.createProviderAdapter ?? createElevenLabsVoiceDeletionProviderAdapter)();
    oneActionAdapter = createOneActionProviderAdapter(providerAdapter);
    const runDurableStep = options.runDurableStep ?? runAccountDeletionProviderDurableStep;
    durableRunnerCalls = 1;
    const result = await runDurableStep(
      { deletionRequestId, userId },
      { repository, providerAdapter: oneActionAdapter.adapter }
    );
    const providerExternalActions = oneActionAdapter.getExternalActions();
    if (oneActionAdapter.getAdapterInvocations() > 1) {
      return stageResult({
        status: "manual_required",
        safeReasonCode: "provider_action_limit_exceeded",
        marker: "unknown",
        manualReviewRequired: true,
        providerExternalActions,
        providerDurableRunnerCalls: 1,
        providerOutcomeUnknown: 1
      });
    }

    return mapDurableStepResult(result, { providerExternalActions, providerDurableRunnerCalls: 1 });
  } catch {
    return stageResult({
      status: "manual_required",
      safeReasonCode: "provider_stage_result_unknown",
      marker: "unknown",
      manualReviewRequired: true,
      providerExternalActions: oneActionAdapter?.getExternalActions() ?? 0,
      providerDurableRunnerCalls: durableRunnerCalls,
      providerOutcomeUnknown: 1
    });
  }
}

export function createAccountDeletionProviderOperatorBridge(options: {
  env?: NodeJS.ProcessEnv;
  lookupRequest?: ProviderOperatorRequestLookup;
  repository?: AccountDeletionProviderDurableRepository;
  providerAdapter?: VoiceDeletionProviderAdapter;
  runDurableStep?: ProviderDurableStep;
  createRepository?: () => AccountDeletionProviderDurableRepository;
  createProviderAdapter?: () => VoiceDeletionProviderAdapter;
} = {}) {
  const env = options.env ?? process.env;
  return {
    requestResolver: (input: ProviderOperatorResolverInput) =>
      resolveAccountDeletionProviderOperatorRequest(input, { lookupRequest: options.lookupRequest }),
    stageServices: {
      provider: (input: ProviderOperatorStageInput) =>
        runAccountDeletionProviderOperatorStage(input, {
          env,
          repository: options.repository,
          providerAdapter: options.providerAdapter,
          runDurableStep: options.runDurableStep,
          createRepository: options.createRepository,
          createProviderAdapter: options.createProviderAdapter
        })
    }
  };
}
