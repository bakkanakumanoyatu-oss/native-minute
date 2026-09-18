import { useCallback, useEffect, useRef, useState } from "react";
import { PLAYBACK_RATE_OPTIONS, type PlaybackRate } from "../../../../lib/audio-playback-rate";
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
  | { kind: "ready" }
  | { kind: "error"; error: PracticeRequestFailure };

export function getListenPrepareButtonLabel(
  state: ListenState["kind"],
  hasPreparedReferenceAudio: boolean
) {
  if (hasPreparedReferenceAudio) return null;
  if (state === "loading") {
    return "お手本を準備中…";
  }

  if (state === "ready") {
    return null;
  }

  return "お手本を準備する";
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

type ListenScreenProps = {
  api: PracticeApi;
  scriptId: string;
  isOnline: boolean;
  onNavigate: (route: PracticeRoute) => void;
};

export function ListenScreen(props: ListenScreenProps) {
  const [scope, setScope] = useState({ api: props.api, scriptId: props.scriptId, generation: 0 });
  if (scope.api !== props.api || scope.scriptId !== props.scriptId) {
    setScope({ api: props.api, scriptId: props.scriptId, generation: scope.generation + 1 });
  }
  return <ListenSession key={scope.generation} {...props} />;
}

function ListenSession({ api, scriptId, isOnline, onNavigate }: ListenScreenProps) {
  const [scriptState, setScriptState] = useState<ScriptState>({ kind: "loading" });
  const [listenState, setListenState] = useState<ListenState>({ kind: "idle" });
  const [hasPreparedReferenceAudio, setHasPreparedReferenceAudio] = useState(false);
  const [audioUnavailable, setAudioUnavailable] = useState(false);
  const [playback, setPlayback] = useState(EMPTY_PLAYBACK);
  const [rate, setRate] = useState<PlaybackRate>(1);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [objectUrl] = useState(() => new AudioObjectUrl());
  const audioElement = useRef<HTMLAudioElement | null>(null);
  const retainedAudioElement = useRef<HTMLAudioElement | null>(null);
  const attachAudio = useCallback((element: HTMLAudioElement | null) => {
    audioElement.current = element;
    if (element) retainedAudioElement.current = element;
  }, []);
  // Memory only, scoped to this mounted session/script. No persistent audio cache.
  const reference = useRef<{ audioId: string; position: number; rate: PlaybackRate; releasedAt: number | null } | null>(null);
  const operationGeneration = useRef(0);
  const operationInFlight = useRef<number | null>(null);
  const playbackInFlight = useRef<number | null>(null);
  const playbackRequest = useRef(0);
  const inactive = useRef(false);
  const restorePosition = useRef(false);

  const releaseCurrentAudio = useCallback(() => {
    playbackRequest.current += 1;
    playbackInFlight.current = null;
    restorePosition.current = false;
    // Clear URL first so cleanup media events cannot overwrite retained time.
    objectUrl.clear();
    releaseAudioElement(audioElement.current ?? retainedAudioElement.current);
    setPlayback((value) => ({ ...value, playing: false, waiting: false }));
  }, [objectUrl]);

  const reloadScript = useCallback(() => {
    setScriptState({ kind: "loading" });
    setReloadKey((value) => value + 1);
  }, []);

  useEffect(() => {
    let active = true;
    if (isOnline) {
      void api.getScript(scriptId).then((result) => {
        if (active) setScriptState(result.kind === "success"
          ? { kind: "ready", script: result.script } : { kind: "error", error: result });
      });
    }
    return () => { active = false; };
  }, [api, isOnline, reloadKey, scriptId]);

  useEffect(() => {
    inactive.current = document.visibilityState === "hidden";
    const suspend = () => {
      inactive.current = true;
      const saved = reference.current;
      const element = audioElement.current;
      // Native + document notifications may both arrive. Snapshot only once.
      if (saved && saved.releasedAt === null) {
        if (element && objectUrl.value && !restorePosition.current) {
          saved.position = Number.isFinite(element.currentTime) ? element.currentTime : 0;
        }
        saved.releasedAt = Date.now();
      }
      operationGeneration.current += 1;
      releaseCurrentAudio();
      setListenState(operationInFlight.current !== null ? { kind: "loading" } : { kind: "idle" });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") suspend();
      else inactive.current = false;
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    let lifecycleHandle: { remove(): Promise<void> } | null = null;
    let disposed = false;
    void addAppStateChangeListener((isActive) => {
      if (disposed) return;
      if (!isActive) suspend();
      else inactive.current = document.visibilityState === "hidden";
    }).then((handle) => {
      if (disposed) void handle.remove();
      else lifecycleHandle = handle;
    }).catch(() => { /* Browser fallback remains document.visibilitychange. */ });
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void lifecycleHandle?.remove();
      operationGeneration.current += 1;
      releaseCurrentAudio();
      reference.current = null;
      retainedAudioElement.current = null;
    };
  }, [api, scriptId, objectUrl, releaseCurrentAudio]);

  function syncPlayback(element: HTMLAudioElement, waiting = false) {
    if (element !== audioElement.current || !objectUrl.value) return;
    if (reference.current && !restorePosition.current) reference.current.position = element.currentTime;
    setPlayback({
      playing: !element.paused && !element.ended,
      waiting, currentTime: restorePosition.current ? reference.current?.position ?? 0 : element.currentTime,
      duration: element.duration
    });
  }

  function restorePlayback(element: HTMLAudioElement) {
    const saved = reference.current;
    if (!saved || !objectUrl.value) return;
    if (restorePosition.current && Number.isFinite(element.duration)) {
      element.currentTime = Math.max(0, Math.min(saved.position, element.duration));
      restorePosition.current = false;
    }
    element.playbackRate = saved.rate;
    syncPlayback(element);
  }

  async function playAudio(element: HTMLAudioElement) {
    if (inactive.current || playbackInFlight.current !== null) return;
    const request = ++playbackRequest.current;
    playbackInFlight.current = request;
    setPlaybackError(null);
    try {
      await element.play();
    } catch {
      if (request === playbackRequest.current && objectUrl.value) {
        syncPlayback(element);
        setPlaybackError("再生を開始できませんでした。もう一度、再生してください。");
      }
    } finally {
      if (playbackInFlight.current === request) playbackInFlight.current = null;
    }
  }

  async function prepareAudio(resume = false) {
    if (inactive.current || operationInFlight.current !== null || audioUnavailable) return;
    if (!isOnline) {
      setListenState({ kind: "error", error: { kind: "offline" } });
      return;
    }
    const generation = ++operationGeneration.current;
    operationInFlight.current = generation;
    const current = () => generation === operationGeneration.current && !inactive.current && audioElement.current !== null;
    releaseCurrentAudio();
    setPlaybackError(null);
    setListenState({ kind: "loading" });
    try {
      // Only explicit initial preparation can reach the generation-capable API.
      if (!reference.current) {
        if (resume || hasPreparedReferenceAudio) return;
        const requested = await api.requestListen(scriptId);
        if (!current()) return;
        if (requested.kind !== "success") {
          setListenState({ kind: "error", error: requested });
          return;
        }
        reference.current = { audioId: requested.audioId, position: 0, rate: 1, releasedAt: null };
        setHasPreparedReferenceAudio(true);
      }
      const saved = reference.current;
      // Keep short returns (up to 15 minutes); longer returns discard position/rate.
      if (saved.releasedAt !== null && Date.now() - saved.releasedAt > 15 * 60_000) {
        saved.position = 0;
        saved.rate = 1;
        setRate(1);
        setPlayback(EMPTY_PLAYBACK);
      }
      if (resume && Number.isFinite(playback.duration) && saved.position >= playback.duration) saved.position = 0;
      const downloaded = await api.downloadAudio(saved.audioId);
      if (!current()) return;
      if (downloaded.kind !== "success") {
        if (["unauthorized", "forbidden", "not-found"].includes(downloaded.kind)) {
          reference.current = null;
          setAudioUnavailable(true);
          setPlayback(EMPTY_PLAYBACK);
          setRate(1);
        }
        setListenState({ kind: "error", error: downloaded });
        setPlaybackError("保存済みのお手本を取得できませんでした。音声は自動で作り直しません。");
        return;
      }
      const element = audioElement.current;
      if (!element) return;
      const url = objectUrl.replace(downloaded.audio);
      saved.releasedAt = null;
      restorePosition.current = true;
      element.src = url;
      element.playbackRate = saved.rate;
      setListenState({ kind: "ready" });
      if (resume) await playAudio(element);
    } catch {
      if (current()) {
        releaseCurrentAudio();
        setListenState({ kind: "error", error: { kind: "network-error" } });
      }
    } finally {
      if (operationInFlight.current === generation) {
        operationInFlight.current = null;
        // An interrupted fetch must settle before another can start. Keep the
        // loading UI until then, so a quick return never exposes an inert play button.
        if (generation !== operationGeneration.current && audioElement.current) setListenState({ kind: "idle" });
      }
    }
  }

  function togglePlayback() {
    const element = audioElement.current;
    if (inactive.current || audioUnavailable) return;
    if (!objectUrl.value || listenState.kind !== "ready") {
      void prepareAudio(true);
    } else if (element && !element.paused) {
      playbackRequest.current += 1;
      playbackInFlight.current = null;
      element.pause();
      syncPlayback(element);
    } else if (element) {
      void playAudio(element);
    }
  }

  function seekBy(seconds: number) {
    const element = audioElement.current;
    if (!element || !objectUrl.value || restorePosition.current || !Number.isFinite(element.duration)) return;
    element.currentTime = Math.max(0, Math.min(element.currentTime + seconds, element.duration));
    syncPlayback(element);
  }

  function changeRate(value: PlaybackRate) {
    if (!reference.current) return;
    reference.current.rate = value;
    setRate(value);
    if (audioElement.current && objectUrl.value) audioElement.current.playbackRate = value;
  }

  function handlePlaybackError(element: HTMLAudioElement) {
    if (element !== audioElement.current || !objectUrl.value) return;
    releaseCurrentAudio();
    setListenState({ kind: "idle" });
    setPlaybackError("お手本音声を再生できませんでした。再生を押すと保存済み音声を取得します。");
  }

  const visibleScriptState: ScriptState = isOnline
    ? scriptState
    : { kind: "error", error: { kind: "offline" } };
  const voiceSetupRequired = listenState.kind === "error" &&
    listenState.error.kind === "conflict" && listenState.error.reasonCode === "voice_setup_required";
  const prepareLabel = audioUnavailable ? null : getListenPrepareButtonLabel(listenState.kind, hasPreparedReferenceAudio);
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
        {audioUnavailable ? <p className="listen-notice" role="status">台本一覧から選び直してください。</p> : null}
        {listenState.kind === "loading" ? <span className="listen-sr-status" role="status">お手本を準備中…</span> : null}

        <audio ref={attachAudio} preload="metadata"
          onLoadedMetadata={(event) => restorePlayback(event.currentTarget)}
          onDurationChange={(event) => restorePlayback(event.currentTarget)}
          onTimeUpdate={(event) => syncPlayback(event.currentTarget)}
          onSeeked={(event) => syncPlayback(event.currentTarget)}
          onPlay={(event) => syncPlayback(event.currentTarget)}
          onPlaying={(event) => syncPlayback(event.currentTarget)}
          onPause={(event) => syncPlayback(event.currentTarget)}
          onEnded={(event) => syncPlayback(event.currentTarget)}
          onWaiting={(event) => syncPlayback(event.currentTarget, true)}
          onCanPlay={(event) => syncPlayback(event.currentTarget)}
          onError={(event) => handlePlaybackError(event.currentTarget)}
        />
        {hasPreparedReferenceAudio && !audioUnavailable ? (
          <>
            <div className="listen-player">
              <div className="listen-audio-info">
                <strong>お手本音声</strong>
                <span className="listen-audio-time" aria-live="off">{formatListenMediaTime(playback.currentTime)} / {formatListenMediaTime(playback.duration)}</span>
              </div>
              <div className="listen-transport">
                <button type="button" className="listen-seek" aria-label="お手本音声を5秒戻す" disabled={listenState.kind !== "ready" || !Number.isFinite(playback.duration)} onClick={() => seekBy(-5)}><span aria-hidden="true">↶</span><span className="listen-seek-label"><span>5秒</span><wbr /><span>戻る</span></span></button>
                <button type="button" className="listen-seek" aria-label="お手本音声を3秒戻す" disabled={listenState.kind !== "ready" || !Number.isFinite(playback.duration)} onClick={() => seekBy(-3)}><span aria-hidden="true">↶</span><span className="listen-seek-label"><span>3秒</span><wbr /><span>戻る</span></span></button>
              <button type="button" className="listen-play" disabled={listenState.kind === "loading"} aria-label={playback.playing ? "お手本音声を一時停止" : "お手本音声を再生"} onClick={() => void togglePlayback()}>
                <span className={playback.playing ? "listen-pause-icon" : "listen-play-icon"} aria-hidden="true" />
                <span className="listen-seek-label">{playback.playing ? <><span>一時</span><wbr /><span>停止</span></> : "再生"}</span>
              </button>
              <button type="button" className="listen-seek" aria-label="お手本音声を3秒進める" disabled={listenState.kind !== "ready" || !Number.isFinite(playback.duration)} onClick={() => seekBy(3)}><span aria-hidden="true">↷</span><span className="listen-seek-label"><span>3秒</span><wbr /><span>進む</span></span></button>
                <button type="button" className="listen-seek" aria-label="お手本音声を5秒進める" disabled={listenState.kind !== "ready" || !Number.isFinite(playback.duration)} onClick={() => seekBy(5)}><span aria-hidden="true">↷</span><span className="listen-seek-label"><span>5秒</span><wbr /><span>進む</span></span></button>
              </div>
              <label className="listen-rate">再生速度
                <select aria-label="お手本音声の再生速度" value={rate} disabled={listenState.kind === "loading"} onChange={(event) => changeRate(Number(event.target.value) as PlaybackRate)}>
                  {PLAYBACK_RATE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.value.toFixed(2)}倍</option>)}
                </select>
              </label>
              <span className="listen-sr-status" role="status">{listenState.kind === "loading" ? "保存済みのお手本を読み込んでいます…" : playback.waiting ? "音声の読み込みを待っています…" : playback.playing ? "再生中" : "再生できます"}</span>
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
