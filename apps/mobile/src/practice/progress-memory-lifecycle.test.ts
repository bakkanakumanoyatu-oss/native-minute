import { afterEach, expect, it, vi } from "vitest";
import type { MobileAuthController } from "../auth/mobile-auth";
import type { MobileAuthState } from "../auth/state-machine";
import { bindProgressMemory } from "./progress-memory-lifecycle";
import { ProgressMemory } from "./progress-memory";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it("connects native inactive, browser visibility, offline and auth/session revocation with cleanup", async () => {
  vi.useFakeTimers();
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const win = new EventTarget();
  const nav = { onLine: true };
  vi.stubGlobal("document", doc); vi.stubGlobal("window", win); vi.stubGlobal("navigator", nav);
  let publish!: (state: MobileAuthState) => void;
  let native!: (active: boolean) => void;
  const unsubscribe = vi.fn(), remove = vi.fn(async () => undefined);
  const auth = { subscribe: (listener: typeof publish) => { publish = listener; listener({ kind: "authenticated", userId: "a" }); return unsubscribe; } } as unknown as MobileAuthController;
  const read = vi.fn(async () => ({ kind: "success" as const, progress: { scripts: [], totalScripts: 5, totalReviewedTakes: 2, bestTakeCount: 1 } }));
  const memory = new ProgressMemory(read);
  const stop = bindProgressMemory(memory, auth, "a", async listener => { native = listener; return { remove }; });
  const observe = memory.subscribe(() => undefined);
  await memory.revalidate();
  publish({ kind: "refreshing" });
  expect(memory.getSnapshot().kind).toBe("ready");
  native(false);
  expect(memory.getSnapshot().kind).toBe("loading");
  doc.dispatchEvent(new Event("visibilitychange"));
  await memory.revalidate();
  expect(read).toHaveBeenCalledTimes(1); // Browser-visible does not override native inactive.
  native(true); await memory.revalidate();
  expect(read).toHaveBeenCalledTimes(2);
  doc.visibilityState = "hidden"; doc.dispatchEvent(new Event("visibilitychange"));
  expect(memory.getSnapshot().kind).toBe("loading");
  doc.visibilityState = "visible"; doc.dispatchEvent(new Event("visibilitychange")); await memory.revalidate();
  nav.onLine = false; win.dispatchEvent(new Event("offline"));
  expect(memory.getSnapshot().kind).toBe("loading");
  nav.onLine = true; win.dispatchEvent(new Event("online")); await memory.revalidate();
  publish({ kind: "authenticated", userId: "b" });
  publish({ kind: "authenticated", userId: "a" }); // Same-frame A→B→A must stay revoked.
  expect(memory.getSnapshot().kind).toBe("loading");
  const count = read.mock.calls.length;
  await memory.revalidate(); expect(read).toHaveBeenCalledTimes(count);
  stop(); observe();
  expect(unsubscribe).toHaveBeenCalledOnce(); expect(remove).toHaveBeenCalledOnce();
});

it("revokes immediately at logout start, even before server sign-out completes", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" }));
  vi.stubGlobal("window", new EventTarget()); vi.stubGlobal("navigator", { onLine: true });
  let publish!: (state: MobileAuthState) => void;
  const auth = { subscribe: (listener: typeof publish) => { publish = listener; return () => undefined; } } as unknown as MobileAuthController;
  const read = vi.fn(async () => ({ kind: "success" as const, progress: { scripts: [], totalScripts: 0, totalReviewedTakes: 0, bestTakeCount: 0 } }));
  const memory = new ProgressMemory(read);
  const stop = bindProgressMemory(memory, auth, "a", async () => ({ remove: async () => undefined }));
  await memory.revalidate(); publish({ kind: "signing_out" });
  expect(memory.getSnapshot().kind).toBe("loading");
  await memory.revalidate(); expect(read).toHaveBeenCalledOnce();
  stop();
});
