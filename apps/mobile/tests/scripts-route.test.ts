import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import type { AppSupabaseClient } from "../../../lib/supabase/client";
import {
  handleMobileScriptsGet,
  handleMobileScriptsOptions,
  handleMobileScriptsUnsupportedMethod,
  type MobileScriptsRouteDependencies
} from "../../../lib/mobile/scripts-route";
import { MAX_MOBILE_BEARER_LENGTH } from "../../../lib/supabase/mobile-route";
import { middleware } from "../../../middleware";
import { AppError } from "../../../lib/errors";
import { listScripts } from "../../../services/scripts/scripts.service";
import {
  CAPACITOR_MOBILE_ORIGIN,
  LOCAL_MOBILE_ORIGIN,
  isAllowedMobileApiOrigin
} from "../../../lib/mobile/api-cors";

const SCRIPTS_URL = "https://native-minute.example/api/mobile/scripts";
const CAPACITOR_ORIGIN = "capacitor://localhost";
const ACCESS_TOKEN_SENTINEL = "header.payload.signature";
const VERIFIED_USER_ID = "verified-user";

const ownedScripts = [
  {
    id: "script-owned",
    title: "Morning update",
    content: "A safe one-minute practice script.",
    targetSeconds: 60,
    locale: "en-US",
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z"
  }
];

function createFakeClient() {
  return { auth: {} } as unknown as AppSupabaseClient;
}

function createDependencies(
  overrides: Partial<MobileScriptsRouteDependencies> = {}
): MobileScriptsRouteDependencies {
  const client = createFakeClient();

  return {
    hasConfig: () => true,
    createClient: () => client,
    validateUser: async () => ({
      data: { user: { id: VERIFIED_USER_ID } },
      error: null
    }),
    listOwnedScripts: async () => ownedScripts,
    ...overrides
  };
}

function scriptsRequest(options?: {
  authorization?: string;
  cookie?: string;
  origin?: string | null;
  url?: string;
}) {
  const headers = new Headers({
    Accept: "application/json"
  });

  if (options?.origin !== null) {
    headers.set("Origin", options?.origin ?? CAPACITOR_ORIGIN);
  }

  if (options?.authorization !== undefined) {
    headers.set("Authorization", options.authorization);
  }

  if (options?.cookie !== undefined) {
    headers.set("Cookie", options.cookie);
  }

  return new NextRequest(options?.url ?? SCRIPTS_URL, { headers });
}

describe("GET /api/mobile/scripts", () => {
  it("validates one Bearer credential and lists only the verified user's scripts", async () => {
    const client = createFakeClient();
    const createClient = vi.fn(() => client);
    const validateUser = vi.fn(async () => ({
      data: { user: { id: VERIFIED_USER_ID } },
      error: null
    }));
    const listOwnedScripts = vi.fn(async () => ownedScripts);
    const response = await handleMobileScriptsGet(
      scriptsRequest({
        authorization: `Bearer ${ACCESS_TOKEN_SENTINEL}`,
        cookie: "web-session=must-not-be-used",
        url: `${SCRIPTS_URL}?userId=attacker-selected-user`
      }),
      createDependencies({ createClient, validateUser, listOwnedScripts })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(createClient).toHaveBeenCalledWith(ACCESS_TOKEN_SENTINEL);
    expect(validateUser).toHaveBeenCalledWith(client, ACCESS_TOKEN_SENTINEL);
    expect(listOwnedScripts).toHaveBeenCalledWith(client, VERIFIED_USER_ID);
    expect(payload).toEqual({ ok: true, data: { scripts: ownedScripts } });
    expect(Object.keys(payload.data.scripts[0]).sort()).toEqual([
      "content",
      "createdAt",
      "id",
      "locale",
      "targetSeconds",
      "title",
      "updatedAt"
    ]);
    expect(response.headers.get("access-control-allow-origin")).toBe(CAPACITOR_ORIGIN);
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("returns an empty owned list as 200", async () => {
    const response = await handleMobileScriptsGet(
      scriptsRequest({ authorization: `Bearer ${ACCESS_TOKEN_SENTINEL}` }),
      createDependencies({ listOwnedScripts: async () => [] })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, data: { scripts: [] } });
  });

  it("uses the verified owner filter so a second user's row is not returned", async () => {
    const rows = [
      {
        id: "script-user-a",
        user_id: VERIFIED_USER_ID,
        title: "Owned A",
        content: "Visible only to user A.",
        target_seconds: 60,
        locale: "en-US",
        created_at: "2026-07-18T00:00:00.000Z",
        updated_at: "2026-07-19T00:00:00.000Z"
      },
      {
        id: "script-user-b",
        user_id: "different-user",
        title: "Private B",
        content: "Must not be returned to user A.",
        target_seconds: 60,
        locale: "en-US",
        created_at: "2026-07-18T00:00:00.000Z",
        updated_at: "2026-07-19T00:00:00.000Z"
      }
    ];
    const ownerEq = vi.fn((_column: "user_id", userId: string) => ({
      order: vi.fn(async () => ({
        data: rows.filter((row) => row.user_id === userId),
        error: null
      }))
    }));
    const client = {
      auth: {},
      from: vi.fn(() => ({
        select: vi.fn(() => ({ eq: ownerEq }))
      }))
    } as unknown as AppSupabaseClient;
    const response = await handleMobileScriptsGet(
      scriptsRequest({ authorization: `Bearer ${ACCESS_TOKEN_SENTINEL}` }),
      createDependencies({
        createClient: () => client,
        listOwnedScripts: listScripts
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(ownerEq).toHaveBeenCalledWith("user_id", VERIFIED_USER_ID);
    expect(payload.data.scripts).toHaveLength(1);
    expect(payload.data.scripts[0].id).toBe("script-user-a");
    expect(JSON.stringify(payload)).not.toContain("script-user-b");
  });

  it("rejects a cookie-only request before creating a Supabase client", async () => {
    const createClient = vi.fn(() => createFakeClient());
    const response = await handleMobileScriptsGet(
      scriptsRequest({ cookie: "web-session=must-not-be-used" }),
      createDependencies({ createClient })
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error.reasonCode).toBe("auth_required");
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });

  it.each([
    "Basic abc",
    "Bearer",
    "Bearer ",
    "Bearer first, Bearer second",
    "Bearer contains spaces",
    `Bearer ${"a".repeat(MAX_MOBILE_BEARER_LENGTH + 1)}`
  ])("rejects a malformed or duplicated Authorization value", async (authorization) => {
    const createClient = vi.fn(() => createFakeClient());
    const response = await handleMobileScriptsGet(
      scriptsRequest({ authorization }),
      createDependencies({ createClient })
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error.reasonCode).toBe("session_invalid");
    expect(createClient).not.toHaveBeenCalled();
  });

  it.each([
    [{ status: 401, code: "bad_jwt", message: "provider detail" }, "session_invalid"],
    [{ status: 401, code: "jwt_expired", message: "provider detail" }, "session_expired"]
  ] as const)("maps invalid auth without exposing provider detail", async (providerError, reasonCode) => {
    const response = await handleMobileScriptsGet(
      scriptsRequest({ authorization: `Bearer ${ACCESS_TOKEN_SENTINEL}` }),
      createDependencies({
        validateUser: async () => ({ data: { user: null }, error: providerError })
      })
    );
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(401);
    expect(serialized).toContain(reasonCode);
    expect(serialized).not.toContain(providerError.message);
    expect(serialized).not.toContain(ACCESS_TOKEN_SENTINEL);
  });

  it("maps provider throttling to a bounded retry contract", async () => {
    const response = await handleMobileScriptsGet(
      scriptsRequest({ authorization: `Bearer ${ACCESS_TOKEN_SENTINEL}` }),
      createDependencies({
        validateUser: async () => ({ data: { user: null }, error: { status: 429 } })
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(payload.error.reasonCode).toBe("rate_limited");
    expect(response.headers.get("retry-after")).toBe("30");
  });

  it("maps auth outages and thrown network failures to a safe 503", async () => {
    for (const validateUser of [
      async () => ({ data: { user: null }, error: { status: 503, message: "raw outage" } }),
      async () => ({ data: { user: null }, error: { status: 0, message: "raw fetch failure" } }),
      async () => ({ data: { user: null }, error: { code: "request_timeout", message: "raw timeout" } }),
      async () => {
        throw new Error("raw network failure");
      }
    ]) {
      const response = await handleMobileScriptsGet(
        scriptsRequest({ authorization: `Bearer ${ACCESS_TOKEN_SENTINEL}` }),
        createDependencies({ validateUser })
      );
      const serialized = JSON.stringify(await response.json());

      expect(response.status).toBe(503);
      expect(serialized).toContain("auth_unavailable");
      expect(serialized).not.toContain("raw");
      expect(serialized).not.toContain(ACCESS_TOKEN_SENTINEL);
    }
  });

  it("maps client initialization failure to a safe 503", async () => {
    const response = await handleMobileScriptsGet(
      scriptsRequest({ authorization: `Bearer ${ACCESS_TOKEN_SENTINEL}` }),
      createDependencies({
        createClient: () => {
          throw new Error("raw initialization detail");
        }
      })
    );
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(503);
    expect(serialized).toContain("auth_unavailable");
    expect(serialized).not.toContain("raw initialization detail");
  });

  it("maps owned-list failures to a safe 500 without raw DB detail", async () => {
    const response = await handleMobileScriptsGet(
      scriptsRequest({ authorization: `Bearer ${ACCESS_TOKEN_SENTINEL}` }),
      createDependencies({
        listOwnedScripts: async () => {
          throw new Error("raw database detail");
        }
      })
    );
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(500);
    expect(serialized).toContain("scripts_unavailable");
    expect(serialized).not.toContain("raw database detail");
    expect(serialized).not.toContain(ACCESS_TOKEN_SENTINEL);
  });

  it.each([
    [new AppError(403, "raw forbidden detail"), 403, "account_deletion_in_progress"],
    [new AppError(429, "raw rate detail"), 429, "rate_limited"]
  ] as const)("maps an owned-list policy failure without raw detail", async (error, status, reasonCode) => {
    const response = await handleMobileScriptsGet(
      scriptsRequest({ authorization: `Bearer ${ACCESS_TOKEN_SENTINEL}` }),
      createDependencies({
        listOwnedScripts: async () => {
          throw error;
        }
      })
    );
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(status);
    expect(serialized).toContain(reasonCode);
    expect(serialized).not.toContain(error.message);
  });

  it.each([null, "https://invalid.example", "capacitor://localhost.evil", "null", "*"])(
    "rejects a missing or non-exact Origin without ACAO: %s",
    async (origin) => {
      const createClient = vi.fn(() => createFakeClient());
      const response = await handleMobileScriptsGet(
        scriptsRequest({ authorization: `Bearer ${ACCESS_TOKEN_SENTINEL}`, origin }),
        createDependencies({ createClient })
      );
      const payload = await response.json();

      expect(response.status).toBe(403);
      expect(payload.error.reasonCode).toBe("origin_forbidden");
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
      expect(response.headers.get("access-control-allow-credentials")).toBeNull();
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(createClient).not.toHaveBeenCalled();
    }
  );
});

describe("OPTIONS /api/mobile/scripts", () => {
  it("allows the exact origin, GET, and an Authorization header without credentials", () => {
    const response = handleMobileScriptsOptions(
      new NextRequest(SCRIPTS_URL, {
        method: "OPTIONS",
        headers: {
          Origin: CAPACITOR_ORIGIN,
          "Access-Control-Request-Method": "GET",
          "Access-Control-Request-Headers": "authorization, accept"
        }
      })
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(CAPACITOR_ORIGIN);
    expect(response.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
    expect(response.headers.get("access-control-allow-headers")).toBe(
      "Authorization, Accept, Content-Type"
    );
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("vary")).toContain("Access-Control-Request-Headers");
  });

  it("keeps localhost development-only while preview and production stay exact", () => {
    expect(isAllowedMobileApiOrigin(CAPACITOR_MOBILE_ORIGIN, "development")).toBe(true);
    expect(isAllowedMobileApiOrigin(CAPACITOR_MOBILE_ORIGIN, "preview")).toBe(true);
    expect(isAllowedMobileApiOrigin(CAPACITOR_MOBILE_ORIGIN, "production")).toBe(true);
    expect(isAllowedMobileApiOrigin(LOCAL_MOBILE_ORIGIN, "development")).toBe(true);
    expect(isAllowedMobileApiOrigin(LOCAL_MOBILE_ORIGIN, "preview")).toBe(false);
    expect(isAllowedMobileApiOrigin(LOCAL_MOBILE_ORIGIN, "production")).toBe(false);
  });

  it.each([
    [{ "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "authorization" }, 405],
    [{ "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "x-unsafe" }, 400],
    [{ "Access-Control-Request-Method": "GET" }, 400]
  ])("rejects an invalid preflight contract", (requestedHeaders, expectedStatus) => {
    const response = handleMobileScriptsOptions(
      new NextRequest(SCRIPTS_URL, {
        method: "OPTIONS",
        headers: {
          Origin: CAPACITOR_ORIGIN,
          ...requestedHeaders
        }
      })
    );

    expect(response.status).toBe(expectedStatus);
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

describe("unsupported /api/mobile/scripts methods", () => {
  it("returns a safe no-store 405 without touching auth", async () => {
    const response = handleMobileScriptsUnsupportedMethod(
      new NextRequest(SCRIPTS_URL, {
        method: "POST",
        headers: { Origin: CAPACITOR_ORIGIN }
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(405);
    expect(payload.error.reasonCode).toBe("method_not_allowed");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe(CAPACITOR_ORIGIN);
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

describe("mobile scripts middleware boundary", () => {
  it("bypasses Web cookie session initialization for every mobile API route", async () => {
    const response = await middleware(
      scriptsRequest({
        authorization: `Bearer ${ACCESS_TOKEN_SENTINEL}`,
        cookie: "web-session=must-not-be-used"
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
