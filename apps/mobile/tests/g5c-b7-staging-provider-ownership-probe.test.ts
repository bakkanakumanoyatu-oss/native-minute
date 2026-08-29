import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AppError } from "@/lib/errors";
import {
  handleG5cB7ProviderOwnershipProbeGet,
  isCanonicalNativeMinuteStagingRuntime,
  type G5cB7ProviderOwnershipProbeRouteDependencies
} from "@/lib/internal/g5c-b7-provider-ownership-probe-route";
import {
  probeStagingProviderOwnership,
  type StagingProviderOwnershipProbeDependencies
} from "@/services/voice-deletion/staging-provider-ownership-probe";
import type { Database } from "@/types/database";

type Operation = Database["public"]["Tables"]["voice_deletion_operations"]["Row"];
type Target = Database["public"]["Tables"]["voice_deletion_targets"]["Row"];

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const OPERATION_ID = "33333333-3333-4333-8333-333333333333";
const TARGET_ID = "44444444-4444-4444-8444-444444444444";
const VOICE_ID = "sealed-voice-target";
const PROVIDER_PAYLOAD = { voice_id: VOICE_ID, is_owner: true, secret: "must-not-leak" };

function request(path = "/api/internal/g5c-b7/provider-ownership-probe") {
  return new NextRequest(`https://native-minute-staging.vercel.app${path}`);
}

function operation(overrides: Partial<Operation> = {}): Operation {
  return {
    id: OPERATION_ID,
    user_id: USER_A,
    status: "processing",
    snapshot_status: "succeeded",
    destructive_started_at: null,
    ...overrides
  } as Operation;
}

function target(overrides: Partial<Target> = {}): Target {
  return {
    id: TARGET_ID,
    operation_id: OPERATION_ID,
    user_id: USER_A,
    target_kind: "provider_voice",
    provider_name: "elevenlabs",
    provider_resource_id: VOICE_ID,
    ...overrides
  } as Target;
}

function probeDependencies(
  overrides: Partial<StagingProviderOwnershipProbeDependencies> = {}
): StagingProviderOwnershipProbeDependencies & {
  getActiveOperation: ReturnType<typeof vi.fn>;
  listOperationTargets: ReturnType<typeof vi.fn>;
  reconcileVoiceAbsence: ReturnType<typeof vi.fn>;
  deleteVoice: ReturnType<typeof vi.fn>;
} {
  const getActiveOperation = vi.fn(async () => operation());
  const listOperationTargets = vi.fn(async () => [target()]);
  const reconcileVoiceAbsence = vi.fn(async () => ({ kind: "present" as const, ownerSignal: "true" as const }));
  const deleteVoice = vi.fn();

  return {
    repository: {
      getActiveOperation,
      listOperationTargets
    },
    providerAdapter: {
      reconcileVoiceAbsence,
      deleteVoice
    } as StagingProviderOwnershipProbeDependencies["providerAdapter"],
    getActiveOperation,
    listOperationTargets,
    reconcileVoiceAbsence,
    deleteVoice,
    ...overrides
  };
}

function routeDependencies(
  overrides: Partial<G5cB7ProviderOwnershipProbeRouteDependencies> = {}
): G5cB7ProviderOwnershipProbeRouteDependencies & { probe: ReturnType<typeof vi.fn> } {
  const probe = vi.fn(async () => ({ classification: "TARGET_PRESENT_AND_READABLE" as const }));
  return {
    isCanonicalStagingRuntime: () => true,
    hasSupabaseConfig: () => true,
    createClient: () => ({ auth: {} } as never),
    requireCurrentUser: async () => ({ id: USER_A } as never),
    probe,
    ...overrides
  };
}

describe("G5C-B7 staging-only provider ownership probe", () => {
  it("requires canonical Vercel Staging identity rather than Host or local environment", () => {
    const staging = {
      VERCEL: "1",
      VERCEL_ENV: "production",
      VERCEL_PROJECT_PRODUCTION_URL: "native-minute-staging.vercel.app",
      NEXT_PUBLIC_SUPABASE_URL: "https://ztlliqishddrrvqqrrlu.supabase.co"
    };

    expect(isCanonicalNativeMinuteStagingRuntime(staging)).toBe(true);
    expect(isCanonicalNativeMinuteStagingRuntime({ ...staging, VERCEL_ENV: "preview" })).toBe(false);
    expect(
      isCanonicalNativeMinuteStagingRuntime({
        ...staging,
        VERCEL_PROJECT_PRODUCTION_URL: "native-minute.vercel.app"
      })
    ).toBe(false);
    expect(
      isCanonicalNativeMinuteStagingRuntime({
        ...staging,
        NEXT_PUBLIC_SUPABASE_URL: "https://other-project.supabase.co"
      })
    ).toBe(false);
  });

  it("denies unauthenticated requests without invoking the probe", async () => {
    const dependencies = routeDependencies({
      requireCurrentUser: async () => {
        throw new AppError(401, "unauthenticated");
      }
    });

    const response = await handleG5cB7ProviderOwnershipProbeGet(request(), dependencies);
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    expect(dependencies.probe).not.toHaveBeenCalled();
  });

  it("fails closed outside canonical Staging", async () => {
    const dependencies = routeDependencies({ isCanonicalStagingRuntime: () => false });
    const response = await handleG5cB7ProviderOwnershipProbeGet(request(), dependencies);

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    expect(dependencies.probe).not.toHaveBeenCalled();
  });

  it("rejects every client-controlled target field before authentication-derived probing", async () => {
    const dependencies = routeDependencies();
    const response = await handleG5cB7ProviderOwnershipProbeGet(
      request("/api/internal/g5c-b7/provider-ownership-probe?voiceId=foreign&userId=foreign&locator=foreign"),
      dependencies
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    expect(dependencies.probe).not.toHaveBeenCalled();
  });

  it("derives exactly the authenticated user's sealed provider target and calls GET-only reconciliation", async () => {
    const dependencies = probeDependencies();
    const result = await probeStagingProviderOwnership(USER_A, dependencies);

    expect(result).toEqual({ classification: "TARGET_PRESENT_AND_READABLE" });
    expect(dependencies.getActiveOperation).toHaveBeenCalledWith(USER_A);
    expect(dependencies.listOperationTargets).toHaveBeenCalledWith(OPERATION_ID, USER_A);
    expect(dependencies.reconcileVoiceAbsence).toHaveBeenCalledWith({ providerResourceId: VOICE_ID });
    expect(dependencies.deleteVoice).not.toHaveBeenCalled();
  });

  it("fails closed for an operation ownership mismatch, a target snapshot mismatch, and cross-user access", async () => {
    const operationMismatch = probeDependencies({
      repository: {
        getActiveOperation: vi.fn(async () => operation({ user_id: USER_B })),
        listOperationTargets: vi.fn()
      }
    });
    const targetMismatch = probeDependencies({
      repository: {
        getActiveOperation: vi.fn(async () => operation()),
        listOperationTargets: vi.fn(async () => [target({ operation_id: "foreign-operation" })])
      }
    });
    const unsealed = probeDependencies({
      repository: {
        getActiveOperation: vi.fn(async () => operation({ snapshot_status: "pending" })),
        listOperationTargets: vi.fn()
      }
    });
    const crossUser = probeDependencies({
      repository: {
        getActiveOperation: vi.fn(async (userId: string) => (userId === USER_B ? null : operation())),
        listOperationTargets: vi.fn(async () => [target()])
      }
    });

    await expect(probeStagingProviderOwnership(USER_A, operationMismatch)).resolves.toEqual({ classification: "UNKNOWN" });
    await expect(probeStagingProviderOwnership(USER_A, targetMismatch)).resolves.toEqual({ classification: "UNKNOWN" });
    await expect(probeStagingProviderOwnership(USER_A, unsealed)).resolves.toEqual({ classification: "UNKNOWN" });
    await expect(probeStagingProviderOwnership(USER_B, crossUser)).resolves.toEqual({ classification: "UNKNOWN" });
    expect(operationMismatch.reconcileVoiceAbsence).not.toHaveBeenCalled();
    expect(targetMismatch.reconcileVoiceAbsence).not.toHaveBeenCalled();
    expect(unsealed.reconcileVoiceAbsence).not.toHaveBeenCalled();
    expect(crossUser.reconcileVoiceAbsence).not.toHaveBeenCalled();
  });

  it.each([
    [{ kind: "verified_absent" as const }, "VOICE_NOT_FOUND"],
    [{ kind: "auth_failed" as const }, "AUTHENTICATION_REJECTED"],
    [{ kind: "provider_rejected" as const }, "PROVIDER_REJECTED"]
  ])("returns only a sanitized DTO for provider result %#", async (providerResult, classification) => {
    const rawProviderResult = {
      ...providerResult,
      rawProviderResponse: PROVIDER_PAYLOAD
    } as unknown as Awaited<
      ReturnType<StagingProviderOwnershipProbeDependencies["providerAdapter"]["reconcileVoiceAbsence"]>
    >;
    const dependencies = probeDependencies({
      providerAdapter: {
        reconcileVoiceAbsence: vi.fn(async () => rawProviderResult)
      }
    });

    const result = await probeStagingProviderOwnership(USER_A, dependencies);
    expect(result).toEqual({ classification });
    expect(JSON.stringify(result)).not.toContain(VOICE_ID);
    expect(JSON.stringify(result)).not.toContain("must-not-leak");
    expect(dependencies.deleteVoice).not.toHaveBeenCalled();
  });

  it("returns a no-store safe DTO and performs no durable mutation", async () => {
    const dependencies = routeDependencies({
      probe: vi.fn(async () => ({ classification: "VOICE_NOT_FOUND" as const }))
    });
    const response = await handleG5cB7ProviderOwnershipProbeGet(request(), dependencies);
    const body = await response.json();

    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    expect(body).toEqual({ ok: true, data: { providerOwnershipProbe: { classification: "VOICE_NOT_FOUND" } } });
    expect(JSON.stringify(body)).not.toContain(VOICE_ID);
    expect(JSON.stringify(body)).not.toContain(USER_A);
  });
});
