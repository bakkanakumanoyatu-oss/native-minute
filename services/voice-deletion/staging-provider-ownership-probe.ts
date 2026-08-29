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
  evidence: StagingProviderOwnershipProbeEvidence;
};

/**
 * Closed, privacy-safe diagnostic categories for the Staging-only probe. They
 * describe the adapter's normalized result without retaining provider payloads
 * or identifiers.
 */
export type StagingProviderOwnershipProbeEvidence = {
  adapterKind: "elevenlabs_voice_deletion_reconciliation" | "not_called" | "unavailable";
  adapterOutcome:
    | "present_owner_true"
    | "present_owner_false"
    | "present_owner_unknown"
    | "verified_absent"
    | "auth_failed"
    | "permission_denied"
    | "provider_rejected"
    | "credential_missing"
    | "invalid_provider_reference"
    | "rate_limited"
    | "provider_unavailable"
    | "timeout"
    | "network_error"
    | "protocol_error"
    | "not_called"
    | "unavailable";
  mapperBranch:
    | "present_readable"
    | "present_not_authorized"
    | "verified_absent"
    | "authentication_rejected"
    | "authorization_rejected"
    | "provider_rejected"
    | "ambiguous_provider_result"
    | "sealed_target_unavailable"
    | "route_probe_failure";
};

export type StagingProviderOwnershipProbeDependencies = {
  repository: ProbeRepository;
  providerAdapter: ReadOnlyProviderAdapter;
};

function unknown(): StagingProviderOwnershipProbeResult {
  return {
    classification: "UNKNOWN",
    evidence: {
      adapterKind: "not_called",
      adapterOutcome: "not_called",
      mapperBranch: "sealed_target_unavailable"
    }
  };
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
        return {
          classification: "TARGET_PRESENT_AND_READABLE",
          evidence: {
            adapterKind: "elevenlabs_voice_deletion_reconciliation",
            adapterOutcome: "present_owner_true",
            mapperBranch: "present_readable"
          }
        };
      }
      if (result.ownerSignal === "false") {
        return {
          classification: "AUTHORIZATION_REJECTED",
          evidence: {
            adapterKind: "elevenlabs_voice_deletion_reconciliation",
            adapterOutcome: "present_owner_false",
            mapperBranch: "present_not_authorized"
          }
        };
      }
      return {
        classification: "TARGET_PRESENT_AND_READABLE",
        evidence: {
          adapterKind: "elevenlabs_voice_deletion_reconciliation",
          adapterOutcome: "present_owner_unknown",
          mapperBranch: "present_readable"
        }
      };
    case "verified_absent":
      return {
        classification: "VOICE_NOT_FOUND",
        evidence: {
          adapterKind: "elevenlabs_voice_deletion_reconciliation",
          adapterOutcome: "verified_absent",
          mapperBranch: "verified_absent"
        }
      };
    case "auth_failed":
      return {
        classification: "AUTHENTICATION_REJECTED",
        evidence: {
          adapterKind: "elevenlabs_voice_deletion_reconciliation",
          adapterOutcome: "auth_failed",
          mapperBranch: "authentication_rejected"
        }
      };
    case "permission_denied":
      return {
        classification: "AUTHORIZATION_REJECTED",
        evidence: {
          adapterKind: "elevenlabs_voice_deletion_reconciliation",
          adapterOutcome: "permission_denied",
          mapperBranch: "authorization_rejected"
        }
      };
    case "provider_rejected":
      return {
        classification: "PROVIDER_REJECTED",
        evidence: {
          adapterKind: "elevenlabs_voice_deletion_reconciliation",
          adapterOutcome: "provider_rejected",
          mapperBranch: "provider_rejected"
        }
      };
    default:
      return {
        classification: "UNKNOWN",
        evidence: {
          adapterKind: "elevenlabs_voice_deletion_reconciliation",
          adapterOutcome: result.kind,
          mapperBranch: "ambiguous_provider_result"
        }
      };
  }
}

export function unavailableProbeResult(): StagingProviderOwnershipProbeResult {
  return {
    classification: "UNKNOWN",
    evidence: {
      adapterKind: "unavailable",
      adapterOutcome: "unavailable",
      mapperBranch: "route_probe_failure"
    }
  };
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
