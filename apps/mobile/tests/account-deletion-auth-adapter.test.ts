import { AuthRetryableFetchError } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  ACCOUNT_DELETION_AUTH_REQUEST_TIMEOUT_MS,
  createAccountDeletionAuthAdapter,
  createAccountDeletionAuthBoundedFetch,
  type SupabaseAuthAdminLike
} from "@/services/account-deletion/account-deletion-auth-adapter";

const TARGET = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function client(input: {
  get?: unknown | (() => Promise<unknown>);
  deletion?: unknown | (() => Promise<unknown>);
}) {
  const getUserById = vi.fn(async () =>
    typeof input.get === "function" ? input.get() : input.get
  );
  const deleteUser = vi.fn(async () =>
    typeof input.deletion === "function" ? input.deletion() : input.deletion
  );
  return {
    value: { auth: { admin: { getUserById, deleteUser } } } as unknown as SupabaseAuthAdminLike,
    getUserById,
    deleteUser
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("G5D-2O installed-SDK Auth adapter normalization", () => {
  it.each([
    ["present exact", { data: { user: { id: TARGET } }, error: null }, "present"],
    ["strict absent", { data: { user: null }, error: { status: 404, code: "user_not_found" } }, "verified_absent"],
    ["permission", { data: { user: null }, error: { status: 403, code: "forbidden" } }, "permission_denied"],
    ["rate limited", { data: { user: null }, error: { status: 429, code: "rate_limited" } }, "rate_limited"],
    ["5xx", { data: { user: null }, error: { status: 503, code: "unavailable" } }, "unavailable"],
    ["network status zero", { data: { user: null }, error: new AuthRetryableFetchError("network_error", 0) }, "network_error"],
    ["bounded timeout", { data: { user: null }, error: new AuthRetryableFetchError("request_timeout", 0) }, "timeout"],
    ["malformed 200 null", { data: { user: null }, error: null }, "malformed"],
    ["partial 404", { data: { user: undefined }, error: { status: 404, code: "user_not_found" } }, "malformed"],
    ["ID mismatch", { data: { user: { id: OTHER } }, error: null }, "mismatched_user"]
  ])("GET %s is strict, redacted, and single-call", async (_label, response, expectedKind) => {
    const mocked = client({ get: response });
    const result = await createAccountDeletionAuthAdapter(mocked.value).getUserById(TARGET);

    expect(result).toEqual({ kind: expectedKind });
    expect(mocked.getUserById).toHaveBeenCalledTimes(1);
    expect(mocked.getUserById).toHaveBeenCalledWith(TARGET);
    expect(JSON.stringify(result)).not.toContain(TARGET);
    expect(JSON.stringify(result)).not.toContain(OTHER);
    expect(JSON.stringify(result)).not.toContain("forbidden");
  });

  it.each([
    ["observed", { data: { user: { id: TARGET } }, error: null }, "observed"],
    ["exact not_found", { data: { user: null }, error: { status: 404, code: "user_not_found" } }, "not_found"],
    ["permission", { data: { user: null }, error: { status: 401, code: "unauthorized" } }, "permission_denied"],
    ["rate limited", { data: { user: null }, error: { status: 429, code: "rate_limited" } }, "rate_limited"],
    ["5xx", { data: { user: null }, error: { status: 500, code: "unexpected" } }, "unavailable"],
    ["network", { data: { user: null }, error: new AuthRetryableFetchError("network_error", 0) }, "network_error"],
    ["timeout", { data: { user: null }, error: new AuthRetryableFetchError("request_timeout", 0) }, "timeout"],
    ["malformed", { data: { impossible: true }, error: null }, "malformed"],
    ["mismatch", { data: { user: { id: OTHER } }, error: null }, "malformed"]
  ])("DELETE %s is observational, redacted, and never retried", async (_label, response, expectedKind) => {
    const mocked = client({ deletion: response });
    const result = await createAccountDeletionAuthAdapter(mocked.value).deleteUser(TARGET);

    expect(result).toEqual({ kind: expectedKind });
    expect(mocked.deleteUser).toHaveBeenCalledTimes(1);
    expect(mocked.deleteUser).toHaveBeenCalledWith(TARGET);
    expect(JSON.stringify(result)).not.toContain(TARGET);
    expect(JSON.stringify(result)).not.toContain(OTHER);
    expect(JSON.stringify(result)).not.toContain("unauthorized");
  });

  it("normalizes thrown abort/network shapes without returning the raw error", async () => {
    const abortError = Object.assign(new Error("RAW_ABORT_DETAIL"), { name: "AbortError" });
    const timeoutClient = client({ get: async () => { throw abortError; } });
    const networkClient = client({ deletion: async () => { throw new AuthRetryableFetchError("RAW_NETWORK_DETAIL", 0); } });

    const timeout = await createAccountDeletionAuthAdapter(timeoutClient.value).getUserById(TARGET);
    const network = await createAccountDeletionAuthAdapter(networkClient.value).deleteUser(TARGET);
    expect(timeout).toEqual({ kind: "timeout" });
    expect(network).toEqual({ kind: "network_error" });
    expect(JSON.stringify({ timeout, network })).not.toContain("RAW_");
    expect(timeoutClient.getUserById).toHaveBeenCalledTimes(1);
    expect(networkClient.deleteUser).toHaveBeenCalledTimes(1);
  });
});

describe("G5D-2O Auth-only bounded fetch", () => {
  it("uses the canonical 10 second default", () => {
    expect(ACCOUNT_DELETION_AUTH_REQUEST_TIMEOUT_MS).toBe(10_000);
  });

  it("aborts the actual request, clears its timer, sanitizes transport detail, and never retries", async () => {
    let aborted = false;
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          aborted = true;
          reject(new Error("RAW_FETCH_ABORT_DETAIL"));
        }, { once: true });
      })
    ) as typeof fetch;
    const bounded = createAccountDeletionAuthBoundedFetch({ fetchImpl, timeoutMs: 5 });

    await expect(bounded("https://example.invalid/auth/v1/admin/users/example")).rejects.toMatchObject({
      name: "TimeoutError",
      message: "request_timeout"
    });
    expect(aborted).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
  });

  it("forwards an existing abort signal and always cleans the timeout", async () => {
    const upstream = new AbortController();
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("RAW_UPSTREAM_ABORT")), { once: true });
      })
    ) as typeof fetch;
    const bounded = createAccountDeletionAuthBoundedFetch({ fetchImpl, timeoutMs: 1_000 });
    const pending = bounded("https://example.invalid/auth/v1/admin/users/example", { signal: upstream.signal });
    upstream.abort();

    await expect(pending).rejects.toMatchObject({ name: "TimeoutError", message: "request_timeout" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
  });

  it("clears the timer after success and makes one transport call", async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 })) as typeof fetch;
    const bounded = createAccountDeletionAuthBoundedFetch({ fetchImpl, timeoutMs: 1_000 });

    await expect(bounded("https://example.invalid/auth/v1/admin/users/example")).resolves.toBeInstanceOf(Response);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
  });
});
