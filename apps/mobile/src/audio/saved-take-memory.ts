import type { MobileTakeAudioDownloadState } from "../lib/api";

export const SAVED_TAKE_AUDIO_TTL_MS = 30_000;
export type SavedTakeAudioVisit = Readonly<{ scriptId: string; takeId: string }>;
type Audio = Extract<MobileTakeAudioDownloadState, { kind: "success" }>;
type Proof = { visit: SavedTakeAudioVisit; session: string; identity: string };

// One owner/session shell, one binary/request, no persistence.
// Object URLs remain owned by the mounted player and are revoked on unmount.
export class SavedTakeAudioMemory {
  private visit: SavedTakeAudioVisit | null = null;
  private proof: Proof | null = null;
  private entry: { proof: Proof; audio: Audio; expires: number } | null = null;
  private pending: { proof: Proof; controller: AbortController; promise: Promise<MobileTakeAudioDownloadState> } | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private epoch = 0;
  private revoked = false;
  private foreground = true;
  private online = true;
  private listeners = new Set<() => void>();

  constructor(private readonly ownerIsCurrent: () => boolean, private readonly now = () => performance.now()) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private expire = () => {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.entry = null;
  };

  private abortPending() {
    const pending = this.pending;
    this.pending = null;
    pending?.controller.abort();
  }

  invalidate = () => {
    this.epoch++;
    this.abortPending();
    this.proof = null;
    this.expire();
    this.listeners.forEach(listener => listener());
  };

  revoke = () => { this.revoked = true; this.invalidate(); };
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

  beginVisit(scriptId: string, takeId: string): SavedTakeAudioVisit {
    this.epoch++;
    this.abortPending();
    this.proof = null;
    this.visit = Object.freeze({ scriptId, takeId });
    if (this.entry && (this.entry.proof.visit.takeId !== takeId || this.entry.proof.visit.scriptId !== scriptId)) this.expire();
    return this.visit;
  }

  endVisit(visit: SavedTakeAudioVisit) {
    if (this.visit !== visit) return;
    this.epoch++;
    this.abortPending();
    this.visit = null;
    this.proof = null;
  }

  current(visit: SavedTakeAudioVisit) {
    return this.visit === visit && !this.revoked && this.foreground && this.online && this.ownerIsCurrent();
  }

  validationEpoch() { return this.epoch; }

  authorize(visit: SavedTakeAudioVisit, epoch: number, session: string, identity: string | null | undefined) {
    if (!this.current(visit) || epoch !== this.epoch) return false;
    if (!session || !identity || !/^[a-f0-9]{64}$/.test(identity)) { this.invalidate(); return false; }
    if (this.proof && (this.proof.identity !== identity || this.proof.session !== session)) this.invalidate();
    if (this.entry && (this.entry.proof.identity !== identity || this.entry.proof.session !== session)) this.expire();
    this.proof = { visit, session, identity };
    return true;
  }

  authorized(visit: SavedTakeAudioVisit, session: string) {
    return this.current(visit) && this.proof?.visit === visit && this.proof.session === session;
  }

  load(visit: SavedTakeAudioVisit, session: string, download: (signal: AbortSignal) => Promise<MobileTakeAudioDownloadState>): Promise<MobileTakeAudioDownloadState> {
    if (!this.authorized(visit, session)) return Promise.resolve({ kind: "invalid-response" });
    const proof = this.proof!;
    if (this.entry && this.now() >= this.entry.expires) this.expire();
    if (this.entry && this.entry.proof.visit.takeId === visit.takeId && this.entry.proof.visit.scriptId === visit.scriptId &&
        this.entry.proof.session === session && this.entry.proof.identity === proof.identity) return Promise.resolve(this.entry.audio);
    if (this.pending && this.pending.proof.visit === visit && this.pending.proof.session === session &&
        this.pending.proof.identity === proof.identity) return this.pending.promise;
    const epoch = ++this.epoch;
    this.abortPending();
    this.expire();
    const controller = new AbortController();
    const promise = (async (): Promise<MobileTakeAudioDownloadState> => {
      let audio: MobileTakeAudioDownloadState;
      try { audio = await (async () => download(controller.signal))(); }
      catch { audio = { kind: "network-error" }; }
      if (controller.signal.aborted || epoch !== this.epoch || !this.authorized(visit, session)) return { kind: "invalid-response" };
      // Release the completed request before notifying any error listeners.
      this.pending = null;
      if (audio.kind !== "success") { this.invalidate(); return audio; }
      if (audio.audioIdentity !== proof.identity) { this.invalidate(); return { kind: "invalid-response" }; }
      this.entry = { proof, audio, expires: this.now() + SAVED_TAKE_AUDIO_TTL_MS };
      // Hits never renew TTL; mounted playback still owns its existing object URL.
      this.timer = setTimeout(this.expire, SAVED_TAKE_AUDIO_TTL_MS);
      return audio;
    })();
    this.pending = { proof, controller, promise };
    return promise;
  }
}
