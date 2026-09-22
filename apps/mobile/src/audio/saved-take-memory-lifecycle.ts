import type { MobileAuthController } from "../auth/mobile-auth";
import { addAppStateChangeListener } from "../lib/app-lifecycle";
import type { SavedTakeAudioMemory } from "./saved-take-memory";

export function bindSavedTakeAudioMemory(memory: SavedTakeAudioMemory, auth: MobileAuthController, owner: string, addNativeListener = addAppStateChangeListener) {
  let active = true;
  let nativeActive = true;
  let removeNative: (() => Promise<void>) | undefined;
  const visibility = () => memory.setForeground(nativeActive && document.visibilityState === "visible");
  const connectivity = () => memory.setOnline(navigator.onLine);
  const unsubscribe = auth.subscribe(state => {
    // Even a same-owner auth transition/refresh invalidates the audio proof.
    if (state.kind === "authenticated" && state.userId === owner || state.kind === "refreshing") memory.invalidate();
    else memory.revoke();
  });
  visibility(); connectivity();
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("online", connectivity);
  window.addEventListener("offline", connectivity);
  void addNativeListener(isActive => { if (active) { nativeActive = isActive; visibility(); } }).then(handle => {
    if (!active) void handle.remove();
    else removeNative = () => handle.remove();
  }).catch(() => { /* Web uses visibilitychange; native also reports inactive. */ });
  return () => {
    active = false;
    unsubscribe();
    document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("online", connectivity);
    window.removeEventListener("offline", connectivity);
    void removeNative?.();
    memory.setForeground(false);
  };
}
