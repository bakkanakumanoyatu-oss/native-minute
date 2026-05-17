"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SavedModelAudioControl } from "@/components/audio-library/saved-model-audio-control";
import { PlaybackRateControl, type PlaybackRate } from "@/components/audio/playback-rate-control";
import { getListenPracticeGuidance, type ListenPracticeContext } from "@/lib/listen-guidance";
import { getListenRecoveryGuidance } from "@/lib/listen-recovery-guidance";
import { getGuidanceActionBadgeLabel, getGuidanceToneClasses } from "@/lib/guidance-ui";
import {
  DEFAULT_VOICE_STYLE_PRESET,
  VOICE_STYLE_PRESET_OPTIONS,
  type VoiceStylePreset
} from "@/lib/voice-style";

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
};

type PlaybackStatus = "empty" | "saved" | "generated_fresh" | "generated_cached";
type MessageKind = "info" | "error";
type PlaybackIssueKind = "playback_failed" | "playback_unstable";

type PlaybackIssue = {
  kind: PlaybackIssueKind;
  message: string;
};

type DecisionAction = {
  id: string;
  label: string;
  description: string;
  tone: "primary" | "secondary";
  emphasized?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  href?: string;
};

function formatSecondsLabel(seconds: number) {
  return seconds >= 10 ? `${Math.round(seconds)}秒` : `${seconds.toFixed(1)}秒`;
}

function getListenConfirmationSeconds(durationSeconds: number | null) {
  if (!durationSeconds || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return 2;
  }

  return Math.min(Math.max(durationSeconds * 0.35, 1), Math.min(durationSeconds, 4));
}

function getDecisionButtonClasses(tone: DecisionAction["tone"]) {
  if (tone === "primary") {
    return "rounded-2xl bg-[var(--accent)] px-4 py-3 text-white";
  }

  return "rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-ink-800";
}

function DecisionActionGrid({ actions }: { actions: DecisionAction[] }) {
  return (
    <div className="mt-4 grid gap-3 md:grid-cols-3">
      {actions.map((action) => {
        const content = (
          <>
            {action.emphasized ? (
              <span className={`inline-flex items-center justify-center rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${action.tone === "primary" ? "bg-white/15 text-white" : "bg-ink-50 text-ink-500"}`}>
                優先
              </span>
            ) : null}
            <span className={`inline-flex items-center justify-center text-sm font-semibold ${action.tone === "primary" ? "text-white" : "text-ink-800"}`}>
              {action.label}
            </span>
            <span className={`mt-2 block text-sm leading-6 ${action.tone === "primary" ? "text-white/90" : "text-ink-600"}`}>
              {action.description}
            </span>
          </>
        );

        if (action.href) {
          return (
            <Link key={action.id} href={action.href} className={getDecisionButtonClasses(action.tone)}>
              {content}
            </Link>
          );
        }

        return (
          <button
            key={action.id}
            type="button"
            onClick={action.onClick}
            disabled={action.disabled}
            className={`${getDecisionButtonClasses(action.tone)} ${action.disabled ? "cursor-not-allowed opacity-60" : ""}`}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}

function compactActions(actions: Array<DecisionAction | null>) {
  return actions.filter((action): action is DecisionAction => Boolean(action));
}

export function ListenPanel({
  scriptId,
  initialAudioUrl = null,
  initialHasSavedAudio = false,
  initialVoiceLabel = null,
  initialVoiceId = null,
  practiceContext = null,
  nextRecordHref,
  setupVoiceHref = "/setup/voice",
  canGenerateAudio = true,
  generateBlockedSummary = null
}: ListenPanelProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioUrl, setAudioUrl] = useState(initialAudioUrl);
  const [resolvedAudioUrl, setResolvedAudioUrl] = useState<string | null>(null);
  const [voiceLabel, setVoiceLabel] = useState(initialVoiceLabel);
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>(initialAudioUrl && initialHasSavedAudio ? "saved" : "empty");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<MessageKind>("info");
  const [playbackIssue, setPlaybackIssue] = useState<PlaybackIssue | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasConfirmedListen, setHasConfirmedListen] = useState(false);
  const [showPlaybackFallback, setShowPlaybackFallback] = useState(true);
  const [audioDurationSeconds, setAudioDurationSeconds] = useState<number | null>(null);
  const [hasQualityConcern, setHasQualityConcern] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<PlaybackRate>(1);
  const [voiceStylePreset, setVoiceStylePreset] = useState<VoiceStylePreset>(DEFAULT_VOICE_STYLE_PRESET);
  const [audioVoiceStylePreset, setAudioVoiceStylePreset] = useState<VoiceStylePreset | null>(
    initialAudioUrl ? DEFAULT_VOICE_STYLE_PRESET : null
  );
  const [restorableAudio, setRestorableAudio] = useState<{
    url: string;
    status: PlaybackStatus;
    voiceLabel: string | null;
    voiceStylePreset: VoiceStylePreset | null;
  } | null>(null);

  const playbackStateLabel =
    playbackStatus === "empty"
      ? "まだありません"
      : playbackStatus === "saved"
        ? "保存済みのお手本"
        : playbackStatus === "generated_cached"
          ? "保存済みのお手本"
          : "新しいお手本";

  const playbackStateDescription =
    playbackStatus === "empty"
      ? "お手本ボイスを作ると、ここで再生できます。"
      : playbackStatus === "saved"
        ? "前に作ったお手本を使えます。"
        : playbackStatus === "generated_cached"
          ? "前に作ったお手本を使えます。"
          : "新しく作ったお手本です。";
  const updateMeaning =
    playbackStatus === "saved" || playbackStatus === "generated_cached"
      ? "同じ声と台本のまま作り直すと、前に作ったお手本を使うことがあります。違和感がなければ、そのまま練習へ戻れます。"
      : playbackStatus === "generated_fresh"
        ? "いまのお手本は新しく作りました。違和感がなければ、そのまま練習へ戻れます。"
        : "初回はお手本ボイスを作ります。聞いたら、英文を見ながらまねます。";
  const qualityConcernRecommendedNow =
    playbackStatus === "saved" || playbackStatus === "generated_cached"
        ? "声そのものに違和感が強いなら設定を見直し、軽ければ今のお手本で進みます。同じ声のまま作り直すのは、一時的かを確かめたいときだけで十分です。"
        : "まず同じ声のまま 1 回だけ作り直して様子を見ます。軽ければ今のお手本で進み、まだ気になるなら声の設定を見直します。";

  const showsReusableAudio = playbackStatus === "saved" || playbackStatus === "generated_cached";
  const selectedVoiceStyleOption = VOICE_STYLE_PRESET_OPTIONS.find((option) => option.id === voiceStylePreset);
  const audioVoiceStyleOption = audioVoiceStylePreset
    ? VOICE_STYLE_PRESET_OPTIONS.find((option) => option.id === audioVoiceStylePreset)
    : null;
  const hasPendingVoiceStyleChange = Boolean(audioUrl && audioVoiceStylePreset && audioVoiceStylePreset !== voiceStylePreset);
  const confirmationSeconds = getListenConfirmationSeconds(audioDurationSeconds);
  const confirmationLabel = formatSecondsLabel(confirmationSeconds);
  const shouldPrioritizeRecovery = Boolean((message && messageKind === "error") || (playbackIssue && !hasConfirmedListen));
  const isPreparingPlayback = Boolean(audioUrl && !resolvedAudioUrl && !playbackIssue);
  const activeOperationLabel = loading
    ? audioUrl
      ? "お手本ボイスを更新中"
      : "お手本ボイスを作成中"
    : isPreparingPlayback
      ? "再生準備中"
      : null;
  const playbackHealthLabel = shouldPrioritizeRecovery && playbackIssue
    ? playbackIssue.kind === "playback_failed"
      ? "再生失敗"
      : "再生不安定"
    : loading
      ? audioUrl
        ? "更新中"
        : "生成中"
    : isPreparingPlayback
      ? "再生準備中"
    : hasQualityConcern
      ? "音質を見直す"
    : isPlaying
      ? "再生中"
      : hasConfirmedListen
        ? "再生確認済み"
      : audioUrl
        ? "再生待ち"
        : "音声なし";
  const playbackHealthDescription = shouldPrioritizeRecovery && playbackIssue
    ? playbackIssue.message
    : loading
      ? audioUrl
        ? "更新リクエストを送っています。少し時間がかかることがあります。"
        : "お手本ボイスを作っています。少し時間がかかることがあります。"
    : isPreparingPlayback
      ? "お手本をこの画面で再生できるように準備しています。少し待つとプレーヤーが表示されます。"
    : hasQualityConcern
      ? "音は聞こえています。今は違和感があるときの 3 択から、進む・更新する・設定を見直す、のどれにするか決める段階です。"
      : isPlaying
        ? "お手本を再生しています。短く聞いて、すぐ声に出してまねます。"
      : hasConfirmedListen
          ? `お手本は ${confirmationLabel} を目安に確認できています。英文を声に出してまねます。`
      : audioUrl
        ? `お手本は用意できています。まず ${confirmationLabel} を目安に短く聞きます。`
        : "まずお手本ボイスを作ると、この画面で再生できます。";
  const audioPlaybackUrl = resolvedAudioUrl;
  const listenGuidance = getListenPracticeGuidance({
    hasAudio: Boolean(audioUrl),
    practiceContext,
    hasConfirmedListen
  });
  const recoveryGuidance =
    message && messageKind === "error"
      ? getListenRecoveryGuidance({
          kind: "generate_failed",
          message,
          hasAudio: Boolean(audioUrl),
          practiceContext
        })
      : playbackIssue && !hasConfirmedListen
        ? getListenRecoveryGuidance({
            kind: playbackIssue.kind,
            message: playbackIssue.message,
            hasAudio: Boolean(audioUrl),
            practiceContext
          })
      : hasQualityConcern && Boolean(audioUrl)
        ? getListenRecoveryGuidance({
            kind: "quality_concern",
            message: "音は聞こえていますが、声や聞こえ方に違和感があります。",
            hasAudio: true,
            practiceContext
          })
      : null;
  const showNextAction = Boolean(audioUrl && hasConfirmedListen && !recoveryGuidance);
  const normalDecisionActions: DecisionAction[] =
    audioUrl && hasConfirmedListen && !recoveryGuidance
      ? compactActions([
          {
            id: "replay-once",
            label: "もう一度聞く",
            description: `迷うなら ${confirmationLabel} だけ聞き直して、すぐ声に出します。`,
            tone: "primary",
            emphasized: true,
            disabled: loading,
            onClick: () => {
              void handleReplay();
            }
          },
          {
            id: "return-practice",
            label: "英文を見てまねる",
            description: "下の練習エリアで声に出します。録音はそのあとです。",
            tone: "secondary",
            disabled: loading,
            onClick: () => {
              document.getElementById("listen-practice-area")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }
          },
          {
            id: "open-quality-concern",
            label: "声に違和感がある",
            description: "作り直すか、声の設定を見直すかを選びます。",
            tone: "secondary",
            disabled: loading,
            onClick: () => setHasQualityConcern(true)
          }
        ])
      : [];
  const qualityDecisionActions: DecisionAction[] =
    hasQualityConcern && Boolean(audioUrl) && recoveryGuidance
      ? compactActions(
          playbackStatus === "saved" || playbackStatus === "generated_cached"
            ? [
                nextRecordHref
                  ? {
                      id: "return-practice-area",
                      label: "今のお手本でまねる",
                      description: "違和感が軽ければ、練習エリアに戻って声に出します。",
                      tone: "primary" as const,
                      emphasized: true,
                      onClick: () => {
                        document.getElementById("listen-practice-area")?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }
                    }
                  : null,
                {
                  id: "return-setup-voice",
                  label: "声の設定を見直す",
                  description: "声そのものの印象が違うなら、作り直しより設定から見直します。",
                  tone: "secondary" as const,
                  href: setupVoiceHref
                },
                canGenerateAudio ? {
                  id: "retry-same-voice",
                  label: recoveryGuidance.primaryActionLabelJa,
                  description: "同じ声のまま一度だけ作り直して、違和感が一時的か確かめます。",
                  tone: "secondary" as const,
                  disabled: loading,
                  onClick: () => {
                    void handleGenerate();
                  }
                } : null
              ]
            : [
                nextRecordHref
                  ? {
                      id: "return-practice-area",
                      label: "今のお手本でまねる",
                      description: "違和感が軽ければ、今のお手本のまま練習を続けます。",
                      tone: "secondary" as const,
                      onClick: () => {
                        document.getElementById("listen-practice-area")?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }
                    }
                  : null,
                canGenerateAudio ? {
                  id: "retry-same-voice",
                  label: recoveryGuidance.primaryActionLabelJa,
                  description: "同じ声のまま一度だけ作り直して、違和感が一時的か確かめます。",
                  tone: "primary" as const,
                  emphasized: true,
                  disabled: loading,
                  onClick: () => {
                    void handleGenerate();
                  }
                } : null,
                {
                  id: "return-setup-voice",
                  label: "声の設定を見直す",
                  description: "作り直しても違和感が残るなら、設定から見直します。",
                  tone: "secondary" as const,
                  href: setupVoiceHref
                }
              ]
        )
      : [];

  useEffect(() => {
    if (!audioUrl) {
      setResolvedAudioUrl(null);
      return;
    }

    const sourceUrl = audioUrl;
    setResolvedAudioUrl(null);

    let active = true;
    let objectUrl: string | null = null;
    const controller = new AbortController();

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

        setResolvedAudioUrl(null);
        setIsPlaying(false);
        setPlaybackIssue({
          kind: "playback_failed",
          message: "お手本の取得に失敗しました。ログイン状態を保ったままページを再読込するか、お手本ボイスを更新してからもう一度お試しください。"
        });
        setShowPlaybackFallback(true);
        setMessage(null);
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
  }, [playbackRate, audioPlaybackUrl]);

  async function handleGenerate() {
    if (!canGenerateAudio) {
      setMessage(generateBlockedSummary ?? "いまはお手本ボイスを更新できません。先に設定を整える必要があります。");
      setMessageKind("info");
      return;
    }
    const retryingQualityConcern = hasQualityConcern;
    setLoading(true);
    setMessageKind("info");
    setMessage(audioUrl ? "お手本ボイスを更新しています。少し待ってください。" : "お手本ボイスを作っています。少し待ってください。");
    setPlaybackIssue(null);
    setIsPlaying(false);
    setHasConfirmedListen(false);
    setShowPlaybackFallback(true);
    setAudioDurationSeconds(null);
    setHasQualityConcern(false);

    try {
      const response = await fetch("/api/speak-script", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          scriptId,
          voiceId: initialVoiceId ?? undefined,
          voiceStylePreset
        })
      });

      const payload = (await response.json()) as SpeakResponse;

      if (!response.ok || !payload.ok || !payload.data) {
        setIsPlaying(false);
        setMessage(payload.message ?? "お手本ボイスを作れませんでした。");
        setMessageKind("error");
        return;
      }

      setAudioUrl(payload.data.audioUrl);
      setPlaybackStatus(payload.data.cached ? "generated_cached" : "generated_fresh");
      setVoiceLabel(payload.data.voice.label);
      setAudioVoiceStylePreset(voiceStylePreset);
      setMessage(
        retryingQualityConcern && payload.data.cached
          ? "前に作ったお手本を使いました。違和感が続く場合は声の設定を見直してください。"
          : retryingQualityConcern
            ? "同じ声のままお手本ボイスを作り直しました。違和感が残るかを1回だけ確認してから次を決めてください。"
          : payload.data.cached
            ? "前に作ったお手本を使いました。"
            : "お手本ボイスを作りました。"
      );
      setMessageKind("info");
      setPlaybackIssue(null);
      setHasConfirmedListen(false);
      setShowPlaybackFallback(true);
      setAudioDurationSeconds(null);
      setHasQualityConcern(retryingQualityConcern && payload.data.cached);
    } catch {
      setIsPlaying(false);
      setMessage("通信に失敗しました。少し待ってからお試しください。");
      setMessageKind("error");
    } finally {
      setLoading(false);
    }
  }

  async function handleReplay() {
    if (!audioPlaybackUrl) {
      setIsPlaying(false);
      setMessage("お手本を準備しています。数秒待ってからもう一度お試しください。");
      setMessageKind("info");
      return;
    }

    if (!audioRef.current) {
      return;
    }

    try {
      audioRef.current.currentTime = 0;
      audioRef.current.playbackRate = playbackRate;
      await audioRef.current.play();
    } catch {
      setIsPlaying(false);
      if (hasConfirmedListen) {
        setMessage("再確認の再生は失敗しましたが、お手本は確認済みです。練習エリアに戻るか、違和感がある時の判断を開けます。");
        setMessageKind("info");
        return;
      }
      setPlaybackIssue({
        kind: "playback_failed",
        message: "ブラウザでお手本を再生できませんでした。ページを再読込するか、お手本ボイスを更新してからもう一度お試しください。"
      });
      setShowPlaybackFallback(true);
    }
  }

  return (
    <div className="space-y-4" aria-busy={loading || isPreparingPlayback}>
      <div data-testid="listen-voice-status" className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-4 text-sm leading-6 text-ink-700">
        {voiceLabel ? `お手本の声: ${voiceLabel}` : "設定済みの声を使います。"}
        <br />
        {showsReusableAudio ? "前に作ったお手本があります。" : "まだお手本はありません。"}
      </div>

      <div data-testid="listen-playback-status" className="rounded-2xl border border-[var(--line)] bg-white px-4 py-4 text-sm leading-6 text-ink-700">
        <p className="text-xs font-semibold text-ink-500">お手本ボイス</p>
        <p className="mt-2 font-semibold text-ink-900">{playbackStateLabel}</p>
        <p className="mt-2">{playbackStateDescription}</p>
        <details className="mt-3 rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3">
          <summary className="cursor-pointer text-xs font-semibold text-ink-500">作り直しの補足</summary>
          <p className="mt-2 text-sm leading-6 text-ink-600">{updateMeaning}</p>
        </details>
      </div>

      {canGenerateAudio ? (
        <div data-testid="listen-style-preset" className="rounded-2xl border border-[var(--line)] bg-white px-4 py-4 text-sm leading-6 text-ink-700">
          <p className="text-xs font-semibold text-ink-500">声の雰囲気</p>
          <p className="mt-2 font-semibold text-ink-900">{selectedVoiceStyleOption?.label ?? voiceStylePreset}</p>
          <p className="mt-2 text-ink-600">
            {hasPendingVoiceStyleChange
              ? `今のお手本は ${audioVoiceStyleOption?.label ?? audioVoiceStylePreset}。更新すると ${selectedVoiceStyleOption?.label ?? voiceStylePreset} で作ります。`
              : "お手本ボイスの話し方を選びます。聞く速さだけなら、下の再生速度を使います。"}
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-4">
            {VOICE_STYLE_PRESET_OPTIONS.map((option) => {
              const selected = option.id === voiceStylePreset;

              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setVoiceStylePreset(option.id)}
                  disabled={loading}
                  aria-pressed={selected}
                  className={`rounded-2xl border px-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    selected
                      ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                      : "border-[var(--line)] bg-ink-50 text-ink-800 hover:bg-white"
                  }`}
                >
                  <span className={`block text-sm font-semibold ${selected ? "text-white" : "text-ink-900"}`}>{option.label}</span>
                  <span className={`mt-1 block text-xs leading-5 ${selected ? "text-white/85" : "text-ink-600"}`}>{option.summary}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div
        data-testid="listen-current-step"
        className={`rounded-2xl border px-4 py-4 text-sm leading-6 ${getGuidanceToneClasses(recoveryGuidance?.tone ?? listenGuidance.tone)}`}
      >
        <p className="text-xs font-semibold text-ink-500">今やること</p>
        <p className="mt-2 font-semibold text-ink-900">{playbackHealthLabel}</p>
        <p className="mt-2 text-ink-700">{playbackHealthDescription}</p>
      </div>

      {showNextAction ? (
        <section data-testid="listen-next-action" className={`rounded-2xl border px-4 py-4 ${getGuidanceToneClasses("steady")}`}>
          <p className="text-xs font-semibold text-ink-500">次にやること</p>
          <h3 className="mt-2 text-lg font-semibold text-ink-900">
            {playbackStatus === "saved" || playbackStatus === "generated_cached" ? "このお手本でまねる" : "聞いたら声に出す"}
          </h3>
          <p className="mt-3 text-sm leading-6 text-ink-800">
            {playbackStatus === "saved" || playbackStatus === "generated_cached"
                ? "違和感がなければ、下の練習エリアで英文を見ながら声に出します。"
              : "聞いたら、下の練習エリアで英文を見ながら声に出します。"}
          </p>
          <DecisionActionGrid actions={normalDecisionActions} />
          <p className="mt-3 text-sm leading-6 text-ink-600">録音は、声に出して納得してからで十分です。</p>
        </section>
      ) : null}

      {!canGenerateAudio && generateBlockedSummary ? (
        <div data-testid="listen-generate-blocked" className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-4 text-sm leading-6 text-ink-700">
          <p className="text-xs font-semibold text-ink-500">うまくいかない時</p>
          <p className="mt-2">{generateBlockedSummary}</p>
        </div>
      ) : null}

      {!recoveryGuidance ? (
        <section data-testid="listen-next-step" className={`rounded-2xl border px-4 py-4 ${getGuidanceToneClasses(listenGuidance.tone)}`}>
          <p className="text-xs font-semibold text-ink-500">次にやること</p>
          <h3 className="mt-2 text-lg font-semibold text-ink-900">{listenGuidance.actionLabelJa}</h3>
          <p className="mt-2 text-xs uppercase tracking-[0.18em] text-ink-500">{getGuidanceActionBadgeLabel(listenGuidance.actionKind)}</p>
          <p className="mt-3 text-sm leading-6 text-ink-800">{listenGuidance.summaryJa}</p>
          <p className="mt-3 text-sm leading-6 text-ink-700">{listenGuidance.executionCueJa}</p>
          <details className="mt-3 rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold text-ink-700">練習メモを見る</summary>
            <p className="mt-3 text-sm leading-6 text-ink-600">{listenGuidance.reasonJa}</p>
            {listenGuidance.followupCueJa ? (
              <p className="mt-2 text-sm leading-6 text-ink-600">次に record へ戻ったら: {listenGuidance.followupCueJa}</p>
            ) : null}
            {listenGuidance.focusReasonJa ? (
              <p className="mt-3 text-sm leading-6 text-ink-600">今これを優先する理由: {listenGuidance.focusReasonJa}</p>
            ) : null}
            {listenGuidance.focusSummaryJa ? (
              <p className="mt-3 text-sm leading-6 text-ink-700">{listenGuidance.focusSummaryJa}</p>
            ) : null}
          </details>
          {listenGuidance.focusWords.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {listenGuidance.focusWords.map((word) => (
                <span key={word} className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-xs font-semibold text-ink-700">
                  {word}
                </span>
              ))}
            </div>
          ) : null}
        </section>
      ) : (
        <section data-testid="listen-recovery-guidance" className={`rounded-2xl border px-4 py-4 ${getGuidanceToneClasses(recoveryGuidance.tone)}`}>
          <p className="text-xs font-semibold text-ink-500">{hasQualityConcern ? "違和感がある時" : "うまくいかない時"}</p>
          <h3 className="mt-2 text-lg font-semibold text-ink-900">{recoveryGuidance.titleJa}</h3>
          <p className="mt-2 text-xs uppercase tracking-[0.18em] text-ink-500">{getGuidanceActionBadgeLabel(recoveryGuidance.actionKind)}</p>
          <p className="mt-3 text-sm leading-6 text-ink-800">{recoveryGuidance.summaryJa}</p>
          <p className="mt-3 text-sm leading-6 text-ink-700">{recoveryGuidance.executionCueJa}</p>
          <details className="mt-3 rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold text-ink-700">復旧メモを見る</summary>
            <p className="mt-3 text-sm leading-6 text-ink-600">{recoveryGuidance.reasonJa}</p>
            {recoveryGuidance.followupCueJa ? (
              <p className="mt-2 text-sm leading-6 text-ink-600">復旧後に record へ戻ったら: {recoveryGuidance.followupCueJa}</p>
            ) : null}
            {recoveryGuidance.focusReasonJa ? (
              <p className="mt-3 text-sm leading-6 text-ink-600">今これを優先する理由: {recoveryGuidance.focusReasonJa}</p>
            ) : null}
            {recoveryGuidance.focusSummaryJa ? (
              <p className="mt-3 text-sm leading-6 text-ink-700">{recoveryGuidance.focusSummaryJa}</p>
            ) : null}
          </details>
          {recoveryGuidance.focusWords.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {recoveryGuidance.focusWords.map((word) => (
                <span key={word} className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-xs font-semibold text-ink-700">
                  {word}
                </span>
              ))}
            </div>
          ) : null}
          {playbackIssue && showPlaybackFallback ? (
            <div className="mt-4 rounded-2xl border border-[var(--line)] bg-white px-4 py-4 text-sm leading-6 text-ink-700">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-500">再生の逃がし方</p>
              <p className="mt-2">このブラウザ内の再生が不安定でも、音声ファイル自体は用意できている可能性があります。</p>
              <p className="mt-2">まず新しいタブで 1 回だけ確認し、まだ難しければお手本ボイスを更新してから練習へ戻ります。</p>
            </div>
          ) : null}
          {qualityDecisionActions.length > 0 ? (
            <>
              <div className="mt-4 rounded-2xl border border-[var(--line)] bg-white px-4 py-4 text-sm leading-6 text-ink-700">
                <p className="text-xs uppercase tracking-[0.18em] text-ink-500">いまの優先判断</p>
                <p className="mt-2">{qualityConcernRecommendedNow}</p>
              </div>
              <div className="mt-4 rounded-2xl border border-[var(--line)] bg-white px-4 py-4 text-sm leading-6 text-ink-700">
                <p className="text-xs uppercase tracking-[0.18em] text-ink-500">判断の目安</p>
                <p className="mt-2">
                  {playbackStatus === "saved" || playbackStatus === "generated_cached"
                    ? "違和感が小さければ今のお手本で進みます。声そのものが違うなら先に設定を見直し、一時的かだけ見たいなら同じ声のまま試します。"
                    : "違和感が小さければ今のお手本で進みます。作り直しで様子を見たいなら同じ声のまま試し、声そのものが違うなら設定を見直します。"}
                </p>
              </div>
              <DecisionActionGrid actions={qualityDecisionActions} />
              <p className="mt-3 text-sm leading-6 text-ink-600">迷ったら `いまの優先判断` で順番を見て、更新の意味だけは上の `音声状態` に戻って確認します。</p>
            </>
          ) : (
            <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
              {recoveryGuidance.actionKind === "settings" ? (
                <Link href={setupVoiceHref} className="rounded-2xl bg-[var(--accent)] px-4 py-3 text-white">
                  {recoveryGuidance.primaryActionLabelJa}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    void handleGenerate();
                  }}
                  disabled={loading}
                  className="inline-flex items-center justify-center rounded-2xl bg-[var(--accent)] px-4 py-3 text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (audioUrl ? "更新中..." : "生成中...") : recoveryGuidance.primaryActionLabelJa}
                </button>
              )}
              {audioPlaybackUrl && recoveryGuidance.actionKind === "listen" ? (
                <a
                  href={audioPlaybackUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-ink-800"
                >
                  新しいタブで再生する
                </a>
              ) : null}
            </div>
          )}
        </section>
      )}

      {activeOperationLabel ? (
        <div
          data-testid="listen-operation-status"
          role="status"
          aria-live="polite"
          className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3 text-sm font-semibold text-ink-800"
        >
          {activeOperationLabel}です。操作は受け付けました。
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {!recoveryGuidance && canGenerateAudio ? (
          <div className="flex flex-col items-start gap-2">
            <button
              data-testid="listen-generate-button"
              type="button"
              onClick={handleGenerate}
              disabled={loading}
              className="inline-flex items-center justify-center rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (audioUrl ? "作り直し中..." : "作成中...") : audioUrl ? "お手本ボイスを作り直す" : "お手本ボイスを作る"}
            </button>
            <p className="rounded-full border border-[var(--line)] bg-ink-50 px-3 py-1 text-xs font-semibold text-ink-600">
              ベータでは お手本ボイス生成は10回まで
            </p>
          </div>
        ) : null}
        {audioUrl ? (
          <button
            type="button"
            onClick={() => {
              setRestorableAudio({
                url: audioUrl,
                status: playbackStatus,
                voiceLabel,
                voiceStylePreset: audioVoiceStylePreset
              });
              setAudioUrl(null);
              setAudioVoiceStylePreset(null);
              setPlaybackStatus("empty");
              setPlaybackIssue(null);
              setIsPlaying(false);
              setHasConfirmedListen(false);
              setShowPlaybackFallback(true);
              setAudioDurationSeconds(null);
              setHasQualityConcern(false);
                  setMessage("表示中のお手本を閉じました。必要ならもう一度作れます。");
              setMessageKind("info");
            }}
            className="inline-flex items-center justify-center rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-ink-800 transition hover:bg-ink-50"
          >
            音声を閉じる
          </button>
        ) : null}
        {!audioUrl && restorableAudio ? (
          <button
            type="button"
            onClick={() => {
              setAudioUrl(restorableAudio.url);
              setPlaybackStatus(restorableAudio.status);
              setVoiceLabel(restorableAudio.voiceLabel);
              setAudioVoiceStylePreset(restorableAudio.voiceStylePreset);
              setPlaybackIssue(null);
              setIsPlaying(false);
              setShowPlaybackFallback(true);
              setMessage("閉じたお手本を戻しました。必要ならこのまま練習を続けられます。");
              setMessageKind("info");
              setRestorableAudio(null);
            }}
            className="inline-flex items-center justify-center rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-ink-800 transition hover:bg-ink-50"
          >
            閉じた音声を戻す
          </button>
        ) : null}
        {message ? (
          <button
            type="button"
            onClick={() => setMessage(null)}
            className="inline-flex items-center justify-center rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-ink-800 transition hover:bg-ink-50"
          >
            メッセージを閉じる
          </button>
        ) : null}
        {playbackIssue && showPlaybackFallback ? (
          <button
            type="button"
            onClick={() => setShowPlaybackFallback(false)}
            className="inline-flex items-center justify-center rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-ink-800 transition hover:bg-ink-50"
          >
            再生補足を閉じる
          </button>
        ) : null}
        {hasQualityConcern ? (
          <button
            type="button"
            onClick={() => setHasQualityConcern(false)}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-ink-800 transition hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            違和感ガイドを閉じる
          </button>
        ) : null}
      </div>

      {audioUrl ? (
        <div data-testid="listen-audio-block" className="space-y-3 rounded-2xl border border-[var(--line)] bg-white px-4 py-4">
          <PlaybackRateControl
            testId="listen-playback-rate"
            value={playbackRate}
            onChange={setPlaybackRate}
            label="聞く速さ"
            description="音声を作り直さず、この画面で聞く速さだけ変えます。"
            disabled={!audioPlaybackUrl}
          />
          {audioPlaybackUrl ? (
            <audio
              data-testid="listen-audio-element"
              key={audioPlaybackUrl}
              ref={audioRef}
              src={audioPlaybackUrl}
              controls
              preload="none"
              className="w-full"
              onLoadedMetadata={(event) => {
                const nextDuration = Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : null;
                event.currentTarget.playbackRate = playbackRate;
                setAudioDurationSeconds(nextDuration);
              }}
              onCanPlay={() => {
                setPlaybackIssue(null);
              }}
              onPlay={() => {
                setPlaybackIssue(null);
                setIsPlaying(true);
              }}
              onPause={() => setIsPlaying(false)}
              onEnded={() => {
                setIsPlaying(false);
                setHasConfirmedListen(true);
                setPlaybackIssue(null);
                setShowPlaybackFallback(true);
              }}
              onTimeUpdate={(event) => {
                if (!hasConfirmedListen && event.currentTarget.currentTime >= confirmationSeconds) {
                  setHasConfirmedListen(true);
                  setPlaybackIssue(null);
                  setShowPlaybackFallback(true);
                }
              }}
              onError={() => {
                setIsPlaying(false);
                if (hasConfirmedListen) {
                  setMessage("再生に失敗しましたが、お手本は確認済みです。練習エリアに戻るか、違和感がある時の判断を開けます。");
                  setMessageKind("info");
                  return;
                }
                setPlaybackIssue({
                  kind: "playback_failed",
                  message: "ブラウザでお手本を再生できませんでした。ページを再読込するか、お手本ボイスを更新してからもう一度お試しください。"
                });
                setShowPlaybackFallback(true);
                setMessage(null);
              }}
              onStalled={() => {
                setIsPlaying(false);
                if (hasConfirmedListen) {
                  setMessage("再確認の再生が不安定でしたが、お手本は確認済みです。必要ならもう一度聞くか、練習へ戻れます。");
                  setMessageKind("info");
                  return;
                }
                setPlaybackIssue({
                  kind: "playback_unstable",
                  message: "お手本の再生が途中で止まりました。少し待つか、お手本ボイスを更新してから聞き直してください。"
                });
                setShowPlaybackFallback(true);
                setMessage(null);
              }}
              onWaiting={() => {
                setIsPlaying(false);
                if (hasConfirmedListen) {
                  setMessage("再確認の読み込みが不安定でしたが、お手本は確認済みです。必要ならもう一度聞くか、練習へ戻れます。");
                  setMessageKind("info");
                  return;
                }
                setPlaybackIssue({
                  kind: "playback_unstable",
                  message: "お手本の読み込みが不安定です。少し待つか、お手本ボイスを更新してから短く聞き直してください。"
                });
                setShowPlaybackFallback(true);
                setMessage(null);
              }}
            >
              お使いのブラウザでは音声を再生できません。お手本ボイスを更新するか、新しいタブで再生してください。
            </audio>
          ) : (
            <div className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-4 text-sm leading-6 text-ink-700">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-500">準備中</p>
              <p className="mt-2">お手本を再生できる状態にしています。数秒待てば、この画面のまま再生できます。</p>
            </div>
          )}
          <p className="text-xs uppercase tracking-[0.18em] text-ink-500">
            {playbackStatus === "saved"
              ? "保存済み"
              : playbackStatus === "generated_cached"
                ? "保存済み"
                : "新しいお手本"}
          </p>
          <SavedModelAudioControl scriptId={scriptId} audioUrl={audioUrl} />
        </div>
      ) : null}

      {message ? <p data-testid="listen-message" className={`text-sm ${messageKind === "error" ? "text-amber-800" : "text-ink-600"}`}>{message}</p> : null}
    </div>
  );
}
