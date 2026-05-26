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

function formatPlaybackTime(value: number | null) {
  if (!value || !Number.isFinite(value) || value < 0) {
    return "0:00";
  }

  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");

  return `${minutes}:${seconds}`;
}

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
  const [voiceLabel, setVoiceLabel] = useState(initialVoiceLabel);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<MessageKind>("info");
  const [playbackRate, setPlaybackRate] = useState<PlaybackRate>(1);
  const [audioDurationSeconds, setAudioDurationSeconds] = useState<number | null>(null);
  const [currentTimeSeconds, setCurrentTimeSeconds] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    setLoadFailed(false);
    setAudioReady(false);
    setAudioDurationSeconds(null);
    setCurrentTimeSeconds(0);
    setIsPlaying(false);
  }, [audioUrl]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, audioUrl]);

  async function handleGenerate() {
    if (!canGenerateAudio) {
      setMessage(generateBlockedSummary ?? "先に声の設定が必要です。");
      setMessageKind("info");
      return;
    }

    setLoading(true);
    setMessage(null);
    setLoadFailed(false);
    setAudioReady(false);

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
    const nextTime = clampTime(audio.currentTime + seconds, duration);
    audio.currentTime = nextTime;
    setCurrentTimeSeconds(nextTime);
  }

  async function togglePlayback() {
    const audio = audioRef.current;

    if (!audio || !audioUrl || loadFailed) {
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
        <div data-testid="listen-audio-block" className="space-y-3 rounded-[1.75rem] border border-[var(--line-dark)] bg-[var(--control-panel)] px-4 py-4 text-[var(--cta-primary-text)] shadow-[0_18px_44px_rgba(24,23,34,0.22)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(255,241,221,0.62)]">Native voice</p>
              <p className="mt-1 text-sm font-semibold text-[var(--cta-primary-text)]">お手本ボイス</p>
            </div>
            {voiceLabel ? <p className="text-xs font-semibold text-[rgba(255,241,221,0.68)]">{voiceLabel}</p> : null}
          </div>
          <PlaybackRateControl
            testId="listen-playback-rate"
            value={playbackRate}
            onChange={setPlaybackRate}
            label="聞く速さ"
            description="再生速度だけを変えます。"
            disabled={!audioUrl || loadFailed}
            variant="studio"
          />
          {loadFailed ? (
            <p className="rounded-2xl border border-[var(--line-dark)] bg-[rgba(255,241,221,0.1)] px-4 py-3 text-sm leading-6 text-[var(--cta-primary-text)]">お手本の取得に失敗しました。ページを再読込するか、作り直してください。</p>
          ) : (
            <>
              <audio
                data-testid="listen-audio-element"
                key={audioUrl}
                ref={audioRef}
                src={audioUrl}
                preload="metadata"
                className="hidden"
                onLoadedMetadata={(event) => {
                  const nextDuration = Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : null;
                  event.currentTarget.playbackRate = playbackRate;
                  setAudioDurationSeconds(nextDuration);
                  setCurrentTimeSeconds(event.currentTarget.currentTime);
                  setAudioReady(true);
                  setLoadFailed(false);
                }}
                onCanPlay={(event) => {
                  event.currentTarget.playbackRate = playbackRate;
                  setAudioReady(true);
                  setLoadFailed(false);
                }}
                onPlay={(event) => {
                  event.currentTarget.playbackRate = playbackRate;
                  setAudioReady(true);
                  setIsPlaying(true);
                }}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
                onTimeUpdate={(event) => {
                  setCurrentTimeSeconds(event.currentTarget.currentTime);
                }}
                onSeeking={(event) => {
                  setCurrentTimeSeconds(event.currentTarget.currentTime);
                }}
                onError={() => {
                  setLoadFailed(true);
                  setAudioReady(false);
                  setIsPlaying(false);
                }}
              >
                お使いのブラウザでは音声を再生できません。
              </audio>
              {!audioReady ? <p className="text-sm leading-6 text-[rgba(255,241,221,0.72)]">お手本を準備しています...</p> : null}
            </>
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
                ? "border border-[var(--line-inset)] bg-[var(--surface-inset)] text-ink-800 hover:bg-[var(--surface-inset-strong)]"
                : "bg-[var(--cta-primary-bg)] text-[var(--cta-primary-text)] hover:opacity-90"
            }`}
          >
            {loading ? (audioUrl ? "作り直し中..." : "作成中...") : audioUrl ? "お手本ボイスを作り直す" : "お手本ボイスを作る"}
          </button>
        ) : null}
        {canGenerateAudio ? (
          <p className="rounded-full border border-[var(--line-inset)] bg-[var(--coach-note)] px-3 py-1 text-xs font-semibold text-ink-700">
            ベータでは お手本ボイス生成は10回まで
          </p>
        ) : null}
        {!canGenerateAudio && generateBlockedSummary ? (
          <p className="rounded-2xl border border-[var(--line-inset)] bg-[var(--coach-note)] px-4 py-3 text-sm leading-6 text-ink-700">{generateBlockedSummary}</p>
        ) : null}
      </div>

      <ListenChunkControls
        chunks={practiceChunks}
        focusWords={focusWords}
      />

      {message ? <p data-testid="listen-message" className={`text-sm ${messageKind === "error" ? "text-amber-800" : "text-ink-600"}`}>{message}</p> : null}

      {audioUrl && !loadFailed ? (
        <StickyListenAudioControls
          canPlay={Boolean(audioUrl) && !loadFailed}
          canSeek={audioReady && !loadFailed}
          audioLoading={Boolean(audioUrl && !audioReady && !loadFailed)}
          isPlaying={isPlaying}
          currentTimeLabel={formatPlaybackTime(currentTimeSeconds)}
          durationLabel={audioDurationSeconds ? formatPlaybackTime(audioDurationSeconds) : null}
          onSeek={seekBy}
          onTogglePlayback={togglePlayback}
        />
      ) : null}
    </div>
  );
}

function StickyListenAudioControls({
  canPlay,
  canSeek,
  audioLoading,
  isPlaying,
  currentTimeLabel,
  durationLabel,
  onSeek,
  onTogglePlayback
}: {
  canPlay: boolean;
  canSeek: boolean;
  audioLoading: boolean;
  isPlaying: boolean;
  currentTimeLabel: string;
  durationLabel: string | null;
  onSeek: (seconds: number) => void;
  onTogglePlayback: () => void;
}) {
  return (
    <div
      data-testid="listen-sticky-audio-controls"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--line-dark)] bg-[rgba(24,23,34,0.96)] px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 text-[var(--cta-primary-text)] shadow-[0_-18px_46px_rgba(24,23,34,0.28)] backdrop-blur"
    >
      <div className="mx-auto max-w-3xl">
        <div className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold text-[rgba(255,241,221,0.72)]">
          <span>お手本ボイス</span>
          <span aria-live="off">
            {currentTimeLabel}
            {durationLabel ? ` / ${durationLabel}` : ""}
          </span>
        </div>
        <div className="grid grid-cols-5 gap-2 text-xs font-semibold">
          <MiniAudioButton label="5戻る" disabled={!canSeek} busy={audioLoading} onClick={() => onSeek(-5)} />
          <MiniAudioButton label="3戻る" disabled={!canSeek} busy={audioLoading} onClick={() => onSeek(-3)} />
          <MiniAudioButton label={isPlaying ? "一時停止" : "再生"} disabled={!canPlay} busy={audioLoading} onClick={onTogglePlayback} />
          <MiniAudioButton label="3進む" disabled={!canSeek} busy={audioLoading} onClick={() => onSeek(3)} />
          <MiniAudioButton label="5進む" disabled={!canSeek} busy={audioLoading} onClick={() => onSeek(5)} />
        </div>
      </div>
    </div>
  );
}

function ListenChunkControls({
  chunks,
  focusWords
}: {
  chunks: PracticeChunk[];
  focusWords: string[];
}) {
  if (chunks.length === 0) {
    return null;
  }

  const limitedFocusWords = focusWords.map((word) => word.trim()).filter(Boolean).slice(0, 3);

  return (
    <details className="rounded-[1.5rem] border border-[var(--line-inset)] bg-[var(--surface-secondary)] p-4" data-testid="listen-segmented-practice">
      <summary className="cursor-pointer text-sm font-semibold text-ink-800">区切りを見ながらまねる</summary>
      <ol className="mt-4 grid gap-3">
        {chunks.map((chunk) => {
          const chunkFocusWords = getMatchingFocusWords(chunk.text, limitedFocusWords);

          return (
            <li key={`${chunk.index}-${chunk.text}`} className="rounded-2xl border border-[var(--line-inset)] bg-[var(--script-paper)] px-4 py-4 shadow-[0_10px_24px_rgba(45,38,31,0.08)]">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">区切り {chunk.index}</p>
                <span className="shrink-0 rounded-full border border-[var(--line-subtle)] bg-[var(--surface-inset)] px-3 py-1 text-xs font-semibold text-ink-700">{chunk.wordCount} words</span>
              </div>
              <p className="mt-3 break-words text-lg leading-8 text-ink-950">{chunk.text}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm leading-6">
                <span className="rounded-full border border-[var(--line-subtle)] bg-[var(--coach-note)] px-3 py-1 font-semibold text-[var(--studio-accent-strong)]">{chunk.cueJa}</span>
                {chunkFocusWords.map((word) => (
                  <span key={word} className="rounded-full border border-[var(--line-subtle)] bg-[var(--surface-inset)] px-3 py-1 text-xs font-semibold text-ink-600">
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
      className="min-h-10 rounded-2xl border border-[var(--line-dark)] bg-[var(--script-paper)] px-2 py-2 text-ink-900 transition hover:bg-[var(--take-paper)] disabled:cursor-not-allowed disabled:opacity-45"
    >
      {label}
    </button>
  );
}
