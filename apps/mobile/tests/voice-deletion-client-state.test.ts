import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  mapVoiceDeletionClientState,
  type SafeVoiceDeletionClientState
} from "@/services/voice-deletion/voice-deletion-client-state";
import type { VoiceOnlyDeletionSnapshot } from "@/services/voice-deletion/voice-deletion.service";
import type { Database } from "@/types/database";

type Operation = Database["public"]["Tables"]["voice_deletion_operations"]["Row"];

function inventory(options: { voice?: boolean; activeConsent?: boolean; manual?: boolean } = {}) {
  return {
    targets: {
      voices: options.voice ? [{ appVoiceId: "secret", providerVoiceId: "provider-secret" }] : [],
      scriptAudios: [],
      savedModelAudios: [],
      storageObjects: [],
      canonicalVoiceCloningConsent: { status: options.activeConsent ? "active" : "withdrawn" }
    },
    manualCandidates: options.manual ? [{ reason: "secret-reason" }] : []
  } as unknown as VoiceOnlyDeletionSnapshot;
}

function operation(status: Operation["status"], overrides: Partial<Operation> = {}) {
  return {
    status,
    current_stage: "provider_cleanup",
    next_retry_at: null,
    ...overrides
  } as Operation;
}

describe("voice deletion safe client-state mapping", () => {
  it("maps a durable failed state to non-retryable manual_required", () => {
    expect(mapVoiceDeletionClientState({ operation: operation("failed"), inventory: inventory() })).toEqual({
      state: "manual_required",
      phase: "manual_required",
      canRetry: false,
      canAdvance: false
    });
  });

  it("fails safe when a durable schema stage is failed even if the operation row says processing", () => {
    expect(
      mapVoiceDeletionClientState({
        operation: operation("processing", { post_delete_verification_status: "failed" }),
        inventory: inventory()
      })
    ).toMatchObject({ state: "manual_required", canRetry: false, canAdvance: false });
  });

  it("keeps partial failure unavailable before retry time and enables it after", () => {
    const before = mapVoiceDeletionClientState({
      operation: operation("partial_failure", { next_retry_at: "2026-08-25T00:00:30.000Z" }),
      inventory: inventory({ voice: true }),
      now: new Date("2026-08-25T00:00:00.000Z")
    });
    const after = mapVoiceDeletionClientState({
      operation: operation("partial_failure", { next_retry_at: "2026-08-25T00:00:00.000Z" }),
      inventory: inventory({ voice: true }),
      now: new Date("2026-08-25T00:00:01.000Z")
    });

    expect(before).toEqual({
      state: "retry_available",
      phase: "provider_cleanup",
      canRetry: false,
      canAdvance: false,
      retryAfterSeconds: 30
    });
    expect(after).toMatchObject({ state: "retry_available", canRetry: true, canAdvance: true });
  });

  it.each([
    ["a missing retry timestamp", null],
    ["an invalid retry timestamp", "not-a-timestamp"]
  ])("fails closed for partial_failure with %s", (_description, nextRetryAt) => {
    expect(
      mapVoiceDeletionClientState({
        operation: operation("partial_failure", { next_retry_at: nextRetryAt }),
        inventory: inventory({ voice: true }),
        now: new Date("2026-08-25T00:00:00.000Z")
      })
    ).toEqual({
      state: "manual_required",
      phase: "manual_required",
      canRetry: false,
      canAdvance: false
    });
  });

  it("returns already_no_voice without history and completed after response loss", () => {
    expect(mapVoiceDeletionClientState({ operation: null, inventory: inventory() })).toMatchObject({
      state: "already_no_voice"
    });
    expect(mapVoiceDeletionClientState({ operation: operation("completed"), inventory: inventory() })).toMatchObject({
      state: "completed"
    });
  });

  it("does not let an old completed operation hide a fresh voice setup", () => {
    const state: SafeVoiceDeletionClientState = mapVoiceDeletionClientState({
      operation: operation("completed"),
      inventory: inventory({ voice: true, activeConsent: true })
    });
    expect(state).toEqual({ state: "not_requested", phase: "none", canRetry: false, canAdvance: false });
    expect(JSON.stringify(state)).not.toContain("secret");
  });
});
