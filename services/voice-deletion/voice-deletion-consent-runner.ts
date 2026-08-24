import "server-only";
import { randomUUID } from "node:crypto";
import type { VoiceDeletionRepository } from "./voice-deletion.repository";

const DEFAULT_LEASE_SECONDS = 60;

type ConsentStepInput = {
  operationId: string;
  userId: string;
};

export type VoiceDeletionConsentStepResult =
  | { kind: "consent_snapshot_sealed" }
  | { kind: "consent_withdrawn" }
  | { kind: "provider_stage_reached" }
  | { kind: "manual_required" }
  | { kind: "busy" }
  | { kind: "not_runnable" }
  | { kind: "stale_result" };

type ConsentStepDependencies = {
  repository: VoiceDeletionRepository;
  leaseSeconds?: number;
  createLeaseToken?: () => string;
};

/**
 * Runs exactly one local durable consent transition. It intentionally never calls
 * a provider and never chains snapshot sealing to consent withdrawal.
 */
export async function runVoiceDeletionConsentStep(
  input: ConsentStepInput,
  dependencies: ConsentStepDependencies
): Promise<VoiceDeletionConsentStepResult> {
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

    if (lease.current_stage === "provider_cleanup") {
      return { kind: "provider_stage_reached" };
    }

    if (lease.current_stage === null && lease.snapshot_status === "succeeded") {
      const sealed = await dependencies.repository.sealConsentSnapshot({
        operationId: input.operationId,
        userId: input.userId,
        leaseToken,
        expectedRunnerAttemptCount: lease.runner_attempt_count
      });

      return sealed
        ? sealed.status === "manual_required"
          ? { kind: "manual_required" }
          : { kind: "consent_snapshot_sealed" }
        : { kind: "stale_result" };
    }

    if (
      lease.current_stage === "consent_withdrawal" &&
      lease.consent_withdrawal_status === "processing" &&
      ["processing", "partial_failure"].includes(lease.status)
    ) {
      const withdrawn = await dependencies.repository.withdrawCurrentConsents({
        operationId: input.operationId,
        userId: input.userId,
        leaseToken,
        expectedRunnerAttemptCount: lease.runner_attempt_count
      });

      return withdrawn
        ? withdrawn.status === "manual_required"
          ? { kind: "manual_required" }
          : { kind: "consent_withdrawn" }
        : { kind: "stale_result" };
    }

    return { kind: "not_runnable" };
  } finally {
    await dependencies.repository.releaseLease({ operationId: input.operationId, userId: input.userId, leaseToken });
  }
}
