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

type PronunciationConsentState =
  | { kind: "loading" }
  | { kind: "ready"; status: "accepted" | "required" | "withdrawn" }
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

// This presentation is only for transient evaluation failures with an upload
// still retained by this mounted screen. Conflict recovery stays in submitTake.
export function canRetryUploadedMobileEvaluation(
  error: PracticeRequestFailure,
  hasUploadedRecording: boolean
) {
  return hasUploadedRecording && (
    error.kind === "server-error" ||
    error.kind === "timeout" ||
    error.kind === "network-error" ||
    error.kind === "rate-limited" ||
    error.kind === "invalid-response"
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
  const [pronunciationConsentState, setPronunciationConsentState] = useState<PronunciationConsentState>({ kind: "loading" });
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
    let active = true;

    if (!isOnline) {
      void Promise.resolve().then(() => {
        if (active) {
          setPronunciationConsentState({ kind: "error", error: { kind: "offline" } });
        }
      });
      return () => {
        active = false;
      };
    }

    void Promise.resolve().then(() => {
      if (!active) {
        return;
      }

      setPronunciationConsentState({ kind: "loading" });
      return api.getPronunciationConsent().then((result) => {
        if (!active) {
          return;
        }

        setPronunciationConsentState(
          result.kind === "success"
            ? { kind: "ready", status: result.status }
            : { kind: "error", error: result }
        );
      });
    });

    return () => {
      active = false;
    };
  }, [api, isOnline]);

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
    if (scriptState.kind !== "ready" || pronunciationConsentState.kind !== "ready" || pronunciationConsentState.status !== "accepted") {
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
      submitState.kind === "evaluating" ||
      pronunciationConsentState.kind !== "ready" ||
      pronunciationConsentState.status !== "accepted"
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

  async function acceptPronunciationConsent() {
    if (!isOnline || pronunciationConsentState.kind === "loading") {
      return;
    }

    setPronunciationConsentState({ kind: "loading" });
    const result = await api.acceptPronunciationConsent();
    setPronunciationConsentState(
      result.kind === "success"
        ? { kind: "ready", status: result.status }
        : { kind: "error", error: result }
    );
  }

  const busy = recorderState.kind === "requesting-permission" || recorderState.kind === "recording" || recorderState.kind === "stopping" || normalizing;
  const submitting = submitState.kind === "uploading" || submitState.kind === "evaluating";
  const shortPrompt = scriptState.kind === "ready" && preparedTake
    ? getShortRecordingPrompt(preparedTake.durationSeconds, scriptState.script.targetSeconds)
    : null;
  const visibleScriptState: ScriptState = isOnline
    ? scriptState
    : { kind: "error", error: { kind: "offline" } };
  const pronunciationConsentAccepted = pronunciationConsentState.kind === "ready" && pronunciationConsentState.status === "accepted";

  const evaluationRetry = Boolean(preparedTake) && submitState.kind === "error" &&
    canRetryUploadedMobileEvaluation(submitState.error, Boolean(uploadedRecording));
  const scriptIsLong = visibleScriptState.kind === "ready" &&
    visibleScriptState.script.content.trim().split(/\s+/).length > 150;

  return (
    <section className="record-screen" lang="ja" aria-label="Record">
      <ScreenHeading title="Record" />

      <div className="record-script-scroll" role="region" aria-label="録音用の台本" tabIndex={0}>
        {visibleScriptState.kind === "loading" ? <LoadingState label="台本を読み込んでいます…" /> : null}
        {visibleScriptState.kind === "error" ? <RequestError error={visibleScriptState.error} onRetry={() => {
          setScriptState({ kind: "loading" });
          setScriptReloadKey((value) => value + 1);
        }} /> : null}
        {pronunciationConsentState.kind === "ready" && pronunciationConsentState.status !== "accepted" ? (
          <div className="record-consent" id="record-consent-description" data-testid="mobile-pronunciation-consent">
            <p>録音した音声を、文字起こし、発音評価、日本語フィードバック生成のために処理します。</p>
            <p>録音した音声は、文字起こしと発音評価のため OpenAI と Azure で処理されます。</p>
            {pronunciationConsentState.status === "withdrawn" ? <p>同意は撤回済みです。録音と新しい評価を再開するには、もう一度同意してください。</p> : null}
          </div>
        ) : null}
        {pronunciationConsentAccepted && shortPrompt ? <p className="record-body-notice">{shortPrompt}</p> : null}
        {pronunciationConsentAccepted && submitState.kind === "error" && !evaluationRetry ? <div className="record-body-notice"><RequestError error={submitState.error} /></div> : null}
        {pronunciationConsentAccepted && (captureDiagnostic.audioTrackPresent || recorderState.kind === "error" || signalClassification) ? (
          <details className="record-details">
            <summary>録音の詳細</summary>
            <p>audioTrackPresent: {captureDiagnostic.audioTrackPresent ? "yes" : "no"}</p>
            <p>audioTrackLive: {captureDiagnostic.audioTrackLive ? "yes" : "no"}</p>
            <p>audioTrackMuted: {captureDiagnostic.audioTrackMuted ? "yes" : "no"}</p>
            <p>signalClassification: {signalClassification ?? "PENDING"}</p>
            {preparedTake ? (
              <>
                <p>{(preparedTake.file.size / 1024).toFixed(0)} KB · mono 16-bit / 16kHz WAV</p>
                <button type="button" className="record-text-action record-discard" onClick={cancelRecording} disabled={submitting}>このTakeを破棄</button>
              </>
            ) : null}
          </details>
        ) : null}
        {evaluationRetry && submitState.kind === "error" ? (
          <details className="record-details">
            <summary>エラーの詳細</summary>
            <RequestError error={submitState.error} />
          </details>
        ) : null}
        {visibleScriptState.kind === "ready" ? (
          <article className="record-script">
            <h2 lang={visibleScriptState.script.locale}>{visibleScriptState.script.title}</h2>
            <div className="record-script-meta"><span>目標 {visibleScriptState.script.targetSeconds}秒</span><span>{visibleScriptState.script.locale}</span></div>
            {scriptIsLong ? <p className="record-length-note">目標時間には長めの可能性があります。</p> : null}
            <p className="record-script-text" lang={visibleScriptState.script.locale}>{visibleScriptState.script.content}</p>
          </article>
        ) : null}
      </div>

      <div className="record-control-dock" role="region" aria-label="録音の操作">
        {pronunciationConsentState.kind === "loading" ? <LoadingState label="録音と発音評価への同意を確認しています…" /> : null}
        {pronunciationConsentState.kind === "error" ? <RequestError error={pronunciationConsentState.error} onRetry={() => {
          setPronunciationConsentState({ kind: "loading" });
          void api.getPronunciationConsent().then((result) => {
            setPronunciationConsentState(result.kind === "success" ? { kind: "ready", status: result.status } : { kind: "error", error: result });
          });
        }} /> : null}
        {pronunciationConsentState.kind === "ready" && pronunciationConsentState.status !== "accepted" ? (
          <div className="record-consent-actions">
            <button type="button" className="record-primary" aria-describedby="record-consent-description" onClick={() => void acceptPronunciationConsent()}>同意して録音へ進む</button>
            <button type="button" className="record-text-action" onClick={() => onNavigate({ name: "listen", scriptId })}>同意しない</button>
          </div>
        ) : null}

        {pronunciationConsentAccepted ? (
          <>
            {recorderState.kind === "error" ? <div className="auth-error" role="alert"><p>{RECORDER_ERROR_COPY[recorderState.reason]}</p></div> : null}
            {localError ? <div className="auth-error" role="alert"><p>{localError}</p></div> : null}
            {signalClassification === "LOW_SIGNAL" ? <p className="record-notice" role="status">音声が小さめです。</p> : null}
            {shortPrompt ? <p className="record-notice" role="status">短めの録音です。録り直しをおすすめします。</p> : null}
            {submitState.kind === "error" ? (
              evaluationRetry ? (
                <div className="record-retry-message" role="alert">
                  <p className="record-error-title">評価を完了できませんでした</p>
                  <p>この画面の録音です。</p>
                </div>
              ) : (
                <p className="record-error-title" role="alert">{!uploadedRecording ? "録音の送信を完了できませんでした" : submitState.error.kind === "conflict" && submitState.error.reasonCode === "evaluation_in_progress" ? "同じTakeを評価中です" : "評価を完了できませんでした"}</p>
              )
            ) : null}

            {previewUrl && preparedTake ? (
              <div className="record-preview">
                <div className="record-preview-heading"><strong>自分の録音</strong><span>{formatSeconds(preparedTake.durationSeconds)}</span></div>
                <audio ref={(element) => {
                  if (element) {
                    previewElement.current = element;
                    retainedPreviewElement.current = element;
                  } else {
                    previewElement.current = null;
                  }
                }} aria-label="自分の録音を再生" controls preload="metadata" src={previewUrl} />
                {!evaluationRetry ? <p id="record-preview-help">再生して、自分の声を確認してください。</p> : null}
                <label className="record-confirmation">
                  <input
                    type="checkbox"
                    checked={previewConfirmed}
                    aria-describedby={evaluationRetry ? undefined : "record-preview-help"}
                    onChange={(event) => setPreviewConfirmed(event.currentTarget.checked)}
                  />
                  <span>録音を確認した</span>
                </label>
              </div>
            ) : null}

            {recorderState.kind === "recording" ? (
              <>
                <div className="record-status">
                  <strong role="status"><span className="record-dot" aria-hidden="true" />録音中</strong>
                  <span className="record-clock" aria-live="off">{formatSeconds(elapsedSeconds)} <span> / 最大 {formatSeconds(MOBILE_RECORDING_MAX_SECONDS)}</span></span>
                </div>
                <button type="button" className="record-primary" onClick={() => recorder.current?.stop()}><span className="record-stop-icon" aria-hidden="true" />停止</button>
                <button type="button" className="record-text-action" onClick={cancelRecording}>キャンセル</button>
              </>
            ) : preparedTake ? (
              <>
                <button type="button" className="record-primary" aria-label={submitState.kind === "uploading" ? "録音を保存中…" : submitState.kind === "evaluating" ? "評価中…" : evaluationRetry ? "同じ録音で評価を再試行" : "この録音で評価する"} onClick={() => void submitTake()} disabled={busy || submitting || !canSubmitMobileTake(preparedTake, previewConfirmed)}>
                  {submitState.kind === "uploading" ? "録音を保存中…" : submitState.kind === "evaluating" ? "評価中…" : evaluationRetry ? <span><span className="record-action-phrase">同じ録音で</span><span className="record-action-phrase">評価を再試行</span></span> : <span><span className="record-action-phrase">この録音で</span><span className="record-action-phrase">評価する</span></span>}
                </button>
                <button type="button" className="record-text-action" onClick={() => void startRecording()} disabled={busy || submitting || visibleScriptState.kind !== "ready"}>録り直す</button>
              </>
            ) : (
              <button type="button" className="record-primary" onClick={() => void startRecording()} disabled={busy || submitting || visibleScriptState.kind !== "ready"}>
                {recorderState.kind === "requesting-permission" ? "マイクを準備中…" : recorderState.kind === "stopping" ? "録音を停止中…" : normalizing ? "音声を整えています…" : "録音する"}
              </button>
            )}
            <span className="record-sr-status" role="status">{submitState.kind === "uploading" ? "録音を保存中…" : submitState.kind === "evaluating" ? "評価中…" : recorderState.kind === "requesting-permission" ? "マイクを準備中…" : recorderState.kind === "stopping" ? "録音を停止中…" : normalizing ? "音声を整えています…" : ""}</span>
          </>
        ) : null}
      </div>
    </section>
  );
}
