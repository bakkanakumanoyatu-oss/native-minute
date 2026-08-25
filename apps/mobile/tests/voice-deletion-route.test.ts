import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

import {
  handleMobileVoiceDeletionAdvancePost,
  handleMobileVoiceDeletionRequestPost,
  handleMobileVoiceDeletionStatusGet,
  type MobileVoiceDeletionRouteDependencies
} from "@/lib/mobile/voice-deletion-route";
import type { AppSupabaseClient } from "@/lib/supabase/client";

const BASE_URL = "https://native-minute.example";
const ORIGIN = "capacitor://localhost";
const TOKEN = "header.payload.signature";
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

function request(path: string, options: { method?: string; body?: string; bearer?: boolean; cookie?: string } = {}) {
  const headers = new Headers({ Origin: ORIGIN });
  if (options.bearer !== false) headers.set("Authorization", `Bearer ${TOKEN}`);
  if (options.cookie) headers.set("Cookie", options.cookie);
  return new NextRequest(`${BASE_URL}${path}`, { method: options.method, body: options.body, headers });
}

function dependencies(userId = USER_A, overrides: Partial<MobileVoiceDeletionRouteDependencies> = {}) {
  const client = { auth: {} } as AppSupabaseClient;
  const state = { state: "processing", phase: "provider_cleanup", canRetry: false, canAdvance: true } as const;
  return {
    hasConfig: () => true,
    createClient: () => client,
    validateUser: async () => ({ data: { user: { id: userId } }, error: null }),
    getStatus: async () => state,
    requestDeletion: async () => state,
    advanceDeletion: async () => state,
    ...overrides
  } satisfies MobileVoiceDeletionRouteDependencies;
}

describe("mobile voice deletion Bearer-only BFF", () => {
  it("does not accept cookies when the Bearer token is absent", async () => {
    const getStatus = vi.fn();
    const response = await handleMobileVoiceDeletionStatusGet(
      request("/api/mobile/voice-deletion/status", { bearer: false, cookie: "sb-session=secret" }),
      dependencies(USER_A, { getStatus })
    );

    expect(response.status).toBe(401);
    expect((await response.json()).error.reasonCode).toBe("auth_required");
    expect(getStatus).not.toHaveBeenCalled();
  });

  it("uses only the Bearer-authenticated user and returns no raw authority fields", async () => {
    const getStatus = vi.fn(async (input: { userId: string }) => {
      expect(input.userId).toBe(USER_B);
      return { state: "completed", phase: "completed", canRetry: false, canAdvance: false } as const;
    });
    const response = await handleMobileVoiceDeletionStatusGet(
      request("/api/mobile/voice-deletion/status"),
      dependencies(USER_B, { getStatus })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      data: { deletion: { state: "completed", phase: "completed", canRetry: false, canAdvance: false } }
    });
    expect(JSON.stringify(body)).not.toContain(USER_B);
    expect(JSON.stringify(body)).not.toMatch(/operationId|targetId|providerVoice|storage|locator|lease|error/i);
  });

  it.each([
    { operationId: "foreign" },
    { targetId: "foreign" },
    { userId: USER_B },
    { voiceId: "foreign" },
    { providerId: "foreign" },
    { locator: "foreign" }
  ])("rejects client authority input %#", async (payload) => {
    const requestDeletion = vi.fn();
    const response = await handleMobileVoiceDeletionRequestPost(
      request("/api/mobile/voice-deletion/request", { method: "POST", body: JSON.stringify(payload) }),
      dependencies(USER_A, { requestDeletion })
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.reasonCode).toBe("request_invalid");
    expect(requestDeletion).not.toHaveBeenCalled();
  });

  it("allows advance only through the authenticated user's empty request", async () => {
    const advanceDeletion = vi.fn(async (input: { userId: string }) => {
      expect(input.userId).toBe(USER_A);
      return { state: "processing", phase: "storage_cleanup", canRetry: false, canAdvance: true } as const;
    });
    const response = await handleMobileVoiceDeletionAdvancePost(
      request("/api/mobile/voice-deletion/advance", { method: "POST", body: "{}" }),
      dependencies(USER_A, { advanceDeletion })
    );

    expect(response.status).toBe(200);
    expect(advanceDeletion).toHaveBeenCalledTimes(1);
  });

  it("keeps GET at exactly one read-only service call", async () => {
    const getStatus = vi.fn(async () => ({
      state: "already_no_voice",
      phase: "none",
      canRetry: false,
      canAdvance: false
    } as const));
    const requestDeletion = vi.fn();
    const advanceDeletion = vi.fn();
    await handleMobileVoiceDeletionStatusGet(
      request("/api/mobile/voice-deletion/status"),
      dependencies(USER_A, { getStatus, requestDeletion, advanceDeletion })
    );

    expect(getStatus).toHaveBeenCalledTimes(1);
    expect(requestDeletion).not.toHaveBeenCalled();
    expect(advanceDeletion).not.toHaveBeenCalled();
  });
});
