import { useCallback, useEffect, useRef, useState } from "react";
import {
  analyzePcm16WavSignal,
  inspectPcmWav,
  isAzureCompatiblePcmWav,
  normalizeBrowserAudioFileToPcmWav,
  type PcmSignalClassification
} from "../../../../lib/browser-pcm-wav";
import { getShortRecordingPrompt } from "../../../../lib/recording";
import {
  MOBILE_RECORDING_MAX_BYTES,
  MOBILE_RECORDING_MAX_SECONDS,
  MobileAudioRecorder,
  type MobileCaptureDiagnostic,
  type MobileRecordedAudio,
  type MobileRecorderReason,
  type MobileRecorderState
} from "../audio/mobile-recorder";
import { AudioObjectUrl } from "../audio/object-url";
import { addAppStateChangeListener } from "../lib/app-lifecycle";
import type {
  MobileScript,
  PracticeApi,
  PracticeRequestFailure,
  UploadedMobileRecording
} from "../practice/api";
import type { PracticeRoute } from "../practice/routes";
import { LoadingState, RequestError, ScreenHeading, formatSeconds } from "./ScreenParts";

type ScriptState =
  | { kind: "loading" }
  | { kind: "ready"; script: MobileScript }
  | { kind: "error"; error: PracticeRequestFailure };

type PreparedTake = Readonly<{
  file: File;
  durationSeconds: number;
  takeId: string;
  recordingRef: string;
  signalClassification: Exclude<PcmSignalClassification, "DIGITAL_SILENCE">;
}>;

const EMPTY_CAPTURE_DIAGNOSTIC: MobileCaptureDiagnostic = {
  audioTrackPresent: false,
  audioTrackLive: false,
  audioTrackMuted: false
};

export function canSubmitMobileTake(
  take: { signalClassification: PcmSignalClassification } | null,
  previewConfirmed: boolean
) {
  return Boolean(
    take &&
    take.signalClassification !== "DIGITAL_SILENCE" &&
    previewConfirmed
  );
}

export function buildMobileEvaluationInput(
  scriptId: string,
  take: PreparedTake,
  recording: UploadedMobileRecording
) {
  return {
    scriptId,
    takeId: take.takeId,
    recordingRef: recording.recordingRef
  };
}

type SubmitState =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "evaluating" }
  | { kind: "error"; error: PracticeRequestFailure };

const RECORDER_ERROR_COPY: Record<MobileRecorderReason, string> = {
  unsupported: "この端末ではマイク録音を開始できません。iOSとアプリを更新して再試行してください。",
  permission_denied: "マイクの使用が許可されていません。iPhoneの設定でNative Minuteのマイクを許可してください。",
  device_unavailable: "マイクを利用できません。ほかの録音アプリを閉じて再試行してください。",
  capture_unavailable: "マイクの音声を取得できませんでした。マイク設定を確認して録り直してください。",
  empty_recording: "音声を保存できませんでした。マイクに向かって録り直してください。",
  recording_too_large: "録音サイズが大きすぎます。2分以内で録り直してください。",
  recording_failed: "録音を完了できませんでした。少し待ってから録り直してください。"
};

function releaseAudioElement(element: HTMLAudioElement | null) {
  if (!element) {
    return;
  }

  try {
    element.pause();
    element.removeAttribute("src");
    element.load();
  } catch {
    // Releasing a preview must not alter capture or navigation recovery.
  }
}

export function createStableMobileTakeId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

export function RecordScreen({
  api,
  scriptId,
  isOnline,
  onNavigate
}: {
  api: PracticeApi;
  scriptId: string;
  isOnline: boolean;
  onNavigate: (route: PracticeRoute) => void;
}) {
  const [scriptState, setScriptState] = useState<ScriptState>({ kind: "loading" });
  const [scriptReloadKey, setScriptReloadKey] = useState(0);
  const [recorderState, setRecorderState] = useState<MobileRecorderState>({ kind: "idle" });
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [normalizing, setNormalizing] = useState(false);
  const [captureDiagnostic, setCaptureDiagnostic] = useState<MobileCaptureDiagnostic>(EMPTY_CAPTURE_DIAGNOSTIC);
  const [signalClassification, setSignalClassification] = useState<PcmSignalClassification | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [preparedTake, setPreparedTake] = useState<PreparedTake | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadedRecording, setUploadedRecording] = useState<UploadedMobileRecording | null>(null);
  const [previewConfirmed, setPreviewConfirmed] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "idle" });
  const recorder = useRef<MobileAudioRecorder | null>(null);
  const [previewResource] = useState(() => new AudioObjectUrl());
  const previewElement = useRef<HTMLAudioElement | null>(null);
  const retainedPreviewElement = useRef<HTMLAudioElement | null>(null);
  const preparedTakeRef = useRef<PreparedTake | null>(null);
  const normalizationGeneration = useRef(0);
  const submissionGeneration = useRef(0);
  const releasePreviewAudio = useCallback(() => {
    releaseAudioElement(previewElement.current ?? retainedPreviewElement.current);
    retainedPreviewElement.current = null;
  }, []);

  useEffect(() => {
    preparedTakeRef.current = preparedTake;
  }, [preparedTake]);

  const clearPreparedTake = useCallback(() => {
    normalizationGeneration.current += 1;
    releasePreviewAudio();
    previewResource.clear();
    preparedTakeRef.current = null;
    setPreviewUrl(null);
    setPreparedTake(null);
    setUploadedRecording(null);
    setSignalClassification(null);
    setPreviewConfirmed(false);
    setSubmitState({ kind: "idle" });
  }, [previewResource, releasePreviewAudio]);

  useEffect(() => {
    let active = true;
    if (!isOnline) {
      return () => {
        active = false;
      };
    }

    void api.getScript(scriptId).then((result) => {
      if (!active) {
        return;
      }
      setScriptState(
        result.kind === "success"
          ? { kind: "ready", script: result.script }
          : { kind: "error", error: result }
      );
    });

    return () => {
      active = false;
    };
  }, [api, isOnline, scriptId, scriptReloadKey]);

  useEffect(() => {
    let mounted = true;
    const handleRecordingReady = async (recording: MobileRecordedAudio) => {
      const generation = ++normalizationGeneration.current;
      setElapsedSeconds(recording.durationSeconds);
      setNormalizing(true);
      setLocalError(null);

      try {
        const normalized = await normalizeBrowserAudioFileToPcmWav(recording.file);
        const bytes = await normalized.arrayBuffer();

        if (!mounted || generation !== normalizationGeneration.current) {
          return;
        }
        if (!isAzureCompatiblePcmWav(bytes)) {
          throw new Error("invalid_pcm_wav");
        }
        const format = inspectPcmWav(bytes);
        const signal = analyzePcm16WavSignal(bytes);
        if (!format || !signal) {
          throw new Error("invalid_pcm_wav");
        }
        setSignalClassification(signal.classification);
        if (signal.classification === "DIGITAL_SILENCE") {
          releasePreviewAudio();
          previewResource.clear();
          preparedTakeRef.current = null;
          setPreviewUrl(null);
          setPreparedTake(null);
          setUploadedRecording(null);
          setPreviewConfirmed(false);
          setSubmitState({ kind: "idle" });
          setLocalError("音声信号を検出できませんでした。マイクを確認して、もう一度録音してください。");
          return;
        }
        if (normalized.size > MOBILE_RECORDING_MAX_BYTES) {
          setLocalError("録音サイズが大きすぎます。短く録り直してください。");
          return;
        }

        const exactDurationSeconds = format.dataByteLength / format.byteRate;
        if (exactDurationSeconds > MOBILE_RECORDING_MAX_SECONDS) {
          setLocalError("録音が長すぎます。2分以内で録り直してください。");
          return;
        }
        const durationSeconds = Math.max(1, Math.round(exactDurationSeconds));

        const nextTake: PreparedTake = {
          file: normalized,
          durationSeconds,
          takeId: createStableMobileTakeId(),
          recordingRef: createStableMobileTakeId(),
          signalClassification: signal.classification
        };
        const url = previewResource.replace(normalized);
        preparedTakeRef.current = nextTake;
        setPreparedTake(nextTake);
        setPreviewUrl(url);
        setUploadedRecording(null);
        setPreviewConfirmed(false);
        setSubmitState({ kind: "idle" });
      } catch {
        if (mounted && generation === normalizationGeneration.current) {
          setLocalError("録音を評価用の音声に整えられませんでした。録り直して再試行してください。");
        }
      } finally {
        if (mounted && generation === normalizationGeneration.current) {
          setNormalizing(false);
        }
      }
    };

    const nextRecorder = new MobileAudioRecorder({
      maxSeconds: MOBILE_RECORDING_MAX_SECONDS,
      onStateChange: setRecorderState,
      onCaptureDiagnosticChange: setCaptureDiagnostic,
      onRecordingReady: (recording) => void handleRecordingReady(recording)
    });
    recorder.current = nextRecorder;

    const handleInactive = () => {
        normalizationGeneration.current += 1;
        setNormalizing(false);
        const activeState = nextRecorder.getState();
        if (activeState.kind === "recording" || activeState.kind === "requesting-permission" || activeState.kind === "stopping") {
          nextRecorder.cancel();
          setElapsedSeconds(0);
          setPreparedTake(null);
          preparedTakeRef.current = null;
          setUploadedRecording(null);
          setSignalClassification(null);
          setPreviewConfirmed(false);
          setSubmitState({ kind: "idle" });
        }
        setPreviewConfirmed(false);
        releasePreviewAudio();
        previewResource.clear();
        setPreviewUrl(null);
    };
    const handleActive = () => {
      if (preparedTakeRef.current && !previewResource.value) {
        setPreviewUrl(previewResource.replace(preparedTakeRef.current.file));
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        handleInactive();
      } else {
        handleActive();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    let lifecycleHandle: { remove(): Promise<void> } | null = null;
    let disposed = false;
    void addAppStateChangeListener((isActive) => {
      if (isActive) {
        handleActive();
      } else {
        handleInactive();
      }
    }).then((handle) => {
      if (disposed) {
        void handle.remove();
      } else {
        lifecycleHandle = handle;
      }
    }).catch(() => {
      // Browser fallback remains document.visibilitychange.
    });
    return () => {
      mounted = false;
      disposed = true;
      normalizationGeneration.current += 1;
      submissionGeneration.current += 1;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void lifecycleHandle?.remove();
      nextRecorder.dispose();
      if (recorder.current === nextRecorder) {
        recorder.current = null;
      }
      releasePreviewAudio();
      previewResource.clear();
    };
  }, [previewResource, releasePreviewAudio]);

  useEffect(() => {
    if (recorderState.kind !== "recording") {
      return;
    }
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - recorderState.startedAtMs) / 1_000)));
    }, 250);
    return () => window.clearInterval(timer);
  }, [recorderState]);

  async function startRecording() {
    if (scriptState.kind !== "ready") {
      return;
    }
    clearPreparedTake();
    setElapsedSeconds(0);
    setLocalError(null);
    recorder.current?.reset();
    await recorder.current?.start();
  }

  function cancelRecording() {
    recorder.current?.cancel();
    clearPreparedTake();
    setElapsedSeconds(0);
    setNormalizing(false);
    setLocalError(null);
  }

  async function submitTake() {
    const take = preparedTake;
    if (
      !take ||
      !canSubmitMobileTake(take, previewConfirmed) ||
      submitState.kind === "uploading" ||
      submitState.kind === "evaluating"
    ) {
      return;
    }
    if (!isOnline) {
      setSubmitState({ kind: "error", error: { kind: "offline" } });
      return;
    }

    const generation = ++submissionGeneration.current;
    let uploaded = uploadedRecording;

    if (!uploaded) {
      setSubmitState({ kind: "uploading" });
      const upload = await api.uploadRecording({
        scriptId,
        recordingRef: take.recordingRef,
        file: take.file,
        durationSeconds: take.durationSeconds
      });
      if (generation !== submissionGeneration.current) {
        return;
      }
      if (upload.kind !== "success") {
        setSubmitState({ kind: "error", error: upload });
        return;
      }
      uploaded = upload.recording;
      setUploadedRecording(uploaded);
    }

    setSubmitState({ kind: "evaluating" });
    const evaluation = await api.evaluateRecording(
      buildMobileEvaluationInput(scriptId, take, uploaded)
    );
    if (generation !== submissionGeneration.current) {
      return;
    }

    if (evaluation.kind === "success") {
      onNavigate({ name: "review", scriptId, takeId: evaluation.review.takeId });
      return;
    }

    if (evaluation.kind === "conflict") {
      const persisted = await api.getReview(scriptId, take.takeId);
      if (generation !== submissionGeneration.current) {
        return;
      }
      if (persisted.kind === "success") {
        onNavigate({ name: "review", scriptId, takeId: persisted.review.takeId });
        return;
      }
    }

    setSubmitState({ kind: "error", error: evaluation });
  }

  const busy = recorderState.kind === "requesting-permission" || recorderState.kind === "recording" || recorderState.kind === "stopping" || normalizing;
  const submitting = submitState.kind === "uploading" || submitState.kind === "evaluating";
  const shortPrompt = scriptState.kind === "ready" && preparedTake
    ? getShortRecordingPrompt(preparedTake.durationSeconds, scriptState.script.targetSeconds)
    : null;
  const visibleScriptState: ScriptState = isOnline
    ? scriptState
    : { kind: "error", error: { kind: "offline" } };

  return (
    <section className="intro-card practice-card" aria-live="polite">
      <ScreenHeading eyebrow="Record" title="今日のTakeを録る" detail="30〜60秒を目安に、語尾まで言い切ってください。" />

      {visibleScriptState.kind === "loading" ? <LoadingState label="台本を読み込んでいます…" /> : null}
      {visibleScriptState.kind === "error" ? <RequestError error={visibleScriptState.error} onRetry={() => {
        setScriptState({ kind: "loading" });
        setScriptReloadKey((value) => value + 1);
      }} /> : null}
      {visibleScriptState.kind === "ready" ? (
        <article className="script-reading-card compact-script">
          <div className="script-meta"><span>{visibleScriptState.script.locale}</span><span>{visibleScriptState.script.targetSeconds}秒</span></div>
          <h2>{visibleScriptState.script.title}</h2>
          <p>{visibleScriptState.script.content}</p>
        </article>
      ) : null}

      <div className={recorderState.kind === "recording" ? "recording-console is-recording" : "recording-console"}>
        <div className="recording-indicator" aria-hidden="true" />
        <span>{recorderState.kind === "recording" ? "Recording" : normalizing ? "Preparing" : "Ready"}</span>
        <strong>{formatSeconds(elapsedSeconds)}</strong>
        <small>最大 {formatSeconds(MOBILE_RECORDING_MAX_SECONDS)}</small>
      </div>

      {recorderState.kind === "error" ? <div className="auth-error" role="alert"><p>{RECORDER_ERROR_COPY[recorderState.reason]}</p></div> : null}
      {localError ? <div className="auth-error" role="alert"><p>{localError}</p></div> : null}
      {captureDiagnostic.audioTrackPresent || recorderState.kind === "error" || signalClassification ? (
        <div className="recording-warning" role="status">
          <p>Audio diagnostic</p>
          <p>audioTrackPresent: {captureDiagnostic.audioTrackPresent ? "yes" : "no"}</p>
          <p>audioTrackLive: {captureDiagnostic.audioTrackLive ? "yes" : "no"}</p>
          <p>audioTrackMuted: {captureDiagnostic.audioTrackMuted ? "yes" : "no"}</p>
          <p>signalClassification: {signalClassification ?? "PENDING"}</p>
        </div>
      ) : null}
      {signalClassification === "LOW_SIGNAL" ? <div className="recording-warning" role="status"><p>音声が小さめです。プレビューで声が聞こえることを確認してください。</p></div> : null}
      {shortPrompt ? <div className="recording-warning" role="status"><p>{shortPrompt}</p></div> : null}
      {submitState.kind === "error" ? <RequestError error={submitState.error} onRetry={() => void submitTake()} retryLabel="同じTakeで再試行" /> : null}

      {previewUrl && preparedTake ? (
        <div className="audio-card">
          <p className="eyebrow">Your take</p>
          <audio ref={(element) => {
            if (element) {
              previewElement.current = element;
              retainedPreviewElement.current = element;
            } else {
              previewElement.current = null;
            }
          }} controls preload="metadata" src={previewUrl} />
          <p>{formatSeconds(preparedTake.durationSeconds)} · {(preparedTake.file.size / 1024).toFixed(0)} KB · mono 16-bit / 16kHz WAV</p>
          <label>
            <input
              type="checkbox"
              checked={previewConfirmed}
              onChange={(event) => setPreviewConfirmed(event.currentTarget.checked)}
            />
            プレビューで自分の声が聞こえました
          </label>
        </div>
      ) : null}

      {recorderState.kind === "recording" ? (
        <div className="button-row">
          <button type="button" onClick={() => recorder.current?.stop()}>停止</button>
          <button type="button" className="danger-button" onClick={cancelRecording}>キャンセル</button>
        </div>
      ) : (
        <button type="button" onClick={() => void startRecording()} disabled={busy || submitting || visibleScriptState.kind !== "ready"}>
          {recorderState.kind === "requesting-permission" ? "マイクを準備中…" : normalizing ? "音声を整えています…" : preparedTake ? "録り直す" : "録音を開始"}
        </button>
      )}

      {preparedTake ? (
        <>
          <button type="button" onClick={() => void submitTake()} disabled={busy || submitting || !canSubmitMobileTake(preparedTake, previewConfirmed)}>
            {submitState.kind === "uploading" ? "録音を保存中…" : submitState.kind === "evaluating" ? "評価中…" : uploadedRecording ? "評価を再試行" : "このTakeを評価"}
          </button>
          <button type="button" className="text-button full-width-button" onClick={cancelRecording} disabled={submitting}>
            このTakeを削除
          </button>
        </>
      ) : null}
    </section>
  );
}
