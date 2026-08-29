import "server-only";

import { createElevenLabsVoiceDeletionProviderAdapter } from "@/providers/voice-deletion";
import type { VoiceDeletionProviderAdapter } from "@/providers/voice-deletion/types";
import type { Database } from "@/types/database";
import {
  createVoiceDeletionRepository,
  type VoiceDeletionRepository
} from "./voice-deletion.repository";

type Operation = Database["public"]["Tables"]["voice_deletion_operations"]["Row"];
type Target = Database["public"]["Tables"]["voice_deletion_targets"]["Row"];
type ReadOnlyProviderAdapter = Pick<VoiceDeletionProviderAdapter, "reconcileVoiceAbsence">;
type ProbeRepository = Pick<VoiceDeletionRepository, "getActiveOperation" | "listOperationTargets">;

export type StagingProviderOwnershipProbeResult = {
  classification:
    | "TARGET_PRESENT_AND_READABLE"
    | "VOICE_NOT_FOUND"
    | "AUTHENTICATION_REJECTED"
    | "AUTHORIZATION_REJECTED"
    | "PROVIDER_REJECTED"
    | "UNKNOWN";
};

export type StagingProviderOwnershipProbeDependencies = {
  repository: ProbeRepository;
  providerAdapter: ReadOnlyProviderAdapter;
};

function unknown(): StagingProviderOwnershipProbeResult {
  return { classification: "UNKNOWN" };
}

function isCurrentUsersSealedOperation(operation: Operation | null, userId: string): operation is Operation {
  return Boolean(
    operation &&
      operation.user_id === userId &&
      operation.snapshot_status === "succeeded" &&
      operation.destructive_started_at === null
  );
}

function getExactSealedProviderTarget(
  targets: Target[],
  operationId: string,
  userId: string
): (Target & { provider_resource_id: string }) | null {
  const providerTargets = targets.filter((target) => target.target_kind === "provider_voice");

  if (providerTargets.length !== 1) {
    return null;
  }

  const target = providerTargets[0];
  if (
    target.operation_id !== operationId ||
    target.user_id !== userId ||
    target.provider_name !== "elevenlabs" ||
    typeof target.provider_resource_id !== "string" ||
    target.provider_resource_id.length === 0
  ) {
    return null;
  }

  return target as Target & { provider_resource_id: string };
}

function mapProviderResult(
  result: Awaited<ReturnType<ReadOnlyProviderAdapter["reconcileVoiceAbsence"]>>
): StagingProviderOwnershipProbeResult {
  switch (result.kind) {
    case "present":
      if (result.ownerSignal === "true") {
        return { classification: "TARGET_PRESENT_AND_READABLE" };
      }
      return result.ownerSignal === "false"
        ? { classification: "AUTHORIZATION_REJECTED" }
        : unknown();
    case "verified_absent":
      return { classification: "VOICE_NOT_FOUND" };
    case "auth_failed":
      return { classification: "AUTHENTICATION_REJECTED" };
    case "permission_denied":
      return { classification: "AUTHORIZATION_REJECTED" };
    case "provider_rejected":
      return { classification: "PROVIDER_REJECTED" };
    default:
      return unknown();
  }
}

function createDefaultDependencies(): StagingProviderOwnershipProbeDependencies {
  return {
    repository: createVoiceDeletionRepository(),
    providerAdapter: createElevenLabsVoiceDeletionProviderAdapter()
  };
}

/**
 * Read-only, B7-specific diagnostic boundary. It deliberately accepts only the
 * authenticated user's identity and never creates, advances, or changes a durable target.
 */
export async function probeStagingProviderOwnership(
  userId: string,
  provided?: StagingProviderOwnershipProbeDependencies
): Promise<StagingProviderOwnershipProbeResult> {
  const dependencies = provided ?? createDefaultDependencies();
  const operation = await dependencies.repository.getActiveOperation(userId);

  if (!isCurrentUsersSealedOperation(operation, userId)) {
    return unknown();
  }

  const target = getExactSealedProviderTarget(
    await dependencies.repository.listOperationTargets(operation.id, userId),
    operation.id,
    userId
  );

  if (!target) {
    return unknown();
  }

  return mapProviderResult(
    await dependencies.providerAdapter.reconcileVoiceAbsence({
      providerResourceId: target.provider_resource_id
    })
  );
}
