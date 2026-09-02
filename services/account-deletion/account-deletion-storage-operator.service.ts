import type { Database } from "@/types/database";
import { ACCOUNT_DELETION_DESTRUCTIVE_GUARD_ENV } from "./account-deletion.service";
import {
  createAccountDeletionStorageAdapter,
  type AccountDeletionStorageAdapter
} from "./account-deletion-storage-adapter";
import {
  runAccountDeletionStorageDurableStep,
  sealAccountDeletionStorageSnapshot,
  type AccountDeletionStorageStepResult
} from "./account-deletion-storage-durable-runner";
import {
  createAccountDeletionStorageDurableRepository,
  type AccountDeletionStorageDurableRepository
} from "./account-deletion-storage-durable.repository";

type StorageRequestRow = Database["public"]["Tables"]["account_deletion_requests"]["Row"];

type StorageOperatorRequestLookup = (input: {
  field: "id" | "anonymized_user_ref";
  value: string;
}) => Promise<{
  rows: StorageRequestRow[];
  failed: boolean;
}>;

type StorageOperatorResolverInput = {
  stage?: string;
  requestRef?: string;
};

type StorageOperatorStageInput = {
  stage?: string;
  mode?: string;
  request?: {
    userId?: string;
    deletionRequestId?: string;
  };
};

type StorageDurableStep = typeof runAccountDeletionStorageDurableStep;
type StorageSnapshotSeal = typeof sealAccountDeletionStorageSnapshot;

export type AccountDeletionStorageOperatorProgressMarker =
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

type StorageOperatorStatus = "succeeded" | "not_needed" | "failed" | "manual_required" | "blocked";

export type AccountDeletionStorageOperatorSafeStageResult = {
  status: StorageOperatorStatus;
  safeReasonCode: string | null;
  safeProgress: {
    marker: AccountDeletionStorageOperatorProgressMarker;
    terminal: boolean;
    retryable: boolean;
    manualReviewRequired: boolean;
  };
  safeCounts: {
    requestResolverCalls: number;
    destructiveOperationsAttempted: number;
    storageAttempted: number;
    storageSealAttempts: number;
    storageInventoryReads: number;
    storageRunnerInvocations: number;
    storageExternalActions: number;
    storageDeleteActions: number;
    storageVerificationActions: number;
    storageOutcomeUnknown: number;
    storageTerminal: number;
    storageNonterminal: number;
  };
};

type StorageStageOptions = {
  env?: NodeJS.ProcessEnv;
  repository?: AccountDeletionStorageDurableRepository;
  storageAdapter?: AccountDeletionStorageAdapter;
  runDurableStep?: StorageDurableStep;
  sealSnapshot?: StorageSnapshotSeal;
  createRepository?: () => AccountDeletionStorageDurableRepository;
  createStorageAdapter?: () => AccountDeletionStorageAdapter;
};

type ObservedStorageCounts = {
  storageSealAttempts: number;
  storageInventoryReads: number;
  storageRunnerInvocations: number;
  storageExternalActions: number;
  storageDeleteActions: number;
  storageVerificationActions: number;
};

const STORAGE_SNAPSHOT_VERSION = "g5d-2e.account-storage.v1";
const STORAGE_OPERATOR_REQUEST_STATUSES = new Set(["confirmed", "storage_cleanup_failed"]);
const STORAGE_NONTERMINAL_CLEANUP_STATUSES = new Set(["pending", "failed", "manual_required"]);
const STORAGE_TERMINAL_CLEANUP_STATUSES = new Set(["succeeded", "not_needed"]);

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isAnonymizedRequestRefLike(value: string) {
  return /^adr_[0-9a-f]{32}$/i.test(value);
}

function hasTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

function hasPersistedProviderTerminal(row: Pick<StorageRequestRow, "provider_cleanup_status" | "provider_sub_finalized_at">) {
  return STORAGE_TERMINAL_CLEANUP_STATUSES.has(row.provider_cleanup_status) && hasTimestamp(row.provider_sub_finalized_at);
}

function hasValidStorageCounts(row: StorageRequestRow) {
  return (
    Number.isInteger(row.storage_snapshot_target_count) &&
    row.storage_snapshot_target_count >= 0 &&
    Number.isInteger(row.storage_verified_absent_count) &&
    row.storage_verified_absent_count >= 0 &&
    row.storage_verified_absent_count <= row.storage_snapshot_target_count
  );
}

function hasPersistedStorageTerminal(row: StorageRequestRow) {
  return (
    STORAGE_TERMINAL_CLEANUP_STATUSES.has(row.storage_cleanup_status) &&
    row.storage_snapshot_version === STORAGE_SNAPSHOT_VERSION &&
    row.storage_snapshot_status === "sealed" &&
    row.storage_snapshot_seal_version === 1 &&
    hasTimestamp(row.storage_snapshot_collection_started_at) &&
    hasTimestamp(row.storage_snapshot_sealed_at) &&
    hasTimestamp(row.storage_sub_finalized_at) &&
    row.storage_locator_scrubbed_at === row.storage_sub_finalized_at &&
    row.storage_snapshot_fingerprint === null &&
    row.storage_snapshot_collection_token === null &&
    row.storage_verified_absent_count === row.storage_snapshot_target_count &&
    row.storage_runner_lease_token === null &&
    row.storage_runner_lease_expires_at === null &&
    hasValidStorageCounts(row)
  );
}

function classifyStorageSnapshot(row: StorageRequestRow): "unsealed" | "sealed" | "manual" | "terminal" | null {
  if (hasPersistedStorageTerminal(row)) return "terminal";

  if (
    STORAGE_TERMINAL_CLEANUP_STATUSES.has(row.storage_cleanup_status) ||
    row.storage_sub_finalized_at !== null ||
    row.storage_locator_scrubbed_at !== null ||
    row.storage_snapshot_version !== STORAGE_SNAPSHOT_VERSION ||
    !hasValidStorageCounts(row)
  ) {
    return null;
  }

  if (row.storage_snapshot_status === "pending") {
    return row.storage_snapshot_seal_version === 0 &&
      row.storage_snapshot_collection_token === null &&
      row.storage_snapshot_collection_started_at === null &&
      row.storage_snapshot_sealed_at === null &&
      row.storage_snapshot_fingerprint === null &&
      row.storage_snapshot_target_count === 0 &&
      row.storage_verified_absent_count === 0 &&
      ["pending", "failed"].includes(row.storage_cleanup_status)
      ? "unsealed"
      : null;
  }

  if (row.storage_snapshot_status === "collecting") {
    return row.storage_snapshot_seal_version === 0 &&
      typeof row.storage_snapshot_collection_token === "string" &&
      hasTimestamp(row.storage_snapshot_collection_started_at) &&
      row.storage_snapshot_sealed_at === null &&
      row.storage_snapshot_fingerprint === null &&
      row.storage_snapshot_target_count === 0 &&
      row.storage_verified_absent_count === 0 &&
      ["pending", "failed"].includes(row.storage_cleanup_status)
      ? "unsealed"
      : null;
  }

  if (
    row.storage_snapshot_status === "sealed" &&
    row.storage_snapshot_seal_version === 1 &&
    row.storage_snapshot_collection_token === null &&
    hasTimestamp(row.storage_snapshot_collection_started_at) &&
    hasTimestamp(row.storage_snapshot_sealed_at) &&
    typeof row.storage_snapshot_fingerprint === "string" &&
    row.storage_snapshot_fingerprint.length > 0 &&
    STORAGE_NONTERMINAL_CLEANUP_STATUSES.has(row.storage_cleanup_status)
  ) {
    return row.storage_cleanup_status === "manual_required" ? "manual" : "sealed";
  }

  return null;
}

function progress(
  marker: AccountDeletionStorageOperatorProgressMarker,
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
  status: StorageOperatorStatus;
  safeReasonCode: string | null;
  marker: AccountDeletionStorageOperatorProgressMarker;
  terminal?: boolean;
  retryable?: boolean;
  manualReviewRequired?: boolean;
  counts?: Partial<ObservedStorageCounts>;
  storageOutcomeUnknown?: number;
}): AccountDeletionStorageOperatorSafeStageResult {
  const terminal = input.terminal === true;
  const storageExternalActions = input.counts?.storageExternalActions ?? 0;

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
      destructiveOperationsAttempted: storageExternalActions,
      storageAttempted: storageExternalActions,
      storageSealAttempts: input.counts?.storageSealAttempts ?? 0,
      storageInventoryReads: input.counts?.storageInventoryReads ?? 0,
      storageRunnerInvocations: input.counts?.storageRunnerInvocations ?? 0,
      storageExternalActions,
      storageDeleteActions: input.counts?.storageDeleteActions ?? 0,
      storageVerificationActions: input.counts?.storageVerificationActions ?? 0,
      storageOutcomeUnknown: input.storageOutcomeUnknown ?? 0,
      storageTerminal: terminal ? 1 : 0,
      storageNonterminal: terminal ? 0 : 1
    }
  };
}

async function lookupAccountDeletionStorageOperatorRequest(input: {
  field: "id" | "anonymized_user_ref";
  value: string;
}) {
  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("account_deletion_requests")
    .select(
      "id,user_id,anonymized_user_ref,status,provider_cleanup_status,provider_sub_finalized_at,storage_cleanup_status,storage_snapshot_version,storage_snapshot_status,storage_snapshot_seal_version,storage_snapshot_collection_token,storage_snapshot_collection_started_at,storage_snapshot_sealed_at,storage_snapshot_fingerprint,storage_snapshot_target_count,storage_verified_absent_count,storage_runner_lease_token,storage_runner_lease_expires_at,storage_sub_finalized_at,storage_locator_scrubbed_at"
    )
    .eq(input.field, input.value)
    .limit(2);

  return {
    rows: (data ?? []) as StorageRequestRow[],
    failed: Boolean(error)
  };
}

export async function resolveAccountDeletionStorageOperatorRequest(
  input: StorageOperatorResolverInput,
  dependencies: { lookupRequest?: StorageOperatorRequestLookup } = {}
) {
  if (input.stage?.trim().toLowerCase() !== "storage") {
    return { ok: false, safeReasonCode: "storage_resolver_stage_not_allowed" };
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
    const lookup = dependencies.lookupRequest ?? lookupAccountDeletionStorageOperatorRequest;
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
    if (!STORAGE_OPERATOR_REQUEST_STATUSES.has(row.status)) {
      return { ok: false, safeReasonCode: "storage_request_not_runnable" };
    }
    if (!hasPersistedProviderTerminal(row)) {
      return { ok: false, safeReasonCode: "provider_terminal_not_persisted" };
    }
    if (classifyStorageSnapshot(row) === null) {
      return { ok: false, safeReasonCode: "storage_state_not_runnable" };
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

function createObservedStorageAdapter(storageAdapter: AccountDeletionStorageAdapter) {
  let inventoryReads = 0;
  let targetActionInvocations = 0;
  let externalActions = 0;
  let deleteActions = 0;
  let verificationActions = 0;

  const adapter: AccountDeletionStorageAdapter = {
    async listOwnedInventory(userId) {
      inventoryReads += 1;
      return storageAdapter.listOwnedInventory(userId);
    },
    async deleteObject(input) {
      targetActionInvocations += 1;
      if (externalActions >= 1) return { kind: "protocol_error" };
      externalActions += 1;
      deleteActions += 1;
      return storageAdapter.deleteObject(input);
    },
    async verifyObjectAbsence(input) {
      targetActionInvocations += 1;
      if (externalActions >= 1) return { kind: "protocol_error" };
      externalActions += 1;
      verificationActions += 1;
      return storageAdapter.verifyObjectAbsence(input);
    }
  };

  return {
    adapter,
    getTargetActionInvocations: () => targetActionInvocations,
    getCounts: (): Omit<ObservedStorageCounts, "storageSealAttempts" | "storageRunnerInvocations"> => ({
      storageInventoryReads: inventoryReads,
      storageExternalActions: externalActions,
      storageDeleteActions: deleteActions,
      storageVerificationActions: verificationActions
    })
  };
}

function mapDurableStepResult(
  result: AccountDeletionStorageStepResult,
  counts: ObservedStorageCounts,
  terminalAuthority: boolean
): AccountDeletionStorageOperatorSafeStageResult {
  switch (result.kind) {
    case "storage_stage_finalized":
    case "already_finalized":
      return terminalAuthority
        ? stageResult({ status: result.status, safeReasonCode: null, marker: "terminal", terminal: true, counts })
        : stageResult({
            status: "manual_required",
            safeReasonCode: "storage_terminal_authority_missing",
            marker: "unknown",
            manualReviewRequired: true,
            counts,
            storageOutcomeUnknown: 1
          });
    case "manual_required":
      return stageResult({
        status: "manual_required",
        safeReasonCode: "storage_cleanup_manual_required",
        marker: "manual_required",
        manualReviewRequired: true,
        counts
      });
    case "progressed":
      return stageResult({
        status: "blocked",
        safeReasonCode: "storage_progressed_continue_required",
        marker: "progressed",
        retryable: true,
        counts
      });
    case "target_verified":
      return stageResult({
        status: "blocked",
        safeReasonCode: "storage_target_verified_continue_required",
        marker: "target_verified",
        retryable: true,
        counts
      });
    case "retry_later":
      return stageResult({
        status: "blocked",
        safeReasonCode: "storage_retry_later",
        marker: "retry_later",
        retryable: true,
        counts
      });
    case "busy":
      return stageResult({ status: "blocked", safeReasonCode: "storage_busy", marker: "busy", retryable: true, counts });
    case "stale_result":
      return stageResult({
        status: "blocked",
        safeReasonCode: "storage_stale_result",
        marker: "stale_result",
        retryable: true,
        counts
      });
    case "not_runnable":
      return stageResult({ status: "blocked", safeReasonCode: "storage_cleanup_not_runnable", marker: "not_runnable", counts });
  }

  const compileTimeExhaustive: never = result;
  void compileTimeExhaustive;

  return stageResult({
    status: "manual_required",
    safeReasonCode: "storage_stage_result_unknown",
    marker: "unknown",
    manualReviewRequired: true,
    counts,
    storageOutcomeUnknown: 1
  });
}

export async function runAccountDeletionStorageOperatorStage(
  input: StorageOperatorStageInput,
  options: StorageStageOptions = {}
): Promise<AccountDeletionStorageOperatorSafeStageResult> {
  const env = options.env ?? process.env;
  let sealAttempts = 0;
  let runnerInvocations = 0;
  let observedAdapter: ReturnType<typeof createObservedStorageAdapter> | null = null;
  const observedCounts = (): ObservedStorageCounts => ({
    storageSealAttempts: sealAttempts,
    storageRunnerInvocations: runnerInvocations,
    storageInventoryReads: observedAdapter?.getCounts().storageInventoryReads ?? 0,
    storageExternalActions: observedAdapter?.getCounts().storageExternalActions ?? 0,
    storageDeleteActions: observedAdapter?.getCounts().storageDeleteActions ?? 0,
    storageVerificationActions: observedAdapter?.getCounts().storageVerificationActions ?? 0
  });

  if (input.stage?.trim().toLowerCase() !== "storage" || input.mode !== "execute") {
    return stageResult({ status: "blocked", safeReasonCode: "storage_stage_not_allowed", marker: "blocked" });
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
    const repository = options.repository ?? (options.createRepository ?? createAccountDeletionStorageDurableRepository)();
    const request = await repository.getRequestForOwner(deletionRequestId, userId);
    if (!request || !STORAGE_OPERATOR_REQUEST_STATUSES.has(request.status)) {
      return stageResult({ status: "blocked", safeReasonCode: "storage_cleanup_not_runnable", marker: "not_runnable" });
    }
    if (!hasPersistedProviderTerminal(request)) {
      return stageResult({ status: "blocked", safeReasonCode: "provider_terminal_not_persisted", marker: "not_runnable" });
    }

    const snapshotState = classifyStorageSnapshot(request);
    if (snapshotState === null) {
      return stageResult({ status: "blocked", safeReasonCode: "storage_cleanup_not_runnable", marker: "not_runnable" });
    }
    if (snapshotState === "manual") {
      return stageResult({
        status: "manual_required",
        safeReasonCode: "storage_cleanup_manual_required",
        marker: "manual_required",
        manualReviewRequired: true
      });
    }

    const storageAdapter = options.storageAdapter ?? (options.createStorageAdapter ?? createAccountDeletionStorageAdapter)();
    observedAdapter = createObservedStorageAdapter(storageAdapter);

    if (snapshotState === "unsealed") {
      sealAttempts = 1;
      const sealSnapshot = options.sealSnapshot ?? sealAccountDeletionStorageSnapshot;
      const sealed = await sealSnapshot(
        { deletionRequestId, userId },
        { repository, storageAdapter: observedAdapter.adapter }
      );
      const counts = observedCounts();
      if (
        !sealed ||
        classifyStorageSnapshot(sealed) !== "sealed" ||
        counts.storageInventoryReads !== 2 ||
        counts.storageExternalActions !== 0
      ) {
        return stageResult({
          status: "manual_required",
          safeReasonCode: "storage_snapshot_seal_failed",
          marker: "manual_required",
          manualReviewRequired: true,
          counts
        });
      }

      return stageResult({
        status: "blocked",
        safeReasonCode: "storage_snapshot_sealed_continue_required",
        marker: "seal_only",
        retryable: true,
        counts
      });
    }

    const runDurableStep = options.runDurableStep ?? runAccountDeletionStorageDurableStep;
    runnerInvocations = 1;
    const result = await runDurableStep(
      { deletionRequestId, userId },
      { repository, storageAdapter: observedAdapter.adapter }
    );
    const counts = observedCounts();

    if (observedAdapter.getTargetActionInvocations() > 1) {
      return stageResult({
        status: "manual_required",
        safeReasonCode: "storage_action_limit_exceeded",
        marker: "unknown",
        manualReviewRequired: true,
        counts,
        storageOutcomeUnknown: 1
      });
    }

    let terminalAuthority = false;
    if (result.kind === "storage_stage_finalized" || result.kind === "already_finalized") {
      const persisted = await repository.getRequestForOwner(deletionRequestId, userId);
      terminalAuthority = Boolean(
        persisted && hasPersistedProviderTerminal(persisted) && hasPersistedStorageTerminal(persisted) &&
        persisted.storage_cleanup_status === result.status
      );
    }

    return mapDurableStepResult(result, counts, terminalAuthority);
  } catch {
    return stageResult({
      status: "manual_required",
      safeReasonCode: "storage_stage_result_unknown",
      marker: "unknown",
      manualReviewRequired: true,
      counts: observedCounts(),
      storageOutcomeUnknown: 1
    });
  }
}

export function createAccountDeletionStorageOperatorBridge(options: {
  env?: NodeJS.ProcessEnv;
  lookupRequest?: StorageOperatorRequestLookup;
  repository?: AccountDeletionStorageDurableRepository;
  storageAdapter?: AccountDeletionStorageAdapter;
  runDurableStep?: StorageDurableStep;
  sealSnapshot?: StorageSnapshotSeal;
  createRepository?: () => AccountDeletionStorageDurableRepository;
  createStorageAdapter?: () => AccountDeletionStorageAdapter;
} = {}) {
  const env = options.env ?? process.env;

  return {
    requestResolver: (input: StorageOperatorResolverInput) =>
      resolveAccountDeletionStorageOperatorRequest(input, { lookupRequest: options.lookupRequest }),
    stageServices: {
      storage: (input: StorageOperatorStageInput) =>
        runAccountDeletionStorageOperatorStage(input, {
          env,
          repository: options.repository,
          storageAdapter: options.storageAdapter,
          runDurableStep: options.runDurableStep,
          sealSnapshot: options.sealSnapshot,
          createRepository: options.createRepository,
          createStorageAdapter: options.createStorageAdapter
        })
    }
  };
}
