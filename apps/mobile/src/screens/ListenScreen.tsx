import { useCallback, useEffect, useRef, useState } from "react";
import { AudioObjectUrl } from "../audio/object-url";
import { addAppStateChangeListener } from "../lib/app-lifecycle";
import type { PracticeApi, MobileScript, PracticeRequestFailure } from "../practice/api";
import type { PracticeRoute } from "../practice/routes";
import { LoadingState, RequestError, ScreenHeading } from "./ScreenParts";

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
    return "お手本を再取得";
  }

  return hasPreparedReferenceAudio ? "保存済みのお手本を再準備" : "お手本を準備";
}

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
  const [reloadKey, setReloadKey] = useState(0);
  const [objectUrl] = useState(() => new AudioObjectUrl());
  const audioElement = useRef<HTMLAudioElement | null>(null);
  const retainedAudioElement = useRef<HTMLAudioElement | null>(null);
  const operationGeneration = useRef(0);
  const operationInFlight = useRef(false);
  const releaseCurrentAudio = useCallback(() => {
    releaseAudioElement(audioElement.current ?? retainedAudioElement.current);
    retainedAudioElement.current = null;
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

  const visibleScriptState: ScriptState = isOnline
    ? scriptState
    : { kind: "error", error: { kind: "offline" } };

  return (
    <section className="intro-card practice-card" aria-live="polite">
      <ScreenHeading eyebrow="Listen" title="お手本を聴く" detail="発音とリズムを一度まねしてから録音へ進みます。" />

      {visibleScriptState.kind === "loading" ? <LoadingState label="台本を読み込んでいます…" /> : null}
      {visibleScriptState.kind === "error" ? <RequestError error={visibleScriptState.error} onRetry={reloadScript} /> : null}
      {visibleScriptState.kind === "ready" ? (
        <article className="script-reading-card">
          <div className="script-meta"><span>{visibleScriptState.script.locale}</span><span>{visibleScriptState.script.targetSeconds}秒</span></div>
          <h2>{visibleScriptState.script.title}</h2>
          <p>{visibleScriptState.script.content}</p>
        </article>
      ) : null}

      {listenState.kind === "error" && listenState.error.kind === "conflict" && listenState.error.reasonCode === "voice_setup_required" ? (
        <div className="auth-notice" role="status">
          <strong>お手本ボイスの準備が必要です</strong>
          <p>同意と短い声の録音を完了すると、この台本のお手本を準備できます。</p>
          <button type="button" onClick={() => onNavigate({ name: "voice_setup", scriptId })}>お手本ボイスを準備する</button>
        </div>
      ) : null}
      {listenState.kind === "error" && !(listenState.error.kind === "conflict" && listenState.error.reasonCode === "voice_setup_required") ? <RequestError error={listenState.error} onRetry={() => void prepareAudio()} /> : null}
      {listenState.kind === "ready" ? (
        <div className="audio-card">
          <p className="eyebrow">Reference audio</p>
          <audio ref={(element) => {
            if (element) {
              audioElement.current = element;
              retainedAudioElement.current = element;
            } else {
              audioElement.current = null;
            }
          }} controls preload="metadata" src={listenState.url} />
          <p>{listenState.cached ? "保存済みのお手本を再利用しました。" : "お手本の準備ができました。"}</p>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => void prepareAudio()}
        disabled={listenState.kind === "loading" || visibleScriptState.kind !== "ready"}
      >
        {getListenPrepareButtonLabel(listenState.kind, hasPreparedReferenceAudio)}
      </button>
      <button type="button" className="secondary-button" disabled={visibleScriptState.kind !== "ready"} onClick={() => onNavigate({ name: "record", scriptId })}>
        録音へ進む
      </button>
    </section>
  );
}
