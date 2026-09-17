import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { takeMetadataSchema } from "../../../schemas/take-metadata";
import { handleTakeMetadataPatch, handleTakeMetadataOptions } from "../../../lib/mobile/take-metadata-route";
import { updateTakeMetadata } from "../../../services/takes/take-metadata.service";
import { updateMobileTakeMetadata, fetchMobileProgress, fetchMobileReview } from "../src/lib/api";
import type { AppSupabaseClient } from "../../../lib/supabase/client";

const takeId = "30000000-0000-4000-8000-000000000003";
const userId = "10000000-0000-4000-8000-000000000003";
const origin = "capacitor://localhost";
const metadata = { takeId, favorite: true, displayName: "My voice" };
const client = {} as AppSupabaseClient;
const deps = () => ({ hasConfig: () => true, createClient: () => client,
  validateUser: async () => ({ data: { user: { id: userId } }, error: null }),
  updateTakeMetadata: vi.fn(async () => metadata) });
function request(body: unknown, auth = true) {
  return new NextRequest(`https://example.test/api/mobile/takes/${takeId}/metadata`, { method: "PATCH", headers: { origin, ...(auth ? { authorization: "Bearer fixture" } : {}), "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("Take metadata boundary", () => {
  it.each([{}, { favorite: 1 }, { favorite: null }, { displayName: 2 }, { displayName: "a".repeat(61) }, { displayName: "a\u0000b" }, { displayName: "a\nb" }, { favorite: true, score: 100 }, { favorite: true, user_id: userId }, { audio_path: "x" }, { transcript: "x" }, { scriptId: takeId }])("rejects invalid / forbidden payload %j", async input => {
    expect(takeMetadataSchema.safeParse(input).success).toBe(false);
    const dependencies = deps();
    expect((await handleTakeMetadataPatch(request(input), takeId, dependencies)).status).toBe(400);
    expect(dependencies.updateTakeMetadata).not.toHaveBeenCalled();
  });
  it.each([["  New name  ", "New name"], ["  ", null], [null, null], ["<b>Name</b>", "<b>Name</b>"]])("normalizes %j", (name, expected) => {
    expect(takeMetadataSchema.parse({ displayName: name }).displayName).toBe(expected);
  });
  it("uses validated Bearer owner and returns persisted metadata with no-store", async () => {
    const dependencies = deps();
    const result = await handleTakeMetadataPatch(request({ displayName: " My voice " }), takeId, dependencies);
    expect(result.status).toBe(200);
    expect(dependencies.updateTakeMetadata).toHaveBeenCalledWith(client, userId, takeId, { displayName: "My voice" });
    expect((await result.json()).data.metadata).toEqual(metadata);
    expect(result.headers.get("cache-control")).toContain("no-store");
  });
  it("rejects missing Bearer and invalid id without updating", async () => {
    const dependencies = deps();
    expect((await handleTakeMetadataPatch(request({ favorite: true }, false), takeId, dependencies)).status).toBe(401);
    expect((await handleTakeMetadataPatch(request({ favorite: true }), "invalid", dependencies)).status).toBe(400);
    expect(dependencies.updateTakeMetadata).not.toHaveBeenCalled();
  });
  it("permits only authorized PATCH preflight", () => {
    const result = handleTakeMetadataOptions(new NextRequest("https://example.test/api/mobile/takes/x/metadata", { method: "OPTIONS", headers: { origin, "access-control-request-method": "PATCH", "access-control-request-headers": "authorization, content-type" } }));
    expect(result.status).toBe(204);
    expect(result.headers.get("access-control-allow-methods")).toContain("PATCH");
  });
  it("service restricts fields and checks owner / reviewed state in the UPDATE itself", async () => {
    const query = { eq: vi.fn(), select: vi.fn(), maybeSingle: vi.fn(async () => ({ data: null, error: null })) };
    query.eq.mockReturnValue(query); query.select.mockReturnValue(query);
    const update = vi.fn(() => query);
    const db = { from: vi.fn(() => ({ update })) } as unknown as AppSupabaseClient;
    await expect(updateTakeMetadata(db, userId, takeId, { favorite: true })).rejects.toMatchObject({ status: 404 });
    expect(update).toHaveBeenCalledWith({ favorite: true });
    expect(query.eq.mock.calls).toEqual([["id", takeId], ["user_id", userId], ["status", "reviewed"]]);
  });
  it("mobile sends metadata-only PATCH and rejects stale take response", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).toBe("PATCH");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fixture");
      expect(JSON.parse(String(init?.body))).toEqual({ favorite: true });
      return new Response(JSON.stringify({ ok: true, data: { metadata } }));
    });
    expect(await updateMobileTakeMetadata("https://example.test", "fixture", takeId, { favorite: true }, { fetchImpl })).toEqual({ kind: "success", metadata });
    const stale = async () => new Response(JSON.stringify({ ok: true, data: { metadata: { ...metadata, takeId: "other" } } }));
    expect((await updateMobileTakeMetadata("https://example.test", "fixture", takeId, { favorite: true }, { fetchImpl: stale })).kind).toBe("invalid-response");
  });
  it("missing metadata in canonical payload is failure, never zero favorites", async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ ok: true, data: { progress: { scripts: [{ takeHistory: [{}] }] }, review: { takeId } } }));
    expect((await fetchMobileProgress("https://example.test", "fixture", { fetchImpl })).kind).toBe("invalid-response");
    expect((await fetchMobileReview("https://example.test", "fixture", "script", takeId, { fetchImpl })).kind).toBe("invalid-response");
  });
});
