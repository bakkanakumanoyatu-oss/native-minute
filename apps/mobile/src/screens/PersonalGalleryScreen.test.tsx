import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { PracticeApi } from "../practice/api";
import { GalleryScreen } from "./GalleryScreen";
import { initialGalleryViewState } from "./PersonalGalleryScreen";

function text(view: ReactTestRenderer) { return JSON.stringify(view.toJSON()); }

describe("personal Gallery mobile states", () => {
  it("paginates and searches a 300 item collection without rendering all items", async () => {
    const items = Array.from({ length: 300 }, (_, index) => ({
      id: `item-${index}`, sceneTitle: `Scene ${index}`, workTitle: "Work", speaker: null,
      sourceType: "Movies", themes: [], shortNote: null, sourceExampleId: null,
      createdAt: "2026-09-29T00:00:00Z", lockVersion: 1
    }));
    const listPersonalGallery = vi.fn(async (input: { query: string; offset: number; limit: number }) => {
      const matches = items.filter(item => item.sceneTitle.toLowerCase().includes(input.query.toLowerCase()));
      return { kind: "success" as const, value: { items: matches.slice(input.offset, input.offset + input.limit),
        nextOffset: input.offset + input.limit < matches.length ? input.offset + input.limit : null } };
    });
    const api = { listPersonalGallery } as unknown as PracticeApi;
    function Fixture() {
      const [state, setState] = useState(initialGalleryViewState);
      return <GalleryScreen api={api} isOnline viewState={state} onViewStateChange={patch => setState(current => ({ ...current, ...patch }))} onNavigate={() => undefined} />;
    }
    let view!: ReactTestRenderer;
    await act(async () => { view = create(<Fixture />); await new Promise(resolve => setTimeout(resolve, 250)); });
    expect(view.root.findAllByType("li")).toHaveLength(30);
    act(() => view.root.findAllByType("button").find(node => node.props.children === "次へ")!.props.onClick());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 250)); });
    expect(listPersonalGallery).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 30, limit: 30 }), expect.any(AbortSignal));
    expect(view.root.findAllByType("li")).toHaveLength(30);
    act(() => view.root.findAllByType("input").find(node => node.props.placeholder?.includes("作品"))!.props.onChange({ target: { value: "Scene 299" } }));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 250)); });
    expect(listPersonalGallery).toHaveBeenLastCalledWith(expect.objectContaining({ query: "Scene 299", offset: 0 }), expect.any(AbortSignal));
    expect(view.root.findAllByType("li")).toHaveLength(1);
    expect(text(view)).toContain("Scene 299");
  });

  it("discards an old save response and clears the form after changing Gallery views", async () => {
    let finish!: (value: { kind: "success"; value: { id: string } }) => void;
    const createPersonalGalleryItem = vi.fn(() => new Promise<{ kind: "success"; value: { id: string } }>(resolve => { finish = resolve; }));
    const listPersonalGallery = vi.fn(async () => ({ kind: "success" as const, value: { items: [], nextOffset: null } }));
    const api = { createPersonalGalleryItem, listPersonalGallery } as unknown as PracticeApi;
    const onNavigate = vi.fn();
    const viewState = initialGalleryViewState();
    let view!: ReactTestRenderer;
    act(() => { view = create(<GalleryScreen api={api} isOnline view="new" viewState={viewState} onNavigate={onNavigate} />); });
    act(() => view.root.findAllByType("input").find(node => node.props.placeholder?.includes("どんな場面"))!.props.onChange({ target: { value: "First scene" } }));
    const save = view.root.findAllByType("button").find(node => node.props.children === "コレクションに保存")!;
    let pending!: Promise<void>;
    act(() => { pending = save.props.onClick(); });
    act(() => { view.update(<GalleryScreen api={api} isOnline viewState={viewState} onNavigate={onNavigate} />); });
    await act(async () => { finish({ kind: "success", value: { id: "saved-id" } }); await pending; });
    expect(onNavigate).not.toHaveBeenCalled();
    act(() => { view.update(<GalleryScreen api={api} isOnline view="new" viewState={viewState} onNavigate={onNavigate} />); });
    expect(view.root.findAllByType("input").find(node => node.props.placeholder?.includes("どんな場面"))!.props.value).toBe("");
  });

  it("keeps a scene-only quick add value when saving fails", async () => {
    const createPersonalGalleryItem = vi.fn(async () => ({ kind: "invalid-request" as const, reasonCode: "request_invalid" }));
    let view!: ReactTestRenderer;
    act(() => { view = create(<GalleryScreen api={{ createPersonalGalleryItem } as unknown as PracticeApi} isOnline view="new" viewState={initialGalleryViewState()} onNavigate={() => undefined} />); });
    const title = view.root.findAllByType("input").find(node => node.props.placeholder?.includes("どんな場面"))!;
    act(() => title.props.onChange({ target: { value: "A quiet conversation" } }));
    const save = view.root.findAllByType("button").find(node => node.props.children === "コレクションに保存")!;
    await act(async () => { await save.props.onClick(); });
    expect(createPersonalGalleryItem).toHaveBeenCalledWith(expect.objectContaining({ sceneTitle: "A quiet conversation", excerptText: null }));
    expect(view.root.findAllByType("input").find(node => node.props.placeholder?.includes("どんな場面"))!.props.value).toBe("A quiet conversation");
    expect(text(view)).toContain("内容を確認して再試行してください");
  });

  it("shows the created Script action for an owned saved item", async () => {
    const id = "10000000-0000-4000-8000-000000000071";
    const scriptId = "10000000-0000-4000-8000-000000000072";
    const getPersonalGalleryItem = vi.fn(async () => ({ kind: "success" as const, value: {
      id, sceneTitle: "A scene", workTitle: "Work", speaker: null, sourceType: "Movies", themes: [], shortNote: null,
      sourceExampleId: null, createdAt: "2026-09-29T00:00:00Z", lockVersion: 1, context: null,
      personalNote: null, excerptText: "Hello world", sourceUrl: null, sourceLocator: null,
      speakingNotes: [], locale: "en-US", updatedAt: "2026-09-29T00:00:00Z", linkedScriptId: scriptId, linkedScriptArchivedAt: null
    } }));
    const onNavigate = vi.fn();
    let view!: ReactTestRenderer;
    await act(async () => {
      view = create(<GalleryScreen api={{ getPersonalGalleryItem } as unknown as PracticeApi} isOnline view="personal" personalId={id} viewState={initialGalleryViewState()} onNavigate={onNavigate} />);
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    expect(getPersonalGalleryItem).toHaveBeenCalledWith(id, expect.any(AbortSignal));
    const open = view.root.findAllByType("button").find(node => node.props.children === "作成した台本を開く")!;
    act(() => open.props.onClick());
    expect(onNavigate).toHaveBeenCalledWith({ name: "listen", scriptId });
  });

  it("asks for a Script title before converting a scene title over 120 characters", async () => {
    const id = "10000000-0000-4000-8000-000000000073";
    const createPersonalGalleryScript = vi.fn();
    const getPersonalGalleryItem = vi.fn(async () => ({ kind: "success" as const, value: {
      id, sceneTitle: "Long ".repeat(30), workTitle: null, speaker: null, sourceType: null, themes: [], shortNote: null,
      sourceExampleId: null, createdAt: "2026-09-29T00:00:00Z", lockVersion: 1, context: null,
      personalNote: null, excerptText: "Hello world", sourceUrl: null, sourceLocator: null,
      speakingNotes: [], locale: "en-US", updatedAt: "2026-09-29T00:00:00Z", linkedScriptId: null, linkedScriptArchivedAt: null
    } }));
    let view!: ReactTestRenderer;
    await act(async () => {
      view = create(<GalleryScreen api={{ getPersonalGalleryItem, createPersonalGalleryScript } as unknown as PracticeApi} isOnline view="personal" personalId={id} viewState={initialGalleryViewState()} onNavigate={() => undefined} />);
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    expect(text(view)).toContain("台本名を入力する");
    const button = view.root.findAllByType("button").find(node => node.props.children === "台本名を入力する")!;
    await act(async () => { await button.props.onClick(); });
    expect(createPersonalGalleryScript).not.toHaveBeenCalled();
    expect(view.root.findAllByType("input").find(node => node.props.maxLength === 120)!.props.value).toBe("");
  });
});
