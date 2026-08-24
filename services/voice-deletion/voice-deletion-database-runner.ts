import "server-only";
import { randomUUID } from "node:crypto";
import type { VoiceDeletionRepository } from "./voice-deletion.repository";

const DEFAULT_LEASE_SECONDS = 60;
const DATABASE_TARGET_KINDS = ["saved_model_audio", "script_audio", "voice_binding"] as const;

type DatabaseStepInput = {
  operationId: string;
  userId: string;
};

export type VoiceDeletionDatabaseStepResult =
  | { kind: "stage_entered" }
  | { kind: "database_cleanup_completed" }
  | { kind: "database_stage_complete" }
  | { kind: "manual_required" }
  | { kind: "busy" }
  | { kind: "not_runnable" }
  | { kind: "stale_result" };

type DatabaseStepDependencies = {
  repository: VoiceDeletionRepository;
  leaseSeconds?: number;
  createLeaseToken?: () => string;
};

function isDatabaseStageComplete(
  targets: Array<{ target_kind: string; status: string; verification_status: string; reconciliation_status: string }>
) {
  return targets
    .filter((target) => DATABASE_TARGET_KINDS.includes(target.target_kind as (typeof DATABASE_TARGET_KINDS)[number]))
    .every(
      (target) =>
        target.status === "verified_absent" &&
        target.verification_status === "verified_absent" &&
        target.reconciliation_status === "not_applicable"
    );
}

/**
 * Runs one B4 database-only transition. It does not enter post-delete verification,
 * invoke a finalizer, or call a provider or Storage adapter.
 */
export async function runVoiceDeletionDatabaseStep(
  input: DatabaseStepInput,
  dependencies: DatabaseStepDependencies
): Promise<VoiceDeletionDatabaseStepResult> {
  const leaseToken = (dependencies.createLeaseToken ?? randomUUID)();
  const lease = await dependencies.repository.claimExpiredOrAvailableLease({
    operationId: input.operationId,
    userId: input.userId,
    leaseToken,
    leaseSeconds: dependencies.leaseSeconds ?? DEFAULT_LEASE_SECONDS
  });

  if (!lease) {
    return { kind: "busy" };
  }

  try {
    if (lease.status === "manual_required") {
      return { kind: "manual_required" };
    }

    if (lease.current_stage === "storage_cleanup") {
      const entered = await dependencies.repository.enterDatabaseCleanupStage({
        operationId: input.operationId,
        userId: input.userId,
        leaseToken,
        expectedRunnerAttemptCount: lease.runner_attempt_count
      });
      return entered ? { kind: "stage_entered" } : { kind: "stale_result" };
    }

    if (
      lease.current_stage !== "database_cleanup" ||
      !["processing", "partial_failure"].includes(lease.status) ||
      !["succeeded", "not_needed"].includes(lease.consent_withdrawal_status)
    ) {
      return { kind: "not_runnable" };
    }

    const targets = await dependencies.repository.listOperationTargets(input.operationId, input.userId);
    if (targets.some((target) => target.status === "manual_required")) {
      return { kind: "manual_required" };
    }
    if (isDatabaseStageComplete(targets)) {
      return { kind: "database_stage_complete" };
    }

    const cleaned = await dependencies.repository.cleanupDatabaseTargets({
      operationId: input.operationId,
      userId: input.userId,
      leaseToken,
      expectedRunnerAttemptCount: lease.runner_attempt_count
    });
    return cleaned
      ? cleaned.status === "manual_required"
        ? { kind: "manual_required" }
        : { kind: "database_cleanup_completed" }
      : { kind: "stale_result" };
  } finally {
    await dependencies.repository.releaseLease({ operationId: input.operationId, userId: input.userId, leaseToken });
  }
}
