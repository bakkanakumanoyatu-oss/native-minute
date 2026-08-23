import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { VoiceDeletionProviderAdapter } from "@/providers/voice-deletion";
import { runVoiceDeletionProviderStep } from "@/services/voice-deletion/voice-deletion-provider-runner";
import type { VoiceDeletionRepository } from "@/services/voice-deletion/voice-deletion.repository";

type Operation = {
  id: string;
  user_id: string;
  status: "processing" | "partial_failure" | "manual_required";
  current_stage: "provider_cleanup";
  snapshot_status: "succeeded";
  consent_withdrawal_status: "succeeded";
  next_retry_at: string | null;
  last_failure_category: string | null;
};

type Target = {
  id: string;
  operation_id: string;
  user_id: string;
  target_kind: "provider_voice";
  provider_name: "elevenlabs";
  provider_resource_id: string;
  status: "pending" | "delete_requested" | "deleted" | "verified_absent" | "manual_required";
  reconciliation_status: "not_applicable" | "pending" | "present" | "unavailable" | "verified_absent" | "manual_required";
  verification_status: "pending" | "not_applicable" | "present" | "unavailable" | "manual_required";
  delete_attempt_count: number;
  verification_attempt_count: number;
  delete_outcome: "not_attempted" | "succeeded" | "rejected" | "unavailable";
  last_failure_category: string | null;
};

function createFixture(options: { staleDeleteRecord?: boolean } = {}) {
  const operation: Operation = {
    id: "operation-a",
    user_id: "user-a",
    status: "processing",
    current_stage: "provider_cleanup",
    snapshot_status: "succeeded",
    consent_withdrawal_status: "succeeded",
    next_retry_at: null,
    last_failure_category: null
  };
  const target: Target = {
    id: "target-a",
    operation_id: operation.id,
    user_id: operation.user_id,
    target_kind: "provider_voice",
    provider_name: "elevenlabs",
    provider_resource_id: "provider-voice-a",
    status: "pending",
    reconciliation_status: "not_applicable",
    verification_status: "pending",
    delete_attempt_count: 0,
    verification_attempt_count: 0,
    delete_outcome: "not_attempted",
    last_failure_category: null
  };

  const repository = {
    claimExpiredOrAvailableLease: vi.fn(async () => operation),
    releaseLease: vi.fn(async () => true),
    listOperationTargets: vi.fn(async () => [target]),
    beginProviderVoiceDeleteAttempt: vi.fn(async () => {
      if (target.delete_attempt_count >= 3) {
        target.status = "manual_required";
        target.reconciliation_status = "manual_required";
        return target;
      }
      target.status = "delete_requested";
      target.reconciliation_status = "pending";
      target.verification_status = "pending";
      target.delete_attempt_count += 1;
      return target;
    }),
    recordProviderVoiceDeleteResult: vi.fn(async (input) => {
      if (options.staleDeleteRecord) {
        return null;
      }
      if (input.result === "deleted") {
        target.status = "deleted";
        target.delete_outcome = "succeeded";
        target.reconciliation_status = "pending";
        target.verification_status = "not_applicable";
      } else if (input.result === "provider_rejected") {
        target.status = "delete_requested";
        target.delete_outcome = "rejected";
        target.reconciliation_status = "pending";
        target.verification_status = "pending";
        target.last_failure_category = "provider_rejected";
        operation.status = "processing";
        operation.last_failure_category = "provider_rejected";
      } else if (["auth_failed", "permission_denied", "credential_missing", "invalid_provider_reference"].includes(input.result)) {
        target.status = "manual_required";
        target.reconciliation_status = "manual_required";
      } else {
        target.status = "delete_requested";
        target.delete_outcome = "unavailable";
        target.reconciliation_status = "pending";
        operation.status = "partial_failure";
        operation.next_retry_at = "2026-08-23T00:00:10.000Z";
      }
      return target;
    }),
    beginProviderVoiceReconciliationAttempt: vi.fn(async () => {
      if (target.verification_attempt_count >= 5) {
        target.status = "manual_required";
        target.reconciliation_status = "manual_required";
        return target;
      }
      target.reconciliation_status = "pending";
      target.verification_status = "pending";
      target.verification_attempt_count += 1;
      operation.status = "processing";
      operation.next_retry_at = null;
      return target;
    }),
    recordProviderVoiceReconciliationResult: vi.fn(async (input) => {
      if (input.result === "verified_absent") {
        target.status = "verified_absent";
        target.reconciliation_status = "verified_absent";
        target.verification_status = "not_applicable";
        target.last_failure_category = null;
      } else if (input.result === "present" && target.last_failure_category === "provider_rejected") {
        target.status = "manual_required";
        target.reconciliation_status = "manual_required";
        target.verification_status = "manual_required";
        operation.status = "manual_required";
      } else if (input.result === "present" && input.ownerSignal !== "false") {
        target.status = "delete_requested";
        target.reconciliation_status = "present";
        target.verification_status = "present";
        target.last_failure_category = null;
      } else if (input.result === "present" || ["auth_failed", "permission_denied", "provider_rejected"].includes(input.result)) {
        target.status = "manual_required";
        target.reconciliation_status = "manual_required";
      } else {
        target.reconciliation_status = "unavailable";
        target.verification_status = "unavailable";
        target.last_failure_category = target.last_failure_category === "provider_rejected" ? "provider_rejected" : input.result;
        operation.status = "partial_failure";
        operation.next_retry_at = "2026-08-23T00:00:10.000Z";
      }
      return target;
    })
  } as unknown as VoiceDeletionRepository;

  return { operation, target, repository };
}

function createAdapter() {
  return {
    deleteVoice: vi.fn(),
    reconcileVoiceAbsence: vi.fn()
  } as unknown as VoiceDeletionProviderAdapter & {
    deleteVoice: ReturnType<typeof vi.fn>;
    reconcileVoiceAbsence: ReturnType<typeof vi.fn>;
  };
}

function dependencies(repository: VoiceDeletionRepository, providerAdapter: VoiceDeletionProviderAdapter, now = new Date("2026-08-23T00:00:00.000Z")) {
  return {
    repository,
    providerAdapter,
    createLeaseToken: () => "00000000-0000-4000-8000-000000000001",
    random: () => 0,
    now: () => now
  };
}

describe("G5C-B2b lease-aware provider voice runner", () => {
  it("durably begins DELETE, then reconciles verified absence in a later single-call step", async () => {
    const { repository, target } = createFixture();
    const adapter = createAdapter();
    adapter.deleteVoice.mockResolvedValue({ kind: "deleted" });
    adapter.reconcileVoiceAbsence.mockResolvedValue({ kind: "verified_absent" });

    await expect(runVoiceDeletionProviderStep({ operationId: "operation-a", userId: "user-a" }, dependencies(repository, adapter))).resolves.toEqual({
      kind: "progressed"
    });
    expect(target.status).toBe("deleted");
    expect(adapter.deleteVoice).toHaveBeenCalledTimes(1);
    expect(adapter.reconcileVoiceAbsence).not.toHaveBeenCalled();

    await expect(runVoiceDeletionProviderStep({ operationId: "operation-a", userId: "user-a" }, dependencies(repository, adapter))).resolves.toEqual({
      kind: "provider_stage_complete"
    });
    expect(target.status).toBe("verified_absent");
    expect(adapter.deleteVoice).toHaveBeenCalledTimes(1);
    expect(adapter.reconcileVoiceAbsence).toHaveBeenCalledTimes(1);
  });

  it("uses GET first after a crash after the durable DELETE intent", async () => {
    const { repository, target } = createFixture();
    const adapter = createAdapter();
    adapter.deleteVoice.mockRejectedValue(new Error("simulated process loss"));
    adapter.reconcileVoiceAbsence.mockResolvedValue({ kind: "verified_absent" });

    await expect(runVoiceDeletionProviderStep({ operationId: "operation-a", userId: "user-a" }, dependencies(repository, adapter))).resolves.toEqual({
      kind: "retry_later"
    });
    expect(target.status).toBe("delete_requested");
    expect(target.delete_attempt_count).toBe(1);

    await expect(runVoiceDeletionProviderStep({ operationId: "operation-a", userId: "user-a" }, dependencies(repository, adapter))).resolves.toEqual({
      kind: "provider_stage_complete"
    });
    expect(adapter.deleteVoice).toHaveBeenCalledTimes(1);
    expect(adapter.reconcileVoiceAbsence).toHaveBeenCalledTimes(1);
  });

  it("does not overwrite durable state when the post-DELETE result loses its lease", async () => {
    const { repository, target } = createFixture({ staleDeleteRecord: true });
    const adapter = createAdapter();
    adapter.deleteVoice.mockResolvedValue({ kind: "deleted" });

    await expect(runVoiceDeletionProviderStep({ operationId: "operation-a", userId: "user-a" }, dependencies(repository, adapter))).resolves.toEqual({
      kind: "stale_result"
    });
    expect(target.status).toBe("delete_requested");
    expect(target.reconciliation_status).toBe("pending");
    expect(adapter.deleteVoice).toHaveBeenCalledTimes(1);
  });

  it("records a transient DELETE result durably and does not call the provider before next_retry_at", async () => {
    const { repository, operation } = createFixture();
    const adapter = createAdapter();
    adapter.deleteVoice.mockResolvedValue({ kind: "timeout" });

    await expect(runVoiceDeletionProviderStep({ operationId: "operation-a", userId: "user-a" }, dependencies(repository, adapter))).resolves.toEqual({
      kind: "retry_later"
    });
    expect(operation.status).toBe("partial_failure");
    expect(adapter.deleteVoice).toHaveBeenCalledTimes(1);

    await expect(runVoiceDeletionProviderStep({ operationId: "operation-a", userId: "user-a" }, dependencies(repository, adapter))).resolves.toEqual({
      kind: "retry_later"
    });
    expect(adapter.deleteVoice).toHaveBeenCalledTimes(1);
    expect(adapter.reconcileVoiceAbsence).not.toHaveBeenCalled();
  });

  it("records provider_rejected for GET-first reconciliation without chaining a GET", async () => {
    const { repository, operation, target } = createFixture();
    const adapter = createAdapter();
    adapter.deleteVoice.mockResolvedValue({ kind: "provider_rejected" });

    await expect(runVoiceDeletionProviderStep({ operationId: "operation-a", userId: "user-a" }, dependencies(repository, adapter))).resolves.toEqual({
      kind: "progressed"
    });

    expect(target).toMatchObject({
      status: "delete_requested",
      delete_outcome: "rejected",
      reconciliation_status: "pending",
      last_failure_category: "provider_rejected"
    });
    expect(operation).toMatchObject({ status: "processing", last_failure_category: "provider_rejected" });
    expect(adapter.deleteVoice).toHaveBeenCalledTimes(1);
    expect(adapter.reconcileVoiceAbsence).not.toHaveBeenCalled();
  });

  it("uses GET first after provider_rejected and accepts strict verified absence", async () => {
    const { repository, target } = createFixture();
    const adapter = createAdapter();
    adapter.deleteVoice.mockResolvedValue({ kind: "provider_rejected" });
    adapter.reconcileVoiceAbsence.mockResolvedValue({ kind: "verified_absent" });

    await runVoiceDeletionProviderStep({ operationId: "operation-a", userId: "user-a" }, dependencies(repository, adapter));
    await expect(runVoiceDeletionProviderStep({ operationId: "operation-a", userId: "user-a" }, dependencies(repository, adapter))).resolves.toEqual({
      kind: "provider_stage_complete"
    });

    expect(target.status).toBe("verified_absent");
    expect(adapter.deleteVoice).toHaveBeenCalledTimes(1);
    expect(adapter.reconcileVoiceAbsence).toHaveBeenCalledTimes(1);
  });

  it("moves provider_rejected plus GET present to manual_required without another DELETE", async () => {
    const { repository, operation, target } = createFixture();
    const adapter = createAdapter();
    adapter.deleteVoice.mockResolvedValue({ kind: "provider_rejected" });
    adapter.reconcileVoiceAbsence.mockResolvedValue({ kind: "present", ownerSignal: "true" });

    await runVoiceDeletionProviderStep({ operationId: "operation-a", userId: "user-a" }, dependencies(repository, adapter));
    await expect(runVoiceDeletionProviderStep({ operationId: "operation-a", userId: "user-a" }, dependencies(repository, adapter))).resolves.toEqual({
      kind: "manual_required"
    });

    expect(target).toMatchObject({ status: "manual_required", reconciliation_status: "manual_required", last_failure_category: "provider_rejected" });
    expect(operation).toMatchObject({ status: "manual_required", last_failure_category: "provider_rejected" });
    expect(adapter.deleteVoice).toHaveBeenCalledTimes(1);
    expect(adapter.reconcileVoiceAbsence).toHaveBeenCalledTimes(1);
  });

  it("keeps the ownerSignal=false manual boundary after provider_rejected", async () => {
    const { repository, operation, target } = createFixture();
    const adapter = createAdapter();
    adapter.deleteVoice.mockResolvedValue({ kind: "provider_rejected" });
    adapter.reconcileVoiceAbsence.mockResolvedValue({ kind: "present", ownerSignal: "false" });

    await runVoiceDeletionProviderStep({ operationId: "operation-a", userId: "user-a" }, dependencies(repository, adapter));
    await expect(runVoiceDeletionProviderStep({ operationId: "operation-a", userId: "user-a" }, dependencies(repository, adapter))).resolves.toEqual({
      kind: "manual_required"
    });

    expect(target).toMatchObject({ status: "manual_required", last_failure_category: "provider_rejected" });
    expect(operation).toMatchObject({ status: "manual_required", last_failure_category: "provider_rejected" });
    expect(adapter.deleteVoice).toHaveBeenCalledTimes(1);
  });

  it("retries GET, not DELETE, after a transient reconciliation following provider_rejected", async () => {
    const { repository, target } = createFixture();
    const adapter = createAdapter();
    adapter.deleteVoice.mockResolvedValue({ kind: "provider_rejected" });
    adapter.reconcileVoiceAbsence.mockResolvedValue({ kind: "timeout" });

    await runVoiceDeletionProviderStep({ operationId: "operation-a", userId: "user-a" }, dependencies(repository, adapter));
    await expect(runVoiceDeletionProviderStep({ operationId: "operation-a", userId: "user-a" }, dependencies(repository, adapter))).resolves.toEqual({
      kind: "retry_later"
    });

    expect(target).toMatchObject({ reconciliation_status: "unavailable", last_failure_category: "provider_rejected" });
    expect(adapter.deleteVoice).toHaveBeenCalledTimes(1);
    expect(adapter.reconcileVoiceAbsence).toHaveBeenCalledTimes(1);
  });

  it("moves a nonretryable reconciliation error to manual_required after provider_rejected", async () => {
    const { repository, target } = createFixture();
    const adapter = createAdapter();
    adapter.deleteVoice.mockResolvedValue({ kind: "provider_rejected" });
    adapter.reconcileVoiceAbsence.mockResolvedValue({ kind: "permission_denied" });

    await runVoiceDeletionProviderStep({ operationId: "operation-a", userId: "user-a" }, dependencies(repository, adapter));
    await expect(runVoiceDeletionProviderStep({ operationId: "operation-a", userId: "user-a" }, dependencies(repository, adapter))).resolves.toEqual({
      kind: "manual_required"
    });

    expect(target.status).toBe("manual_required");
    expect(adapter.deleteVoice).toHaveBeenCalledTimes(1);
    expect(adapter.reconcileVoiceAbsence).toHaveBeenCalledTimes(1);
  });

  it("restarts with GET after provider_rejected was durably recorded before a crash", async () => {
    const { repository, target } = createFixture();
    const adapter = createAdapter();
    adapter.deleteVoice.mockResolvedValue({ kind: "provider_rejected" });
    adapter.reconcileVoiceAbsence.mockResolvedValue({ kind: "verified_absent" });

    await runVoiceDeletionProviderStep({ operationId: "operation-a", userId: "user-a" }, dependencies(repository, adapter));
    expect(target.last_failure_category).toBe("provider_rejected");

    await expect(runVoiceDeletionProviderStep({ operationId: "operation-a", userId: "user-a" }, dependencies(repository, adapter))).resolves.toEqual({
      kind: "provider_stage_complete"
    });
    expect(adapter.deleteVoice).toHaveBeenCalledTimes(1);
    expect(adapter.reconcileVoiceAbsence).toHaveBeenCalledTimes(1);
  });

  it("stops automatic work when reconciliation reports an unowned provider voice", async () => {
    const { repository, target } = createFixture();
    target.status = "delete_requested";
    target.reconciliation_status = "pending";
    target.delete_attempt_count = 1;
    const adapter = createAdapter();
    adapter.reconcileVoiceAbsence.mockResolvedValue({ kind: "present", ownerSignal: "false" });

    await expect(runVoiceDeletionProviderStep({ operationId: "operation-a", userId: "user-a" }, dependencies(repository, adapter))).resolves.toEqual({
      kind: "manual_required"
    });
    expect(adapter.deleteVoice).not.toHaveBeenCalled();
    expect(adapter.reconcileVoiceAbsence).toHaveBeenCalledTimes(1);
    expect(target.status).toBe("manual_required");
  });
});
