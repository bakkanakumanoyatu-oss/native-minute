import { describe, expect, it } from "vitest";
import { InMemoryMobileAuthSessionStore } from "./session-store.test-support";
import { createSupabaseKeychainStorage } from "./supabase-storage";

const NOW_SECONDS = 1_800_000_000;
const STORAGE_KEY = "mobile-auth-test";

function sdkSession() {
  return JSON.stringify({
    access_token: "fixture-access-material",
    refresh_token: "fixture-refresh-material",
    expires_at: NOW_SECONDS + 3_600,
    expires_in: 3_600,
    token_type: "bearer",
    user: { id: "fixture-user" }
  });
}

describe("Supabase Keychain storage adapter", () => {
  it("maps the SDK session key to a validated versioned secure envelope", async () => {
    const store = new InMemoryMobileAuthSessionStore(() => NOW_SECONDS);
    const storage = createSupabaseKeychainStorage(store, STORAGE_KEY, () => NOW_SECONDS);
    const value = sdkSession();

    await storage.setItem(STORAGE_KEY, value);

    await expect(storage.getItem(STORAGE_KEY)).resolves.toBe(value);
    await expect(store.loadSession()).resolves.toMatchObject({
      version: 1,
      userId: "fixture-user",
      expiresAt: NOW_SECONDS + 3_600,
      updatedAt: NOW_SECONDS
    });

    await storage.removeItem(STORAGE_KEY);
    await expect(store.loadSession()).resolves.toBeNull();
  });

  it("merges the SDK-generated verifier into an existing transaction draft", async () => {
    const store = new InMemoryMobileAuthSessionStore(() => NOW_SECONDS);
    const storage = createSupabaseKeychainStorage(store, STORAGE_KEY, () => NOW_SECONDS);
    await store.savePendingPkce({
      version: 2,
      transactionId: "fixture-transaction",
      state: "fixture-state",
      nonce: "fixture-nonce",
      redirectUri: "com.nativeminutes.app.debug://auth/callback",
      codeVerifier: null,
      exchangeStartedAt: null,
      createdAt: NOW_SECONDS,
      expiresAt: NOW_SECONDS + 600
    });

    const verifier = "v".repeat(43);
    await storage.setItem(`${STORAGE_KEY}-code-verifier`, JSON.stringify(verifier));

    await expect(storage.getItem(`${STORAGE_KEY}-code-verifier`)).resolves.toBe(
      JSON.stringify(verifier)
    );
    await expect(store.loadPendingPkce()).resolves.toMatchObject({ codeVerifier: verifier });
  });

  it("fails closed instead of persisting malformed SDK values", async () => {
    const store = new InMemoryMobileAuthSessionStore(() => NOW_SECONDS);
    const storage = createSupabaseKeychainStorage(store, STORAGE_KEY, () => NOW_SECONDS);

    await expect(storage.setItem(STORAGE_KEY, "{}")) .rejects.toThrow(
      "invalid_mobile_auth_session"
    );
    await expect(store.loadSession()).resolves.toBeNull();
  });
});
