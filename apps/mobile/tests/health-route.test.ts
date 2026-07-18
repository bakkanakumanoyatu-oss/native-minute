import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { GET, OPTIONS } from "../../../app/api/mobile/health/route";
import { middleware } from "../../../middleware";

const HEALTH_URL = "https://native-minute.example/api/mobile/health";
const CAPACITOR_ORIGIN = "capacitor://localhost";

describe("GET /api/mobile/health", () => {
  it("returns a safe no-store response for the exact Capacitor origin", async () => {
    const response = await GET(
      new NextRequest(HEALTH_URL, {
        headers: {
          Origin: CAPACITOR_ORIGIN
        }
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(CAPACITOR_ORIGIN);
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(payload).toEqual({
      ok: true,
      data: {
        status: "ok",
        service: "native-minute-bff",
        timestamp: expect.any(String)
      }
    });
    expect(Object.keys(payload.data).sort()).toEqual(["service", "status", "timestamp"]);
  });

  it("allows an origin-less monitor request without adding a CORS origin", async () => {
    const response = await GET(new NextRequest(HEALTH_URL));

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it.each(["capacitor://localhost.evil", "null", "*"])(
    "rejects a non-exact origin: %s",
    async (origin) => {
      const response = await GET(
        new NextRequest(HEALTH_URL, {
          headers: {
            Origin: origin
          }
        })
      );

      expect(response.status).toBe(403);
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
      expect(response.headers.get("access-control-allow-credentials")).toBeNull();
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  );
});

describe("OPTIONS /api/mobile/health", () => {
  it("allows only a GET preflight from the exact Capacitor origin", async () => {
    const response = await OPTIONS(
      new NextRequest(HEALTH_URL, {
        method: "OPTIONS",
        headers: {
          Origin: CAPACITOR_ORIGIN,
          "Access-Control-Request-Method": "GET"
        }
      })
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(CAPACITOR_ORIGIN);
    expect(response.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("rejects a POST preflight", async () => {
    const response = await OPTIONS(
      new NextRequest(HEALTH_URL, {
        method: "OPTIONS",
        headers: {
          Origin: CAPACITOR_ORIGIN,
          "Access-Control-Request-Method": "POST"
        }
      })
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("access-control-allow-origin")).toBe(CAPACITOR_ORIGIN);
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
  });
});

describe("health middleware boundary", () => {
  it("bypasses Supabase session refresh and does not set cookies", async () => {
    const response = await middleware(
      new NextRequest(HEALTH_URL, {
        headers: {
          Origin: CAPACITOR_ORIGIN
        }
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
