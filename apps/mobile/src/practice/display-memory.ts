import type { PracticeRequestFailure } from "./api";
import { METADATA_LIMITS, METADATA_REFRESH_AGE_MS } from "./metadata-policy";

export type DisplayResult<T> = { kind: "success"; data: T } | PracticeRequestFailure;
export type RefreshReason = "entry" | "manual" | "mutation" | "resume" | "online" | "audio";
export type DisplayState<T> =
  | { kind: "loading" }
  | { kind: "ready"; data: T; refreshing: boolean; prefetchAllowed: boolean; refreshReason?: RefreshReason; updateError?: PracticeRequestFailure }
  | { kind: "error"; error: PracticeRequestFailure };
export type ReadContext<T> = { signal: AbortSignal; reason: RefreshReason; previous?: T };
type Entry<T> = { state: DisplayState<T>; confirmedAt: number; dirty: boolean; used: number; bytes: number; retryAt: number };
type View<T> = { state: DisplayState<T>; users: number; prefetchAllowed: boolean; confirmedAt: number; dirty: boolean; retryAt: number };
type Options<T> = {
  limits?: { entries: number; entryBytes: number; totalBytes: number };
  snapshot?: (data: T) => T;
  release?: (data: T) => void;
  ownerIsCurrent?: () => boolean;
  audioOnEntry?: boolean;
  onFailure?: (key: string, error: PracticeRequestFailure) => void;
  onSuccess?: (key: string, data: T) => void;
  now?: () => number;
};
const loading = { kind: "loading" } as const;
export function isTemporaryMetadataFailure(error: PracticeRequestFailure) {
  return error.kind === "offline" || error.kind === "network-error" || error.kind === "timeout" || error.kind === "rate-limited" ||
    (error.kind === "server-error" && error.status >= 500 && error.status <= 599);
}

// Bounded display snapshots; only mounted visits can carry fresh capabilities.
// App's existing authenticated practice-session shell owns this whole instance.
export class DisplayMemory<T> {
  private entries = new Map<string, Entry<T>>();
  private views = new Map<string, View<T>>();
  private pending = new Map<string, { controller: AbortController; promise: Promise<void> }>();
  private listeners = new Set<() => void>();
  private mutations = new Set<(key: string) => boolean>();
  private sequence = 0;
  private foreground = true;
  private online = true;
  private sessionReady = true;
  private revoked = false;
  private readonly now: () => number;
  constructor(private readonly read: (key: string, context: ReadContext<T>) => Promise<DisplayResult<T>>, private readonly options: Options<T> = {}) {
    this.now = options.now ?? (() => performance.now());
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit() { this.listeners.forEach(listener => listener()); }
  isRevoked = () => this.revoked;
  private owned() { return !this.revoked && (this.options.ownerIsCurrent?.() ?? true); }
  private allowed(key: string) { return this.owned() && this.foreground && this.online && this.sessionReady && ![...this.mutations].some(matches => matches(key)); }
  private snapshot(data: T) { return this.options.snapshot?.(data) ?? data; }
  private release(view: View<T>) { if (view.state.kind === "ready") this.options.release?.(view.state.data); }
  getSnapshot = (key: string): DisplayState<T> => this.owned() ? this.views.get(key)?.state ?? this.entries.get(key)?.state ?? loading : loading;
  inspect = () => ({ entries: this.entries.size, bytes: [...this.entries.values()].reduce((n, entry) => n + entry.bytes, 0), active: this.views.size, pending: this.pending.size });
  peek = (key: string) => { const state = this.getSnapshot(key); return state.kind === "ready" ? state.data : undefined; };
  keys = () => [...new Set([...this.entries.keys(), ...this.views.keys()])];
  private prune() {
    const limit = this.options.limits ?? METADATA_LIMITS.scripts;
    for (const [key, entry] of this.entries) if (entry.bytes > limit.entryBytes) this.entries.delete(key);
    while (this.entries.size > limit.entries || this.inspect().bytes > limit.totalBytes) {
      const candidates = [...this.entries].sort((a, b) => Number(this.views.has(a[0])) - Number(this.views.has(b[0])) || a[1].used - b[1].used);
      this.entries.delete(candidates[0][0]); // Mounted oversized data remains readable, but is not reusable.
    }
  }
  private store(key: string, state: DisplayState<T>, confirmedAt: number, dirty = false, retryAt = 0) {
    const safe = state.kind === "ready" ? { ...state, data: this.snapshot(state.data), refreshing: false, prefetchAllowed: false } : state;
    this.entries.set(key, { state: safe, confirmedAt, dirty, retryAt, used: ++this.sequence, bytes: safe.kind === "ready" ? new TextEncoder().encode(JSON.stringify(safe.data)).length : 0 });
    this.prune();
  }
  private cancel(key: string, release = true) {
    const pending = this.pending.get(key); this.pending.delete(key); pending?.controller.abort();
    const view = this.views.get(key);
    if (view) {
      if (release) this.release(view);
      if (view.state.kind === "ready") view.state = { ...view.state, data: release ? this.snapshot(view.state.data) : view.state.data, refreshing: false, prefetchAllowed: false };
    }
  }
  enter = (key: string) => {
    const current = this.views.get(key);
    if (current) current.users++;
    else {
      const entry = this.entries.get(key); if (entry) entry.used = ++this.sequence;
      this.views.set(key, { state: entry?.state ?? loading, users: 1, prefetchAllowed: true, confirmedAt: entry?.confirmedAt ?? 0, dirty: entry?.dirty ?? false, retryAt: entry?.retryAt ?? 0 });
      void this.ensure(key, "entry");
    }
    let left = false;
    return () => {
      if (left) return; left = true;
      const view = this.views.get(key);
      if (view && --view.users === 0) { this.cancel(key); this.views.delete(key); this.prune(); }
    };
  };
  private ensure(key: string, reason: RefreshReason) {
    const entry = this.entries.get(key), state = this.getSnapshot(key);
    const view = this.views.get(key), confirmedAt = entry?.confirmedAt ?? view?.confirmedAt ?? 0;
    const dirty = entry?.dirty || view?.dirty;
    const failed = state.kind === "error" || (state.kind === "ready" && state.updateError);
    if (failed && reason !== "online" && reason !== "mutation") return Promise.resolve();
    if (state.kind === "loading" || dirty || this.now() - confirmedAt >= METADATA_REFRESH_AGE_MS ||
      (failed && reason === "online") || (this.options.audioOnEntry && (reason === "entry" || reason === "resume" || reason === "online"))) {
      const audioOnly = this.options.audioOnEntry && state.kind === "ready" && !dirty && this.now() - confirmedAt < METADATA_REFRESH_AGE_MS;
      return this.refreshKey(key, audioOnly ? "audio" : reason);
    }
    return Promise.resolve();
  }
  revalidate = (): Promise<void> => Promise.all([...this.views.keys()].map(key => this.refreshKey(key, "manual"))).then(() => undefined);
  refreshKey = (key: string, reason: RefreshReason = "manual"): Promise<void> => {
    if (!this.views.has(key) || !this.allowed(key)) return Promise.resolve();
    const existing = this.pending.get(key); if (existing) return existing.promise;
    const entry = this.entries.get(key);
    const view = this.views.get(key)!;
    if (this.now() < (entry?.retryAt ?? view.retryAt)) return Promise.resolve();
    if (reason !== "entry" && reason !== "audio") view.prefetchAllowed = false;
    this.release(view);
    const previous = view.state.kind === "ready" ? this.snapshot(view.state.data) : undefined;
    view.state = previous !== undefined ? { kind: "ready", data: previous, refreshing: true, prefetchAllowed: false, refreshReason: reason } : loading;
    const request = { controller: new AbortController(), promise: Promise.resolve() };
    this.pending.set(key, request);
    request.promise = Promise.resolve().then(() => request.controller.signal.aborted ? null : this.read(key, { signal: request.controller.signal, reason, previous }))
      .catch(() => ({ kind: "invalid-response" as const })).then(result => {
        if (!result) return;
        if (this.pending.get(key) !== request || request.controller.signal.aborted || !this.owned()) {
          if (result.kind === "success") this.options.release?.(result.data);
          return;
        }
        this.pending.delete(key);
        if (result.kind === "success") {
          view.confirmedAt = this.now(); view.dirty = false; view.retryAt = 0;
          view.state = { kind: "ready", data: result.data, refreshing: false, prefetchAllowed: view.prefetchAllowed };
          this.store(key, view.state, view.confirmedAt);
          this.options.onSuccess?.(key, result.data);
        } else {
          const keep = previous !== undefined && isTemporaryMetadataFailure(result);
          view.state = keep ? { kind: "ready", data: previous, refreshing: false, prefetchAllowed: false, updateError: result } : { kind: "error", error: result };
          view.retryAt = result.kind === "rate-limited" ? this.now() + result.retryAfterSeconds * 1000 : 0;
          this.store(key, view.state, entry?.confirmedAt ?? view.confirmedAt, entry?.dirty ?? view.dirty, view.retryAt);
          this.options.onFailure?.(key, result);
        }
        this.emit();
      });
    this.emit();
    return request.promise;
  };
  private suspend() {
    for (const key of this.views.keys()) {
      const entry = this.entries.get(key); if (entry && this.pending.has(key)) entry.dirty = true;
      if (this.pending.has(key)) this.views.get(key)!.dirty = true;
      this.cancel(key); this.views.get(key)!.prefetchAllowed = false;
    }
    this.emit();
  }
  setForeground = (active: boolean) => {
    if (active === this.foreground) return; this.foreground = active;
    if (!active) this.suspend(); else for (const key of this.views.keys()) void this.ensure(key, "resume");
  };
  setOnline = (online: boolean) => {
    if (online === this.online) return; this.online = online;
    if (!online) this.suspend(); else for (const key of this.views.keys()) void this.ensure(key, "online");
  };
  setSessionReady = (ready: boolean) => {
    if (ready === this.sessionReady) return; this.sessionReady = ready;
    if (!ready) for (const view of this.views.values()) view.prefetchAllowed = false;
    // Auth permits the current practice shell during normal token refresh.
    // Pause new work; allow the request performing that refresh to settle.
    if (ready) for (const key of this.views.keys()) if (!this.pending.has(key)) void this.ensure(key, "resume");
  };
  revoke = () => { this.revoked = true; for (const key of this.views.keys()) this.cancel(key); this.entries.clear(); for (const view of this.views.values()) view.state = loading; this.emit(); };
  remove = (matches: (key: string, data?: T) => boolean, error?: PracticeRequestFailure) => {
    for (const key of this.keys()) if (matches(key, this.peek(key))) {
      this.cancel(key); this.entries.delete(key);
      const state = error ? { kind: "error" as const, error } : loading;
      const view = this.views.get(key); if (view) view.state = state;
      if (error) this.store(key, state, 0);
    }
    this.emit();
  };
  markDirty = (matches: (key: string, data?: T) => boolean = () => true) => {
    for (const key of this.keys()) if (matches(key, this.peek(key))) {
      this.cancel(key); const entry = this.entries.get(key); if (entry) entry.dirty = true;
      const view = this.views.get(key); if (view) view.dirty = true;
    }
    this.emit();
  };
  update = (matches: (key: string, data: T) => boolean, change: (data: T) => T) => {
    for (const key of this.keys()) {
      const previous = this.peek(key); if (previous === undefined || !matches(key, previous)) continue;
      this.cancel(key, false);
      const entry = this.entries.get(key), data = change(previous);
      const state = { kind: "ready" as const, data, refreshing: false, prefetchAllowed: false };
      this.store(key, state, entry?.confirmedAt ?? this.views.get(key)?.confirmedAt ?? 0, entry?.dirty ?? this.views.get(key)?.dirty);
      const view = this.views.get(key); if (view) view.state = state;
    }
    this.emit();
  };
  seed = (key: string, data: T) => {
    this.cancel(key); const state = { kind: "ready" as const, data: this.snapshot(data), refreshing: false, prefetchAllowed: false };
    this.store(key, state, this.now()); const view = this.views.get(key); if (view) { view.state = state; view.confirmedAt = this.now(); view.dirty = false; } this.emit();
  };
  beginMutation = (matches: (key: string) => boolean = () => true) => {
    this.mutations.add(matches);
    for (const key of this.keys()) if (matches(key)) {
      const view = this.views.get(key);
      // A fenced initial read has no successful snapshot to patch. Reconcile
      // it after the write instead of leaving its mounted view loading forever.
      if (view?.state.kind === "loading" && this.pending.has(key)) view.dirty = true;
      this.cancel(key, false);
      if (view) view.prefetchAllowed = false;
    }
    this.emit();
    let finished = false;
    return () => {
      if (finished) return; finished = true; this.mutations.delete(matches);
      for (const key of this.views.keys()) if (matches(key) && (this.entries.get(key)?.dirty || this.views.get(key)?.dirty)) void this.ensure(key, "mutation");
    };
  };
}
