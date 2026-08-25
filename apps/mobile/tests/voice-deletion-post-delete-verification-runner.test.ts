import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { runVoiceDeletionPostDeleteVerificationStep } from "@/services/voice-deletion/voice-deletion-post-delete-verification-runner";
import type { VoiceDeletionRepository } from "@/services/voice-deletion/voice-deletion.repository";

function fixture(stage: string, verificationStatus = "pending") {
  const operation = {
    id: "operation-a",
    user_id: "user-a",
    status: "processing",
    current_stage: stage,
    snapshot_status: "succeeded",
    consent_withdrawal_status: "succeeded",
    post_delete_verification_status: verificationStatus,
    runner_attempt_count: 0
  };
  const repository = {
    claimExpiredOrAvailableLease: vi.fn(async () => {
      operation.runner_attempt_count += 1;
      return operation;
    }),
    releaseLease: vi.fn(async () => true),
    enterPostDeleteVerificationStage: vi.fn(async () => {
      operation.current_stage = "post_delete_verification";
      operation.post_delete_verification_status = "processing";
      return operation;
    }),
    completePostDeleteVerification: vi.fn(async () => {
      operation.post_delete_verification_status = "succeeded";
      return operation;
    }),
    finalizeOperation: vi.fn()
  } as unknown as VoiceDeletionRepository;
  return { operation, repository };
}

const dependencies = (repository: VoiceDeletionRepository) => ({
  repository,
  createLeaseToken: () => "00000000-0000-4000-8000-000000000020"
});

describe("G5C-B5 post-delete verification runner", () => {
  it("uses one invocation to enter the stage and a second to complete verification", async () => {
    const { operation, repository } = fixture("database_cleanup");

    await expect(
      runVoiceDeletionPostDeleteVerificationStep(
        { operationId: operation.id, userId: operation.user_id },
        dependencies(repository)
      )
    ).resolves.toEqual({ kind: "stage_entered" });
    expect(repository.completePostDeleteVerification).not.toHaveBeenCalled();

    await expect(
      runVoiceDeletionPostDeleteVerificationStep(
        { operationId: operation.id, userId: operation.user_id },
        dependencies(repository)
      )
    ).resolves.toEqual({ kind: "verification_succeeded" });
    expect(repository.completePostDeleteVerification).toHaveBeenCalledTimes(1);
    expect(repository.finalizeOperation).not.toHaveBeenCalled();
  });

  it("reports succeeded verification as ready but never crosses the finalizer boundary", async () => {
    const { operation, repository } = fixture("post_delete_verification", "succeeded");

    await expect(
      runVoiceDeletionPostDeleteVerificationStep(
        { operationId: operation.id, userId: operation.user_id },
        dependencies(repository)
      )
    ).resolves.toEqual({ kind: "ready_for_finalization" });
    expect(repository.finalizeOperation).not.toHaveBeenCalled();
  });
});
