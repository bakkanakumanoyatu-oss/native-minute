import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AppError } from "@/lib/errors";
import {
  handleG5cB7ManualProviderRecoveryGet,
  type G5cB7ManualProviderRecoveryRouteDependencies
} from "@/lib/internal/g5c-b7-manual-provider-recovery-route";
import {
  diagnoseStagingManualProviderIncident,
  type StagingManualProviderRecoveryDependencies
} from "@/services/voice-deletion/staging-manual-provider-recovery";
import type { Database } from "@/types/database";
import * as manualProviderRecoveryRoute from "@/app/api/internal/g5c-b7/manual-provider-recovery/route";

type Operation = Database["public"]["Tables"]["voice_deletion_operations"]["Row"];
type Target = Database["public"]["Tables"]["voice_deletion_targets"]["Row"];

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const OPERATION_ID = "33333333-3333-4333-8333-333333333333";
const VOICE_ID = "sealed-voice-target";
const PRIVATE_MESSAGE = "provider-private-message";
const PRIVATE_KEY = "test-only-key";
const STORAGE_PATH = "voice-samples/private.wav";

function request(path = "/api/internal/g5c-b7/manual-provider-recovery") {
  return new NextRequest(`https://native-minute-staging.vercel.app${path}`);
}

function operation(overrides: Partial<Operation> = {}): Operation {
  return {
    id: OPERATION_ID,
    user_id: USER_A,
    status: "manual_required",
    current_stage: "provider_cleanup",
    snapshot_status: "succeeded",
    consent_withdrawal_status: "succeeded",
    destructive_started_at: "2026-08-29T00:00:00.000Z",
    ...overrides
  } as Operation;
}

function target(kind: Target["target_kind"], overrides: Partial<Target> = {}): Target {
  return {
    id: `target-${kind}`,
    operation_id: OPERATION_ID,
    user_id: USER_A,
    target_kind: kind,
    target_fingerprint: `sealed-${kind}`,
    provider_name: kind === "provider_voice" ? "elevenlabs" : null,
    provider_resource_id: kind === "provider_voice" ? VOICE_ID : null,
    status: kind === "provider_voice" ? "manual_required" : "pending",
    delete_outcome: kind === "provider_voice" ? "succeeded" : "not_attempted",
    reconciliation_status: kind === "provider_voice" ? "manual_required" : "not_applicable",
    verification_status: kind === "provider_voice" ? "manual_required" : "pending",
    delete_attempt_count: kind === "provider_voice" ? 1 : 0,
    verification_attempt_count: kind === "provider_voice" ? 1 : 0,
    ...overrides
  } as Target;
}

function exactIncidentTargets() {
  return [
    target("provider_voice"),
    target("voice_sample"),
    target("voice_consent_recording"),
    target("script_audio_storage"),
    target("script_audio"),
    target("voice_binding")
  ];
}

function safeEvidence(overrides: Record<string, unknown> = {}) {
  return {
    adapterOutcome: "present_owner_true",
    httpStatusCategory: "success",
    safeProviderType: "unknown",
    safeProviderCode: "unknown",
    mapperBranch: "present_matching_voice",
    ...overrides
  } as const;
}

function recoveryDependencies(
  overrides: Partial<StagingManualProviderRecoveryDependencies> = {}
): StagingManualProviderRecoveryDependencies & {
  getActiveOperation: ReturnType<typeof vi.fn>;
  listOperationTargets: ReturnType<typeof vi.fn>;
  reconcileVoiceAbsenceWithSafeEvidence: ReturnType<typeof vi.fn>;
  deleteVoice: ReturnType<typeof vi.fn>;
} {
  const getActiveOperation = vi.fn(async () => operation());
  const listOperationTargets = vi.fn(async () => exactIncidentTargets());
  const reconcileVoiceAbsenceWithSafeEvidence = vi.fn(async () => ({
    result: { kind: "present" as const, ownerSignal: "true" as const },
    evidence: safeEvidence()
  }));
  const deleteVoice = vi.fn();

  return {
    repository: { getActiveOperation, listOperationTargets },
    providerAdapter: { reconcileVoiceAbsenceWithSafeEvidence },
    getActiveOperation,
    listOperationTargets,
    reconcileVoiceAbsenceWithSafeEvidence,
    deleteVoice,
    ...overrides
  };
}

function routeDependencies(
  overrides: Partial<G5cB7ManualProviderRecoveryRouteDependencies> = {}
): G5cB7ManualProviderRecoveryRouteDependencies & { diagnose: ReturnType<typeof vi.fn> } {
  const diagnose = vi.fn(async () => ({
    classification: "TARGET_PRESENT_AND_READABLE" as const,
    evidence: safeEvidence()
  }));
  return {
    isCanonicalStagingRuntime: () => true,
    hasSupabaseConfig: () => true,
    createClient: () => ({ auth: {} } as never),
    requireCurrentUser: async () => ({ id: USER_A } as never),
    diagnose,
    ...overrides
  };
}

describe("G5C-B7 manual provider recovery seam", () => {
  it("is GET-only and requires canonical Staging plus an authenticated cookie user", async () => {
    expect("GET" in manualProviderRecoveryRoute).toBe(true);
    expect("DELETE" in manualProviderRecoveryRoute).toBe(false);
    expect(manualProviderRecoveryRoute.dynamic).toBe("force-dynamic");
    expect(manualProviderRecoveryRoute.revalidate).toBe(0);

    const unavailable = routeDependencies({ isCanonicalStagingRuntime: () => false });
    const unauthenticated = routeDependencies({
      requireCurrentUser: async () => {
        throw new AppError(401, "unauthenticated");
      }
    });

    await expect(handleG5cB7ManualProviderRecoveryGet(request(), unavailable)).resolves.toMatchObject({ status: 404 });
    await expect(handleG5cB7ManualProviderRecoveryGet(request(), unauthenticated)).resolves.toMatchObject({ status: 401 });
    expect(unavailable.diagnose).not.toHaveBeenCalled();
    expect(unauthenticated.diagnose).not.toHaveBeenCalled();
  });

  it("rejects all query input before any diagnostic and does not trust the request host", async () => {
    const dependencies = routeDependencies();
    const response = await handleG5cB7ManualProviderRecoveryGet(
      request("/api/internal/g5c-b7/manual-provider-recovery?voiceId=foreign&userId=foreign&operationId=foreign&locator=foreign"),
      dependencies
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    expect(dependencies.diagnose).not.toHaveBeenCalled();
  });

  it("reaches the provider diagnostic seam for the actual legitimate incident shape without a DELETE or durable writer", async () => {
    const dependencies = recoveryDependencies();
    const result = await diagnoseStagingManualProviderIncident(USER_A, dependencies);

    expect(result).toEqual({
      classification: "TARGET_PRESENT_AND_READABLE",
      evidence: safeEvidence()
    });
    expect(dependencies.getActiveOperation).toHaveBeenCalledWith(USER_A);
    expect(dependencies.listOperationTargets).toHaveBeenCalledWith(OPERATION_ID, USER_A);
    expect(dependencies.reconcileVoiceAbsenceWithSafeEvidence).toHaveBeenCalledTimes(1);
    expect(dependencies.reconcileVoiceAbsenceWithSafeEvidence).toHaveBeenCalledWith({ providerResourceId: VOICE_ID });
    expect(dependencies.deleteVoice).not.toHaveBeenCalled();
  });

  it("accepts a canonical untouched Storage target with reconciliation not_applicable", async () => {
    const dependencies = recoveryDependencies();
    const targets = exactIncidentTargets();
    const storageTarget = targets.find((entry) => entry.target_kind === "voice_sample");

    expect(storageTarget).toMatchObject({
      status: "pending",
      delete_outcome: "not_attempted",
      delete_attempt_count: 0,
      verification_attempt_count: 0,
      reconciliation_status: "not_applicable",
      verification_status: "pending"
    });

    await expect(diagnoseStagingManualProviderIncident(USER_A, dependencies)).resolves.toMatchObject({
      classification: "TARGET_PRESENT_AND_READABLE"
    });
    expect(dependencies.reconcileVoiceAbsenceWithSafeEvidence).toHaveBeenCalledTimes(1);
    expect(dependencies.deleteVoice).not.toHaveBeenCalled();
  });

  it("accepts a canonical untouched DB target with reconciliation not_applicable", async () => {
    const dependencies = recoveryDependencies();
    const targets = exactIncidentTargets();
    const databaseTarget = targets.find((entry) => entry.target_kind === "script_audio");

    expect(databaseTarget).toMatchObject({
      status: "pending",
      delete_outcome: "not_attempted",
      delete_attempt_count: 0,
      verification_attempt_count: 0,
      reconciliation_status: "not_applicable",
      verification_status: "pending"
    });

    await expect(diagnoseStagingManualProviderIncident(USER_A, dependencies)).resolves.toMatchObject({
      classification: "TARGET_PRESENT_AND_READABLE"
    });
    expect(dependencies.reconcileVoiceAbsenceWithSafeEvidence).toHaveBeenCalledTimes(1);
    expect(dependencies.deleteVoice).not.toHaveBeenCalled();
  });

  it.each([
    ["wrong operation state", (current: Operation, targets: Target[]) => ({ operation: { ...current, status: "processing" }, targets })],
    ["wrong phase", (current: Operation, targets: Target[]) => ({ operation: { ...current, current_stage: "storage_cleanup" }, targets })],
    ["unsealed snapshot", (current: Operation, targets: Target[]) => ({ operation: { ...current, snapshot_status: "pending" }, targets })],
    ["missing destructive start", (current: Operation, targets: Target[]) => ({ operation: { ...current, destructive_started_at: null }, targets })],
    ["provider delete attempt is not one", (current: Operation, targets: Target[]) => ({ operation: current, targets: targets.map((entry) => entry.target_kind === "provider_voice" ? { ...entry, delete_attempt_count: 2 } : entry) })],
    ["provider delete did not succeed", (current: Operation, targets: Target[]) => ({ operation: current, targets: targets.map((entry) => entry.target_kind === "provider_voice" ? { ...entry, delete_outcome: "rejected" } : entry) })],
    ["provider absence is already durably verified", (current: Operation, targets: Target[]) => ({ operation: current, targets: targets.map((entry) => entry.target_kind === "provider_voice" ? { ...entry, status: "verified_absent", verification_status: "verified_absent" } : entry) })],
    ["Storage cleanup has begun", (current: Operation, targets: Target[]) => ({ operation: current, targets: targets.map((entry) => entry.target_kind === "voice_sample" ? { ...entry, delete_attempt_count: 1, status: "delete_requested" } : entry) })],
    ["database cleanup has begun", (current: Operation, targets: Target[]) => ({ operation: current, targets: targets.map((entry) => entry.target_kind === "script_audio" ? { ...entry, status: "verified_absent", verification_status: "verified_absent" } : entry) })],
    ["an otherwise untouched downstream target has reconciliation pending", (current: Operation, targets: Target[]) => ({ operation: current, targets: targets.map((entry) => entry.target_kind === "voice_sample" ? { ...entry, reconciliation_status: "pending" } : entry) })],
    ["snapshot membership is mismatched", (current: Operation, targets: Target[]) => ({ operation: current, targets: targets.map((entry) => entry.target_kind === "provider_voice" ? { ...entry, operation_id: "foreign-operation" } : entry) })],
    ["cross-user target relation", (current: Operation, targets: Target[]) => ({ operation: current, targets: targets.map((entry) => entry.target_kind === "provider_voice" ? { ...entry, user_id: USER_B } : entry) })]
  ])("fails closed and never reaches the provider when %s", async (_label, mutate) => {
    const dependencies = recoveryDependencies();
    const current = operation();
    const changed = mutate(current, exactIncidentTargets());
    dependencies.getActiveOperation.mockResolvedValue(changed.operation);
    dependencies.listOperationTargets.mockResolvedValue(changed.targets);

    await expect(diagnoseStagingManualProviderIncident(USER_A, dependencies)).resolves.toMatchObject({
      classification: "UNKNOWN",
      evidence: { adapterOutcome: "not_called", mapperBranch: "incident_not_eligible" }
    });
    expect(dependencies.reconcileVoiceAbsenceWithSafeEvidence).not.toHaveBeenCalled();
    expect(dependencies.deleteVoice).not.toHaveBeenCalled();
  });

  it.each([
    [
      { kind: "verified_absent" },
      safeEvidence({ adapterOutcome: "strict_voice_not_found", httpStatusCategory: "not_found", safeProviderType: "not_found", safeProviderCode: "voice_not_found", mapperBranch: "strict_voice_not_found" }),
      "STRICT_VOICE_NOT_FOUND"
    ],
    [{ kind: "auth_failed" }, safeEvidence({ adapterOutcome: "auth_failed", httpStatusCategory: "authentication_rejected", safeProviderCode: "invalid_api_key", mapperBranch: "http_authentication_rejected" }), "AUTHENTICATION_REJECTED"],
    [{ kind: "permission_denied" }, safeEvidence({ adapterOutcome: "permission_denied", httpStatusCategory: "authorization_rejected", mapperBranch: "http_authorization_rejected" }), "AUTHORIZATION_REJECTED"],
    [{ kind: "provider_rejected" }, safeEvidence({ adapterOutcome: "provider_rejected", httpStatusCategory: "provider_rejected", mapperBranch: "http_provider_rejected" }), "PROVIDER_REJECTED"],
    [{ kind: "rate_limited" }, safeEvidence({ adapterOutcome: "rate_limited", httpStatusCategory: "rate_limited", mapperBranch: "http_rate_limited" }), "RATE_LIMITED"],
    [{ kind: "provider_unavailable" }, safeEvidence({ adapterOutcome: "provider_unavailable", httpStatusCategory: "provider_unavailable", mapperBranch: "http_provider_unavailable" }), "PROVIDER_UNAVAILABLE"],
    [{ kind: "protocol_error" }, safeEvidence({ adapterOutcome: "protocol_error", httpStatusCategory: "success", mapperBranch: "present_protocol_error" }), "PROTOCOL_ERROR"],
    [{ kind: "network_error" }, safeEvidence({ adapterOutcome: "network_error", httpStatusCategory: "not_called", mapperBranch: "network_error" }), "UNKNOWN"]
  ])("maps one bounded diagnostic provider result to %s", async (providerResult, evidence, classification) => {
    const dependencies = recoveryDependencies({
      providerAdapter: {
        reconcileVoiceAbsenceWithSafeEvidence: vi.fn(async () => ({ result: providerResult, evidence }))
      } as never
    });

    const result = await diagnoseStagingManualProviderIncident(USER_A, dependencies);
    expect(result).toEqual({ classification, evidence });
    const serialized = JSON.stringify(result);
    for (const sensitive of [VOICE_ID, PRIVATE_MESSAGE, PRIVATE_KEY, STORAGE_PATH, USER_A, OPERATION_ID]) {
      expect(serialized).not.toContain(sensitive);
    }
    expect(dependencies.deleteVoice).not.toHaveBeenCalled();
  });

  it("returns a no-store closed safe DTO without exposing state identifiers", async () => {
    const dependencies = routeDependencies({
      diagnose: vi.fn(async () => ({
        classification: "STRICT_VOICE_NOT_FOUND" as const,
        evidence: safeEvidence({
          adapterOutcome: "strict_voice_not_found",
          httpStatusCategory: "not_found",
          safeProviderType: "not_found",
          safeProviderCode: "voice_not_found",
          mapperBranch: "strict_voice_not_found",
          rawProviderBody: PRIVATE_MESSAGE,
          providerResourceId: VOICE_ID,
          operationId: OPERATION_ID,
          storagePath: STORAGE_PATH,
          apiKey: PRIVATE_KEY,
          userId: USER_A
        })
      }))
    });

    const response = await handleG5cB7ManualProviderRecoveryGet(request(), dependencies);
    const body = await response.json();
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    expect(body).toEqual({
      ok: true,
      data: {
        manualProviderRecovery: {
          classification: "STRICT_VOICE_NOT_FOUND",
          evidence: safeEvidence({
            adapterOutcome: "strict_voice_not_found",
            httpStatusCategory: "not_found",
            safeProviderType: "not_found",
            safeProviderCode: "voice_not_found",
            mapperBranch: "strict_voice_not_found"
          })
        }
      }
    });
    const serialized = JSON.stringify(body);
    for (const sensitive of [VOICE_ID, PRIVATE_MESSAGE, PRIVATE_KEY, STORAGE_PATH, USER_A, OPERATION_ID]) {
      expect(serialized).not.toContain(sensitive);
    }
  });
});
