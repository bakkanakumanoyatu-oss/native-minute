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
  themes: ["Choice"], moreLikeThis: [], primarySourceUrl: null, canonicalSourceLocator: "Imaginary source, page 1", sourceKind: "source link"
};
const catalog: PublicGallery = {
  schemaVersion: "gallery-public/v1", collectionVersion: "synthetic-v1", themes: ["Choice"], items: [
    { ...base, publicationMode: "PRACTICE", practiceAvailable: true, targetSeconds: 72, locale: "en-US", wordCount: 4, characterCount: 21 },
    { ...base, id: "synthetic-two", title: "A discovery", publicationMode: "DISCOVERY" }
  ]
};

describe("mobile Gallery", () => {
  it("keeps public examples when the personal Gallery rollout is off", () => {
    const list = renderToStaticMarkup(<GalleryScreen api={{} as PracticeApi} isOnline personalEnabled={false} onNavigate={() => undefined} />);
    expect(list).toContain("話したい言葉を探す");
    expect(list).not.toContain("自分のコレクションへ");
    const detail = renderToStaticMarkup(<GalleryScreen api={{} as PracticeApi} isOnline personalEnabled={false} catalog={catalog} itemId="synthetic-two" onNavigate={() => undefined} />);
    expect(detail).toContain("自分の台本を作る");
    expect(detail).not.toContain("コレクションに保存");
  });
  it("renders an empty catalog with a manual path", () => {
    const html = renderToStaticMarkup(<GalleryScreen api={{} as PracticeApi} isOnline view="examples" catalog={{ ...catalog, items: [] }} onNavigate={() => undefined} />);
    expect(html).toContain("公開できる場面を準備中です");
    expect(html).toContain("＋ 場面を追加");
  });

  it("shows only used filters and keeps Your Story as a separate action", () => {
    const html = renderToStaticMarkup(<GalleryScreen api={{} as PracticeApi} isOnline view="examples" onNavigate={() => undefined} />);
    expect(html).toContain("自分で見つける");
    expect(html).not.toContain('<option value="Conversations">');
    expect(html).not.toContain('<option value="Your Story">');
    expect(html).not.toContain('<option value="Time &amp; Mortality">');
    const detail = renderToStaticMarkup(<GalleryScreen api={{} as PracticeApi} isOnline catalog={catalog} itemId="synthetic-two" onNavigate={() => undefined} />);
    expect(detail).toContain("Listen for");
    expect(detail).toContain("Imaginary work · Test speaker · 2026");
    expect(detail).toContain("出典: Imaginary source, page 1");
    expect(detail).not.toContain("source link ·");
  });

  it("keeps discovery textless and saves it to the personal collection", async () => {
    const onNavigate = vi.fn();
    const savePersonalGalleryExample = vi.fn(async () => ({ kind: "success" as const, value: { id: "personal-id" } }));
    let view!: ReactTestRenderer;
    act(() => { view = create(<GalleryScreen api={{ savePersonalGalleryExample } as unknown as PracticeApi} isOnline catalog={catalog} itemId="synthetic-two" onNavigate={onNavigate} />); });
    const html = renderToStaticMarkup(<GalleryScreen api={{} as PracticeApi} isOnline catalog={catalog} itemId="synthetic-two" onNavigate={onNavigate} />);
    expect(html).not.toContain("The words");
    expect(html).not.toContain("I will speak clearly.");
    const button = view.root.findAllByType("button").find(entry => entry.props.children === "＋ コレクションに保存");
    await act(async () => { await button!.props.onClick(); });
    expect(savePersonalGalleryExample).toHaveBeenCalledWith("synthetic-two");
    expect(JSON.stringify(view.toJSON())).toContain("保存済み");
  });

  it("creates only after an explicit practice tap through the canonical API", async () => {
    const createGalleryScript = vi.fn(async () => ({ kind: "success" as const, script: { id: "owned-script" } }));
    const getGalleryPractice = vi.fn(async () => ({ kind: "success" as const, practice: { id: "synthetic-one", practiceTextEn: "I will speak clearly.", translationJa: null, targetSeconds: 72, locale: "en-US", contentHash: "0".repeat(64) } }));
    const onNavigate = vi.fn();
    let view!: ReactTestRenderer;
    await act(async () => { view = create(<GalleryScreen api={{ createGalleryScript, getGalleryPractice } as unknown as PracticeApi} isOnline catalog={catalog} itemId="synthetic-one" onNavigate={onNavigate} />); });
    expect(getGalleryPractice).toHaveBeenCalledWith("synthetic-one", expect.any(AbortSignal));
    expect(view.root.findAllByType("p").some(entry => entry.props.children === "I will speak clearly.")).toBe(true);
    expect(createGalleryScript).not.toHaveBeenCalled();
    const button = view.root.findAllByType("button").find(entry => entry.props.children === "この一節で練習する");
    await act(async () => { await button!.props.onClick(); });
    expect(createGalleryScript).toHaveBeenCalledWith("synthetic-one");
    expect(onNavigate).toHaveBeenCalledWith({ name: "listen", scriptId: "owned-script" });
  });

  it("does not navigate after leaving while a create request is pending", async () => {
    let resolve!: (value: { kind: "success"; script: { id: string } }) => void;
    const createGalleryScript = vi.fn(() => new Promise<{ kind: "success"; script: { id: string } }>(done => { resolve = done; }));
    const getGalleryPractice = vi.fn(async () => ({ kind: "success" as const, practice: { id: "synthetic-one", practiceTextEn: "I will speak clearly.", translationJa: null, targetSeconds: 72, locale: "en-US", contentHash: "0".repeat(64) } }));
    const onNavigate = vi.fn();
    let view!: ReactTestRenderer;
    await act(async () => { view = create(<GalleryScreen api={{ createGalleryScript, getGalleryPractice } as unknown as PracticeApi} isOnline catalog={catalog} itemId="synthetic-one" onNavigate={onNavigate} />); });
    const button = view.root.findAllByType("button").find(entry => entry.props.children === "この一節で練習する");
    let pending!: Promise<void>;
    act(() => { pending = button!.props.onClick(); });
    act(() => { view.unmount(); });
    resolve({ kind: "success", script: { id: "owned-script" } });
    await act(async () => { await pending; });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("keeps a create response valid when connectivity changes during the request", async () => {
    let resolve!: (value: { kind: "success"; script: { id: string } }) => void;
    const createGalleryScript = vi.fn(() => new Promise<{ kind: "success"; script: { id: string } }>(done => { resolve = done; }));
    const getGalleryPractice = vi.fn(async () => ({ kind: "success" as const, practice: { id: "synthetic-one", practiceTextEn: "I will speak clearly.", translationJa: null, targetSeconds: 72, locale: "en-US", contentHash: "0".repeat(64) } }));
    const api = { createGalleryScript, getGalleryPractice } as unknown as PracticeApi;
    const onNavigate = vi.fn();
    let view!: ReactTestRenderer;
    await act(async () => { view = create(<GalleryScreen api={api} isOnline catalog={catalog} itemId="synthetic-one" onNavigate={onNavigate} />); });
    const button = view.root.findAllByType("button").find(entry => entry.props.children === "この一節で練習する");
    let pending!: Promise<void>;
    act(() => { pending = button!.props.onClick(); });
    act(() => { view.update(<GalleryScreen api={api} isOnline={false} catalog={catalog} itemId="synthetic-one" onNavigate={onNavigate} />); });
    await act(async () => { view.update(<GalleryScreen api={api} isOnline catalog={catalog} itemId="synthetic-one" onNavigate={onNavigate} />); });
    resolve({ kind: "success", script: { id: "owned-script" } });
    await act(async () => { await pending; });
    expect(onNavigate).toHaveBeenCalledWith({ name: "listen", scriptId: "owned-script" });
    expect(view.root.findAllByType("button").find(entry => entry.props.children === "この一節で練習する")!.props.disabled).toBe(false);
  });

  it("fences a late detail response after navigating to DISCOVERY", async () => {
    type PracticeSuccess = { kind: "success"; practice: { id: string; practiceTextEn: string; translationJa: null; targetSeconds: number; locale: string; contentHash: string } };
    let resolve!: (value: PracticeSuccess) => void;
    const getGalleryPractice = vi.fn(() => new Promise<PracticeSuccess>(done => { resolve = done; }));
    const api = { getGalleryPractice } as unknown as PracticeApi;
    let view!: ReactTestRenderer;
    act(() => { view = create(<GalleryScreen api={api} isOnline catalog={catalog} itemId="synthetic-one" onNavigate={() => undefined} />); });
    act(() => { view.update(<GalleryScreen api={api} isOnline catalog={catalog} itemId="synthetic-two" onNavigate={() => undefined} />); });
    await act(async () => { resolve({ kind: "success", practice: { id: "synthetic-one", practiceTextEn: "Late synthetic words.", translationJa: null, targetSeconds: 72, locale: "en-US", contentHash: "0".repeat(64) } }); });
    expect(JSON.stringify(view.toJSON())).not.toContain("Late synthetic words.");
  });
});
