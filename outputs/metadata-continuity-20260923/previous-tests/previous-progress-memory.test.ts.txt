import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MobileProgress, MobileProgressRequestState } from "../lib/api";
import { ProgressMemory } from "./progress-memory";

const progress: MobileProgress = { scripts: [], totalScripts: 5, totalReviewedTakes: 2, bestTakeCount: 1 };
const success = (value = progress): MobileProgressRequestState => ({ kind: "success", progress: value });
function deferred() {
  let resolve!: (value: MobileProgressRequestState) => void;
  const promise = new Promise<MobileProgressRequestState>(done => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("30 second session metadata memory", () => {
  it("loads canonical data initially and immediately reuses it while every revisit revalidates", async () => {
    const refresh = deferred();
    const read = vi.fn().mockResolvedValueOnce(success()).mockReturnValueOnce(refresh.promise);
    const memory = new ProgressMemory(read);
    expect(memory.getSnapshot()).toEqual({ kind: "loading" });
    await memory.revalidate();
    expect(memory.getSnapshot()).toEqual({ kind: "ready", progress, refreshing: false });
    const next = memory.revalidate();
    expect(memory.getSnapshot()).toEqual({ kind: "ready", progress, refreshing: true });
    await Promise.resolve();
    expect(read).toHaveBeenCalledTimes(2);
    refresh.resolve(success({ ...progress, totalReviewedTakes: 3 }));
    await next;
    expect(memory.getSnapshot()).toMatchObject({ progress: { totalReviewedTakes: 3 }, refreshing: false });
  });

  it("expires at 30 seconds from success, without extending TTL on reads or slow refresh", async () => {
    let now = 100;
    const refresh = deferred();
    const memory = new ProgressMemory(vi.fn().mockResolvedValueOnce(success()).mockReturnValue(refresh.promise), () => now);
    await memory.revalidate();
    now += 29_999;
    expect(memory.getSnapshot().kind).toBe("ready");
    const pending = memory.revalidate();
    await Promise.resolve();
    now++;
    expect(memory.getSnapshot()).toEqual({ kind: "loading" });
    refresh.resolve(success());
    await pending;
    expect(memory.getSnapshot()).toEqual({ kind: "loading" });
  });

  it("drops the shared reference even offscreen at TTL and refetches when observed", async () => {
    const read = vi.fn().mockResolvedValue(success());
    const memory = new ProgressMemory(read);
    await memory.revalidate();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(memory.getSnapshot().kind).toBe("loading");
    expect(read).toHaveBeenCalledTimes(1);
    const unsubscribe = memory.subscribe(() => undefined);
    await memory.revalidate();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(read).toHaveBeenCalledTimes(3);
    unsubscribe();
    memory.revoke();
  });

  it.each(["background", "offline"])("invalidates on %s and refetches on return without accepting suspended requests", async event => {
    const old = deferred();
    const read = vi.fn().mockResolvedValueOnce(success()).mockReturnValueOnce(old.promise).mockResolvedValue(success({ ...progress, totalScripts: 4 }));
    const memory = new ProgressMemory(read);
    const unsubscribe = memory.subscribe(() => undefined);
    const transition = event === "background" ? memory.setForeground : memory.setOnline;
    await memory.revalidate();
    const pending = memory.revalidate();
    await Promise.resolve();
    transition(false);
    expect(memory.getSnapshot().kind).toBe("loading");
    old.resolve(success());
    await pending;
    expect(memory.getSnapshot().kind).toBe("loading");
    transition(true);
    await memory.revalidate();
    expect(memory.getSnapshot()).toMatchObject({ progress: { totalScripts: 4 } });
    unsubscribe(); memory.revoke();
  });

  it("shares only current in-flight work across rapid navigation", async () => {
    const response = deferred();
    const read = vi.fn(() => response.promise);
    const memory = new ProgressMemory(read);
    const first = memory.revalidate();
    expect(memory.revalidate()).toBe(first);
    await Promise.resolve();
    expect(read).toHaveBeenCalledTimes(1);
    response.resolve(success()); await first;
  });

  it.each([true, false])("rejects stale success/error after mutation and newer request (success=%s)", async ok => {
    const old = deferred();
    const read = vi.fn().mockResolvedValueOnce(success()).mockReturnValueOnce(old.promise).mockResolvedValue(success({ ...progress, totalReviewedTakes: 1 }));
    const memory = new ProgressMemory(read);
    await memory.revalidate();
    const pending = memory.revalidate(); await Promise.resolve();
    const finish = memory.beginMutation();
    expect(memory.getSnapshot().kind).toBe("loading");
    await memory.revalidate();
    expect(read).toHaveBeenCalledTimes(2);
    finish(); await memory.revalidate();
    old.resolve(ok ? success() : { kind: "server-error", status: 500 });
    await pending;
    expect(memory.getSnapshot()).toMatchObject({ progress: { totalReviewedTakes: 1 } });
  });

  it("waits for all overlapping mutations and refetches only after the last one settles", async () => {
    const read = vi.fn().mockResolvedValue(success());
    const memory = new ProgressMemory(read);
    const unsubscribe = memory.subscribe(() => undefined);
    await memory.revalidate();
    const finishA = memory.beginMutation(), finishB = memory.beginMutation();
    finishA(); await memory.revalidate();
    expect(read).toHaveBeenCalledTimes(1);
    finishB(); await memory.revalidate();
    expect(read).toHaveBeenCalledTimes(2);
    unsubscribe(); memory.revoke();
  });

  it.each(["error", "throw"])("clears success on revalidation %s and allows canonical retry", async mode => {
    const read = vi.fn().mockResolvedValueOnce(success());
    if (mode === "throw") read.mockRejectedValueOnce(new Error("offline"));
    else read.mockResolvedValueOnce({ kind: "server-error", status: 503 });
    read.mockResolvedValue(success());
    const memory = new ProgressMemory(read);
    await memory.revalidate(); await memory.revalidate();
    expect(memory.getSnapshot().kind).toBe("error");
    expect(memory.getSnapshot()).not.toHaveProperty("progress");
    await memory.revalidate();
    expect(memory.getSnapshot().kind).toBe("ready");
  });

  it("permanently revokes logout/switch instances and starts a new session/process empty", async () => {
    const old = deferred();
    const read = vi.fn().mockResolvedValueOnce(success()).mockReturnValueOnce(old.promise);
    const memory = new ProgressMemory(read);
    await memory.revalidate();
    const pending = memory.revalidate(); await Promise.resolve();
    memory.revoke(); memory.setForeground(false); memory.setForeground(true);
    old.resolve(success()); await pending; await memory.revalidate();
    expect(memory.getSnapshot().kind).toBe("loading");
    expect(read).toHaveBeenCalledTimes(2);
    expect(new ProgressMemory(read).getSnapshot().kind).toBe("loading");
  });
});
