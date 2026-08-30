import "server-only";

import { randomUUID } from "node:crypto";
import type { Database } from "@/types/database";
import {
  createVoiceDeletionRepository,
  type VoiceDeletionRepository
} from "./voice-deletion.repository";

type Operation = Database["public"]["Tables"]["voice_deletion_operations"]["Row"];
type Target = Database["public"]["Tables"]["voice_deletion_targets"]["Row"];
type AcceptanceRepository = Pick<
  VoiceDeletionRepository,
  | "getActiveOperation"
  | "listOperationTargets"
  | "claimExpiredOrAvailableLease"
  | "acceptG5cB7ManualProviderAbsence"
  | "releaseLease"
>;

const DEFAULT_LEASE_SECONDS = 60;
const STORAGE_TARGET_KINDS = ["voice_sample", "voice_consent_recording", "script_audio_storage"] as const;
const DATABASE_TARGET_KINDS = ["script_audio", "saved_model_audio", "voice_binding"] as const;

export const G5C_B7_MANUAL_PROVIDER_ABSENCE_CONFIRMATION = "accept_g5c_b7_manual_provider_absence" as const;

export type ManualProviderAbsenceAcceptanceResult = {
  state: "accepted" | "not_eligible" | "busy";
};

export type StagingManualProviderAbsenceAcceptanceDependencies = {
  repository: AcceptanceRepository;
  createLeaseToken(): string;
};

function isOneOf<const Values extends readonly string[]>(value: string, values: Values): value is Values[number] {
  return (values as readonly string[]).includes(value);
}

function hasSealedOwnedMembership(targets: Target[], operationId: string, userId: string) {
  return (
    targets.length === 6 &&
    targets.every(
      (target) =>
        target.operation_id === operationId &&
        target.user_id === userId &&
        typeof target.target_fingerprint === "string" &&
        target.target_fingerprint.trim().length > 0
    )
  );
}

function isUntouchedDownstreamTarget(target: Target) {
  return (
    target.status === "pending" &&
    target.delete_outcome === "not_attempted" &&
    target.reconciliation_status === "not_applicable" &&
    target.verification_status === "pending" &&
    target.delete_attempt_count === 0 &&
    target.verification_attempt_count === 0 &&
    target.last_failure_category === null &&
    target.last_attempted_at === null &&
    target.delete_succeeded_at === null &&
    target.verified_absent_at === null &&
    target.manual_required_at === null
  );
}

function isExactManualProviderIncident(operation: Operation | null, userId: string): operation is Operation {
  return Boolean(
    operation &&
      operation.user_id === userId &&
      operation.status === "manual_required" &&
      operation.current_stage === "provider_cleanup" &&
      operation.snapshot_status === "succeeded" &&
      operation.consent_withdrawal_status === "succeeded" &&
      operation.destructive_started_at !== null &&
      operation.last_failure_stage === "provider_cleanup" &&
      operation.last_failure_category === "provider_rejected" &&
      operation.manual_reason_category === "provider_rejected" &&
      operation.manual_required_at !== null &&
      operation.next_retry_at === null
  );
}

function getExactProviderTarget(targets: Target[], operationId: string, userId: string) {
  if (!hasSealedOwnedMembership(targets, operationId, userId)) {
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
    providerTarget.provider_resource_id.trim().length === 0 ||
    providerTarget.status !== "manual_required" ||
    providerTarget.reconciliation_status !== "manual_required" ||
    providerTarget.verification_status !== "manual_required" ||
    providerTarget.delete_attempt_count !== 1 ||
    providerTarget.delete_outcome !== "succeeded" ||
    providerTarget.verification_attempt_count < 1 ||
    providerTarget.last_failure_category !== "provider_rejected" ||
    providerTarget.manual_required_at === null ||
    providerTarget.verified_absent_at !== null
  ) {
    return null;
  }

  const storageTargets = targets.filter((target) => isOneOf(target.target_kind, STORAGE_TARGET_KINDS));
  const databaseTargets = targets.filter((target) => isOneOf(target.target_kind, DATABASE_TARGET_KINDS));
  const exactKindCount = (kind: Target["target_kind"], count: number) =>
    targets.filter((target) => target.target_kind === kind).length === count;

  if (
    storageTargets.length !== 3 ||
    databaseTargets.length !== 2 ||
    !exactKindCount("voice_sample", 1) ||
    !exactKindCount("voice_consent_recording", 1) ||
    !exactKindCount("script_audio_storage", 1) ||
    !exactKindCount("script_audio", 1) ||
    !exactKindCount("voice_binding", 1) ||
    !exactKindCount("saved_model_audio", 0) ||
    ![...storageTargets, ...databaseTargets].every(isUntouchedDownstreamTarget)
  ) {
    return null;
  }

  return providerTarget;
}

function isAcceptedProviderReentry(operation: Operation | null, userId: string) {
  return Boolean(
    operation &&
      operation.user_id === userId &&
      operation.status === "processing" &&
      operation.current_stage === "provider_cleanup" &&
      operation.last_failure_stage === null &&
      operation.last_failure_category === null &&
      operation.manual_reason_category === null &&
      operation.manual_required_at === null &&
      operation.next_retry_at === null
  );
}

function createDefaultDependencies(): StagingManualProviderAbsenceAcceptanceDependencies {
  return {
    repository: createVoiceDeletionRepository(),
    createLeaseToken: randomUUID
  };
}

/**
 * Accepts the already-approved B7 human evidence through the one dedicated
 * durable RPC. It intentionally has no provider adapter dependency: absence is
 * accepted here, not re-proven, and the next normal advance owns later work.
 */
export async function acceptStagingManualProviderAbsence(
  userId: string,
  provided?: StagingManualProviderAbsenceAcceptanceDependencies
): Promise<ManualProviderAbsenceAcceptanceResult> {
  const dependencies = provided ?? createDefaultDependencies();
  const operation = await dependencies.repository.getActiveOperation(userId);
  if (!isExactManualProviderIncident(operation, userId)) {
    return { state: "not_eligible" };
  }

  const providerTarget = getExactProviderTarget(
    await dependencies.repository.listOperationTargets(operation.id, userId),
    operation.id,
    userId
  );
  if (!providerTarget) {
    return { state: "not_eligible" };
  }

  const leaseToken = dependencies.createLeaseToken();
  const lease = await dependencies.repository.claimExpiredOrAvailableLease({
    operationId: operation.id,
    userId,
    leaseToken,
    leaseSeconds: DEFAULT_LEASE_SECONDS
  });
  if (!lease) {
    return { state: "busy" };
  }

  try {
    const accepted = await dependencies.repository.acceptG5cB7ManualProviderAbsence({
      operationId: operation.id,
      userId,
      targetId: providerTarget.id,
      leaseToken,
      expectedRunnerAttemptCount: lease.runner_attempt_count,
      expectedVerificationAttemptCount: providerTarget.verification_attempt_count
    });

    return isAcceptedProviderReentry(accepted, userId) ? { state: "accepted" } : { state: "not_eligible" };
  } finally {
    await dependencies.repository.releaseLease({ operationId: operation.id, userId, leaseToken });
  }
}
