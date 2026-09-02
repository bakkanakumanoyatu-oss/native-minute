import "server-only";

import { randomUUID } from "node:crypto";
import type {
  AccountDeletionStorageAdapter,
  AccountDeletionStorageDeleteResult as AdapterDeleteResult,
  AccountDeletionStorageInventory,
  AccountDeletionStorageVerificationResult as AdapterVerificationResult
} from "./account-deletion-storage-adapter";
import { ACCOUNT_DELETION_STORAGE_BUCKET_BY_TARGET_KIND } from "./account-deletion-storage-adapter";
import type {
  AccountDeletionStorageDeleteResult,
  AccountDeletionStorageDurableRepository,
  AccountDeletionStorageVerificationResult
} from "./account-deletion-storage-durable.repository";

const DEFAULT_LEASE_SECONDS = 60;
const RETRY_BASE_SECONDS = 5;
const RETRY_CAP_SECONDS = 300;

export type AccountDeletionStorageStepResult =
  | { kind: "progressed" }
  | { kind: "retry_later" }
  | { kind: "manual_required" }
  | { kind: "target_verified" }
  | { kind: "storage_stage_finalized"; status: "succeeded" | "not_needed" }
  | { kind: "already_finalized"; status: "succeeded" | "not_needed" }
  | { kind: "busy" }
  | { kind: "not_runnable" }
  | { kind: "stale_result" };

type StepDependencies = {
  repository: AccountDeletionStorageDurableRepository;
  storageAdapter: AccountDeletionStorageAdapter;
  leaseSeconds?: number;
  createLeaseToken?: () => string;
  random?: () => number;
  now?: () => Date;
};

function inventoriesMatch(left: AccountDeletionStorageInventory, right: AccountDeletionStorageInventory) {
  return Object.values(ACCOUNT_DELETION_STORAGE_BUCKET_BY_TARGET_KIND).every((bucket) => {
    const leftKeys = left[bucket];
    const rightKeys = right[bucket];
    return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index]);
  });
}

/**
 * Starts the durable writer fence, performs two bounded read-only prefix inventories,
 * rejects drift, then lets the focused RPC re-derive DB/write-intent sources and seal
 * the exact immutable universe in one transaction.
 */
export async function sealAccountDeletionStorageSnapshot(
  input: { deletionRequestId: string; userId: string },
  dependencies: Pick<StepDependencies, "repository" | "storageAdapter"> & { createCollectionToken?: () => string }
) {
  const started = await dependencies.repository.beginStorageSnapshot(
    input.deletionRequestId,
    input.userId,
    (dependencies.createCollectionToken ?? randomUUID)()
  );
  if (
    started.storage_snapshot_status !== "collecting" ||
    !started.storage_snapshot_collection_token ||
    started.storage_cleanup_status === "manual_required"
  ) {
    return null;
  }

  const first = await dependencies.storageAdapter.listOwnedInventory(input.userId);
  const second = await dependencies.storageAdapter.listOwnedInventory(input.userId);
  if (!inventoriesMatch(first, second)) {
    return null;
  }

  return dependencies.repository.sealStorageSnapshot({
    deletionRequestId: input.deletionRequestId,
    userId: input.userId,
    collectionToken: started.storage_snapshot_collection_token,
    inventory: second
  });
}

function isFuture(value: string | null, now: Date) {
  return value !== null && Number.isFinite(Date.parse(value)) && Date.parse(value) > now.getTime();
}
function retryDelaySeconds(attemptCount: number, random: () => number) {
  const cap = Math.min(RETRY_CAP_SECONDS, RETRY_BASE_SECONDS * 2 ** Math.max(0, attemptCount - 1));
  return Math.max(1, Math.floor(Math.min(0.999_999, Math.max(0, random())) * cap) + 1);
}
function isTransient(kind: string) {
  return ["timed_out", "rate_limited", "unavailable", "network_error", "protocol_error"].includes(kind);
}
function exactOwnedKey(userId: string, value: string) {
  const parts = value.split("/");
  return value.trim() === value && parts[0] === userId && parts.every((part) => part && part !== "." && part !== "..");
}
function hasExactUniverse(
  targets: Awaited<ReturnType<AccountDeletionStorageDurableRepository["listStorageTargets"]>>,
  requestId: string,
  userId: string,
  expectedCount: number
) {
  if (targets.length !== expectedCount) return false;
  const ids = new Set<string>();
  const locators = new Set<string>();
  const fingerprints = new Set<string>();

  return targets.every((target) => {
    const expectedBucket = ACCOUNT_DELETION_STORAGE_BUCKET_BY_TARGET_KIND[target.target_kind];
    const locator = `${target.storage_bucket}:${target.storage_object_key}`;
    if (
      target.deletion_request_id !== requestId || target.user_id !== userId ||
      !expectedBucket || target.storage_bucket !== expectedBucket || !target.storage_object_key ||
      !exactOwnedKey(userId, target.storage_object_key) || !target.target_fingerprint ||
      ids.has(target.id) || locators.has(locator) || fingerprints.has(target.target_fingerprint) ||
      target.locator_scrubbed_at !== null
    ) return false;

    ids.add(target.id);
    locators.add(locator);
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
  result: AdapterDeleteResult;
  random: () => number;
}): AccountDeletionStorageDeleteResult {
  return {
    ...input,
    result: input.result.kind,
    retryDelaySeconds: isTransient(input.result.kind)
      ? retryDelaySeconds(input.expectedDeleteAttemptCount, input.random)
      : 0
  };
}
function toVerificationResult(input: {
  deletionRequestId: string;
  userId: string;
  targetId: string;
  leaseToken: string;
  expectedRunnerAttemptCount: number;
  expectedVerificationAttemptCount: number;
  result: AdapterVerificationResult;
  random: () => number;
}): AccountDeletionStorageVerificationResult {
  return {
    ...input,
    result: input.result.kind,
    retryDelaySeconds: isTransient(input.result.kind)
      ? retryDelaySeconds(input.expectedVerificationAttemptCount, input.random)
      : 0
  };
}

/** Executes at most one target-level external Storage action for one sealed target. */
export async function runAccountDeletionStorageDurableStep(
  input: { deletionRequestId: string; userId: string },
  dependencies: StepDependencies
): Promise<AccountDeletionStorageStepResult> {
  const request = await dependencies.repository.getRequestForOwner(input.deletionRequestId, input.userId);
  if (!request) return { kind: "not_runnable" };
  if (
    request.storage_sub_finalized_at &&
    (request.storage_cleanup_status === "succeeded" || request.storage_cleanup_status === "not_needed")
  ) return { kind: "already_finalized", status: request.storage_cleanup_status };
  if (request.storage_cleanup_status === "manual_required") return { kind: "manual_required" };
  if (
    request.provider_sub_finalized_at === null ||
    !["succeeded", "not_needed"].includes(request.provider_cleanup_status) ||
    request.storage_snapshot_version !== "g5d-2e.account-storage.v1" ||
    request.storage_snapshot_status !== "sealed" || request.storage_snapshot_seal_version !== 1 ||
    !request.storage_snapshot_sealed_at ||
    !["confirmed", "storage_cleanup_failed"].includes(request.status) ||
    !["pending", "failed"].includes(request.storage_cleanup_status)
  ) return { kind: "not_runnable" };

  const leaseToken = (dependencies.createLeaseToken ?? randomUUID)();
  const lease = await dependencies.repository.claimStorageLease({
    deletionRequestId: input.deletionRequestId,
    userId: input.userId,
    leaseToken,
    leaseSeconds: dependencies.leaseSeconds ?? DEFAULT_LEASE_SECONDS
  });
  if (!lease) return { kind: "busy" };

  const now = dependencies.now ?? (() => new Date());
  const random = dependencies.random ?? Math.random;

  try {
    const targets = await dependencies.repository.listStorageTargets(input.deletionRequestId, input.userId);
    if (!hasExactUniverse(targets, input.deletionRequestId, input.userId, lease.storage_snapshot_target_count)) {
      return { kind: "not_runnable" };
    }
    if (targets.some((target) => target.status === "manual_required")) return { kind: "manual_required" };

    if (targets.every((target) => target.status === "verified_absent" && target.verification_status === "verified_absent")) {
      const finalized = await dependencies.repository.finalizeStorageStage({
        deletionRequestId: input.deletionRequestId,
        userId: input.userId,
        leaseToken,
        expectedRunnerAttemptCount: lease.storage_runner_attempt_count
      });
      if (!finalized) return { kind: "stale_result" };
      return {
        kind: "storage_stage_finalized",
        status: finalized.storage_cleanup_status === "not_needed" ? "not_needed" : "succeeded"
      };
    }

    const target = targets.find((candidate) => !["verified_absent", "manual_required"].includes(candidate.status));
    if (!target || !target.storage_object_key || isFuture(target.next_retry_at, now())) {
      return target ? { kind: "retry_later" } : { kind: "not_runnable" };
    }

    if (target.delete_attempt_count === 1 && target.status === "delete_requested") {
      const begun = await dependencies.repository.beginVerificationAttempt({
        deletionRequestId: input.deletionRequestId,
        userId: input.userId,
        targetId: target.id,
        leaseToken,
        expectedRunnerAttemptCount: lease.storage_runner_attempt_count,
        expectedVerificationAttemptCount: target.verification_attempt_count
      });
      if (!begun) return { kind: "stale_result" };
      if (begun.status === "manual_required") return { kind: "manual_required" };

      let result: AdapterVerificationResult;
      try {
        result = await dependencies.storageAdapter.verifyObjectAbsence({
          userId: input.userId,
          targetKind: target.target_kind,
          objectKey: target.storage_object_key
        });
      } catch {
        result = { kind: "network_error" };
      }
      const recorded = await dependencies.repository.recordVerificationResult(toVerificationResult({
        deletionRequestId: input.deletionRequestId,
        userId: input.userId,
        targetId: target.id,
        leaseToken,
        expectedRunnerAttemptCount: lease.storage_runner_attempt_count,
        expectedVerificationAttemptCount: begun.verification_attempt_count,
        result,
        random
      }));
      if (!recorded) return { kind: "stale_result" };
      if (recorded.status === "manual_required") return { kind: "manual_required" };
      if (recorded.status === "verified_absent") return { kind: "target_verified" };
      return isTransient(result.kind) ? { kind: "retry_later" } : { kind: "progressed" };
    }

    if (target.status !== "pending" || target.delete_attempt_count !== 0) return { kind: "not_runnable" };
    const begun = await dependencies.repository.beginDeleteAttempt({
      deletionRequestId: input.deletionRequestId,
      userId: input.userId,
      targetId: target.id,
      leaseToken,
      expectedRunnerAttemptCount: lease.storage_runner_attempt_count,
      expectedDeleteAttemptCount: 0
    });
    if (!begun) return { kind: "stale_result" };

    let result: AdapterDeleteResult;
    try {
      result = await dependencies.storageAdapter.deleteObject({
        userId: input.userId,
        targetKind: target.target_kind,
        objectKey: target.storage_object_key
      });
    } catch {
      // Durable dispatch generation 1 already exists. A later invocation must
      // verify first; this invocation never blindly issues another DELETE.
      return { kind: "retry_later" };
    }
    const recorded = await dependencies.repository.recordDeleteResult(toDeleteResult({
      deletionRequestId: input.deletionRequestId,
      userId: input.userId,
      targetId: target.id,
      leaseToken,
      expectedRunnerAttemptCount: lease.storage_runner_attempt_count,
      expectedDeleteAttemptCount: begun.delete_attempt_count,
      result,
      random
    }));
    if (!recorded) return { kind: "stale_result" };
    if (recorded.status === "manual_required") return { kind: "manual_required" };
    return isTransient(result.kind) ? { kind: "retry_later" } : { kind: "progressed" };
  } finally {
    await dependencies.repository.releaseStorageLease({
      deletionRequestId: input.deletionRequestId,
      userId: input.userId,
      leaseToken
    });
  }
}
