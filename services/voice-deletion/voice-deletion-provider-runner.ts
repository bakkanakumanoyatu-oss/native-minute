import "server-only";
import { randomUUID } from "node:crypto";
import type { ReconcileVoiceAbsenceResult, VoiceDeletionProviderAdapter } from "@/providers/voice-deletion";
import type {
  ProviderVoiceDeleteResult,
  ProviderVoiceReconciliationResult,
  VoiceDeletionRepository
} from "./voice-deletion.repository";

const DEFAULT_LEASE_SECONDS = 60;
const MAX_DELETE_SUBMISSIONS = 3;
const MAX_RECONCILIATION_ATTEMPTS = 5;
const RETRY_BASE_SECONDS = 5;
const RETRY_CAP_SECONDS = 300;

type ProviderStepInput = {
  operationId: string;
  userId: string;
};

type ProviderStepResult =
  | { kind: "progressed" }
  | { kind: "retry_later" }
  | { kind: "manual_required" }
  | { kind: "target_verified" }
  | { kind: "provider_stage_complete" }
  | { kind: "busy" }
  | { kind: "not_runnable" }
  | { kind: "stale_result" };

type ProviderStepDependencies = {
  repository: VoiceDeletionRepository;
  providerAdapter: VoiceDeletionProviderAdapter;
  leaseSeconds?: number;
  createLeaseToken?: () => string;
  random?: () => number;
  now?: () => Date;
};

function isFuture(value: string | null, now: Date) {
  return value !== null && Number.isFinite(Date.parse(value)) && Date.parse(value) > now.getTime();
}

function retryDelaySeconds(attemptCount: number, random: () => number) {
  const cap = Math.min(RETRY_CAP_SECONDS, RETRY_BASE_SECONDS * 2 ** Math.max(0, attemptCount - 1));
  return Math.max(1, Math.floor(Math.min(0.999_999, Math.max(0, random())) * cap) + 1);
}

function isTransient(result: { kind: string }) {
  return ["rate_limited", "provider_unavailable", "timeout", "network_error", "protocol_error"].includes(result.kind);
}

function toDeleteResult(input: {
  operationId: string;
  userId: string;
  targetId: string;
  leaseToken: string;
  expectedDeleteAttemptCount: number;
  result: { kind: string };
  random: () => number;
}): ProviderVoiceDeleteResult {
  return {
    operationId: input.operationId,
    userId: input.userId,
    targetId: input.targetId,
    leaseToken: input.leaseToken,
    expectedDeleteAttemptCount: input.expectedDeleteAttemptCount,
    result: input.result.kind as ProviderVoiceDeleteResult["result"],
    retryDelaySeconds: isTransient(input.result) ? retryDelaySeconds(input.expectedDeleteAttemptCount, input.random) : 0
  };
}

function toReconciliationResult(input: {
  operationId: string;
  userId: string;
  targetId: string;
  leaseToken: string;
  expectedVerificationAttemptCount: number;
  result: ReconcileVoiceAbsenceResult;
  random: () => number;
}): ProviderVoiceReconciliationResult {
  return {
    operationId: input.operationId,
    userId: input.userId,
    targetId: input.targetId,
    leaseToken: input.leaseToken,
    expectedVerificationAttemptCount: input.expectedVerificationAttemptCount,
    result: input.result.kind,
    ownerSignal: input.result.kind === "present" ? input.result.ownerSignal : null,
    retryDelaySeconds: isTransient(input.result)
      ? retryDelaySeconds(input.expectedVerificationAttemptCount, input.random)
      : 0
  };
}

function isProviderStageRunnable(operation: {
  status: string;
  current_stage: string | null;
  snapshot_status: string;
  consent_withdrawal_status: string;
}) {
  return (
    ["processing", "partial_failure"].includes(operation.status) &&
    operation.current_stage === "provider_cleanup" &&
    operation.snapshot_status === "succeeded" &&
    ["succeeded", "not_needed"].includes(operation.consent_withdrawal_status)
  );
}

function isProviderStageComplete(targets: Array<{ target_kind: string; status: string }>) {
  const providerTargets = targets.filter((target) => target.target_kind === "provider_voice");
  return providerTargets.length > 0 && providerTargets.every((target) => target.status === "verified_absent");
}

/**
 * Runs at most one external provider request for one durable provider_voice target.
 * The caller supplies only server-owned operation/user identifiers; provider locators and
 * lease tokens remain inside the repository/runner boundary.
 */
export async function runVoiceDeletionProviderStep(
  input: ProviderStepInput,
  dependencies: ProviderStepDependencies
): Promise<ProviderStepResult> {
  const leaseToken = (dependencies.createLeaseToken ?? randomUUID)();
  const now = dependencies.now ?? (() => new Date());
  const random = dependencies.random ?? Math.random;
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
    if (!isProviderStageRunnable(lease)) {
      return { kind: "not_runnable" };
    }

    if (isFuture(lease.next_retry_at, now())) {
      return { kind: "retry_later" };
    }

    const targets = await dependencies.repository.listOperationTargets(input.operationId, input.userId);
    if (targets.some((target) => target.target_kind === "provider_voice" && target.status === "manual_required")) {
      return { kind: "manual_required" };
    }
    if (isProviderStageComplete(targets)) {
      return { kind: "provider_stage_complete" };
    }

    const target = targets.find(
      (candidate) =>
        candidate.target_kind === "provider_voice" &&
        candidate.provider_name === "elevenlabs" &&
        candidate.status !== "verified_absent" &&
        candidate.status !== "manual_required"
    );

    if (!target || !target.provider_resource_id) {
      return { kind: "not_runnable" };
    }

    const mustReconcile =
      target.status === "deleted" ||
      (target.status === "delete_requested" && ["pending", "unavailable"].includes(target.reconciliation_status));

    if (mustReconcile) {
      if (target.verification_attempt_count >= MAX_RECONCILIATION_ATTEMPTS) {
        const exhausted = await dependencies.repository.beginProviderVoiceReconciliationAttempt({
          operationId: input.operationId,
          userId: input.userId,
          targetId: target.id,
          leaseToken,
          expectedVerificationAttemptCount: target.verification_attempt_count
        });
        return exhausted?.status === "manual_required" ? { kind: "manual_required" } : { kind: "stale_result" };
      }

      const begun = await dependencies.repository.beginProviderVoiceReconciliationAttempt({
        operationId: input.operationId,
        userId: input.userId,
        targetId: target.id,
        leaseToken,
        expectedVerificationAttemptCount: target.verification_attempt_count
      });
      if (!begun) {
        return { kind: "stale_result" };
      }
      if (begun.status === "manual_required") {
        return { kind: "manual_required" };
      }

      let providerResult: ReconcileVoiceAbsenceResult;
      try {
        providerResult = await dependencies.providerAdapter.reconcileVoiceAbsence({
          providerResourceId: target.provider_resource_id
        });
      } catch {
        // The begin transition remains durable; the next invocation will reconcile first.
        return { kind: "retry_later" };
      }

      const recorded = await dependencies.repository.recordProviderVoiceReconciliationResult(
        toReconciliationResult({
          operationId: input.operationId,
          userId: input.userId,
          targetId: target.id,
          leaseToken,
          expectedVerificationAttemptCount: begun.verification_attempt_count,
          result: providerResult,
          random
        })
      );
      if (!recorded) {
        return { kind: "stale_result" };
      }
      if (recorded.status === "manual_required") {
        return { kind: "manual_required" };
      }
      if (recorded.status === "verified_absent") {
        const updated = await dependencies.repository.listOperationTargets(input.operationId, input.userId);
        return isProviderStageComplete(updated) ? { kind: "provider_stage_complete" } : { kind: "target_verified" };
      }
      return isTransient(providerResult) ? { kind: "retry_later" } : { kind: "progressed" };
    }

    const canDelete =
      (target.status === "pending" && target.delete_attempt_count === 0) ||
      (target.status === "delete_requested" && target.reconciliation_status === "present");
    if (!canDelete) {
      return { kind: "not_runnable" };
    }
    if (target.delete_attempt_count >= MAX_DELETE_SUBMISSIONS) {
      const exhausted = await dependencies.repository.beginProviderVoiceDeleteAttempt({
        operationId: input.operationId,
        userId: input.userId,
        targetId: target.id,
        leaseToken,
        expectedDeleteAttemptCount: target.delete_attempt_count
      });
      return exhausted?.status === "manual_required" ? { kind: "manual_required" } : { kind: "stale_result" };
    }

    const begun = await dependencies.repository.beginProviderVoiceDeleteAttempt({
      operationId: input.operationId,
      userId: input.userId,
      targetId: target.id,
      leaseToken,
      expectedDeleteAttemptCount: target.delete_attempt_count
    });
    if (!begun) {
      return { kind: "stale_result" };
    }
    if (begun.status === "manual_required") {
      return { kind: "manual_required" };
    }

    let providerResult: Awaited<ReturnType<VoiceDeletionProviderAdapter["deleteVoice"]>>;
    try {
      providerResult = await dependencies.providerAdapter.deleteVoice({ providerResourceId: target.provider_resource_id });
    } catch {
      // A process failure after the durable begin must never cause a blind re-DELETE.
      return { kind: "retry_later" };
    }

    const recorded = await dependencies.repository.recordProviderVoiceDeleteResult(
      toDeleteResult({
        operationId: input.operationId,
        userId: input.userId,
        targetId: target.id,
        leaseToken,
        expectedDeleteAttemptCount: begun.delete_attempt_count,
        result: providerResult,
        random
      })
    );
    if (!recorded) {
      return { kind: "stale_result" };
    }
    return recorded.status === "manual_required"
      ? { kind: "manual_required" }
      : isTransient(providerResult)
        ? { kind: "retry_later" }
        : { kind: "progressed" };
  } finally {
    await dependencies.repository.releaseLease({ operationId: input.operationId, userId: input.userId, leaseToken });
  }
}
