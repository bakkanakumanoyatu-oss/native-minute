import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { createClient, type Session } from "@supabase/supabase-js";
import { mobileEnvironment } from "../lib/environment";
import {
  buildMobileAuthCallbackTarget,
  CallbackReplayGuard,
  parseMobileAuthCallback,
  type ParsedMobileAuthCallback
} from "./callback";
import {
  beginPendingPkceExchange,
  KeychainMobileAuthSessionStore,
  MOBILE_AUTH_PENDING_PKCE_SCHEMA_VERSION,
  MobileAuthSessionStoreError,
  type BeginPendingPkceExchangeResult,
  type MobileAuthSessionStore
} from "./session-store";
import {
  canHandleMobileAuthCallback,
  canRequestMagicLink,
  initialMobileAuthState,
  reduceMobileAuthState,
  type MobileAuthEvent,
  type MobileAuthReasonCode,
  type MobileAuthState
} from "./state-machine";
import { createSupabaseKeychainStorage } from "./supabase-storage";

const LINK_COOLDOWN_SECONDS = 60;
const PENDING_PKCE_TTL_SECONDS = 10 * 60;
const REFRESH_SKEW_SECONDS = 60;

type AuthErrorLike = { status?: number } | null;

export interface MobileSupabaseAuth {
  signInWithOtp(input: {
    email: string;
    options: { emailRedirectTo: string; shouldCreateUser: boolean };
  }): Promise<{ error: AuthErrorLike }>;
  exchangeCodeForSession(code: string, signal: AbortSignal): Promise<{
    data: { session: Session | null };
    error: AuthErrorLike;
  }>;
  getSession(): Promise<{ data: { session: Session | null }; error: AuthErrorLike }>;
  refreshSession(): Promise<{
    data: { session: Session | null };
    error: AuthErrorLike;
  }>;
  signOut(options: { scope: "local" }): Promise<{ error: AuthErrorLike }>;
}

type ListenerHandle = { remove(): Promise<void> };

export interface MobileAppLifecycle {
  getLaunchUrl(): Promise<{ url: string } | undefined>;
  addUrlOpenListener(listener: (url: string) => void): Promise<ListenerHandle>;
  addStateChangeListener(listener: (isActive: boolean) => void): Promise<ListenerHandle>;
}

export type MobileAuthServiceOptions = {
  auth: MobileSupabaseAuth | null;
  store: MobileAuthSessionStore;
  lifecycle: MobileAppLifecycle;
  callbackUri: string;
  configured: boolean;
  nowSeconds?: () => number;
  generateOpaqueId?: () => string;
};

export type MobileAuthOperationResult =
  | { ok: true }
  | { ok: false; reasonCode: string; retryAfterSeconds?: number };

export interface MobileAuthController {
  getState(): MobileAuthState;
  subscribe(listener: (state: MobileAuthState) => void): () => void;
  start(): Promise<void>;
  stop(): Promise<void>;
  requestMagicLink(email: string): Promise<MobileAuthOperationResult>;
  handleCallbackUrl(url: string): Promise<MobileAuthOperationResult>;
  refresh(): Promise<MobileAuthOperationResult>;
  refreshIfNeeded(): Promise<MobileAuthOperationResult>;
  getAccessToken(): Promise<string | null>;
  signOut(): Promise<void>;
  resetLogin(): Promise<void>;
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 320;
}

function defaultOpaqueId() {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function sessionUserId(session: Session | null) {
  return session?.user?.id && typeof session.user.id === "string" ? session.user.id : null;
}

function sessionExpiresAt(session: Session | null) {
  return session?.expires_at && Number.isSafeInteger(session.expires_at)
    ? session.expires_at
    : null;
}

function isRateLimited(error: AuthErrorLike) {
  return error?.status === 429;
}

function isRetryableAuthError(error: AuthErrorLike) {
  const status = error?.status;
  return status === undefined || status === 0 || status === 429 || status >= 500;
}

export function secureStoreAuthReason(error: unknown): MobileAuthReasonCode | null {
  if (!(error instanceof MobileAuthSessionStoreError)) {
    return null;
  }

  switch (error.reason) {
    case "secure_storage_device_locked":
      return "auth_secure_store_device_locked";
    case "secure_storage_interaction_not_allowed":
      return "auth_secure_store_interaction_not_allowed";
    case "secure_storage_missing_entitlement":
      return "auth_secure_store_missing_entitlement";
    case "secure_storage_plugin_unavailable":
      return "auth_secure_store_plugin_unavailable";
    case "secure_storage_unexpected_status":
    case "invalid_session_envelope":
    case "invalid_pending_pkce_envelope":
      return "auth_secure_store_unexpected_status";
  }
}

export class MobileAuthService implements MobileAuthController {
  private state: MobileAuthState = initialMobileAuthState;
  private readonly listeners = new Set<(state: MobileAuthState) => void>();
  private readonly auth: MobileSupabaseAuth | null;
  private readonly store: MobileAuthSessionStore;
  private readonly lifecycle: MobileAppLifecycle;
  private readonly callbackUri: string;
  private readonly configured: boolean;
  private readonly nowSeconds: () => number;
  private readonly generateOpaqueId: () => string;
  private readonly replayGuard = new CallbackReplayGuard();
  private lifecycleHandles: ListenerHandle[] = [];
  private loginOperation: Promise<MobileAuthOperationResult> | null = null;
  private refreshOperation: Promise<MobileAuthOperationResult> | null = null;
  private authGeneration = 0;
  private cooldownUntil = 0;
  private started = false;

  constructor(options: MobileAuthServiceOptions) {
    this.auth = options.auth;
    this.store = options.store;
    this.lifecycle = options.lifecycle;
    this.callbackUri = options.callbackUri;
    this.configured = options.configured;
    this.nowSeconds = options.nowSeconds ?? (() => Math.floor(Date.now() / 1000));
    this.generateOpaqueId = options.generateOpaqueId ?? defaultOpaqueId;
  }

  getState() {
    return this.state;
  }

  subscribe(listener: (state: MobileAuthState) => void) {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  async start() {
    if (this.started) {
      return;
    }

    this.started = true;

    if (!this.configured || !this.auth || !this.callbackUri) {
      this.transition({ type: "FATAL_FAILURE", reasonCode: "auth_not_configured" });
      return;
    }

    this.transition({ type: "RESTORE_STARTED" });

    try {
      const [urlHandle, stateHandle] = await Promise.all([
        this.lifecycle.addUrlOpenListener((url) => {
          void this.handleCallbackUrl(url);
        }),
        this.lifecycle.addStateChangeListener((isActive) => {
          if (isActive) {
            void this.refreshIfNeeded();
          }
        })
      ]);
      this.lifecycleHandles = [urlHandle, stateHandle];

      const launch = await this.lifecycle.getLaunchUrl().catch(() => undefined);
      if (launch?.url) {
        await this.handleCallbackUrl(launch.url);
        return;
      }

      await this.restore();
    } catch (error) {
      const secureStoreReason = secureStoreAuthReason(error);
      this.transition({
        type: "FATAL_FAILURE",
        reasonCode: secureStoreReason ?? "auth_unavailable"
      });
    }
  }

  async stop() {
    const handles = this.lifecycleHandles;
    this.lifecycleHandles = [];
    this.started = false;
    await Promise.allSettled(handles.map((handle) => handle.remove()));
  }

  async requestMagicLink(emailInput: string): Promise<MobileAuthOperationResult> {
    if (!this.auth || !this.configured) {
      this.transition({ type: "FATAL_FAILURE", reasonCode: "auth_not_configured" });
      return { ok: false, reasonCode: "auth_not_configured" };
    }

    if (this.loginOperation || !canRequestMagicLink(this.state)) {
      return { ok: false, reasonCode: "auth_operation_in_progress" };
    }

    const operation = this.performMagicLinkRequest(emailInput);
    this.loginOperation = operation;

    try {
      return await operation;
    } finally {
      if (this.loginOperation === operation) {
        this.loginOperation = null;
      }
    }
  }

  private async performMagicLinkRequest(
    emailInput: string
  ): Promise<MobileAuthOperationResult> {
    const auth = this.auth;
    if (!auth) {
      return { ok: false, reasonCode: "auth_not_configured" };
    }
    const requestGeneration = this.authGeneration;
    const operationIsCurrent = () => requestGeneration === this.authGeneration;

    const email = emailInput.trim().toLowerCase();
    if (!isValidEmail(email)) {
      this.transition({
        type: "RECOVERABLE_FAILURE",
        reasonCode: "auth_email_invalid"
      });
      return { ok: false, reasonCode: "auth_email_invalid" };
    }

    const now = this.nowSeconds();
    if (now < this.cooldownUntil) {
      const retryAfterSeconds = this.cooldownUntil - now;
      this.transition({
        type: "RECOVERABLE_FAILURE",
        reasonCode: "auth_request_rate_limited"
      });
      return { ok: false, reasonCode: "auth_request_rate_limited", retryAfterSeconds };
    }

    this.cooldownUntil = now + LINK_COOLDOWN_SECONDS;
    this.transition({ type: "LINK_REQUEST_STARTED" });

    const identity = {
      transactionId: this.generateOpaqueId(),
      state: this.generateOpaqueId(),
      nonce: this.generateOpaqueId()
    };
    const redirectUri = buildMobileAuthCallbackTarget(this.callbackUri, identity);

    try {
      await this.store.clearPendingPkce();
      if (!operationIsCurrent()) {
        return { ok: false, reasonCode: "auth_operation_in_progress" };
      }
      await this.store.savePendingPkce({
        version: MOBILE_AUTH_PENDING_PKCE_SCHEMA_VERSION,
        ...identity,
        redirectUri,
        codeVerifier: null,
        exchangeStartedAt: null,
        createdAt: now,
        expiresAt: now + PENDING_PKCE_TTL_SECONDS
      });
      if (!operationIsCurrent()) {
        return { ok: false, reasonCode: "auth_operation_in_progress" };
      }

      const { error } = await auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectUri,
          shouldCreateUser: true
        }
      });
      if (!operationIsCurrent()) {
        return { ok: false, reasonCode: "auth_operation_in_progress" };
      }

      if (error) {
        await this.store.clearPendingPkce();
        if (!operationIsCurrent()) {
          return { ok: false, reasonCode: "auth_operation_in_progress" };
        }
        const reasonCode = isRateLimited(error)
          ? "auth_request_rate_limited"
          : "auth_request_failed";
        this.transition({ type: "RECOVERABLE_FAILURE", reasonCode });
        return { ok: false, reasonCode, retryAfterSeconds: LINK_COOLDOWN_SECONDS };
      }

      const completePending = await this.store.loadPendingPkce();
      if (!operationIsCurrent()) {
        return { ok: false, reasonCode: "auth_operation_in_progress" };
      }
      if (!completePending?.codeVerifier) {
        await this.store.clearPendingPkce();
        if (!operationIsCurrent()) {
          return { ok: false, reasonCode: "auth_operation_in_progress" };
        }
        this.transition({
          type: "FATAL_FAILURE",
          reasonCode: "auth_secure_store_unexpected_status"
        });
        return { ok: false, reasonCode: "auth_secure_store_unexpected_status" };
      }

      this.transition({ type: "LINK_SENT", cooldownUntil: this.cooldownUntil });
      this.transition({
        type: "CALLBACK_WAIT_STARTED",
        cooldownUntil: this.cooldownUntil
      });
      return { ok: true };
    } catch (error) {
      if (!operationIsCurrent()) {
        return { ok: false, reasonCode: "auth_operation_in_progress" };
      }
      await this.store.clearPendingPkce().catch(() => undefined);
      if (!operationIsCurrent()) {
        return { ok: false, reasonCode: "auth_operation_in_progress" };
      }
      const secureStoreReason = secureStoreAuthReason(error);
      const reasonCode = secureStoreReason ?? "auth_request_failed";
      if (secureStoreReason) {
        this.transition({ type: "FATAL_FAILURE", reasonCode: secureStoreReason });
      } else {
        this.transition({ type: "RECOVERABLE_FAILURE", reasonCode });
      }
      return { ok: false, reasonCode };
    }
  }

  async handleCallbackUrl(callbackUrl: string): Promise<MobileAuthOperationResult> {
    if (!this.auth || !this.configured) {
      return { ok: false, reasonCode: "auth_not_configured" };
    }

    const parsed = parseMobileAuthCallback(callbackUrl, this.callbackUri);
    if (!parsed.ok) {
      if (this.loginOperation || !canHandleMobileAuthCallback(this.state)) {
        return { ok: false, reasonCode: "auth_operation_in_progress" };
      }
      this.transition({
        type: "RECOVERABLE_FAILURE",
        reasonCode: "auth_callback_invalid"
      });
      return { ok: false, reasonCode: "auth_callback_invalid" };
    }

    if (!this.replayGuard.begin(parsed.callback.transactionId)) {
      return { ok: false, reasonCode: "auth_callback_duplicate" };
    }

    if (this.loginOperation || !canHandleMobileAuthCallback(this.state)) {
      this.replayGuard.cancel(parsed.callback.transactionId);
      return { ok: false, reasonCode: "auth_operation_in_progress" };
    }

    const operation = this.performCallbackExchange(parsed.callback);
    this.loginOperation = operation;

    try {
      return await operation;
    } finally {
      if (this.loginOperation === operation) {
        this.loginOperation = null;
      }
    }
  }

  private async performCallbackExchange(
    callback: ParsedMobileAuthCallback
  ): Promise<MobileAuthOperationResult> {
    const auth = this.auth;
    if (!auth) {
      this.replayGuard.cancel(callback.transactionId);
      return { ok: false, reasonCode: "auth_not_configured" };
    }

    const expectedRedirect = buildMobileAuthCallbackTarget(this.callbackUri, {
      transactionId: callback.transactionId,
      state: callback.state,
      nonce: callback.nonce
    });
    let beginResult: BeginPendingPkceExchangeResult;
    try {
      beginResult = await beginPendingPkceExchange(
        this.store,
        {
          transactionId: callback.transactionId,
          state: callback.state,
          nonce: callback.nonce,
          redirectUri: expectedRedirect
        },
        this.nowSeconds()
      );
    } catch (error) {
      this.replayGuard.cancel(callback.transactionId);
      const reasonCode = secureStoreAuthReason(error) ?? "auth_unavailable";
      this.transition({
        type: "FATAL_FAILURE",
        reasonCode
      });
      return { ok: false, reasonCode };
    }

    if (!beginResult.ok && beginResult.reason === "missing") {
      this.replayGuard.finish(callback.transactionId);
      this.transition({
        type: "RECOVERABLE_FAILURE",
        reasonCode: "auth_callback_expired",
        restartRequired: true
      });
      return { ok: false, reasonCode: "auth_callback_expired" };
    }

    if (!beginResult.ok && beginResult.reason === "already_started") {
      this.replayGuard.finish(callback.transactionId);
      this.transition({
        type: "RECOVERABLE_FAILURE",
        reasonCode: "auth_callback_duplicate",
        restartRequired: true
      });
      return { ok: false, reasonCode: "auth_callback_duplicate" };
    }

    if (!beginResult.ok) {
      this.replayGuard.cancel(callback.transactionId);
      if (beginResult.reason === "incomplete") {
        await this.store.clearPendingPkce().catch(() => undefined);
      }
      this.transition({
        type: "RECOVERABLE_FAILURE",
        reasonCode: "auth_callback_state_mismatch",
        restartRequired: false
      });
      return { ok: false, reasonCode: "auth_callback_state_mismatch" };
    }

    this.transition({ type: "CALLBACK_EXCHANGE_STARTED" });
    const exchangeGeneration = this.authGeneration;
    const exchangeAbortController = new AbortController();
    const exchangeTimeout = setTimeout(
      () => exchangeAbortController.abort(),
      Math.max(0, beginResult.pending.expiresAt - this.nowSeconds()) * 1_000
    );

    try {
      const { data, error } = await auth.exchangeCodeForSession(
        callback.code,
        exchangeAbortController.signal
      );
      if (exchangeGeneration !== this.authGeneration) {
        await this.store.clearSession().catch(() => undefined);
        return { ok: false, reasonCode: "auth_session_missing" };
      }
      const userId = sessionUserId(data.session);

      if (error || !data.session || !userId) {
        await this.store.clearSession();
        this.transition({
          type: "RECOVERABLE_FAILURE",
          reasonCode: "auth_exchange_failed",
          restartRequired: true
        });
        return { ok: false, reasonCode: "auth_exchange_failed" };
      }

      const stored = await this.store.loadSession();
      if (exchangeGeneration !== this.authGeneration) {
        await this.store.clearSession().catch(() => undefined);
        return { ok: false, reasonCode: "auth_session_missing" };
      }
      if (!stored || stored.userId !== userId) {
        await this.store.clearSession();
        this.transition({
          type: "FATAL_FAILURE",
          reasonCode: "auth_secure_store_unexpected_status"
        });
        return { ok: false, reasonCode: "auth_secure_store_unexpected_status" };
      }

      this.transition({ type: "SESSION_ESTABLISHED", userId });
      return { ok: true };
    } catch (error) {
      await this.store.clearSession().catch(() => undefined);
      if (exchangeGeneration !== this.authGeneration) {
        return { ok: false, reasonCode: "auth_session_missing" };
      }
      const secureStoreReason = secureStoreAuthReason(error);
      const reasonCode = secureStoreReason ?? "auth_exchange_failed";
      if (secureStoreReason) {
        this.transition({ type: "FATAL_FAILURE", reasonCode: secureStoreReason });
      } else {
        this.transition({
          type: "RECOVERABLE_FAILURE",
          reasonCode,
          restartRequired: true
        });
      }
      return { ok: false, reasonCode };
    } finally {
      clearTimeout(exchangeTimeout);
      await this.store.clearPendingPkce().catch(() => undefined);
      this.replayGuard.finish(callback.transactionId);
    }
  }

  async refresh(): Promise<MobileAuthOperationResult> {
    if (this.state.kind === "signing_out") {
      return { ok: false, reasonCode: "auth_session_missing" };
    }

    if (this.refreshOperation) {
      return this.refreshOperation;
    }

    const operation = this.performRefresh();
    this.refreshOperation = operation;

    try {
      return await operation;
    } finally {
      if (this.refreshOperation === operation) {
        this.refreshOperation = null;
      }
    }
  }

  private async performRefresh(): Promise<MobileAuthOperationResult> {
    if (!this.auth) {
      return { ok: false, reasonCode: "auth_not_configured" };
    }

    let candidate;
    try {
      candidate = await this.store.loadSession();
    } catch (error) {
      const reasonCode = secureStoreAuthReason(error) ?? "auth_unavailable";
      this.transition({
        type: "FATAL_FAILURE",
        reasonCode
      });
      return { ok: false, reasonCode };
    }

    if (!candidate) {
      this.transition({ type: "SESSION_EXPIRED", reasonCode: "auth_session_invalid" });
      return { ok: false, reasonCode: "auth_session_invalid" };
    }

    const refreshGeneration = this.authGeneration;
    this.transition({ type: "REFRESH_STARTED" });

    try {
      const { data, error } = await this.auth.refreshSession();
      if (refreshGeneration !== this.authGeneration) {
        return { ok: false, reasonCode: "auth_session_missing" };
      }
      const userId = sessionUserId(data.session);

      if (error && isRetryableAuthError(error)) {
        this.transition({ type: "SESSION_ESTABLISHED", userId: candidate.userId });
        return { ok: false, reasonCode: "auth_refresh_failed" };
      }

      if (error || !data.session || !userId) {
        await this.store.clearSession();
        this.transition({
          type: "SESSION_EXPIRED",
          reasonCode: "auth_session_invalid"
        });
        return { ok: false, reasonCode: "auth_session_invalid" };
      }

      this.transition({ type: "SESSION_ESTABLISHED", userId });
      return { ok: true };
    } catch (error) {
      if (refreshGeneration !== this.authGeneration) {
        return { ok: false, reasonCode: "auth_session_missing" };
      }
      const secureStoreReason = secureStoreAuthReason(error);
      if (secureStoreReason) {
        this.transition({
          type: "FATAL_FAILURE",
          reasonCode: secureStoreReason
        });
        return { ok: false, reasonCode: secureStoreReason };
      }

      this.transition({ type: "SESSION_ESTABLISHED", userId: candidate.userId });
      return { ok: false, reasonCode: "auth_refresh_failed" };
    }
  }

  async refreshIfNeeded() {
    try {
      const stored = await this.store.loadSession();
      if (!stored) {
        return { ok: false, reasonCode: "auth_session_missing" } as const;
      }

      if (stored.expiresAt <= this.nowSeconds() + REFRESH_SKEW_SECONDS) {
        return this.refresh();
      }

      return { ok: true } as const;
    } catch (error) {
      const reasonCode = secureStoreAuthReason(error) ?? "auth_unavailable";
      return { ok: false, reasonCode } as const;
    }
  }

  async getAccessToken() {
    if (!this.auth) {
      return null;
    }

    const { data, error } = await this.auth.getSession();
    const expiresAt = sessionExpiresAt(data.session);
    if (error || !data.session || expiresAt === null || expiresAt <= this.nowSeconds()) {
      return null;
    }

    return data.session.access_token;
  }

  async signOut() {
    this.authGeneration += 1;
    this.transition({ type: "SIGN_OUT_STARTED" });

    try {
      await this.loginOperation?.catch(() => undefined);
      await this.refreshOperation?.catch(() => undefined);
      await this.auth?.signOut({ scope: "local" });
    } catch {
      // Local secure deletion remains authoritative for this device.
    } finally {
      const clearResults = await Promise.allSettled([
        this.store.clearPendingPkce(),
        this.store.clearSession()
      ]);
      const firstRejected = clearResults.find(
        (result): result is PromiseRejectedResult => result.status === "rejected"
      );
      if (firstRejected) {
        this.transition({
          type: "FATAL_FAILURE",
          reasonCode:
            secureStoreAuthReason(firstRejected.reason) ??
            "auth_secure_store_unexpected_status"
        });
      } else {
        this.transition({ type: "SIGNED_OUT" });
      }
    }
  }

  async resetLogin() {
    this.authGeneration += 1;
    try {
      await this.loginOperation?.catch(() => undefined);
      await this.store.clearPendingPkce();
      this.transition({ type: "SIGNED_OUT" });
    } catch (error) {
      this.transition({
        type: "FATAL_FAILURE",
        reasonCode: secureStoreAuthReason(error) ?? "auth_secure_store_unexpected_status"
      });
    }
  }

  private async restore() {
    if (!this.auth) {
      return;
    }

    const restoreGeneration = this.authGeneration;
    const pending = await this.store.loadPendingPkce();
    if (restoreGeneration !== this.authGeneration) {
      return;
    }
    if (pending && pending.exchangeStartedAt !== null) {
      await this.store.clearPendingPkce();
    }
    const stored = await this.store.loadSession();
    if (restoreGeneration !== this.authGeneration) {
      return;
    }

    if (!stored) {
      this.transition({ type: "RESTORE_EMPTY" });
      return;
    }

    const { data, error } = await this.auth.getSession();
    if (restoreGeneration !== this.authGeneration) {
      return;
    }

    if (error && isRetryableAuthError(error)) {
      this.transition({ type: "SESSION_ESTABLISHED", userId: stored.userId });
      return;
    }

    const userId = sessionUserId(data.session);
    const expiresAt = sessionExpiresAt(data.session);

    if (error || !data.session || !userId || userId !== stored.userId || expiresAt === null) {
      await this.store.clearSession();
      this.transition({ type: "SESSION_EXPIRED", reasonCode: "auth_session_invalid" });
      return;
    }

    const persisted = await this.store.loadSession();
    if (restoreGeneration !== this.authGeneration) {
      return;
    }

    if (
      !persisted ||
      persisted.userId !== userId ||
      persisted.expiresAt !== expiresAt
    ) {
      await this.store.clearSession();
      this.transition({ type: "SESSION_EXPIRED", reasonCode: "auth_session_invalid" });
      return;
    }

    if (persisted.expiresAt <= this.nowSeconds() + REFRESH_SKEW_SECONDS) {
      await this.refresh();
      return;
    }

    this.transition({ type: "SESSION_ESTABLISHED", userId });
  }

  private transition(event: MobileAuthEvent) {
    this.state = reduceMobileAuthState(this.state, event);
    this.listeners.forEach((listener) => listener(this.state));
  }
}

interface MobileAuthLifecyclePlugin {
  getLaunchUrl(): Promise<{ url: string } | undefined>;
  addListener(
    eventName: "appUrlOpen",
    listener: (event: { url: string }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "appStateChange",
    listener: (event: { isActive: boolean }) => void
  ): Promise<PluginListenerHandle>;
}

const NativeMobileAuthLifecycle = registerPlugin<MobileAuthLifecyclePlugin>(
  "MobileAuthLifecycle"
);

const capacitorLifecycle: MobileAppLifecycle = {
  getLaunchUrl: () => NativeMobileAuthLifecycle.getLaunchUrl(),
  addUrlOpenListener: (listener) =>
    NativeMobileAuthLifecycle.addListener("appUrlOpen", ({ url }) => {
      listener(url);
    }),
  addStateChangeListener: (listener) =>
    NativeMobileAuthLifecycle.addListener("appStateChange", ({ isActive }) => {
      listener(isActive);
    })
};

export function createMobileAuthService() {
  const authConfig = mobileEnvironment.auth;
  const store = new KeychainMobileAuthSessionStore(authConfig.storageKey);

  if (!authConfig.configured) {
    return new MobileAuthService({
      auth: null,
      store,
      lifecycle: capacitorLifecycle,
      callbackUri: authConfig.callbackUri,
      configured: false
    });
  }

  const storage = createSupabaseKeychainStorage(store, authConfig.storageKey);
  const exchangeFetchContext: { signal: AbortSignal | null } = { signal: null };
  const supabase = createClient(authConfig.supabaseUrl, authConfig.publishableKey, {
    global: {
      fetch: (input, init) =>
        globalThis.fetch(
          input,
          exchangeFetchContext.signal
            ? { ...init, signal: exchangeFetchContext.signal }
            : init
        )
    },
    auth: {
      flowType: "pkce",
      storageKey: authConfig.storageKey,
      storage,
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
  const supabaseAuth = supabase.auth;
  const auth: MobileSupabaseAuth = {
    signInWithOtp: (input) => supabaseAuth.signInWithOtp(input),
    exchangeCodeForSession: async (code, signal) => {
      exchangeFetchContext.signal = signal;
      try {
        return await supabaseAuth.exchangeCodeForSession(code);
      } finally {
        if (exchangeFetchContext.signal === signal) {
          exchangeFetchContext.signal = null;
        }
      }
    },
    getSession: () => supabaseAuth.getSession(),
    refreshSession: () => supabaseAuth.refreshSession(),
    signOut: (options) => supabaseAuth.signOut(options)
  };

  return new MobileAuthService({
    auth,
    store,
    lifecycle: capacitorLifecycle,
    callbackUri: authConfig.callbackUri,
    configured: true
  });
}
