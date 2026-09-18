import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export interface DynamicTypeSettings {
  rootFontSize: number;
  accessibility: boolean;
}

export interface DynamicTypeBridge {
  getSettings(): Promise<DynamicTypeSettings>;
  addListener(event: "settingsChanged", listener: (settings: DynamicTypeSettings) => void): Promise<PluginListenerHandle>;
}

const nativeDynamicType = registerPlugin<DynamicTypeBridge>("DynamicType");

/** One subscription per document, outside React effects/StrictMode. */
export function startDynamicType(
  root: HTMLElement,
  bridge: DynamicTypeBridge = nativeDynamicType,
  enabled = Capacitor.getPlatform() === "ios"
): () => void {
  if (!enabled) return () => {};
  let disposed = false;
  let events = 0;
  let handle: PluginListenerHandle | undefined;
  const apply = ({ rootFontSize, accessibility }: DynamicTypeSettings) => {
    if (disposed || !Number.isFinite(rootFontSize) || rootFontSize <= 0) return;
    root.style.setProperty("--nm-root-font-size", `${rootFontSize}px`);
    root.toggleAttribute("data-accessibility-text", accessibility);
  };

  void (async () => {
    try {
      handle = await bridge.addListener("settingsChanged", (settings) => {
        events += 1;
        apply(settings);
      });
      if (disposed) { await handle.remove(); return; }
      const beforeRead = events;
      const settings = await bridge.getSettings();
      // A category change delivered during the initial read wins over its stale reply.
      if (events === beforeRead) apply(settings);
    } catch {
      // Keep the readable CSS default if an older native binary lacks the bridge.
      console.warn("Dynamic Type settings unavailable; using default text size.");
    }
  })();

  return () => {
    disposed = true;
    void handle?.remove();
  };
}
