import { describe, expect, it, vi } from "vitest";
import type { AppSupabaseClient } from "@/lib/supabase/client";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ adminRpc: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ rpc: mocks.adminRpc }) }));
import { getGalleryItem } from "@/lib/gallery/public";
import { savePersonalGalleryExample } from "@/services/gallery/personal-gallery.service";

describe("personal Gallery curated save", () => {
  it("snapshots only canonical public metadata and never imports practice text", async () => {
    const example = getGalleryItem("nm-fc-roosevelt-arena")!;
    const row = { id: "10000000-0000-4000-8000-000000000071", user_id: "10000000-0000-4000-8000-000000000072",
      scene_title: example.title, work_title: example.workTitle, speaker: example.speaker,
      source_type: example.sourceType, themes: example.themes, personal_note: null, context: example.contextJa,
      excerpt_text: null, source_url: example.primarySourceUrl, source_locator: example.canonicalSourceLocator,
      speaking_notes: example.speakingNotes, locale: "en-US", source_example_id: example.id,
      created_at: "2026-09-29T00:00:00Z", updated_at: "2026-09-29T00:00:00Z", lock_version: 1 };
    mocks.adminRpc.mockResolvedValue({ data: row, error: null });
    const client = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }) } as unknown as AppSupabaseClient;
    const result = await savePersonalGalleryExample(client, row.user_id, example.id);
    expect(result.excerptText).toBeNull();
    expect(result.sourceExampleId).toBe(example.id);
    const [name, args] = mocks.adminRpc.mock.calls[0];
    expect(name).toBe("save_personal_gallery_example");
    expect(args.p_user_id).toBe(row.user_id);
    expect(args.p_patch).toMatchObject({ source_example_id: example.id, scene_title: example.title,
      work_title: example.workTitle, speaking_notes: example.speakingNotes, themes: example.themes });
    expect(args.p_patch).not.toHaveProperty("excerpt_text");
    expect(JSON.stringify(args.p_patch)).not.toContain("practiceTextEn");
  });
  it("does not accept an unknown public ID", async () => {
    await expect(savePersonalGalleryExample({} as AppSupabaseClient, "owner", "forged-id")).rejects.toMatchObject({ status: 404 });
  });
});
