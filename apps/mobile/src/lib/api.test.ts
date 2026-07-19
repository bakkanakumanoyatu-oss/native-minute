import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchHealth, fetchMobileScripts, initialHealthState } from "./api";

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

describe("fetchMobileScripts", () => {
  it("sends one Bearer credential without cookies and validates owned-list data", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            scripts: [
              {
                id: "script-fixture",
                title: "Morning update",
                content: "A one-minute practice script.",
                targetSeconds: 60,
                locale: "en-US",
                createdAt: "2026-07-18T00:00:00.000Z",
                updatedAt: "2026-07-19T00:00:00.000Z"
              }
            ]
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await expect(
      fetchMobileScripts(BFF_BASE_URL, "access-material-fixture", { fetchImpl })
    ).resolves.toMatchObject({ kind: "success", scripts: [{ id: "script-fixture" }] });
    expect(fetchImpl).toHaveBeenCalledWith(
      BFF_BASE_URL + "/api/mobile/scripts",
      expect.objectContaining({
        method: "GET",
        credentials: "omit",
        cache: "no-store",
        headers: expect.objectContaining({
          Authorization: "Bearer access-material-fixture"
        })
      })
    );
  });

  it.each([
    [401, "session_expired", "unauthorized"],
    [403, "account_deletion_in_progress", "forbidden"]
  ] as const)("maps status %s to a safe state", async (status, reasonCode, kind) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: { reasonCode } }), {
        status,
        headers: { "Content-Type": "application/json" }
      })
    );

    await expect(
      fetchMobileScripts(BFF_BASE_URL, "access-material-fixture", { fetchImpl })
    ).resolves.toEqual({ kind, reasonCode });
  });

  it("honors only a bounded Retry-After value", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: { reasonCode: "rate_limited" } }), {
        status: 429,
        headers: { "Retry-After": "45" }
      })
    );

    await expect(
      fetchMobileScripts(BFF_BASE_URL, "access-material-fixture", { fetchImpl })
    ).resolves.toEqual({ kind: "rate-limited", retryAfterSeconds: 45 });
  });

  it("rejects an unsafe or malformed success body", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data: { scripts: [{ id: "only-id" }] } }), {
        status: 200
      })
    );

    await expect(
      fetchMobileScripts(BFF_BASE_URL, "access-material-fixture", { fetchImpl })
    ).resolves.toEqual({ kind: "invalid-response" });
  });
});
