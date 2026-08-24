import "server-only";
import { randomUUID } from "node:crypto";
import type {
  StorageObjectDeleteResult as StorageAdapterDeleteResult,
  StorageObjectVerificationResult as StorageAdapterVerificationResult,
  VoiceDeletionStorageAdapter
} from "./voice-deletion-storage-adapter";
import type {
  StorageObjectTargetKind,
  StorageObjectDeleteResult as StorageDeleteResultInput,
  StorageObjectVerificationResult as StorageVerificationResultInput,
  VoiceDeletionRepository
} from "./voice-deletion.repository";

const DEFAULT_LEASE_SECONDS = 60;
const MAX_DELETE_SUBMISSIONS = 3;
const MAX_VERIFICATION_ATTEMPTS = 5;
const RETRY_BASE_SECONDS = 5;
const RETRY_CAP_SECONDS = 300;

const STORAGE_TARGET_KINDS = ["voice_sample", "voice_consent_recording", "script_audio_storage"] as const;

type StorageStepInput = {
  operationId: string;
  userId: string;
};

export type VoiceDeletionStorageStepResult =
  | { kind: "stage_entered" }
  | { kind: "progressed" }
  | { kind: "retry_later" }
  | { kind: "manual_required" }
  | { kind: "target_verified" }
  | { kind: "storage_stage_complete" }
  | { kind: "busy" }
  | { kind: "not_runnable" }
  | { kind: "stale_result" };

type StorageStepDependencies = {
  repository: VoiceDeletionRepository;
  storageAdapter: VoiceDeletionStorageAdapter;
  leaseSeconds?: number;
  createLeaseToken?: () => string;
  random?: () => number;
  now?: () => Date;
};

function isStorageTargetKind(value: string): value is StorageObjectTargetKind {
  return (STORAGE_TARGET_KINDS as readonly string[]).includes(value);
}

function isFuture(value: string | null, now: Date) {
  return value !== null && Number.isFinite(Date.parse(value)) && Date.parse(value) > now.getTime();
}

function retryDelaySeconds(attemptCount: number, random: () => number) {
  const cap = Math.min(RETRY_CAP_SECONDS, RETRY_BASE_SECONDS * 2 ** Math.max(0, attemptCount - 1));
  return Math.max(1, Math.floor(Math.min(0.999_999, Math.max(0, random())) * cap) + 1);
}

function isTransientDelete(result: StorageAdapterDeleteResult) {
  return ["timed_out", "rate_limited", "unavailable", "network_error", "protocol_error"].includes(result.kind);
}

function isTransientVerification(result: StorageAdapterVerificationResult) {
  return ["timed_out", "rate_limited", "unavailable", "network_error"].includes(result.kind);
}

function isStorageStageComplete(
  targets: Array<{
    target_kind: string;
    status: string;
    delete_attempt_count: number;
    verification_status: string;
    reconciliation_status: string;
  }>
) {
  const storageTargets = targets.filter((target) => isStorageTargetKind(target.target_kind));
  return storageTargets.every(
    (target) =>
      target.status === "verified_absent" &&
      target.delete_attempt_count >= 1 &&
      target.verification_status === "verified_absent" &&
      target.reconciliation_status === "not_applicable"
  );
}

function toDeleteResult(input: {
  operationId: string;
  userId: string;
  targetId: string;
  leaseToken: string;
  expectedDeleteAttemptCount: number;
  result: StorageAdapterDeleteResult;
  random: () => number;
}): StorageDeleteResultInput {
  return {
    operationId: input.operationId,
    userId: input.userId,
    targetId: input.targetId,
    leaseToken: input.leaseToken,
    expectedDeleteAttemptCount: input.expectedDeleteAttemptCount,
    result: input.result.kind,
    retryDelaySeconds: isTransientDelete(input.result)
      ? retryDelaySeconds(input.expectedDeleteAttemptCount, input.random)
      : 0
  };
}

function toVerificationResult(input: {
  operationId: string;
  userId: string;
  targetId: string;
  leaseToken: string;
  expectedVerificationAttemptCount: number;
  result: StorageAdapterVerificationResult;
  random: () => number;
}): StorageVerificationResultInput {
  return {
    operationId: input.operationId,
    userId: input.userId,
    targetId: input.targetId,
    leaseToken: input.leaseToken,
    expectedVerificationAttemptCount: input.expectedVerificationAttemptCount,
    result: input.result.kind,
    retryDelaySeconds: isTransientVerification(input.result)
      ? retryDelaySeconds(input.expectedVerificationAttemptCount, input.random)
      : 0
  };
}

function isStorageStageRunnable(operation: { status: string; current_stage: string | null; snapshot_status: string }) {
  return (
    ["processing", "partial_failure"].includes(operation.status) &&
    operation.current_stage === "storage_cleanup" &&
    operation.snapshot_status === "succeeded"
  );
}

/**
 * Runs a single durable B3 Storage step. Exactly one invocation may enter the stage,
 * remove one object, verify one object, or make no external Storage request.
 */
export async function runVoiceDeletionStorageStep(
  input: StorageStepInput,
  dependencies: StorageStepDependencies
): Promise<VoiceDeletionStorageStepResult> {
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
    if (lease.current_stage === "provider_cleanup") {
      if (lease.status === "manual_required") {
        return { kind: "manual_required" };
      }
      if (isFuture(lease.next_retry_at, now())) {
        return { kind: "retry_later" };
      }
      const entered = await dependencies.repository.enterStorageCleanupStage({
        operationId: input.operationId,
        userId: input.userId,
        leaseToken,
        expectedRunnerAttemptCount: lease.runner_attempt_count
      });
      return entered ? { kind: "stage_entered" } : { kind: "stale_result" };
    }

    if (lease.current_stage === "storage_cleanup" && lease.status === "manual_required") {
      return { kind: "manual_required" };
    }
    if (!isStorageStageRunnable(lease)) {
      return { kind: "not_runnable" };
    }
    if (isFuture(lease.next_retry_at, now())) {
      return { kind: "retry_later" };
    }

    const targets = await dependencies.repository.listOperationTargets(input.operationId, input.userId);
    const storageTargets = targets.filter((target) => isStorageTargetKind(target.target_kind));
    if (storageTargets.some((target) => target.status === "manual_required")) {
      return { kind: "manual_required" };
    }
    if (isStorageStageComplete(storageTargets)) {
      const current = await dependencies.repository.getOperationForUser(input.operationId, input.userId);
      return current?.next_retry_at === null && current.current_stage === "storage_cleanup"
        ? { kind: "storage_stage_complete" }
        : { kind: "not_runnable" };
    }

    const target = storageTargets.find((candidate) => candidate.status !== "verified_absent" && candidate.status !== "manual_required");
    if (!target || !isStorageTargetKind(target.target_kind) || !target.storage_object_key) {
      return { kind: "not_runnable" };
    }

    const mustVerify =
      target.status === "deleted" ||
      (target.status === "delete_requested" && ["pending", "unavailable"].includes(target.verification_status));
    if (mustVerify) {
      const begun = await dependencies.repository.beginStorageObjectVerificationAttempt({
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

      let verification: StorageAdapterVerificationResult;
      try {
        verification = await dependencies.storageAdapter.verifyObjectAbsence({
          targetKind: target.target_kind,
          objectKey: target.storage_object_key
        });
      } catch {
        // The verification intent is durable; a restart must verify again before any delete retry.
        return { kind: "retry_later" };
      }

      const recorded = await dependencies.repository.recordStorageObjectVerificationResult(
        toVerificationResult({
          operationId: input.operationId,
          userId: input.userId,
          targetId: target.id,
          leaseToken,
          expectedVerificationAttemptCount: begun.verification_attempt_count,
          result: verification,
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
        return isStorageStageComplete(updated) ? { kind: "storage_stage_complete" } : { kind: "target_verified" };
      }
      return isTransientVerification(verification) ? { kind: "retry_later" } : { kind: "progressed" };
    }

    const canDelete =
      (target.status === "pending" && target.delete_attempt_count === 0) ||
      (target.status === "delete_requested" && target.verification_status === "present");
    if (!canDelete) {
      return { kind: "not_runnable" };
    }

    const begun = await dependencies.repository.beginStorageObjectDeleteAttempt({
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
    if (!isStorageTargetKind(begun.target_kind) || !begun.storage_object_key) {
      return { kind: "stale_result" };
    }

    let deletion: StorageAdapterDeleteResult;
    try {
      deletion = await dependencies.storageAdapter.deleteObject({
        targetKind: begun.target_kind,
        objectKey: begun.storage_object_key
      });
    } catch {
      // A crash after durable intent never permits a blind second delete; next run verifies first.
      return { kind: "retry_later" };
    }

    const recorded = await dependencies.repository.recordStorageObjectDeleteResult(
      toDeleteResult({
        operationId: input.operationId,
        userId: input.userId,
        targetId: target.id,
        leaseToken,
        expectedDeleteAttemptCount: begun.delete_attempt_count,
        result: deletion,
        random
      })
    );
    if (!recorded) {
      return { kind: "stale_result" };
    }
    return recorded.status === "manual_required"
      ? { kind: "manual_required" }
      : isTransientDelete(deletion)
        ? { kind: "retry_later" }
        : { kind: "progressed" };
  } finally {
    await dependencies.repository.releaseLease({ operationId: input.operationId, userId: input.userId, leaseToken });
  }
}
