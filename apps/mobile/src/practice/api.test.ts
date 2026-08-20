import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import type { MobileAuthController } from "../auth/mobile-auth";
import {
  createPracticeApi,
  getPracticeErrorCopy,
  isPracticeOwnerStateCurrent,
  recordMobileApiTiming,
  shouldRefreshPracticeRequest
} from "./api";

describe("practice request state", () => {
  it("refreshes only a server-expired session", () => {
    expect(shouldRefreshPracticeRequest({ kind: "unauthorized", reasonCode: "session_expired" })).toBe(true);
    expect(shouldRefreshPracticeRequest({ kind: "unauthorized", reasonCode: "session_invalid" })).toBe(false);
  });

  it("maps failures to fixed safe copy without provider or raw server detail", () => {
    const copy = getPracticeErrorCopy({ kind: "server-error", status: 503 });
    expect(copy).toContain("再試行");
    expect(copy).not.toContain("503");
    expect(copy).not.toContain("provider");
  });

  it("gives a fresh-user voice sample a Japanese re-record recovery without exposing server detail", () => {
    const copy = getPracticeErrorCopy({ kind: "invalid-request", reasonCode: "voice_sample_invalid" });
    expect(copy).toContain("もう一度録音");
    expect(copy).not.toContain("ElevenLabs");
    expect(copy).not.toContain("storage://");
  });

  it("keeps the frozen owner valid only during authenticated refresh lifecycle state", () => {
    expect(isPracticeOwnerStateCurrent({ kind: "refreshing" }, "user-a")).toBe(true);
    expect(isPracticeOwnerStateCurrent({ kind: "authenticated", userId: "user-a" }, "user-a")).toBe(true);
    expect(isPracticeOwnerStateCurrent({ kind: "authenticated", userId: "user-b" }, "user-a")).toBe(false);
    expect(isPracticeOwnerStateCurrent({ kind: "signing_out" }, "user-a")).toBe(false);
  });

  it("allows an in-flight lifecycle refresh without surfacing owner change or signing out", async () => {
    const onSessionInvalid = vi.fn();
    const onTiming = vi.fn();
    const auth = {
      getState: () => ({ kind: "refreshing" as const }),
      getAccessToken: vi.fn().mockResolvedValue("access-token"),
      refresh: vi.fn(),
      signOut: vi.fn()
    } as unknown as MobileAuthController;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      data: { scripts: [] }
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    })));

    try {
      const api = createPracticeApi({
        auth,
        bffBaseUrl: "https://mobile.example.test",
        ownerUserId: "user-a",
        onSessionInvalid,
        onTiming
      });

      await expect(api.listScripts()).resolves.toEqual({ kind: "success", scripts: [] });
      expect(onSessionInvalid).not.toHaveBeenCalled();
      expect(auth.refresh).not.toHaveBeenCalled();
      expect(onTiming).toHaveBeenCalledWith(expect.objectContaining({ label: "request" }));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("shares one in-flight listen generation across screen remounts for the same owner", async () => {
    let resolveFetch!: (response: Response) => void;
    const fetchImpl = vi.fn(
      () => new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      })
    );
    const auth = {
      getState: () => ({ kind: "authenticated" as const, userId: "user-a" }),
      getAccessToken: vi.fn().mockResolvedValue("access-token"),
      refresh: vi.fn(),
      signOut: vi.fn()
    } as unknown as MobileAuthController;
    vi.stubGlobal("fetch", fetchImpl);

    try {
      const api = createPracticeApi({
        auth,
        bffBaseUrl: "https://mobile.example.test",
        ownerUserId: "user-a"
      });
      const first = api.requestListen("script-a");
      const second = api.requestListen("script-a");

      await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
      resolveFetch(new Response(JSON.stringify({
        ok: true,
        data: { audioId: "audio-a", cached: false }
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      }));

      await expect(Promise.all([first, second])).resolves.toEqual([
        { kind: "success", audioId: "audio-a", cached: false },
        { kind: "success", audioId: "audio-a", cached: false }
      ]);
      expect(auth.getAccessToken).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("records API timing with static labels and no owner, IDs, token, or content detail", () => {
    const sink = {
      clearMeasures: vi.fn(),
      measure: vi.fn()
    } as unknown as Pick<Performance, "clearMeasures" | "measure">;

    expect(recordMobileApiTiming({ label: "evaluate_total", durationMs: 123 }, sink)).toBe("mobile_api_evaluate_total");
    expect(sink.measure).toHaveBeenCalledWith("mobile_api_evaluate_total", {
      start: 0,
      duration: 123
    });
  });
});
