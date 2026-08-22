import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import {
  handleMobileAccountDeletionRequestPost,
  handleMobileAccountDeletionStatusGet,
  type MobileAccountDeletionRouteDependencies
} from "../../../lib/mobile/account-deletion-route";
import type { AccountDeletionRequestView } from "../../../services/account-deletion";
import type { AppSupabaseClient } from "../../../lib/supabase/client";

const BASE_URL = "https://native-minute.example";
const ORIGIN = "capacitor://localhost";
const ACCESS_TOKEN = "header.payload.signature";
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-822222222222";

function mobileRequest(path: string, init: { method?: string; headers?: HeadersInit; body?: BodyInit | null } = {}) {
  const headers = new Headers(init.headers);
  headers.set("Origin", ORIGIN);
  headers.set("Authorization", `Bearer ${ACCESS_TOKEN}`);
  return new NextRequest(`${BASE_URL}${path}`, { ...init, headers });
}

function deletionRequest(status: AccountDeletionRequestView["status"] = "requested"): AccountDeletionRequestView {
  return {
    id: "internal-request-id",
    status,
    requestSource: "in_app",
    failureStage: null,
    failureReasonCode: null,
    cleanup: {
      provider: "pending",
      storage: "pending",
      database: "pending",
      auth: "pending",
      notification: "pending"
    },
    retryCount: 0,
    requestedAt: "2026-08-22T00:00:00.000Z",
    confirmedAt: null,
    processingStartedAt: null,
    completedAt: null,
    cancelledAt: null,
    expiresAt: null,
    lastAttemptedAt: null
  };
}

function dependencies(userId: string, overrides: Partial<MobileAccountDeletionRouteDependencies> = {}) {
  const client = { auth: {} } as unknown as AppSupabaseClient;

  return {
    hasConfig: () => true,
    createClient: () => client,
    validateUser: async () => ({ data: { user: { id: userId } }, error: null }),
    getAccountDeletionStatus: async () => null,
    createAccountDeletionRequest: async () => ({ deletionRequest: deletionRequest(), created: true }),
    ...overrides
  } satisfies MobileAccountDeletionRouteDependencies;
}

describe("mobile account deletion routes", () => {
  it("rejects a request without a bearer token before any deletion service call", async () => {
    const createAccountDeletionRequest = vi.fn();
    const response = await handleMobileAccountDeletionRequestPost(
      new NextRequest(`${BASE_URL}/api/mobile/account-deletion/request`, { method: "POST", headers: { Origin: ORIGIN } }),
      dependencies(USER_A, { createAccountDeletionRequest })
    );

    expect(response.status).toBe(401);
    expect((await response.json()).error.reasonCode).toBe("auth_required");
    expect(createAccountDeletionRequest).not.toHaveBeenCalled();
  });

  it("derives User A from the bearer session and returns only a safe created status", async () => {
    const createAccountDeletionRequest = vi.fn(async () => ({ deletionRequest: deletionRequest(), created: true }));
    const response = await handleMobileAccountDeletionRequestPost(
      mobileRequest("/api/mobile/account-deletion/request", { method: "POST", body: "{}" }),
      dependencies(USER_A, { createAccountDeletionRequest })
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(createAccountDeletionRequest).toHaveBeenCalledWith(USER_A);
    expect(body).toEqual({ ok: true, data: { deletion: { requestState: "requested", nextAction: "wait_for_review", created: true } } });
    expect(JSON.stringify(body)).not.toContain("internal-request-id");
    expect(JSON.stringify(body)).not.toContain(USER_A);
  });

  it("uses the authenticated user for status and never accepts another user's input", async () => {
    const statusForUser = vi.fn(async (_client: AppSupabaseClient, userId: string) =>
      userId === USER_A ? deletionRequest("requested") : null
    );
    const response = await handleMobileAccountDeletionStatusGet(
      mobileRequest("/api/mobile/account-deletion/status"),
      dependencies(USER_B, { getAccountDeletionStatus: statusForUser })
    );

    expect(response.status).toBe(200);
    expect(statusForUser).toHaveBeenCalledWith(expect.anything(), USER_B);
    expect(await response.json()).toEqual({ ok: true, data: { deletion: { requestState: "not_requested", nextAction: "start_request" } } });
  });

  it("reuses an existing request instead of creating a duplicate", async () => {
    const createAccountDeletionRequest = vi.fn(async () => ({ deletionRequest: deletionRequest(), created: false }));
    const response = await handleMobileAccountDeletionRequestPost(
      mobileRequest("/api/mobile/account-deletion/request", { method: "POST", body: "{}" }),
      dependencies(USER_A, { createAccountDeletionRequest })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { deletion: { requestState: "requested", nextAction: "wait_for_review", created: false } } });
  });

  it("rejects client-supplied user identifiers", async () => {
    const createAccountDeletionRequest = vi.fn();
    const response = await handleMobileAccountDeletionRequestPost(
      mobileRequest("/api/mobile/account-deletion/request", { method: "POST", body: JSON.stringify({ userId: USER_B }) }),
      dependencies(USER_A, { createAccountDeletionRequest })
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.reasonCode).toBe("request_invalid");
    expect(createAccountDeletionRequest).not.toHaveBeenCalled();
  });
});
