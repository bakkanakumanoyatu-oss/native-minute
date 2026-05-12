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

export function VoiceConsentForm({ requirements }: { requirements: VoiceProviderRequirements }) {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("en-US");
  const [recordingFile, setRecordingFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const trimmedName = name.trim();
  const trimmedLanguage = language.trim();
  const requiresRecording = requirements.requiresConsentRecording;
  const voiceLabel = requirements.voiceLabel;
  const fallbackProvider = requirements.recommendedDevelopmentFallbackProvider ?? "mock";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (requiresRecording && (!recordingFile || !trimmedName || !trimmedLanguage)) {
        setMessage(`${voiceLabel} では同意者名・言語・同意録音が必要です。`);
        return;
      }

      let recording:
        | {
            audioPath: string;
            contentType?: string;
            byteLength?: number;
          }
        | undefined;

      if (recordingFile) {
        if (!trimmedName || !trimmedLanguage) {
          setMessage("同意録音を使うときは、同意者名と言語も入力してください。");
          return;
        }

        const uploadForm = new FormData();
        uploadForm.append("file", recordingFile);

        const uploadResponse = await fetch("/api/uploads/voice-consent", {
          method: "POST",
          credentials: "same-origin",
          body: uploadForm
        });

        const uploadPayload = (await uploadResponse.json()) as {
          ok: boolean;
          message?: string;
          data?: {
            recording?: {
              audioPath: string;
              contentType?: string;
              byteLength?: number;
            };
          };
        };

        if (!uploadResponse.ok || !uploadPayload.ok || !uploadPayload.data?.recording) {
          setMessage(uploadPayload.message ?? "同意録音の保存に失敗しました。");
          return;
        }

        recording = uploadPayload.data.recording;
      }

      const response = await fetch("/api/voice-consent", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          accepted,
          name: trimmedName || undefined,
          language: trimmedLanguage || undefined,
          recording
        })
      });

      const payload = (await response.json()) as { ok: boolean; message?: string };

      if (!response.ok || !payload.ok) {
        setMessage(payload.message ?? "同意の保存に失敗しました。");
        return;
      }

      setMessage("同意を記録しました。次はこのページで voice を作成します。");
      router.refresh();
    } catch {
      setMessage("通信に失敗しました。少し待ってからお試しください。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form data-testid="voice-consent-form" className="space-y-4" onSubmit={handleSubmit}>
      <label className="flex items-start gap-3 rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-4 text-sm leading-6 text-ink-700">
        <input
          data-testid="voice-consent-checkbox"
          checked={accepted}
          onChange={(event) => setAccepted(event.target.checked)}
          type="checkbox"
          className="mt-1 size-4 rounded border-[var(--line)]"
        />
        <span>見本音声生成のために、自分用の voice を作成することに同意します。</span>
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-ink-700">同意者名 ({requiresRecording ? "必須" : "任意"})</span>
        <input
          data-testid="voice-consent-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="例: Taro Yamada"
          className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-[var(--accent)]"
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-ink-700">同意音声の言語 ({requiresRecording ? "必須" : "任意"})</span>
        <input
          data-testid="voice-consent-language"
          value={language}
          onChange={(event) => setLanguage(event.target.value)}
          placeholder="en-US"
          className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-[var(--accent)]"
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-ink-700">同意録音ファイル ({requiresRecording ? "必須" : "任意"})</span>
        <input
          data-testid="voice-consent-file"
          type="file"
          accept="audio/webm,audio/wav,audio/wave,audio/x-wav,audio/mp4,audio/x-m4a,audio/mpeg,audio/ogg,audio/aac,audio/flac"
          onChange={(event) => setRecordingFile(event.target.files?.[0] ?? null)}
          className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm shadow-sm outline-none transition file:mr-4 file:rounded-xl file:border-0 file:bg-ink-100 file:px-3 file:py-2 file:text-sm file:font-medium focus:border-[var(--accent)]"
        />
      </label>

      <button
        data-testid="voice-consent-submit"
        type="submit"
        disabled={loading || !accepted}
        className="inline-flex items-center justify-center rounded-2xl bg-[var(--ink)] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "記録中..." : "同意を記録して voice 作成へ"}
      </button>

      <p className="text-xs leading-5 text-ink-500">
        {requiresRecording
          ? `${voiceLabel} では、同意者名・言語・同意録音をそろえて先に app-owned storage へ保存し、その参照で同意を記録します。`
          : requirements.requiresSampleAudio
            ? `${voiceLabel} では provider-side の同意録音 endpoint は使いません。この画面では app 内の同意だけを記録し、次の voice 作成で sample audio を使います。`
            : "通常の mock フローでは checkbox だけでも進めます。"}
      </p>
      {requirements.provider === "elevenlabs" ? (
        <p className="text-xs leading-5 text-ink-500">
          ElevenLabs の voice clone 後も、listen で使うのは app-owned replay へ保存された見本音声です。普段の練習では provider を意識しなくて大丈夫です。
        </p>
      ) : null}
      {requirements.entitlementSensitive ? (
        <p className="text-xs leading-5 text-ink-500">
          同意登録や voice 作成で {voiceLabel} 側の権限不足に当たる場合があります。そのときは upload や auth ではなく、provider 側の entitlement を確認してください。
        </p>
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

      {message ? <p data-testid="voice-consent-message" className="text-sm text-ink-600">{message}</p> : null}
      {requirements.entitlementSensitive && isOpenAiEntitlementMessage(message) ? (
        <div className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-4 text-sm leading-6 text-ink-700">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-500">Recovery plan</p>
          <p className="mt-2">
            {`voice 作成の entitlement 不足は、provider-side の同意登録段階でもその後の voice 作成段階でも起こりえます。練習継続を優先するなら \`VOICE_PROVIDER=${fallbackProvider}\` に戻し、${fallbackProvider} voice で main loop を進めます。`}
          </p>
        </div>
      ) : null}
    </form>
  );
}
