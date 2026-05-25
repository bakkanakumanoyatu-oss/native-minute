"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { VoiceProviderRequirements } from "@/providers/voice";

function isOpenAiEntitlementMessage(message: string | null) {
  if (!message) {
    return false;
  }

  const normalized = message.toLowerCase();
  return (
    normalized.includes("custom voice endpoint") ||
    normalized.includes("does not have access to this endpoint") ||
    normalized.includes("entitlement") ||
    normalized.includes("権限不足")
  );
}

function isElevenLabsMessage(message: string | null) {
  if (!message) {
    return false;
  }

  return message.toLowerCase().includes("elevenlabs");
}

function isElevenLabsVerificationMessage(message: string | null) {
  if (!message) {
    return false;
  }

  const normalized = message.toLowerCase();
  return normalized.includes("verification required") || normalized.includes("pending verification");
}

function isElevenLabsSampleMessage(message: string | null) {
  if (!message) {
    return false;
  }

  const normalized = message.toLowerCase();
  return (
    normalized.includes("storage://voice-samples") ||
    normalized.includes("お手本ボイス sample") ||
    normalized.includes("sample を受け付け") ||
    normalized.includes("sample の形式") ||
    normalized.includes("sample をアップロード") ||
    normalized.includes("sample を再アップロード")
  );
}

function isElevenLabsAccountOrLimitMessage(message: string | null) {
  if (!message) {
    return false;
  }

  const normalized = message.toLowerCase();
  return (
    normalized.includes("rate limit") ||
    normalized.includes("利用枠") ||
    normalized.includes("課金") ||
    normalized.includes("billing") ||
    normalized.includes("quota") ||
    normalized.includes("plan") ||
    normalized.includes("作成権限") ||
    normalized.includes("api key") ||
    normalized.includes("voice cloning 利用可否")
  );
}

export function CreateVoiceForm({
  consentId,
  requirements
}: {
  consentId: string;
  requirements: VoiceProviderRequirements;
}) {
  const router = useRouter();
  const [label, setLabel] = useState("自分の声");
  const [sampleAudioFile, setSampleAudioFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const trimmedLabel = label.trim();
  const isMissingRequiredLabel = trimmedLabel.length === 0;
  const requiresUploadedSample = requirements.requiresSampleAudio;
  const voiceLabel = requirements.voiceLabel;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (requiresUploadedSample && !sampleAudioFile) {
        setMessage("お手本ボイス用に、自分の声の録音ファイルを選んでください。");
        return;
      }

      let sampleAudio:
        | {
            audioPath: string;
            contentType?: string;
            byteLength?: number;
          }
        | undefined;

      if (sampleAudioFile) {
        const uploadForm = new FormData();
        uploadForm.append("consentId", consentId);
        uploadForm.append("file", sampleAudioFile);

        const uploadResponse = await fetch("/api/uploads/voice-sample", {
          method: "POST",
          credentials: "same-origin",
          body: uploadForm
        });

        const uploadPayload = (await uploadResponse.json()) as {
          ok: boolean;
          message?: string;
          data?: {
            sampleAudio?: {
              audioPath: string;
              contentType?: string;
              byteLength?: number;
            };
          };
        };

        if (!uploadResponse.ok || !uploadPayload.ok || !uploadPayload.data?.sampleAudio) {
          setMessage(uploadPayload.message ?? "お手本ボイス用の録音を保存できませんでした。");
          return;
        }

        sampleAudio = uploadPayload.data.sampleAudio;
      }

      const response = await fetch("/api/create-voice", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          consentId,
          label: trimmedLabel,
          sampleAudio
        })
      });

      const payload = (await response.json()) as { ok: boolean; message?: string };

      if (!response.ok || !payload.ok) {
        setMessage(payload.message ?? "お手本ボイスを作れませんでした。");
        return;
      }

      setMessage("お手本ボイスを作りました。次の入口から練習へ進めます。");
      router.refresh();
    } catch {
      setMessage("通信に失敗しました。少し待ってからお試しください。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form data-testid="voice-create-form" className="space-y-4" onSubmit={handleSubmit}>
      <label className="block space-y-2">
        <span className="text-sm font-medium text-ink-700">お手本ボイスの名前</span>
        <input
          data-testid="voice-create-label"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          required
          placeholder="自分用の声"
          className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-[var(--accent)]"
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-ink-700">自分の声の録音ファイル ({requiresUploadedSample ? "必須" : "任意"})</span>
        <input
          data-testid="voice-create-sample-file"
          type="file"
          accept="audio/webm,audio/wav,audio/wave,audio/x-wav,audio/mp4,audio/x-m4a,audio/mpeg,audio/ogg"
          onChange={(event) => setSampleAudioFile(event.target.files?.[0] ?? null)}
          className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm shadow-sm outline-none transition file:mr-4 file:rounded-xl file:border-0 file:bg-ink-100 file:px-3 file:py-2 file:text-sm file:font-medium focus:border-[var(--accent)]"
        />
        {sampleAudioFile ? <span className="block text-xs font-semibold text-[var(--accent-strong)]">選択済み: {sampleAudioFile.name}</span> : null}
      </label>

      <button
        data-testid="voice-create-submit"
        type="submit"
        disabled={loading || isMissingRequiredLabel}
        aria-busy={loading}
        className="inline-flex items-center justify-center rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "作成中..." : "自分の声を録音してお手本ボイスを作る"}
      </button>

      <details className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-xs leading-5 text-ink-600">
        <summary className="cursor-pointer font-semibold text-ink-800">うまくいかない時</summary>
        <p className="mt-3">
          {requiresUploadedSample
            ? `${voiceLabel} では自分の声の録音が必要です。通常はファイルを選ぶだけで進めます。`
            : "通常は録音ファイルを選ぶだけで進めます。保存済み参照は確認用です。"}
        </p>
        {requirements.entitlementSensitive ? (
          <p className="mt-2">
            声の作成権限が無い場合は、この画面で止まることがあります。設定を確認してからもう一度試してください。
          </p>
        ) : null}
      </details>
      {message ? (
        <button
          type="button"
          onClick={() => setMessage(null)}
          className="inline-flex items-center justify-center rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-ink-800 transition hover:bg-ink-50"
        >
          メッセージを閉じる
        </button>
      ) : null}
      {message ? <p data-testid="voice-create-message" className="text-sm text-ink-600">{message}</p> : null}
      {requirements.entitlementSensitive && isOpenAiEntitlementMessage(message) ? (
        <div className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-4 text-sm leading-6 text-ink-700">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-500">うまくいかない時</p>
          <ol className="mt-2 space-y-2">
            <li>1. 声の作成権限を確認する。</li>
            <li>2. 先に練習を進めたい場合は、開発用の声に切り替えてから再試行する。</li>
          </ol>
        </div>
      ) : null}
      {requirements.provider === "elevenlabs" && isElevenLabsMessage(message) ? (
        <div className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-4 text-sm leading-6 text-ink-700">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-500">うまくいかない時</p>
          {isElevenLabsVerificationMessage(message) ? (
            <ol className="mt-2 space-y-2">
              <li>1. 音声サービス側の本人確認を完了する。</li>
              <li>2. 完了後にこの画面へ戻り、同じ録音か更新した録音で作り直す。</li>
              <li>3. 先に練習を進めたい場合は、開発用の声に切り替えてから再試行する。</li>
            </ol>
          ) : isElevenLabsSampleMessage(message) ? (
            <ol className="mt-2 space-y-2">
              <li>1. 自分の声の録音をアップロードし直す。</li>
              <li>2. 形式・長さ・内容を見直し、別の録音でもう一度作成する。</li>
              <li>3. 何度も止まる場合は、先に練習できる設定へ切り替える。</li>
            </ol>
          ) : isElevenLabsAccountOrLimitMessage(message) ? (
            <ol className="mt-2 space-y-2">
              <li>1. 音声サービス側の利用可否を確認する。</li>
              <li>2. rate limit の場合は少し待ってから 1 回だけ再試行する。</li>
              <li>3. 確認が必要な間は、先に練習できる設定へ切り替える。</li>
            </ol>
          ) : (
            <ol className="mt-2 space-y-2">
              <li>1. 音声サービス側の状態を確認する。</li>
              <li>2. 自分の声の録音を変えてもう一度作る。</li>
              <li>3. 先に練習を進めたい場合は、開発用の声へ切り替える。</li>
            </ol>
          )}
        </div>
      ) : null}
    </form>
  );
}
