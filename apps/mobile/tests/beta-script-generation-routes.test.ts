import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SCRIPT_ID = "22222222-2222-4222-8222-222222222222";
const REVISION_ID = "33333333-3333-4333-8333-333333333333";
const ENABLE_ENV = "NATIVE_MINUTE_ENABLE_AI_SCRIPT_GENERATION";
const originalEnableValue = process.env[ENABLE_ENV];

const mocks = vi.hoisted(() => ({
  hasSupabaseConfig: vi.fn(() => true),
  createSupabaseRouteClient: vi.fn(() => ({})),
  requireCurrentUser: vi.fn(async () => ({ id: "11111111-1111-4111-8111-111111111111" })),
  generateScriptStudioDrafts: vi.fn(),
  createScript: vi.fn(),
  updateScript: vi.fn()
}));

vi.mock("@/lib/supabase/config", () => ({ hasSupabaseConfig: mocks.hasSupabaseConfig }));
vi.mock("@/lib/supabase/route", () => ({ createSupabaseRouteClient: mocks.createSupabaseRouteClient }));
vi.mock("@/lib/supabase/auth", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
vi.mock("@/services/script-studio", () => ({ generateScriptStudioDrafts: mocks.generateScriptStudioDrafts }));
vi.mock("@/services/scripts/scripts.service", () => ({
  createScript: mocks.createScript,
  updateScript: mocks.updateScript,
  listScripts: vi.fn(),
  getScript: vi.fn(),
  setScriptArchived: vi.fn(),
  deleteScript: vi.fn()
}));

import { POST as generatePost } from "@/app/api/script-studio/generate/route";
import { POST as createPost } from "@/app/api/scripts/route";
import { PATCH as editPatch } from "@/app/api/scripts/[id]/route";
import { AI_SCRIPT_GENERATION_UNAVAILABLE_MESSAGE } from "@/lib/script-studio/generation-capability";

function request(path: string, body: unknown, method = "POST") {
  return new NextRequest(`https://native-minute.example${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env[ENABLE_ENV];
});

afterEach(() => {
  if (originalEnableValue === undefined) delete process.env[ENABLE_ENV];
  else process.env[ENABLE_ENV] = originalEnableValue;
});

describe("beta AI script generation route", () => {
  it("rejects direct requests before config, auth, parsing, or provider service", async () => {
    for (const body of [{ userSeedText: "A brief" }, { unsupported: true }]) {
      const response = await generatePost(request("/api/script-studio/generate", body));
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ ok: false, message: AI_SCRIPT_GENERATION_UNAVAILABLE_MESSAGE });
    }

    expect(mocks.hasSupabaseConfig).not.toHaveBeenCalled();
    expect(mocks.requireCurrentUser).not.toHaveBeenCalled();
    expect(mocks.generateScriptStudioDrafts).not.toHaveBeenCalled();
  });

  it("reaches the existing authenticated generation service when explicitly enabled", async () => {
    process.env[ENABLE_ENV] = "1";
    const result = { provider: "mock", acceptedDrafts: [] };
    mocks.generateScriptStudioDrafts.mockResolvedValue(result);

    const response = await generatePost(request("/api/script-studio/generate", { userSeedText: "A brief" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: result });
    expect(mocks.requireCurrentUser).toHaveBeenCalledOnce();
    expect(mocks.generateScriptStudioDrafts).toHaveBeenCalledWith({ userSeedText: "A brief" }, { userId: USER_ID });
  });
});

describe("manual Web scripts during the beta gate", () => {
  it("still creates and edits scripts through their own routes", async () => {
    const created = { id: SCRIPT_ID, title: "My script" };
    const edited = { ...created, title: "Revised title" };
    mocks.createScript.mockResolvedValue(created);
    mocks.updateScript.mockResolvedValue(edited);

    const createResponse = await createPost(request("/api/scripts", { title: "My script", content: "Hello there.", targetSeconds: 60, locale: "en-US" }));
    expect(createResponse.status).toBe(201);
    expect(await createResponse.json()).toEqual({ ok: true, data: created });
    expect(mocks.createScript).toHaveBeenCalledOnce();

    const editResponse = await editPatch(
      request(`/api/scripts/${SCRIPT_ID}`, { expectedRevisionId: REVISION_ID, expectedLockVersion: 1, title: "Revised title" }, "PATCH"),
      { params: { id: SCRIPT_ID } }
    );
    expect(editResponse.status).toBe(200);
    expect(await editResponse.json()).toEqual({ ok: true, data: { script: edited } });
    expect(mocks.updateScript).toHaveBeenCalledOnce();
    expect(mocks.generateScriptStudioDrafts).not.toHaveBeenCalled();
  });
});
