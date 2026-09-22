import type { MobileAuthController } from "../auth/mobile-auth";
import { addAppStateChangeListener } from "../lib/app-lifecycle";
import { isPracticeOwnerStateCurrent } from "./api";
import type { ProgressMemory } from "./progress-memory";

export function bindProgressMemory(
  memory: ProgressMemory,
  auth: MobileAuthController,
  ownerUserId: string,
  addNativeListener = addAppStateChangeListener
) {
  let active = true;
  let nativeActive = true;
  let removeNative: (() => Promise<void>) | undefined;
  const visibility = () => memory.setForeground(nativeActive && document.visibilityState === "visible");
  const connectivity = () => memory.setOnline(navigator.onLine);
  const unsubscribe = auth.subscribe(state => {
    if (!isPracticeOwnerStateCurrent(state, ownerUserId)) memory.revoke();
  });
  visibility();
  connectivity();
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("online", connectivity);
  window.addEventListener("offline", connectivity);
  void addNativeListener(isActive => {
    if (!active) return;
    nativeActive = isActive;
    visibility();
  }).then(handle => {
    if (!active) void handle.remove();
    else removeNative = () => handle.remove();
  }).catch(() => {
    // The web preview uses visibilitychange; the native bridge supplies inactive too.
  });
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
