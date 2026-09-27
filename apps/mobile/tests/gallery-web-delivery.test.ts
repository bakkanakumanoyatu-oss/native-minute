import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), getGalleryPracticePayload: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/gallery/public", () => ({
  getGalleryItem: (id: string) => id === "synthetic-one" ? {
    id, title: "Invented title", workTitle: "Invented work", speaker: "Test speaker", year: 2026,
    sourceType: "Speeches", themes: ["Choice"], moment: "A fictional scene.", contextJa: "架空の場面です。",
    whyItMattersJa: "テスト用です。", speakingNotes: ["Pause."], publicationMode: "PRACTICE",
    primarySourceUrl: null, canonicalSourceLocator: "Invented source", sourceKind: "source link", moreLikeThis: []
  } : undefined
}));
vi.mock("@/lib/supabase/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/services/gallery/gallery-content.service", () => ({ getGalleryPracticePayload: mocks.getGalleryPracticePayload }));
vi.mock("@/components/gallery/gallery-create-button", () => ({ GalleryCreateButton: () => "この一節で練習する" }));

import GalleryDetailPage, { dynamic } from "../../../app/gallery/[id]/page";

describe("Web Gallery private detail", () => {
  it("fetches PRACTICE from the server for an authenticated request", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "owner" });
    mocks.getGalleryPracticePayload.mockResolvedValue({ id: "synthetic-one", practiceTextEn: "Synthetic spoken words.", translationJa: "架空の訳です。", targetSeconds: 60, locale: "en-US", contentHash: "a".repeat(64) });
    const html = renderToStaticMarkup(await GalleryDetailPage({ params: { id: "synthetic-one" } }));
    expect(dynamic).toBe("force-dynamic");
    expect(mocks.getGalleryPracticePayload).toHaveBeenCalledWith("synthetic-one");
    expect(html).toContain("Synthetic spoken words.");
    expect(html).toContain("架空の訳です。");
    expect(html).toContain("この一節で練習する");
    expect(html).toContain("Listen for");
    expect(html).toContain("Invented work · Test speaker · 2026");
    expect(html).toContain("出典: Invented source");
    expect(html).not.toContain("source link ·");
  });

  it("fails closed when the private release cannot be loaded", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "owner" });
    mocks.getGalleryPracticePayload.mockRejectedValue(new Error("missing"));
    const html = renderToStaticMarkup(await GalleryDetailPage({ params: { id: "synthetic-one" } }));
    expect(html).toContain("練習文は現在表示できません");
    expect(html).not.toContain("この一節で練習する");
    expect(html).not.toContain("Synthetic spoken words.");
  });
});
