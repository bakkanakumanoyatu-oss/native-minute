import "server-only";

import { randomUUID } from "node:crypto";
import type { ReconcileVoiceAbsenceResult, VoiceDeletionProviderAdapter } from "@/providers/voice-deletion";
import type {
  AccountDeletionProviderDeleteResult,
  AccountDeletionProviderDurableRepository,
  AccountDeletionProviderReconciliationResult
} from "./account-deletion-provider-durable.repository";

const DEFAULT_LEASE_SECONDS = 60;
const RETRY_BASE_SECONDS = 5;
const RETRY_CAP_SECONDS = 300;

type AccountDeletionProviderStepInput = {
  deletionRequestId: string;
  userId: string;
};

export type AccountDeletionProviderStepResult =
  | { kind: "progressed" }
  | { kind: "retry_later" }
  | { kind: "manual_required" }
  | { kind: "target_verified" }
  | { kind: "provider_stage_finalized"; status: "succeeded" | "not_needed" }
  | { kind: "already_finalized"; status: "succeeded" | "not_needed" }
  | { kind: "busy" }
  | { kind: "not_runnable" }
  | { kind: "stale_result" };

export type AccountDeletionProviderStepDependencies = {
  repository: AccountDeletionProviderDurableRepository;
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
  return ["rate_limited", "provider_unavailable", "timeout", "network_error", "protocol_error"].includes(
    result.kind
  );
}

function hasExactSealedUniverse(
  targets: Awaited<ReturnType<AccountDeletionProviderDurableRepository["listProviderTargets"]>>,
  deletionRequestId: string,
  userId: string,
  expectedTargetCount: number
) {
  if (targets.length !== expectedTargetCount) {
    return false;
  }

  const ids = new Set<string>();
  const sourceVoiceIds = new Set<string>();
  const providerResourceIds = new Set<string>();
  const fingerprints = new Set<string>();

  return targets.every((target) => {
    if (
      target.deletion_request_id !== deletionRequestId ||
      target.user_id !== userId ||
      target.provider_name !== "elevenlabs" ||
      !target.source_voice_id ||
      !target.provider_resource_id ||
      !target.target_fingerprint ||
      ids.has(target.id) ||
      sourceVoiceIds.has(target.source_voice_id) ||
      providerResourceIds.has(target.provider_resource_id) ||
      fingerprints.has(target.target_fingerprint)
    ) {
      return false;
    }

    ids.add(target.id);
    sourceVoiceIds.add(target.source_voice_id);
    providerResourceIds.add(target.provider_resource_id);
    fingerprints.add(target.target_fingerprint);
    return true;
  });
}

function toDeleteResult(input: {
  deletionRequestId: string;
  userId: string;
  targetId: string;
  leaseToken: string;
  expectedRunnerAttemptCount: number;
  expectedDeleteAttemptCount: number;
  result: { kind: string };
  random: () => number;
}): AccountDeletionProviderDeleteResult {
  return {
    deletionRequestId: input.deletionRequestId,
    userId: input.userId,
    targetId: input.targetId,
    leaseToken: input.leaseToken,
    expectedRunnerAttemptCount: input.expectedRunnerAttemptCount,
    expectedDeleteAttemptCount: input.expectedDeleteAttemptCount,
    result: input.result.kind as AccountDeletionProviderDeleteResult["result"],
    retryDelaySeconds: isTransient(input.result)
      ? retryDelaySeconds(input.expectedDeleteAttemptCount, input.random)
      : 0
  };
}

function toReconciliationResult(input: {
  deletionRequestId: string;
  userId: string;
  targetId: string;
  leaseToken: string;
  expectedRunnerAttemptCount: number;
  expectedReconciliationAttemptCount: number;
  result: ReconcileVoiceAbsenceResult;
  random: () => number;
}): AccountDeletionProviderReconciliationResult {
  return {
    deletionRequestId: input.deletionRequestId,
    userId: input.userId,
    targetId: input.targetId,
    leaseToken: input.leaseToken,
    expectedRunnerAttemptCount: input.expectedRunnerAttemptCount,
    expectedReconciliationAttemptCount: input.expectedReconciliationAttemptCount,
    result: input.result.kind,
    ownerSignal: input.result.kind === "present" ? input.result.ownerSignal : null,
    retryDelaySeconds: isTransient(input.result)
      ? retryDelaySeconds(input.expectedReconciliationAttemptCount, input.random)
      : 0
  };
}

/**
 * Executes at most one external provider action for one exact sealed target.
 * A durable generation-1 DELETE authority always precedes the sole automatic
 * DELETE call. Every later invocation is GET-only until strict absence or manual.
 */
export async function runAccountDeletionProviderDurableStep(
  input: AccountDeletionProviderStepInput,
  dependencies: AccountDeletionProviderStepDependencies
): Promise<AccountDeletionProviderStepResult> {
  const request = await dependencies.repository.getRequestForOwner(input.deletionRequestId, input.userId);

  if (!request) {
    return { kind: "not_runnable" };
  }
  if (
    request.provider_sub_finalized_at &&
    (request.provider_cleanup_status === "succeeded" || request.provider_cleanup_status === "not_needed")
  ) {
    return { kind: "already_finalized", status: request.provider_cleanup_status };
  }
  if (request.provider_cleanup_status === "manual_required") {
    return { kind: "manual_required" };
  }
  if (
    request.provider_snapshot_version !== "g5d-2a.account-provider.v1" ||
    request.provider_snapshot_status !== "sealed" ||
    request.provider_snapshot_seal_version !== 1 ||
    !request.provider_snapshot_sealed_at ||
    !["confirmed", "provider_cleanup_failed"].includes(request.status) ||
    !["pending", "failed"].includes(request.provider_cleanup_status)
  ) {
    return { kind: "not_runnable" };
  }

  const leaseToken = (dependencies.createLeaseToken ?? randomUUID)();
  const now = dependencies.now ?? (() => new Date());
  const random = dependencies.random ?? Math.random;
  const lease = await dependencies.repository.claimProviderLease({
    deletionRequestId: input.deletionRequestId,
    userId: input.userId,
    leaseToken,
    leaseSeconds: dependencies.leaseSeconds ?? DEFAULT_LEASE_SECONDS
  });

  if (!lease) {
    return { kind: "busy" };
  }

  try {
    const targets = await dependencies.repository.listProviderTargets(input.deletionRequestId, input.userId);

    if (
      !hasExactSealedUniverse(
        targets,
        input.deletionRequestId,
        input.userId,
        lease.provider_snapshot_target_count
      )
    ) {
      return { kind: "not_runnable" };
    }

    if (targets.some((target) => target.status === "manual_required")) {
      return { kind: "manual_required" };
    }

    const allVerified = targets.every(
      (target) => target.status === "verified_absent" && target.reconciliation_status === "verified_absent"
    );

    if (allVerified) {
      const finalized = await dependencies.repository.finalizeProviderStage({
        deletionRequestId: input.deletionRequestId,
        userId: input.userId,
        leaseToken,
        expectedRunnerAttemptCount: lease.provider_runner_attempt_count
      });

      if (!finalized) {
        return { kind: "stale_result" };
      }

      return finalized.provider_cleanup_status === "not_needed"
        ? { kind: "provider_stage_finalized", status: "not_needed" }
        : { kind: "provider_stage_finalized", status: "succeeded" };
    }

    const target = targets.find(
      (candidate) => candidate.status !== "verified_absent" && candidate.status !== "manual_required"
    );

    if (!target || target.provider_name !== "elevenlabs" || !target.provider_resource_id) {
      return { kind: "not_runnable" };
    }
    if (isFuture(target.next_retry_at, now())) {
      return { kind: "retry_later" };
    }

    const mustReconcile =
      target.status === "deleted" ||
      (target.status === "delete_requested" && ["pending", "unavailable"].includes(target.reconciliation_status));

    if (mustReconcile) {
      const begun = await dependencies.repository.beginReconciliationAttempt({
        deletionRequestId: input.deletionRequestId,
        userId: input.userId,
        targetId: target.id,
        leaseToken,
        expectedRunnerAttemptCount: lease.provider_runner_attempt_count,
        expectedReconciliationAttemptCount: target.reconciliation_attempt_count
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
        providerResult = { kind: "network_error" };
      }

      const recorded = await dependencies.repository.recordReconciliationResult(
        toReconciliationResult({
          deletionRequestId: input.deletionRequestId,
          userId: input.userId,
          targetId: target.id,
          leaseToken,
          expectedRunnerAttemptCount: lease.provider_runner_attempt_count,
          expectedReconciliationAttemptCount: begun.reconciliation_attempt_count,
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
        return { kind: "target_verified" };
      }

      return isTransient(providerResult) ? { kind: "retry_later" } : { kind: "progressed" };
    }

    const canDelete = target.status === "pending" && target.delete_attempt_count === 0;

    if (!canDelete) {
      return { kind: "not_runnable" };
    }

    const begun = await dependencies.repository.beginDeleteAttempt({
      deletionRequestId: input.deletionRequestId,
      userId: input.userId,
      targetId: target.id,
      leaseToken,
      expectedRunnerAttemptCount: lease.provider_runner_attempt_count,
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
      providerResult = await dependencies.providerAdapter.deleteVoice({
        providerResourceId: target.provider_resource_id
      });
    } catch {
      return { kind: "retry_later" };
    }

    const recorded = await dependencies.repository.recordDeleteResult(
      toDeleteResult({
        deletionRequestId: input.deletionRequestId,
        userId: input.userId,
        targetId: target.id,
        leaseToken,
        expectedRunnerAttemptCount: lease.provider_runner_attempt_count,
        expectedDeleteAttemptCount: begun.delete_attempt_count,
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

    return isTransient(providerResult) ? { kind: "retry_later" } : { kind: "progressed" };
  } finally {
    await dependencies.repository.releaseProviderLease({
      deletionRequestId: input.deletionRequestId,
      userId: input.userId,
      leaseToken
    });
  }
}
