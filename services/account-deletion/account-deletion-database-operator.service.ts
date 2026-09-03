import type { Database } from "@/types/database";
import { ACCOUNT_DELETION_DESTRUCTIVE_GUARD_ENV } from "./account-deletion.service";
import { ACCOUNT_DELETION_DATABASE_INVENTORY_VERSION } from "./account-deletion-database-contract";
import {
  createAccountDeletionDatabaseFinalizerRepository,
  type AccountDeletionDatabaseFinalizerRepository,
  type AccountDeletionDatabaseFinalizerResult,
  type AccountDeletionDatabaseOperatorRequestRow
} from "./account-deletion-database-finalizer.repository";

type DatabaseOperatorRequestLookup = (input: {
  field: "id" | "anonymized_user_ref";
  value: string;
}) => Promise<{ rows: AccountDeletionDatabaseOperatorRequestRow[]; failed: boolean }>;

type DatabaseOperatorResolverInput = { stage?: string; requestRef?: string };
type DatabaseOperatorStageInput = {
  stage?: string;
  mode?: string;
  request?: { userId?: string; deletionRequestId?: string };
};

type DatabaseOperatorStatus = "succeeded" | "not_needed" | "manual_required" | "blocked";
type DatabaseOperatorMarker = "terminal" | "not_runnable" | "blocked" | "unknown";

type DatabaseEvidenceCounts = {
  dbObservedRowCount: number | null;
  dbDeletedRowCount: number | null;
  dbAnonymizedRowCount: number | null;
  dbRetainedRowCount: number | null;
};

export type AccountDeletionDatabaseOperatorSafeStageResult = {
  status: DatabaseOperatorStatus;
  safeReasonCode: string | null;
  safeProgress: {
    marker: DatabaseOperatorMarker;
    terminal: boolean;
    retryable: boolean;
    manualReviewRequired: boolean;
  };
  safeCounts: {
    requestResolverCalls: number;
    destructiveOperationsAttempted: number;
    dbFinalizerInvocations: number;
    dbAttempted: number;
    dbOutcomeUnknown: number;
    dbTerminal: number;
    dbNonterminal: number;
  } & DatabaseEvidenceCounts;
};

const DATABASE_REQUEST_STATUSES = new Set(["confirmed", "db_cleanup_failed"]);
const TERMINAL_CLEANUP_STATUSES = new Set(["succeeded", "not_needed"]);

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isAnonymizedRequestRefLike(value: string) {
  return /^adr_[0-9a-f]{32}$/i.test(value);
}

function hasTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

function isSafeCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function hasPersistedPriorStages(row: AccountDeletionDatabaseOperatorRequestRow) {
  return (
    TERMINAL_CLEANUP_STATUSES.has(row.provider_cleanup_status) &&
    hasTimestamp(row.provider_sub_finalized_at) &&
    TERMINAL_CLEANUP_STATUSES.has(row.storage_cleanup_status) &&
    hasTimestamp(row.storage_sub_finalized_at)
  );
}

function hasEmptyMetadata(value: Database["public"]["Tables"]["account_deletion_requests"]["Row"]["metadata"]) {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.keys(value).length === 0;
}

function hasValidDatabaseEquation(input: {
  status: unknown;
  observed: unknown;
  deleted: unknown;
  anonymized: unknown;
  retained: unknown;
}) {
  if (
    !isSafeCount(input.observed) ||
    !isSafeCount(input.deleted) ||
    !isSafeCount(input.anonymized) ||
    !isSafeCount(input.retained) ||
    input.observed !== input.deleted + input.anonymized + input.retained
  ) {
    return false;
  }

  return input.status === "not_needed"
    ? input.deleted === 0 && input.anonymized === 0
    : input.status === "succeeded" && input.deleted + input.anonymized > 0;
}

function hasPersistedDatabaseTerminal(row: AccountDeletionDatabaseOperatorRequestRow) {
  return (
    row.status === "confirmed" &&
    row.failure_stage === null &&
    row.failure_reason_code === null &&
    hasPersistedPriorStages(row) &&
    TERMINAL_CLEANUP_STATUSES.has(row.db_cleanup_status) &&
    row.db_inventory_version === ACCOUNT_DELETION_DATABASE_INVENTORY_VERSION &&
    hasTimestamp(row.db_sub_finalized_at) &&
    row.last_attempted_at === row.db_sub_finalized_at &&
    hasEmptyMetadata(row.metadata) &&
    hasValidDatabaseEquation({
      status: row.db_cleanup_status,
      observed: row.db_observed_row_count,
      deleted: row.db_deleted_row_count,
      anonymized: row.db_anonymized_row_count,
      retained: row.db_retained_row_count
    })
  );
}

function classifyDatabaseRequest(row: AccountDeletionDatabaseOperatorRequestRow): "runnable" | "terminal" | null {
  if (!hasPersistedPriorStages(row)) return null;
  if (hasPersistedDatabaseTerminal(row)) return "terminal";

  return DATABASE_REQUEST_STATUSES.has(row.status) &&
    (row.db_cleanup_status === "pending" || row.db_cleanup_status === "failed") &&
    row.db_inventory_version === ACCOUNT_DELETION_DATABASE_INVENTORY_VERSION &&
    row.db_sub_finalized_at === null &&
    [
      row.db_observed_row_count,
      row.db_deleted_row_count,
      row.db_anonymized_row_count,
      row.db_retained_row_count
    ].every((value) => isSafeCount(value) && value === 0)
    ? "runnable"
    : null;
}

function stageResult(input: {
  status: DatabaseOperatorStatus;
  safeReasonCode: string | null;
  marker: DatabaseOperatorMarker;
  terminal?: boolean;
  manualReviewRequired?: boolean;
  dbFinalizerInvocations?: number;
  dbOutcomeUnknown?: number;
  evidence?: DatabaseEvidenceCounts;
}): AccountDeletionDatabaseOperatorSafeStageResult {
  const terminal = input.terminal === true;
  const dbFinalizerInvocations = input.dbFinalizerInvocations ?? 0;

  return {
    status: input.status,
    safeReasonCode: input.safeReasonCode,
    safeProgress: {
      marker: input.marker,
      terminal,
      retryable: false,
      manualReviewRequired: input.manualReviewRequired === true
    },
    safeCounts: {
      requestResolverCalls: 1,
      destructiveOperationsAttempted: dbFinalizerInvocations,
      dbFinalizerInvocations,
      dbAttempted: dbFinalizerInvocations,
      dbOutcomeUnknown: input.dbOutcomeUnknown ?? 0,
      dbTerminal: terminal ? 1 : 0,
      dbNonterminal: terminal ? 0 : 1,
      dbObservedRowCount: input.evidence?.dbObservedRowCount ?? null,
      dbDeletedRowCount: input.evidence?.dbDeletedRowCount ?? null,
      dbAnonymizedRowCount: input.evidence?.dbAnonymizedRowCount ?? null,
      dbRetainedRowCount: input.evidence?.dbRetainedRowCount ?? null
    }
  };
}

async function lookupAccountDeletionDatabaseOperatorRequest(input: {
  field: "id" | "anonymized_user_ref";
  value: string;
}) {
  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("account_deletion_requests")
    .select(
      "id,user_id,anonymized_user_ref,status,failure_stage,failure_reason_code,provider_cleanup_status,provider_sub_finalized_at,storage_cleanup_status,storage_sub_finalized_at,db_cleanup_status,db_inventory_version,db_observed_row_count,db_deleted_row_count,db_anonymized_row_count,db_retained_row_count,db_sub_finalized_at,last_attempted_at,metadata"
    )
    .eq(input.field, input.value)
    .limit(2);

  return {
    rows: (data ?? []) as AccountDeletionDatabaseOperatorRequestRow[],
    failed: Boolean(error)
  };
}

export async function resolveAccountDeletionDatabaseOperatorRequest(
  input: DatabaseOperatorResolverInput,
  dependencies: { lookupRequest?: DatabaseOperatorRequestLookup } = {}
) {
  if (input.stage?.trim().toLowerCase() !== "database") {
    return { ok: false, safeReasonCode: "database_resolver_stage_not_allowed" };
  }

  const requestRef = input.requestRef?.trim() ?? "";
  if (!requestRef) return { ok: false, safeReasonCode: "request_ref_required" };

  const lookupField = isUuidLike(requestRef)
    ? "id"
    : isAnonymizedRequestRefLike(requestRef)
      ? "anonymized_user_ref"
      : null;
  if (!lookupField) return { ok: false, safeReasonCode: "request_ref_invalid" };

  try {
    const lookup = dependencies.lookupRequest ?? lookupAccountDeletionDatabaseOperatorRequest;
    const result = await lookup({ field: lookupField, value: requestRef });
    if (result.failed) return { ok: false, safeReasonCode: "request_lookup_failed" };
    if (result.rows.length === 0) return { ok: false, safeReasonCode: "request_not_found" };
    if (result.rows.length !== 1) return { ok: false, safeReasonCode: "request_target_ambiguous" };

    const row = result.rows[0];
    const targetMatches = lookupField === "id"
      ? row.id.toLowerCase() === requestRef.toLowerCase()
      : row.anonymized_user_ref.toLowerCase() === requestRef.toLowerCase();
    if (!targetMatches) return { ok: false, safeReasonCode: "request_target_mismatch" };
    if (!isUuidLike(row.id) || !row.user_id || !isUuidLike(row.user_id)) {
      return { ok: false, safeReasonCode: "request_target_unavailable" };
    }
    if (!hasPersistedPriorStages(row)) {
      return { ok: false, safeReasonCode: "prior_stages_terminal_not_persisted" };
    }
    if (classifyDatabaseRequest(row) === null) {
      return { ok: false, safeReasonCode: "database_state_not_runnable" };
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

function isTerminalFinalizerResult(value: unknown): value is Extract<
  AccountDeletionDatabaseFinalizerResult,
  { kind: "succeeded" | "not_needed" | "already_finalized" }
> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || !("kind" in value)) return false;
  if (value.kind !== "succeeded" && value.kind !== "not_needed" && value.kind !== "already_finalized") return false;
  if (!("status" in value) || (value.status !== "succeeded" && value.status !== "not_needed")) return false;
  if (!("alreadyFinalized" in value) || typeof value.alreadyFinalized !== "boolean") return false;
  if ((value.kind === "already_finalized") !== value.alreadyFinalized) return false;
  if (value.kind !== "already_finalized" && value.kind !== value.status) return false;

  return [
    "dbObservedRowCount",
    "dbDeletedRowCount",
    "dbAnonymizedRowCount",
    "dbRetainedRowCount"
  ].every((field) => field in value && isSafeCount(value[field as keyof typeof value]));
}

function terminalMatchesResult(
  row: AccountDeletionDatabaseOperatorRequestRow,
  result: Extract<AccountDeletionDatabaseFinalizerResult, { kind: "succeeded" | "not_needed" | "already_finalized" }>
) {
  return (
    hasPersistedDatabaseTerminal(row) &&
    row.db_cleanup_status === result.status &&
    row.db_observed_row_count === result.dbObservedRowCount &&
    row.db_deleted_row_count === result.dbDeletedRowCount &&
    row.db_anonymized_row_count === result.dbAnonymizedRowCount &&
    row.db_retained_row_count === result.dbRetainedRowCount &&
    hasValidDatabaseEquation({
      status: result.status,
      observed: result.dbObservedRowCount,
      deleted: result.dbDeletedRowCount,
      anonymized: result.dbAnonymizedRowCount,
      retained: result.dbRetainedRowCount
    })
  );
}

export async function runAccountDeletionDatabaseOperatorStage(
  input: DatabaseOperatorStageInput,
  options: {
    env?: NodeJS.ProcessEnv;
    repository?: AccountDeletionDatabaseFinalizerRepository;
    createRepository?: () => AccountDeletionDatabaseFinalizerRepository;
  } = {}
): Promise<AccountDeletionDatabaseOperatorSafeStageResult> {
  const env = options.env ?? process.env;
  let finalizerInvocations = 0;

  if (input.stage?.trim().toLowerCase() !== "database" || input.mode !== "execute") {
    return stageResult({ status: "blocked", safeReasonCode: "database_stage_not_allowed", marker: "blocked" });
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
    const repository = options.repository ??
      (options.createRepository ?? createAccountDeletionDatabaseFinalizerRepository)();
    const request = await repository.getRequestForOwner(deletionRequestId, userId);
    if (!request || classifyDatabaseRequest(request) === null) {
      return stageResult({
        status: "blocked",
        safeReasonCode: "database_cleanup_not_runnable",
        marker: "not_runnable"
      });
    }

    finalizerInvocations = 1;
    const result: unknown = await repository.finalizeDatabaseStage({
      deletionRequestId,
      userId,
      inventoryVersion: ACCOUNT_DELETION_DATABASE_INVENTORY_VERSION
    });

    if (typeof result === "object" && result !== null && "kind" in result && result.kind === "blocked") {
      return stageResult({
        status: "blocked",
        safeReasonCode: "database_finalizer_rejected",
        marker: "not_runnable",
        dbFinalizerInvocations: finalizerInvocations
      });
    }

    if (!isTerminalFinalizerResult(result)) {
      return stageResult({
        status: "manual_required",
        safeReasonCode: "database_stage_result_unknown",
        marker: "unknown",
        manualReviewRequired: true,
        dbFinalizerInvocations: finalizerInvocations,
        dbOutcomeUnknown: 1
      });
    }

    const persisted = await repository.getRequestForOwner(deletionRequestId, userId);
    if (!persisted || !terminalMatchesResult(persisted, result)) {
      return stageResult({
        status: "manual_required",
        safeReasonCode: "database_terminal_authority_missing",
        marker: "unknown",
        manualReviewRequired: true,
        dbFinalizerInvocations: finalizerInvocations,
        dbOutcomeUnknown: 1
      });
    }

    return stageResult({
      status: result.status,
      safeReasonCode: null,
      marker: "terminal",
      terminal: true,
      dbFinalizerInvocations: finalizerInvocations,
      evidence: {
        dbObservedRowCount: result.dbObservedRowCount,
        dbDeletedRowCount: result.dbDeletedRowCount,
        dbAnonymizedRowCount: result.dbAnonymizedRowCount,
        dbRetainedRowCount: result.dbRetainedRowCount
      }
    });
  } catch {
    return stageResult({
      status: "manual_required",
      safeReasonCode: "database_stage_result_unknown",
      marker: "unknown",
      manualReviewRequired: true,
      dbFinalizerInvocations: finalizerInvocations,
      dbOutcomeUnknown: 1
    });
  }
}

export function createAccountDeletionDatabaseOperatorBridge(options: {
  env?: NodeJS.ProcessEnv;
  lookupRequest?: DatabaseOperatorRequestLookup;
  repository?: AccountDeletionDatabaseFinalizerRepository;
  createRepository?: () => AccountDeletionDatabaseFinalizerRepository;
} = {}) {
  const env = options.env ?? process.env;

  return {
    requestResolver: (input: DatabaseOperatorResolverInput) =>
      resolveAccountDeletionDatabaseOperatorRequest(input, { lookupRequest: options.lookupRequest }),
    stageServices: {
      database: (input: DatabaseOperatorStageInput) =>
        runAccountDeletionDatabaseOperatorStage(input, {
          env,
          repository: options.repository,
          createRepository: options.createRepository
        })
    }
  };
}
