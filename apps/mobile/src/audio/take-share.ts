import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { takeAudioFormat } from "../../../../lib/take-audio-format";
import type { MobileTakeAudioDownloadState } from "../lib/api";

// A dedicated cache directory, at most one export at a time; never Documents.
const SHARE_DIRECTORY = "native-minute-take-share";
export type TakeShareResult = "finished" | "cancelled" | "unavailable" | "busy" | "failed" | "cleanup-failed";
export interface TakeShareDependencies {
  supported(): boolean;
  cleanup(): Promise<void>;
  write(filename: string, data: string): Promise<string>;
  share(uri: string): Promise<void>;
}

const nativeDependencies: TakeShareDependencies = {
  supported: () => Capacitor.getPlatform() === "ios" && Capacitor.isPluginAvailable("Share") && Capacitor.isPluginAvailable("Filesystem"),
  async cleanup() {
    try { await Filesystem.rmdir({ path: SHARE_DIRECTORY, directory: Directory.Cache, recursive: true }); }
    catch (error) { if ((error as { code?: string })?.code !== "OS-PLUG-FILE-0008") throw error; }
  },
  async write(filename, data) {
    const result = await Filesystem.writeFile({ path: `${SHARE_DIRECTORY}/${filename}`, directory: Directory.Cache, data, recursive: true });
    if (!result.uri.startsWith("file://")) throw new Error("invalid_share_file");
    return result.uri;
  },
  async share(uri) { await Share.share({ files: [uri] }); }
};

function base64(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

export class TakeShareController {
  private busy = false;
  private generation = 0;
  constructor(private readonly dependencies: TakeShareDependencies = nativeDependencies) {}
  supported() { return this.dependencies.supported(); }

  // Synchronous invalidation blocks an old fetch/write from opening a new sheet.
  // A sheet already handed to iOS retains its file until its native completion.
  invalidate() { this.generation += 1; void this.cleanupIdle(); }
  async cleanupIdle() {
    if (this.busy || !this.supported()) return;
    this.busy = true;
    try { await this.dependencies.cleanup(); } catch { /* Retried, fail-closed, before the next export. */ }
    finally { this.busy = false; }
  }

  async share(fetchAudio: () => Promise<MobileTakeAudioDownloadState>, isCurrent: () => boolean): Promise<TakeShareResult> {
    if (!this.supported()) return "unavailable";
    if (this.busy) return "busy";
    this.busy = true;
    const generation = this.generation;
    const current = () => generation === this.generation && isCurrent();
    let result: TakeShareResult = "failed";
    try {
      result = await (async (): Promise<TakeShareResult> => {
        // Old/crash leftovers must be gone before obtaining/writing another file.
        await this.dependencies.cleanup();
        if (!current()) return "cancelled";
        const audio = await fetchAudio();
        if (!current()) return "cancelled";
        if (audio.kind !== "success") return audio.kind === "not-found" ? "unavailable" : "failed";
        const bytes = new Uint8Array(await audio.audio.arrayBuffer());
        const format = takeAudioFormat(audio.contentType, bytes);
        if (!format || !/^[\p{L}\p{N} _-]{1,60}\.(wav|m4a|mp3|ogg|webm)$/u.test(audio.filename) || !audio.filename.endsWith(`.${format.extension}`)) return "unavailable";
        if (!current()) return "cancelled";
        const uri = await this.dependencies.write(audio.filename, base64(bytes));
        if (!current()) return "cancelled";
        // @capacitor/share 8.0.2 resolves/rejects in completionWithItemsHandler,
        // not immediately after presenting UIActivityViewController.
        await this.dependencies.share(uri);
        return "finished"; // OS operation ended; not proof of remote delivery.
      })();
    } catch (error) {
      result = (error as { message?: string })?.message === "Share canceled" ? "cancelled" : "failed";
    } finally {
      try { await this.dependencies.cleanup(); } catch { result = "cleanup-failed"; }
      this.busy = false;
    }
    return result;
  }
}

export const takeShareController = new TakeShareController();
