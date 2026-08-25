import "server-only";
import { randomUUID } from "node:crypto";
import type { VoiceDeletionRepository } from "./voice-deletion.repository";

const DEFAULT_LEASE_SECONDS = 60;

type PostDeleteVerificationInput = {
  operationId: string;
  userId: string;
};

export type VoiceDeletionPostDeleteVerificationStepResult =
  | { kind: "stage_entered" }
  | { kind: "verification_succeeded" }
  | { kind: "manual_required" }
  | { kind: "ready_for_finalization" }
  | { kind: "busy" }
  | { kind: "not_runnable" }
  | { kind: "stale_result" };

type Dependencies = {
  repository: VoiceDeletionRepository;
  leaseSeconds?: number;
  createLeaseToken?: () => string;
};

/**
 * Runs exactly one local B5 verification transition. It never calls a provider,
 * Storage adapter, or the guarded finalizer.
 */
export async function runVoiceDeletionPostDeleteVerificationStep(
  input: PostDeleteVerificationInput,
  dependencies: Dependencies
): Promise<VoiceDeletionPostDeleteVerificationStepResult> {
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
    if (lease.status === "manual_required" || lease.post_delete_verification_status === "manual_required") {
      return { kind: "manual_required" };
    }

    if (lease.current_stage === "database_cleanup") {
      const entered = await dependencies.repository.enterPostDeleteVerificationStage({
        operationId: input.operationId,
        userId: input.userId,
        leaseToken,
        expectedRunnerAttemptCount: lease.runner_attempt_count
      });
      return entered ? { kind: "stage_entered" } : { kind: "stale_result" };
    }

    if (
      lease.current_stage === "post_delete_verification" &&
      lease.status === "processing" &&
      lease.post_delete_verification_status === "processing"
    ) {
      const completed = await dependencies.repository.completePostDeleteVerification({
        operationId: input.operationId,
        userId: input.userId,
        leaseToken,
        expectedRunnerAttemptCount: lease.runner_attempt_count
      });

      if (!completed) {
        return { kind: "stale_result" };
      }
      return completed.status === "manual_required"
        ? { kind: "manual_required" }
        : completed.post_delete_verification_status === "succeeded"
          ? { kind: "verification_succeeded" }
          : { kind: "stale_result" };
    }

    if (
      lease.current_stage === "post_delete_verification" &&
      lease.status === "processing" &&
      lease.post_delete_verification_status === "succeeded"
    ) {
      return { kind: "ready_for_finalization" };
    }

    return { kind: "not_runnable" };
  } finally {
    await dependencies.repository.releaseLease({ operationId: input.operationId, userId: input.userId, leaseToken });
  }
}
