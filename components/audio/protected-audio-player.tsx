"use client";

import { useEffect, useRef, useState } from "react";
import { PlaybackRateControl, type PlaybackRate } from "@/components/audio/playback-rate-control";

type ProtectedAudioPlayerProps = {
  sourceUrl: string;
  className?: string;
  loadingMessage?: string;
  errorMessage?: string;
  lazy?: boolean;
  revealLabel?: string;
  variant?: "default" | "studio";
};

function formatDuration(durationMs: number) {
  if (durationMs < 10) {
    return `${durationMs.toFixed(1)}ms`;
  }

  return `${Math.round(durationMs)}ms`;
}

function logClientTiming(label: string, startMs: number) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.info(`[timing] ${label} ${formatDuration(performance.now() - startMs)}`);
}

export function ProtectedAudioPlayer({
  sourceUrl,
  className = "w-full",
  loadingMessage = "録音を準備しています...",
  errorMessage = "保存済み録音の取得に失敗しました。ページを再読込してからもう一度お試しください。",
  lazy = false,
  revealLabel = "この音声を聞く",
  variant = "default"
}: ProtectedAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [resolvedAudioUrl, setResolvedAudioUrl] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<PlaybackRate>(1);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [activatedSourceUrl, setActivatedSourceUrl] = useState<string | null>(lazy ? null : sourceUrl);
  const isStudio = variant === "studio";
  const shouldResolveAudio = !lazy || activatedSourceUrl === sourceUrl;

  useEffect(() => {
    if (!shouldResolveAudio) {
      setResolvedAudioUrl(null);
      setLoadFailed(false);
      return;
    }

    let active = true;
    let objectUrl: string | null = null;
    const controller = new AbortController();
    const totalStart = performance.now();

    setResolvedAudioUrl(null);
    setLoadFailed(false);

    async function resolveAudioUrl() {
      try {
        const fetchStart = performance.now();
        const response = await fetch(sourceUrl, {
          credentials: "same-origin",
          signal: controller.signal
        });
        logClientTiming("protectedAudio.client.fetch", fetchStart);

        if (!response.ok) {
          throw new Error(`audio_fetch_failed_${response.status}`);
        }

        const blobStart = performance.now();
        const audioBlob = await response.blob();
        logClientTiming("protectedAudio.client.blob", blobStart);
        objectUrl = URL.createObjectURL(audioBlob);

        if (!active) {
          URL.revokeObjectURL(objectUrl);
          return;
        }

        setResolvedAudioUrl(objectUrl);
        logClientTiming("protectedAudio.client.ready", totalStart);
      } catch {
        if (!active || controller.signal.aborted) {
          return;
        }

        setLoadFailed(true);
      }
    }

    void resolveAudioUrl();

    return () => {
      active = false;
      controller.abort();

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [sourceUrl, loadAttempt, shouldResolveAudio]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, resolvedAudioUrl]);

  const feedbackPanelClass = isStudio
    ? "rounded-2xl border border-[var(--line-dark)] bg-white/10 p-4 text-[rgba(255,241,221,0.78)] shadow-[0_18px_44px_rgba(0,0,0,0.12)]"
    : "rounded-2xl border border-[var(--line-inset)] bg-[var(--surface-inset)] p-4 text-ink-700 shadow-[var(--shadow-studio-soft)]";
  const subtleTextClass = isStudio ? "text-[rgba(255,241,221,0.66)]" : "text-ink-600";
  const statusPillClass = isStudio
    ? "border-[var(--line-dark)] bg-[rgba(255,241,221,0.1)] text-[rgba(255,241,221,0.78)]"
    : "border-[var(--line-inset)] bg-[rgba(255,241,221,0.42)] text-ink-700";

  if (!shouldResolveAudio) {
    return (
      <div className={feedbackPanelClass}>
        <button
          type="button"
          className={`inline-flex w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition ${
            isStudio
              ? "border border-[rgba(255,241,221,0.24)] bg-[rgba(255,241,221,0.1)] text-[var(--script-paper)] hover:bg-[rgba(255,241,221,0.16)]"
              : "bg-[var(--control-panel)] text-[var(--script-paper)] hover:bg-[var(--control-panel-soft)]"
          }`}
          onClick={() => setActivatedSourceUrl(sourceUrl)}
        >
          {revealLabel}
        </button>
        <p className={`mt-2 text-xs leading-5 ${subtleTextClass}`}>押した音声だけを準備します。</p>
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className={feedbackPanelClass} role="status" aria-live="polite">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className={`text-sm leading-6 ${isStudio ? "text-[#ffd3a3]" : "text-amber-900"}`}>{errorMessage}</p>
          <button
            type="button"
            className={`inline-flex shrink-0 items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold transition ${
              isStudio
                ? "border-[rgba(255,241,221,0.24)] bg-[rgba(255,241,221,0.1)] text-[var(--script-paper)] hover:bg-[rgba(255,241,221,0.16)]"
                : "border-[var(--line-inset)] bg-[var(--control-panel)] text-[var(--script-paper)] hover:bg-[var(--control-panel-soft)]"
            }`}
            onClick={() => setLoadAttempt((attempt) => attempt + 1)}
          >
            もう一度読み込む
          </button>
        </div>
      </div>
    );
  }

  if (!resolvedAudioUrl) {
    return (
      <div className={feedbackPanelClass} role="status" aria-live="polite">
        <div className="flex items-center gap-3">
          <span className={`h-2.5 w-2.5 shrink-0 animate-pulse rounded-full ${isStudio ? "bg-[#ffd3a3]" : "bg-[var(--quiet-accent)]"}`} />
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-6">{loadingMessage}</p>
            <p className={`text-xs leading-5 ${subtleTextClass}`}>保存済み録音を安全に読み込んでいます。</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${statusPillClass}`} role="status" aria-live="polite">
        準備できました
      </div>
      <PlaybackRateControl
        testId="protected-audio-playback-rate"
        value={playbackRate}
        onChange={setPlaybackRate}
        label="保存済み録音の聞き返し速度"
        description="再生速度だけを変えます。保存済み録音の内容や評価結果は変わりません。"
        variant={variant}
      />
      <audio
        ref={audioRef}
        controls
        preload="none"
        className={className}
        onLoadedMetadata={(event) => {
          event.currentTarget.playbackRate = playbackRate;
        }}
      >
        <source src={resolvedAudioUrl} />
      </audio>
    </div>
  );
}
