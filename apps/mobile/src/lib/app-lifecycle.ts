import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";

interface NativeAppLifecyclePlugin {
  getLaunchUrl(): Promise<{ url: string } | undefined>;
  addListener(
    eventName: "appUrlOpen",
    listener: (event: { url: string }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "appStateChange",
    listener: (event: { isActive: boolean }) => void
  ): Promise<PluginListenerHandle>;
}

const NativeAppLifecycle = registerPlugin<NativeAppLifecyclePlugin>(
  "MobileAuthLifecycle"
);

export function addAppStateChangeListener(
  listener: (isActive: boolean) => void
) {
  return NativeAppLifecycle.addListener("appStateChange", ({ isActive }) => {
    listener(isActive);
  });
}

export function getNativeAppLaunchUrl() {
  return NativeAppLifecycle.getLaunchUrl();
}

export function addNativeAppUrlOpenListener(listener: (url: string) => void) {
  return NativeAppLifecycle.addListener("appUrlOpen", ({ url }) => {
    listener(url);
  });
}
