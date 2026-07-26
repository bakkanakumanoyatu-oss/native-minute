import { describe, expect, it, vi } from "vitest";
import {
  beginPendingPkceExchange,
  KeychainMobileAuthSessionStore,
  MobileAuthSessionStoreError,
  type MobileAuthSessionEnvelope,
  type MobileAuthSessionStorePlugin,
  type PendingPkceEnvelope
} from "./session-store";
import { InMemoryMobileAuthSessionStore } from "./session-store.test-support";

const NOW_SECONDS = 1_800_000_000;
const STORAGE_NAMESPACE = "nm-mobile-auth-local-spike";

function makeSdkSession(expiresAt = NOW_SECONDS + 3_600, userId = "fixture-user") {
  return JSON.stringify({
    access_token: "fixture-access-material",
    refresh_token: "fixture-refresh-material",
    expires_at: expiresAt,
    expires_in: 3_600,
    token_type: "bearer",
    user: { id: userId }
  });
}

function makeSession(expiresAt = NOW_SECONDS + 3_600): MobileAuthSessionEnvelope {
  return {
    version: 1,
    sdkSession: makeSdkSession(expiresAt),
    userId: "fixture-user",
    expiresAt,
    updatedAt: NOW_SECONDS
  };
}

function makePending(overrides: Partial<PendingPkceEnvelope> = {}): PendingPkceEnvelope {
  return {
    version: 2,
    transactionId: "fixture-transaction",
    state: "fixture-state",
    nonce: "fixture-nonce",
    redirectUri: "com.nativeminutes.app.debug://auth/callback",
    codeVerifier: "v".repeat(43),
    exchangeStartedAt: null,
    createdAt: NOW_SECONDS,
    expiresAt: NOW_SECONDS + 600,
    ...overrides
  };
}

class MemoryPlugin implements MobileAuthSessionStorePlugin {
  sessions = new Map<string, string>();
  pendingTransactions = new Map<string, string>();
  failure: unknown = null;

  async saveSession(options: { namespace: string; value: string }) {
    this.assertAvailable();
    this.sessions.set(options.namespace, options.value);
  }

  async loadSession(options: { namespace: string }) {
    this.assertAvailable();
    return { value: this.sessions.get(options.namespace) ?? null };
  }

  async clearSession(options: { namespace: string }) {
    this.assertAvailable();
    this.sessions.delete(options.namespace);
  }

  async savePendingPkce(options: { namespace: string; value: string }) {
    this.assertAvailable();
    this.pendingTransactions.set(options.namespace, options.value);
  }

  async loadPendingPkce(options: { namespace: string }) {
    this.assertAvailable();
    return { value: this.pendingTransactions.get(options.namespace) ?? null };
  }

  async clearPendingPkce(options: { namespace: string }) {
    this.assertAvailable();
    this.pendingTransactions.delete(options.namespace);
  }

  private assertAvailable() {
    if (this.failure !== null) {
      throw this.failure;
    }
  }
}

describe("KeychainMobileAuthSessionStore", () => {
  it("saves, atomically replaces, loads, and clears a session through the plugin", async () => {
    const plugin = new MemoryPlugin();
    const store = new KeychainMobileAuthSessionStore(
      STORAGE_NAMESPACE,
      plugin,
      () => NOW_SECONDS
    );
    const first = makeSession();
    const replacement = makeSession(NOW_SECONDS + 7_200);

    await store.saveSession(first);
    await expect(store.loadSession()).resolves.toEqual(first);

    await store.saveSession(replacement);
    await expect(store.loadSession()).resolves.toEqual(replacement);

    await store.clearSession();
    await expect(store.loadSession()).resolves.toBeNull();
  });

  it("fails closed and removes corrupt stored data", async () => {
    const plugin = new MemoryPlugin();
    plugin.sessions.set(STORAGE_NAMESPACE, JSON.stringify({ version: 1, unexpected: true }));
    const store = new KeychainMobileAuthSessionStore(
      STORAGE_NAMESPACE,
      plugin,
      () => NOW_SECONDS
    );

    await expect(store.loadSession()).resolves.toBeNull();
    expect(plugin.sessions.has(STORAGE_NAMESPACE)).toBe(false);
  });

  it("rejects an envelope whose parsed SDK session does not match it", async () => {
    const plugin = new MemoryPlugin();
    const store = new KeychainMobileAuthSessionStore(
      STORAGE_NAMESPACE,
      plugin,
      () => NOW_SECONDS
    );
    const invalid = {
      ...makeSession(),
      userId: "different-fixture-user"
    };

    await expect(store.saveSession(invalid)).rejects.toMatchObject({
      reason: "invalid_session_envelope"
    });
    expect(plugin.sessions.has(STORAGE_NAMESPACE)).toBe(false);
  });

  it.each([
    {
      label: "device locked",
      pluginError: {
        code: "UNAVAILABLE",
        message: "secure_storage_device_locked",
        detail: "native detail must be discarded"
      },
      reason: "secure_storage_device_locked"
    },
    {
      label: "interaction not allowed",
      pluginError: {
        code: "UNAVAILABLE",
        message: "secure_storage_interaction_not_allowed",
        detail: "native detail must be discarded"
      },
      reason: "secure_storage_interaction_not_allowed"
    },
    {
      label: "missing entitlement",
      pluginError: {
        code: "UNAVAILABLE",
        message: "secure_storage_missing_entitlement",
        detail: "native detail must be discarded"
      },
      reason: "secure_storage_missing_entitlement"
    },
    {
      label: "plugin unavailable",
      pluginError: {
        code: "UNIMPLEMENTED",
        message: "native detail must be discarded"
      },
      reason: "secure_storage_plugin_unavailable"
    },
    {
      label: "unexpected native status",
      pluginError: {
        code: "UNAVAILABLE",
        message: "secure_storage_unexpected_status",
        detail: "native detail must be discarded"
      },
      reason: "secure_storage_unexpected_status"
    },
    {
      label: "unknown plugin error",
      pluginError: new Error("native detail must be discarded"),
      reason: "secure_storage_unexpected_status"
    },
    {
      label: "object prototype property",
      pluginError: {
        code: "UNAVAILABLE",
        message: "toString",
        detail: "native detail must be discarded"
      },
      reason: "secure_storage_unexpected_status"
    }
  ] as const)("maps $label to a value-free fixed reason", async ({ pluginError, reason }) => {
    const plugin = new MemoryPlugin();
    plugin.failure = pluginError;
    const store = new KeychainMobileAuthSessionStore(
      STORAGE_NAMESPACE,
      plugin,
      () => NOW_SECONDS
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const error = await store.loadSession().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MobileAuthSessionStoreError);
    expect(error).toMatchObject({ reason });
    expect(String(error)).not.toContain("native detail");
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleLog).not.toHaveBeenCalled();

    consoleError.mockRestore();
    consoleLog.mockRestore();
  });

  it("accepts a verifier-free draft, then expires and clears it", async () => {
    let now = NOW_SECONDS;
    const plugin = new MemoryPlugin();
    const store = new KeychainMobileAuthSessionStore(STORAGE_NAMESPACE, plugin, () => now);
    const draft = makePending({ codeVerifier: null });

    await store.savePendingPkce(draft);
    await expect(store.loadPendingPkce()).resolves.toEqual(draft);

    now = draft.expiresAt;
    await expect(store.loadPendingPkce()).resolves.toBeNull();
    expect(plugin.pendingTransactions.has(STORAGE_NAMESPACE)).toBe(false);
  });

  it("isolates session and pending material by build profile namespace", async () => {
    const plugin = new MemoryPlugin();
    const localStore = new KeychainMobileAuthSessionStore(
      STORAGE_NAMESPACE,
      plugin,
      () => NOW_SECONDS
    );
    const developmentStore = new KeychainMobileAuthSessionStore(
      "nm-mobile-auth-development",
      plugin,
      () => NOW_SECONDS
    );

    await localStore.saveSession(makeSession());
    await localStore.savePendingPkce(makePending());

    await expect(developmentStore.loadSession()).resolves.toBeNull();
    await expect(developmentStore.loadPendingPkce()).resolves.toBeNull();
  });
});

describe("beginPendingPkceExchange", () => {
  it("marks a matching complete transaction once before concurrent exchanges", async () => {
    const store = new InMemoryMobileAuthSessionStore(() => NOW_SECONDS);
    const pending = makePending();
    await store.savePendingPkce(pending);

    const expected = {
      transactionId: pending.transactionId,
      state: pending.state,
      nonce: pending.nonce!,
      redirectUri: pending.redirectUri
    };
    const results = await Promise.all([
      beginPendingPkceExchange(store, expected, NOW_SECONDS + 1),
      beginPendingPkceExchange(store, expected, NOW_SECONDS + 1)
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results).toContainEqual({ ok: false, reason: "already_started" });
    await expect(store.loadPendingPkce()).resolves.toBeNull();
  });

  it("does not consume a draft or a state mismatch", async () => {
    const store = new InMemoryMobileAuthSessionStore(() => NOW_SECONDS);
    const draft = makePending({ codeVerifier: null });
    await store.savePendingPkce(draft);

    await expect(
      beginPendingPkceExchange(store, {
        transactionId: draft.transactionId,
        state: draft.state,
        nonce: draft.nonce!,
        redirectUri: draft.redirectUri
      }, NOW_SECONDS + 1)
    ).resolves.toEqual({ ok: false, reason: "incomplete" });
    await expect(store.loadPendingPkce()).resolves.toEqual(draft);

    const complete = makePending();
    await store.savePendingPkce(complete);
    await expect(
      beginPendingPkceExchange(store, {
        transactionId: complete.transactionId,
        state: "different-state",
        nonce: complete.nonce!,
        redirectUri: complete.redirectUri
      }, NOW_SECONDS + 1)
    ).resolves.toEqual({ ok: false, reason: "mismatch" });
    await expect(store.loadPendingPkce()).resolves.toEqual(complete);
  });
});
