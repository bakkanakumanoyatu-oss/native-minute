import type { MobileProgress, MobileProgressRequestState } from "../lib/api";
import type { PracticeRequestFailure } from "./api";

export const PROGRESS_MEMORY_TTL_MS = 30_000;
export type SavedProgressState =
  | { kind: "loading" }
  | { kind: "ready"; progress: MobileProgress; refreshing: boolean }
  | { kind: "error"; error: PracticeRequestFailure };

// One instance belongs to one authenticated practice session. No persistence,
// credentials, files or audio; every visit still revalidates with the server.
export class ProgressMemory {
  private state: SavedProgressState = { kind: "loading" };
  private listeners = new Set<() => void>();
  private generation = 0;
  private expiresAt = 0;
  private expiryTimer: ReturnType<typeof setTimeout> | undefined;
  private pending: Promise<void> | undefined;
  private mutations = 0;
  private foreground = true;
  private online = true;
  private revoked = false;

  constructor(
    private readonly read: () => Promise<MobileProgressRequestState>,
    private readonly now = () => performance.now()
  ) {}

  getSnapshot = (): SavedProgressState => {
    // Also enforce expiry if the JS timer was delayed while the app was suspended.
    if (this.expiresAt && this.now() >= this.expiresAt) {
      this.clear();
      queueMicrotask(() => { this.emit(); this.refreshObserved(); });
    }
    return this.state;
  };

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  isRevoked = () => this.revoked;

  private emit() { this.listeners.forEach(listener => listener()); }

  private clear() {
    this.generation++;
    clearTimeout(this.expiryTimer);
    this.expiryTimer = undefined;
    this.expiresAt = 0;
    this.pending = undefined;
    this.state = { kind: "loading" };
  }

  private refreshObserved() {
    if (this.listeners.size) void this.revalidate();
  }

  invalidate = () => {
    this.clear();
    this.emit();
    this.refreshObserved();
  };

  revoke = () => {
    // Irreversible for this instance, even if the same account signs in again.
    this.revoked = true;
    this.clear();
    this.emit();
  };

  setForeground = (active: boolean) => {
    if (active === this.foreground) return;
    this.foreground = active;
    this.invalidate();
  };

  setOnline = (online: boolean) => {
    if (online === this.online) return;
    this.online = online;
    this.invalidate();
  };

  beginMutation = () => {
    this.mutations++;
    this.invalidate();
    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      this.mutations--;
      this.invalidate();
    };
  };

  revalidate = (): Promise<void> => {
    this.getSnapshot();
    if (this.revoked || !this.foreground || !this.online || this.mutations) return Promise.resolve();
    // Only an in-flight read in the same generation can be shared.
    if (this.pending) return this.pending;
    const generation = ++this.generation;
    if (this.state.kind === "ready") this.state = { ...this.state, refreshing: true };
    else this.state = { kind: "loading" };
    const pending = Promise.resolve().then(() => generation === this.generation ? this.read() : null)
      .catch(() => ({ kind: "network-error" as const })).then(result => {
      if (!result || generation !== this.generation) return;
      this.pending = undefined;
      clearTimeout(this.expiryTimer);
      this.expiresAt = 0;
      if (result.kind === "success") {
        this.expiresAt = this.now() + PROGRESS_MEMORY_TTL_MS;
        this.state = { kind: "ready", progress: result.progress, refreshing: false };
        this.expiryTimer = setTimeout(this.invalidate, PROGRESS_MEMORY_TTL_MS);
      } else {
        // A failed revalidation removes previously successful metadata as well.
        this.state = { kind: "error", error: result };
      }
      this.emit();
    });
    this.pending = pending;
    this.emit();
    return pending;
  };
}
