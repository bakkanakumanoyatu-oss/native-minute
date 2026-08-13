export const MOBILE_RECORDING_MAX_SECONDS = 120;
export const MOBILE_RECORDING_MAX_BYTES = 15 * 1024 * 1024;

export type MobileRecorderReason =
  | "unsupported"
  | "permission_denied"
  | "device_unavailable"
  | "empty_recording"
  | "recording_too_large"
  | "recording_failed";

export type MobileRecorderState =
  | { kind: "idle" }
  | { kind: "requesting-permission" }
  | { kind: "recording"; startedAtMs: number }
  | { kind: "stopping" }
  | { kind: "error"; reason: MobileRecorderReason };

export type MobileRecordedAudio = Readonly<{
  file: File;
  durationSeconds: number;
  mimeType: string;
}>;

export type MediaRecorderLike = Pick<
  MediaRecorder,
  "mimeType" | "state" | "ondataavailable" | "onerror" | "onstop" | "start" | "stop"
>;

export interface MediaRecorderConstructorLike {
  new(stream: MediaStream, options?: MediaRecorderOptions): MediaRecorderLike;
  isTypeSupported?(mimeType: string): boolean;
}

export type MobileRecorderDependencies = Readonly<{
  mediaDevices?: Pick<MediaDevices, "getUserMedia">;
  MediaRecorderClass?: MediaRecorderConstructorLike;
  nowMs?: () => number;
  setTimer?: (callback: () => void, milliseconds: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}>;

type MobileRecorderOptions = MobileRecorderDependencies & Readonly<{
  maxSeconds?: number;
  onStateChange?: (state: MobileRecorderState) => void;
  onRecordingReady?: (recording: MobileRecordedAudio) => void;
}>;

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4"
] as const;

export function selectMobileRecordingMimeType(
  MediaRecorderClass: MediaRecorderConstructorLike | undefined = globalThis.MediaRecorder
) {
  if (!MediaRecorderClass) {
    return null;
  }

  if (typeof MediaRecorderClass.isTypeSupported !== "function") {
    return "";
  }

  return MIME_CANDIDATES.find((mimeType) => MediaRecorderClass.isTypeSupported?.(mimeType)) ?? "";
}

function getRecordingExtension(mimeType: string) {
  return mimeType.toLowerCase().includes("mp4") ? "m4a" : "webm";
}

function classifyCaptureFailure(error: unknown): MobileRecorderReason {
  const name = error instanceof DOMException || error instanceof Error ? error.name : "";

  if (name === "NotAllowedError" || name === "SecurityError") {
    return "permission_denied";
  }

  if (name === "NotFoundError" || name === "NotReadableError" || name === "AbortError") {
    return "device_unavailable";
  }

  return "recording_failed";
}

export class MobileAudioRecorder {
  private readonly mediaDevices: Pick<MediaDevices, "getUserMedia"> | undefined;
  private readonly MediaRecorderClass: MediaRecorderConstructorLike | undefined;
  private readonly nowMs: () => number;
  private readonly setTimer: NonNullable<MobileRecorderDependencies["setTimer"]>;
  private readonly clearTimer: NonNullable<MobileRecorderDependencies["clearTimer"]>;
  private readonly maxSeconds: number;
  private readonly onStateChange: (state: MobileRecorderState) => void;
  private readonly onRecordingReady: (recording: MobileRecordedAudio) => void;
  private state: MobileRecorderState = { kind: "idle" };
  private recorder: MediaRecorderLike | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private startedAtMs: number | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private discardOutput = false;
  private disposed = false;

  constructor(options: MobileRecorderOptions = {}) {
    this.mediaDevices = options.mediaDevices ?? globalThis.navigator?.mediaDevices;
    this.MediaRecorderClass = options.MediaRecorderClass ?? globalThis.MediaRecorder;
    this.nowMs = options.nowMs ?? (() => Date.now());
    this.setTimer = options.setTimer ?? ((callback, milliseconds) => setTimeout(callback, milliseconds));
    this.clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer));
    this.maxSeconds = Math.max(1, Math.min(MOBILE_RECORDING_MAX_SECONDS, options.maxSeconds ?? MOBILE_RECORDING_MAX_SECONDS));
    this.onStateChange = options.onStateChange ?? (() => undefined);
    this.onRecordingReady = options.onRecordingReady ?? (() => undefined);
  }

  getState() {
    return this.state;
  }

  async start() {
    if (this.disposed || this.state.kind === "requesting-permission" || this.state.kind === "recording" || this.state.kind === "stopping") {
      return false;
    }

    if (!this.mediaDevices?.getUserMedia || !this.MediaRecorderClass) {
      this.transition({ kind: "error", reason: "unsupported" });
      return false;
    }

    const generation = ++this.generation;
    this.transition({ kind: "requesting-permission" });

    let stream: MediaStream;

    try {
      stream = await this.mediaDevices.getUserMedia({
        audio: {
          channelCount: { ideal: 1 },
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true }
        }
      });
    } catch (error) {
      if (generation === this.generation && !this.disposed) {
        this.transition({ kind: "error", reason: classifyCaptureFailure(error) });
      }
      return false;
    }

    if (this.disposed || generation !== this.generation) {
      stream.getTracks().forEach((track) => track.stop());
      return false;
    }

    const selectedMimeType = selectMobileRecordingMimeType(this.MediaRecorderClass);
    let recorder: MediaRecorderLike;

    try {
      recorder = selectedMimeType
        ? new this.MediaRecorderClass(stream, { mimeType: selectedMimeType })
        : new this.MediaRecorderClass(stream);
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      this.transition({ kind: "error", reason: "recording_failed" });
      return false;
    }

    this.stream = stream;
    this.recorder = recorder;
    this.chunks = [];
    this.discardOutput = false;
    this.startedAtMs = this.nowMs();

    recorder.ondataavailable = (event) => {
      if (event.data?.size) {
        this.chunks.push(event.data);
      }
    };
    recorder.onerror = () => {
      this.discardOutput = true;
      this.finish({ kind: "error", reason: "recording_failed" });
    };
    recorder.onstop = () => {
      this.handleStopped(recorder);
    };

    try {
      recorder.start();
    } catch {
      this.finish({ kind: "error", reason: "recording_failed" });
      return false;
    }

    const startedAtMs = this.startedAtMs;
    this.transition({ kind: "recording", startedAtMs });
    this.stopTimer = this.setTimer(() => {
      this.stop();
    }, this.maxSeconds * 1_000);
    return true;
  }

  stop() {
    const recorder = this.recorder;

    if (!recorder || recorder.state === "inactive") {
      return false;
    }

    this.transition({ kind: "stopping" });
    try {
      recorder.stop();
      this.releaseTracks();
      return true;
    } catch {
      this.discardOutput = true;
      this.finish({ kind: "error", reason: "recording_failed" });
      return false;
    }
  }

  cancel() {
    this.generation += 1;
    this.discardOutput = true;
    const recorder = this.recorder;

    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // Cleanup below also covers a recorder that rejects stop().
      }
    }
    // Cancellation is a privacy boundary: release the microphone immediately
    // instead of waiting for the asynchronous MediaRecorder stop event.
    this.finish({ kind: "idle" });
  }

  reset() {
    if (this.state.kind === "recording" || this.state.kind === "stopping" || this.state.kind === "requesting-permission") {
      this.cancel();
      return;
    }

    this.transition({ kind: "idle" });
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.cancel();
  }

  private handleStopped(recorder: MediaRecorderLike) {
    const mimeType = recorder.mimeType || this.chunks[0]?.type || "audio/webm";
    const durationSeconds = this.startedAtMs === null
      ? 0
      : Math.max(1, Math.round((this.nowMs() - this.startedAtMs) / 1_000));
    const blob = new Blob(this.chunks, { type: mimeType });
    const discardOutput = this.discardOutput;

    this.cleanupCapture();

    if (discardOutput || this.disposed) {
      if (!this.disposed) {
        this.transition({ kind: "idle" });
      }
      return;
    }

    if (!blob.size) {
      this.transition({ kind: "error", reason: "empty_recording" });
      return;
    }

    if (blob.size > MOBILE_RECORDING_MAX_BYTES) {
      this.transition({ kind: "error", reason: "recording_too_large" });
      return;
    }

    const file = new File(
      [blob],
      `native-minute-take.${getRecordingExtension(mimeType)}`,
      { type: mimeType, lastModified: Date.now() }
    );
    this.transition({ kind: "idle" });
    this.onRecordingReady({ file, durationSeconds, mimeType });
  }

  private finish(nextState: MobileRecorderState) {
    this.cleanupCapture();
    if (!this.disposed) {
      this.transition(nextState);
    }
  }

  private cleanupCapture() {
    if (this.stopTimer !== null) {
      this.clearTimer(this.stopTimer);
      this.stopTimer = null;
    }

    this.releaseTracks();
    if (this.recorder) {
      this.recorder.ondataavailable = null;
      this.recorder.onerror = null;
      this.recorder.onstop = null;
    }
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
    this.startedAtMs = null;
    this.discardOutput = false;
  }

  private releaseTracks() {
    this.stream?.getTracks().forEach((track) => track.stop());
  }

  private transition(nextState: MobileRecorderState) {
    this.state = nextState;
    this.onStateChange(nextState);
  }
}
