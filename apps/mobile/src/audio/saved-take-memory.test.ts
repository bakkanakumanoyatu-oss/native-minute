import { afterEach, describe, expect, it, vi } from "vitest";
import { SavedTakeAudioMemory } from "./saved-take-memory";
import type { MobileTakeAudioDownloadState } from "../lib/api";

const identity = "a".repeat(64);
const audio = (version = identity): Extract<MobileTakeAudioDownloadState, { kind: "success" }> => ({ kind: "success", audio: new Blob(["owned audio"], { type: "audio/wav" }), contentType: "audio/wav", filename: "Take.wav", audioIdentity: version });
function fixture() {
  vi.useFakeTimers(); let now = 0; let owner = true;
  const memory = new SavedTakeAudioMemory(() => owner, () => now);
  const download = vi.fn(async () => audio());
  const visit = (take = "take", version = identity, session = "session-a") => {
    const v = memory.beginVisit("script", take);
    expect(memory.authorize(v, memory.validationEpoch(), session, version)).toBe(true);
    return v;
  };
  return { memory, download, visit, time: (ms: number) => { now = ms; }, switchOwner: () => { owner = false; } };
}
afterEach(() => vi.useRealTimers());

describe("saved Take ephemeral binary authorization", () => {
  it("downloads first, reuses only after fresh matching Review proof, and never slides the 30s expiry", async () => {
    const f = fixture(), first = f.visit();
    expect(await f.memory.load(first, "session-a", f.download)).toEqual(audio());
    expect(await f.memory.load(first, "session-a", f.download)).toEqual(audio());
    f.memory.endVisit(first); f.time(20_000);
    const next = f.memory.beginVisit("script", "take");
    expect((await f.memory.load(next, "session-a", f.download)).kind).toBe("invalid-response");
    f.memory.authorize(next, f.memory.validationEpoch(), "session-a", identity);
    expect((await f.memory.load(next, "session-a", f.download)).kind).toBe("success");
    expect(f.download).toHaveBeenCalledOnce();
    f.time(30_000);
    await f.memory.load(next, "session-a", f.download);
    expect(f.download).toHaveBeenCalledTimes(2);
    f.memory.revoke();
  });
  it.each(["background", "offline", "logout", "error", "cleanup"])("clears binary and proof on %s", async reason => {
    const f = fixture(), v = f.visit(), listener = vi.fn(), unsub = f.memory.subscribe(listener);
    await f.memory.load(v, "session-a", f.download);
    if (reason === "background") f.memory.setForeground(false);
    else if (reason === "offline") f.memory.setOnline(false);
    else if (reason === "logout") f.memory.revoke();
    else f.memory.invalidate();
    expect(listener).toHaveBeenCalledOnce();
    expect((await f.memory.load(v, "session-a", f.download)).kind).toBe("invalid-response");
    f.memory.setForeground(true); f.memory.setOnline(true);
    if (reason !== "logout") { const fresh = f.visit(); await f.memory.load(fresh, "session-a", f.download); expect(f.download).toHaveBeenCalledTimes(2); }
    unsub(); const calls = listener.mock.calls.length; f.memory.invalidate(); expect(listener).toHaveBeenCalledTimes(calls);
  });
  it("never accepts another owner or session's cached binary", async () => {
    const f = fixture(), v = f.visit(); await f.memory.load(v, "session-a", f.download);
    expect((await f.memory.load(v, "session-b", f.download)).kind).toBe("invalid-response");
    const fresh = f.visit("take", identity, "session-b"); await f.memory.load(fresh, "session-b", f.download);
    expect(f.download).toHaveBeenCalledTimes(2);
    f.switchOwner(); expect((await f.memory.load(fresh, "session-b", f.download)).kind).toBe("invalid-response");
    f.memory.revoke();
  });
  it("drops a deleted or missing identity and rejects an old audio version", async () => {
    const f = fixture(), v = f.visit(); await f.memory.load(v, "session-a", f.download);
    const missing = f.memory.beginVisit("script", "take");
    expect(f.memory.authorize(missing, f.memory.validationEpoch(), "session-a", null)).toBe(false);
    expect((await f.memory.load(missing, "session-a", f.download)).kind).toBe("invalid-response");
    const changed = f.visit("take", "b".repeat(64));
    expect((await f.memory.load(changed, "session-a", f.download)).kind).toBe("invalid-response");
    expect(f.download).toHaveBeenCalledTimes(2);
  });
  it("evicts the previous Take, retains at most one, and drops expiry timer references", async () => {
    const f = fixture(); await f.memory.load(f.visit("a"), "session-a", f.download);
    await f.memory.load(f.visit("b"), "session-a", f.download);
    await f.memory.load(f.visit("a"), "session-a", f.download);
    expect(f.download).toHaveBeenCalledTimes(3); expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(30_000); expect(vi.getTimerCount()).toBe(0);
    await f.memory.load(f.visit("a"), "session-a", f.download);
    expect(f.download).toHaveBeenCalledTimes(4); f.memory.revoke(); expect(vi.getTimerCount()).toBe(0);
  });
  it("rejects stale metadata and audio completions after rapid A/B/A navigation", async () => {
    const f = fixture(), a = f.visit("a"), epoch = f.memory.validationEpoch();
    let resolve!: (a: MobileTakeAudioDownloadState) => void;
    const pending = f.memory.load(a, "session-a", () => new Promise(r => { resolve = r; }));
    const b = f.visit("b"); await f.memory.load(b, "session-a", f.download);
    expect(f.memory.authorize(a, epoch, "session-a", identity)).toBe(false);
    resolve(audio()); expect((await pending).kind).toBe("invalid-response");
    await f.memory.load(b, "session-a", f.download); expect(f.download).toHaveBeenCalledOnce();
    await f.memory.load(f.visit("a"), "session-a", f.download); expect(f.download).toHaveBeenCalledTimes(2);
    f.memory.revoke();
  });
  it("prevents an inactive in-flight response from restoring an evicted entry", async () => {
    const f = fixture(), v = f.visit(); let resolve!: (a: MobileTakeAudioDownloadState) => void;
    const pending = f.memory.load(v, "session-a", () => new Promise(r => { resolve = r; }));
    f.memory.setForeground(false); f.memory.setForeground(true); resolve(audio());
    expect((await pending).kind).toBe("invalid-response");
    await f.memory.load(f.visit(), "session-a", f.download); expect(f.download).toHaveBeenCalledOnce(); f.memory.revoke();
  });
});
