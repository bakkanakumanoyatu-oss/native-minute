import { describe, expect, it, vi } from "vitest";
import {
  MobileAudioRecorder,
  selectMobileRecordingMimeType,
  type MediaRecorderLike
} from "./mobile-recorder";

class FakeMediaRecorder implements MediaRecorderLike {
  static supported = new Set<string>();
  static latest: FakeMediaRecorder | null = null;
  readonly mimeType: string;
  state: RecordingState = "inactive";
  ondataavailable: MediaRecorder["ondataavailable"] = null;
  onerror: MediaRecorder["onerror"] = null;
  onstop: MediaRecorder["onstop"] = null;

  static isTypeSupported(mimeType: string) {
    return this.supported.has(mimeType);
  }

  constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
    this.mimeType = options?.mimeType ?? "audio/mp4";
    FakeMediaRecorder.latest = this;
  }

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.onstop?.call(this as unknown as MediaRecorder, new Event("stop"));
  }

  emit(blob: Blob) {
    this.ondataavailable?.call(
      this as unknown as MediaRecorder,
      Object.assign(new Event("dataavailable"), { data: blob, timecode: 0 }) as BlobEvent
    );
  }
}

function createStream() {
  const stop = vi.fn();
  return {
    stream: { getTracks: () => [{ stop }] } as unknown as MediaStream,
    stop
  };
}

describe("mobile recording MIME selection", () => {
  it("prefers WebM/Opus and falls back to MP4/AAC", () => {
    FakeMediaRecorder.supported = new Set(["audio/webm;codecs=opus", "audio/mp4"]);
    expect(selectMobileRecordingMimeType(FakeMediaRecorder)).toBe("audio/webm;codecs=opus");

    FakeMediaRecorder.supported = new Set(["audio/mp4;codecs=mp4a.40.2"]);
    expect(selectMobileRecordingMimeType(FakeMediaRecorder)).toBe("audio/mp4;codecs=mp4a.40.2");
  });
});

describe("MobileAudioRecorder", () => {
  it("stops tracks and returns one correctly named recording", async () => {
    FakeMediaRecorder.supported = new Set(["audio/mp4"]);
    const { stream, stop } = createStream();
    const onRecordingReady = vi.fn();
    let now = 1_000;
    const recorder = new MobileAudioRecorder({
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
      MediaRecorderClass: FakeMediaRecorder,
      nowMs: () => now,
      setTimer: () => 1 as unknown as ReturnType<typeof setTimeout>,
      clearTimer: vi.fn(),
      onRecordingReady
    });

    await expect(recorder.start()).resolves.toBe(true);
    FakeMediaRecorder.latest?.emit(new Blob(["audio"], { type: "audio/mp4" }));
    now = 4_200;
    expect(recorder.stop()).toBe(true);

    expect(stop).toHaveBeenCalledOnce();
    expect(onRecordingReady).toHaveBeenCalledOnce();
    expect(onRecordingReady.mock.calls[0]?.[0]).toMatchObject({
      durationSeconds: 3,
      mimeType: "audio/mp4",
      file: expect.objectContaining({ name: "native-minute-take.m4a", type: "audio/mp4" })
    });
  });

  it("discards output on cancel and still stops every track", async () => {
    const { stream, stop } = createStream();
    const onRecordingReady = vi.fn();
    const recorder = new MobileAudioRecorder({
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
      MediaRecorderClass: FakeMediaRecorder,
      setTimer: () => 1 as unknown as ReturnType<typeof setTimeout>,
      clearTimer: vi.fn(),
      onRecordingReady
    });

    await recorder.start();
    FakeMediaRecorder.latest?.emit(new Blob(["private audio"]));
    recorder.cancel();

    expect(stop).toHaveBeenCalledOnce();
    expect(onRecordingReady).not.toHaveBeenCalled();
    expect(recorder.getState()).toEqual({ kind: "idle" });
  });

  it("releases tracks immediately when canceled while the native stop event is deferred", async () => {
    class DeferredStopMediaRecorder extends FakeMediaRecorder {
      override stop() {
        this.state = "inactive";
      }
    }
    const { stream, stop } = createStream();
    const recorder = new MobileAudioRecorder({
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
      MediaRecorderClass: DeferredStopMediaRecorder,
      setTimer: () => 1 as unknown as ReturnType<typeof setTimeout>,
      clearTimer: vi.fn()
    });

    await recorder.start();
    recorder.cancel();

    expect(stop).toHaveBeenCalledOnce();
    expect(recorder.getState()).toEqual({ kind: "idle" });
  });

  it("releases tracks immediately for a deferred normal stop", async () => {
    class DeferredStopMediaRecorder extends FakeMediaRecorder {
      override stop() {
        this.state = "inactive";
      }
    }
    const { stream, stop } = createStream();
    const recorder = new MobileAudioRecorder({
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
      MediaRecorderClass: DeferredStopMediaRecorder,
      setTimer: () => 1 as unknown as ReturnType<typeof setTimeout>,
      clearTimer: vi.fn()
    });

    await recorder.start();
    expect(recorder.stop()).toBe(true);

    expect(stop).toHaveBeenCalledOnce();
    expect(recorder.getState()).toEqual({ kind: "stopping" });
  });

  it("stops a stream acquired after disposal without constructing a recorder", async () => {
    const { stream, stop } = createStream();
    let resolveStream!: (stream: MediaStream) => void;
    const pendingStream = new Promise<MediaStream>((resolve) => {
      resolveStream = resolve;
    });
    const recorder = new MobileAudioRecorder({
      mediaDevices: { getUserMedia: vi.fn().mockReturnValue(pendingStream) },
      MediaRecorderClass: FakeMediaRecorder
    });

    const started = recorder.start();
    recorder.dispose();
    resolveStream(stream);

    await expect(started).resolves.toBe(false);
    expect(stop).toHaveBeenCalledOnce();
  });
});
