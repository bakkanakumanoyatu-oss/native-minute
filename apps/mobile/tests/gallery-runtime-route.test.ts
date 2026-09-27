import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../../lib/errors";
import type { AppSupabaseClient } from "../../../lib/supabase/client";

vi.mock("server-only", () => ({}));

import { handleMobileGalleryGet, handleMobileGalleryPost } from "../../../lib/mobile/gallery-route";

const origin = "capacitor://localhost";
const path = "https://native-minute.example/api/mobile/gallery/synthetic-one/practice";
const client = { storage: { from: vi.fn(() => { throw new Error("direct Storage access forbidden"); }) } } as unknown as AppSupabaseClient;
const practice = { id: "synthetic-one", practiceTextEn: "Synthetic spoken words.", translationJa: null, targetSeconds: 60, locale: "en-US", contentHash: "a".repeat(64) };
const script = { id: "owned-script" };

function request(method: string, authorization = "Bearer header.payload.signature") {
  return new NextRequest(path, { method, headers: { Origin: origin, Authorization: authorization } });
}

function dependencies() {
  const getPractice = vi.fn(async (id: string) => {
    if (id !== practice.id) throw new AppError(404, "missing");
    return practice;
  });
  const createFromGallery = vi.fn(async (_client: AppSupabaseClient, _userId: string, id: string) => {
    if (id !== practice.id) throw new AppError(404, "missing");
    return script as never;
  });
  return {
    hasConfig: () => true,
    createClient: () => client,
    validateUser: async () => ({ data: { user: { id: "owner" } }, error: null }),
    getPractice,
    createFromGallery
  };
}

describe("Mobile Gallery Bearer BFF", () => {
  it("returns only the requested practice item after auth and never calls client Storage", async () => {
    const deps = dependencies();
    const response = await handleMobileGalleryGet(request("GET"), practice.id, deps);
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ practice });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(client.storage.from).not.toHaveBeenCalled();
    expect(deps.getPractice).toHaveBeenCalledWith(practice.id);
  });

  it("rejects missing auth, unknown IDs, unavailable releases and active-10 conflicts", async () => {
    const deps = dependencies();
    expect((await handleMobileGalleryGet(request("GET", ""), practice.id, deps)).status).toBe(401);
    expect((await handleMobileGalleryGet(request("GET"), "unknown", deps)).status).toBe(404);
    deps.getPractice.mockRejectedValueOnce(new AppError(503, "unavailable"));
    expect((await handleMobileGalleryGet(request("GET"), practice.id, deps)).status).toBe(503);
    deps.createFromGallery.mockRejectedValueOnce(new AppError(409, "script_limit_reached"));
    const full = await handleMobileGalleryPost(request("POST"), practice.id, deps);
    expect(full.status).toBe(409);
    expect((await full.json()).error.reasonCode).toBe("script_limit_reached");
  });

  it("creates from an ID-only request using the authenticated client", async () => {
    const deps = dependencies();
    const response = await handleMobileGalleryPost(request("POST"), practice.id, deps);
    expect(response.status).toBe(201);
    expect((await response.json()).data.script).toEqual(script);
    expect(deps.createFromGallery).toHaveBeenCalledWith(client, "owner", practice.id);
    expect(client.storage.from).not.toHaveBeenCalled();
  });
});
