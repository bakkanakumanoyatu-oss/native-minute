import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { VoiceDeletionStorageAdapter } from "@/services/voice-deletion/voice-deletion-storage-adapter";
import { runVoiceDeletionStorageStep } from "@/services/voice-deletion/voice-deletion-storage-runner";
import type { VoiceDeletionRepository } from "@/services/voice-deletion/voice-deletion.repository";

type FixtureOptions = {
  targetKind?: string;
  stage?: "provider_cleanup" | "storage_cleanup";
  deleteAttempts?: number;
  verificationAttempts?: number;
  targetStatus?: "pending" | "delete_requested" | "deleted";
  verificationStatus?: "pending" | "present" | "unavailable";
  nextRetryAt?: string | null;
  sourceManual?: boolean;
  staleDeleteRecord?: boolean;
  throwDeleteRecord?: boolean;
  throwVerificationRecord?: boolean;
};

function createFixture(options: FixtureOptions = {}) {
  const targetKind = options.targetKind ?? "voice_sample";
  const objectKey =
    targetKind === "voice_sample"
      ? "user-a/consent-a/sample.webm"
      : targetKind === "voice_consent_recording"
        ? "user-a/consent.webm"
        : "user-a/script-a/voice-a/cache.mp3";
  const operation: Record<string, unknown> = {
    id: "operation-a",
    user_id: "user-a",
    status: "processing",
    current_stage: options.stage ?? "storage_cleanup",
    snapshot_status: "succeeded",
    consent_withdrawal_status: "succeeded",
    next_retry_at: options.nextRetryAt ?? null,
    runner_attempt_count: 0,
    last_failure_category: null
  };
  const target: Record<string, unknown> = {
    id: "target-a",
    operation_id: "operation-a",
    user_id: "user-a",
    target_kind: targetKind,
    storage_bucket:
      targetKind === "voice_sample"
        ? "voice-samples"
        : targetKind === "voice_consent_recording"
          ? "voice-consents"
          : targetKind === "script_audio_storage"
            ? "script-audios"
            : targetKind === "recordings"
              ? "recordings"
              : "invalid-runtime-bucket",
    storage_object_key: objectKey,
    source_row_id: "source-a",
    status: options.targetStatus ?? "pending",
    delete_attempt_count: options.deleteAttempts ?? 0,
    verification_attempt_count: options.verificationAttempts ?? 0,
    delete_outcome: "not_attempted",
    verification_status: options.verificationStatus ?? "pending",
    reconciliation_status: "not_applicable",
    last_failure_category: null
  };
  const providerTarget: Record<string, unknown> = {
    id: "provider-target-a",
    operation_id: "operation-a",
    user_id: "user-a",
    target_kind: "provider_voice",
    status: "verified_absent",
    verification_status: "not_applicable",
    reconciliation_status: "verified_absent",
    delete_attempt_count: 1,
    verification_attempt_count: 1
  };
  let verificationRecordThrown = false;

  const repository = {
    claimExpiredOrAvailableLease: vi.fn(async () => {
      operation.runner_attempt_count = Number(operation.runner_attempt_count) + 1;
      return operation;
    }),
    releaseLease: vi.fn(async () => true),
    getOperationForUser: vi.fn(async () => operation),
    listOperationTargets: vi.fn(async () => [target, providerTarget]),
    enterStorageCleanupStage: vi.fn(async () => {
      if (operation.current_stage !== "provider_cleanup") {
        return null;
      }
      operation.current_stage = "storage_cleanup";
      operation.status = "processing";
      operation.next_retry_at = null;
      return operation;
    }),
    beginStorageObjectDeleteAttempt: vi.fn(async () => {
      if (options.sourceManual) {
        target.status = "manual_required";
        operation.status = "manual_required";
        return target;
      }
      if (Number(target.delete_attempt_count) >= 3) {
        target.status = "manual_required";
        target.verification_status = "manual_required";
        operation.status = "manual_required";
        return target;
      }
      target.status = "delete_requested";
      target.verification_status = "pending";
      target.delete_attempt_count = Number(target.delete_attempt_count) + 1;
      return target;
    }),
    recordStorageObjectDeleteResult: vi.fn(async (input: { result: string }) => {
      if (options.throwDeleteRecord) {
        throw new Error("simulated process loss after remove response");
      }
      if (options.staleDeleteRecord) {
        return null;
      }
      if (input.result === "request_succeeded") {
        target.status = "deleted";
        target.delete_outcome = "succeeded";
        target.verification_status = "pending";
        operation.status = "processing";
        operation.next_retry_at = null;
      } else if (["auth_failed", "permission_denied", "invalid_target"].includes(input.result)) {
        target.status = "manual_required";
        target.verification_status = "manual_required";
        target.last_failure_category = input.result;
        operation.status = "manual_required";
        operation.last_failure_category = input.result;
        operation.next_retry_at = null;
      } else {
        target.status = "delete_requested";
        target.verification_status = "pending";
        target.last_failure_category = input.result;
        if (["timed_out", "rate_limited", "unavailable", "network_error", "protocol_error"].includes(input.result)) {
          operation.status = "partial_failure";
          operation.next_retry_at = "2026-08-24T00:00:05.000Z";
        } else {
          operation.status = "processing";
          operation.next_retry_at = null;
        }
      }
      return target;
    }),
    beginStorageObjectVerificationAttempt: vi.fn(async () => {
      if (Number(target.verification_attempt_count) >= 5) {
        target.status = "manual_required";
        target.verification_status = "manual_required";
        operation.status = "manual_required";
        return target;
      }
      target.verification_attempt_count = Number(target.verification_attempt_count) + 1;
      target.verification_status = "pending";
      operation.status = "processing";
      operation.next_retry_at = null;
      return target;
    }),
    recordStorageObjectVerificationResult: vi.fn(async (input: { result: string }) => {
      if (options.throwVerificationRecord && !verificationRecordThrown) {
        verificationRecordThrown = true;
        throw new Error("simulated process loss after absence response");
      }
      if (input.result === "absent") {
        target.status = "verified_absent";
        target.verification_status = "verified_absent";
        target.reconciliation_status = "not_applicable";
        operation.status = "processing";
        operation.next_retry_at = null;
      } else if (input.result === "present") {
        target.status = "delete_requested";
        target.verification_status = "present";
        operation.status = "processing";
        operation.next_retry_at = null;
      } else if (["timed_out", "rate_limited", "unavailable", "network_error"].includes(input.result)) {
        target.verification_status = "unavailable";
        operation.status = "partial_failure";
        operation.next_retry_at = "2026-08-24T00:00:05.000Z";
      } else {
        target.status = "manual_required";
        target.verification_status = "manual_required";
        target.last_failure_category = input.result;
        operation.status = "manual_required";
        operation.last_failure_category = input.result;
        operation.next_retry_at = null;
      }
      return target;
    })
  } as unknown as VoiceDeletionRepository;

  const storageAdapter = {
    deleteObject: vi.fn(),
    verifyObjectAbsence: vi.fn()
  } as unknown as VoiceDeletionStorageAdapter & {
    deleteObject: ReturnType<typeof vi.fn>;
    verifyObjectAbsence: ReturnType<typeof vi.fn>;
  };

  return { operation, target, repository, storageAdapter };
}

function dependencies(
  repository: VoiceDeletionRepository,
  storageAdapter: VoiceDeletionStorageAdapter,
  now = new Date("2026-08-24T00:00:00.000Z")
) {
  return {
    repository,
    storageAdapter,
    createLeaseToken: () => "00000000-0000-4000-8000-000000000001",
    random: () => 0,
    now: () => now
  };
}

describe("G5C-B3 one-object Storage runner", () => {
  it("enters storage_cleanup from the completed provider stage without a Storage call", async () => {
    const { repository, storageAdapter, operation } = createFixture({ stage: "provider_cleanup" });

    await expect(runVoiceDeletionStorageStep({ operationId: "operation-a", userId: "user-a" }, dependencies(repository, storageAdapter))).resolves.toEqual({
      kind: "stage_entered"
    });
    expect(operation.current_stage).toBe("storage_cleanup");
    expect(storageAdapter.deleteObject).not.toHaveBeenCalled();
    expect(storageAdapter.verifyObjectAbsence).not.toHaveBeenCalled();
  });

  it.each(["voice_sample", "voice_consent_recording", "script_audio_storage"] as const)(
    "durably begins and removes one exact %s object",
    async (targetKind) => {
      const { repository, storageAdapter, target } = createFixture({ targetKind });
      storageAdapter.deleteObject.mockResolvedValue({ kind: "request_succeeded" });

      await expect(runVoiceDeletionStorageStep({ operationId: "operation-a", userId: "user-a" }, dependencies(repository, storageAdapter))).resolves.toEqual({
        kind: "progressed"
      });
      expect(target.status).toBe("deleted");
      expect(storageAdapter.deleteObject).toHaveBeenCalledTimes(1);
      expect(storageAdapter.verifyObjectAbsence).not.toHaveBeenCalled();
    }
  );

  it("does not treat a successful remove request as verified absence", async () => {
    const { repository, storageAdapter, target } = createFixture();
    storageAdapter.deleteObject.mockResolvedValue({ kind: "request_succeeded" });
    storageAdapter.verifyObjectAbsence.mockResolvedValue({ kind: "absent" });

    await runVoiceDeletionStorageStep({ operationId: "operation-a", userId: "user-a" }, dependencies(repository, storageAdapter));
    expect(target).toMatchObject({ status: "deleted", verification_status: "pending" });

    await expect(runVoiceDeletionStorageStep({ operationId: "operation-a", userId: "user-a" }, dependencies(repository, storageAdapter))).resolves.toEqual({
      kind: "storage_stage_complete"
    });
    expect(target.status).toBe("verified_absent");
  });

  it("keeps a valid external rejection verification-first rather than manual_required", async () => {
    const { repository, storageAdapter, target } = createFixture();
    storageAdapter.deleteObject.mockResolvedValue({ kind: "rejected" });
    storageAdapter.verifyObjectAbsence.mockResolvedValue({ kind: "present" });

    await expect(runVoiceDeletionStorageStep({ operationId: "operation-a", userId: "user-a" }, dependencies(repository, storageAdapter))).resolves.toEqual({
      kind: "progressed"
    });
    expect(storageAdapter.deleteObject).toHaveBeenCalledTimes(1);
    expect(storageAdapter.verifyObjectAbsence).not.toHaveBeenCalled();
    expect(target).toMatchObject({ status: "delete_requested", verification_status: "pending", last_failure_category: "rejected" });

    await expect(runVoiceDeletionStorageStep({ operationId: "operation-a", userId: "user-a" }, dependencies(repository, storageAdapter))).resolves.toEqual({
      kind: "progressed"
    });
    expect(storageAdapter.verifyObjectAbsence).toHaveBeenCalledTimes(1);
    expect(target).toMatchObject({ status: "delete_requested", verification_status: "present" });
  });

  it("persists a recordings runtime target as manual_required without storage_stage_complete", async () => {
    const { repository, storageAdapter, target } = createFixture({ targetKind: "recordings" });
    storageAdapter.deleteObject.mockResolvedValue({ kind: "invalid_target" });

    await expect(runVoiceDeletionStorageStep({ operationId: "operation-a", userId: "user-a" }, dependencies(repository, storageAdapter))).resolves.toEqual({
      kind: "manual_required"
    });
    expect(storageAdapter.deleteObject).toHaveBeenCalledTimes(1);
    expect(storageAdapter.verifyObjectAbsence).not.toHaveBeenCalled();
    expect(target).toMatchObject({
      target_kind: "recordings",
      status: "manual_required",
      verification_status: "manual_required",
      last_failure_category: "invalid_target"
    });
  });

  it("persists an invalid verification result as manual_required without a retry", async () => {
    const { repository, storageAdapter, operation, target } = createFixture({
      targetKind: "recordings",
      targetStatus: "delete_requested",
      verificationStatus: "pending",
      deleteAttempts: 1
    });
    storageAdapter.verifyObjectAbsence.mockResolvedValue({ kind: "invalid_target" });

    await expect(runVoiceDeletionStorageStep({ operationId: "operation-a", userId: "user-a" }, dependencies(repository, storageAdapter))).resolves.toEqual({
      kind: "manual_required"
    });
    expect(storageAdapter.deleteObject).not.toHaveBeenCalled();
    expect(storageAdapter.verifyObjectAbsence).toHaveBeenCalledTimes(1);
    expect(operation).toMatchObject({ status: "manual_required", next_retry_at: null, last_failure_category: "invalid_target" });
    expect(target).toMatchObject({ status: "manual_required", verification_status: "manual_required", last_failure_category: "invalid_target" });
  });

  it("uses verification present to enable a later delete retry without chaining calls", async () => {
    const { repository, storageAdapter, target } = createFixture({
      targetStatus: "delete_requested",
      verificationStatus: "pending",
      deleteAttempts: 1
    });
    storageAdapter.verifyObjectAbsence.mockResolvedValue({ kind: "present" });
    storageAdapter.deleteObject.mockResolvedValue({ kind: "request_succeeded" });

    await expect(runVoiceDeletionStorageStep({ operationId: "operation-a", userId: "user-a" }, dependencies(repository, storageAdapter))).resolves.toEqual({
      kind: "progressed"
    });
    expect(target).toMatchObject({ status: "delete_requested", verification_status: "present" });
    expect(storageAdapter.deleteObject).not.toHaveBeenCalled();

    await expect(runVoiceDeletionStorageStep({ operationId: "operation-a", userId: "user-a" }, dependencies(repository, storageAdapter))).resolves.toEqual({
      kind: "progressed"
    });
    expect(storageAdapter.deleteObject).toHaveBeenCalledTimes(1);
  });

  it("uses verification-first after transient delete outcome and honors next_retry_at", async () => {
    const { repository, storageAdapter, operation } = createFixture();
    storageAdapter.deleteObject.mockResolvedValue({ kind: "timed_out" });
    storageAdapter.verifyObjectAbsence.mockResolvedValue({ kind: "absent" });

    await expect(runVoiceDeletionStorageStep({ operationId: "operation-a", userId: "user-a" }, dependencies(repository, storageAdapter))).resolves.toEqual({
      kind: "retry_later"
    });
    expect(operation.status).toBe("partial_failure");
    await expect(runVoiceDeletionStorageStep({ operationId: "operation-a", userId: "user-a" }, dependencies(repository, storageAdapter))).resolves.toEqual({
      kind: "retry_later"
    });
    expect(storageAdapter.verifyObjectAbsence).not.toHaveBeenCalled();

    await expect(
      runVoiceDeletionStorageStep(
        { operationId: "operation-a", userId: "user-a" },
        dependencies(repository, storageAdapter, new Date("2026-08-24T00:00:06.000Z"))
      )
    ).resolves.toEqual({ kind: "storage_stage_complete" });
    expect(storageAdapter.verifyObjectAbsence).toHaveBeenCalledTimes(1);
  });

  it("moves exhausted delete or verification budgets to manual_required without an external call", async () => {
    const deleteExhausted = createFixture({ targetStatus: "delete_requested", verificationStatus: "present", deleteAttempts: 3 });
    await expect(
      runVoiceDeletionStorageStep({ operationId: "operation-a", userId: "user-a" }, dependencies(deleteExhausted.repository, deleteExhausted.storageAdapter))
    ).resolves.toEqual({ kind: "manual_required" });
    expect(deleteExhausted.storageAdapter.deleteObject).not.toHaveBeenCalled();

    const verifyExhausted = createFixture({ targetStatus: "deleted", verificationAttempts: 5 });
    await expect(
      runVoiceDeletionStorageStep({ operationId: "operation-a", userId: "user-a" }, dependencies(verifyExhausted.repository, verifyExhausted.storageAdapter))
    ).resolves.toEqual({ kind: "manual_required" });
    expect(verifyExhausted.storageAdapter.verifyObjectAbsence).not.toHaveBeenCalled();
  });

  it("does not make an external call for manual source attribution failures", async () => {
    const { repository, storageAdapter } = createFixture({ sourceManual: true });

    await expect(runVoiceDeletionStorageStep({ operationId: "operation-a", userId: "user-a" }, dependencies(repository, storageAdapter))).resolves.toEqual({
      kind: "manual_required"
    });
    expect(storageAdapter.deleteObject).not.toHaveBeenCalled();
    expect(storageAdapter.verifyObjectAbsence).not.toHaveBeenCalled();
  });

  it("remains crash-safe after intent, remove response, durable delete result, and absence response", async () => {
    const afterIntent = createFixture();
    afterIntent.storageAdapter.deleteObject.mockRejectedValue(new Error("crash before remove response"));
    afterIntent.storageAdapter.verifyObjectAbsence.mockResolvedValue({ kind: "absent" });
    await runVoiceDeletionStorageStep({ operationId: "operation-a", userId: "user-a" }, dependencies(afterIntent.repository, afterIntent.storageAdapter));
    await runVoiceDeletionStorageStep({ operationId: "operation-a", userId: "user-a" }, dependencies(afterIntent.repository, afterIntent.storageAdapter));
    expect(afterIntent.storageAdapter.deleteObject).toHaveBeenCalledTimes(1);
    expect(afterIntent.storageAdapter.verifyObjectAbsence).toHaveBeenCalledTimes(1);

    const afterRemove = createFixture({ throwDeleteRecord: true });
    afterRemove.storageAdapter.deleteObject.mockResolvedValue({ kind: "request_succeeded" });
    afterRemove.storageAdapter.verifyObjectAbsence.mockResolvedValue({ kind: "absent" });
    await expect(
      runVoiceDeletionStorageStep({ operationId: "operation-a", userId: "user-a" }, dependencies(afterRemove.repository, afterRemove.storageAdapter))
    ).rejects.toThrow("simulated process loss after remove response");
    await runVoiceDeletionStorageStep({ operationId: "operation-a", userId: "user-a" }, dependencies(afterRemove.repository, afterRemove.storageAdapter));
    expect(afterRemove.storageAdapter.verifyObjectAbsence).toHaveBeenCalledTimes(1);

    const afterAbsent = createFixture({ targetStatus: "deleted", throwVerificationRecord: true });
    afterAbsent.storageAdapter.verifyObjectAbsence.mockResolvedValue({ kind: "absent" });
    await expect(
      runVoiceDeletionStorageStep({ operationId: "operation-a", userId: "user-a" }, dependencies(afterAbsent.repository, afterAbsent.storageAdapter))
    ).rejects.toThrow("simulated process loss after absence response");
    await runVoiceDeletionStorageStep({ operationId: "operation-a", userId: "user-a" }, dependencies(afterAbsent.repository, afterAbsent.storageAdapter));
    expect(afterAbsent.storageAdapter.verifyObjectAbsence).toHaveBeenCalledTimes(2);
  });

  it("rejects stale result recording and leaves the durable intent untouched", async () => {
    const { repository, storageAdapter, target } = createFixture({ staleDeleteRecord: true });
    storageAdapter.deleteObject.mockResolvedValue({ kind: "request_succeeded" });

    await expect(runVoiceDeletionStorageStep({ operationId: "operation-a", userId: "user-a" }, dependencies(repository, storageAdapter))).resolves.toEqual({
      kind: "stale_result"
    });
    expect(target).toMatchObject({ status: "delete_requested", verification_status: "pending" });
  });

  it("reports completion internally without entering B4 or changing the operation stage", async () => {
    const { repository, storageAdapter, operation, target } = createFixture({ targetStatus: "deleted", deleteAttempts: 1 });
    storageAdapter.verifyObjectAbsence.mockResolvedValue({ kind: "absent" });

    await expect(runVoiceDeletionStorageStep({ operationId: "operation-a", userId: "user-a" }, dependencies(repository, storageAdapter))).resolves.toEqual({
      kind: "storage_stage_complete"
    });
    expect(target.status).toBe("verified_absent");
    expect(operation.current_stage).toBe("storage_cleanup");
    expect(operation.status).toBe("processing");
  });
});
