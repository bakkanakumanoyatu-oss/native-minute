import { ACCOUNT_DELETION_DESTRUCTIVE_GUARD_ENV } from "./account-deletion.service";
import {
  createAccountDeletionAuthProductionAdapter,
  type AccountDeletionAuthAdapter
} from "./account-deletion-auth-adapter";
import {
  runAccountDeletionAuthDurableStep,
  classifyAccountDeletionAuthDurableRequest,
  hasAccountDeletionAuthTerminalAuthority,
  sanitizeAccountDeletionAuthSafeReasonCode,
  type AccountDeletionAuthDurableStepResult,
  type AccountDeletionAuthDurableRequestClassification
} from "./account-deletion-auth-durable-runner";
import {
  createAccountDeletionAuthDurableRepository,
  type AccountDeletionAuthDurableRepository,
  type AccountDeletionAuthRequestRow
} from "./account-deletion-auth-durable.repository";

type AuthOperatorRequestLookup = (input: {
  field: "id" | "anonymized_user_ref";
  value: string;
}) => Promise<{ rows: AccountDeletionAuthRequestRow[]; failed: boolean }>;

type AuthOperatorResolverInput = { stage?: string; requestRef?: string };
type AuthOperatorStageInput = {
  stage?: string;
  mode?: string;
  request?: {
    deletionRequestId?: string;
    expectedUserId?: string;
  };
};

type AuthOperatorStatus = "succeeded" | "not_needed" | "failed" | "manual_required" | "blocked";
type AuthOperatorMarker = "terminal" | "manual_required" | "retry_later" | "not_runnable" | "blocked" | "unknown";
type AuthDurableStep = (
  input: { requestRef: string; expectedUserId?: string },
  dependencies: { repository: AccountDeletionAuthDurableRepository; authAdapter: AccountDeletionAuthAdapter }
) => Promise<unknown>;

type ObservedAuthCounts = {
  authGetCalls: number;
  authDeleteDispatches: number;
};

export type AccountDeletionAuthOperatorSafeStageResult = {
  status: AuthOperatorStatus;
  safeReasonCode: string | null;
  safeProgress: {
    marker: AuthOperatorMarker;
    terminal: boolean;
    retryable: boolean;
    manualReviewRequired: boolean;
    verifiedAbsent: boolean;
    authSubFinalized: boolean;
  };
  safeCounts: {
    requestResolverCalls: number;
    authDurableRunnerCalls: number;
    authGetCalls: number;
    authDeleteDispatches: number;
    authAttempted: number;
    authOutcomeUnknown: number;
    authTerminal: number;
    authNonterminal: number;
    verificationAttemptCount: number | null;
    completionCalls: number;
    destructiveOperationsAttempted: number;
  };
};

const AUTH_RUNNER_STATUSES = new Set<AuthOperatorStatus>([
  "succeeded",
  "not_needed",
  "failed",
  "manual_required",
  "blocked"
]);
const AUTH_RUNNER_MARKERS = new Set<AuthOperatorMarker>([
  "terminal",
  "manual_required",
  "retry_later",
  "not_runnable",
  "unknown"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isAnonymizedRequestRefLike(value: string) {
  return /^adr_[0-9a-f]{32}$/i.test(value);
}

function isSafeCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function stageResult(input: {
  status: AuthOperatorStatus;
  safeReasonCode: string | null;
  marker: AuthOperatorMarker;
  terminal?: boolean;
  retryable?: boolean;
  manualReviewRequired?: boolean;
  verifiedAbsent?: boolean;
  authSubFinalized?: boolean;
  authDurableRunnerCalls?: number;
  counts?: ObservedAuthCounts;
  authOutcomeUnknown?: number;
  verificationAttemptCount?: number | null;
}): AccountDeletionAuthOperatorSafeStageResult {
  const terminal = input.terminal === true;
  const authDeleteDispatches = input.counts?.authDeleteDispatches ?? 0;

  return {
    status: input.status,
    safeReasonCode: input.safeReasonCode,
    safeProgress: {
      marker: input.marker,
      terminal,
      retryable: input.retryable === true,
      manualReviewRequired: input.manualReviewRequired === true,
      verifiedAbsent: input.verifiedAbsent === true,
      authSubFinalized: input.authSubFinalized === true
    },
    safeCounts: {
      requestResolverCalls: 1,
      authDurableRunnerCalls: input.authDurableRunnerCalls ?? 0,
      authGetCalls: input.counts?.authGetCalls ?? 0,
      authDeleteDispatches,
      authAttempted: authDeleteDispatches,
      authOutcomeUnknown: input.authOutcomeUnknown ?? 0,
      authTerminal: terminal ? 1 : 0,
      authNonterminal: terminal ? 0 : 1,
      verificationAttemptCount: input.verificationAttemptCount ?? null,
      completionCalls: 0,
      destructiveOperationsAttempted: authDeleteDispatches
    }
  };
}

async function lookupAccountDeletionAuthOperatorRequest(input: {
  field: "id" | "anonymized_user_ref";
  value: string;
}) {
  try {
    const repository = createAccountDeletionAuthDurableRepository();
    const row = await repository.getRequestByAuthority(input.value);
    return { rows: row ? [row] : [], failed: false };
  } catch {
    return { rows: [], failed: true };
  }
}

function requestRefMatches(
  row: AccountDeletionAuthRequestRow,
  field: "id" | "anonymized_user_ref",
  value: string
) {
  return field === "id"
    ? row.id.toLowerCase() === value.toLowerCase()
    : row.anonymized_user_ref.toLowerCase() === value.toLowerCase();
}

export async function resolveAccountDeletionAuthOperatorRequest(
  input: AuthOperatorResolverInput,
  dependencies: { lookupRequest?: AuthOperatorRequestLookup } = {}
) {
  if (input.stage?.trim().toLowerCase() !== "auth") {
    return { ok: false, safeReasonCode: "auth_resolver_stage_not_allowed" };
  }

  const requestRef = input.requestRef?.trim() ?? "";
  if (!requestRef) return { ok: false, safeReasonCode: "request_ref_required" };

  const field = isUuidLike(requestRef)
    ? "id"
    : isAnonymizedRequestRefLike(requestRef)
      ? "anonymized_user_ref"
      : null;
  if (!field) return { ok: false, safeReasonCode: "request_ref_invalid" };

  try {
    const lookup = dependencies.lookupRequest ?? lookupAccountDeletionAuthOperatorRequest;
    const result = await lookup({ field, value: requestRef });
    if (result.failed) return { ok: false, safeReasonCode: "request_lookup_failed" };
    if (result.rows.length === 0) return { ok: false, safeReasonCode: "request_not_found" };
    if (result.rows.length !== 1) return { ok: false, safeReasonCode: "request_target_ambiguous" };

    const row = result.rows[0];
    if (!requestRefMatches(row, field, requestRef)) {
      return { ok: false, safeReasonCode: "request_target_mismatch" };
    }
    if (!isUuidLike(row.id)) return { ok: false, safeReasonCode: "request_target_unavailable" };

    const classification = classifyAccountDeletionAuthDurableRequest(row);
    if (!classification) return { ok: false, safeReasonCode: "auth_state_not_runnable" };
    if (classification === "no_intent_runnable" && (!row.user_id || !isUuidLike(row.user_id))) {
      return { ok: false, safeReasonCode: "request_target_unavailable" };
    }

    return {
      ok: true,
      status: "resolved",
      safeReasonCode: null,
      internal: {
        deletionRequestId: row.id,
        ...(classification === "no_intent_runnable" ? { expectedUserId: row.user_id as string } : {})
      }
    };
  } catch {
    return { ok: false, safeReasonCode: "request_lookup_failed" };
  }
}

function createObservedAuthAdapter(authAdapter: AccountDeletionAuthAdapter) {
  let getInvocations = 0;
  let getCalls = 0;
  let deleteInvocations = 0;
  let deleteDispatches = 0;

  const adapter: AccountDeletionAuthAdapter = {
    async getUserById(targetUserId) {
      getInvocations += 1;
      if (getCalls >= 2) return { kind: "malformed" };
      getCalls += 1;
      return authAdapter.getUserById(targetUserId);
    },
    async deleteUser(targetUserId) {
      deleteInvocations += 1;
      if (deleteDispatches >= 1) return { kind: "malformed" };
      deleteDispatches += 1;
      return authAdapter.deleteUser(targetUserId);
    }
  };

  return {
    adapter,
    hasLimitViolation: () => getInvocations > 2 || deleteInvocations > 1,
    counts: (): ObservedAuthCounts => ({ authGetCalls: getCalls, authDeleteDispatches: deleteDispatches })
  };
}

function parseRunnerResult(
  value: unknown,
  observed: ObservedAuthCounts
): AccountDeletionAuthDurableStepResult | null {
  if (!isRecord(value) || !AUTH_RUNNER_STATUSES.has(value.status as AuthOperatorStatus)) return null;
  if (!isRecord(value.safeProgress) || !AUTH_RUNNER_MARKERS.has(value.safeProgress.marker as AuthOperatorMarker)) {
    return null;
  }
  if (
    typeof value.safeProgress.terminal !== "boolean" ||
    typeof value.safeProgress.verifiedAbsent !== "boolean" ||
    typeof value.safeProgress.authSubFinalized !== "boolean" ||
    !isRecord(value.safeCounts)
  ) {
    return null;
  }

  const status = value.status as AuthOperatorStatus;
  const terminalStatus = status === "succeeded" || status === "not_needed";
  const sanitizedReason = sanitizeAccountDeletionAuthSafeReasonCode(value.safeReasonCode, status);
  if (
    sanitizedReason !== value.safeReasonCode ||
    terminalStatus !== value.safeProgress.terminal ||
    (terminalStatus &&
      (value.safeProgress.marker !== "terminal" ||
        value.safeProgress.verifiedAbsent !== true ||
        value.safeProgress.authSubFinalized !== true)) ||
    !isSafeCount(value.safeCounts.authGetCalls) ||
    !isSafeCount(value.safeCounts.authDeleteDispatches) ||
    !isSafeCount(value.safeCounts.authAttempted) ||
    !isSafeCount(value.safeCounts.destructiveOperationsAttempted) ||
    !isSafeCount(value.safeCounts.verificationAttemptCount) ||
    value.safeCounts.completionCalls !== 0 ||
    value.safeCounts.authGetCalls !== observed.authGetCalls ||
    value.safeCounts.authDeleteDispatches !== observed.authDeleteDispatches ||
    value.safeCounts.authAttempted !== observed.authDeleteDispatches ||
    value.safeCounts.destructiveOperationsAttempted !== observed.authDeleteDispatches
  ) {
    return null;
  }

  return value as unknown as AccountDeletionAuthDurableStepResult;
}

function terminalMatchesRunner(
  row: AccountDeletionAuthRequestRow,
  deletionRequestId: string,
  result: AccountDeletionAuthDurableStepResult
) {
  return row.id === deletionRequestId && hasAccountDeletionAuthTerminalAuthority(row) &&
    row.auth_cleanup_status === result.status &&
    isSafeCount(row.auth_verification_attempt_count) &&
    row.auth_verification_attempt_count === result.safeCounts.verificationAttemptCount;
}

function classificationAllowsExpectedUser(
  classification: AccountDeletionAuthDurableRequestClassification,
  row: AccountDeletionAuthRequestRow,
  suppliedExpectedUserId: string
) {
  if (classification === "no_intent_runnable") {
    return !suppliedExpectedUserId || row.user_id === suppliedExpectedUserId;
  }
  if (!suppliedExpectedUserId) return true;
  return row.user_id !== null && row.user_id === suppliedExpectedUserId;
}

export async function runAccountDeletionAuthOperatorStage(
  input: AuthOperatorStageInput,
  options: {
    env?: NodeJS.ProcessEnv;
    repository?: AccountDeletionAuthDurableRepository;
    authAdapter?: AccountDeletionAuthAdapter;
    runDurableStep?: AuthDurableStep;
    createRepository?: () => AccountDeletionAuthDurableRepository;
    createAuthAdapter?: () => AccountDeletionAuthAdapter;
  } = {}
): Promise<AccountDeletionAuthOperatorSafeStageResult> {
  const env = options.env ?? process.env;
  let runnerCalls = 0;
  let observedAdapter: ReturnType<typeof createObservedAuthAdapter> | null = null;
  const observedCounts = () => observedAdapter?.counts() ?? { authGetCalls: 0, authDeleteDispatches: 0 };

  if (input.stage?.trim().toLowerCase() !== "auth" || input.mode !== "execute") {
    return stageResult({ status: "blocked", safeReasonCode: "auth_stage_not_allowed", marker: "blocked" });
  }
  if (env[ACCOUNT_DELETION_DESTRUCTIVE_GUARD_ENV] !== "1") {
    return stageResult({ status: "blocked", safeReasonCode: "destructive_guard_missing", marker: "blocked" });
  }

  const deletionRequestId = input.request?.deletionRequestId?.trim() ?? "";
  const suppliedExpectedUserId = input.request?.expectedUserId?.trim() ?? "";
  if (!isUuidLike(deletionRequestId) || (suppliedExpectedUserId && !isUuidLike(suppliedExpectedUserId))) {
    return stageResult({ status: "blocked", safeReasonCode: "request_target_invalid", marker: "blocked" });
  }

  try {
    const repository = options.repository ??
      (options.createRepository ?? createAccountDeletionAuthDurableRepository)();
    const request = await repository.getRequestByAuthority(deletionRequestId);
    if (!request || request.id !== deletionRequestId) {
      return stageResult({ status: "blocked", safeReasonCode: "auth_cleanup_not_runnable", marker: "not_runnable" });
    }

    const classification = classifyAccountDeletionAuthDurableRequest(request);
    if (!classification) {
      return stageResult({ status: "blocked", safeReasonCode: "auth_cleanup_not_runnable", marker: "not_runnable" });
    }
    if (!classificationAllowsExpectedUser(classification, request, suppliedExpectedUserId)) {
      return stageResult({ status: "blocked", safeReasonCode: "auth_request_authority_mismatch", marker: "not_runnable" });
    }

    const expectedUserId = classification === "no_intent_runnable" ? request.user_id : undefined;
    if (classification === "no_intent_runnable" &&
      (typeof expectedUserId !== "string" || !isUuidLike(expectedUserId))) {
      return stageResult({ status: "blocked", safeReasonCode: "auth_cleanup_not_runnable", marker: "not_runnable" });
    }

    // Production Auth client/fetch construction is deliberately after both
    // destructive guards and the exact persisted eligibility re-fetch above.
    const authAdapter = options.authAdapter ??
      (options.createAuthAdapter ?? createAccountDeletionAuthProductionAdapter)();
    observedAdapter = createObservedAuthAdapter(authAdapter);
    const runDurableStep = options.runDurableStep ?? runAccountDeletionAuthDurableStep;
    runnerCalls = 1;
    const rawResult = await runDurableStep(
      { requestRef: deletionRequestId, ...(expectedUserId ? { expectedUserId } : {}) },
      { repository, authAdapter: observedAdapter.adapter }
    );
    const counts = observedCounts();

    if (observedAdapter.hasLimitViolation()) {
      return stageResult({
        status: "manual_required",
        safeReasonCode: "auth_durable_stage_result_unknown",
        marker: "unknown",
        manualReviewRequired: true,
        authDurableRunnerCalls: runnerCalls,
        counts,
        authOutcomeUnknown: 1
      });
    }

    const result = parseRunnerResult(rawResult, counts);
    if (!result) {
      return stageResult({
        status: "manual_required",
        safeReasonCode: "auth_durable_stage_result_unknown",
        marker: "unknown",
        manualReviewRequired: true,
        authDurableRunnerCalls: runnerCalls,
        counts,
        authOutcomeUnknown: 1
      });
    }

    if (result.status === "succeeded" || result.status === "not_needed") {
      let persisted: AccountDeletionAuthRequestRow | null = null;
      try {
        persisted = await repository.getRequestByAuthority(deletionRequestId);
      } catch {
        // Exact terminal authority is handled by the fixed fail-closed result below.
      }
      if (!persisted || !terminalMatchesRunner(persisted, deletionRequestId, result)) {
        return stageResult({
          status: "manual_required",
          safeReasonCode: "auth_terminal_authority_missing",
          marker: "unknown",
          manualReviewRequired: true,
          authDurableRunnerCalls: runnerCalls,
          counts,
          authOutcomeUnknown: 1
        });
      }

      return stageResult({
        status: result.status,
        safeReasonCode: null,
        marker: "terminal",
        terminal: true,
        verifiedAbsent: true,
        authSubFinalized: true,
        authDurableRunnerCalls: runnerCalls,
        counts,
        verificationAttemptCount: persisted.auth_verification_attempt_count
      });
    }

    const outcomeUnknown = result.status === "failed" || result.safeProgress.marker === "unknown";
    return stageResult({
      status: result.status,
      safeReasonCode: result.safeReasonCode,
      marker: result.safeProgress.marker,
      retryable: result.safeProgress.marker === "retry_later",
      manualReviewRequired: result.status === "manual_required",
      verifiedAbsent: result.safeProgress.verifiedAbsent,
      authSubFinalized: result.safeProgress.authSubFinalized,
      authDurableRunnerCalls: runnerCalls,
      counts,
      authOutcomeUnknown: outcomeUnknown ? 1 : 0,
      verificationAttemptCount: outcomeUnknown ? null : result.safeCounts.verificationAttemptCount
    });
  } catch {
    return stageResult({
      status: "manual_required",
      safeReasonCode: "auth_durable_stage_result_unknown",
      marker: "unknown",
      manualReviewRequired: true,
      authDurableRunnerCalls: runnerCalls,
      counts: observedCounts(),
      authOutcomeUnknown: 1
    });
  }
}

export function createAccountDeletionAuthOperatorBridge(options: {
  env?: NodeJS.ProcessEnv;
  lookupRequest?: AuthOperatorRequestLookup;
  repository?: AccountDeletionAuthDurableRepository;
  authAdapter?: AccountDeletionAuthAdapter;
  runDurableStep?: AuthDurableStep;
  createRepository?: () => AccountDeletionAuthDurableRepository;
  createAuthAdapter?: () => AccountDeletionAuthAdapter;
} = {}) {
  const env = options.env ?? process.env;

  return {
    requestResolver: (input: AuthOperatorResolverInput) =>
      resolveAccountDeletionAuthOperatorRequest(input, { lookupRequest: options.lookupRequest }),
    stageServices: {
      auth: (input: AuthOperatorStageInput) => runAccountDeletionAuthOperatorStage(input, {
        env,
        repository: options.repository,
        authAdapter: options.authAdapter,
        runDurableStep: options.runDurableStep,
        createRepository: options.createRepository,
        createAuthAdapter: options.createAuthAdapter
      })
    }
  };
}
