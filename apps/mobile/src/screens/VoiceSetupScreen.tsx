import { useCallback, useEffect, useRef, useState } from "react";
import {
  MobileAudioRecorder,
  type MobileRecordedAudio,
  type MobileRecorderReason,
  type MobileRecorderState
} from "../audio/mobile-recorder";
import { AudioObjectUrl } from "../audio/object-url";
import { addAppStateChangeListener } from "../lib/app-lifecycle";
import type { MobileVoiceSetup, MobileVoiceSetupRequestState } from "../lib/api";
import type {
  PracticeApi,
  PracticeRequestFailure
} from "../practice/api";
import type { PracticeRoute } from "../practice/routes";
import { LoadingState, RequestError, ScreenHeading } from "./ScreenParts";

const MIN_SAMPLE_SECONDS = 10;
const MAX_SAMPLE_SECONDS = 45;

const RECORDER_ERROR_COPY: Record<MobileRecorderReason, string> = {
  unsupported: "この端末では声の録音を開始できません。iOSとアプリを更新して再試行してください。",
  permission_denied: "マイクの使用が許可されていません。iPhoneの設定でNative Minuteのマイクを許可してください。",
  device_unavailable: "マイクを利用できません。ほかの録音アプリを閉じて再試行してください。",
  capture_unavailable: "マイクの音声を取得できませんでした。マイク設定を確認して録り直してください。",
  empty_recording: "声の録音を保存できませんでした。マイクに向かって録り直してください。",
  recording_too_large: "声の録音サイズが大きすぎます。短く録り直してください。",
  recording_failed: "声の録音を完了できませんでした。少し待ってから録り直してください。"
};

type SetupState =
  | { kind: "loading" }
  | { kind: "ready"; setup: MobileVoiceSetup }
  | { kind: "error"; error: PracticeRequestFailure };

type ActionState =
  | { kind: "idle" }
  | { kind: "saving_consent" }
  | { kind: "creating_voice" }
  | { kind: "error"; error: PracticeRequestFailure };

function releaseAudioElement(element: HTMLAudioElement | null) {
  if (!element) {
    return;
  }

  try {
    element.pause();
    element.removeAttribute("src");
    element.load();
  } catch {
    // Preview cleanup is a local privacy boundary and must not interrupt recovery.
  }
}

function toSetupState(result: MobileVoiceSetupRequestState): SetupState {
  return result.kind === "success"
    ? { kind: "ready", setup: result }
    : { kind: "error", error: result };
}

export function VoiceSetupScreen({
  api,
  scriptId,
  isOnline,
  onNavigate
}: {
  api: PracticeApi;
  scriptId?: string;
  isOnline: boolean;
  onNavigate: (route: PracticeRoute) => void;
}) {
  const [setupState, setSetupState] = useState<SetupState>({ kind: "loading" });
  const [setupReloadKey, setSetupReloadKey] = useState(0);
  const [actionState, setActionState] = useState<ActionState>({ kind: "idle" });
  const [accepted, setAccepted] = useState(false);
  const [recorderState, setRecorderState] = useState<MobileRecorderState>({ kind: "idle" });
  const [sample, setSample] = useState<File | null>(null);
  const [sampleSeconds, setSampleSeconds] = useState(0);
  const [previewConfirmed, setPreviewConfirmed] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const recorder = useRef<MobileAudioRecorder | null>(null);
  const previewElement = useRef<HTMLAudioElement | null>(null);
  const retainedPreviewElement = useRef<HTMLAudioElement | null>(null);
  const [previewResource] = useState(() => new AudioObjectUrl());

  const releasePreview = useCallback(() => {
    releaseAudioElement(previewElement.current ?? retainedPreviewElement.current);
    retainedPreviewElement.current = null;
    previewResource.clear();
    setPreviewUrl(null);
  }, [previewResource]);

  const loadSetup = useCallback(() => {
    setSetupState({ kind: "loading" });
    setSetupReloadKey((value) => value + 1);
  }, []);

  useEffect(() => {
    let active = true;

    if (!isOnline) {
      void Promise.resolve().then(() => {
        if (active) {
          setSetupState({ kind: "error", error: { kind: "offline" } });
        }
      });
      return () => {
        active = false;
      };
    }

    void api.getVoiceSetup().then((result) => {
      if (active) {
        setSetupState(toSetupState(result));
      }
    });

    return () => {
      active = false;
    };
  }, [api, isOnline, setupReloadKey]);

  useEffect(() => {
    const nextRecorder = new MobileAudioRecorder({
      maxSeconds: MAX_SAMPLE_SECONDS,
      onStateChange: setRecorderState,
      onRecordingReady: (recording: MobileRecordedAudio) => {
        if (recording.durationSeconds < MIN_SAMPLE_SECONDS) {
          setLocalError(`声の録音は${MIN_SAMPLE_SECONDS}秒以上にしてください。もう一度録音します。`);
          return;
        }

        releasePreview();
        setSample(recording.file);
        setSampleSeconds(recording.durationSeconds);
        setPreviewConfirmed(false);
        setLocalError(null);
        setPreviewUrl(previewResource.replace(recording.file));
      }
    });
    recorder.current = nextRecorder;

    const cancelForBackground = () => {
      nextRecorder.cancel();
      setPreviewConfirmed(false);
      releasePreview();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        cancelForBackground();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    let lifecycleHandle: { remove(): Promise<void> } | null = null;
    let disposed = false;
    void addAppStateChangeListener((isActive) => {
      if (!isActive) {
        cancelForBackground();
      }
    }).then((handle) => {
      if (disposed) {
        void handle.remove();
      } else {
        lifecycleHandle = handle;
      }
    }).catch(() => {
      // Browser visibility handling remains the fallback.
    });

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void lifecycleHandle?.remove();
      nextRecorder.dispose();
      if (recorder.current === nextRecorder) {
        recorder.current = null;
      }
      releasePreview();
    };
  }, [previewResource, releasePreview]);

  function clearSample() {
    recorder.current?.cancel();
    releasePreview();
    setSample(null);
    setSampleSeconds(0);
    setPreviewConfirmed(false);
    setLocalError(null);
  }

  async function startRecording() {
    if (!isOnline || actionState.kind === "creating_voice") {
      return;
    }

    clearSample();
    await recorder.current?.start();
  }

  function stopRecording() {
    recorder.current?.stop();
  }

  async function saveConsent() {
    if (!accepted || !isOnline || actionState.kind === "saving_consent") {
      return;
    }

    setActionState({ kind: "saving_consent" });
    const result = await api.acceptVoiceConsent();
    setSetupState(toSetupState(result));
    setActionState(result.kind === "success" ? { kind: "idle" } : { kind: "error", error: result });
  }

  async function createVoice() {
    if (!sample || !previewConfirmed || !isOnline || actionState.kind === "creating_voice") {
      return;
    }

    setActionState({ kind: "creating_voice" });
    const result = await api.createVoiceFromSample(sample);
    setSetupState(toSetupState(result));

    if (result.kind !== "success") {
      setActionState({ kind: "error", error: result });
      return;
    }

    setActionState({ kind: "idle" });
    clearSample();
  }

  const setup = setupState.kind === "ready" ? setupState.setup : null;
  const recorderError = recorderState.kind === "error" ? RECORDER_ERROR_COPY[recorderState.reason] : null;

  return (
    <section className="intro-card practice-card" aria-live="polite">
      <ScreenHeading
        eyebrow="Voice setup"
        title="お手本ボイスを準備"
        detail="同意したうえで自分の短い声を録音すると、このアカウントだけのお手本ボイスを作れます。"
      />

      {setupState.kind === "loading" ? <LoadingState label="voice の準備状況を確認しています…" /> : null}
      {setupState.kind === "error" ? <RequestError error={setupState.error} onRetry={loadSetup} /> : null}

      {setup?.status === "ready" ? (
        <div className="auth-notice" role="status">
          <strong>お手本ボイスの準備ができました</strong>
          <p>保存済みの voice を使って、見本音声を準備できます。</p>
        </div>
      ) : null}

      {setup?.status === "consent_required" ? (
        <div className="voice-setup-step">
          <label className="voice-consent-check">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(event) => setAccepted(event.target.checked)}
              disabled={actionState.kind === "saving_consent"}
            />
            <span>自分の声をお手本ボイス作成に使うことに同意します。保存済みの練習録音を自動利用することはありません。</span>
          </label>
          <button type="button" disabled={!accepted || actionState.kind === "saving_consent"} onClick={() => void saveConsent()}>
            {actionState.kind === "saving_consent" ? "同意を保存中…" : "同意して次へ"}
          </button>
        </div>
      ) : null}

      {setup?.status === "sample_required" ? (
        <div className="voice-setup-step">
          <p className="scope-note">10〜45秒ほど、普段の英語練習に近い声で話してください。録音は送信前に確認できます。</p>
          {recorderState.kind === "recording" ? (
            <button type="button" className="danger-button" onClick={stopRecording}>録音を止める</button>
          ) : (
            <button type="button" disabled={actionState.kind === "creating_voice"} onClick={() => void startRecording()}>
              声を録音する
            </button>
          )}
          {recorderState.kind === "requesting-permission" || recorderState.kind === "stopping" ? (
            <LoadingState label={recorderState.kind === "stopping" ? "録音を保存しています…" : "マイクを準備しています…"} />
          ) : null}
          {recorderError ? <div className="auth-error" role="alert">{recorderError}</div> : null}
          {localError ? <div className="auth-error" role="alert">{localError}</div> : null}
          {sample && previewUrl ? (
            <div className="audio-card">
              <p>{sampleSeconds}秒の声を録音しました。再生して自分の声か確認してください。</p>
              <audio
                controls
                preload="metadata"
                src={previewUrl}
                ref={(element) => {
                  if (element) {
                    previewElement.current = element;
                    retainedPreviewElement.current = element;
                  } else {
                    previewElement.current = null;
                  }
                }}
              />
              <label className="voice-consent-check">
                <input type="checkbox" checked={previewConfirmed} onChange={(event) => setPreviewConfirmed(event.target.checked)} />
                <span>再生して、自分の声であることを確認しました。</span>
              </label>
              <button type="button" className="secondary-button" onClick={clearSample}>録音し直す</button>
              <button type="button" disabled={!previewConfirmed || actionState.kind === "creating_voice"} onClick={() => void createVoice()}>
                {actionState.kind === "creating_voice" ? "お手本ボイスを作成中…" : "この声でお手本ボイスを作る"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {actionState.kind === "error" ? <RequestError error={actionState.error} onRetry={loadSetup} /> : null}

      {setup?.status === "ready" ? (
        <button type="button" onClick={() => onNavigate(scriptId ? { name: "listen", scriptId } : { name: "scripts" })}>
          {scriptId ? "見本音声へ戻る" : "台本一覧へ戻る"}
        </button>
      ) : (
        <button type="button" className="secondary-button" onClick={() => onNavigate(scriptId ? { name: "listen", scriptId } : { name: "scripts" })}>
          あとで設定する
        </button>
      )}
    </section>
  );
}
