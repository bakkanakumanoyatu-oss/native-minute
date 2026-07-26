import { registerPlugin } from "@capacitor/core";

export const MOBILE_AUTH_SESSION_SCHEMA_VERSION = 1 as const;
export const MOBILE_AUTH_PENDING_PKCE_SCHEMA_VERSION = 2 as const;
export const MAX_PENDING_PKCE_TTL_SECONDS = 15 * 60;

const MAX_STORED_VALUE_LENGTH = 64 * 1024;
const MAX_CLOCK_SKEW_SECONDS = 5 * 60;
const STORAGE_NAMESPACE_PATTERN = /^[A-Za-z0-9._-]{1,96}$/;

export type MobileAuthSessionEnvelope = Readonly<{
  version: typeof MOBILE_AUTH_SESSION_SCHEMA_VERSION;
  sdkSession: string;
  userId: string;
  expiresAt: number;
  updatedAt: number;
}>;

export type PendingPkceEnvelope = Readonly<{
  version: typeof MOBILE_AUTH_PENDING_PKCE_SCHEMA_VERSION;
  transactionId: string;
  state: string;
  nonce: string | null;
  redirectUri: string;
  codeVerifier: string | null;
  exchangeStartedAt: number | null;
  createdAt: number;
  expiresAt: number;
}>;

export interface MobileAuthSessionStore {
  saveSession(session: MobileAuthSessionEnvelope): Promise<void>;
  loadSession(): Promise<MobileAuthSessionEnvelope | null>;
  clearSession(): Promise<void>;
  savePendingPkce(pending: PendingPkceEnvelope): Promise<void>;
  loadPendingPkce(): Promise<PendingPkceEnvelope | null>;
  clearPendingPkce(): Promise<void>;
}

export type MobileAuthSecureStoreReason =
  | "secure_storage_device_locked"
  | "secure_storage_interaction_not_allowed"
  | "secure_storage_missing_entitlement"
  | "secure_storage_plugin_unavailable"
  | "secure_storage_unexpected_status";

export type MobileAuthSessionStoreReason =
  | "invalid_session_envelope"
  | "invalid_pending_pkce_envelope"
  | MobileAuthSecureStoreReason;

export class MobileAuthSessionStoreError extends Error {
  readonly reason: MobileAuthSessionStoreReason;

  constructor(reason: MobileAuthSessionStoreReason) {
    super(reason);
    this.name = "MobileAuthSessionStoreError";
    this.reason = reason;
  }
}

export interface MobileAuthSessionStorePlugin {
  saveSession(options: { namespace: string; value: string }): Promise<void>;
  loadSession(options: { namespace: string }): Promise<{ value: string | null }>;
  clearSession(options: { namespace: string }): Promise<void>;
  savePendingPkce(options: { namespace: string; value: string }): Promise<void>;
  loadPendingPkce(options: { namespace: string }): Promise<{ value: string | null }>;
  clearPendingPkce(options: { namespace: string }): Promise<void>;
}

const NativeMobileAuthSessionStore = registerPlugin<MobileAuthSessionStorePlugin>(
  "MobileAuthSessionStore"
);

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: JsonRecord, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();

  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isSafeString(value: unknown, minimumLength = 1, maximumLength = MAX_STORED_VALUE_LENGTH) {
  return (
    typeof value === "string" &&
    value.length >= minimumLength &&
    value.length <= maximumLength &&
    !value.includes("\u0000")
  );
}

function isUnixSeconds(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function parseJsonRecord(value: string): JsonRecord | null {
  if (!isSafeString(value)) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function hasValidSdkSession(value: MobileAuthSessionEnvelope) {
  const sdkSession = parseJsonRecord(value.sdkSession);
  if (!sdkSession) {
    return false;
  }

  const user = sdkSession.user;

  return (
    isSafeString(sdkSession.access_token) &&
    isSafeString(sdkSession.refresh_token) &&
    sdkSession.token_type === "bearer" &&
    sdkSession.expires_at === value.expiresAt &&
    isRecord(user) &&
    user.id === value.userId
  );
}

export function isMobileAuthSessionEnvelope(value: unknown): value is MobileAuthSessionEnvelope {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["version", "sdkSession", "userId", "expiresAt", "updatedAt"])
  ) {
    return false;
  }

  const candidate = value as unknown as MobileAuthSessionEnvelope;

  return (
    candidate.version === MOBILE_AUTH_SESSION_SCHEMA_VERSION &&
    isSafeString(candidate.sdkSession) &&
    isSafeString(candidate.userId, 1, 256) &&
    isUnixSeconds(candidate.expiresAt) &&
    isUnixSeconds(candidate.updatedAt) &&
    hasValidSdkSession(candidate)
  );
}

export function isPendingPkceEnvelope(
  value: unknown,
  nowSeconds = Math.floor(Date.now() / 1000)
): value is PendingPkceEnvelope {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "version",
      "transactionId",
      "state",
      "nonce",
      "redirectUri",
      "codeVerifier",
      "exchangeStartedAt",
      "createdAt",
      "expiresAt"
    ])
  ) {
    return false;
  }

  const candidate = value as unknown as PendingPkceEnvelope;
  const nonceIsValid = candidate.nonce === null || isSafeString(candidate.nonce, 1, 512);
  const verifierIsValid =
    candidate.codeVerifier === null || isSafeString(candidate.codeVerifier, 43, 128);
  const exchangeStartedAtIsValid =
    candidate.exchangeStartedAt === null ||
    (isUnixSeconds(candidate.exchangeStartedAt) &&
      candidate.exchangeStartedAt >= candidate.createdAt &&
      candidate.exchangeStartedAt < candidate.expiresAt);

  return (
    candidate.version === MOBILE_AUTH_PENDING_PKCE_SCHEMA_VERSION &&
    isSafeString(candidate.transactionId, 8, 256) &&
    isSafeString(candidate.state, 8, 512) &&
    nonceIsValid &&
    isSafeString(candidate.redirectUri, 1, 2048) &&
    verifierIsValid &&
    exchangeStartedAtIsValid &&
    isUnixSeconds(candidate.createdAt) &&
    isUnixSeconds(candidate.expiresAt) &&
    candidate.expiresAt > candidate.createdAt &&
    candidate.expiresAt - candidate.createdAt <= MAX_PENDING_PKCE_TTL_SECONDS &&
    candidate.createdAt <= nowSeconds + MAX_CLOCK_SKEW_SECONDS
  );
}

function decodeSession(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = parseJsonRecord(value);
  return isMobileAuthSessionEnvelope(parsed) ? parsed : null;
}

function decodePendingPkce(value: unknown, nowSeconds: number) {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = parseJsonRecord(value);
  return isPendingPkceEnvelope(parsed, nowSeconds) ? parsed : null;
}

const NATIVE_SECURE_STORE_REASON_BY_MESSAGE = new Map<
  string,
  MobileAuthSecureStoreReason
>([
  ["secure_storage_device_locked", "secure_storage_device_locked"],
  [
    "secure_storage_interaction_not_allowed",
    "secure_storage_interaction_not_allowed"
  ],
  ["secure_storage_missing_entitlement", "secure_storage_missing_entitlement"],
  ["secure_storage_unexpected_status", "secure_storage_unexpected_status"]
]);

function classifyPluginError(error: unknown): MobileAuthSecureStoreReason {
  if (!isRecord(error)) {
    return "secure_storage_unexpected_status";
  }

  if (error.code === "UNIMPLEMENTED") {
    return "secure_storage_plugin_unavailable";
  }

  if (error.code !== "UNAVAILABLE" || typeof error.message !== "string") {
    return "secure_storage_unexpected_status";
  }

  return (
    NATIVE_SECURE_STORE_REASON_BY_MESSAGE.get(error.message) ??
    "secure_storage_unexpected_status"
  );
}

async function runPluginCall<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw new MobileAuthSessionStoreError(classifyPluginError(error));
  }
}

async function clearCorruptValue(operation: () => Promise<void>) {
  try {
    await operation();
  } catch {
    // Fail closed. The caller must not receive the unreadable auth material.
  }
}

export class KeychainMobileAuthSessionStore implements MobileAuthSessionStore {
  private readonly namespace: string;
  private readonly plugin: MobileAuthSessionStorePlugin;
  private readonly nowSeconds: () => number;

  constructor(
    namespace: string,
    plugin: MobileAuthSessionStorePlugin = NativeMobileAuthSessionStore,
    nowSeconds: () => number = () => Math.floor(Date.now() / 1000)
  ) {
    if (!STORAGE_NAMESPACE_PATTERN.test(namespace)) {
      throw new MobileAuthSessionStoreError("secure_storage_unexpected_status");
    }

    this.namespace = namespace;
    this.plugin = plugin;
    this.nowSeconds = nowSeconds;
  }

  async saveSession(session: MobileAuthSessionEnvelope) {
    if (!isMobileAuthSessionEnvelope(session)) {
      throw new MobileAuthSessionStoreError("invalid_session_envelope");
    }

    await runPluginCall(() =>
      this.plugin.saveSession({ namespace: this.namespace, value: JSON.stringify(session) })
    );
  }

  async loadSession() {
    const result = await runPluginCall(() =>
      this.plugin.loadSession({ namespace: this.namespace })
    );

    if (!isRecord(result) || !("value" in result)) {
      await clearCorruptValue(() => this.plugin.clearSession({ namespace: this.namespace }));
      return null;
    }

    if (result.value === null) {
      return null;
    }

    const session = decodeSession(result.value);
    if (!session) {
      await clearCorruptValue(() => this.plugin.clearSession({ namespace: this.namespace }));
      return null;
    }

    return session;
  }

  async clearSession() {
    await runPluginCall(() => this.plugin.clearSession({ namespace: this.namespace }));
  }

  async savePendingPkce(pending: PendingPkceEnvelope) {
    const nowSeconds = this.nowSeconds();
    if (!isPendingPkceEnvelope(pending, nowSeconds) || pending.expiresAt <= nowSeconds) {
      throw new MobileAuthSessionStoreError("invalid_pending_pkce_envelope");
    }

    await runPluginCall(() =>
      this.plugin.savePendingPkce({
        namespace: this.namespace,
        value: JSON.stringify(pending)
      })
    );
  }

  async loadPendingPkce() {
    const result = await runPluginCall(() =>
      this.plugin.loadPendingPkce({ namespace: this.namespace })
    );

    if (!isRecord(result) || !("value" in result)) {
      await clearCorruptValue(() =>
        this.plugin.clearPendingPkce({ namespace: this.namespace })
      );
      return null;
    }

    if (result.value === null) {
      return null;
    }

    const pending = decodePendingPkce(result.value, this.nowSeconds());
    if (!pending || pending.expiresAt <= this.nowSeconds()) {
      await clearCorruptValue(() =>
        this.plugin.clearPendingPkce({ namespace: this.namespace })
      );
      return null;
    }

    return pending;
  }

  async clearPendingPkce() {
    await runPluginCall(() =>
      this.plugin.clearPendingPkce({ namespace: this.namespace })
    );
  }
}

type PendingPkceMatch = Readonly<{
  transactionId: string;
  state: string;
  nonce: string;
  redirectUri: string;
}>;

const pendingPkceQueues = new WeakMap<MobileAuthSessionStore, Promise<void>>();

export type BeginPendingPkceExchangeResult =
  | { ok: true; pending: PendingPkceEnvelope }
  | { ok: false; reason: "missing" | "mismatch" | "incomplete" | "already_started" };

/**
 * Atomically marks one matching transaction before the provider exchange. The
 * verifier remains readable by the Supabase storage adapter for that exchange,
 * while a crash/relaunch can identify the interrupted attempt and reject replay.
 */
export async function beginPendingPkceExchange(
  store: MobileAuthSessionStore,
  expected: PendingPkceMatch,
  nowSeconds: number
): Promise<BeginPendingPkceExchangeResult> {
  const previous = pendingPkceQueues.get(store) ?? Promise.resolve();
  let releaseQueue: () => void = () => undefined;
  const current = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });
  pendingPkceQueues.set(store, previous.then(() => current));

  await previous;

  try {
    const pending = await store.loadPendingPkce();
    if (!pending) {
      return { ok: false, reason: "missing" };
    }

    if (pending.exchangeStartedAt !== null) {
      await store.clearPendingPkce();
      return { ok: false, reason: "already_started" };
    }

    if (pending.codeVerifier === null) {
      return { ok: false, reason: "incomplete" };
    }

    if (
      pending.transactionId !== expected.transactionId ||
      pending.state !== expected.state ||
      pending.nonce !== expected.nonce ||
      pending.redirectUri !== expected.redirectUri
    ) {
      return { ok: false, reason: "mismatch" };
    }

    const marked = { ...pending, exchangeStartedAt: nowSeconds };
    await store.savePendingPkce(marked);
    return { ok: true, pending: marked };
  } finally {
    releaseQueue();
  }
}
