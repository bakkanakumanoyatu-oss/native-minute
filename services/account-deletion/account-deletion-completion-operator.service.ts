import { ACCOUNT_DELETION_DESTRUCTIVE_GUARD_ENV } from "./account-deletion.service";
import {
  ACCOUNT_DELETION_COMPLETION_EXPIRY_MS,
  createAccountDeletionCompletionRepository,
  parseAccountDeletionCompletionUtcInstant,
  type AccountDeletionCompletionRepository,
  type AccountDeletionCompletionRequestRow,
  type AccountDeletionCompletionRpcResult
} from "./account-deletion-completion.repository";

type CompletionOperatorResolverInput = { stage?: string; requestRef?: string };
type CompletionOperatorStageInput = {
  stage?: string;
  mode?: string;
  request?: { deletionRequestId?: string };
};

type CompletionOperatorStatus = "succeeded" | "already_satisfied" | "manual_required" | "blocked";
type CompletionOperatorMarker = "terminal" | "completion_rpc_rejected" | "not_runnable" | "blocked" | "unknown";
type CompletionPrecheck =
  | { kind: "confirmed" }
  | { kind: "completed"; completedAtEpochMicros: number; expiresAtEpochMicros: number };

export type AccountDeletionCompletionOperatorSafeStageResult = {
  status: CompletionOperatorStatus;
  safeReasonCode: string | null;
  safeProgress: {
    marker: CompletionOperatorMarker;
    terminal: boolean;
    retryable: false;
    manualReviewRequired: boolean;
  };
  safeCounts: {
    requestResolverCalls: number;
    completionRpcCalls: number;
    completionOutcomeUnknown: number;
    completionTerminal: number | null;
    completionAlreadyCompleted: number | null;
    externalCalls: 0;
    destructiveOperationsAttempted: 0;
  };
};

const TERMINAL_AUTH_STATUSES = new Set(["succeeded", "not_needed"]);

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function sameUuid(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase();
}

function hasEmptyMetadata(value: AccountDeletionCompletionRequestRow["metadata"]) {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.keys(value).length === 0;
}

function sameInstant(left: unknown, right: unknown) {
  const leftEpochMicros = parseAccountDeletionCompletionUtcInstant(left);
  const rightEpochMicros = parseAccountDeletionCompletionUtcInstant(right);
  return leftEpochMicros !== null && rightEpochMicros !== null && leftEpochMicros === rightEpochMicros;
}

function classifyCompletionPrecheck(
  row: AccountDeletionCompletionRequestRow,
  deletionRequestId: string
): CompletionPrecheck | null {
  if (
    !sameUuid(row.id, deletionRequestId) ||
    (row.status !== "confirmed" && row.status !== "completed") ||
    row.user_id !== null ||
    row.failure_stage !== null ||
    row.failure_reason_code !== null ||
    !hasEmptyMetadata(row.metadata) ||
    !TERMINAL_AUTH_STATUSES.has(row.auth_cleanup_status) ||
    parseAccountDeletionCompletionUtcInstant(row.auth_sub_finalized_at) === null
  ) {
    return null;
  }

  if (row.status === "confirmed") {
    return row.completed_at === null &&
      row.notification_status === "pending" &&
      sameInstant(row.last_attempted_at, row.auth_sub_finalized_at)
      ? { kind: "confirmed" }
      : null;
  }

  const completedAtEpochMicros = parseAccountDeletionCompletionUtcInstant(row.completed_at);
  const expiresAtEpochMicros = parseAccountDeletionCompletionUtcInstant(row.expires_at);
  return completedAtEpochMicros !== null &&
    expiresAtEpochMicros !== null &&
    expiresAtEpochMicros - completedAtEpochMicros === ACCOUNT_DELETION_COMPLETION_EXPIRY_MS * 1_000 &&
    row.notification_status === "not_needed" &&
    sameInstant(row.last_attempted_at, row.completed_at)
    ? { kind: "completed", completedAtEpochMicros, expiresAtEpochMicros }
    : null;
}

function terminalMatchesResult(
  row: AccountDeletionCompletionRequestRow,
  deletionRequestId: string,
  result: Extract<AccountDeletionCompletionRpcResult, { kind: "completed" | "already_completed" }>,
  precheck: CompletionPrecheck
) {
  const completedAtEpochMicros = parseAccountDeletionCompletionUtcInstant(row.completed_at);
  const expiresAtEpochMicros = parseAccountDeletionCompletionUtcInstant(row.expires_at);
  if (
    !sameUuid(row.id, deletionRequestId) ||
    row.status !== "completed" ||
    row.user_id !== null ||
    row.failure_stage !== null ||
    row.failure_reason_code !== null ||
    !hasEmptyMetadata(row.metadata) ||
    !TERMINAL_AUTH_STATUSES.has(row.auth_cleanup_status) ||
    parseAccountDeletionCompletionUtcInstant(row.auth_sub_finalized_at) === null ||
    row.notification_status !== "not_needed" ||
    completedAtEpochMicros === null ||
    expiresAtEpochMicros === null ||
    completedAtEpochMicros !== result.completedAtEpochMicros ||
    expiresAtEpochMicros !== result.expiresAtEpochMicros ||
    expiresAtEpochMicros - completedAtEpochMicros !== ACCOUNT_DELETION_COMPLETION_EXPIRY_MS * 1_000 ||
    !sameInstant(row.last_attempted_at, row.completed_at)
  ) {
    return false;
  }

  return precheck.kind !== "completed" ||
    (result.kind === "already_completed" &&
      precheck.completedAtEpochMicros === completedAtEpochMicros &&
      precheck.expiresAtEpochMicros === expiresAtEpochMicros);
}

function stageResult(input: {
  status: CompletionOperatorStatus;
  safeReasonCode: string | null;
  marker: CompletionOperatorMarker;
  completionRpcCalls?: number;
  completionOutcomeUnknown?: number;
  completionTerminal?: number | null;
  completionAlreadyCompleted?: number | null;
  manualReviewRequired?: boolean;
}): AccountDeletionCompletionOperatorSafeStageResult {
  const completionTerminal = input.completionTerminal ?? null;

  return {
    status: input.status,
    safeReasonCode: input.safeReasonCode,
    safeProgress: {
      marker: input.marker,
      terminal: completionTerminal === 1,
      retryable: false,
      manualReviewRequired: input.manualReviewRequired === true
    },
    safeCounts: {
      requestResolverCalls: 1,
      completionRpcCalls: input.completionRpcCalls ?? 0,
      completionOutcomeUnknown: input.completionOutcomeUnknown ?? 0,
      completionTerminal,
      completionAlreadyCompleted: input.completionAlreadyCompleted ?? null,
      externalCalls: 0,
      destructiveOperationsAttempted: 0
    }
  };
}

function mapAuthorityFailure(kind: Exclude<
  Awaited<ReturnType<AccountDeletionCompletionRepository["resolveAuthority"]>>["kind"],
  "resolved"
>) {
  switch (kind) {
    case "invalid":
      return "request_ref_invalid";
    case "missing":
      return "request_not_found";
    case "ambiguous":
      return "request_target_ambiguous";
    case "mismatch":
      return "request_target_mismatch";
    case "unknown":
      return "request_lookup_failed";
  }
}

export async function resolveAccountDeletionCompletionOperatorRequest(
  input: CompletionOperatorResolverInput,
  options: {
    repository?: AccountDeletionCompletionRepository;
    createRepository?: () => AccountDeletionCompletionRepository;
  } = {}
) {
  if (input.stage?.trim().toLowerCase() !== "completion") {
    return { ok: false, safeReasonCode: "completion_resolver_stage_not_allowed" };
  }

  const requestRef = input.requestRef?.trim() ?? "";
  if (!requestRef) return { ok: false, safeReasonCode: "request_ref_required" };

  try {
    const repository = options.repository ??
      (options.createRepository ?? createAccountDeletionCompletionRepository)();
    const result = await repository.resolveAuthority(requestRef);
    if (result.kind !== "resolved") {
      return { ok: false, safeReasonCode: mapAuthorityFailure(result.kind) };
    }
    if (!isUuidLike(result.authority.deletionRequestId)) {
      return { ok: false, safeReasonCode: "request_target_unavailable" };
    }

    return {
      ok: true,
      status: "resolved",
      safeReasonCode: null,
      internal: { deletionRequestId: result.authority.deletionRequestId }
    };
  } catch {
    return { ok: false, safeReasonCode: "request_lookup_failed" };
  }
}

export async function runAccountDeletionCompletionOperatorStage(
  input: CompletionOperatorStageInput,
  options: {
    env?: NodeJS.ProcessEnv;
    repository?: AccountDeletionCompletionRepository;
    createRepository?: () => AccountDeletionCompletionRepository;
  } = {}
): Promise<AccountDeletionCompletionOperatorSafeStageResult> {
  const env = options.env ?? process.env;
  let completionRpcCalls = 0;

  if (input.stage?.trim().toLowerCase() !== "completion" || input.mode !== "execute") {
    return stageResult({ status: "blocked", safeReasonCode: "completion_stage_not_allowed", marker: "blocked", completionTerminal: 0 });
  }
  if (env[ACCOUNT_DELETION_DESTRUCTIVE_GUARD_ENV] !== "1") {
    return stageResult({ status: "blocked", safeReasonCode: "destructive_guard_missing", marker: "blocked", completionTerminal: 0 });
  }

  const deletionRequestId = input.request?.deletionRequestId?.trim() ?? "";
  if (!isUuidLike(deletionRequestId)) {
    return stageResult({ status: "blocked", safeReasonCode: "request_target_invalid", marker: "blocked", completionTerminal: 0 });
  }

  try {
    const repository = options.repository ??
      (options.createRepository ?? createAccountDeletionCompletionRepository)();
    const before = await repository.getRequestById(deletionRequestId);
    if (before.kind === "unknown") {
      return stageResult({
        status: "manual_required",
        safeReasonCode: "completion_stage_result_unknown",
        marker: "unknown",
        completionOutcomeUnknown: 1,
        manualReviewRequired: true
      });
    }
    if (before.kind !== "found") {
      return stageResult({
        status: "blocked",
        safeReasonCode: "completion_cleanup_not_runnable",
        marker: "not_runnable",
        completionTerminal: 0
      });
    }

    const precheck = classifyCompletionPrecheck(before.request, deletionRequestId);
    if (!precheck) {
      return stageResult({
        status: "blocked",
        safeReasonCode: "completion_cleanup_not_runnable",
        marker: "not_runnable",
        completionTerminal: 0
      });
    }

    completionRpcCalls = 1;
    const result = await repository.finalizeCompletion(deletionRequestId);
    if (result.kind === "rejected") {
      return stageResult({
        status: "blocked",
        safeReasonCode: "completion_rpc_rejected",
        marker: "completion_rpc_rejected",
        completionRpcCalls,
        completionTerminal: 0
      });
    }
    if (result.kind === "unknown") {
      return stageResult({
        status: "manual_required",
        safeReasonCode: "completion_stage_result_unknown",
        marker: "unknown",
        completionRpcCalls,
        completionOutcomeUnknown: 1,
        manualReviewRequired: true
      });
    }

    const after = await repository.getRequestById(deletionRequestId);
    if (
      after.kind !== "found" ||
      !terminalMatchesResult(after.request, deletionRequestId, result, precheck)
    ) {
      return stageResult({
        status: "manual_required",
        safeReasonCode: "completion_terminal_authority_missing",
        marker: "unknown",
        completionRpcCalls,
        completionOutcomeUnknown: 1,
        manualReviewRequired: true
      });
    }

    return stageResult({
      status: result.kind === "already_completed" ? "already_satisfied" : "succeeded",
      safeReasonCode: null,
      marker: "terminal",
      completionRpcCalls,
      completionTerminal: 1,
      completionAlreadyCompleted: result.alreadyCompleted ? 1 : 0
    });
  } catch {
    return stageResult({
      status: "manual_required",
      safeReasonCode: "completion_stage_result_unknown",
      marker: "unknown",
      completionRpcCalls,
      completionOutcomeUnknown: 1,
      manualReviewRequired: true
    });
  }
}

export function createAccountDeletionCompletionOperatorBridge(options: {
  env?: NodeJS.ProcessEnv;
  repository?: AccountDeletionCompletionRepository;
  createRepository?: () => AccountDeletionCompletionRepository;
} = {}) {
  const env = options.env ?? process.env;

  return {
    requestResolver: (input: CompletionOperatorResolverInput) =>
      resolveAccountDeletionCompletionOperatorRequest(input, {
        repository: options.repository,
        createRepository: options.createRepository
      }),
    stageServices: {
      completion: (input: CompletionOperatorStageInput) =>
        runAccountDeletionCompletionOperatorStage(input, {
          env,
          repository: options.repository,
          createRepository: options.createRepository
        })
    }
  };
}
