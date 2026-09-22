import type { MobileProgress, MobileProgressRequestState } from "../lib/api";
import { DisplayMemory, type DisplayState } from "./display-memory";
import { METADATA_LIMITS } from "./metadata-policy";

export type SavedProgressState = Exclude<DisplayState<MobileProgress>, { kind: "ready" }> |
  (Omit<Extract<DisplayState<MobileProgress>, { kind: "ready" }>, "data"> & { progress: MobileProgress });

// Home, Progress and My Takes share this one canonical payload and request.
export class ProgressMemory {
  readonly memory: DisplayMemory<MobileProgress>;
  private previous?: DisplayState<MobileProgress>;
  private state: SavedProgressState = { kind: "loading" };
  constructor(read: (signal?: AbortSignal) => Promise<MobileProgressRequestState>, now?: () => number, ownerIsCurrent?: () => boolean) {
    this.memory = new DisplayMemory(async (_key, { signal }) => {
      const result = await read(signal);
      return result.kind === "success" ? { kind: "success", data: result.progress } : result;
    }, { limits: METADATA_LIMITS.progress, now, ownerIsCurrent });
  }
  getSnapshot = (): SavedProgressState => {
    const next = this.memory.getSnapshot("progress");
    if (next !== this.previous) {
      this.previous = next;
      this.state = next.kind === "ready" ? { ...next, progress: next.data } : next;
    }
    return this.state;
  };
  subscribe = (listener: () => void) => this.memory.subscribe(listener);
  enter = () => this.memory.enter("progress");
  revalidate = () => this.memory.revalidate();
  isRevoked = () => this.memory.isRevoked();
  revoke = () => this.memory.revoke();
  setForeground = (active: boolean) => this.memory.setForeground(active);
  setOnline = (online: boolean) => this.memory.setOnline(online);
  setSessionReady = (ready: boolean) => this.memory.setSessionReady(ready);
  beginMutation = () => this.memory.beginMutation();
  invalidate = () => { this.memory.markDirty(); void this.memory.revalidate(); };
}
