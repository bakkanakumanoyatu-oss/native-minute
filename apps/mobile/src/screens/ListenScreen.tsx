import { useCallback, useEffect, useRef, useState } from "react";
import { AudioObjectUrl } from "../audio/object-url";
import { addAppStateChangeListener } from "../lib/app-lifecycle";
import type { PracticeApi, MobileScript, PracticeRequestFailure } from "../practice/api";
import type { PracticeRoute } from "../practice/routes";
import { LoadingState, RequestError, ScreenHeading, formatSeconds } from "./ScreenParts";

type ScriptState =
  | { kind: "loading" }
  | { kind: "ready"; script: MobileScript }
  | { kind: "error"; error: PracticeRequestFailure };

type ListenState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; url: string; cached: boolean }
  | { kind: "error"; error: PracticeRequestFailure };

export function getListenPrepareButtonLabel(
  state: ListenState["kind"],
  hasPreparedReferenceAudio: boolean
) {
  if (state === "loading") {
    return "お手本を準備中…";
  }

  if (state === "ready") {
    return null;
  }

  return hasPreparedReferenceAudio ? "再準備する" : "お手本を準備する";
}

export function formatListenMediaTime(seconds: number) {
  return Number.isFinite(seconds) && seconds >= 0 ? formatSeconds(seconds) : "—:—";
}

const EMPTY_PLAYBACK = { playing: false, waiting: false, currentTime: 0, duration: NaN };

function releaseAudioElement(element: HTMLAudioElement | null) {
  if (!element) {
    return;
  }

  try {
    element.pause();
    element.removeAttribute("src");
    element.load();
  } catch {
    // Releasing playback must not block navigation or background recovery.
  }
}

export function ListenScreen({
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
  const [listenState, setListenState] = useState<ListenState>({ kind: "idle" });
  const [hasPreparedReferenceAudio, setHasPreparedReferenceAudio] = useState(false);
  const [playback, setPlayback] = useState(EMPTY_PLAYBACK);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [objectUrl] = useState(() => new AudioObjectUrl());
  const audioElement = useRef<HTMLAudioElement | null>(null);
  const retainedAudioElement = useRef<HTMLAudioElement | null>(null);
  const operationGeneration = useRef(0);
  const operationInFlight = useRef(false);
  const playbackRequest = useRef(0);
  const releaseCurrentAudio = useCallback(() => {
    playbackRequest.current += 1;
    releaseAudioElement(audioElement.current ?? retainedAudioElement.current);
    retainedAudioElement.current = null;
    setPlayback(EMPTY_PLAYBACK);
    setPlaybackError(null);
  }, []);

  const reloadScript = useCallback(() => {
    setScriptState({ kind: "loading" });
    setReloadKey((value) => value + 1);
  }, []);

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
  }, [api, isOnline, reloadKey, scriptId]);

  useEffect(() => {
    const releaseAudio = () => {
      operationGeneration.current += 1;
      releaseCurrentAudio();
      objectUrl.clear();
      setListenState(operationInFlight.current ? { kind: "loading" } : { kind: "idle" });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        releaseAudio();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    let lifecycleHandle: { remove(): Promise<void> } | null = null;
    let disposed = false;
    void addAppStateChangeListener((isActive) => {
      if (!isActive) {
        releaseAudio();
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
      disposed = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void lifecycleHandle?.remove();
      operationGeneration.current += 1;
      releaseCurrentAudio();
      objectUrl.clear();
    };
  }, [objectUrl, releaseCurrentAudio]);

  async function prepareAudio() {
    if (!isOnline) {
      setListenState({ kind: "error", error: { kind: "offline" } });
      return;
    }

    if (operationInFlight.current) {
      return;
    }

    operationInFlight.current = true;
    const generation = ++operationGeneration.current;
    releaseCurrentAudio();
    objectUrl.clear();
    setListenState({ kind: "loading" });

    const requested = await api.requestListen(scriptId);
    if (generation !== operationGeneration.current) {
      operationInFlight.current = false;
      setListenState({ kind: "idle" });
      return;
    }
    if (requested.kind !== "success") {
      operationInFlight.current = false;
      setListenState({ kind: "error", error: requested });
      return;
    }

    const downloaded = await api.downloadAudio(requested.audioId);
    if (generation !== operationGeneration.current) {
      operationInFlight.current = false;
      setListenState({ kind: "idle" });
      return;
    }
    if (downloaded.kind !== "success") {
      operationInFlight.current = false;
      setListenState({ kind: "error", error: downloaded });
      return;
    }

    const url = objectUrl.replace(downloaded.audio);
    if (!url) {
      operationInFlight.current = false;
      setListenState({ kind: "error", error: { kind: "invalid-response" } });
      return;
    }
    operationInFlight.current = false;
    setHasPreparedReferenceAudio(true);
    setListenState({ kind: "ready", url, cached: requested.cached });
  }

  function syncPlayback(element: HTMLAudioElement, waiting = false) {
    if (element !== audioElement.current || !objectUrl.value) {
      return;
    }
    setPlayback({
      playing: !element.paused && !element.ended,
      waiting,
      currentTime: element.currentTime,
      duration: element.duration
    });
  }

  async function togglePlayback() {
    const element = audioElement.current;
    if (!element || listenState.kind !== "ready") {
      return;
    }
    const request = ++playbackRequest.current;
    setPlaybackError(null);
    if (!element.paused) {
      element.pause();
      return;
    }
    try {
      await element.play();
    } catch {
      if (request === playbackRequest.current && element === audioElement.current && objectUrl.value) {
        syncPlayback(element);
        setPlaybackError("再生を開始できませんでした。もう一度、再生してください。");
      }
    }
  }

  function handlePlaybackError(element: HTMLAudioElement) {
    if (element !== audioElement.current || !objectUrl.value) {
      return;
    }
    releaseCurrentAudio();
    objectUrl.clear();
    setListenState({ kind: "idle" });
    setPlaybackError("お手本音声を再生できませんでした。再準備してお試しください。");
  }

  const visibleScriptState: ScriptState = isOnline
    ? scriptState
    : { kind: "error", error: { kind: "offline" } };
  const voiceSetupRequired = listenState.kind === "error" &&
    listenState.error.kind === "conflict" && listenState.error.reasonCode === "voice_setup_required";
  const prepareLabel = getListenPrepareButtonLabel(listenState.kind, hasPreparedReferenceAudio);
  const scriptIsLong = visibleScriptState.kind === "ready" &&
    visibleScriptState.script.content.trim().split(/\s+/).length > 150;

  return (
    <section className="listen-screen" lang="ja" aria-label="Listen">
      <ScreenHeading title="Listen" />

      <div className="listen-script-scroll" role="region" aria-label="お手本の台本" tabIndex={0}>
        {visibleScriptState.kind === "loading" ? <LoadingState label="台本を読み込んでいます…" /> : null}
        {visibleScriptState.kind === "error" ? <RequestError error={visibleScriptState.error} onRetry={reloadScript} /> : null}
        {visibleScriptState.kind === "ready" ? (
          <article className="listen-script">
            <h2 lang={visibleScriptState.script.locale}>{visibleScriptState.script.title}</h2>
            <div className="listen-script-meta"><span>目標 {visibleScriptState.script.targetSeconds}秒</span><span>{visibleScriptState.script.locale}</span></div>
            {scriptIsLong ? <p className="listen-length-note">目標時間には長めの可能性があります。</p> : null}
            <p className="listen-script-text" lang={visibleScriptState.script.locale}>{visibleScriptState.script.content}</p>
          </article>
        ) : null}
      </div>

      <div className="listen-control-dock" role="region" aria-label="お手本音声と録音への操作">
        {voiceSetupRequired ? (
          <div className="listen-notice" role="status">
            <strong>お手本ボイスの準備が必要です</strong>
            <p>同意と短い声の録音を完了すると、この台本のお手本を準備できます。</p>
          </div>
        ) : null}
        {listenState.kind === "error" && !voiceSetupRequired ? <RequestError error={listenState.error} /> : null}
        {playbackError ? <p className="listen-playback-error" role="alert">{playbackError}</p> : null}
        {listenState.kind === "idle" && hasPreparedReferenceAudio ? <p className="listen-notice" role="status">保存済みのお手本を再準備</p> : null}
        {listenState.kind === "loading" ? <span className="listen-sr-status" role="status">お手本を準備中…</span> : null}

        {listenState.kind === "ready" ? (
          <>
            <audio ref={(element) => {
              if (element) {
                audioElement.current = element;
                retainedAudioElement.current = element;
              } else {
                audioElement.current = null;
              }
            }} preload="metadata" src={listenState.url}
              onLoadedMetadata={(event) => syncPlayback(event.currentTarget)}
              onDurationChange={(event) => syncPlayback(event.currentTarget)}
              onTimeUpdate={(event) => syncPlayback(event.currentTarget)}
              onPlay={(event) => syncPlayback(event.currentTarget)}
              onPlaying={(event) => syncPlayback(event.currentTarget)}
              onPause={(event) => syncPlayback(event.currentTarget)}
              onEnded={(event) => syncPlayback(event.currentTarget)}
              onWaiting={(event) => syncPlayback(event.currentTarget, true)}
              onCanPlay={(event) => syncPlayback(event.currentTarget)}
              onError={(event) => handlePlaybackError(event.currentTarget)}
            />
            <div className="listen-player">
              <div className="listen-audio-info">
                <strong>お手本音声</strong>
                <span className="listen-audio-time" aria-live="off">{formatListenMediaTime(playback.currentTime)} / {formatListenMediaTime(playback.duration)}</span>
              </div>
              <button type="button" className="listen-play" aria-label={playback.playing ? "お手本音声を一時停止" : "お手本音声を再生"} onClick={() => void togglePlayback()}>
                <span className={playback.playing ? "listen-pause-icon" : "listen-play-icon"} aria-hidden="true" />
                <span>{playback.playing ? "一時停止" : "再生"}</span>
              </button>
              <span className="listen-sr-status" role="status">{playback.waiting ? "音声の読み込みを待っています…" : playback.playing ? "再生中" : "再生できます"}</span>
            </div>
          </>
        ) : null}

        {voiceSetupRequired ? (
          <button type="button" className="listen-primary" onClick={() => onNavigate({ name: "voice_setup", scriptId })}>お手本ボイスを準備する</button>
        ) : prepareLabel ? (
          <button type="button" className="listen-primary" onClick={() => void prepareAudio()} disabled={listenState.kind === "loading" || visibleScriptState.kind !== "ready"}>
            {prepareLabel}
          </button>
        ) : null}
        <button type="button" className={listenState.kind === "ready" ? "listen-primary" : "listen-text-action"} disabled={visibleScriptState.kind !== "ready"} onClick={() => onNavigate({ name: "record", scriptId })}>
          録音へ進む
        </button>
      </div>
    </section>
  );
}
