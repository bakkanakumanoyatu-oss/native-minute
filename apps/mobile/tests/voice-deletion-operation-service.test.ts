import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

import {
  createVoiceDeletionOperationService,
  type VoiceDeletionOperationServiceDependencies
} from "@/services/voice-deletion/voice-deletion-operation.service";
import type { VoiceDeletionRepository } from "@/services/voice-deletion/voice-deletion.repository";
import type { VoiceOnlyDeletionSnapshot } from "@/services/voice-deletion/voice-deletion.service";
import type { Database } from "@/types/database";

type Operation = Database["public"]["Tables"]["voice_deletion_operations"]["Row"];
type Target = Database["public"]["Tables"]["voice_deletion_targets"]["Row"];

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OPERATION_ID = "22222222-2222-4222-8222-222222222222";

function inventory(options: { relevant?: boolean; manual?: boolean } = {}) {
  return {
    userId: USER_ID,
    targets: {
      voices: options.relevant
        ? [{ appVoiceId: "33333333-3333-4333-8333-333333333333", providerVoiceId: "provider-secret", consentId: null, isDefault: true }]
        : [],
      scriptAudios: [],
      savedModelAudios: [],
      storageObjects: [],
      canonicalVoiceCloningConsent: { consentId: null, status: "withdrawn" }
    },
    manualCandidates: options.manual ? [{ reason: "storage_listing_unavailable", source: "storage" }] : []
  } as unknown as VoiceOnlyDeletionSnapshot;
}

function operation(overrides: Partial<Operation> = {}) {
  return {
    id: OPERATION_ID,
    user_id: USER_ID,
    status: "pending",
    current_stage: null,
    snapshot_status: "pending",
    consent_withdrawal_status: "pending",
    post_delete_verification_status: "pending",
    runner_attempt_count: 0,
    next_retry_at: null,
    ...overrides
  } as Operation;
}

function target(
  targetKind: Target["target_kind"],
  status: Target["status"] = "pending",
  overrides: Partial<Target> = {}
) {
  return {
    id: `target-${targetKind}`,
    operation_id: OPERATION_ID,
    user_id: USER_ID,
    target_kind: targetKind,
    status,
    verification_status: "pending",
    reconciliation_status: targetKind === "provider_voice" ? "pending" : "not_applicable",
    delete_attempt_count: 0,
    ...overrides
  } as Target;
}

function providerTarget(status: Target["status"] = "pending", overrides: Partial<Target> = {}) {
  return target("provider_voice", status, overrides);
}

function storageTarget(status: Target["status"] = "pending", overrides: Partial<Target> = {}) {
  return target("voice_sample", status, overrides);
}

function fixture(initial: Operation | null, snapshot = inventory({ relevant: true })) {
  let current = initial;
  const targets: Target[] = [];
  const repository = {
    getActiveOperation: vi.fn(async () =>
      current && ["pending", "processing", "partial_failure", "manual_required"].includes(current.status)
        ? current
        : null
    ),
    getLatestOperation: vi.fn(async () => current),
    getOperationForUser: vi.fn(async () => current),
    createOrGetActiveOperation: vi.fn(async () => {
      current = operation();
      return { operation: current, created: true };
    }),
    markPreflightManualRequired: vi.fn(async () => {
      current = operation({ status: "manual_required", current_stage: "snapshot", snapshot_status: "manual_required" });
      return current;
    }),
    sealSnapshot: vi.fn(async () => {
      if (current) current.snapshot_status = "succeeded";
      return current;
    }),
    listOperationTargets: vi.fn(async () => targets),
    claimExpiredOrAvailableLease: vi.fn(async (input: { leaseToken: string }) => {
      if (!current) return null;
      current.runner_attempt_count += 1;
      current.lease_token = input.leaseToken;
      return current;
    }),
    releaseLease: vi.fn(async () => true),
    finalizeOperation: vi.fn(async () => {
      if (current) {
        current.status = "completed";
        current.current_stage = null;
      }
      return current;
    })
  } as unknown as VoiceDeletionRepository;
  const runConsentStep = vi.fn();
  const runProviderStep = vi.fn();
  const runStorageStep = vi.fn();
  const runDatabaseStep = vi.fn();
  const runPostDeleteVerificationStep = vi.fn();
  const dependencies = {
    repository,
    collectSnapshot: vi.fn(async () => snapshot),
    runConsentStep,
    runProviderStep,
    runStorageStep,
    runDatabaseStep,
    runPostDeleteVerificationStep,
    createLeaseToken: () => "44444444-4444-4444-8444-444444444444",
    now: () => new Date("2026-08-25T00:00:00.000Z")
  } satisfies VoiceDeletionOperationServiceDependencies;

  return {
    repository,
    dependencies,
    targets,
    get current() {
      return current;
    },
    set current(value: Operation | null) {
      current = value;
    }
  };
}

const input = { client: {} as never, userId: USER_ID };

describe("bounded request-driven voice deletion orchestration", () => {
  it("creates an operation without chaining a second durable step", async () => {
    const state = fixture(null);
    const service = createVoiceDeletionOperationService(state.dependencies);

    await expect(service.request(input)).resolves.toMatchObject({ state: "processing", phase: "snapshot" });
    expect(state.repository.createOrGetActiveOperation).toHaveBeenCalledTimes(1);
    expect(state.repository.sealSnapshot).not.toHaveBeenCalled();
    expect(state.dependencies.runConsentStep).not.toHaveBeenCalled();
  });

  it("recovers the same canonical winner for duplicate request races", async () => {
    const state = fixture(null);
    const winner = operation();
    state.repository.createOrGetActiveOperation = vi.fn(async () => ({ operation: winner, created: false }));
    const service = createVoiceDeletionOperationService(state.dependencies);

    const results = await Promise.all([service.request(input), service.request(input)]);
    expect(results.map((result) => result.state)).toEqual(["processing", "processing"]);
    expect(new Set(results.map((result) => JSON.stringify(result))).size).toBe(1);
  });

  it("uses one POST to seal only the pending snapshot", async () => {
    const state = fixture(operation());
    const service = createVoiceDeletionOperationService(state.dependencies);

    await service.request(input);
    expect(state.repository.sealSnapshot).toHaveBeenCalledTimes(1);
    expect(state.repository.markPreflightManualRequired).not.toHaveBeenCalled();
    expect(state.dependencies.runConsentStep).not.toHaveBeenCalled();
    expect(state.dependencies.runProviderStep).not.toHaveBeenCalled();
  });

  it("resumes a committed main snapshot after response loss without resealing or recreating targets", async () => {
    const committedSnapshot = operation({
      status: "processing",
      current_stage: null,
      snapshot_status: "succeeded"
    });
    const state = fixture(committedSnapshot);
    state.targets.push(providerTarget());
    const service = createVoiceDeletionOperationService(state.dependencies);

    await service.request(input);

    expect(state.current).toBe(committedSnapshot);
    expect(state.repository.createOrGetActiveOperation).not.toHaveBeenCalled();
    expect(state.repository.sealSnapshot).not.toHaveBeenCalled();
    expect(state.targets).toHaveLength(1);
    expect(state.dependencies.runConsentStep).toHaveBeenCalledTimes(1);
    expect(state.dependencies.runProviderStep).not.toHaveBeenCalled();
    expect(state.dependencies.runStorageStep).not.toHaveBeenCalled();
    expect(state.dependencies.runDatabaseStep).not.toHaveBeenCalled();
    expect(state.dependencies.runPostDeleteVerificationStep).not.toHaveBeenCalled();
    expect(state.repository.finalizeOperation).not.toHaveBeenCalled();
  });

  it("keeps GET read-only", async () => {
    const state = fixture(operation());
    const service = createVoiceDeletionOperationService(state.dependencies);

    await service.getStatus(input);
    expect(state.repository.createOrGetActiveOperation).not.toHaveBeenCalled();
    expect(state.repository.sealSnapshot).not.toHaveBeenCalled();
    expect(state.repository.claimExpiredOrAvailableLease).not.toHaveBeenCalled();
    expect(state.dependencies.runConsentStep).not.toHaveBeenCalled();
  });

  it("creates durable manual_required directly from preflight and makes advance inert", async () => {
    const state = fixture(null, inventory({ relevant: true, manual: true }));
    const service = createVoiceDeletionOperationService(state.dependencies);

    await expect(service.request(input)).resolves.toMatchObject({ state: "manual_required", canAdvance: false });
    expect(state.repository.markPreflightManualRequired).toHaveBeenCalledTimes(1);
    expect(state.repository.createOrGetActiveOperation).not.toHaveBeenCalled();
    await service.advance(input);
    expect(state.repository.sealSnapshot).not.toHaveBeenCalled();
    expect(state.dependencies.runProviderStep).not.toHaveBeenCalled();
  });

  it("separates DB completion, verification entry, verification completion, and finalization", async () => {
    const active = operation({
      status: "processing",
      current_stage: "database_cleanup",
      snapshot_status: "succeeded",
      consent_withdrawal_status: "succeeded"
    });
    const state = fixture(active, inventory());
    state.targets.push({
      target_kind: "voice_binding",
      status: "verified_absent",
      verification_status: "verified_absent",
      reconciliation_status: "not_applicable"
    } as Target);
    state.dependencies.runPostDeleteVerificationStep.mockImplementation(async () => {
      if (state.current?.current_stage === "database_cleanup") {
        state.current.current_stage = "post_delete_verification";
        state.current.post_delete_verification_status = "processing";
      } else if (state.current) {
        state.current.post_delete_verification_status = "succeeded";
      }
    });
    const service = createVoiceDeletionOperationService(state.dependencies);

    await service.advance(input);
    expect(state.dependencies.runPostDeleteVerificationStep).toHaveBeenCalledTimes(1);
    expect(state.repository.finalizeOperation).not.toHaveBeenCalled();

    await service.advance(input);
    expect(state.dependencies.runPostDeleteVerificationStep).toHaveBeenCalledTimes(2);
    expect(state.repository.finalizeOperation).not.toHaveBeenCalled();

    await service.advance(input);
    expect(state.repository.finalizeOperation).toHaveBeenCalledTimes(1);
    expect(state.current?.status).toBe("completed");
  });

  it("does not mutate before retry time and advances once after it", async () => {
    const active = operation({
      status: "partial_failure",
      current_stage: "provider_cleanup",
      snapshot_status: "succeeded",
      next_retry_at: "2026-08-25T00:00:30.000Z"
    });
    const state = fixture(active);
    state.targets.push(providerTarget());
    const service = createVoiceDeletionOperationService(state.dependencies);

    await expect(service.advance(input)).resolves.toMatchObject({ canRetry: false, retryAfterSeconds: 30 });
    expect(state.dependencies.runProviderStep).not.toHaveBeenCalled();

    active.next_retry_at = "2026-08-24T23:59:59.000Z";
    await service.advance(input);
    expect(state.dependencies.runProviderStep).toHaveBeenCalledTimes(1);
  });

  it("dispatches only the due Storage runner after a durable Storage partial failure", async () => {
    const state = fixture(operation({
      status: "partial_failure",
      current_stage: "storage_cleanup",
      snapshot_status: "succeeded",
      next_retry_at: "2026-08-24T23:59:59.000Z"
    }));
    state.targets.push(storageTarget());
    const service = createVoiceDeletionOperationService(state.dependencies);

    await service.advance(input);

    expect(state.dependencies.runConsentStep).not.toHaveBeenCalled();
    expect(state.dependencies.runProviderStep).not.toHaveBeenCalled();
    expect(state.dependencies.runStorageStep).toHaveBeenCalledTimes(1);
    expect(state.dependencies.runDatabaseStep).not.toHaveBeenCalled();
    expect(state.dependencies.runPostDeleteVerificationStep).not.toHaveBeenCalled();
    expect(state.repository.finalizeOperation).not.toHaveBeenCalled();
  });

  it("dispatches only the provider runner while a provider target is still pending", async () => {
    const state = fixture(operation({ status: "processing", current_stage: "provider_cleanup", snapshot_status: "succeeded" }));
    state.targets.push(providerTarget());
    const service = createVoiceDeletionOperationService(state.dependencies);

    await service.advance(input);

    expect(state.dependencies.runProviderStep).toHaveBeenCalledTimes(1);
    expect(state.dependencies.runStorageStep).not.toHaveBeenCalled();
    expect(state.dependencies.runDatabaseStep).not.toHaveBeenCalled();
  });

  it.each([
    ["all provider targets are verified absent", [providerTarget("verified_absent", {
      verification_status: "not_applicable",
      reconciliation_status: "verified_absent"
    })]],
    ["the sealed provider target set is empty", []]
  ])("enters Storage only on a later POST when %s", async (_description, targets) => {
    const state = fixture(operation({ status: "processing", current_stage: "provider_cleanup", snapshot_status: "succeeded" }));
    state.targets.push(...targets);
    const service = createVoiceDeletionOperationService(state.dependencies);

    await service.advance(input);

    expect(state.dependencies.runProviderStep).not.toHaveBeenCalled();
    expect(state.dependencies.runStorageStep).toHaveBeenCalledTimes(1);
    expect(state.dependencies.runDatabaseStep).not.toHaveBeenCalled();
  });

  it("does not chain Storage entry after the provider runner completes its final target", async () => {
    const state = fixture(operation({ status: "processing", current_stage: "provider_cleanup", snapshot_status: "succeeded" }));
    const finalProviderTarget = providerTarget();
    state.targets.push(finalProviderTarget);
    state.dependencies.runProviderStep.mockImplementation(async () => {
      finalProviderTarget.status = "verified_absent";
      finalProviderTarget.verification_status = "not_applicable";
      finalProviderTarget.reconciliation_status = "verified_absent";
    });
    const service = createVoiceDeletionOperationService(state.dependencies);

    await service.advance(input);
    expect(state.dependencies.runProviderStep).toHaveBeenCalledTimes(1);
    expect(state.dependencies.runStorageStep).not.toHaveBeenCalled();

    await service.advance(input);
    expect(state.dependencies.runStorageStep).toHaveBeenCalledTimes(1);
  });

  it("dispatches only the Storage runner while a Storage target is still pending", async () => {
    const state = fixture(operation({ status: "processing", current_stage: "storage_cleanup", snapshot_status: "succeeded" }));
    state.targets.push(storageTarget());
    const service = createVoiceDeletionOperationService(state.dependencies);

    await service.advance(input);

    expect(state.dependencies.runStorageStep).toHaveBeenCalledTimes(1);
    expect(state.dependencies.runDatabaseStep).not.toHaveBeenCalled();
  });

  it.each([
    ["all Storage targets are verified absent", [storageTarget("verified_absent", {
      verification_status: "verified_absent",
      reconciliation_status: "not_applicable",
      delete_attempt_count: 1
    })]],
    ["the sealed Storage target set is empty", []]
  ])("enters DB only on a later POST when %s", async (_description, targets) => {
    const state = fixture(operation({ status: "processing", current_stage: "storage_cleanup", snapshot_status: "succeeded" }));
    state.targets.push(...targets);
    const service = createVoiceDeletionOperationService(state.dependencies);

    await service.advance(input);

    expect(state.dependencies.runStorageStep).not.toHaveBeenCalled();
    expect(state.dependencies.runDatabaseStep).toHaveBeenCalledTimes(1);
  });

  it("does not chain DB entry after the Storage runner completes its final target", async () => {
    const state = fixture(operation({ status: "processing", current_stage: "storage_cleanup", snapshot_status: "succeeded" }));
    const finalStorageTarget = storageTarget();
    state.targets.push(finalStorageTarget);
    state.dependencies.runStorageStep.mockImplementation(async () => {
      finalStorageTarget.status = "verified_absent";
      finalStorageTarget.verification_status = "verified_absent";
      finalStorageTarget.reconciliation_status = "not_applicable";
      finalStorageTarget.delete_attempt_count = 1;
    });
    const service = createVoiceDeletionOperationService(state.dependencies);

    await service.advance(input);
    expect(state.dependencies.runStorageStep).toHaveBeenCalledTimes(1);
    expect(state.dependencies.runDatabaseStep).not.toHaveBeenCalled();

    await service.advance(input);
    expect(state.dependencies.runDatabaseStep).toHaveBeenCalledTimes(1);
  });

  it("does not hand off when a manual target remains", async () => {
    const state = fixture(operation({ status: "processing", current_stage: "provider_cleanup", snapshot_status: "succeeded" }));
    state.targets.push(providerTarget("manual_required", { verification_status: "manual_required", reconciliation_status: "manual_required" }));
    const service = createVoiceDeletionOperationService(state.dependencies);

    await service.advance(input);

    expect(state.dependencies.runProviderStep).toHaveBeenCalledTimes(1);
    expect(state.dependencies.runStorageStep).not.toHaveBeenCalled();
  });

  it("does not hand off while a valid partial failure retry is still in the future", async () => {
    const state = fixture(operation({
      status: "partial_failure",
      current_stage: "provider_cleanup",
      snapshot_status: "succeeded",
      next_retry_at: "2026-08-25T00:00:30.000Z"
    }));
    const service = createVoiceDeletionOperationService(state.dependencies);

    await service.advance(input);

    expect(state.dependencies.runProviderStep).not.toHaveBeenCalled();
    expect(state.dependencies.runStorageStep).not.toHaveBeenCalled();
  });

  it.each([
    ["a missing retry timestamp", null],
    ["an invalid retry timestamp", "not-a-timestamp"]
  ])("fails closed for partial_failure with %s without dispatching a runner", async (_description, nextRetryAt) => {
    const state = fixture(operation({
      status: "partial_failure",
      current_stage: "provider_cleanup",
      snapshot_status: "succeeded",
      next_retry_at: nextRetryAt
    }));
    const service = createVoiceDeletionOperationService(state.dependencies);

    await expect(service.advance(input)).resolves.toEqual({
      state: "manual_required",
      phase: "manual_required",
      canRetry: false,
      canAdvance: false
    });
    expect(state.dependencies.runProviderStep).not.toHaveBeenCalled();
    expect(state.dependencies.runStorageStep).not.toHaveBeenCalled();
    expect(state.dependencies.runDatabaseStep).not.toHaveBeenCalled();
    expect(state.repository.claimExpiredOrAvailableLease).not.toHaveBeenCalled();
  });

  it("keeps malformed partial_failure GET status completely read-only", async () => {
    const state = fixture(operation({ status: "partial_failure", next_retry_at: "not-a-timestamp" }));
    const service = createVoiceDeletionOperationService(state.dependencies);

    await expect(service.getStatus(input)).resolves.toMatchObject({ state: "manual_required", canAdvance: false });
    expect(state.repository.markPreflightManualRequired).not.toHaveBeenCalled();
    expect(state.repository.createOrGetActiveOperation).not.toHaveBeenCalled();
    expect(state.repository.sealSnapshot).not.toHaveBeenCalled();
    expect(state.repository.claimExpiredOrAvailableLease).not.toHaveBeenCalled();
  });

  it("keeps provider, Storage, DB, verification, and finalization as separate POST steps", async () => {
    const state = fixture(operation({
      status: "processing",
      current_stage: "provider_cleanup",
      snapshot_status: "succeeded",
      consent_withdrawal_status: "succeeded"
    }));
    const provider = providerTarget();
    const storage = storageTarget();
    const database = target("voice_binding");
    state.targets.push(provider, storage, database);
    state.dependencies.runProviderStep.mockImplementation(async () => {
      provider.status = "verified_absent";
      provider.verification_status = "not_applicable";
      provider.reconciliation_status = "verified_absent";
    });
    state.dependencies.runStorageStep.mockImplementation(async () => {
      if (state.current?.current_stage === "provider_cleanup") {
        state.current.current_stage = "storage_cleanup";
      } else {
        storage.status = "verified_absent";
        storage.verification_status = "verified_absent";
        storage.reconciliation_status = "not_applicable";
        storage.delete_attempt_count = 1;
      }
    });
    state.dependencies.runDatabaseStep.mockImplementation(async () => {
      if (state.current?.current_stage === "storage_cleanup") {
        state.current.current_stage = "database_cleanup";
      } else {
        database.status = "verified_absent";
        database.verification_status = "verified_absent";
        database.reconciliation_status = "not_applicable";
      }
    });
    state.dependencies.runPostDeleteVerificationStep.mockImplementation(async () => {
      if (state.current?.current_stage === "database_cleanup") {
        state.current.current_stage = "post_delete_verification";
        state.current.post_delete_verification_status = "processing";
      } else if (state.current) {
        state.current.post_delete_verification_status = "succeeded";
      }
    });
    const service = createVoiceDeletionOperationService(state.dependencies);

    await service.advance(input); // provider completion
    await service.advance(input); // Storage entry
    await service.advance(input); // Storage completion
    await service.advance(input); // DB entry
    await service.advance(input); // DB completion
    await service.advance(input); // verification entry
    await service.advance(input); // verification completion
    await service.advance(input); // finalizer

    expect(state.dependencies.runProviderStep).toHaveBeenCalledTimes(1);
    expect(state.dependencies.runStorageStep).toHaveBeenCalledTimes(2);
    expect(state.dependencies.runDatabaseStep).toHaveBeenCalledTimes(2);
    expect(state.dependencies.runPostDeleteVerificationStep).toHaveBeenCalledTimes(2);
    expect(state.repository.finalizeOperation).toHaveBeenCalledTimes(1);
    expect(state.current?.status).toBe("completed");
  });
});
