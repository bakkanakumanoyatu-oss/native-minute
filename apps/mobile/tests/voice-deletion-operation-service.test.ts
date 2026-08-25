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
    const service = createVoiceDeletionOperationService(state.dependencies);

    await expect(service.advance(input)).resolves.toMatchObject({ canRetry: false, retryAfterSeconds: 30 });
    expect(state.dependencies.runProviderStep).not.toHaveBeenCalled();

    active.next_retry_at = "2026-08-24T23:59:59.000Z";
    await service.advance(input);
    expect(state.dependencies.runProviderStep).toHaveBeenCalledTimes(1);
  });
});
