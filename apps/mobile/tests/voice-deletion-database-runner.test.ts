import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { runVoiceDeletionDatabaseStep } from "@/services/voice-deletion/voice-deletion-database-runner";
import type { VoiceDeletionRepository } from "@/services/voice-deletion/voice-deletion.repository";

function createFixture() {
  const operation = {
    id: "operation-a",
    user_id: "user-a",
    status: "processing",
    current_stage: "storage_cleanup" as string,
    snapshot_status: "succeeded",
    consent_withdrawal_status: "succeeded",
    runner_attempt_count: 0,
    lease_token: null as string | null,
    lease_expires_at: null as string | null
  };
  const targets = [
    {
      target_kind: "saved_model_audio",
      status: "pending",
      verification_status: "pending",
      reconciliation_status: "not_applicable"
    },
    {
      target_kind: "script_audio",
      status: "pending",
      verification_status: "pending",
      reconciliation_status: "not_applicable"
    },
    {
      target_kind: "voice_binding",
      status: "pending",
      verification_status: "pending",
      reconciliation_status: "not_applicable"
    }
  ];
  const repository = {
    claimExpiredOrAvailableLease: vi.fn(async (input: { leaseToken: string }) => {
      operation.lease_token = input.leaseToken;
      operation.lease_expires_at = "2026-08-24T00:01:00.000Z";
      operation.runner_attempt_count += 1;
      return operation;
    }),
    releaseLease: vi.fn(async () => true),
    enterDatabaseCleanupStage: vi.fn(async () => {
      operation.current_stage = "database_cleanup";
      return operation;
    }),
    listOperationTargets: vi.fn(async () => targets),
    cleanupDatabaseTargets: vi.fn(async () => {
      for (const target of targets) {
        target.status = "verified_absent";
        target.verification_status = "verified_absent";
      }
      return operation;
    })
  } as unknown as VoiceDeletionRepository;

  return { operation, targets, repository };
}

const dependencies = (repository: VoiceDeletionRepository) => ({
  repository,
  createLeaseToken: () => "00000000-0000-4000-8000-000000000002"
});

describe("G5C-B4 atomic database cleanup runner", () => {
  it("enters the database stage before invoking its single cleanup RPC", async () => {
    const { operation, repository } = createFixture();

    await expect(
      runVoiceDeletionDatabaseStep({ operationId: operation.id, userId: operation.user_id }, dependencies(repository))
    ).resolves.toEqual({ kind: "stage_entered" });
    expect(repository.enterDatabaseCleanupStage).toHaveBeenCalledTimes(1);
    expect(repository.cleanupDatabaseTargets).not.toHaveBeenCalled();

    await expect(
      runVoiceDeletionDatabaseStep({ operationId: operation.id, userId: operation.user_id }, dependencies(repository))
    ).resolves.toEqual({ kind: "database_cleanup_completed" });
    expect(repository.cleanupDatabaseTargets).toHaveBeenCalledTimes(1);
  });

  it("treats durable verified absence as B4-internal completion, not operation completion", async () => {
    const { operation, targets, repository } = createFixture();
    operation.current_stage = "database_cleanup";
    for (const target of targets) {
      target.status = "verified_absent";
      target.verification_status = "verified_absent";
    }

    await expect(
      runVoiceDeletionDatabaseStep({ operationId: operation.id, userId: operation.user_id }, dependencies(repository))
    ).resolves.toEqual({ kind: "database_stage_complete" });
    expect(repository.cleanupDatabaseTargets).not.toHaveBeenCalled();
    expect((repository as unknown as { finalizeOperation?: unknown }).finalizeOperation).toBeUndefined();
  });

  it("does not call the cleanup RPC for manual targets", async () => {
    const { operation, targets, repository } = createFixture();
    operation.current_stage = "database_cleanup";
    targets[0].status = "manual_required";

    await expect(
      runVoiceDeletionDatabaseStep({ operationId: operation.id, userId: operation.user_id }, dependencies(repository))
    ).resolves.toEqual({ kind: "manual_required" });
    expect(repository.cleanupDatabaseTargets).not.toHaveBeenCalled();
  });
});
