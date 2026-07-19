import type { SupportedStorage } from "@supabase/supabase-js";
import {
  MOBILE_AUTH_PENDING_PKCE_SCHEMA_VERSION,
  MOBILE_AUTH_SESSION_SCHEMA_VERSION,
  type MobileAuthSessionStore
} from "./session-store";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function sessionMetadata(value: string) {
  const parsed = parseJson(value);

  if (!isRecord(parsed) || !isRecord(parsed.user)) {
    return null;
  }

  if (
    typeof parsed.access_token !== "string" ||
    !parsed.access_token ||
    typeof parsed.refresh_token !== "string" ||
    !parsed.refresh_token ||
    parsed.token_type !== "bearer" ||
    !Number.isSafeInteger(parsed.expires_at) ||
    Number(parsed.expires_at) <= 0 ||
    typeof parsed.user.id !== "string" ||
    !parsed.user.id
  ) {
    return null;
  }

  return {
    userId: parsed.user.id,
    expiresAt: Number(parsed.expires_at)
  };
}

function parseCodeVerifier(value: string) {
  const parsed = parseJson(value);
  return typeof parsed === "string" && parsed.length >= 43 && parsed.length <= 128
    ? parsed
    : null;
}

export function createSupabaseKeychainStorage(
  store: MobileAuthSessionStore,
  storageKey: string,
  nowSeconds: () => number = () => Math.floor(Date.now() / 1000)
): SupportedStorage {
  const verifierKey = `${storageKey}-code-verifier`;

  return {
    async getItem(key) {
      if (key === storageKey) {
        return (await store.loadSession())?.sdkSession ?? null;
      }

      if (key === verifierKey) {
        const verifier = (await store.loadPendingPkce())?.codeVerifier;
        return verifier ? JSON.stringify(verifier) : null;
      }

      return null;
    },

    async setItem(key, value) {
      if (key === storageKey) {
        const metadata = sessionMetadata(value);

        if (!metadata) {
          await store.clearSession();
          throw new Error("invalid_mobile_auth_session");
        }

        await store.saveSession({
          version: MOBILE_AUTH_SESSION_SCHEMA_VERSION,
          sdkSession: value,
          userId: metadata.userId,
          expiresAt: metadata.expiresAt,
          updatedAt: nowSeconds()
        });
        return;
      }

      if (key === verifierKey) {
        const verifier = parseCodeVerifier(value);
        const pending = await store.loadPendingPkce();

        if (!verifier || !pending) {
          await store.clearPendingPkce();
          throw new Error("invalid_mobile_auth_pkce");
        }

        await store.savePendingPkce({
          ...pending,
          version: MOBILE_AUTH_PENDING_PKCE_SCHEMA_VERSION,
          codeVerifier: verifier
        });
      }
    },

    async removeItem(key) {
      if (key === storageKey) {
        await store.clearSession();
      } else if (key === verifierKey) {
        await store.clearPendingPkce();
      }
    }
  };
}
