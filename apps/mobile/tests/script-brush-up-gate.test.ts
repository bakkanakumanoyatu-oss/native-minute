import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  acceptScriptBrushUpConsent: vi.fn(),
  getScriptBrushUpView: vi.fn(),
  generateScriptBrushUpCandidate: vi.fn(),
  decideScriptBrushUpCandidate: vi.fn(),
  retryScriptBrushUpCleanup: vi.fn()
}));
vi.mock("@/lib/supabase/auth", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
vi.mock("@/lib/supabase/route", () => ({ createSupabaseRouteClient: vi.fn() }));
vi.mock("@/services/brush-up/brush-up.service", () => mocks);

import { GET as webGet, POST as webPost } from "@/app/api/script-brush-up/candidates/route";
import { GET as mobileGet, POST as mobilePost } from "@/app/api/mobile/script-brush-up/route";

const previous = process.env.NATIVE_MINUTE_ENABLE_SCRIPT_BRUSH_UP;

function request(path: string, method: "GET" | "POST") {
  return new NextRequest(`https://native-minute.example${path}`, {
    method,
    headers: { "Content-Type": "application/json", Origin: "capacitor://localhost" },
    ...(method === "POST" ? { body: JSON.stringify({ action: "generate" }) } : {})
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.NATIVE_MINUTE_ENABLE_SCRIPT_BRUSH_UP;
});
afterEach(() => {
  if (previous === undefined) delete process.env.NATIVE_MINUTE_ENABLE_SCRIPT_BRUSH_UP;
  else process.env.NATIVE_MINUTE_ENABLE_SCRIPT_BRUSH_UP = previous;
});

describe("brush-up default OFF boundary", () => {
  it("rejects Web and Mobile direct API calls before auth or provider work", async () => {
    const responses = await Promise.all([
      webGet(request("/api/script-brush-up/candidates", "GET")),
      webPost(request("/api/script-brush-up/candidates", "POST")),
      mobileGet(request("/api/mobile/script-brush-up", "GET")),
      mobilePost(request("/api/mobile/script-brush-up", "POST"))
    ]);
    expect(responses.map(response => response.status)).toEqual([403, 403, 403, 403]);
    expect(mocks.requireCurrentUser).not.toHaveBeenCalled();
    expect(mocks.acceptScriptBrushUpConsent).not.toHaveBeenCalled();
    expect(mocks.getScriptBrushUpView).not.toHaveBeenCalled();
    expect(mocks.generateScriptBrushUpCandidate).not.toHaveBeenCalled();
    expect(mocks.decideScriptBrushUpCandidate).not.toHaveBeenCalled();
  });
});
