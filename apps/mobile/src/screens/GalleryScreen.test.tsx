import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PublicGallery } from "../../../../lib/gallery/schema";
import type { PracticeApi } from "../practice/api";
import { GalleryScreen } from "./GalleryScreen";

const base = {
  id: "synthetic-one", collectionVersion: "synthetic-v1", title: "An invented moment", workTitle: "Imaginary work",
  sourceType: "Speeches" as const, speaker: "Test speaker", year: 2026, moment: "A fictional choice.",
  contextJa: "架空の場面です。", whyItMattersJa: "テスト用です。", speakingNotes: ["Pause here."],
  themes: ["Choice"], moreLikeThis: [], primarySourceUrl: null, canonicalSourceLocator: "Imaginary source, page 1", sourceKind: "official"
};
const catalog: PublicGallery = {
  schemaVersion: "gallery-public/v1", collectionVersion: "synthetic-v1", themes: ["Choice"], items: [
    { ...base, publicationMode: "PRACTICE", practiceTextEn: "I will speak clearly.", translationJa: null, targetSeconds: 72, locale: "en-US", wordCount: 4, characterCount: 21 },
    { ...base, id: "synthetic-two", title: "A discovery", publicationMode: "DISCOVERY" }
  ]
};

describe("mobile Gallery", () => {
  it("renders an empty catalog with a manual path", () => {
    const html = renderToStaticMarkup(<GalleryScreen api={{} as PracticeApi} isOnline catalog={{ ...catalog, items: [] }} onNavigate={() => undefined} />);
    expect(html).toContain("公開できる場面を準備中です");
    expect(html).toContain("自分の台本を作る");
  });

  it("keeps discovery textless and routes to manual creation", () => {
    const onNavigate = vi.fn();
    let view!: ReactTestRenderer;
    act(() => { view = create(<GalleryScreen api={{} as PracticeApi} isOnline catalog={catalog} itemId="synthetic-two" onNavigate={onNavigate} />); });
    const html = renderToStaticMarkup(<GalleryScreen api={{} as PracticeApi} isOnline catalog={catalog} itemId="synthetic-two" onNavigate={onNavigate} />);
    expect(html).not.toContain("The words");
    expect(html).not.toContain("I will speak clearly.");
    const button = view.root.findAllByType("button").find(entry => entry.props.children === "自分の台本を作る");
    act(() => { button!.props.onClick(); });
    expect(onNavigate).toHaveBeenCalledWith({ name: "scripts", create: true });
  });

  it("creates only after an explicit practice tap through the canonical API", async () => {
    const createScript = vi.fn(async () => ({ kind: "success" as const, script: { id: "owned-script" } }));
    const onNavigate = vi.fn();
    let view!: ReactTestRenderer;
    act(() => { view = create(<GalleryScreen api={{ createScript } as unknown as PracticeApi} isOnline catalog={catalog} itemId="synthetic-one" onNavigate={onNavigate} />); });
    expect(createScript).not.toHaveBeenCalled();
    const button = view.root.findAllByType("button").find(entry => entry.props.children === "この一節で練習する");
    await act(async () => { await button!.props.onClick(); });
    expect(createScript).toHaveBeenCalledWith({ title: "An invented moment", content: "I will speak clearly.", targetSeconds: 72, locale: "en-US" });
    expect(onNavigate).toHaveBeenCalledWith({ name: "listen", scriptId: "owned-script" });
  });

  it("does not navigate after leaving while a create request is pending", async () => {
    let resolve!: (value: { kind: "success"; script: { id: string } }) => void;
    const createScript = vi.fn(() => new Promise<{ kind: "success"; script: { id: string } }>(done => { resolve = done; }));
    const onNavigate = vi.fn();
    let view!: ReactTestRenderer;
    act(() => { view = create(<GalleryScreen api={{ createScript } as unknown as PracticeApi} isOnline catalog={catalog} itemId="synthetic-one" onNavigate={onNavigate} />); });
    const button = view.root.findAllByType("button").find(entry => entry.props.children === "この一節で練習する");
    let pending!: Promise<void>;
    act(() => { pending = button!.props.onClick(); });
    act(() => { view.unmount(); });
    resolve({ kind: "success", script: { id: "owned-script" } });
    await act(async () => { await pending; });
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
