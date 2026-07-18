import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchHealth, initialHealthState } from "./api";

const BFF_BASE_URL = "https://native-minute.example";

afterEach(() => {
  vi.useRealTimers();
});

describe("initialHealthState", () => {
  it("shows an offline state without attempting a request", () => {
    expect(initialHealthState(false)).toEqual({ kind: "offline" });
  });
});

describe("fetchHealth", () => {
  it("returns connected for the safe health response", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            status: "ok",
            service: "native-minute-bff",
            timestamp: "2026-07-18T00:00:00.000Z"
          }
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        }
      )
    );

    await expect(fetchHealth(BFF_BASE_URL, { fetchImpl })).resolves.toEqual({
      kind: "connected",
      service: "native-minute-bff"
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      BFF_BASE_URL + "/api/mobile/health",
      expect.objectContaining({
        method: "GET",
        credentials: "omit",
        cache: "no-store"
      })
    );
  });

  it("distinguishes server errors from network errors", async () => {
    const serverErrorFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }));
    const networkErrorFetch = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("network unavailable"));

    await expect(fetchHealth(BFF_BASE_URL, { fetchImpl: serverErrorFetch })).resolves.toEqual({
      kind: "server-error",
      status: 503
    });
    await expect(fetchHealth(BFF_BASE_URL, { fetchImpl: networkErrorFetch })).resolves.toEqual({
      kind: "network-error"
    });
  });

  it("rejects a response that does not match the public contract", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data: { status: "unknown" } }), {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      })
    );

    await expect(fetchHealth(BFF_BASE_URL, { fetchImpl })).resolves.toEqual({
      kind: "invalid-response"
    });
  });

  it("returns timeout after aborting a slow request", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation((_input, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    });

    const resultPromise = fetchHealth(BFF_BASE_URL, {
      fetchImpl,
      timeoutMs: 10
    });
    await vi.advanceTimersByTimeAsync(10);

    await expect(resultPromise).resolves.toEqual({ kind: "timeout" });
  });
});
