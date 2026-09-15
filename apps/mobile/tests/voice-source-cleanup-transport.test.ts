import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ storage: { from: vi.fn() } }) }));
vi.mock("@/lib/supabase/config", () => ({ getSupabaseUrl: () => "https://r1-fixture.invalid", getSupabaseServiceRoleKey: () => "fake-only-key" }));
import { createVoiceSourceCleanupClient } from "@/services/voice/voice-source-cleanup-client";
import { createVoiceSourceCleanupStorageAdapter } from "@/services/voice/voice-source-cleanup-storage-adapter";
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("R1 bounded transport", () => {
  it("bounds each repository request with an abort signal and forbids redirects", async () => {
    const fetch = vi.fn(async () => new Response("null", { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);
    const timeout = vi.spyOn(AbortSignal, "timeout");
    await createVoiceSourceCleanupClient().rpc("select_voice_source_cleanup", { p_after_id: null });
    expect(timeout).toHaveBeenCalledWith(20_000);
    expect(fetch).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ signal: expect.any(AbortSignal), redirect: "error" }));
  });
  it("bounds R1 DELETE while reusing canonical target validation", async () => {
    const fetch = vi.fn(async () => new Response("[]", { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const adapter = createVoiceSourceCleanupStorageAdapter();
    expect(await adapter.deleteObject({ userId: "owner", targetKind: "voice_sample", objectKey: "owner/consent/a.wav" })).toEqual({ kind: "request_succeeded" });
    expect(timeout).toHaveBeenCalledWith(20_000);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/object/voice-samples"), expect.objectContaining({ method: "DELETE", signal: expect.any(AbortSignal) }));
  });
  it("never lets practice recordings or script audio reach DELETE transport", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const adapter = createVoiceSourceCleanupStorageAdapter();
    for (const targetKind of ["recording", "script_audio"] as const) {
      expect(await adapter.deleteObject({ userId: "owner", targetKind, objectKey: "owner/a.wav" })).toEqual({ kind: "invalid_target" });
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it("aborted DELETE remains retryable and is never absence evidence", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("Timeout", "TimeoutError"); }));
    expect(await createVoiceSourceCleanupStorageAdapter().deleteObject({ userId: "owner", targetKind: "voice_consent_recording", objectKey: "owner/a.wav" })).toEqual({ kind: "timed_out" });
  });
});
