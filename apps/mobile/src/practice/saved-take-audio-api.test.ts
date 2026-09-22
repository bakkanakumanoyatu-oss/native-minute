import { afterEach, expect, it, vi } from "vitest";
import { createPracticeApi } from "./api";
import type { MobileAuthController } from "../auth/mobile-auth";
import type { MobileAuthState } from "../auth/state-machine";
import type { MobileReview } from "../lib/api";
const identity = "a".repeat(64);
const review: MobileReview = {
  takeId: "take", scriptId: "script", favorite: false, displayName: null,
  createdAt: "2026-09-22T00:00:00Z", reviewedAt: null, transcriptText: "Hello",
  audioIdentity: identity,
  evaluation: { score: 80, accuracyScore: 80, fluencyScore: 80, rhythmScore: 80, summaryJa: "良い", strengthsJa: [], weakWords: [], scriptWordCount: 1, transcriptWordCount: 1 },
  coach: { titleJa: "次", summaryJa: "次", bulletPointsJa: [], nextStepJa: "次", focusWords: [] }
};
function fixture() {
  let state: MobileAuthState = { kind: "authenticated", userId: "owner" };
  let token = "token-a", version: string | null = identity, status = 200, audioStatus = 200;
  let hold: ((signal: AbortSignal) => Promise<void>) | undefined;
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).endsWith("/audio")) {
      await hold?.(init!.signal!);
      if (audioStatus !== 200) return new Response(JSON.stringify({ok:false,error:{code:"session_invalid"}}), {status:audioStatus, headers:{"content-type":"application/json"}});
      return new Response(new Blob(["owned audio"], { type: "audio/wav" }), { headers: { "content-type": "audio/wav", "content-disposition": "attachment; filename*=UTF-8''Take.wav", "x-take-audio-identity": version ?? "" } });
    }
    return new Response(JSON.stringify(status === 200 ? { ok: true, data: { review: { ...review, audioIdentity: version } } } : { ok: false, error: { code: status === 404 ? "review_not_found" : "session_invalid" } }), { status, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchImpl);
  const auth = { getState: () => state, getAccessToken: async () => token, refresh: vi.fn(), signOut: vi.fn() } as unknown as MobileAuthController;
  const api = createPracticeApi({ auth, bffBaseUrl: "https://fixture.test", ownerUserId: "owner", onTiming: () => undefined });
  const enter = async () => { const result = await api.getReview("script", "take"); if (result.kind !== "success") throw Error(result.kind); return result.review; };
  const counts = () => ({ metadata: fetchImpl.mock.calls.filter(([u]) => !String(u).endsWith("/audio")).length, audio: fetchImpl.mock.calls.filter(([u]) => String(u).endsWith("/audio")).length });
  return { api, enter, counts, auth, holdAudio: (value: typeof hold) => { hold = value; }, setAudioStatus: (value: number) => { audioStatus = value; }, setStatus: (v: number) => { status = v; }, setVersion: (v: string | null) => { version = v; }, switchSession: () => { token = "token-b"; }, switchOwner: () => { state = { kind: "authenticated", userId: "other" }; } };
}
afterEach(() => vi.unstubAllGlobals());
it("makes a Review request on each visit but zero audio GET/bytes on an authorized re-entry; Share stays fresh", async () => {
  const f = fixture(), first = await f.enter();
  expect((await f.api.prepareSavedTakeAudio!(first)).kind).toBe("success");
  f.api.savedTakeAudioMemory!.endVisit(first.audioVisit!);
  const next = await f.enter();
  expect((await f.api.prepareSavedTakeAudio!(next)).kind).toBe("success");
  expect(f.counts()).toEqual({ metadata: 2, audio: 1 });
  await f.api.downloadTakeAudio("take"); expect(f.counts().audio).toBe(2);
  f.api.savedTakeAudioMemory!.revoke();
});
it.each([401, 403, 404, 500])("a Review %s removes old audio authorization", async status => {
  const f = fixture(), first = await f.enter(); await f.api.prepareSavedTakeAudio!(first);
  f.setStatus(status); expect((await f.api.getReview("script", "take")).kind).not.toBe("success");
  expect((await f.api.prepareSavedTakeAudio!(first)).kind).not.toBe("success"); expect(f.counts().audio).toBe(1);
  f.setStatus(200); const next = await f.enter(); await f.api.prepareSavedTakeAudio!(next); expect(f.counts().audio).toBe(2); f.api.savedTakeAudioMemory!.revoke();
});
it("new identity and new session each require a fresh binary; owner switch never uses it", async () => {
  const f = fixture(); await f.api.prepareSavedTakeAudio!(await f.enter());
  f.setVersion("b".repeat(64)); await f.api.prepareSavedTakeAudio!(await f.enter()); expect(f.counts().audio).toBe(2);
  f.switchSession(); const current = await f.enter(); await f.api.prepareSavedTakeAudio!(current); expect(f.counts().audio).toBe(3);
  f.switchOwner(); expect((await f.api.prepareSavedTakeAudio!(current)).kind).not.toBe("success"); expect(f.counts().audio).toBe(3); f.api.savedTakeAudioMemory!.revoke();
});
it("storage deletion cannot fall back to the old binary, including an otherwise successful Review", async () => {
  const f = fixture(); await f.api.prepareSavedTakeAudio!(await f.enter()); f.setVersion(null);
  const deleted = await f.enter(); expect((await f.api.prepareSavedTakeAudio!(deleted)).kind).not.toBe("success"); expect(f.counts().audio).toBe(1); f.api.savedTakeAudioMemory!.revoke();
});
it("Review itself never downloads; immediate Play shares the foreground prefetch GET", async () => {
  const f = fixture(), review = await f.enter();
  expect(f.counts()).toEqual({ metadata: 1, audio: 0 });
  let release!: () => void;
  f.holdAudio(() => new Promise<void>(r => { release = r; }));
  const prefetch = f.api.prefetchSavedTakeAudio!(review);
  await vi.waitFor(() => expect(f.counts().audio).toBe(1));
  const play = f.api.prepareSavedTakeAudio!(review);
  // Let token hashing finish while the download remains held.
  await new Promise(r => setTimeout(r, 30));
  expect(f.counts().audio).toBe(1); release();
  await prefetch; expect((await play).kind).toBe("success");
  expect(f.counts()).toEqual({ metadata: 1, audio: 1 }); f.api.savedTakeAudioMemory!.revoke();
});
it.each([401, 403, 404, 503])("prefetch %s has no automatic retry/refresh and later Play follows normal recovery", async status => {
  const f = fixture(), review = await f.enter(); f.setAudioStatus(status);
  await f.api.prefetchSavedTakeAudio!(review);
  expect(f.counts()).toEqual({ metadata: 1, audio: 1 }); expect(f.auth.refresh).not.toHaveBeenCalled();
  f.setAudioStatus(200);
  expect((await f.api.prepareSavedTakeAudio!(review)).kind).toBe("success");
  expect(f.counts()).toEqual({ metadata: 2, audio: 2 }); f.api.savedTakeAudioMemory!.revoke();
});
it("exit aborts the actual audio fetch and a late old result cannot invalidate a new visit", async () => {
  const f = fixture(), review = await f.enter(); let signal!: AbortSignal, release!: () => void;
  f.holdAudio(s => { signal = s; return new Promise(r => { release = r; }); });
  const prefetch = f.api.prefetchSavedTakeAudio!(review);
  await vi.waitFor(() => expect(f.counts().audio).toBe(1));
  f.api.savedTakeAudioMemory!.endVisit(review.audioVisit!); expect(signal.aborted).toBe(true);
  f.holdAudio(undefined); const next = await f.enter();
  await f.api.prefetchSavedTakeAudio!(next); release(); await prefetch;
  expect((await f.api.prepareSavedTakeAudio!(next)).kind).toBe("success");
  expect(f.counts()).toEqual({ metadata: 2, audio: 2 }); f.api.savedTakeAudioMemory!.revoke();
});
it("inactive, stale, and unvalidated visits cannot trigger speculative audio", async () => {
  const f = fixture(); await f.api.prefetchSavedTakeAudio!(review); expect(f.counts().audio).toBe(0);
  const first = await f.enter(); f.api.savedTakeAudioMemory!.setForeground(false);
  await f.api.prefetchSavedTakeAudio!(first); expect(f.counts().audio).toBe(0);
  f.api.savedTakeAudioMemory!.setForeground(true);
  await f.api.prefetchSavedTakeAudio!(first); expect(f.counts().audio).toBe(0);
  const next = await f.enter(); await f.api.prefetchSavedTakeAudio!(first); expect(f.counts().audio).toBe(0);
  await f.api.prefetchSavedTakeAudio!(next); expect(f.counts().audio).toBe(1); f.api.savedTakeAudioMemory!.revoke();
});
it("a changed credential observed by prefetch invalidates old proof without retry or revalidation", async () => {
  const f = fixture(), review = await f.enter();
  await f.api.prefetchSavedTakeAudio!(review);
  const invalidated = vi.fn(); f.api.savedTakeAudioMemory!.subscribe(invalidated);
  f.switchSession(); await f.api.prefetchSavedTakeAudio!(review);
  expect(invalidated).toHaveBeenCalledOnce(); expect(f.counts()).toEqual({ metadata: 1, audio: 1 });
  expect(f.auth.refresh).not.toHaveBeenCalled();
  expect((await f.api.prepareSavedTakeAudio!(review)).kind).toBe("success");
  expect(f.counts()).toEqual({ metadata: 2, audio: 2 }); f.api.savedTakeAudioMemory!.revoke();
});
