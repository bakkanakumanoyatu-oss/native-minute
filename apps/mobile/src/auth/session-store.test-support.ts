import {
  isMobileAuthSessionEnvelope,
  isPendingPkceEnvelope,
  MobileAuthSessionStoreError,
  type MobileAuthSessionEnvelope,
  type MobileAuthSessionStore,
  type PendingPkceEnvelope
} from "./session-store";

/** Test-only secure-store fake. Production code must use the Keychain store. */
export class InMemoryMobileAuthSessionStore implements MobileAuthSessionStore {
  private session: MobileAuthSessionEnvelope | null = null;
  private pendingPkce: PendingPkceEnvelope | null = null;
  private available = true;
  private readonly nowSeconds: () => number;

  constructor(nowSeconds: () => number = () => Math.floor(Date.now() / 1000)) {
    this.nowSeconds = nowSeconds;
  }

  setAvailable(available: boolean) {
    this.available = available;
  }

  async saveSession(session: MobileAuthSessionEnvelope) {
    this.assertAvailable();
    if (!isMobileAuthSessionEnvelope(session)) {
      throw new MobileAuthSessionStoreError("invalid_session_envelope");
    }

    this.session = structuredClone(session);
  }

  async loadSession() {
    this.assertAvailable();
    return this.session ? structuredClone(this.session) : null;
  }

  async clearSession() {
    this.assertAvailable();
    this.session = null;
  }

  async savePendingPkce(pending: PendingPkceEnvelope) {
    this.assertAvailable();
    const nowSeconds = this.nowSeconds();
    if (!isPendingPkceEnvelope(pending, nowSeconds) || pending.expiresAt <= nowSeconds) {
      throw new MobileAuthSessionStoreError("invalid_pending_pkce_envelope");
    }

    this.pendingPkce = structuredClone(pending);
  }

  async loadPendingPkce() {
    this.assertAvailable();
    if (!this.pendingPkce) {
      return null;
    }

    if (
      !isPendingPkceEnvelope(this.pendingPkce, this.nowSeconds()) ||
      this.pendingPkce.expiresAt <= this.nowSeconds()
    ) {
      this.pendingPkce = null;
      return null;
    }

    return structuredClone(this.pendingPkce);
  }

  async clearPendingPkce() {
    this.assertAvailable();
    this.pendingPkce = null;
  }

  private assertAvailable() {
    if (!this.available) {
      throw new MobileAuthSessionStoreError("secure_storage_unavailable");
    }
  }
}
