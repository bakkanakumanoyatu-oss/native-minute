import type { Session } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  MobileAuthService,
  type MobileAppLifecycle,
  type MobileSupabaseAuth
} from "./mobile-auth";
import { InMemoryMobileAuthSessionStore } from "./session-store.test-support";
import type { MobileAuthSessionStore, PendingPkceEnvelope } from "./session-store";
import { beginPendingPkceExchange } from "./session-store";

const NOW_SECONDS = 1_800_000_000;
const CALLBACK_URI = "com.nativeminutes.app.debug://auth/callback";

function makeSession(expiresAt = NOW_SECONDS + 3_600): Session {
  return {
    access_token: "fixture-access-material",
    refresh_token: "fixture-refresh-material",
    expires_in: Math.max(1, expiresAt - NOW_SECONDS),
    expires_at: expiresAt,
    token_type: "bearer",
    user: {
      id: "fixture-user",
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      created_at: "2026-07-18T00:00:00.000Z"
    }
  };
}

async function saveSession(store: MobileAuthSessionStore, session: Session, updatedAt = NOW_SECONDS) {
  await store.saveSession({
    version: 1,
    sdkSession: JSON.stringify(session),
    userId: session.user.id,
    expiresAt: session.expires_at ?? updatedAt,
    updatedAt
  });
}

class FakeAuth implements MobileSupabaseAuth {
  session: Session | null = null;
  requestError: { status?: number } | null = null;
  exchangeError: { status?: number } | null = null;
  getSessionError: { status?: number } | null = null;
  getSessionRotation: Session | null = null;
  refreshError: { status?: number } | null = null;
  requestCount = 0;
  exchangeCount = 0;
  refreshCount = 0;
  signOutCount = 0;
  requestGate: Promise<void> | null = null;
  exchangeGate: Promise<void> | null = null;
  refreshGate: Promise<void> | null = null;
  signOutGate: Promise<void> | null = null;

  constructor(private readonly store: MobileAuthSessionStore) {}

  async signInWithOtp() {
    this.requestCount += 1;
    if (!this.requestError) {
      const pending = await this.store.loadPendingPkce();
      if (pending) {
        await this.store.savePendingPkce({ ...pending, codeVerifier: "v".repeat(43) });
      }
    }
    await this.requestGate;
    return { error: this.requestError };
  }

  async exchangeCodeForSession() {
    this.exchangeCount += 1;
    await this.exchangeGate;
    if (this.exchangeError) {
      return { data: { session: null }, error: this.exchangeError };
    }

    this.session = makeSession();
    await saveSession(this.store, this.session);
    return { data: { session: this.session }, error: null };
  }

  async getSession() {
    if (this.getSessionError) {
      return { data: { session: null }, error: this.getSessionError };
    }
    if (this.getSessionRotation) {
      this.session = this.getSessionRotation;
      this.getSessionRotation = null;
      await saveSession(this.store, this.session);
    }
    return { data: { session: this.session }, error: null };
  }

  async refreshSession() {
    this.refreshCount += 1;
    await this.refreshGate;
    if (this.refreshError) {
      return { data: { session: null }, error: this.refreshError };
    }

    this.session = makeSession(NOW_SECONDS + 7_200);
    await saveSession(this.store, this.session);
    return { data: { session: this.session }, error: null };
  }

  async signOut() {
    this.signOutCount += 1;
    await this.signOutGate;
    this.session = null;
    return { error: null };
  }
}

class FakeLifecycle implements MobileAppLifecycle {
  launchUrl: string | undefined;
  private urlListener: ((url: string) => void) | null = null;
  private stateListener: ((isActive: boolean) => void) | null = null;

  async getLaunchUrl() {
    return this.launchUrl ? { url: this.launchUrl } : undefined;
  }

  async addUrlOpenListener(listener: (url: string) => void) {
    this.urlListener = listener;
    return { remove: async () => void (this.urlListener = null) };
  }

  async addStateChangeListener(listener: (isActive: boolean) => void) {
    this.stateListener = listener;
    return { remove: async () => void (this.stateListener = null) };
  }

  emitUrl(url: string) {
    this.urlListener?.(url);
  }

  emitActive() {
    this.stateListener?.(true);
  }
}

function deterministicIds() {
  const ids = ["transaction-fixture", "state-fixture", "nonce-fixture"];
  let index = 0;
  return () => ids[index++] ?? `opaque-fixture-${index}`;
}

function createHarness(nowSeconds = () => NOW_SECONDS) {
  const store = new InMemoryMobileAuthSessionStore(nowSeconds);
  const auth = new FakeAuth(store);
  const lifecycle = new FakeLifecycle();
  const service = new MobileAuthService({
    auth,
    store,
    lifecycle,
    callbackUri: CALLBACK_URI,
    configured: true,
    nowSeconds,
    generateOpaqueId: deterministicIds()
  });
  return { store, auth, lifecycle, service };
}

function callbackFromPending(pending: PendingPkceEnvelope) {
  const url = new URL(pending.redirectUri);
  url.searchParams.set("code", "exchange-value-fixture");
  return url.toString();
}

describe("MobileAuthService", () => {
  it("sends a generic Magic Link request, persists PKCE, and enforces cooldown", async () => {
    const { service, store, auth } = createHarness();

    await expect(service.requestMagicLink("reader@example.test")).resolves.toEqual({ ok: true });
    expect(service.getState()).toEqual({
      kind: "awaiting_callback",
      cooldownUntil: NOW_SECONDS + 60
    });
    await expect(store.loadPendingPkce()).resolves.toMatchObject({
      transactionId: "transaction-fixture",
      state: "state-fixture",
      nonce: "nonce-fixture",
      codeVerifier: "v".repeat(43)
    });

    await expect(service.requestMagicLink("reader@example.test")).resolves.toEqual({
      ok: false,
      reasonCode: "auth_request_rate_limited",
      retryAfterSeconds: 60
    });
    expect(auth.requestCount).toBe(1);
  });

  it("rejects a state mismatch, then exchanges the matching callback exactly once", async () => {
    const { service, store, auth } = createHarness();
    await service.requestMagicLink("reader@example.test");
    const pending = await store.loadPendingPkce();
    expect(pending).not.toBeNull();

    const mismatch = new URL(callbackFromPending(pending!));
    mismatch.searchParams.set("state", "different-state");
    await expect(service.handleCallbackUrl(mismatch.toString())).resolves.toEqual({
      ok: false,
      reasonCode: "auth_callback_state_mismatch"
    });
    expect(auth.exchangeCount).toBe(0);

    const validUrl = callbackFromPending(pending!);
    await expect(service.handleCallbackUrl(validUrl)).resolves.toEqual({ ok: true });
    expect(service.getState()).toEqual({ kind: "authenticated", userId: "fixture-user" });
    expect(auth.exchangeCount).toBe(1);
    await expect(store.loadPendingPkce()).resolves.toBeNull();

    await expect(service.handleCallbackUrl(validUrl)).resolves.toEqual({
      ok: false,
      reasonCode: "auth_callback_duplicate"
    });
    expect(auth.exchangeCount).toBe(1);
  });

  it("fails an expired transaction closed without attempting an exchange", async () => {
    let now = NOW_SECONDS;
    const { service, store, auth } = createHarness(() => now);
    await service.requestMagicLink("reader@example.test");
    const pending = await store.loadPendingPkce();
    now = pending!.expiresAt;

    await expect(service.handleCallbackUrl(callbackFromPending(pending!))).resolves.toEqual({
      ok: false,
      reasonCode: "auth_callback_expired"
    });
    expect(auth.exchangeCount).toBe(0);
    await expect(store.loadPendingPkce()).resolves.toBeNull();
  });

  it("rejects an exchange already marked before a simulated process restart", async () => {
    const first = createHarness();
    await first.service.requestMagicLink("reader@example.test");
    const pending = await first.store.loadPendingPkce();
    const callbackUrl = callbackFromPending(pending!);
    await beginPendingPkceExchange(
      first.store,
      {
        transactionId: pending!.transactionId,
        state: pending!.state,
        nonce: pending!.nonce!,
        redirectUri: pending!.redirectUri
      },
      NOW_SECONDS + 1
    );

    const relaunchedLifecycle = new FakeLifecycle();
    relaunchedLifecycle.launchUrl = callbackUrl;
    const relaunched = new MobileAuthService({
      auth: first.auth,
      store: first.store,
      lifecycle: relaunchedLifecycle,
      callbackUri: CALLBACK_URI,
      configured: true,
      nowSeconds: () => NOW_SECONDS + 2,
      generateOpaqueId: deterministicIds()
    });

    await relaunched.start();
    expect(relaunched.getState()).toEqual({
      kind: "recoverable_error",
      reasonCode: "auth_callback_duplicate",
      restartRequired: true
    });
    expect(first.auth.exchangeCount).toBe(0);
    await expect(first.store.loadPendingPkce()).resolves.toBeNull();
  });

  it("handles a cold-start callback and a warm callback through one handler", async () => {
    const cold = createHarness();
    await cold.service.requestMagicLink("reader@example.test");
    const coldPending = await cold.store.loadPendingPkce();
    cold.lifecycle.launchUrl = callbackFromPending(coldPending!);
    await cold.service.start();
    expect(cold.service.getState()).toEqual({ kind: "authenticated", userId: "fixture-user" });

    const warm = createHarness();
    await warm.service.start();
    await warm.service.requestMagicLink("reader@example.test");
    const warmPending = await warm.store.loadPendingPkce();
    warm.lifecycle.emitUrl(callbackFromPending(warmPending!));
    await vi.waitFor(() => {
      expect(warm.service.getState()).toEqual({ kind: "authenticated", userId: "fixture-user" });
    });
  });

  it("restores a valid session, refreshes a near-expiry session, and clears local logout", async () => {
    const restored = createHarness();
    restored.auth.session = makeSession();
    await saveSession(restored.store, restored.auth.session);
    await restored.service.start();
    expect(restored.service.getState()).toEqual({ kind: "authenticated", userId: "fixture-user" });

    const refreshing = createHarness();
    refreshing.auth.session = makeSession(NOW_SECONDS + 30);
    await saveSession(refreshing.store, refreshing.auth.session);
    await refreshing.service.start();
    expect(refreshing.auth.refreshCount).toBe(1);
    expect(refreshing.service.getState()).toEqual({ kind: "authenticated", userId: "fixture-user" });

    await refreshing.service.signOut();
    expect(refreshing.service.getState()).toEqual({ kind: "unauthenticated" });
    await expect(refreshing.store.loadSession()).resolves.toBeNull();
    expect(refreshing.auth.signOutCount).toBe(1);
  });

  it("accepts a same-user session rotated and persisted by getSession during restore", async () => {
    const harness = createHarness();
    const expiring = makeSession(NOW_SECONDS + 30);
    const rotated = makeSession(NOW_SECONDS + 7_200);
    harness.auth.session = expiring;
    harness.auth.getSessionRotation = rotated;
    await saveSession(harness.store, expiring);

    await harness.service.start();

    expect(harness.service.getState()).toEqual({
      kind: "authenticated",
      userId: "fixture-user"
    });
    expect(harness.auth.refreshCount).toBe(0);
    await expect(harness.store.loadSession()).resolves.toMatchObject({
      userId: "fixture-user",
      expiresAt: NOW_SECONDS + 7_200
    });
  });

  it("preserves a stored session when restore encounters a retryable getSession outage", async () => {
    const harness = createHarness();
    harness.auth.session = makeSession(NOW_SECONDS + 30);
    harness.auth.getSessionError = { status: 503 };
    await saveSession(harness.store, harness.auth.session);

    await harness.service.start();

    expect(harness.service.getState()).toEqual({
      kind: "authenticated",
      userId: "fixture-user"
    });
    await expect(harness.store.loadSession()).resolves.toMatchObject({
      userId: "fixture-user"
    });
  });

  it("turns provider exchange or refresh rejection into fixed safe states", async () => {
    const exchange = createHarness();
    exchange.auth.exchangeError = { status: 400 };
    await exchange.service.requestMagicLink("reader@example.test");
    const pending = await exchange.store.loadPendingPkce();
    await exchange.service.handleCallbackUrl(callbackFromPending(pending!));
    expect(exchange.service.getState()).toEqual({
      kind: "recoverable_error",
      reasonCode: "auth_exchange_failed",
      restartRequired: true
    });

    const refresh = createHarness();
    refresh.auth.session = makeSession(NOW_SECONDS + 30);
    refresh.auth.refreshError = { status: 401 };
    await saveSession(refresh.store, refresh.auth.session);
    await refresh.service.start();
    expect(refresh.service.getState()).toEqual({
      kind: "expired",
      reasonCode: "auth_session_invalid"
    });
    await expect(refresh.store.loadSession()).resolves.toBeNull();
  });

  it("preserves the Keychain candidate on retryable refresh failure", async () => {
    const retryable = createHarness();
    retryable.auth.session = makeSession(NOW_SECONDS + 30);
    retryable.auth.refreshError = { status: 503 };
    await saveSession(retryable.store, retryable.auth.session);

    await retryable.service.start();

    expect(retryable.service.getState()).toEqual({
      kind: "authenticated",
      userId: "fixture-user"
    });
    await expect(retryable.store.loadSession()).resolves.toMatchObject({
      userId: "fixture-user"
    });
  });

  it("serializes refresh and drains an in-flight rotation before local logout", async () => {
    const harness = createHarness();
    harness.auth.session = makeSession();
    await saveSession(harness.store, harness.auth.session);
    await harness.service.start();

    let releaseRefresh: () => void = () => undefined;
    harness.auth.refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    const firstRefresh = harness.service.refresh();
    const secondRefresh = harness.service.refresh();
    await vi.waitFor(() => expect(harness.auth.refreshCount).toBe(1));

    const logout = harness.service.signOut();
    expect(harness.service.getState()).toEqual({ kind: "signing_out" });
    releaseRefresh();
    await Promise.all([firstRefresh, secondRefresh, logout]);

    expect(harness.auth.refreshCount).toBe(1);
    expect(harness.service.getState()).toEqual({ kind: "unauthenticated" });
    await expect(harness.store.loadSession()).resolves.toBeNull();
  });

  it("blocks a new Magic Link request while a callback exchange is in flight", async () => {
    let now = NOW_SECONDS;
    const harness = createHarness(() => now);
    await harness.service.requestMagicLink("reader@example.test");
    const pending = await harness.store.loadPendingPkce();

    let releaseExchange: () => void = () => undefined;
    harness.auth.exchangeGate = new Promise<void>((resolve) => {
      releaseExchange = resolve;
    });
    now += 61;
    const exchange = harness.service.handleCallbackUrl(callbackFromPending(pending!));

    await expect(
      harness.service.requestMagicLink("reader@example.test")
    ).resolves.toEqual({
      ok: false,
      reasonCode: "auth_operation_in_progress"
    });
    expect(harness.auth.requestCount).toBe(1);
    await vi.waitFor(() => expect(harness.auth.exchangeCount).toBe(1));
    expect(harness.service.getState()).toEqual({ kind: "exchanging_code" });

    releaseExchange();
    await expect(exchange).resolves.toEqual({ ok: true });
  });

  it("cancels and drains a Magic Link request before local sign-out completes", async () => {
    const harness = createHarness();
    let releaseRequest: () => void = () => undefined;
    harness.auth.requestGate = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });
    const request = harness.service.requestMagicLink("reader@example.test");
    await vi.waitFor(() => expect(harness.auth.requestCount).toBe(1));

    const logout = harness.service.signOut();
    expect(harness.service.getState()).toEqual({ kind: "signing_out" });
    await expect(
      harness.service.requestMagicLink("reader@example.test")
    ).resolves.toEqual({
      ok: false,
      reasonCode: "auth_operation_in_progress"
    });

    releaseRequest();
    await expect(request).resolves.toEqual({
      ok: false,
      reasonCode: "auth_operation_in_progress"
    });
    await logout;
    expect(harness.service.getState()).toEqual({ kind: "unauthenticated" });
    await expect(harness.store.loadPendingPkce()).resolves.toBeNull();
  });
});
