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

function isOwnedVoiceSamplePath(path: string) {
  return path.trim().toLowerCase().startsWith("storage://voice-samples/");
}

export function CreateVoiceForm({
  consentId,
  requirements
}: {
  consentId: string;
  requirements: VoiceProviderRequirements;
}) {
  const router = useRouter();
  const [label, setLabel] = useState("Native Minute の voice");
  const [sampleAudioFile, setSampleAudioFile] = useState<File | null>(null);
  const [sampleAudioPath, setSampleAudioPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const trimmedLabel = label.trim();
  const trimmedSampleAudioPath = sampleAudioPath.trim();
  const isMissingRequiredLabel = trimmedLabel.length === 0;
  const requiresUploadedSample = requirements.requiresSampleAudio;
  const voiceLabel = requirements.voiceLabel;
  const fallbackProvider = requirements.recommendedDevelopmentFallbackProvider ?? "mock";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (requiresUploadedSample && !sampleAudioFile && !trimmedSampleAudioPath) {
        setMessage(`${voiceLabel} ではお手本ボイス用の録音が必要です。ファイルを選ぶか、upload 済み path を入力してください。`);
        return;
      }

      if (requiresUploadedSample && trimmedSampleAudioPath && !isOwnedVoiceSamplePath(trimmedSampleAudioPath)) {
        setMessage(`${voiceLabel} では app-owned な storage://voice-samples/... 参照だけを使います。mock:// や別 bucket の古い path は使わず、sample を再アップロードしてください。`);
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
          sampleAudio,
          sampleAudioPath: trimmedSampleAudioPath || undefined
        })
      });

      const payload = (await response.json()) as { ok: boolean; message?: string };

      if (!response.ok || !payload.ok) {
        setMessage(payload.message ?? "voice の作成に失敗しました。");
        return;
      }

      setMessage("voice を作成しました。上の Next action から listen に進めます。");
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
      </label>

      <details className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-ink-800">録音ファイルを直接指定する</summary>
        <label className="mt-3 block space-y-2">
          <span className="text-sm font-medium text-ink-700">保存済み録音の参照</span>
          <input
            data-testid="voice-create-sample-path"
            value={sampleAudioPath}
            onChange={(event) => setSampleAudioPath(event.target.value)}
            placeholder={requiresUploadedSample ? "storage://voice-samples/..." : "storage://voice-samples/..."}
            className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-[var(--accent)]"
          />
        </label>
      </details>

      {trimmedSampleAudioPath ? (
        <button
          type="button"
          onClick={() => setSampleAudioPath("")}
          className="inline-flex items-center justify-center rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-ink-800 transition hover:bg-ink-50"
        >
          path を消す
        </button>
      ) : null}

      <button
        data-testid="voice-create-submit"
        type="submit"
        disabled={loading || isMissingRequiredLabel}
        className="inline-flex items-center justify-center rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "作成中..." : "自分の声を録音してお手本ボイスを作る"}
      </button>

      <details className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-xs leading-5 text-ink-600">
        <summary className="cursor-pointer font-semibold text-ink-800">詳しい補足を見る</summary>
        <p className="mt-3">
          {requiresUploadedSample
            ? `${voiceLabel} では自分の声の録音が必要です。通常はファイルを選ぶだけで進めます。`
            : "通常は録音ファイルを選ぶだけで進めます。保存済み参照は確認用です。"}
        </p>
        {requiresUploadedSample && trimmedSampleAudioPath && !isOwnedVoiceSamplePath(trimmedSampleAudioPath) ? (
          <p className="mt-2 text-amber-700">
            現在入力されている参照は使えません。録音ファイルを選び直してください。
          </p>
        ) : null}
        {requirements.provider === "elevenlabs" ? (
          <p className="mt-2">
            ElevenLabs では、この録音からお手本ボイス用の声を作ります。普段の練習では provider 名を意識しません。
          </p>
        ) : null}
        {requirements.entitlementSensitive ? (
          <p className="mt-2">
            {`声の作成権限が無い場合は、この画面で止まることがあります。練習 flow を先に進めるなら \`VOICE_PROVIDER=${fallbackProvider}\` に戻すのが最小です。`}
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
          <p className="text-xs uppercase tracking-[0.18em] text-ink-500">Recovery plan</p>
          <ol className="mt-2 space-y-2">
            <li>{`1. \`.env.local\` の \`VOICE_PROVIDER\` を \`${fallbackProvider}\` に戻す。`}</li>
            <li>2. 開発サーバーを再起動する。</li>
            <li>{`3. \`/setup/voice\` で ${fallbackProvider} voice を作成し、practice main loop を続ける。`}</li>
          </ol>
        </div>
      ) : null}
      {requirements.provider === "elevenlabs" && isElevenLabsMessage(message) ? (
        <div className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-4 text-sm leading-6 text-ink-700">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-500">Recovery plan</p>
          {isElevenLabsVerificationMessage(message) ? (
            <ol className="mt-2 space-y-2">
              <li>1. ElevenLabs 側で voice clone の verification を完了する。</li>
              <li>2. 完了後にこの画面へ戻り、同じ sample か更新した sample で作り直す。</li>
              <li>{`3. 先に main loop を進めたい場合は \`VOICE_PROVIDER=${fallbackProvider}\` に戻す。`}</li>
            </ol>
          ) : isElevenLabsSampleMessage(message) ? (
            <ol className="mt-2 space-y-2">
              <li>1. sample audio をアップロードし直し、`storage://voice-samples/...` の owned 参照で再試行する。</li>
              <li>2. 形式・長さ・内容を見直し、別の sample でもう一度作成する。</li>
              <li>{`3. sample で詰まり続ける場合は \`VOICE_PROVIDER=${fallbackProvider}\` に戻して main loop を継続する。`}</li>
            </ol>
          ) : isElevenLabsAccountOrLimitMessage(message) ? (
            <ol className="mt-2 space-y-2">
              <li>1. ElevenLabs 側の API key、voice cloning 利用可否、plan / quota / billing を確認する。</li>
              <li>2. rate limit の場合は少し待ってから 1 回だけ再試行する。</li>
              <li>{`3. provider 側の確認が必要な間は \`VOICE_PROVIDER=${fallbackProvider}\` に戻して main loop を継続する。`}</li>
            </ol>
          ) : (
            <ol className="mt-2 space-y-2">
              <li>1. ElevenLabs API key、account 側の voice cloning 可否、provider の稼働状態を確認する。</li>
              <li>2. server log の request id と failure point を見て、createVoice / synthesize のどちらで止まったか確認する。</li>
              <li>{`3. 先に main loop を進めたい場合は \`VOICE_PROVIDER=${fallbackProvider}\` に戻す。`}</li>
            </ol>
          )}
        </div>
      ) : null}
    </form>
  );
}
