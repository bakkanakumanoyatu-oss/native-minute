"use client";

import { useEffect, useRef, useState } from "react";
import { PlaybackRateControl, type PlaybackRate } from "@/components/audio/playback-rate-control";

type ProtectedAudioPlayerProps = {
  sourceUrl: string;
  className?: string;
  loadingMessage?: string;
  errorMessage?: string;
  variant?: "default" | "studio";
};

export function ProtectedAudioPlayer({
  sourceUrl,
  className = "w-full",
  loadingMessage = "録音を準備しています...",
  errorMessage = "保存済み録音の取得に失敗しました。ページを再読込してからもう一度お試しください。",
  variant = "default"
}: ProtectedAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [resolvedAudioUrl, setResolvedAudioUrl] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<PlaybackRate>(1);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    const controller = new AbortController();

    setResolvedAudioUrl(null);
    setLoadFailed(false);

    async function resolveAudioUrl() {
      try {
        const response = await fetch(sourceUrl, {
          credentials: "same-origin",
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`audio_fetch_failed_${response.status}`);
        }

        const audioBlob = await response.blob();
        objectUrl = URL.createObjectURL(audioBlob);

        if (!active) {
          URL.revokeObjectURL(objectUrl);
          return;
        }

        setResolvedAudioUrl(objectUrl);
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
  }, [sourceUrl]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, resolvedAudioUrl]);

  if (loadFailed) {
    return <p className={`text-sm leading-6 ${variant === "studio" ? "text-[#ffd3a3]" : "text-amber-800"}`}>{errorMessage}</p>;
  }

  if (!resolvedAudioUrl) {
    return <p className={`text-sm leading-6 ${variant === "studio" ? "text-[rgba(255,241,221,0.72)]" : "text-ink-600"}`}>{loadingMessage}</p>;
  }

  return (
    <div className="space-y-3">
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
