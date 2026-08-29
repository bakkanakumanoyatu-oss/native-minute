import "server-only";

import { createElevenLabsVoiceDeletionProviderAdapter } from "@/providers/voice-deletion";
import type {
  VoiceDeletionProviderDiagnosticAdapter,
  VoiceDeletionProviderDiagnosticEvidence
} from "@/providers/voice-deletion/types";
import type { Database } from "@/types/database";
import {
  createVoiceDeletionRepository,
  type VoiceDeletionRepository
} from "./voice-deletion.repository";

type Operation = Database["public"]["Tables"]["voice_deletion_operations"]["Row"];
type Target = Database["public"]["Tables"]["voice_deletion_targets"]["Row"];
type RecoveryRepository = Pick<VoiceDeletionRepository, "getActiveOperation" | "listOperationTargets">;
type RecoveryProviderAdapter = Pick<VoiceDeletionProviderDiagnosticAdapter, "reconcileVoiceAbsenceWithSafeEvidence">;

const STORAGE_TARGET_KINDS = ["voice_sample", "voice_consent_recording", "script_audio_storage"] as const;
const DATABASE_TARGET_KINDS = ["script_audio", "saved_model_audio", "voice_binding"] as const;
const SAFE_CLASSIFICATIONS = [
  "TARGET_PRESENT_AND_READABLE",
  "STRICT_VOICE_NOT_FOUND",
  "AUTHENTICATION_REJECTED",
  "AUTHORIZATION_REJECTED",
  "RATE_LIMITED",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_REJECTED",
  "PROTOCOL_ERROR",
  "UNKNOWN"
] as const;
const SAFE_ADAPTER_OUTCOMES = [
  "present_owner_true",
  "present_owner_false",
  "present_owner_unknown",
  "strict_voice_not_found",
  "credential_missing",
  "invalid_provider_reference",
  "auth_failed",
  "permission_denied",
  "rate_limited",
  "provider_unavailable",
  "timeout",
  "network_error",
  "provider_rejected",
  "protocol_error"
] as const;
const SAFE_HTTP_STATUS_CATEGORIES = [
  "success",
  "not_found",
  "authentication_rejected",
  "authorization_rejected",
  "rate_limited",
  "provider_rejected",
  "provider_unavailable",
  "protocol_error",
  "not_called"
] as const;
const SAFE_PROVIDER_TYPES = ["not_found", "authentication_error", "other", "unknown"] as const;
const SAFE_PROVIDER_CODES = ["voice_not_found", "invalid_api_key", "other", "unknown"] as const;
const SAFE_MAPPER_BRANCHES = [
  "present_matching_voice",
  "present_protocol_error",
  "strict_voice_not_found",
  "not_found_protocol_error",
  "http_authentication_rejected",
  "http_authorization_rejected",
  "http_rate_limited",
  "http_provider_unavailable",
  "http_provider_rejected",
  "unexpected_http_status",
  "credential_missing",
  "invalid_provider_reference",
  "timeout",
  "network_error",
  "incident_not_eligible",
  "route_recovery_failure"
] as const;

type NotCalledRecoveryEvidence = {
  adapterOutcome: "not_called";
  httpStatusCategory: "not_called";
  safeProviderType: "unknown";
  safeProviderCode: "unknown";
  mapperBranch: "incident_not_eligible" | "route_recovery_failure";
};

export type StagingManualProviderRecoveryResult = {
  classification:
    | "TARGET_PRESENT_AND_READABLE"
    | "STRICT_VOICE_NOT_FOUND"
    | "AUTHENTICATION_REJECTED"
    | "AUTHORIZATION_REJECTED"
    | "RATE_LIMITED"
    | "PROVIDER_UNAVAILABLE"
    | "PROVIDER_REJECTED"
    | "PROTOCOL_ERROR"
    | "UNKNOWN";
  evidence: VoiceDeletionProviderDiagnosticEvidence | NotCalledRecoveryEvidence;
};

export type StagingManualProviderRecoveryDependencies = {
  repository: RecoveryRepository;
  providerAdapter: RecoveryProviderAdapter;
};

function isOneOf<const Values extends readonly string[]>(value: unknown, values: Values): value is Values[number] {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function notEligible(): StagingManualProviderRecoveryResult {
  return {
    classification: "UNKNOWN",
    evidence: {
      adapterOutcome: "not_called",
      httpStatusCategory: "not_called",
      safeProviderType: "unknown",
      safeProviderCode: "unknown",
      mapperBranch: "incident_not_eligible"
    }
  };
}

function isExactManualProviderIncident(operation: Operation | null, userId: string): operation is Operation {
  return Boolean(
    operation &&
      operation.user_id === userId &&
      operation.status === "manual_required" &&
      operation.current_stage === "provider_cleanup" &&
      operation.snapshot_status === "succeeded" &&
      operation.consent_withdrawal_status === "succeeded" &&
      operation.destructive_started_at !== null
  );
}

function hasValidSealedMembership(targets: Target[], operationId: string, userId: string) {
  return (
    targets.length > 0 &&
    targets.every(
      (target) =>
        target.operation_id === operationId &&
        target.user_id === userId &&
        typeof target.target_fingerprint === "string" &&
        target.target_fingerprint.length > 0
    )
  );
}

function isStorageTarget(target: Target) {
  return (STORAGE_TARGET_KINDS as readonly string[]).includes(target.target_kind);
}

function isDatabaseTarget(target: Target) {
  return (DATABASE_TARGET_KINDS as readonly string[]).includes(target.target_kind);
}

function isUntouchedDownstreamTarget(target: Target) {
  return (
    target.status === "pending" &&
    target.delete_outcome === "not_attempted" &&
    target.delete_attempt_count === 0 &&
    target.verification_attempt_count === 0 &&
    target.reconciliation_status === "not_applicable" &&
    target.verification_status === "pending"
  );
}

function getExactEligibleProviderTarget(
  targets: Target[],
  operationId: string,
  userId: string
): (Target & { provider_resource_id: string }) | null {
  if (!hasValidSealedMembership(targets, operationId, userId)) {
    return null;
  }

  const providerTargets = targets.filter((target) => target.target_kind === "provider_voice");
  if (providerTargets.length !== 1) {
    return null;
  }

  const providerTarget = providerTargets[0];
  if (
    providerTarget.provider_name !== "elevenlabs" ||
    typeof providerTarget.provider_resource_id !== "string" ||
    providerTarget.provider_resource_id.length === 0 ||
    providerTarget.delete_attempt_count !== 1 ||
    providerTarget.delete_outcome !== "succeeded" ||
    providerTarget.verification_attempt_count < 1 ||
    providerTarget.status === "verified_absent" ||
    providerTarget.reconciliation_status === "verified_absent" ||
    providerTarget.verification_status === "verified_absent"
  ) {
    return null;
  }

  const storageTargets = targets.filter(isStorageTarget);
  const databaseTargets = targets.filter(isDatabaseTarget);
  if (!storageTargets.every(isUntouchedDownstreamTarget) || !databaseTargets.every(isUntouchedDownstreamTarget)) {
    return null;
  }

  return providerTarget as Target & { provider_resource_id: string };
}

function mapDiagnosticResult(
  result: Awaited<ReturnType<RecoveryProviderAdapter["reconcileVoiceAbsenceWithSafeEvidence"]>>
): StagingManualProviderRecoveryResult {
  switch (result.result.kind) {
    case "present":
      return {
        classification: result.result.ownerSignal === "false" ? "AUTHORIZATION_REJECTED" : "TARGET_PRESENT_AND_READABLE",
        evidence: result.evidence
      };
    case "verified_absent":
      return { classification: "STRICT_VOICE_NOT_FOUND", evidence: result.evidence };
    case "auth_failed":
      return { classification: "AUTHENTICATION_REJECTED", evidence: result.evidence };
    case "permission_denied":
      return { classification: "AUTHORIZATION_REJECTED", evidence: result.evidence };
    case "rate_limited":
      return { classification: "RATE_LIMITED", evidence: result.evidence };
    case "provider_unavailable":
      return { classification: "PROVIDER_UNAVAILABLE", evidence: result.evidence };
    case "provider_rejected":
      return { classification: "PROVIDER_REJECTED", evidence: result.evidence };
    case "protocol_error":
      return { classification: "PROTOCOL_ERROR", evidence: result.evidence };
    default:
      return { classification: "UNKNOWN", evidence: result.evidence };
  }
}

export function unavailableManualProviderRecoveryResult(): StagingManualProviderRecoveryResult {
  return {
    classification: "UNKNOWN",
    evidence: {
      adapterOutcome: "not_called",
      httpStatusCategory: "not_called",
      safeProviderType: "unknown",
      safeProviderCode: "unknown",
      mapperBranch: "route_recovery_failure"
    }
  };
}

/**
 * A defensive response boundary for the internal route. It intentionally copies
 * only its closed DTO fields even if a future dependency is malformed.
 */
export function toSafeManualProviderRecoveryResult(value: unknown): StagingManualProviderRecoveryResult {
  if (!isRecord(value) || !isRecord(value.evidence) || !isOneOf(value.classification, SAFE_CLASSIFICATIONS)) {
    return unavailableManualProviderRecoveryResult();
  }

  const evidence = value.evidence;
  if (
    !isOneOf(evidence.adapterOutcome, [...SAFE_ADAPTER_OUTCOMES, "not_called"] as const) ||
    !isOneOf(evidence.httpStatusCategory, SAFE_HTTP_STATUS_CATEGORIES) ||
    !isOneOf(evidence.safeProviderType, SAFE_PROVIDER_TYPES) ||
    !isOneOf(evidence.safeProviderCode, SAFE_PROVIDER_CODES) ||
    !isOneOf(evidence.mapperBranch, SAFE_MAPPER_BRANCHES)
  ) {
    return unavailableManualProviderRecoveryResult();
  }

  return {
    classification: value.classification,
    evidence: {
      adapterOutcome: evidence.adapterOutcome,
      httpStatusCategory: evidence.httpStatusCategory,
      safeProviderType: evidence.safeProviderType,
      safeProviderCode: evidence.safeProviderCode,
      mapperBranch: evidence.mapperBranch
    }
  } as StagingManualProviderRecoveryResult;
}

function createDefaultDependencies(): StagingManualProviderRecoveryDependencies {
  return {
    repository: createVoiceDeletionRepository(),
    providerAdapter: createElevenLabsVoiceDeletionProviderAdapter()
  };
}

/**
 * G5C-B7's separately authorized recovery seam. It makes one provider GET only
 * after an exact server-derived manual incident match; it has no durable writer.
 */
export async function diagnoseStagingManualProviderIncident(
  userId: string,
  provided?: StagingManualProviderRecoveryDependencies
): Promise<StagingManualProviderRecoveryResult> {
  const dependencies = provided ?? createDefaultDependencies();
  const operation = await dependencies.repository.getActiveOperation(userId);
  if (!isExactManualProviderIncident(operation, userId)) {
    return notEligible();
  }

  const target = getExactEligibleProviderTarget(
    await dependencies.repository.listOperationTargets(operation.id, userId),
    operation.id,
    userId
  );
  if (!target) {
    return notEligible();
  }

  return mapDiagnosticResult(
    await dependencies.providerAdapter.reconcileVoiceAbsenceWithSafeEvidence({
      providerResourceId: target.provider_resource_id
    })
  );
}
