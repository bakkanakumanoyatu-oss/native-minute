import type { MobileAuthController } from "../auth/mobile-auth";
import { addAppStateChangeListener } from "../lib/app-lifecycle";

type Memory = {
  revoke(): void;
  setForeground(active: boolean): void;
  setOnline(online: boolean): void;
  setSessionReady(ready: boolean): void;
};
export function bindDisplayMemory(memories: readonly Memory[], auth: MobileAuthController, ownerUserId: string, addNativeListener = addAppStateChangeListener) {
  let active = true;
  let nativeActive = true;
  let visible = true;
  let resumeGeneration = 0;
  let resumeNeeded = false;
  let checking = false;
  let removeNative: (() => Promise<void>) | undefined;
  const resume = () => {
    if (!active || !visible || !resumeNeeded || checking) return;
    checking = true;
    const generation = resumeGeneration;
    void (async () => {
      let result = await auth.refreshIfNeeded();
      if (!result.ok && result.reasonCode !== "auth_refresh_failed") result = await auth.refresh();
      if (!active || generation !== resumeGeneration || !visible) return;
      const state = auth.getState();
      if (result.ok && state.kind === "authenticated" && state.userId === ownerUserId) {
        resumeNeeded = false;
        memories.forEach(memory => { memory.setSessionReady(true); memory.setForeground(true); });
      }
    })().catch(() => { /* Preserve display; retry only at the next resume/online event. */ }).finally(() => { if (generation === resumeGeneration) checking = false; });
  };
  const visibility = () => {
    const next = nativeActive && document.visibilityState === "visible";
    if (next === visible) return;
    visible = next;
    ++resumeGeneration;
    resumeNeeded = true;
    checking = false;
    if (!next) { memories.forEach(memory => memory.setForeground(false)); return; }
    // Resume through the existing auth authority; never invent a new session ID.
    resume();
  };
  const connectivity = () => {
    memories.forEach(memory => memory.setOnline(navigator.onLine));
    if (navigator.onLine) resume();
  };
  const unsubscribe = auth.subscribe(state => {
    for (const memory of memories) {
      if (state.kind === "refreshing") memory.setSessionReady(false);
      else if (state.kind === "authenticated" && state.userId === ownerUserId) {
        memory.setSessionReady(true);
      } else memory.revoke();
    }
  });
  visibility(); connectivity();
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("online", connectivity);
  window.addEventListener("offline", connectivity);
  void addNativeListener(isActive => { if (active) { nativeActive = isActive; visibility(); } }).then(handle => {
    if (!active) void handle.remove(); else removeNative = () => handle.remove();
  }).catch(() => { /* Web previews use visibilitychange. */ });
  return () => {
    active = false; unsubscribe();
    document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("online", connectivity);
    window.removeEventListener("offline", connectivity);
    void removeNative?.();
    memories.forEach(memory => memory.setForeground(false));
  };
}
