import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import type { MobileAuthController } from "../auth/mobile-auth";
import {
  createPracticeApi,
  getPracticeErrorCopy,
  isPracticeOwnerStateCurrent,
  recordMobileApiTiming,
  shouldRefreshPracticeRequest
} from "./api";

describe("practice request state", () => {
  it("refreshes only a server-expired session", () => {
    expect(shouldRefreshPracticeRequest({ kind: "unauthorized", reasonCode: "session_expired" })).toBe(true);
    expect(shouldRefreshPracticeRequest({ kind: "unauthorized", reasonCode: "session_invalid" })).toBe(false);
  });

  it("maps failures to fixed safe copy without provider or raw server detail", () => {
    const copy = getPracticeErrorCopy({ kind: "server-error", status: 503 });
    expect(copy).toContain("再試行");
    expect(copy).not.toContain("503");
    expect(copy).not.toContain("provider");
  });

  it("gives a fresh-user voice sample a Japanese re-record recovery without exposing server detail", () => {
    const copy = getPracticeErrorCopy({ kind: "invalid-request", reasonCode: "voice_sample_invalid" });
    expect(copy).toContain("もう一度録音");
    expect(copy).not.toContain("ElevenLabs");
    expect(copy).not.toContain("storage://");
  });

  it("keeps the frozen owner valid only during authenticated refresh lifecycle state", () => {
    expect(isPracticeOwnerStateCurrent({ kind: "refreshing" }, "user-a")).toBe(true);
    expect(isPracticeOwnerStateCurrent({ kind: "authenticated", userId: "user-a" }, "user-a")).toBe(true);
    expect(isPracticeOwnerStateCurrent({ kind: "authenticated", userId: "user-b" }, "user-a")).toBe(false);
    expect(isPracticeOwnerStateCurrent({ kind: "signing_out" }, "user-a")).toBe(false);
  });

  it("allows an in-flight lifecycle refresh without surfacing owner change or signing out", async () => {
    const onSessionInvalid = vi.fn();
    const onTiming = vi.fn();
    const auth = {
      getState: () => ({ kind: "refreshing" as const }),
      getAccessToken: vi.fn().mockResolvedValue("access-token"),
      refresh: vi.fn(),
      signOut: vi.fn()
    } as unknown as MobileAuthController;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      data: { scripts: [] }
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    })));

    try {
      const api = createPracticeApi({
        auth,
        bffBaseUrl: "https://mobile.example.test",
        ownerUserId: "user-a",
        onSessionInvalid,
        onTiming
      });

      await expect(api.listScripts()).resolves.toEqual({ kind: "success", scripts: [] });
      expect(onSessionInvalid).not.toHaveBeenCalled();
      expect(auth.refresh).not.toHaveBeenCalled();
      expect(onTiming).toHaveBeenCalledWith(expect.objectContaining({ label: "request" }));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("shares one in-flight listen generation across screen remounts for the same owner", async () => {
    let resolveFetch!: (response: Response) => void;
    const fetchImpl = vi.fn(
      () => new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      })
    );
    const auth = {
      getState: () => ({ kind: "authenticated" as const, userId: "user-a" }),
      getAccessToken: vi.fn().mockResolvedValue("access-token"),
      refresh: vi.fn(),
      signOut: vi.fn()
    } as unknown as MobileAuthController;
    vi.stubGlobal("fetch", fetchImpl);

    try {
      const api = createPracticeApi({
        auth,
        bffBaseUrl: "https://mobile.example.test",
        ownerUserId: "user-a"
      });
      const first = api.requestListen("script-a");
      const second = api.requestListen("script-a");

      await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
      resolveFetch(new Response(JSON.stringify({
        ok: true,
        data: { audioId: "audio-a", cached: false }
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      }));

      await expect(Promise.all([first, second])).resolves.toEqual([
        { kind: "success", audioId: "audio-a", cached: false },
        { kind: "success", audioId: "audio-a", cached: false }
      ]);
      expect(auth.getAccessToken).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("records API timing with static labels and no owner, IDs, token, or content detail", () => {
    const sink = {
      clearMeasures: vi.fn(),
      measure: vi.fn()
    } as unknown as Pick<Performance, "clearMeasures" | "measure">;

    expect(recordMobileApiTiming({ label: "evaluate_total", durationMs: 123 }, sink)).toBe("mobile_api_evaluate_total");
    expect(sink.measure).toHaveBeenCalledWith("mobile_api_evaluate_total", {
      start: 0,
      duration: 123
    });
  });
});


it("waits for an in-flight metadata save before refetch on another screen", async () => {
  let resolveWrite!: (response: Response) => void;
  const calls: string[] = [];
  const auth = { getState: () => ({ kind: "authenticated", userId: "user-a" }), getAccessToken: async () => "token" } as unknown as MobileAuthController;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    calls.push(url);
    if (url.endsWith("/metadata")) return new Promise<Response>(resolve => { resolveWrite = resolve; });
    return new Response(JSON.stringify({ ok: true, data: { progress: { scripts: [], totalScripts: 0, totalReviewedTakes: 0, bestTakeCount: 0 } } }));
  }));
  try {
    const api = createPracticeApi({ auth, bffBaseUrl: "https://example.test", ownerUserId: "user-a", onTiming: () => undefined });
    const saving = api.updateTakeMetadata("take-a", { favorite: true });
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    const read = api.getProgress();
    await Promise.resolve();
    expect(calls).toHaveLength(1);
    resolveWrite(new Response(JSON.stringify({ ok: true, data: { metadata: { takeId: "take-a", favorite: true, displayName: null } } })));
    expect((await saving).kind).toBe("success");
    expect((await read).kind).toBe("success");
    expect(calls[1]).toContain("/progress");
  } finally { vi.unstubAllGlobals(); }
});

it.each(['signing_out', 'different-owner'])('discards a saved Take download after %s without exposing its Blob', async change => {
  let state = { kind: 'authenticated', userId: 'user-a' };
  let resolveFetch!: (response: Response) => void;
  const fetchImpl = vi.fn(() => new Promise<Response>(resolve => { resolveFetch = resolve; }));
  const auth = { getState: () => state, getAccessToken: async () => 'token' } as unknown as MobileAuthController;
  vi.stubGlobal('fetch', fetchImpl);
  try {
    const api = createPracticeApi({ auth, bffBaseUrl: 'https://fixture.test', ownerUserId: 'user-a', onTiming: () => undefined });
    const read = api.downloadTakeAudio('take-a');
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    state = change === 'signing_out' ? { kind: 'signing_out', userId: 'user-a' } : { kind: 'authenticated', userId: 'user-b' };
    resolveFetch(new Response('synthetic audio', { headers: { 'content-type': 'audio/wav', 'content-disposition': "attachment; filename*=UTF-8''Practice.wav" } }));
    await expect(read).resolves.toMatchObject({ kind: 'unauthorized', reasonCode: 'session_owner_changed' });
    await expect(api.downloadTakeAudio('take-a')).resolves.toMatchObject({ kind: 'unauthorized', reasonCode: 'session_owner_changed' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  } finally { vi.unstubAllGlobals(); }
});

it.each(['signing_out', 'different-owner'])('discards a Listen audio download after %s without exposing its Blob', async change => {
  let state = { kind: 'authenticated', userId: 'user-a' };
  let resolveFetch!: (response: Response) => void;
  const fetchImpl = vi.fn(() => new Promise<Response>(resolve => { resolveFetch = resolve; }));
  const auth = { getState: () => state, getAccessToken: async () => 'token' } as unknown as MobileAuthController;
  vi.stubGlobal('fetch', fetchImpl);
  try {
    const api = createPracticeApi({ auth, bffBaseUrl: 'https://fixture.test', ownerUserId: 'user-a', onTiming: () => undefined });
    const read = api.downloadAudio('audio-a');
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    state = change === 'signing_out' ? { kind: 'signing_out', userId: 'user-a' } : { kind: 'authenticated', userId: 'user-b' };
    resolveFetch(new Response('synthetic audio', { headers: { 'content-type': 'audio/wav', 'content-disposition': "attachment; filename*=UTF-8''Practice.wav" } }));
    await expect(read).resolves.toMatchObject({ kind: 'unauthorized', reasonCode: 'session_owner_changed' });
    await expect(api.downloadAudio('audio-a')).resolves.toMatchObject({ kind: 'unauthorized', reasonCode: 'session_owner_changed' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  } finally { vi.unstubAllGlobals(); }
});

it('waits for metadata persistence before exporting the newly named exact Take', async () => {
  let resolveWrite!: (response: Response) => void;
  const calls: string[] = [];
  const auth = { getState: () => ({ kind: 'authenticated', userId: 'user-a' }), getAccessToken: async () => 'token' } as unknown as MobileAuthController;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    calls.push(url);
    if (url.endsWith('/metadata')) return new Promise<Response>(resolve => { resolveWrite = resolve; });
    return new Response('synthetic audio', { headers: { 'content-type': 'audio/wav', 'content-disposition': "attachment; filename*=UTF-8''New%20name.wav" } });
  }));
  try {
    const api = createPracticeApi({ auth, bffBaseUrl: 'https://fixture.test', ownerUserId: 'user-a', onTiming: () => undefined });
    const write = api.updateTakeMetadata('take-a', { displayName: 'New name' });
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    const read = api.downloadTakeAudio('take-a');
    await Promise.resolve(); expect(calls).toHaveLength(1);
    resolveWrite(new Response(JSON.stringify({ ok: true, data: { metadata: { takeId: 'take-a', favorite: false, displayName: 'New name' } } })));
    expect((await write).kind).toBe('success');
    await expect(read).resolves.toMatchObject({ kind: 'success', filename: 'New name.wav' });
    expect(calls[1]).toBe('https://fixture.test/api/mobile/takes/take-a/audio');
  } finally { vi.unstubAllGlobals(); }
});

it('refreshes an expired Listen download credential once and repeats only the same authenticated GET', async () => {
  const auth = {
    getState: () => ({ kind: 'authenticated', userId: 'user-a' }),
    getAccessToken: vi.fn().mockResolvedValueOnce('old-token').mockResolvedValueOnce('new-token'),
    refresh: vi.fn().mockResolvedValue({ ok: true })
  } as unknown as MobileAuthController;
  const fetchImpl = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: { reasonCode: 'session_expired' } }), { status: 401, headers: { 'content-type': 'application/json' } }))
    .mockResolvedValueOnce(new Response('synthetic audio', { headers: { 'content-type': 'audio/wav' } }));
  vi.stubGlobal('fetch', fetchImpl);
  try {
    const api = createPracticeApi({ auth, bffBaseUrl: 'https://fixture.test', ownerUserId: 'user-a', onTiming: () => undefined });
    await expect(api.downloadAudio('audio-a')).resolves.toMatchObject({ kind: 'success' });
    expect(auth.refresh).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const [index, token] of ['old-token', 'new-token'].entries()) {
      const [url, init] = fetchImpl.mock.calls[index];
      expect(url).toBe('https://fixture.test/api/mobile/script-audio/audio-a');
      expect(init.method ?? 'GET').toBe('GET');
      expect(new Headers(init.headers).get('authorization')).toBe('Bearer ' + token);
    }
  } finally { vi.unstubAllGlobals(); }
});
