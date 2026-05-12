import { randomBytes } from "node:crypto";
import { AppError } from "@/lib/errors";
import { getCostGuardIssue } from "@/lib/cost-guard";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServiceRoleKey } from "@/lib/supabase/config";
import type { AppSupabaseClient } from "@/lib/supabase/client";
import { deleteElevenLabsVoiceForAccountDeletion } from "@/providers/voice/elevenlabs";
import type { ElevenLabsVoiceDeletionResult } from "@/providers/voice/elevenlabs";
import { RECORDINGS_BUCKET, VOICE_CONSENTS_BUCKET, VOICE_SAMPLES_BUCKET } from "@/services/storage/constants";
import { parseRecordingAudioReference } from "@/services/storage/recording-storage.service";
import { parseVoiceConsentRecordingReference } from "@/services/storage/voice-consent-storage.service";
import { parseVoiceSampleAudioReference } from "@/services/storage/voice-sample-storage.service";
import { decodeStoredAssetMetadata } from "@/services/voice/replay.service";
import { SCRIPT_AUDIO_STORAGE_BUCKET } from "@/services/voice/replay-storage";
import type {
  AccountDeletionCleanupStatus,
  AccountDeletionFailureStage,
  AccountDeletionRequestStatus,
  Database,
  Json
} from "@/types/database";

type AccountDeletionRequestRow = Database["public"]["Tables"]["account_deletion_requests"]["Row"];
type AccountDeletionRequestInsert = Database["public"]["Tables"]["account_deletion_requests"]["Insert"];
type AccountDeletionRequestUpdate = Database["public"]["Tables"]["account_deletion_requests"]["Update"];
type SupabaseReadClient = Pick<AppSupabaseClient, "from">;
type PostgrestErrorLike = { message: string; code?: string };
type CountResult = { count: number | null; error: PostgrestErrorLike | null };
type StorageListItem = {
  name: string;
  id?: string | null;
  metadata?: Record<string, unknown> | null;
};
type StorageObjectListResult = {
  keys: string[];
  status: "available" | "unavailable";
};
type StorageCleanupBucketSummary = {
  bucket: "recordings" | "scriptAudios" | "voiceSamples" | "voiceConsents";
  status: "required" | "not_needed" | "blocked";
  knownObjectCount: number;
  listedObjectCount: number;
  orphanCandidateCount: number;
  missingKnownObjectCount: number;
  listStatus: "available" | "unavailable";
};
type ElevenLabsCleanupCandidate = {
  providerVoiceId: string;
};
type ElevenLabsVoiceDeleteFn = (providerVoiceId: string) => Promise<ElevenLabsVoiceDeletionResult>;
type StorageCleanupBucketTarget = {
  bucket: StorageCleanupBucketSummary["bucket"];
  storageBucket: string;
  objectKeys: string[];
};
type StorageObjectDeletionResult =
  | {
      ok: true;
      deletedCount: number;
    }
  | {
      ok: false;
      safeReasonCode: string;
      failedCount: number;
    };
type StorageObjectDeleteFn = (input: {
  bucket: string;
  objectKeys: string[];
}) => Promise<StorageObjectDeletionResult>;
export type DatabaseCleanupTableActualSummary = {
  table: DatabaseCleanupTableName;
  action: DatabaseCleanupAction;
  status: "not_needed" | "succeeded" | "failed" | "retained" | "blocked";
  attempted: number;
  affected: number;
  retained: number;
};
type DatabaseCleanupExecutionResult =
  | {
      ok: true;
      tables: DatabaseCleanupTableActualSummary[];
    }
  | {
      ok: false;
      safeReasonCode: string;
      tables: DatabaseCleanupTableActualSummary[];
    };
type DatabaseCleanupExecuteFn = (input: {
  userId: string;
  dryRun: DatabaseCleanupDryRun;
}) => Promise<DatabaseCleanupExecutionResult>;
type SupabaseAuthDeletionExecutionResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      safeReasonCode: string;
    };
type SupabaseAuthDeleteFn = (userId: string) => Promise<SupabaseAuthDeletionExecutionResult>;

export const ACCOUNT_DELETION_DESTRUCTIVE_GUARD_ENV = "NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE";
export type DatabaseCleanupTableName =
  | "profiles"
  | "scripts"
  | "takes"
  | "weakWords"
  | "coachFeedback"
  | "scriptSavedBestTakes"
  | "scriptSavedModelAudios"
  | "scriptAudios"
  | "voiceConsents"
  | "voices"
  | "quotaEvents"
  | "accountDeletionRequests";
export type DatabaseCleanupAction =
  | "cascade_dependent"
  | "explicit_delete"
  | "delete_last"
  | "retain_anonymized"
  | "not_touched";
export type DatabaseCleanupTableSummary = {
  table: DatabaseCleanupTableName;
  status: "required" | "not_needed" | "blocked";
  action: DatabaseCleanupAction;
  candidateCount: number;
  notes: string[];
};

const ACTIVE_DELETION_REQUEST_STATUSES: AccountDeletionRequestStatus[] = [
  "requested",
  "confirmed",
  "processing",
  "provider_cleanup_failed",
  "storage_cleanup_failed",
  "db_cleanup_failed",
  "auth_cleanup_failed"
];

export type AccountDeletionRequestView = {
  id: string;
  status: AccountDeletionRequestStatus;
  requestSource: string;
  failureStage: AccountDeletionFailureStage | null;
  failureReasonCode: string | null;
  cleanup: {
    provider: AccountDeletionCleanupStatus;
    storage: AccountDeletionCleanupStatus;
    database: AccountDeletionCleanupStatus;
    auth: AccountDeletionCleanupStatus;
    notification: AccountDeletionCleanupStatus;
  };
  retryCount: number;
  requestedAt: string;
  confirmedAt: string | null;
  processingStartedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  expiresAt: string | null;
  lastAttemptedAt: string | null;
};

export type AccountDeletionRequestResult = {
  deletionRequest: AccountDeletionRequestView;
  created?: boolean;
  confirmed?: boolean;
};

export type AccountDeletionInventorySummary = {
  deletionRequest: AccountDeletionRequestView;
  database: {
    profiles: number;
    scripts: number;
    takes: number;
    weakWords: number;
    coachFeedback: number;
    savedBestTakes: number;
    savedModelAudios: number;
    scriptAudios: number;
    voiceConsents: number;
    voices: number;
    quotaEvents: number;
  };
  storage: {
    recordings: { count: number; status: "available" | "unavailable" };
    scriptAudios: { count: number; status: "available" | "unavailable" };
    voiceSamples: { count: number; status: "available" | "unavailable" };
    voiceConsents: { count: number; status: "available" | "unavailable" };
  };
  provider: {
    elevenLabsVoiceCandidates: number;
  };
  notes: string[];
};

export type ElevenLabsProviderCleanupDryRun = {
  deletionRequest: AccountDeletionRequestView;
  status: "required" | "not_needed" | "blocked";
  candidates: {
    totalVoices: number;
    elevenLabsVoices: number;
    nonElevenLabsVoices: number;
    providerReferencePresent: number;
    providerReferenceMissing: number;
    providerReferenceInvalid: number;
  };
  cleanup: {
    required: number;
    notNeeded: number;
    blocked: number;
  };
  notes: string[];
};
export type ElevenLabsProviderCleanupActualResult = {
  deletionRequest: AccountDeletionRequestView;
  status: "blocked" | "already_satisfied" | "not_needed" | "succeeded" | "failed" | "manual_required";
  guard: {
    destructiveGuard: boolean;
    requestIdMatched: boolean;
    statusRunnable: boolean;
    providerStageRunnable: boolean;
    dryRunRunnable: boolean;
    costGuardAllowed: boolean;
  };
  cleanup: {
    attempted: number;
    succeeded: number;
    failed: number;
    notNeeded: number;
    blocked: number;
  };
  failureReasonCode: string | null;
  notes: string[];
};

export type StorageCleanupDryRun = {
  deletionRequest: AccountDeletionRequestView;
  status: "required" | "not_needed" | "blocked";
  buckets: StorageCleanupBucketSummary[];
  totals: {
    knownObjectCount: number;
    listedObjectCount: number;
    orphanCandidateCount: number;
    missingKnownObjectCount: number;
  };
  notes: string[];
};

export type StorageCleanupBucketActualSummary = {
  bucket: StorageCleanupBucketSummary["bucket"];
  status: "not_needed" | "succeeded" | "failed" | "blocked";
  attempted: number;
  succeeded: number;
  failed: number;
};

export type StorageCleanupActualResult = {
  deletionRequest: AccountDeletionRequestView;
  status: "blocked" | "already_satisfied" | "not_needed" | "succeeded" | "failed" | "manual_required";
  guard: {
    destructiveGuard: boolean;
    requestIdMatched: boolean;
    statusRunnable: boolean;
    providerCleanupSatisfied: boolean;
    storageStageRunnable: boolean;
    dryRunRunnable: boolean;
    storageUploadKillSwitchActive: boolean;
  };
  cleanup: {
    attempted: number;
    succeeded: number;
    failed: number;
    notNeeded: number;
    blocked: number;
    buckets: StorageCleanupBucketActualSummary[];
  };
  failureReasonCode: string | null;
  notes: string[];
};

export type DatabaseCleanupDryRun = {
  deletionRequest: AccountDeletionRequestView;
  status: "required" | "not_needed" | "blocked";
  tables: DatabaseCleanupTableSummary[];
  totals: {
    candidateCount: number;
    cascadeDependentCount: number;
    explicitDeleteCount: number;
    deleteLastCount: number;
    retainAnonymizeCount: number;
    notTouchedCount: number;
    quotaEventsDeleteCandidateCount: number;
    accountDeletionRequestsRetainedTrackingCount: number;
  };
  notes: string[];
};

export type DatabaseCleanupActualResult = {
  deletionRequest: AccountDeletionRequestView;
  status: "blocked" | "already_satisfied" | "not_needed" | "succeeded" | "failed" | "manual_required";
  guard: {
    destructiveGuard: boolean;
    requestIdMatched: boolean;
    statusRunnable: boolean;
    providerCleanupSatisfied: boolean;
    storageCleanupSatisfied: boolean;
    databaseStageRunnable: boolean;
    dryRunRunnable: boolean;
  };
  cleanup: {
    attempted: number;
    affected: number;
    failed: number;
    retained: number;
    notNeeded: number;
    blocked: number;
    tables: DatabaseCleanupTableActualSummary[];
  };
  failureReasonCode: string | null;
  notes: string[];
};

export type SupabaseAuthDeletionDryRun = {
  deletionRequest: AccountDeletionRequestView;
  status: "ready" | "waiting_for_db_cleanup" | "already_satisfied" | "blocked";
  canDelete: boolean;
  candidateCount: number;
  preflight: {
    requestRunnable: boolean;
    serviceRoleRequired: true;
    serviceRoleAvailable: boolean;
    dbCleanupSatisfied: boolean;
    authUserStatus: "present" | "missing" | "unavailable";
    trackingAfterDeletion: "anonymized_reference";
    completionAfterAuth: true;
    notificationAfterAuth: true;
  };
  notes: string[];
};

export type SupabaseAuthDeletionActualResult = {
  deletionRequest: AccountDeletionRequestView;
  status: "blocked" | "already_satisfied" | "succeeded" | "failed" | "manual_required";
  guard: {
    destructiveGuard: boolean;
    requestIdMatched: boolean;
    statusRunnable: boolean;
    providerCleanupSatisfied: boolean;
    storageCleanupSatisfied: boolean;
    databaseCleanupSatisfied: boolean;
    authStageRunnable: boolean;
    dryRunRunnable: boolean;
    serviceRoleRequired: true;
    serviceRoleAvailable: boolean;
  };
  cleanup: {
    attempted: number;
    succeeded: number;
    failed: number;
    blocked: number;
  };
  failureReasonCode: string | null;
  notes: string[];
};

export type AccountDeletionJobStageName =
  | "provider_cleanup"
  | "storage_cleanup"
  | "db_cleanup"
  | "auth_cleanup"
  | "completion";

export type AccountDeletionJobStageDryRun = {
  name: AccountDeletionJobStageName;
  order: number;
  status: "ready" | "waiting_for_prior_stage" | "already_satisfied" | "blocked";
  count: number | null;
  guard: string;
  notes: string[];
};

export type AccountDeletionJobDryRun = {
  deletionRequest: AccountDeletionRequestView;
  canRun: boolean;
  runGuard: {
    status: AccountDeletionRequestStatus;
    allowed: boolean;
    reason: string;
  };
  providerCleanup: ElevenLabsProviderCleanupDryRun;
  storageCleanup: StorageCleanupDryRun;
  databaseCleanup: DatabaseCleanupDryRun;
  authDeletion: SupabaseAuthDeletionDryRun;
  inventory: AccountDeletionInventorySummary;
  stages: AccountDeletionJobStageDryRun[];
  notes: string[];
};

const RUNNABLE_DELETION_REQUEST_STATUSES: AccountDeletionRequestStatus[] = [
  "confirmed",
  "provider_cleanup_failed",
  "storage_cleanup_failed",
  "db_cleanup_failed",
  "auth_cleanup_failed"
];

const PROVIDER_CLEANUP_ACTUAL_RUNNABLE_STATUSES: AccountDeletionRequestStatus[] = [
  "confirmed",
  "provider_cleanup_failed"
];

const STORAGE_CLEANUP_ACTUAL_RUNNABLE_STATUSES: AccountDeletionRequestStatus[] = [
  "confirmed",
  "storage_cleanup_failed"
];

const DATABASE_CLEANUP_ACTUAL_RUNNABLE_STATUSES: AccountDeletionRequestStatus[] = [
  "confirmed",
  "db_cleanup_failed"
];

const AUTH_DELETION_ACTUAL_RUNNABLE_STATUSES: AccountDeletionRequestStatus[] = [
  "confirmed",
  "auth_cleanup_failed"
];

const STORAGE_CLEANUP_BUCKET_TARGETS: Array<{
  bucket: StorageCleanupBucketSummary["bucket"];
  storageBucket: string;
}> = [
  { bucket: "recordings", storageBucket: RECORDINGS_BUCKET },
  { bucket: "scriptAudios", storageBucket: SCRIPT_AUDIO_STORAGE_BUCKET },
  { bucket: "voiceSamples", storageBucket: VOICE_SAMPLES_BUCKET },
  { bucket: "voiceConsents", storageBucket: VOICE_CONSENTS_BUCKET }
];

function isTruthyEnv(value: string | undefined) {
  if (!value) {
    return false;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export function isAccountDeletionDestructiveGuardEnabled(env: NodeJS.ProcessEnv = process.env) {
  return isTruthyEnv(env[ACCOUNT_DELETION_DESTRUCTIVE_GUARD_ENV]);
}

function asMaybeSingle<TRow>(value: unknown) {
  return value as { data: TRow | null; error: PostgrestErrorLike | null };
}

function asCount(value: unknown) {
  return value as CountResult;
}

function getAdminClient() {
  if (!getSupabaseServiceRoleKey()) {
    throw new AppError(503, "削除リクエストを server-side で記録するための設定が不足しています。");
  }

  return createSupabaseAdminClient();
}

function buildAnonymizedUserRef() {
  return `adr_${randomBytes(16).toString("hex")}`;
}

function buildRequestMetadata(): Json {
  return {
    request_version: "rr-2b",
    deletion_job: "not_started"
  };
}

function mergeConfirmationMetadata(existing: Json): Json {
  const safeExisting =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? existing
      : {};

  return {
    ...safeExisting,
    confirmation_method: "typed_delete",
    deletion_job: "not_started"
  };
}

function mapDbError(operation: string, error: PostgrestErrorLike) {
  return new AppError(500, `${operation}に失敗しました。`);
}

function toView(row: AccountDeletionRequestRow): AccountDeletionRequestView {
  return {
    id: row.id,
    status: row.status,
    requestSource: row.request_source,
    failureStage: row.failure_stage,
    failureReasonCode: row.failure_reason_code,
    cleanup: {
      provider: row.provider_cleanup_status,
      storage: row.storage_cleanup_status,
      database: row.db_cleanup_status,
      auth: row.auth_cleanup_status,
      notification: row.notification_status
    },
    retryCount: row.retry_count,
    requestedAt: row.requested_at,
    confirmedAt: row.confirmed_at,
    processingStartedAt: row.processing_started_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    expiresAt: row.expires_at,
    lastAttemptedAt: row.last_attempted_at
  };
}

function isCleanupSatisfied(status: AccountDeletionCleanupStatus) {
  return status === "succeeded" || status === "not_needed";
}

function isProviderCleanupActualRunnableStatus(status: AccountDeletionRequestStatus) {
  return PROVIDER_CLEANUP_ACTUAL_RUNNABLE_STATUSES.includes(status);
}

function isProviderCleanupStageRunnable(status: AccountDeletionCleanupStatus) {
  return status === "pending" || status === "failed" || status === "manual_required";
}

function isStorageCleanupActualRunnableStatus(status: AccountDeletionRequestStatus) {
  return STORAGE_CLEANUP_ACTUAL_RUNNABLE_STATUSES.includes(status);
}

function isStorageCleanupStageRunnable(status: AccountDeletionCleanupStatus) {
  return status === "pending" || status === "failed" || status === "manual_required";
}

function isDatabaseCleanupActualRunnableStatus(status: AccountDeletionRequestStatus) {
  return DATABASE_CLEANUP_ACTUAL_RUNNABLE_STATUSES.includes(status);
}

function isDatabaseCleanupStageRunnable(status: AccountDeletionCleanupStatus) {
  return status === "pending" || status === "failed" || status === "manual_required";
}

function isAuthDeletionActualRunnableStatus(status: AccountDeletionRequestStatus) {
  return AUTH_DELETION_ACTUAL_RUNNABLE_STATUSES.includes(status);
}

function isAuthDeletionStageRunnable(status: AccountDeletionCleanupStatus) {
  return status === "pending" || status === "failed" || status === "manual_required";
}

function getDatabaseInventoryCount(inventory: AccountDeletionInventorySummary) {
  return Object.values(inventory.database).reduce((total, count) => total + count, 0);
}

function getStorageInventoryCount(inventory: AccountDeletionInventorySummary) {
  return Object.values(inventory.storage).reduce((total, value) => total + value.count, 0);
}

function getStorageCleanupRequiredCount(storageCleanup?: StorageCleanupDryRun) {
  return storageCleanup?.buckets.reduce((total, bucket) => total + bucket.listedObjectCount, 0) ?? null;
}

function isStorageCleanupBlocked(storageCleanup?: StorageCleanupDryRun) {
  return storageCleanup?.status === "blocked";
}

function getDatabaseCleanupRequiredCount(databaseCleanup?: DatabaseCleanupDryRun) {
  return databaseCleanup?.totals.candidateCount ?? null;
}

function isDatabaseCleanupBlocked(databaseCleanup?: DatabaseCleanupDryRun) {
  return databaseCleanup?.status === "blocked";
}

function isAuthDeletionBlocked(authDeletion?: SupabaseAuthDeletionDryRun) {
  return authDeletion?.status === "blocked";
}

function buildDatabaseTableSummary(input: {
  table: DatabaseCleanupTableName;
  action: DatabaseCleanupAction;
  candidateCount: number;
  notes: string[];
}): DatabaseCleanupTableSummary {
  return {
    table: input.table,
    action: input.action,
    candidateCount: input.candidateCount,
    status: input.candidateCount > 0 ? "required" : "not_needed",
    notes: input.notes
  };
}

function isSafeProviderVoiceIdReference(value: string) {
  const trimmed = value.trim();

  return trimmed.length >= 6 && trimmed.length <= 128 && /^[A-Za-z0-9_-]+$/.test(trimmed);
}

function createProviderCleanupActualResult(input: {
  deletionRequest: AccountDeletionRequestView;
  status: ElevenLabsProviderCleanupActualResult["status"];
  guard: ElevenLabsProviderCleanupActualResult["guard"];
  cleanup?: Partial<ElevenLabsProviderCleanupActualResult["cleanup"]>;
  failureReasonCode?: string | null;
  notes: string[];
}): ElevenLabsProviderCleanupActualResult {
  return {
    deletionRequest: input.deletionRequest,
    status: input.status,
    guard: input.guard,
    cleanup: {
      attempted: input.cleanup?.attempted ?? 0,
      succeeded: input.cleanup?.succeeded ?? 0,
      failed: input.cleanup?.failed ?? 0,
      notNeeded: input.cleanup?.notNeeded ?? 0,
      blocked: input.cleanup?.blocked ?? 0
    },
    failureReasonCode: input.failureReasonCode ?? null,
    notes: input.notes
  };
}

function buildProviderCleanupGuard(input: {
  deletionRequest: AccountDeletionRequestView;
  deletionRequestId: string;
  dryRun?: ElevenLabsProviderCleanupDryRun;
  env?: NodeJS.ProcessEnv;
}): ElevenLabsProviderCleanupActualResult["guard"] {
  const costGuardIssue = getCostGuardIssue("elevenlabs", input.env);

  return {
    destructiveGuard: isAccountDeletionDestructiveGuardEnabled(input.env),
    requestIdMatched: input.deletionRequest.id === input.deletionRequestId,
    statusRunnable: isProviderCleanupActualRunnableStatus(input.deletionRequest.status),
    providerStageRunnable: isProviderCleanupStageRunnable(input.deletionRequest.cleanup.provider),
    dryRunRunnable: input.dryRun ? input.dryRun.status !== "blocked" : false,
    costGuardAllowed: !costGuardIssue
  };
}

function createStorageCleanupActualResult(input: {
  deletionRequest: AccountDeletionRequestView;
  status: StorageCleanupActualResult["status"];
  guard: StorageCleanupActualResult["guard"];
  cleanup?: Partial<Omit<StorageCleanupActualResult["cleanup"], "buckets">> & {
    buckets?: StorageCleanupBucketActualSummary[];
  };
  failureReasonCode?: string | null;
  notes: string[];
}): StorageCleanupActualResult {
  return {
    deletionRequest: input.deletionRequest,
    status: input.status,
    guard: input.guard,
    cleanup: {
      attempted: input.cleanup?.attempted ?? 0,
      succeeded: input.cleanup?.succeeded ?? 0,
      failed: input.cleanup?.failed ?? 0,
      notNeeded: input.cleanup?.notNeeded ?? 0,
      blocked: input.cleanup?.blocked ?? 0,
      buckets: input.cleanup?.buckets ?? []
    },
    failureReasonCode: input.failureReasonCode ?? null,
    notes: input.notes
  };
}

function buildStorageCleanupGuard(input: {
  deletionRequest: AccountDeletionRequestView;
  deletionRequestId: string;
  dryRun?: StorageCleanupDryRun;
  env?: NodeJS.ProcessEnv;
}): StorageCleanupActualResult["guard"] {
  const storageUploadGuardIssue = getCostGuardIssue("storage_uploads", input.env);

  return {
    destructiveGuard: isAccountDeletionDestructiveGuardEnabled(input.env),
    requestIdMatched: input.deletionRequest.id === input.deletionRequestId,
    statusRunnable: isStorageCleanupActualRunnableStatus(input.deletionRequest.status),
    providerCleanupSatisfied: isCleanupSatisfied(input.deletionRequest.cleanup.provider),
    storageStageRunnable: isStorageCleanupStageRunnable(input.deletionRequest.cleanup.storage),
    dryRunRunnable: input.dryRun ? input.dryRun.status !== "blocked" : false,
    storageUploadKillSwitchActive: Boolean(storageUploadGuardIssue)
  };
}

function createDatabaseCleanupActualResult(input: {
  deletionRequest: AccountDeletionRequestView;
  status: DatabaseCleanupActualResult["status"];
  guard: DatabaseCleanupActualResult["guard"];
  cleanup?: Partial<Omit<DatabaseCleanupActualResult["cleanup"], "tables">> & {
    tables?: DatabaseCleanupTableActualSummary[];
  };
  failureReasonCode?: string | null;
  notes: string[];
}): DatabaseCleanupActualResult {
  return {
    deletionRequest: input.deletionRequest,
    status: input.status,
    guard: input.guard,
    cleanup: {
      attempted: input.cleanup?.attempted ?? 0,
      affected: input.cleanup?.affected ?? 0,
      failed: input.cleanup?.failed ?? 0,
      retained: input.cleanup?.retained ?? 0,
      notNeeded: input.cleanup?.notNeeded ?? 0,
      blocked: input.cleanup?.blocked ?? 0,
      tables: input.cleanup?.tables ?? []
    },
    failureReasonCode: input.failureReasonCode ?? null,
    notes: input.notes
  };
}

function buildDatabaseCleanupGuard(input: {
  deletionRequest: AccountDeletionRequestView;
  deletionRequestId: string;
  dryRun?: DatabaseCleanupDryRun;
  env?: NodeJS.ProcessEnv;
}): DatabaseCleanupActualResult["guard"] {
  return {
    destructiveGuard: isAccountDeletionDestructiveGuardEnabled(input.env),
    requestIdMatched: input.deletionRequest.id === input.deletionRequestId,
    statusRunnable: isDatabaseCleanupActualRunnableStatus(input.deletionRequest.status),
    providerCleanupSatisfied: isCleanupSatisfied(input.deletionRequest.cleanup.provider),
    storageCleanupSatisfied: isCleanupSatisfied(input.deletionRequest.cleanup.storage),
    databaseStageRunnable: isDatabaseCleanupStageRunnable(input.deletionRequest.cleanup.database),
    dryRunRunnable: input.dryRun ? input.dryRun.status !== "blocked" : false
  };
}

function createSupabaseAuthDeletionActualResult(input: {
  deletionRequest: AccountDeletionRequestView;
  status: SupabaseAuthDeletionActualResult["status"];
  guard: SupabaseAuthDeletionActualResult["guard"];
  cleanup?: Partial<SupabaseAuthDeletionActualResult["cleanup"]>;
  failureReasonCode?: string | null;
  notes: string[];
}): SupabaseAuthDeletionActualResult {
  return {
    deletionRequest: input.deletionRequest,
    status: input.status,
    guard: input.guard,
    cleanup: {
      attempted: input.cleanup?.attempted ?? 0,
      succeeded: input.cleanup?.succeeded ?? 0,
      failed: input.cleanup?.failed ?? 0,
      blocked: input.cleanup?.blocked ?? 0
    },
    failureReasonCode: input.failureReasonCode ?? null,
    notes: input.notes
  };
}

function buildSupabaseAuthDeletionGuard(input: {
  deletionRequest: AccountDeletionRequestView;
  deletionRequestId: string;
  dryRun?: SupabaseAuthDeletionDryRun;
  env?: NodeJS.ProcessEnv;
}): SupabaseAuthDeletionActualResult["guard"] {
  return {
    destructiveGuard: isAccountDeletionDestructiveGuardEnabled(input.env),
    requestIdMatched: input.deletionRequest.id === input.deletionRequestId,
    statusRunnable: isAuthDeletionActualRunnableStatus(input.deletionRequest.status),
    providerCleanupSatisfied: isCleanupSatisfied(input.deletionRequest.cleanup.provider),
    storageCleanupSatisfied: isCleanupSatisfied(input.deletionRequest.cleanup.storage),
    databaseCleanupSatisfied: isCleanupSatisfied(input.deletionRequest.cleanup.database),
    authStageRunnable: isAuthDeletionStageRunnable(input.deletionRequest.cleanup.auth),
    dryRunRunnable: input.dryRun ? input.dryRun.canDelete : false,
    serviceRoleRequired: true,
    serviceRoleAvailable: input.dryRun?.preflight.serviceRoleAvailable ?? false
  };
}

function validateDeletionRequestCanRun(deletionRequest: AccountDeletionRequestView) {
  const allowed = RUNNABLE_DELETION_REQUEST_STATUSES.includes(deletionRequest.status);

  if (!allowed) {
    return {
      status: deletionRequest.status,
      allowed,
      reason: "confirmed または failed retry 対象の request だけ dry-run job の実行対象です。"
    };
  }

  return {
    status: deletionRequest.status,
    allowed,
    reason: "この request は dry-run job の stage guard を確認できます。"
  };
}

function buildBlockedStages(reason: string): AccountDeletionJobStageDryRun[] {
  return [
    "provider_cleanup",
    "storage_cleanup",
    "db_cleanup",
    "auth_cleanup",
    "completion"
  ].map((name, index) => ({
    name: name as AccountDeletionJobStageName,
    order: index + 1,
    status: "blocked" as const,
    count: null,
    guard: reason,
    notes: ["dry-run only: no deletion action is executed."]
  }));
}

export function planAccountDeletionStages(
  deletionRequest: AccountDeletionRequestView,
  inventory: AccountDeletionInventorySummary,
  providerCleanup?: ElevenLabsProviderCleanupDryRun,
  storageCleanup?: StorageCleanupDryRun,
  databaseCleanup?: DatabaseCleanupDryRun,
  authDeletion?: SupabaseAuthDeletionDryRun
): AccountDeletionJobStageDryRun[] {
  const runGuard = validateDeletionRequestCanRun(deletionRequest);

  if (!runGuard.allowed) {
    return buildBlockedStages(runGuard.reason);
  }

  const providerSatisfied = isCleanupSatisfied(deletionRequest.cleanup.provider);
  const storageSatisfied = isCleanupSatisfied(deletionRequest.cleanup.storage);
  const dbSatisfied = isCleanupSatisfied(deletionRequest.cleanup.database);
  const authSatisfied = isCleanupSatisfied(deletionRequest.cleanup.auth);
  const storageUnavailable = Object.values(inventory.storage).some((value) => value.status === "unavailable");
  const storageBlocked = isStorageCleanupBlocked(storageCleanup);
  const databaseBlocked = isDatabaseCleanupBlocked(databaseCleanup);
  const authBlocked = isAuthDeletionBlocked(authDeletion);
  const providerStatus = providerSatisfied
    ? "already_satisfied"
    : "ready";
  const storageStatus = storageSatisfied
    ? "already_satisfied"
    : !providerSatisfied
      ? "waiting_for_prior_stage"
      : storageBlocked
        ? "blocked"
        : "ready";
  const dbStatus = dbSatisfied
    ? "already_satisfied"
    : !storageSatisfied
      ? "waiting_for_prior_stage"
      : databaseBlocked
        ? "blocked"
        : "ready";
  const authStatus = authSatisfied
    ? "already_satisfied"
    : !dbSatisfied
      ? "waiting_for_prior_stage"
      : authBlocked
        ? "blocked"
        : "ready";
  const completionStatus = authSatisfied ? "ready" : "waiting_for_prior_stage";

  return [
    {
      name: "provider_cleanup",
      order: 1,
      status: providerStatus,
      count: providerCleanup?.cleanup.required ?? inventory.provider.elevenLabsVoiceCandidates,
      guard: "Provider cleanup must run before storage, DB, and Auth cleanup.",
      notes: [
        providerCleanup?.status === "blocked"
          ? "One or more ElevenLabs voice rows need manual review before provider cleanup can run."
          : "ElevenLabs provider-side cloned voice candidates are counted from app-owned voice rows.",
        "dry-run only: provider references are not returned and provider delete is not called."
      ]
    },
    {
      name: "storage_cleanup",
      order: 2,
      status: storageStatus,
      count: getStorageCleanupRequiredCount(storageCleanup) ?? getStorageInventoryCount(inventory),
      guard: "Storage cleanup can run only after provider cleanup is succeeded or not_needed.",
      notes: [
        storageBlocked
          ? "One or more storage buckets are unavailable or have missing known references; actual cleanup must stop at storage_cleanup_failed."
          : storageUnavailable
          ? "One or more storage buckets were unavailable during inventory; actual cleanup must resolve that first."
          : "Storage object counts are grouped by bucket only.",
        "dry-run only: storage references are not returned and storage delete is not called."
      ]
    },
    {
      name: "db_cleanup",
      order: 3,
      status: dbStatus,
      count: getDatabaseCleanupRequiredCount(databaseCleanup) ?? getDatabaseInventoryCount(inventory),
      guard: "DB cleanup can run only after storage cleanup is succeeded or not_needed.",
      notes: [
        databaseBlocked
          ? "Database cleanup dry-run is blocked; actual cleanup must stop at db_cleanup_failed."
          : "Database cleanup counts are grouped by table and action only.",
        "Database counts are safe row counts only; sensitive source fields and target row references are not returned.",
        "dry-run only: database delete is not called."
      ]
    },
    {
      name: "auth_cleanup",
      order: 4,
      status: authStatus,
      count: authDeletion?.candidateCount ?? 1,
      guard: "Supabase Auth deletion can run only after DB cleanup is succeeded or not_needed.",
      notes: [
        authBlocked
          ? "Supabase Auth deletion preflight is blocked; actual cleanup must stop at auth_cleanup_failed."
          : "Auth deletion is intentionally last so owned data can be re-fetched server-side before removal.",
        "After Auth deletion, request tracking relies on the anonymized reference and cleanup status.",
        "dry-run only: Supabase Auth user deletion is not called."
      ]
    },
    {
      name: "completion",
      order: 5,
      status: completionStatus,
      count: null,
      guard: "Completion can be recorded only after Auth cleanup is succeeded or not_needed.",
      notes: [
        "Completion will eventually keep only anonymized tracking status where policy allows.",
        "dry-run only: request status and metadata are not updated."
      ]
    }
  ];
}

export async function getAccountDeletionStatus(client: SupabaseReadClient, userId: string) {
  const { data, error } = asMaybeSingle<AccountDeletionRequestRow>(
    await client
      .from("account_deletion_requests")
      .select("*")
      .eq("user_id", userId)
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  );

  if (error) {
    throw mapDbError("削除リクエスト状態の取得", error);
  }

  return data ? toView(data) : null;
}

async function getActiveAccountDeletionRequest(userId: string) {
  const admin = getAdminClient();
  const { data, error } = asMaybeSingle<AccountDeletionRequestRow>(
    await admin
      .from("account_deletion_requests")
      .select("*")
      .eq("user_id", userId)
      .in("status", ACTIVE_DELETION_REQUEST_STATUSES)
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  );

  if (error) {
    throw mapDbError("削除リクエスト状態の確認", error);
  }

  return data;
}

async function getIdsFromQuery(value: unknown) {
  const { data, error } = value as { data: Array<{ id: string }> | null; error: PostgrestErrorLike | null };

  if (error) {
    throw mapDbError("削除対象 inventory の ID 取得", error);
  }

  return (data ?? []).map((row) => row.id);
}

async function getExactCount(value: unknown, operation: string) {
  const { count, error } = asCount(value);

  if (error) {
    throw mapDbError(operation, error);
  }

  return count ?? 0;
}

async function countStorageObjects(bucket: string, userId: string) {
  const admin = getAdminClient();

  async function listPrefix(prefix: string, depth: number): Promise<number> {
    if (depth > 5) {
      return 0;
    }

    let offset = 0;
    let total = 0;

    while (true) {
      const { data, error } = await admin.storage.from(bucket).list(prefix, {
        limit: 1000,
        offset
      });

      if (error) {
        const normalized = error.message.toLowerCase();

        if (normalized.includes("not found") || normalized.includes("bucket")) {
          throw new AppError(404, "storage bucket が見つかりません。");
        }

        throw new AppError(500, "storage inventory の取得に失敗しました。");
      }

      const items = (data ?? []) as StorageListItem[];

      for (const item of items) {
        const childPrefix = prefix ? `${prefix}/${item.name}` : item.name;
        const looksLikeFolder = !item.id && !item.metadata;

        if (looksLikeFolder) {
          total += await listPrefix(childPrefix, depth + 1);
        } else {
          total += 1;
        }
      }

      if (items.length < 1000) {
        break;
      }

      offset += 1000;
    }

    return total;
  }

  try {
    return {
      count: await listPrefix(userId, 0),
      status: "available" as const
    };
  } catch (error) {
    if (error instanceof AppError && error.status === 404) {
      return {
        count: 0,
        status: "unavailable" as const
      };
    }

    throw error;
  }
}

async function listStorageObjectKeys(bucket: string, userId: string): Promise<StorageObjectListResult> {
  const admin = getAdminClient();

  async function listPrefix(prefix: string, depth: number): Promise<string[]> {
    if (depth > 5) {
      return [];
    }

    let offset = 0;
    const keys: string[] = [];

    while (true) {
      const { data, error } = await admin.storage.from(bucket).list(prefix, {
        limit: 1000,
        offset
      });

      if (error) {
        const normalized = error.message.toLowerCase();

        if (normalized.includes("not found") || normalized.includes("bucket")) {
          throw new AppError(404, "storage bucket が見つかりません。");
        }

        throw new AppError(500, "storage cleanup dry-run の取得に失敗しました。");
      }

      const items = (data ?? []) as StorageListItem[];

      for (const item of items) {
        const childKey = prefix ? `${prefix}/${item.name}` : item.name;
        const looksLikeFolder = !item.id && !item.metadata;

        if (looksLikeFolder) {
          keys.push(...(await listPrefix(childKey, depth + 1)));
        } else {
          keys.push(childKey);
        }
      }

      if (items.length < 1000) {
        break;
      }

      offset += 1000;
    }

    return keys;
  }

  try {
    return {
      keys: await listPrefix(userId, 0),
      status: "available"
    };
  } catch (error) {
    if (error instanceof AppError && error.status === 404) {
      return {
        keys: [],
        status: "unavailable"
      };
    }

    throw error;
  }
}

function uniqueOwnedKeys(userId: string, values: Array<string | null>) {
  const keys = new Set<string>();

  for (const value of values) {
    const key = value?.trim();

    if (key && key.split("/").filter(Boolean)[0] === userId) {
      keys.add(key);
    }
  }

  return keys;
}

function buildStorageBucketSummary(input: {
  bucket: StorageCleanupBucketSummary["bucket"];
  knownKeys: Set<string>;
  listed: StorageObjectListResult;
}) {
  const listedKeys = new Set(input.listed.keys);
  const missingKnownObjectCount =
    input.listed.status === "available"
      ? [...input.knownKeys].filter((key) => !listedKeys.has(key)).length
      : 0;
  const orphanCandidateCount =
    input.listed.status === "available"
      ? [...listedKeys].filter((key) => !input.knownKeys.has(key)).length
      : 0;
  const status =
    input.listed.status === "unavailable" || missingKnownObjectCount > 0
      ? "blocked"
      : listedKeys.size > 0 || input.knownKeys.size > 0
        ? "required"
        : "not_needed";

  return {
    bucket: input.bucket,
    status,
    knownObjectCount: input.knownKeys.size,
    listedObjectCount: listedKeys.size,
    orphanCandidateCount,
    missingKnownObjectCount,
    listStatus: input.listed.status
  } satisfies StorageCleanupBucketSummary;
}

function getVoiceConsentRecordingKey(value: Json) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const recording = (value as Record<string, unknown>).recording;

  if (!recording || typeof recording !== "object" || Array.isArray(recording)) {
    return null;
  }

  const audioPath = (recording as Record<string, unknown>).audioPath;

  return typeof audioPath === "string" ? parseVoiceConsentRecordingReference({ audioPath }) : null;
}

export async function createAccountDeletionRequest(userId: string): Promise<AccountDeletionRequestResult> {
  const existing = await getActiveAccountDeletionRequest(userId);

  if (existing) {
    return {
      deletionRequest: toView(existing),
      created: false
    };
  }

  const admin = getAdminClient();
  const insert: AccountDeletionRequestInsert = {
    user_id: userId,
    anonymized_user_ref: buildAnonymizedUserRef(),
    request_source: "in_app",
    status: "requested",
    metadata: buildRequestMetadata()
  };
  const { data, error } = asMaybeSingle<AccountDeletionRequestRow>(
    await admin
      .from("account_deletion_requests")
      .insert(insert)
      .select("*")
      .single()
  );

  if (error) {
    if (error.code === "23505") {
      const racedExisting = await getActiveAccountDeletionRequest(userId);

      if (racedExisting) {
        return {
          deletionRequest: toView(racedExisting),
          created: false
        };
      }
    }

    throw mapDbError("削除リクエストの作成", error);
  }

  if (!data) {
    throw new AppError(500, "削除リクエストを作成できませんでした。");
  }

  return {
    deletionRequest: toView(data),
    created: true
  };
}

export async function confirmAccountDeletionRequest(userId: string): Promise<AccountDeletionRequestResult> {
  const existing = await getActiveAccountDeletionRequest(userId);

  if (!existing) {
    throw new AppError(404, "確認できる削除リクエストがありません。");
  }

  if (existing.status !== "requested") {
    return {
      deletionRequest: toView(existing),
      confirmed: false
    };
  }

  const admin = getAdminClient();
  const update: AccountDeletionRequestUpdate = {
    status: "confirmed",
    confirmed_at: new Date().toISOString(),
    metadata: mergeConfirmationMetadata(existing.metadata)
  };
  const { data, error } = asMaybeSingle<AccountDeletionRequestRow>(
    await admin
      .from("account_deletion_requests")
      .update(update)
      .eq("id", existing.id)
      .eq("user_id", userId)
      .eq("status", "requested")
      .select("*")
      .single()
  );

  if (error) {
    throw mapDbError("削除リクエストの確認", error);
  }

  if (!data) {
    throw new AppError(500, "削除リクエストを確認できませんでした。");
  }

  return {
    deletionRequest: toView(data),
    confirmed: true
  };
}

export async function collectAccountDeletionInventory(userId: string): Promise<AccountDeletionInventorySummary> {
  const request = await getActiveAccountDeletionRequest(userId);

  if (!request) {
    throw new AppError(404, "削除リクエスト作成後に inventory を確認できます。");
  }

  const admin = getAdminClient();
  const scriptIds = await getIdsFromQuery(
    await admin
      .from("scripts")
      .select("id")
      .eq("user_id", userId)
  );
  const takeIds = await getIdsFromQuery(
    await admin
      .from("takes")
      .select("id")
      .eq("user_id", userId)
  );

  const [
    profiles,
    scripts,
    takes,
    savedBestTakes,
    savedModelAudios,
    voiceConsents,
    voices,
    quotaEvents,
    weakWords,
    coachFeedback,
    scriptAudios,
    recordingsObjects,
    scriptAudioObjects,
    voiceSampleObjects,
    voiceConsentObjects,
    elevenLabsVoiceCandidates
  ] = await Promise.all([
    getExactCount(
      admin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("id", userId),
      "profile inventory の取得"
    ),
    getExactCount(
      admin
        .from("scripts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      "script inventory の取得"
    ),
    getExactCount(
      admin
        .from("takes")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      "take inventory の取得"
    ),
    getExactCount(
      admin
        .from("script_saved_best_takes")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      "saved best take inventory の取得"
    ),
    getExactCount(
      admin
        .from("script_saved_model_audios")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      "saved model audio inventory の取得"
    ),
    getExactCount(
      admin
        .from("voice_consents")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      "voice consent inventory の取得"
    ),
    getExactCount(
      admin
        .from("voices")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      "voice inventory の取得"
    ),
    getExactCount(
      admin
        .from("quota_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      "quota event inventory の取得"
    ),
    takeIds.length
      ? getExactCount(
          admin
            .from("weak_words")
            .select("id", { count: "exact", head: true })
            .in("take_id", takeIds),
          "weak word inventory の取得"
        )
      : Promise.resolve(0),
    takeIds.length
      ? getExactCount(
          admin
            .from("coach_feedback")
            .select("id", { count: "exact", head: true })
            .in("take_id", takeIds),
          "coach feedback inventory の取得"
        )
      : Promise.resolve(0),
    scriptIds.length
      ? getExactCount(
          admin
            .from("script_audios")
            .select("id", { count: "exact", head: true })
            .in("script_id", scriptIds),
          "script audio inventory の取得"
        )
      : Promise.resolve(0),
    countStorageObjects(RECORDINGS_BUCKET, userId),
    countStorageObjects(SCRIPT_AUDIO_STORAGE_BUCKET, userId),
    countStorageObjects(VOICE_SAMPLES_BUCKET, userId),
    countStorageObjects(VOICE_CONSENTS_BUCKET, userId),
    getExactCount(
      admin
        .from("voices")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("provider", "elevenlabs"),
      "ElevenLabs voice candidate inventory の取得"
    )
  ]);

  return {
    deletionRequest: toView(request),
    database: {
      profiles,
      scripts,
      takes,
      weakWords,
      coachFeedback,
      savedBestTakes,
      savedModelAudios,
      scriptAudios,
      voiceConsents,
      voices,
      quotaEvents
    },
    storage: {
      recordings: recordingsObjects,
      scriptAudios: scriptAudioObjects,
      voiceSamples: voiceSampleObjects,
      voiceConsents: voiceConsentObjects
    },
    provider: {
      elevenLabsVoiceCandidates
    },
    notes: [
      "dry-run only: no storage object, database row, provider voice, quota event, consent recording, or auth user is deleted.",
      "sensitive raw values and cleanup target references are not returned."
    ]
  };
}

export async function planElevenLabsCleanupDryRun(userId: string): Promise<ElevenLabsProviderCleanupDryRun> {
  const request = await getActiveAccountDeletionRequest(userId);

  if (!request) {
    throw new AppError(404, "削除リクエスト作成後に provider cleanup dry-run を確認できます。");
  }

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("voices")
    .select("provider, provider_voice_id")
    .eq("user_id", userId);

  if (error) {
    throw mapDbError("ElevenLabs provider cleanup dry-run の取得", error);
  }

  const rows = (data ?? []) as Array<Pick<Database["public"]["Tables"]["voices"]["Row"], "provider" | "provider_voice_id">>;
  const totalVoices = rows.length;
  const elevenLabsRows = rows.filter((row) => row.provider === "elevenlabs");
  const nonElevenLabsVoices = totalVoices - elevenLabsRows.length;
  let providerReferencePresent = 0;
  let providerReferenceMissing = 0;
  let providerReferenceInvalid = 0;
  let cleanupRequired = 0;

  for (const row of elevenLabsRows) {
    const providerVoiceId = row.provider_voice_id?.trim() ?? "";

    if (!providerVoiceId) {
      providerReferenceMissing += 1;
      continue;
    }

    providerReferencePresent += 1;

    if (!isSafeProviderVoiceIdReference(providerVoiceId)) {
      providerReferenceInvalid += 1;
      continue;
    }

    cleanupRequired += 1;
  }

  const blocked = providerReferenceMissing + providerReferenceInvalid;
  const status =
    elevenLabsRows.length === 0
      ? "not_needed"
      : blocked > 0
        ? "blocked"
        : "required";

  return {
    deletionRequest: toView(request),
    status,
    candidates: {
      totalVoices,
      elevenLabsVoices: elevenLabsRows.length,
      nonElevenLabsVoices,
      providerReferencePresent,
      providerReferenceMissing,
      providerReferenceInvalid
    },
    cleanup: {
      required: cleanupRequired,
      notNeeded: nonElevenLabsVoices,
      blocked
    },
    notes: [
      "dry-run only: ElevenLabs provider delete is not called.",
      "provider references are used only server-side for counting and are not returned.",
      "missing or invalid provider references block provider cleanup until support/manual retry resolves them."
    ]
  };
}

async function collectOwnedElevenLabsCleanupCandidates(userId: string): Promise<{
  candidates: ElevenLabsCleanupCandidate[];
  blocked: number;
}> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("voices")
    .select("provider, provider_voice_id")
    .eq("user_id", userId)
    .eq("provider", "elevenlabs");

  if (error) {
    throw mapDbError("ElevenLabs provider cleanup candidates の取得", error);
  }

  const rows = (data ?? []) as Array<Pick<Database["public"]["Tables"]["voices"]["Row"], "provider" | "provider_voice_id">>;
  const candidates: ElevenLabsCleanupCandidate[] = [];
  let blocked = 0;

  for (const row of rows) {
    const providerVoiceId = row.provider_voice_id?.trim() ?? "";

    if (!providerVoiceId || !isSafeProviderVoiceIdReference(providerVoiceId)) {
      blocked += 1;
      continue;
    }

    candidates.push({ providerVoiceId });
  }

  return { candidates, blocked };
}

async function updateProviderCleanupRequest(input: {
  deletionRequest: AccountDeletionRequestView;
  userId: string;
  update: AccountDeletionRequestUpdate;
}) {
  const admin = getAdminClient();
  const { data, error } = asMaybeSingle<AccountDeletionRequestRow>(
    await admin
      .from("account_deletion_requests")
      .update(input.update)
      .eq("id", input.deletionRequest.id)
      .eq("user_id", input.userId)
      .select("*")
      .single()
  );

  if (error) {
    throw mapDbError("provider cleanup status の更新", error);
  }

  if (!data) {
    throw new AppError(500, "provider cleanup status を更新できませんでした。");
  }

  return toView(data);
}

function getProviderCleanupFailureCleanupStatus(failureReasonCode: string): AccountDeletionCleanupStatus {
  return failureReasonCode === "elevenlabs_voice_delete_not_found" ||
    failureReasonCode === "elevenlabs_voice_delete_invalid_provider_reference" ||
    failureReasonCode === "provider_cleanup_blocked"
    ? "manual_required"
    : "failed";
}

export async function runElevenLabsProviderCleanupActual(input: {
  userId: string;
  deletionRequestId: string;
  env?: NodeJS.ProcessEnv;
  deleteVoice?: ElevenLabsVoiceDeleteFn;
}): Promise<ElevenLabsProviderCleanupActualResult> {
  const request = await getActiveAccountDeletionRequest(input.userId);

  if (!request) {
    throw new AppError(404, "実行できる削除リクエストがありません。");
  }

  const deletionRequest = toView(request);
  const dryRun = await planElevenLabsCleanupDryRun(input.userId);
  const guard = buildProviderCleanupGuard({
    deletionRequest,
    deletionRequestId: input.deletionRequestId,
    dryRun,
    env: input.env
  });

  if (isCleanupSatisfied(deletionRequest.cleanup.provider)) {
    return createProviderCleanupActualResult({
      deletionRequest,
      status: "already_satisfied",
      guard,
      cleanup: {
        notNeeded: dryRun.cleanup.notNeeded
      },
      notes: [
        "provider cleanup はすでに succeeded または not_needed です。",
        "actual cleanup does not proceed to Storage, DB, or Auth cleanup."
      ]
    });
  }

  if (!guard.requestIdMatched) {
    return createProviderCleanupActualResult({
      deletionRequest,
      status: "blocked",
      guard,
      failureReasonCode: "deletion_request_id_mismatch",
      notes: [
        "deletion request id が一致しないため provider cleanup actual は実行されません。",
        "no provider delete is called and no request status is updated."
      ]
    });
  }

  if (!guard.statusRunnable || !guard.providerStageRunnable) {
    return createProviderCleanupActualResult({
      deletionRequest,
      status: "blocked",
      guard,
      failureReasonCode: "provider_cleanup_not_runnable",
      notes: [
        "confirmed または provider_cleanup_failed の request だけ provider cleanup actual を実行できます。",
        "no provider delete is called and no request status is updated."
      ]
    });
  }

  if (!guard.dryRunRunnable) {
    if (guard.destructiveGuard) {
      const updated = await updateProviderCleanupRequest({
        deletionRequest,
        userId: input.userId,
        update: {
          status: "provider_cleanup_failed",
          failure_stage: "provider_cleanup",
          failure_reason_code: "provider_cleanup_blocked",
          provider_cleanup_status: "manual_required",
          retry_count: deletionRequest.retryCount + 1,
          last_attempted_at: new Date().toISOString()
        }
      });

      return createProviderCleanupActualResult({
        deletionRequest: updated,
        status: "manual_required",
        guard,
        cleanup: {
          blocked: dryRun.cleanup.blocked
        },
        failureReasonCode: "provider_cleanup_blocked",
        notes: [
          "provider cleanup dry-run が blocked のため actual delete は実行されません。",
          "missing or invalid provider references must be resolved by support/manual retry."
        ]
      });
    }

    return createProviderCleanupActualResult({
      deletionRequest,
      status: "blocked",
      guard,
      cleanup: {
        blocked: dryRun.cleanup.blocked
      },
      failureReasonCode: "provider_cleanup_blocked",
      notes: [
        "provider cleanup dry-run が blocked です。",
        "destructive guard が off のため status update も provider delete も実行しません。"
      ]
    });
  }

  if (!guard.destructiveGuard) {
    return createProviderCleanupActualResult({
      deletionRequest,
      status: "blocked",
      guard,
      cleanup: {
        attempted: 0,
        notNeeded: dryRun.status === "not_needed" ? dryRun.cleanup.notNeeded : 0
      },
      failureReasonCode: ACCOUNT_DELETION_DESTRUCTIVE_GUARD_ENV,
      notes: [
        `${ACCOUNT_DELETION_DESTRUCTIVE_GUARD_ENV}=1 が設定されていないため provider cleanup actual は実行されません。`,
        "no provider delete is called and no request status is updated."
      ]
    });
  }

  if (!guard.costGuardAllowed) {
    return createProviderCleanupActualResult({
      deletionRequest,
      status: "blocked",
      guard,
      failureReasonCode: "elevenlabs_cost_guard_disabled",
      notes: [
        "NATIVE_MINUTE_DISABLE_ELEVENLABS が有効なため provider cleanup actual は実行されません。",
        "no provider delete is called and no request status is updated."
      ]
    });
  }

  if (dryRun.status === "not_needed") {
    const updated = await updateProviderCleanupRequest({
      deletionRequest,
      userId: input.userId,
      update: {
        status: "confirmed",
        failure_stage: null,
        failure_reason_code: null,
        provider_cleanup_status: "not_needed",
        last_attempted_at: new Date().toISOString()
      }
    });

    return createProviderCleanupActualResult({
      deletionRequest: updated,
      status: "not_needed",
      guard,
      cleanup: {
        notNeeded: dryRun.cleanup.notNeeded
      },
      notes: [
        "owned ElevenLabs provider voice candidates がないため provider cleanup は not_needed です。",
        "actual cleanup does not proceed to Storage, DB, or Auth cleanup."
      ]
    });
  }

  const { candidates, blocked } = await collectOwnedElevenLabsCleanupCandidates(input.userId);

  if (blocked > 0 || candidates.length !== dryRun.cleanup.required) {
    const updated = await updateProviderCleanupRequest({
      deletionRequest,
      userId: input.userId,
      update: {
        status: "provider_cleanup_failed",
        failure_stage: "provider_cleanup",
        failure_reason_code: "provider_cleanup_candidate_mismatch",
        provider_cleanup_status: "manual_required",
        retry_count: deletionRequest.retryCount + 1,
        last_attempted_at: new Date().toISOString()
      }
    });

    return createProviderCleanupActualResult({
      deletionRequest: updated,
      status: "manual_required",
      guard,
      cleanup: {
        blocked: Math.max(blocked, dryRun.cleanup.blocked)
      },
      failureReasonCode: "provider_cleanup_candidate_mismatch",
      notes: [
        "latest provider dry-run と actual candidate collection が一致しません。",
        "no provider delete is called; support/manual retry must reconcile owned voice rows first."
      ]
    });
  }

  const deleteVoice = input.deleteVoice ?? ((providerVoiceId) => deleteElevenLabsVoiceForAccountDeletion({
    providerVoiceId,
    env: input.env
  }));
  let succeeded = 0;
  let failed = 0;
  let failureReasonCode: string | null = null;

  for (const candidate of candidates) {
    const result = await deleteVoice(candidate.providerVoiceId);

    if (result.ok) {
      succeeded += 1;
      continue;
    }

    failed += 1;
    failureReasonCode = result.safeReasonCode;
    break;
  }

  if (failed > 0) {
    const safeFailureReasonCode = failureReasonCode ?? "elevenlabs_voice_delete_failed";
    const cleanupStatus = getProviderCleanupFailureCleanupStatus(safeFailureReasonCode);
    const updated = await updateProviderCleanupRequest({
      deletionRequest,
      userId: input.userId,
      update: {
        status: "provider_cleanup_failed",
        failure_stage: "provider_cleanup",
        failure_reason_code: safeFailureReasonCode,
        provider_cleanup_status: cleanupStatus,
        retry_count: deletionRequest.retryCount + 1,
        last_attempted_at: new Date().toISOString()
      }
    });

    return createProviderCleanupActualResult({
      deletionRequest: updated,
      status: cleanupStatus === "manual_required" ? "manual_required" : "failed",
      guard,
      cleanup: {
        attempted: succeeded + failed,
        succeeded,
        failed
      },
      failureReasonCode: safeFailureReasonCode,
      notes: [
        "ElevenLabs provider cleanup failed; later Storage, DB, and Auth cleanup must not run.",
        "provider voice ids and raw provider responses are not returned or stored in request metadata."
      ]
    });
  }

  const updated = await updateProviderCleanupRequest({
    deletionRequest,
    userId: input.userId,
    update: {
      status: "confirmed",
      failure_stage: null,
      failure_reason_code: null,
      provider_cleanup_status: "succeeded",
      last_attempted_at: new Date().toISOString()
    }
  });

  return createProviderCleanupActualResult({
    deletionRequest: updated,
    status: "succeeded",
    guard,
    cleanup: {
      attempted: candidates.length,
      succeeded: candidates.length
    },
    notes: [
      "ElevenLabs provider cleanup stage succeeded.",
      "actual cleanup stops after provider stage; Storage, DB, and Auth cleanup are not executed here."
    ]
  });
}

async function collectOwnedStorageCleanupTargets(userId: string): Promise<StorageCleanupBucketTarget[]> {
  const listedResults = await Promise.all(
    STORAGE_CLEANUP_BUCKET_TARGETS.map(async (target) => ({
      ...target,
      listed: await listStorageObjectKeys(target.storageBucket, userId)
    }))
  );

  return listedResults.map((target) => ({
    bucket: target.bucket,
    storageBucket: target.storageBucket,
    objectKeys: target.listed.status === "available" ? target.listed.keys : []
  }));
}

async function deleteSupabaseStorageObjectsForAccountDeletion(input: {
  bucket: string;
  objectKeys: string[];
}): Promise<StorageObjectDeletionResult> {
  if (input.objectKeys.length === 0) {
    return {
      ok: true,
      deletedCount: 0
    };
  }

  const admin = getAdminClient();
  const { error } = await admin.storage.from(input.bucket).remove(input.objectKeys);

  if (!error) {
    return {
      ok: true,
      deletedCount: input.objectKeys.length
    };
  }

  const safeReasonCode = classifyStorageDeleteFailure(error.message);

  console.error("Account deletion storage cleanup failed", {
    operation: "storage-delete",
    bucket: input.bucket,
    reasonCode: safeReasonCode
  });

  return {
    ok: false,
    safeReasonCode,
    failedCount: input.objectKeys.length
  };
}

function classifyStorageDeleteFailure(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("not found") || normalized.includes("bucket")) {
    return "storage_delete_bucket_unavailable";
  }

  if (normalized.includes("permission") || normalized.includes("policy") || normalized.includes("unauthorized")) {
    return "storage_delete_permission_denied";
  }

  if (normalized.includes("rate") || normalized.includes("timeout") || normalized.includes("temporarily")) {
    return "storage_delete_provider_unavailable";
  }

  return "storage_delete_failed";
}

async function updateStorageCleanupRequest(input: {
  deletionRequest: AccountDeletionRequestView;
  userId: string;
  update: AccountDeletionRequestUpdate;
}) {
  const admin = getAdminClient();
  const { data, error } = asMaybeSingle<AccountDeletionRequestRow>(
    await admin
      .from("account_deletion_requests")
      .update(input.update)
      .eq("id", input.deletionRequest.id)
      .eq("user_id", input.userId)
      .select("*")
      .single()
  );

  if (error) {
    throw mapDbError("storage cleanup status の更新", error);
  }

  if (!data) {
    throw new AppError(500, "storage cleanup status を更新できませんでした。");
  }

  return toView(data);
}

function getStorageCleanupFailureCleanupStatus(failureReasonCode: string): AccountDeletionCleanupStatus {
  return failureReasonCode === "storage_cleanup_blocked" ||
    failureReasonCode === "storage_cleanup_candidate_mismatch" ||
    failureReasonCode === "storage_delete_bucket_unavailable" ||
    failureReasonCode === "storage_delete_permission_denied"
    ? "manual_required"
    : "failed";
}

export async function runStorageCleanupActual(input: {
  userId: string;
  deletionRequestId: string;
  env?: NodeJS.ProcessEnv;
  deleteObjects?: StorageObjectDeleteFn;
}): Promise<StorageCleanupActualResult> {
  const request = await getActiveAccountDeletionRequest(input.userId);

  if (!request) {
    throw new AppError(404, "実行できる削除リクエストがありません。");
  }

  const deletionRequest = toView(request);
  const dryRun = await planStorageCleanupDryRun(input.userId);
  const guard = buildStorageCleanupGuard({
    deletionRequest,
    deletionRequestId: input.deletionRequestId,
    dryRun,
    env: input.env
  });

  if (isCleanupSatisfied(deletionRequest.cleanup.storage)) {
    return createStorageCleanupActualResult({
      deletionRequest,
      status: "already_satisfied",
      guard,
      cleanup: {
        notNeeded: dryRun.status === "not_needed" ? dryRun.buckets.length : 0
      },
      notes: [
        "storage cleanup はすでに succeeded または not_needed です。",
        "actual cleanup does not proceed to DB or Auth cleanup."
      ]
    });
  }

  if (!guard.requestIdMatched) {
    return createStorageCleanupActualResult({
      deletionRequest,
      status: "blocked",
      guard,
      failureReasonCode: "deletion_request_id_mismatch",
      notes: [
        "deletion request id が一致しないため storage cleanup actual は実行されません。",
        "no storage delete is called and no request status is updated."
      ]
    });
  }

  if (!guard.statusRunnable || !guard.storageStageRunnable) {
    return createStorageCleanupActualResult({
      deletionRequest,
      status: "blocked",
      guard,
      failureReasonCode: "storage_cleanup_not_runnable",
      notes: [
        "confirmed または storage_cleanup_failed の request だけ storage cleanup actual を実行できます。",
        "no storage delete is called and no request status is updated."
      ]
    });
  }

  if (!guard.providerCleanupSatisfied) {
    return createStorageCleanupActualResult({
      deletionRequest,
      status: "blocked",
      guard,
      failureReasonCode: "provider_cleanup_not_satisfied",
      notes: [
        "provider cleanup が succeeded または not_needed になるまで storage cleanup actual は実行されません。",
        "no storage delete is called and no request status is updated."
      ]
    });
  }

  if (!guard.dryRunRunnable) {
    if (guard.destructiveGuard) {
      const updated = await updateStorageCleanupRequest({
        deletionRequest,
        userId: input.userId,
        update: {
          status: "storage_cleanup_failed",
          failure_stage: "storage_cleanup",
          failure_reason_code: "storage_cleanup_blocked",
          storage_cleanup_status: "manual_required",
          retry_count: deletionRequest.retryCount + 1,
          last_attempted_at: new Date().toISOString()
        }
      });

      return createStorageCleanupActualResult({
        deletionRequest: updated,
        status: "manual_required",
        guard,
        cleanup: {
          blocked: dryRun.buckets.filter((bucket) => bucket.status === "blocked").length
        },
        failureReasonCode: "storage_cleanup_blocked",
        notes: [
          "storage cleanup dry-run が blocked のため actual delete は実行されません。",
          "bucket availability, missing known objects, or ownership ambiguity must be resolved by support/manual retry."
        ]
      });
    }

    return createStorageCleanupActualResult({
      deletionRequest,
      status: "blocked",
      guard,
      cleanup: {
        blocked: dryRun.buckets.filter((bucket) => bucket.status === "blocked").length
      },
      failureReasonCode: "storage_cleanup_blocked",
      notes: [
        "storage cleanup dry-run が blocked です。",
        "destructive guard が off のため status update も storage delete も実行しません。"
      ]
    });
  }

  if (!guard.destructiveGuard) {
    return createStorageCleanupActualResult({
      deletionRequest,
      status: "blocked",
      guard,
      cleanup: {
        attempted: 0,
        notNeeded: dryRun.status === "not_needed" ? dryRun.buckets.length : 0
      },
      failureReasonCode: ACCOUNT_DELETION_DESTRUCTIVE_GUARD_ENV,
      notes: [
        `${ACCOUNT_DELETION_DESTRUCTIVE_GUARD_ENV}=1 が設定されていないため storage cleanup actual は実行されません。`,
        "no storage delete is called and no request status is updated."
      ]
    });
  }

  if (dryRun.status === "not_needed") {
    const updated = await updateStorageCleanupRequest({
      deletionRequest,
      userId: input.userId,
      update: {
        status: "confirmed",
        failure_stage: null,
        failure_reason_code: null,
        storage_cleanup_status: "not_needed",
        last_attempted_at: new Date().toISOString()
      }
    });

    return createStorageCleanupActualResult({
      deletionRequest: updated,
      status: "not_needed",
      guard,
      cleanup: {
        notNeeded: dryRun.buckets.length,
        buckets: dryRun.buckets.map((bucket) => ({
          bucket: bucket.bucket,
          status: "not_needed",
          attempted: 0,
          succeeded: 0,
          failed: 0
        }))
      },
      notes: [
        "owned storage object candidates がないため storage cleanup は not_needed です。",
        "actual cleanup does not proceed to DB or Auth cleanup."
      ]
    });
  }

  const targets = await collectOwnedStorageCleanupTargets(input.userId);
  const latestCandidateCount = targets.reduce((total, target) => total + target.objectKeys.length, 0);

  if (latestCandidateCount !== dryRun.totals.listedObjectCount) {
    const updated = await updateStorageCleanupRequest({
      deletionRequest,
      userId: input.userId,
      update: {
        status: "storage_cleanup_failed",
        failure_stage: "storage_cleanup",
        failure_reason_code: "storage_cleanup_candidate_mismatch",
        storage_cleanup_status: "manual_required",
        retry_count: deletionRequest.retryCount + 1,
        last_attempted_at: new Date().toISOString()
      }
    });

    return createStorageCleanupActualResult({
      deletionRequest: updated,
      status: "manual_required",
      guard,
      cleanup: {
        blocked: 1
      },
      failureReasonCode: "storage_cleanup_candidate_mismatch",
      notes: [
        "latest storage dry-run と actual candidate collection が一致しません。",
        "no storage delete is called; support/manual retry must reconcile owned storage inventory first."
      ]
    });
  }

  const deleteObjects = input.deleteObjects ?? deleteSupabaseStorageObjectsForAccountDeletion;
  const bucketResults: StorageCleanupBucketActualSummary[] = [];
  let attempted = 0;
  let succeeded = 0;
  let failed = 0;
  let failureReasonCode: string | null = null;

  for (const target of targets) {
    if (target.objectKeys.length === 0) {
      bucketResults.push({
        bucket: target.bucket,
        status: "not_needed",
        attempted: 0,
        succeeded: 0,
        failed: 0
      });
      continue;
    }

    const result = await deleteObjects({
      bucket: target.storageBucket,
      objectKeys: target.objectKeys
    });

    attempted += target.objectKeys.length;

    if (result.ok) {
      succeeded += result.deletedCount;
      bucketResults.push({
        bucket: target.bucket,
        status: "succeeded",
        attempted: target.objectKeys.length,
        succeeded: result.deletedCount,
        failed: 0
      });
      continue;
    }

    failed += result.failedCount;
    failureReasonCode = result.safeReasonCode;
    bucketResults.push({
      bucket: target.bucket,
      status: "failed",
      attempted: target.objectKeys.length,
      succeeded: 0,
      failed: result.failedCount
    });
    break;
  }

  if (failed > 0) {
    const safeFailureReasonCode = failureReasonCode ?? "storage_delete_failed";
    const cleanupStatus = getStorageCleanupFailureCleanupStatus(safeFailureReasonCode);
    const updated = await updateStorageCleanupRequest({
      deletionRequest,
      userId: input.userId,
      update: {
        status: "storage_cleanup_failed",
        failure_stage: "storage_cleanup",
        failure_reason_code: safeFailureReasonCode,
        storage_cleanup_status: cleanupStatus,
        retry_count: deletionRequest.retryCount + 1,
        last_attempted_at: new Date().toISOString()
      }
    });

    return createStorageCleanupActualResult({
      deletionRequest: updated,
      status: cleanupStatus === "manual_required" ? "manual_required" : "failed",
      guard,
      cleanup: {
        attempted,
        succeeded,
        failed,
        buckets: bucketResults
      },
      failureReasonCode: safeFailureReasonCode,
      notes: [
        "Storage cleanup failed; later DB and Auth cleanup must not run.",
        "storage object keys, signed URLs, and raw storage errors are not returned or stored in request metadata."
      ]
    });
  }

  const updated = await updateStorageCleanupRequest({
    deletionRequest,
    userId: input.userId,
    update: {
      status: "confirmed",
      failure_stage: null,
      failure_reason_code: null,
      storage_cleanup_status: "succeeded",
      last_attempted_at: new Date().toISOString()
    }
  });

  return createStorageCleanupActualResult({
    deletionRequest: updated,
    status: "succeeded",
    guard,
    cleanup: {
      attempted,
      succeeded,
      buckets: bucketResults
    },
    notes: [
      "Storage cleanup stage succeeded.",
      guard.storageUploadKillSwitchActive
        ? "NATIVE_MINUTE_DISABLE_STORAGE_UPLOADS is active, but upload kill switch does not block support/admin deletion cleanup once destructive guard is explicitly enabled."
        : "Storage upload kill switch is not active; deletion cleanup still requires the destructive account deletion guard.",
      "actual cleanup stops after Storage stage; DB and Auth cleanup are not executed here."
    ]
  });
}

export async function planStorageCleanupDryRun(userId: string): Promise<StorageCleanupDryRun> {
  const request = await getActiveAccountDeletionRequest(userId);

  if (!request) {
    throw new AppError(404, "削除リクエスト作成後に storage cleanup dry-run を確認できます。");
  }

  const admin = getAdminClient();
  const scriptIds = await getIdsFromQuery(
    await admin
      .from("scripts")
      .select("id")
      .eq("user_id", userId)
  );
  const [
    takesResult,
    scriptAudiosResult,
    voicesResult,
    voiceConsentsResult,
    recordingsListed,
    scriptAudiosListed,
    voiceSamplesListed,
    voiceConsentsListed
  ] = await Promise.all([
    admin
      .from("takes")
      .select("audio_path")
      .eq("user_id", userId),
    scriptIds.length
      ? admin
          .from("script_audios")
          .select("stored_asset")
          .in("script_id", scriptIds)
      : Promise.resolve({ data: [], error: null }),
    admin
      .from("voices")
      .select("sample_audio_path")
      .eq("user_id", userId),
    admin
      .from("voice_consents")
      .select("metadata")
      .eq("user_id", userId),
    listStorageObjectKeys(RECORDINGS_BUCKET, userId),
    listStorageObjectKeys(SCRIPT_AUDIO_STORAGE_BUCKET, userId),
    listStorageObjectKeys(VOICE_SAMPLES_BUCKET, userId),
    listStorageObjectKeys(VOICE_CONSENTS_BUCKET, userId)
  ]);

  const takes = takesResult as { data: Array<{ audio_path: string }> | null; error: PostgrestErrorLike | null };
  const scriptAudios = scriptAudiosResult as { data: Array<{ stored_asset: Json }> | null; error: PostgrestErrorLike | null };
  const voices = voicesResult as { data: Array<{ sample_audio_path: string | null }> | null; error: PostgrestErrorLike | null };
  const voiceConsents = voiceConsentsResult as { data: Array<{ metadata: Json }> | null; error: PostgrestErrorLike | null };

  if (takes.error) {
    throw mapDbError("recordings storage cleanup dry-run の取得", takes.error);
  }

  if (scriptAudios.error) {
    throw mapDbError("script audio storage cleanup dry-run の取得", scriptAudios.error);
  }

  if (voices.error) {
    throw mapDbError("voice sample storage cleanup dry-run の取得", voices.error);
  }

  if (voiceConsents.error) {
    throw mapDbError("voice consent storage cleanup dry-run の取得", voiceConsents.error);
  }

  const recordingsKnown = uniqueOwnedKeys(
    userId,
    (takes.data ?? []).map((row) => parseRecordingAudioReference({ audioPath: row.audio_path }))
  );
  const scriptAudiosKnown = uniqueOwnedKeys(
    userId,
    (scriptAudios.data ?? []).map((row) => {
      const storedAsset = decodeStoredAssetMetadata(row.stored_asset);

      return storedAsset?.storageBucket === SCRIPT_AUDIO_STORAGE_BUCKET ? storedAsset.storageObjectKey : null;
    })
  );
  const voiceSamplesKnown = uniqueOwnedKeys(
    userId,
    (voices.data ?? []).map((row) => parseVoiceSampleAudioReference({ audioPath: row.sample_audio_path ?? undefined }))
  );
  const voiceConsentsKnown = uniqueOwnedKeys(
    userId,
    (voiceConsents.data ?? []).map((row) => getVoiceConsentRecordingKey(row.metadata))
  );

  const buckets = [
    buildStorageBucketSummary({
      bucket: "recordings",
      knownKeys: recordingsKnown,
      listed: recordingsListed
    }),
    buildStorageBucketSummary({
      bucket: "scriptAudios",
      knownKeys: scriptAudiosKnown,
      listed: scriptAudiosListed
    }),
    buildStorageBucketSummary({
      bucket: "voiceSamples",
      knownKeys: voiceSamplesKnown,
      listed: voiceSamplesListed
    }),
    buildStorageBucketSummary({
      bucket: "voiceConsents",
      knownKeys: voiceConsentsKnown,
      listed: voiceConsentsListed
    })
  ];
  const totals = buckets.reduce(
    (accumulator, bucket) => ({
      knownObjectCount: accumulator.knownObjectCount + bucket.knownObjectCount,
      listedObjectCount: accumulator.listedObjectCount + bucket.listedObjectCount,
      orphanCandidateCount: accumulator.orphanCandidateCount + bucket.orphanCandidateCount,
      missingKnownObjectCount: accumulator.missingKnownObjectCount + bucket.missingKnownObjectCount
    }),
    {
      knownObjectCount: 0,
      listedObjectCount: 0,
      orphanCandidateCount: 0,
      missingKnownObjectCount: 0
    }
  );
  const status =
    buckets.some((bucket) => bucket.status === "blocked")
      ? "blocked"
      : totals.listedObjectCount > 0 || totals.knownObjectCount > 0
        ? "required"
        : "not_needed";

  return {
    deletionRequest: toView(request),
    status,
    buckets,
    totals,
    notes: [
      "dry-run only: storage delete is not called.",
      "storage references are used only server-side for counting and are not returned.",
      "bucket unavailable or missing known objects must stop actual cleanup at storage_cleanup_failed."
    ]
  };
}

export async function planDatabaseCleanupDryRun(userId: string): Promise<DatabaseCleanupDryRun> {
  const request = await getActiveAccountDeletionRequest(userId);

  if (!request) {
    throw new AppError(404, "削除リクエスト作成後に DB cleanup dry-run を確認できます。");
  }

  const admin = getAdminClient();
  const scriptIds = await getIdsFromQuery(
    await admin
      .from("scripts")
      .select("id")
      .eq("user_id", userId)
  );
  const takeIds = await getIdsFromQuery(
    await admin
      .from("takes")
      .select("id")
      .eq("user_id", userId)
  );
  const [
    profiles,
    scripts,
    takes,
    savedBestTakes,
    savedModelAudios,
    voiceConsents,
    voices,
    quotaEvents,
    accountDeletionRequests,
    weakWords,
    coachFeedback,
    scriptAudios
  ] = await Promise.all([
    getExactCount(
      admin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("id", userId),
      "profile DB cleanup dry-run の取得"
    ),
    getExactCount(
      admin
        .from("scripts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      "script DB cleanup dry-run の取得"
    ),
    getExactCount(
      admin
        .from("takes")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      "take DB cleanup dry-run の取得"
    ),
    getExactCount(
      admin
        .from("script_saved_best_takes")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      "saved best take DB cleanup dry-run の取得"
    ),
    getExactCount(
      admin
        .from("script_saved_model_audios")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      "saved model audio DB cleanup dry-run の取得"
    ),
    getExactCount(
      admin
        .from("voice_consents")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      "voice consent DB cleanup dry-run の取得"
    ),
    getExactCount(
      admin
        .from("voices")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      "voice DB cleanup dry-run の取得"
    ),
    getExactCount(
      admin
        .from("quota_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      "quota event DB cleanup dry-run の取得"
    ),
    getExactCount(
      admin
        .from("account_deletion_requests")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      "account deletion request DB cleanup dry-run の取得"
    ),
    takeIds.length
      ? getExactCount(
          admin
            .from("weak_words")
            .select("id", { count: "exact", head: true })
            .in("take_id", takeIds),
          "weak word DB cleanup dry-run の取得"
        )
      : Promise.resolve(0),
    takeIds.length
      ? getExactCount(
          admin
            .from("coach_feedback")
            .select("id", { count: "exact", head: true })
            .in("take_id", takeIds),
          "coach feedback DB cleanup dry-run の取得"
        )
      : Promise.resolve(0),
    scriptIds.length
      ? getExactCount(
          admin
            .from("script_audios")
            .select("id", { count: "exact", head: true })
            .in("script_id", scriptIds),
          "script audio DB cleanup dry-run の取得"
        )
      : Promise.resolve(0)
  ]);
  const retainedAccountDeletionRequests = Math.max(accountDeletionRequests, 1);
  const tables: DatabaseCleanupTableSummary[] = [
    buildDatabaseTableSummary({
      table: "weakWords",
      action: "cascade_dependent",
      candidateCount: weakWords,
      notes: ["Expected to be removed through take-related cleanup."]
    }),
    buildDatabaseTableSummary({
      table: "coachFeedback",
      action: "cascade_dependent",
      candidateCount: coachFeedback,
      notes: ["Expected to be removed through take-related cleanup."]
    }),
    buildDatabaseTableSummary({
      table: "scriptSavedBestTakes",
      action: "cascade_dependent",
      candidateCount: savedBestTakes,
      notes: ["Expected to be removed through user/script/take cleanup."]
    }),
    buildDatabaseTableSummary({
      table: "scriptSavedModelAudios",
      action: "cascade_dependent",
      candidateCount: savedModelAudios,
      notes: ["Expected to be removed through user/script/script_audio cleanup."]
    }),
    buildDatabaseTableSummary({
      table: "scriptAudios",
      action: "cascade_dependent",
      candidateCount: scriptAudios,
      notes: ["Expected to be removed through script cleanup after storage cleanup has succeeded."]
    }),
    buildDatabaseTableSummary({
      table: "scripts",
      action: "explicit_delete",
      candidateCount: scripts,
      notes: ["User-owned script rows are deleted after provider and storage cleanup."]
    }),
    buildDatabaseTableSummary({
      table: "takes",
      action: "explicit_delete",
      candidateCount: takes,
      notes: ["User-owned take rows are deleted after recording storage cleanup."]
    }),
    buildDatabaseTableSummary({
      table: "voiceConsents",
      action: "explicit_delete",
      candidateCount: voiceConsents,
      notes: ["Consent rows are deleted after consent recording storage cleanup."]
    }),
    buildDatabaseTableSummary({
      table: "voices",
      action: "explicit_delete",
      candidateCount: voices,
      notes: ["Voice rows are deleted after ElevenLabs provider cleanup and sample storage cleanup."]
    }),
    buildDatabaseTableSummary({
      table: "quotaEvents",
      action: "explicit_delete",
      candidateCount: quotaEvents,
      notes: ["v1 policy deletes quota event rows during account deletion unless policy changes require anonymization."]
    }),
    buildDatabaseTableSummary({
      table: "profiles",
      action: "delete_last",
      candidateCount: profiles,
      notes: ["Profile row is deleted near the end of DB cleanup, before Supabase Auth deletion."]
    }),
    buildDatabaseTableSummary({
      table: "accountDeletionRequests",
      action: "retain_anonymized",
      candidateCount: retainedAccountDeletionRequests,
      notes: ["Request tracking is retained only as anonymized reference and status where policy allows."]
    })
  ];
  const totals = tables.reduce(
    (accumulator, table) => {
      const next = {
        ...accumulator,
        candidateCount: accumulator.candidateCount + table.candidateCount
      };

      if (table.action === "cascade_dependent") {
        next.cascadeDependentCount += table.candidateCount;
      } else if (table.action === "explicit_delete") {
        next.explicitDeleteCount += table.candidateCount;
      } else if (table.action === "delete_last") {
        next.deleteLastCount += table.candidateCount;
      } else if (table.action === "retain_anonymized") {
        next.retainAnonymizeCount += table.candidateCount;
      } else {
        next.notTouchedCount += table.candidateCount;
      }

      return next;
    },
    {
      candidateCount: 0,
      cascadeDependentCount: 0,
      explicitDeleteCount: 0,
      deleteLastCount: 0,
      retainAnonymizeCount: 0,
      notTouchedCount: 0,
      quotaEventsDeleteCandidateCount: quotaEvents,
      accountDeletionRequestsRetainedTrackingCount: retainedAccountDeletionRequests
    }
  );
  const status = totals.candidateCount > 0 ? "required" : "not_needed";

  return {
    deletionRequest: toView(request),
    status,
    tables,
    totals,
    notes: [
      "dry-run only: database delete, update, and anonymize operations are not called.",
      "table candidates are counted server-side from owned data; target row references and raw row data are not returned.",
      "DB cleanup must wait until provider and storage cleanup are succeeded or not_needed."
    ]
  };
}

function summarizeDatabaseCleanupTables(tables: DatabaseCleanupTableActualSummary[]) {
  return tables.reduce(
    (accumulator, table) => ({
      attempted: accumulator.attempted + table.attempted,
      affected: accumulator.affected + table.affected,
      failed: accumulator.failed + (table.status === "failed" ? table.attempted : 0),
      retained: accumulator.retained + table.retained,
      notNeeded: accumulator.notNeeded + (table.status === "not_needed" ? 1 : 0),
      blocked: accumulator.blocked + (table.status === "blocked" ? 1 : 0)
    }),
    {
      attempted: 0,
      affected: 0,
      failed: 0,
      retained: 0,
      notNeeded: 0,
      blocked: 0
    }
  );
}

function isDatabaseCleanupPlanAligned(left: DatabaseCleanupDryRun, right: DatabaseCleanupDryRun) {
  if (
    left.status !== right.status ||
    left.totals.candidateCount !== right.totals.candidateCount ||
    left.totals.cascadeDependentCount !== right.totals.cascadeDependentCount ||
    left.totals.explicitDeleteCount !== right.totals.explicitDeleteCount ||
    left.totals.deleteLastCount !== right.totals.deleteLastCount ||
    left.totals.retainAnonymizeCount !== right.totals.retainAnonymizeCount ||
    left.totals.quotaEventsDeleteCandidateCount !== right.totals.quotaEventsDeleteCandidateCount ||
    left.totals.accountDeletionRequestsRetainedTrackingCount !== right.totals.accountDeletionRequestsRetainedTrackingCount
  ) {
    return false;
  }

  for (const table of left.tables) {
    const matching = right.tables.find((candidate) => candidate.table === table.table);

    if (
      !matching ||
      matching.action !== table.action ||
      matching.candidateCount !== table.candidateCount ||
      matching.status !== table.status
    ) {
      return false;
    }
  }

  return true;
}

async function updateDatabaseCleanupRequest(input: {
  deletionRequest: AccountDeletionRequestView;
  userId: string;
  update: AccountDeletionRequestUpdate;
}) {
  const admin = getAdminClient();
  const { data, error } = asMaybeSingle<AccountDeletionRequestRow>(
    await admin
      .from("account_deletion_requests")
      .update(input.update)
      .eq("id", input.deletionRequest.id)
      .eq("user_id", input.userId)
      .select("*")
      .single()
  );

  if (error) {
    throw mapDbError("DB cleanup status の更新", error);
  }

  if (!data) {
    throw new AppError(500, "DB cleanup status を更新できませんでした。");
  }

  return toView(data);
}

function classifyDatabaseCleanupFailure(message: string, code?: string) {
  const normalized = message.toLowerCase();

  if (code?.startsWith("23") || normalized.includes("constraint") || normalized.includes("foreign key")) {
    return "db_cleanup_constraint_failed";
  }

  if (normalized.includes("permission") || normalized.includes("policy") || normalized.includes("unauthorized")) {
    return "db_cleanup_permission_denied";
  }

  if (normalized.includes("timeout") || normalized.includes("temporarily") || normalized.includes("connection")) {
    return "db_cleanup_unavailable";
  }

  return "db_cleanup_delete_failed";
}

function getDatabaseCleanupFailureCleanupStatus(failureReasonCode: string): AccountDeletionCleanupStatus {
  return failureReasonCode === "db_cleanup_candidate_mismatch" ||
    failureReasonCode === "db_cleanup_constraint_failed" ||
    failureReasonCode === "db_cleanup_permission_denied"
    ? "manual_required"
    : "failed";
}

async function runDatabaseCleanupOperation(input: {
  table: DatabaseCleanupTableName;
  action: DatabaseCleanupAction;
  expectedCount: number;
  execute: () => unknown;
}): Promise<DatabaseCleanupTableActualSummary & { failureReasonCode?: string }> {
  if (input.action === "retain_anonymized") {
    return {
      table: input.table,
      action: input.action,
      status: "retained",
      attempted: 0,
      affected: 0,
      retained: input.expectedCount
    };
  }

  if (input.expectedCount === 0) {
    return {
      table: input.table,
      action: input.action,
      status: "not_needed",
      attempted: 0,
      affected: 0,
      retained: 0
    };
  }

  const result = await input.execute() as { error: PostgrestErrorLike | null };

  if (result.error) {
    const failureReasonCode = classifyDatabaseCleanupFailure(result.error.message, result.error.code);

    console.error("Account deletion DB cleanup failed", {
      operation: "database-cleanup",
      table: input.table,
      action: input.action,
      reasonCode: failureReasonCode
    });

    return {
      table: input.table,
      action: input.action,
      status: "failed",
      attempted: input.expectedCount,
      affected: 0,
      retained: 0,
      failureReasonCode
    };
  }

  return {
    table: input.table,
    action: input.action,
    status: "succeeded",
    attempted: input.expectedCount,
    affected: input.expectedCount,
    retained: 0
  };
}

function getDatabaseTableCount(dryRun: DatabaseCleanupDryRun, table: DatabaseCleanupTableName) {
  return dryRun.tables.find((summary) => summary.table === table)?.candidateCount ?? 0;
}

async function executeOwnedDatabaseCleanupForAccountDeletion(input: {
  userId: string;
  dryRun: DatabaseCleanupDryRun;
}): Promise<DatabaseCleanupExecutionResult> {
  const admin = getAdminClient();
  const scriptIds = await getIdsFromQuery(
    await admin
      .from("scripts")
      .select("id")
      .eq("user_id", input.userId)
  );
  const takeIds = await getIdsFromQuery(
    await admin
      .from("takes")
      .select("id")
      .eq("user_id", input.userId)
  );
  const tables: DatabaseCleanupTableActualSummary[] = [];
  const operations: Array<{
    table: DatabaseCleanupTableName;
    action: DatabaseCleanupAction;
    expectedCount: number;
    execute: () => unknown;
  }> = [
    {
      table: "weakWords",
      action: "cascade_dependent",
      expectedCount: getDatabaseTableCount(input.dryRun, "weakWords"),
      execute: () => admin.from("weak_words").delete().in("take_id", takeIds)
    },
    {
      table: "coachFeedback",
      action: "cascade_dependent",
      expectedCount: getDatabaseTableCount(input.dryRun, "coachFeedback"),
      execute: () => admin.from("coach_feedback").delete().in("take_id", takeIds)
    },
    {
      table: "scriptSavedBestTakes",
      action: "cascade_dependent",
      expectedCount: getDatabaseTableCount(input.dryRun, "scriptSavedBestTakes"),
      execute: () => admin.from("script_saved_best_takes").delete().eq("user_id", input.userId)
    },
    {
      table: "scriptSavedModelAudios",
      action: "cascade_dependent",
      expectedCount: getDatabaseTableCount(input.dryRun, "scriptSavedModelAudios"),
      execute: () => admin.from("script_saved_model_audios").delete().eq("user_id", input.userId)
    },
    {
      table: "quotaEvents",
      action: "explicit_delete",
      expectedCount: getDatabaseTableCount(input.dryRun, "quotaEvents"),
      execute: () => admin.from("quota_events").delete().eq("user_id", input.userId)
    },
    {
      table: "takes",
      action: "explicit_delete",
      expectedCount: getDatabaseTableCount(input.dryRun, "takes"),
      execute: () => admin.from("takes").delete().eq("user_id", input.userId)
    },
    {
      table: "scriptAudios",
      action: "cascade_dependent",
      expectedCount: getDatabaseTableCount(input.dryRun, "scriptAudios"),
      execute: () => admin.from("script_audios").delete().in("script_id", scriptIds)
    },
    {
      table: "voiceConsents",
      action: "explicit_delete",
      expectedCount: getDatabaseTableCount(input.dryRun, "voiceConsents"),
      execute: () => admin.from("voice_consents").delete().eq("user_id", input.userId)
    },
    {
      table: "voices",
      action: "explicit_delete",
      expectedCount: getDatabaseTableCount(input.dryRun, "voices"),
      execute: () => admin.from("voices").delete().eq("user_id", input.userId)
    },
    {
      table: "scripts",
      action: "explicit_delete",
      expectedCount: getDatabaseTableCount(input.dryRun, "scripts"),
      execute: () => admin.from("scripts").delete().eq("user_id", input.userId)
    },
    {
      table: "profiles",
      action: "delete_last",
      expectedCount: getDatabaseTableCount(input.dryRun, "profiles"),
      execute: () => admin.from("profiles").delete().eq("id", input.userId)
    },
    {
      table: "accountDeletionRequests",
      action: "retain_anonymized",
      expectedCount: getDatabaseTableCount(input.dryRun, "accountDeletionRequests"),
      execute: async () => ({ error: null })
    }
  ];

  for (const operation of operations) {
    const result = await runDatabaseCleanupOperation(operation);
    const { failureReasonCode, ...summary } = result;

    tables.push(summary);

    if (result.status === "failed") {
      return {
        ok: false,
        safeReasonCode: failureReasonCode ?? "db_cleanup_delete_failed",
        tables
      };
    }
  }

  return {
    ok: true,
    tables
  };
}

export async function runDatabaseCleanupActual(input: {
  userId: string;
  deletionRequestId: string;
  env?: NodeJS.ProcessEnv;
  cleanupDatabase?: DatabaseCleanupExecuteFn;
}): Promise<DatabaseCleanupActualResult> {
  const request = await getActiveAccountDeletionRequest(input.userId);

  if (!request) {
    throw new AppError(404, "実行できる削除リクエストがありません。");
  }

  const deletionRequest = toView(request);
  const dryRun = await planDatabaseCleanupDryRun(input.userId);
  const guard = buildDatabaseCleanupGuard({
    deletionRequest,
    deletionRequestId: input.deletionRequestId,
    dryRun,
    env: input.env
  });

  if (isCleanupSatisfied(deletionRequest.cleanup.database)) {
    return createDatabaseCleanupActualResult({
      deletionRequest,
      status: "already_satisfied",
      guard,
      notes: [
        "DB cleanup はすでに succeeded または not_needed です。",
        "actual cleanup does not proceed to Supabase Auth deletion."
      ]
    });
  }

  if (!guard.requestIdMatched) {
    return createDatabaseCleanupActualResult({
      deletionRequest,
      status: "blocked",
      guard,
      failureReasonCode: "deletion_request_id_mismatch",
      notes: [
        "deletion request id が一致しないため DB cleanup actual は実行されません。",
        "no database delete, update, or anonymize operation is called and no request status is updated."
      ]
    });
  }

  if (!guard.statusRunnable || !guard.databaseStageRunnable) {
    return createDatabaseCleanupActualResult({
      deletionRequest,
      status: "blocked",
      guard,
      failureReasonCode: "db_cleanup_not_runnable",
      notes: [
        "confirmed または db_cleanup_failed の request だけ DB cleanup actual を実行できます。",
        "no database delete, update, or anonymize operation is called and no request status is updated."
      ]
    });
  }

  if (!guard.providerCleanupSatisfied) {
    return createDatabaseCleanupActualResult({
      deletionRequest,
      status: "blocked",
      guard,
      failureReasonCode: "provider_cleanup_not_satisfied",
      notes: [
        "provider cleanup が succeeded または not_needed になるまで DB cleanup actual は実行されません。",
        "no database delete, update, or anonymize operation is called and no request status is updated."
      ]
    });
  }

  if (!guard.storageCleanupSatisfied) {
    return createDatabaseCleanupActualResult({
      deletionRequest,
      status: "blocked",
      guard,
      failureReasonCode: "storage_cleanup_not_satisfied",
      notes: [
        "storage cleanup が succeeded または not_needed になるまで DB cleanup actual は実行されません。",
        "no database delete, update, or anonymize operation is called and no request status is updated."
      ]
    });
  }

  if (!guard.dryRunRunnable) {
    if (guard.destructiveGuard) {
      const updated = await updateDatabaseCleanupRequest({
        deletionRequest,
        userId: input.userId,
        update: {
          status: "db_cleanup_failed",
          failure_stage: "db_cleanup",
          failure_reason_code: "db_cleanup_blocked",
          db_cleanup_status: "manual_required",
          retry_count: deletionRequest.retryCount + 1,
          last_attempted_at: new Date().toISOString()
        }
      });

      return createDatabaseCleanupActualResult({
        deletionRequest: updated,
        status: "manual_required",
        guard,
        cleanup: {
          blocked: dryRun.tables.filter((table) => table.status === "blocked").length
        },
        failureReasonCode: "db_cleanup_blocked",
        notes: [
          "DB cleanup dry-run が blocked のため actual cleanup は実行されません。",
          "table classification or ownership ambiguity must be resolved by support/manual retry."
        ]
      });
    }

    return createDatabaseCleanupActualResult({
      deletionRequest,
      status: "blocked",
      guard,
      cleanup: {
        blocked: dryRun.tables.filter((table) => table.status === "blocked").length
      },
      failureReasonCode: "db_cleanup_blocked",
      notes: [
        "DB cleanup dry-run が blocked です。",
        "destructive guard が off のため status update も database cleanup も実行しません。"
      ]
    });
  }

  if (!guard.destructiveGuard) {
    return createDatabaseCleanupActualResult({
      deletionRequest,
      status: "blocked",
      guard,
      cleanup: {
        attempted: 0,
        notNeeded: dryRun.status === "not_needed" ? dryRun.tables.length : 0
      },
      failureReasonCode: ACCOUNT_DELETION_DESTRUCTIVE_GUARD_ENV,
      notes: [
        `${ACCOUNT_DELETION_DESTRUCTIVE_GUARD_ENV}=1 が設定されていないため DB cleanup actual は実行されません。`,
        "no database delete, update, or anonymize operation is called and no request status is updated."
      ]
    });
  }

  if (dryRun.status === "not_needed") {
    const updated = await updateDatabaseCleanupRequest({
      deletionRequest,
      userId: input.userId,
      update: {
        status: "confirmed",
        failure_stage: null,
        failure_reason_code: null,
        db_cleanup_status: "not_needed",
        last_attempted_at: new Date().toISOString()
      }
    });

    return createDatabaseCleanupActualResult({
      deletionRequest: updated,
      status: "not_needed",
      guard,
      cleanup: {
        notNeeded: dryRun.tables.length,
        tables: dryRun.tables.map((table) => ({
          table: table.table,
          action: table.action,
          status: "not_needed",
          attempted: 0,
          affected: 0,
          retained: 0
        }))
      },
      notes: [
        "owned DB cleanup candidates がないため DB cleanup は not_needed です。",
        "actual cleanup does not proceed to Supabase Auth deletion."
      ]
    });
  }

  const latestDryRun = await planDatabaseCleanupDryRun(input.userId);

  if (!isDatabaseCleanupPlanAligned(dryRun, latestDryRun)) {
    const updated = await updateDatabaseCleanupRequest({
      deletionRequest,
      userId: input.userId,
      update: {
        status: "db_cleanup_failed",
        failure_stage: "db_cleanup",
        failure_reason_code: "db_cleanup_candidate_mismatch",
        db_cleanup_status: "manual_required",
        retry_count: deletionRequest.retryCount + 1,
        last_attempted_at: new Date().toISOString()
      }
    });

    return createDatabaseCleanupActualResult({
      deletionRequest: updated,
      status: "manual_required",
      guard,
      cleanup: {
        blocked: 1
      },
      failureReasonCode: "db_cleanup_candidate_mismatch",
      notes: [
        "latest DB dry-run と actual candidate classification が一致しません。",
        "no database delete, update, or anonymize operation is called; support/manual retry must reconcile owned DB inventory first."
      ]
    });
  }

  const cleanupDatabase = input.cleanupDatabase ?? executeOwnedDatabaseCleanupForAccountDeletion;
  const cleanupResult = await cleanupDatabase({
    userId: input.userId,
    dryRun: latestDryRun
  });
  const cleanupSummary = summarizeDatabaseCleanupTables(cleanupResult.tables);

  if (!cleanupResult.ok) {
    const cleanupStatus = getDatabaseCleanupFailureCleanupStatus(cleanupResult.safeReasonCode);
    const updated = await updateDatabaseCleanupRequest({
      deletionRequest,
      userId: input.userId,
      update: {
        status: "db_cleanup_failed",
        failure_stage: "db_cleanup",
        failure_reason_code: cleanupResult.safeReasonCode,
        db_cleanup_status: cleanupStatus,
        retry_count: deletionRequest.retryCount + 1,
        last_attempted_at: new Date().toISOString()
      }
    });

    return createDatabaseCleanupActualResult({
      deletionRequest: updated,
      status: cleanupStatus === "manual_required" ? "manual_required" : "failed",
      guard,
      cleanup: {
        ...cleanupSummary,
        tables: cleanupResult.tables
      },
      failureReasonCode: cleanupResult.safeReasonCode,
      notes: [
        "DB cleanup failed; Supabase Auth deletion must not run.",
        "row ids, user id, email, script text, transcript, coach feedback, provider metadata, and storage paths are not returned or stored in request metadata."
      ]
    });
  }

  const updated = await updateDatabaseCleanupRequest({
    deletionRequest,
    userId: input.userId,
    update: {
      status: "confirmed",
      failure_stage: null,
      failure_reason_code: null,
      db_cleanup_status: "succeeded",
      last_attempted_at: new Date().toISOString()
    }
  });

  return createDatabaseCleanupActualResult({
    deletionRequest: updated,
    status: "succeeded",
    guard,
    cleanup: {
      ...cleanupSummary,
      tables: cleanupResult.tables
    },
    notes: [
      "DB cleanup stage succeeded.",
      "account_deletion_requests is retained for short-term anonymized tracking; user_id remains until Supabase Auth deletion sets it null.",
      "actual cleanup stops after DB stage; Supabase Auth deletion is not executed here."
    ]
  });
}

async function updateAuthCleanupRequest(input: {
  deletionRequest: AccountDeletionRequestView;
  userId: string;
  update: AccountDeletionRequestUpdate;
}) {
  const admin = getAdminClient();
  const { data, error } = asMaybeSingle<AccountDeletionRequestRow>(
    await admin
      .from("account_deletion_requests")
      .update(input.update)
      .eq("id", input.deletionRequest.id)
      .eq("user_id", input.userId)
      .select("*")
      .single()
  );

  if (error) {
    throw mapDbError("Auth cleanup status の更新", error);
  }

  if (!data) {
    throw new AppError(500, "Auth cleanup status を更新できませんでした。");
  }

  return toView(data);
}

async function completeAuthCleanupRequest(input: {
  deletionRequest: AccountDeletionRequestView;
  update: AccountDeletionRequestUpdate;
}) {
  const admin = getAdminClient();
  const { data, error } = asMaybeSingle<AccountDeletionRequestRow>(
    await admin
      .from("account_deletion_requests")
      .update(input.update)
      .eq("id", input.deletionRequest.id)
      .select("*")
      .single()
  );

  if (error) {
    throw mapDbError("Auth cleanup completion status の更新", error);
  }

  if (!data) {
    throw new AppError(500, "Auth cleanup completion status を更新できませんでした。");
  }

  return toView(data);
}

function classifySupabaseAuthDeletionFailure(message: string, status?: number | string, code?: string) {
  const normalized = message.toLowerCase();
  const normalizedStatus = typeof status === "number" ? String(status) : status?.toLowerCase();

  if (normalizedStatus === "401" || normalizedStatus === "403" || normalized.includes("permission") || normalized.includes("not authorized")) {
    return "auth_delete_permission_denied";
  }

  if (normalizedStatus === "404" || normalized.includes("not found") || normalized.includes("no user")) {
    return "auth_delete_user_not_found";
  }

  if (normalizedStatus === "429" || normalized.includes("rate") || normalized.includes("too many")) {
    return "auth_delete_rate_limited";
  }

  if (normalizedStatus?.startsWith("5") || normalized.includes("timeout") || normalized.includes("temporarily")) {
    return "auth_delete_unavailable";
  }

  if (code?.toLowerCase().includes("permission")) {
    return "auth_delete_permission_denied";
  }

  return "auth_delete_failed";
}

function getAuthDeletionFailureCleanupStatus(failureReasonCode: string): AccountDeletionCleanupStatus {
  return failureReasonCode === "auth_cleanup_blocked" ||
    failureReasonCode === "auth_delete_permission_denied" ||
    failureReasonCode === "auth_delete_user_not_found"
    ? "manual_required"
    : "failed";
}

async function deleteSupabaseAuthUserForAccountDeletion(userId: string): Promise<SupabaseAuthDeletionExecutionResult> {
  const admin = getAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);

  if (!error) {
    return { ok: true };
  }

  const authError = error as { message: string; status?: number | string; code?: string };
  const safeReasonCode = classifySupabaseAuthDeletionFailure(
    authError.message,
    authError.status,
    authError.code
  );

  console.error("Account deletion Supabase Auth cleanup failed", {
    operation: "auth-cleanup",
    reasonCode: safeReasonCode
  });

  return {
    ok: false,
    safeReasonCode
  };
}

export async function runSupabaseAuthDeletionActual(input: {
  userId: string;
  deletionRequestId: string;
  env?: NodeJS.ProcessEnv;
  deleteAuthUser?: SupabaseAuthDeleteFn;
}): Promise<SupabaseAuthDeletionActualResult> {
  const request = await getActiveAccountDeletionRequest(input.userId);

  if (!request) {
    throw new AppError(404, "実行できる削除リクエストがありません。");
  }

  const deletionRequest = toView(request);
  const dryRun = await planSupabaseAuthDeletionDryRun(input.userId);
  const guard = buildSupabaseAuthDeletionGuard({
    deletionRequest,
    deletionRequestId: input.deletionRequestId,
    dryRun,
    env: input.env
  });

  if (isCleanupSatisfied(deletionRequest.cleanup.auth)) {
    return createSupabaseAuthDeletionActualResult({
      deletionRequest,
      status: "already_satisfied",
      guard,
      notes: [
        "Supabase Auth deletion はすでに succeeded または not_needed です。",
        "actual cleanup does not call Supabase Auth admin deletion again."
      ]
    });
  }

  if (!guard.requestIdMatched) {
    return createSupabaseAuthDeletionActualResult({
      deletionRequest,
      status: "blocked",
      guard,
      failureReasonCode: "deletion_request_id_mismatch",
      notes: [
        "deletion request id が一致しないため Supabase Auth deletion actual は実行されません。",
        "no Auth delete is called and no request status is updated."
      ]
    });
  }

  if (!guard.statusRunnable || !guard.authStageRunnable) {
    return createSupabaseAuthDeletionActualResult({
      deletionRequest,
      status: "blocked",
      guard,
      failureReasonCode: "auth_cleanup_not_runnable",
      notes: [
        "confirmed または auth_cleanup_failed の request だけ Supabase Auth deletion actual を実行できます。",
        "no Auth delete is called and no request status is updated."
      ]
    });
  }

  if (!guard.providerCleanupSatisfied) {
    return createSupabaseAuthDeletionActualResult({
      deletionRequest,
      status: "blocked",
      guard,
      failureReasonCode: "provider_cleanup_not_satisfied",
      notes: [
        "provider cleanup が succeeded または not_needed になるまで Supabase Auth deletion actual は実行されません。",
        "no Auth delete is called and no request status is updated."
      ]
    });
  }

  if (!guard.storageCleanupSatisfied) {
    return createSupabaseAuthDeletionActualResult({
      deletionRequest,
      status: "blocked",
      guard,
      failureReasonCode: "storage_cleanup_not_satisfied",
      notes: [
        "storage cleanup が succeeded または not_needed になるまで Supabase Auth deletion actual は実行されません。",
        "no Auth delete is called and no request status is updated."
      ]
    });
  }

  if (!guard.databaseCleanupSatisfied) {
    return createSupabaseAuthDeletionActualResult({
      deletionRequest,
      status: "blocked",
      guard,
      failureReasonCode: "db_cleanup_not_satisfied",
      notes: [
        "DB cleanup が succeeded または not_needed になるまで Supabase Auth deletion actual は実行されません。",
        "no Auth delete is called and no request status is updated."
      ]
    });
  }

  if (!guard.dryRunRunnable || !guard.serviceRoleAvailable) {
    if (guard.destructiveGuard) {
      const updated = await updateAuthCleanupRequest({
        deletionRequest,
        userId: input.userId,
        update: {
          status: "auth_cleanup_failed",
          failure_stage: "auth_cleanup",
          failure_reason_code: "auth_cleanup_blocked",
          auth_cleanup_status: "manual_required",
          retry_count: deletionRequest.retryCount + 1,
          last_attempted_at: new Date().toISOString()
        }
      });

      return createSupabaseAuthDeletionActualResult({
        deletionRequest: updated,
        status: "manual_required",
        guard,
        cleanup: {
          blocked: 1
        },
        failureReasonCode: "auth_cleanup_blocked",
        notes: [
          "Supabase Auth deletion dry-run が runnable ではないため actual delete は実行されません。",
          "Auth user state, service role availability, or prior cleanup tracking must be resolved by support/manual retry."
        ]
      });
    }

    return createSupabaseAuthDeletionActualResult({
      deletionRequest,
      status: "blocked",
      guard,
      cleanup: {
        blocked: 1
      },
      failureReasonCode: "auth_cleanup_blocked",
      notes: [
        "Supabase Auth deletion dry-run が runnable ではありません。",
        "destructive guard が off のため status update も Auth delete も実行しません。"
      ]
    });
  }

  if (!guard.destructiveGuard) {
    return createSupabaseAuthDeletionActualResult({
      deletionRequest,
      status: "blocked",
      guard,
      cleanup: {
        attempted: 0
      },
      failureReasonCode: ACCOUNT_DELETION_DESTRUCTIVE_GUARD_ENV,
      notes: [
        `${ACCOUNT_DELETION_DESTRUCTIVE_GUARD_ENV}=1 が設定されていないため Supabase Auth deletion actual は実行されません。`,
        "no Auth delete is called and no request status is updated."
      ]
    });
  }

  const deleteAuthUser = input.deleteAuthUser ?? deleteSupabaseAuthUserForAccountDeletion;
  const authDeletionResult = await deleteAuthUser(input.userId);

  if (!authDeletionResult.ok) {
    const cleanupStatus = getAuthDeletionFailureCleanupStatus(authDeletionResult.safeReasonCode);
    const updated = await updateAuthCleanupRequest({
      deletionRequest,
      userId: input.userId,
      update: {
        status: "auth_cleanup_failed",
        failure_stage: "auth_cleanup",
        failure_reason_code: authDeletionResult.safeReasonCode,
        auth_cleanup_status: cleanupStatus,
        retry_count: deletionRequest.retryCount + 1,
        last_attempted_at: new Date().toISOString()
      }
    });

    return createSupabaseAuthDeletionActualResult({
      deletionRequest: updated,
      status: cleanupStatus === "manual_required" ? "manual_required" : "failed",
      guard,
      cleanup: {
        attempted: 1,
        failed: 1
      },
      failureReasonCode: authDeletionResult.safeReasonCode,
      notes: [
        "Supabase Auth deletion failed; account deletion completion must not be marked completed.",
        "raw user id, email, token, service role key, and raw Auth provider response are not returned or stored in request metadata."
      ]
    });
  }

  const completedAt = new Date().toISOString();
  let updated: AccountDeletionRequestView;

  try {
    updated = await completeAuthCleanupRequest({
      deletionRequest,
      update: {
        status: "completed",
        failure_stage: null,
        failure_reason_code: null,
        auth_cleanup_status: "succeeded",
        notification_status: "not_needed",
        completed_at: completedAt,
        last_attempted_at: completedAt
      }
    });
  } catch {
    console.error("Account deletion completion tracking failed after Auth cleanup", {
      operation: "auth-cleanup-completion",
      reasonCode: "auth_completion_status_write_failed"
    });

    return createSupabaseAuthDeletionActualResult({
      deletionRequest,
      status: "manual_required",
      guard,
      cleanup: {
        attempted: 1,
        succeeded: 1
      },
      failureReasonCode: "auth_completion_status_write_failed",
      notes: [
        "Supabase Auth deletion succeeded but completion tracking failed; support/manual follow-up is required.",
        "Do not recreate user data to repair completion status; use retained request id / anonymized reference if available."
      ]
    });
  }

  return createSupabaseAuthDeletionActualResult({
    deletionRequest: updated,
    status: "succeeded",
    guard,
    cleanup: {
      attempted: 1,
      succeeded: 1
    },
    notes: [
      "Supabase Auth deletion stage succeeded and request tracking was marked completed.",
      "account_deletion_requests.user_id may be null after Auth deletion; completion update is performed server-side by request id only after the request/user match was verified.",
      "completion notification is not implemented; notification_status is set to not_needed for this guarded v1 path."
    ]
  });
}

export async function planSupabaseAuthDeletionDryRun(userId: string): Promise<SupabaseAuthDeletionDryRun> {
  const request = await getActiveAccountDeletionRequest(userId);

  if (!request) {
    throw new AppError(404, "削除リクエスト作成後に Auth deletion dry-run を確認できます。");
  }

  const admin = getAdminClient();
  const deletionRequest = toView(request);
  const runGuard = validateDeletionRequestCanRun(deletionRequest);
  const dbCleanupSatisfied = isCleanupSatisfied(deletionRequest.cleanup.database);
  const authCleanupSatisfied = isCleanupSatisfied(deletionRequest.cleanup.auth);
  let authUserStatus: SupabaseAuthDeletionDryRun["preflight"]["authUserStatus"] = "present";

  try {
    const { data, error } = await admin.auth.admin.getUserById(userId);

    if (error || !data.user) {
      authUserStatus = "missing";
    }
  } catch {
    authUserStatus = "unavailable";
  }

  const status: SupabaseAuthDeletionDryRun["status"] = authCleanupSatisfied
    ? "already_satisfied"
    : !runGuard.allowed
      ? "blocked"
      : !dbCleanupSatisfied
        ? "waiting_for_db_cleanup"
        : authUserStatus === "present"
          ? "ready"
          : "blocked";

  return {
    deletionRequest,
    status,
    canDelete: status === "ready",
    candidateCount: authUserStatus === "present" && !authCleanupSatisfied ? 1 : 0,
    preflight: {
      requestRunnable: runGuard.allowed,
      serviceRoleRequired: true,
      serviceRoleAvailable: true,
      dbCleanupSatisfied,
      authUserStatus,
      trackingAfterDeletion: "anonymized_reference",
      completionAfterAuth: true,
      notificationAfterAuth: true
    },
    notes: [
      "dry-run only: Supabase Auth user deletion is not called.",
      "Auth cleanup is the final destructive stage and must wait for DB cleanup to be succeeded or not_needed.",
      "After Auth deletion, short-term request tracking uses only the anonymized reference and cleanup status.",
      "Sensitive Auth details and credentials are not returned."
    ]
  };
}

export async function runAccountDeletionJobDryRun(userId: string): Promise<AccountDeletionJobDryRun> {
  const inventory = await collectAccountDeletionInventory(userId);
  const providerCleanup = await planElevenLabsCleanupDryRun(userId);
  const storageCleanup = await planStorageCleanupDryRun(userId);
  const databaseCleanup = await planDatabaseCleanupDryRun(userId);
  const authDeletion = await planSupabaseAuthDeletionDryRun(userId);
  const deletionRequest = inventory.deletionRequest;
  const runGuard = validateDeletionRequestCanRun(deletionRequest);

  return {
    deletionRequest,
    canRun: runGuard.allowed,
    runGuard,
    providerCleanup,
    storageCleanup,
    databaseCleanup,
    authDeletion,
    inventory,
    stages: planAccountDeletionStages(deletionRequest, inventory, providerCleanup, storageCleanup, databaseCleanup, authDeletion),
    notes: [
      "dry-run only: no provider voice, storage object, database row, quota event, consent recording, or auth user is deleted.",
      "dry-run does not update account_deletion_requests status, cleanup status, retry count, timestamps, or metadata.",
      "stage order is provider cleanup -> storage cleanup -> DB cleanup -> Supabase Auth deletion -> completion."
    ]
  };
}
