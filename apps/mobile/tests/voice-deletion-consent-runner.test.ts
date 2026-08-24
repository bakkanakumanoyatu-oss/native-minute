import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { runVoiceDeletionConsentStep } from "@/services/voice-deletion/voice-deletion-consent-runner";
import type { VoiceDeletionRepository } from "@/services/voice-deletion/voice-deletion.repository";

function createFixture() {
  const operation = {
    id: "operation-a",
    user_id: "user-a",
    status: "pending",
    current_stage: null as string | null,
    snapshot_status: "succeeded",
    consent_withdrawal_status: "pending",
    runner_attempt_count: 0,
    lease_token: null as string | null,
    lease_expires_at: null as string | null
  };
  const repository = {
    claimExpiredOrAvailableLease: vi.fn(async (input: { leaseToken: string }) => {
      operation.lease_token = input.leaseToken;
      operation.lease_expires_at = "2026-08-24T00:01:00.000Z";
      operation.runner_attempt_count += 1;
      return operation;
    }),
    releaseLease: vi.fn(async () => true),
    sealConsentSnapshot: vi.fn(async () => {
      operation.status = "processing";
      operation.current_stage = "consent_withdrawal";
      operation.consent_withdrawal_status = "processing";
      return operation;
    }),
    withdrawCurrentConsents: vi.fn(async () => {
      operation.status = "processing";
      operation.current_stage = "provider_cleanup";
      operation.consent_withdrawal_status = "succeeded";
      return operation;
    })
  } as unknown as VoiceDeletionRepository;

  return { operation, repository };
}

const dependencies = (repository: VoiceDeletionRepository) => ({
  repository,
  createLeaseToken: () => "00000000-0000-4000-8000-000000000001"
});

describe("G5C-B4 durable consent runner", () => {
  it("seals first and withdraws only in a later invocation", async () => {
    const { operation, repository } = createFixture();

    await expect(
      runVoiceDeletionConsentStep({ operationId: operation.id, userId: operation.user_id }, dependencies(repository))
    ).resolves.toEqual({ kind: "consent_snapshot_sealed" });
    expect(repository.sealConsentSnapshot).toHaveBeenCalledTimes(1);
    expect(repository.withdrawCurrentConsents).not.toHaveBeenCalled();

    await expect(
      runVoiceDeletionConsentStep({ operationId: operation.id, userId: operation.user_id }, dependencies(repository))
    ).resolves.toEqual({ kind: "consent_withdrawn" });
    expect(repository.withdrawCurrentConsents).toHaveBeenCalledTimes(1);
    expect(repository.releaseLease).toHaveBeenCalledTimes(2);
  });

  it("resumes after a lost seal response from the durable consent stage without resealing", async () => {
    const { operation, repository } = createFixture();
    operation.status = "processing";
    operation.current_stage = "consent_withdrawal";
    operation.consent_withdrawal_status = "processing";

    await expect(
      runVoiceDeletionConsentStep({ operationId: operation.id, userId: operation.user_id }, dependencies(repository))
    ).resolves.toEqual({ kind: "consent_withdrawn" });
    expect(repository.sealConsentSnapshot).not.toHaveBeenCalled();
    expect(repository.withdrawCurrentConsents).toHaveBeenCalledTimes(1);
  });

  it("does not mutate a manual operation or an unacquired lease", async () => {
    const { operation, repository } = createFixture();
    operation.status = "manual_required";

    await expect(
      runVoiceDeletionConsentStep({ operationId: operation.id, userId: operation.user_id }, dependencies(repository))
    ).resolves.toEqual({ kind: "manual_required" });
    expect(repository.sealConsentSnapshot).not.toHaveBeenCalled();

    repository.claimExpiredOrAvailableLease = vi.fn(async () => null);
    await expect(
      runVoiceDeletionConsentStep({ operationId: operation.id, userId: operation.user_id }, dependencies(repository))
    ).resolves.toEqual({ kind: "busy" });
  });
});
