import { describe, expect, it, vi } from "vitest";
import { startDynamicType, type DynamicTypeBridge, type DynamicTypeSettings } from "./dynamic-type";

function harness(initial: Promise<DynamicTypeSettings> = Promise.resolve({ rootFontSize: 16, accessibility: false })) {
  const style = { setProperty: vi.fn() };
  const toggleAttribute = vi.fn();
  const root = { style, toggleAttribute } as unknown as HTMLElement;
  const remove = vi.fn(async () => {});
  let emit!: (settings: DynamicTypeSettings) => void;
  const bridge: DynamicTypeBridge = {
    getSettings: vi.fn(() => initial),
    addListener: vi.fn(async (_event, listener) => { emit = listener; return { remove }; })
  };
  return { root, style, toggleAttribute, bridge, remove, emit: (settings: DynamicTypeSettings) => emit(settings) };
}
const tick = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

describe("native Dynamic Type root typography", () => {
  it("preserves the 16px normal baseline and follows increases and decreases without changing fonts", async () => {
    const h = harness(); const stop = startDynamicType(h.root, h.bridge, true); await tick();
    expect(h.style.setProperty).toHaveBeenLastCalledWith("--nm-root-font-size", "16px");
    h.emit({ rootFontSize: 23.5, accessibility: false });
    expect(h.style.setProperty).toHaveBeenLastCalledWith("--nm-root-font-size", "23.5px");
    h.emit({ rootFontSize: 49.8, accessibility: true });
    expect(h.style.setProperty).toHaveBeenLastCalledWith("--nm-root-font-size", "49.8px");
    expect(h.toggleAttribute).toHaveBeenLastCalledWith("data-accessibility-text", true);
    h.emit({ rootFontSize: 16, accessibility: false });
    expect(h.toggleAttribute).toHaveBeenLastCalledWith("data-accessibility-text", false);
    expect(h.bridge.addListener).toHaveBeenCalledTimes(1);
    stop(); expect(h.remove).toHaveBeenCalledTimes(1);
  });
  it("does not overwrite a runtime event with a stale startup reply", async () => {
    let resolve!: (s: DynamicTypeSettings) => void;
    const h = harness(new Promise(r => { resolve = r; }));
    const stop = startDynamicType(h.root, h.bridge, true); await tick();
    h.emit({ rootFontSize: 40, accessibility: true });
    resolve({ rootFontSize: 16, accessibility: false }); await tick();
    expect(h.style.setProperty).toHaveBeenCalledTimes(1);
    expect(h.style.setProperty).toHaveBeenLastCalledWith("--nm-root-font-size", "40px"); stop();
  });
  it("removes an asynchronously registered listener on disposal and ignores late updates", async () => {
    const h = harness(); const stop = startDynamicType(h.root, h.bridge, true); stop(); await tick();
    h.emit({ rootFontSize: 40, accessibility: true });
    expect(h.remove).toHaveBeenCalledTimes(1); expect(h.bridge.getSettings).not.toHaveBeenCalled();
    expect(h.style.setProperty).not.toHaveBeenCalled();
  });
  it("rejects invalid native numbers and leaves web previews unscaled", async () => {
    const h = harness(); startDynamicType(h.root, h.bridge, false); await tick();
    expect(h.bridge.addListener).not.toHaveBeenCalled();
    const stop = startDynamicType(h.root, h.bridge, true); await tick(); h.style.setProperty.mockClear();
    for (const rootFontSize of [0, -1, NaN, Infinity]) h.emit({ rootFontSize, accessibility: false });
    expect(h.style.setProperty).not.toHaveBeenCalled(); stop();
  });
});
