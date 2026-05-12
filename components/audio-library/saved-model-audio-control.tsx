"use client";

import { BookmarkCheck, BookmarkPlus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { parseScriptAudioPlaybackPath } from "@/lib/voice-playback-path";

type SavedModelAudio = {
  id: string;
  script_audio_id: string;
  slot: number;
  label: string;
  saved_at?: string | null;
  metadata?: unknown;
};

type SavedModelAudiosResponse = {
  ok: boolean;
  message?: string;
  code?: string;
  data?: {
    savedModelAudios?: SavedModelAudio[];
    savedModelAudio?: SavedModelAudio;
    deleted?: boolean;
  };
};

type SavedModelAudioControlProps = {
  scriptId: string;
  audioUrl: string | null;
};

function getUserFacingAudioLibraryError(payload: SavedModelAudiosResponse | null, fallback: string) {
  if (!payload) {
    return fallback;
  }

  if (payload.code === "library_full") {
    return "保存済み見本音声は最大5件です。いずれかを外してから保存してください。";
  }

  if (payload.code === "already_saved") {
    return "この見本音声はすでに保存されています。";
  }

  if (payload.code === "invalid_slot") {
    return "保存 slot を確認してください。";
  }

  return payload.message ?? fallback;
}

function getMetadataRecord(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  return metadata as Record<string, unknown>;
}

function getMetadataString(metadata: unknown, key: string) {
  const value = getMetadataRecord(metadata)?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getMetadataNumber(metadata: unknown, key: string) {
  const value = getMetadataRecord(metadata)?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatSavedAt(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function getModelAudioConditionSummary(audio: SavedModelAudio | null) {
  if (!audio) {
    return null;
  }

  const styleLabel = getMetadataString(audio.metadata, "voice_style_label");
  const provider = getMetadataString(audio.metadata, "provider");
  const voiceLabel = getMetadataString(audio.metadata, "voice_label");
  const parts = [
    styleLabel ? `style: ${styleLabel}` : "style: 旧データ / 詳細なし",
    provider ? `provider: ${provider}` : "provider: 不明",
    voiceLabel ? `voice: ${voiceLabel}` : null
  ];

  return parts.filter(Boolean).join(" / ");
}

function getModelAudioConditionDetails(audio: SavedModelAudio) {
  const targetSpeed = getMetadataString(audio.metadata, "target_speed");
  const targetWpm = getMetadataNumber(audio.metadata, "target_wpm");
  const pauseDensity = getMetadataString(audio.metadata, "pause_density");
  const cacheKeyPrefix = getMetadataString(audio.metadata, "cache_key_prefix");
  const contentType = getMetadataString(audio.metadata, "content_type");
  const byteLength = getMetadataNumber(audio.metadata, "byte_length");
  const generatedAt = formatSavedAt(getMetadataString(audio.metadata, "generated_at"));
  const savedAt = formatSavedAt(audio.saved_at);

  return [
    targetSpeed ? `speed intent: ${targetSpeed}` : null,
    targetWpm ? `target: ${targetWpm} wpm` : null,
    pauseDensity ? `pause: ${pauseDensity}` : null,
    generatedAt ? `generated: ${generatedAt}` : null,
    savedAt ? `saved: ${savedAt}` : null,
    contentType ? `type: ${contentType}` : null,
    byteLength ? `${Math.round(byteLength / 1024)}KB` : null,
    cacheKeyPrefix ? `cache ref: ${cacheKeyPrefix}` : null
  ].filter(Boolean);
}

export function SavedModelAudioControl({ scriptId, audioUrl }: SavedModelAudioControlProps) {
  const scriptAudioId = useMemo(() => (audioUrl ? parseScriptAudioPlaybackPath(audioUrl) : null), [audioUrl]);
  const [savedModelAudios, setSavedModelAudios] = useState<SavedModelAudio[]>([]);
  const [loading, setLoading] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const currentSavedAudio = scriptAudioId
    ? savedModelAudios.find((audio) => audio.script_audio_id === scriptAudioId) ?? null
    : null;
  const conditionSummary = getModelAudioConditionSummary(currentSavedAudio);
  const conditionDetails = currentSavedAudio ? getModelAudioConditionDetails(currentSavedAudio) : [];
  const hasStyleMetadata = Boolean(currentSavedAudio && getMetadataString(currentSavedAudio.metadata, "voice_style_label"));
  const operationLabel = mutating
    ? currentSavedAudio
      ? "保存解除中"
      : "保存中"
    : loading
      ? "保存状態確認中"
      : null;

  async function refreshSavedModelAudios() {
    setLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/scripts/${encodeURIComponent(scriptId)}/saved-model-audios`, {
        credentials: "same-origin"
      });
      const payload = (await response.json().catch(() => null)) as SavedModelAudiosResponse | null;

      if (!response.ok || !payload?.ok || !Array.isArray(payload.data?.savedModelAudios)) {
        setErrorMessage(getUserFacingAudioLibraryError(payload, "保存済み見本音声を取得できませんでした。"));
        return;
      }

      setSavedModelAudios(payload.data.savedModelAudios);
    } catch {
      setErrorMessage("保存済み見本音声の取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!audioUrl) {
      setMessage(null);
      setErrorMessage(null);
      return;
    }

    void refreshSavedModelAudios();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl, scriptId]);

  async function handleSave() {
    if (!scriptAudioId) {
      setErrorMessage("保存できる見本音声 ID を確認できませんでした。見本音声を更新してからもう一度お試しください。");
      return;
    }

    setMutating(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/scripts/${encodeURIComponent(scriptId)}/saved-model-audios`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "same-origin",
        body: JSON.stringify({
          scriptAudioId
        })
      });
      const payload = (await response.json().catch(() => null)) as SavedModelAudiosResponse | null;

      if (!response.ok || !payload?.ok || !payload.data?.savedModelAudio) {
        setErrorMessage(getUserFacingAudioLibraryError(payload, "見本音声を保存できませんでした。"));
        return;
      }

      const savedModelAudio = payload.data.savedModelAudio;
      setSavedModelAudios((current) => {
        const withoutDuplicate = current.filter((audio) => audio.id !== savedModelAudio.id);
        return [...withoutDuplicate, savedModelAudio].sort((a, b) => a.slot - b.slot);
      });
      setMessage("Audio Library に保存しました。保存操作は quota 消費ではありません。");
    } catch {
      setErrorMessage("見本音声を保存できませんでした。通信状態を確認してもう一度お試しください。");
    } finally {
      setMutating(false);
    }
  }

  async function handleUnsave() {
    if (!currentSavedAudio) {
      return;
    }

    setMutating(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/scripts/${encodeURIComponent(scriptId)}/saved-model-audios/${encodeURIComponent(currentSavedAudio.id)}`,
        {
          method: "DELETE",
          credentials: "same-origin"
        }
      );
      const payload = (await response.json().catch(() => null)) as SavedModelAudiosResponse | null;

      if (!response.ok || !payload?.ok) {
        setErrorMessage(getUserFacingAudioLibraryError(payload, "見本音声の保存を外せませんでした。"));
        return;
      }

      setSavedModelAudios((current) => current.filter((audio) => audio.id !== currentSavedAudio.id));
      setMessage("Audio Library から外しました。元の見本音声 cache は削除していません。");
    } catch {
      setErrorMessage("見本音声の保存を外せませんでした。通信状態を確認してもう一度お試しください。");
    } finally {
      setMutating(false);
    }
  }

  if (!audioUrl) {
    return null;
  }

  return (
    <div data-testid="saved-model-audio-control" className="border-t border-[var(--line)] pt-4" aria-busy={mutating || loading}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-ink-500">Audio Library</p>
          <p className="mt-2 text-sm leading-6 text-ink-700">
            {currentSavedAudio
              ? `この見本音声は slot ${currentSavedAudio.slot} に保存済みです。`
              : "あとで聞き返したい見本だけを保存できます。"}
          </p>
          <p data-testid="saved-model-audio-condition-summary" className="mt-1 text-xs leading-5 text-ink-600">
            {currentSavedAudio
              ? `保存条件: ${conditionSummary}`
              : "保存後に style / provider / voice がここに表示されます。"}
          </p>
          <details className="mt-2 text-xs leading-5 text-ink-500">
            <summary className="cursor-pointer font-semibold text-ink-600">保存条件を見る</summary>
            {conditionDetails.length > 0 ? (
              <p className="mt-1">作成条件: {conditionDetails.join(" / ")}</p>
            ) : null}
            {currentSavedAudio && !hasStyleMetadata ? (
              <p className="mt-1">style: 旧データ / 詳細なし。新しく保存し直した見本音声では、分かる範囲で generation style を表示します。</p>
            ) : null}
            <p className="mt-1">
              Audio Library は学習用の pin です。保存 / 保存解除は quota 消費ではなく、保存を外しても元の見本音声 cache は残ります。聞く速さは今この画面だけの設定で、保存済み音声の identity には含めません。
            </p>
          </details>
        </div>
        {currentSavedAudio ? (
          <button
            type="button"
            onClick={handleUnsave}
            disabled={mutating}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-ink-800 transition hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <X aria-hidden className="h-4 w-4" />
            {mutating ? "保存解除中..." : "保存を外す"}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSave}
            disabled={mutating || loading || !scriptAudioId}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {scriptAudioId ? <BookmarkPlus aria-hidden className="h-4 w-4" /> : <BookmarkCheck aria-hidden className="h-4 w-4" />}
            {mutating ? "保存中..." : loading ? "確認中..." : "この見本音声を保存"}
          </button>
        )}
      </div>
      {operationLabel ? (
        <p role="status" aria-live="polite" className="mt-3 text-sm font-semibold text-ink-600">
          {operationLabel}です。操作は受け付けています。
        </p>
      ) : null}
      {message ? <p className="mt-3 text-sm leading-6 text-ink-600">{message}</p> : null}
      {errorMessage ? <p className="mt-3 text-sm leading-6 text-amber-800">{errorMessage}</p> : null}
    </div>
  );
}
