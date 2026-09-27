import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppSupabaseClient } from "@/lib/supabase/client";
import { hashGalleryRuntimeContent, GALLERY_RUNTIME_BUCKET } from "@/lib/gallery/runtime-schema";
import { AppError } from "@/lib/errors";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ download: vi.fn(), from: vi.fn(), createScript: vi.fn() }));
const fixtures = vi.hoisted(() => {
  const publicItem = {
    id: "synthetic-one", title: "Invented title", publicationMode: "PRACTICE", practiceAvailable: true,
    collectionVersion: "synthetic-v1", workTitle: "Invented work", sourceType: "Speeches", speaker: "Test speaker", year: 2026,
    moment: "Fictional moment", contextJa: "架空です。", whyItMattersJa: "テスト。", speakingNotes: [], themes: ["Choice"], moreLikeThis: [],
    primarySourceUrl: null, canonicalSourceLocator: "Invented source", sourceKind: "official", targetSeconds: 60, locale: "en-US", wordCount: 3, characterCount: 23
  };
  const catalog = { schemaVersion: "gallery-public/v1", collectionVersion: "synthetic-v1", themes: ["Choice"], items: [publicItem,
    { ...publicItem, id: "discovery", publicationMode: "DISCOVERY" }] };
  return { publicItem, catalog };
});
vi.mock("@/lib/gallery/public", () => ({ gallery: fixtures.catalog, getGalleryItem: (id: string) => fixtures.catalog.items.find(item => item.id === id) }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ storage: { from: mocks.from } }) }));
vi.mock("@/services/scripts/scripts.service", async importOriginal => ({
  ...await importOriginal<typeof import("@/services/scripts/scripts.service")>(),
  createScript: mocks.createScript
}));

import { createScriptFromGallery, getGalleryPracticePayload } from "@/services/gallery/gallery-content.service";

function release(text = "Synthetic spoken words.", releaseVersion = "synthetic-release-v1") {
  const fields = { id: fixtures.publicItem.id, practiceTextEn: text, translationJa: null, targetSeconds: 60, locale: "en-US" };
  const artifact = { schemaVersion: "gallery-runtime/v1", releaseVersion, sourceCollectionVersion: "synthetic-v1",
    items: [{ ...fields, contentHash: hashGalleryRuntimeContent(fields) }] };
  const bytes = Buffer.from(JSON.stringify(artifact));
  process.env.GALLERY_RUNTIME_RELEASE_VERSION = releaseVersion;
  process.env.GALLERY_RUNTIME_OBJECT_KEY = `releases/${releaseVersion}/gallery-runtime.json`;
  process.env.GALLERY_RUNTIME_SHA256 = createHash("sha256").update(bytes).digest("hex");
  process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-service-role-test";
  mocks.from.mockReturnValue({ download: mocks.download });
  mocks.download.mockResolvedValue({ data: new Blob([bytes]), error: null });
}

afterEach(() => {
  delete process.env.GALLERY_RUNTIME_RELEASE_VERSION;
  delete process.env.GALLERY_RUNTIME_OBJECT_KEY;
  delete process.env.GALLERY_RUNTIME_SHA256;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  vi.clearAllMocks();
});

describe("server-only Gallery loader and canonical create", () => {
  it("loads only the requested item from private admin Storage", async () => {
    release();
    const item = await getGalleryPracticePayload("synthetic-one");
    expect(item.practiceTextEn).toBe("Synthetic spoken words.");
    expect(mocks.from).toHaveBeenCalledWith(GALLERY_RUNTIME_BUCKET);
    expect(mocks.download).toHaveBeenCalledWith("releases/synthetic-release-v1/gallery-runtime.json");
    expect(await getGalleryPracticePayload("discovery").catch(error => error.status)).toBe(404);
    expect(await getGalleryPracticePayload("unknown").catch(error => error.status)).toBe(404);
  });

  it("fails closed for missing config, wrong hash and corrupt content", async () => {
    await expect(getGalleryPracticePayload("synthetic-one")).rejects.toMatchObject({ status: 503 });
    release(undefined, "synthetic-release-v2");
    process.env.GALLERY_RUNTIME_SHA256 = "0".repeat(64);
    await expect(getGalleryPracticePayload("synthetic-one")).rejects.toMatchObject({ status: 503 });
    release(undefined, "synthetic-release-v3");
    mocks.download.mockResolvedValue({ data: new Blob(["malformed"]), error: null });
    await expect(getGalleryPracticePayload("synthetic-one")).rejects.toMatchObject({ status: 503 });
  });

  it("uses private canonical text and the authenticated script RPC; later releases do not mutate saved scripts", async () => {
    release();
    const client = {} as AppSupabaseClient;
    const saved = { id: "owned-script", content: "Synthetic spoken words." };
    mocks.createScript.mockResolvedValue(saved);
    expect(await createScriptFromGallery(client, "owner", "synthetic-one")).toBe(saved);
    expect(mocks.createScript).toHaveBeenCalledWith(client, "owner", {
      title: "Invented title", content: "Synthetic spoken words.", targetSeconds: 60, locale: "en-US"
    });
    release("Synthetic spoken birds.", "synthetic-release-v4");
    expect((await getGalleryPracticePayload("synthetic-one")).practiceTextEn).toBe("Synthetic spoken birds.");
    expect(saved.content).toBe("Synthetic spoken words.");
    mocks.createScript.mockRejectedValueOnce(new AppError(409, "script_limit_reached"));
    release();
    await expect(createScriptFromGallery(client, "owner", "synthetic-one")).rejects.toMatchObject({ status: 409 });
  });
});
