"use client";

import { useEffect, useRef, useState } from "react";
import { SavedModelAudioControl } from "@/components/audio-library/saved-model-audio-control";
import { PlaybackRateControl, type PlaybackRate } from "@/components/audio/playback-rate-control";
import type { ListenPracticeContext } from "@/lib/listen-guidance";
import { getMatchingFocusWords, type PracticeChunk } from "@/lib/script-practice-chunks";
import { DEFAULT_VOICE_STYLE_PRESET } from "@/lib/voice-style";

type SpeakResponse = {
  ok: boolean;
  message?: string;
  data?: {
    audioUrl: string;
    cached: boolean;
    cacheKey: string;
    voice: {
      id: string;
      label: string;
      provider: string;
    };
  };
};

type ListenPanelProps = {
  scriptId: string;
  initialAudioUrl?: string | null;
  initialHasSavedAudio?: boolean;
  initialVoiceLabel?: string | null;
  initialVoiceId?: string | null;
  practiceContext?: ListenPracticeContext;
  nextRecordHref?: string;
  setupVoiceHref?: string;
  canGenerateAudio?: boolean;
  generateBlockedSummary?: string | null;
  practiceChunks?: PracticeChunk[];
  focusWords?: string[];
};

type MessageKind = "info" | "error";

function clampTime(value: number, duration: number | null) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (duration && Number.isFinite(duration) && duration > 0) {
    return Math.min(Math.max(value, 0), duration);
  }

  return Math.max(value, 0);
}

export function ListenPanel({
  scriptId,
  initialAudioUrl = null,
  initialVoiceLabel = null,
  initialVoiceId = null,
  canGenerateAudio = true,
  generateBlockedSummary = null,
  practiceChunks = [],
  focusWords = []
}: ListenPanelProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioUrl, setAudioUrl] = useState(initialAudioUrl);
  const [resolvedAudioUrl, setResolvedAudioUrl] = useState<string | null>(null);
  const [voiceLabel, setVoiceLabel] = useState(initialVoiceLabel);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<MessageKind>("info");
  const [playbackRate, setPlaybackRate] = useState<PlaybackRate>(1);
  const [audioDurationSeconds, setAudioDurationSeconds] = useState<number | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const isResolvingAudio = Boolean(audioUrl && !resolvedAudioUrl && !loadFailed);

  useEffect(() => {
    if (!audioUrl) {
      setResolvedAudioUrl(null);
      setLoadFailed(false);
      return;
    }

    const sourceUrl = audioUrl;
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
  }, [audioUrl]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, resolvedAudioUrl]);

  async function handleGenerate() {
    if (!canGenerateAudio) {
      setMessage(generateBlockedSummary ?? "先に声の設定が必要です。");
      setMessageKind("info");
      return;
    }

    setLoading(true);
    setMessage(null);
    setLoadFailed(false);

    try {
      const response = await fetch("/api/speak-script", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          scriptId,
          voiceId: initialVoiceId ?? undefined,
          voiceStylePreset: DEFAULT_VOICE_STYLE_PRESET
        })
      });

      const payload = (await response.json()) as SpeakResponse;

      if (!response.ok || !payload.ok || !payload.data) {
        setMessage(payload.message ?? "お手本ボイスを作れませんでした。");
        setMessageKind("error");
        return;
      }

      setAudioUrl(payload.data.audioUrl);
      setVoiceLabel(payload.data.voice.label);
      setMessage(payload.data.cached ? "保存済みのお手本を使いました。" : "お手本ボイスを作りました。");
      setMessageKind("info");
    } catch {
      setMessage("通信に失敗しました。少し待ってからお試しください。");
      setMessageKind("error");
    } finally {
      setLoading(false);
    }
  }

  function seekBy(seconds: number) {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    const duration = Number.isFinite(audio.duration) ? audio.duration : audioDurationSeconds;
    audio.currentTime = clampTime(audio.currentTime + seconds, duration);
  }

  async function togglePlayback() {
    const audio = audioRef.current;

    if (!audio || !resolvedAudioUrl) {
      return;
    }

    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        setMessage("再生できませんでした。ブラウザの音声許可を確認してください。");
        setMessageKind("error");
      }
      return;
    }

    audio.pause();
  }

  return (
    <div className="space-y-4" aria-busy={loading}>
      {audioUrl ? (
        <div data-testid="listen-audio-block" className="space-y-3 rounded-2xl border border-[var(--line)] bg-white px-4 py-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-ink-900">お手本ボイス</p>
            {voiceLabel ? <p className="text-xs font-semibold text-ink-500">{voiceLabel}</p> : null}
          </div>
          <PlaybackRateControl
            testId="listen-playback-rate"
            value={playbackRate}
            onChange={setPlaybackRate}
            label="聞く速さ"
            description="再生速度だけを変えます。"
            disabled={!resolvedAudioUrl}
          />
          {loadFailed ? (
            <p className="text-sm leading-6 text-amber-800">お手本の取得に失敗しました。ページを再読込するか、作り直してください。</p>
          ) : resolvedAudioUrl ? (
            <>
              <audio
                data-testid="listen-audio-element"
                key={resolvedAudioUrl}
                ref={audioRef}
                src={resolvedAudioUrl}
                controls
                preload="none"
                className="w-full"
                onLoadedMetadata={(event) => {
                  const nextDuration = Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : null;
                  event.currentTarget.playbackRate = playbackRate;
                  setAudioDurationSeconds(nextDuration);
                }}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
              >
                お使いのブラウザでは音声を再生できません。
              </audio>
              <div className="grid grid-cols-4 gap-2 text-xs font-semibold sm:flex">
                {[-5, -3, 3, 5].map((seconds) => (
                  <button
                    key={seconds}
                    type="button"
                    onClick={() => seekBy(seconds)}
                    className="rounded-2xl border border-[var(--line)] bg-ink-50 px-3 py-2 text-ink-800 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-45"
                    disabled={!resolvedAudioUrl}
                  >
                    {seconds < 0 ? `${Math.abs(seconds)}秒戻る` : `${seconds}秒進む`}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm leading-6 text-ink-600">お手本を準備しています...</p>
          )}
          <SavedModelAudioControl scriptId={scriptId} audioUrl={audioUrl} />
        </div>
      ) : null}

      <div className="flex flex-col items-start gap-2">
        {canGenerateAudio ? (
          <button
            data-testid="listen-generate-button"
            type="button"
            onClick={handleGenerate}
            disabled={loading}
            aria-busy={loading}
            className={`inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
              audioUrl
                ? "border border-[var(--line)] bg-white text-ink-800 hover:bg-ink-50"
                : "bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)]"
            }`}
          >
            {loading ? (audioUrl ? "作り直し中..." : "作成中...") : audioUrl ? "お手本ボイスを作り直す" : "お手本ボイスを作る"}
          </button>
        ) : null}
        {canGenerateAudio ? (
          <p className="rounded-full border border-[var(--line)] bg-ink-50 px-3 py-1 text-xs font-semibold text-ink-600">
            ベータでは お手本ボイス生成は10回まで
          </p>
        ) : null}
        {!canGenerateAudio && generateBlockedSummary ? (
          <p className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3 text-sm leading-6 text-ink-700">{generateBlockedSummary}</p>
        ) : null}
      </div>

      <ListenChunkControls
        chunks={practiceChunks}
        focusWords={focusWords}
        audioReady={Boolean(resolvedAudioUrl) && !loadFailed}
        audioLoading={isResolvingAudio}
        isPlaying={isPlaying}
        onSeek={seekBy}
        onTogglePlayback={togglePlayback}
      />

      {message ? <p data-testid="listen-message" className={`text-sm ${messageKind === "error" ? "text-amber-800" : "text-ink-600"}`}>{message}</p> : null}
    </div>
  );
}

function ListenChunkControls({
  chunks,
  focusWords,
  audioReady,
  audioLoading,
  isPlaying,
  onSeek,
  onTogglePlayback
}: {
  chunks: PracticeChunk[];
  focusWords: string[];
  audioReady: boolean;
  audioLoading: boolean;
  isPlaying: boolean;
  onSeek: (seconds: number) => void;
  onTogglePlayback: () => void;
}) {
  if (chunks.length === 0) {
    return null;
  }

  const limitedFocusWords = focusWords.map((word) => word.trim()).filter(Boolean).slice(0, 3);

  return (
    <details className="rounded-[1.5rem] border border-[var(--line)] bg-white p-4" data-testid="listen-segmented-practice">
      <summary className="cursor-pointer text-sm font-semibold text-ink-800">区切りを見る</summary>
      <ol className="mt-4 grid gap-3">
        {chunks.map((chunk) => {
          const chunkFocusWords = getMatchingFocusWords(chunk.text, limitedFocusWords);

          return (
            <li key={`${chunk.index}-${chunk.text}`} className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">区切り {chunk.index}</p>
                <span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-semibold text-ink-700">{chunk.wordCount} words</span>
              </div>
              <p className="mt-3 break-words text-lg leading-8 text-ink-950">{chunk.text}</p>
              <div className="mt-3 grid grid-cols-5 gap-2 text-xs font-semibold">
                <MiniAudioButton label="5戻る" disabled={!audioReady} busy={audioLoading} onClick={() => onSeek(-5)} />
                <MiniAudioButton label="3戻る" disabled={!audioReady} busy={audioLoading} onClick={() => onSeek(-3)} />
                <MiniAudioButton label={isPlaying ? "一時停止" : "再生"} disabled={!audioReady} busy={audioLoading} onClick={onTogglePlayback} />
                <MiniAudioButton label="3進む" disabled={!audioReady} busy={audioLoading} onClick={() => onSeek(3)} />
                <MiniAudioButton label="5進む" disabled={!audioReady} busy={audioLoading} onClick={() => onSeek(5)} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm leading-6">
                <span className="rounded-full bg-white px-3 py-1 font-semibold text-[var(--accent-strong)]">{chunk.cueJa}</span>
                {chunkFocusWords.map((word) => (
                  <span key={word} className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-xs font-semibold text-ink-600">
                    focus: {word}
                  </span>
                ))}
              </div>
            </li>
          );
        })}
      </ol>
    </details>
  );
}

function MiniAudioButton({
  label,
  disabled,
  busy,
  onClick
}: {
  label: string;
  disabled: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={busy ? `${label}。音声を準備中` : label}
      className="min-h-10 rounded-2xl border border-[var(--line)] bg-white px-2 py-2 text-ink-800 transition hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-45"
    >
      {label}
    </button>
  );
}
