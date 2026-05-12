import { randomUUID } from "node:crypto";
import { AppError } from "@/lib/errors";
import { requireEnv } from "@/lib/env";
import { DEFAULT_VOICE_STYLE_PRESET } from "@/lib/voice-style";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { VOICE_SAMPLES_BUCKET, parseVoiceSampleAudioReference } from "@/services/storage";
import { createPreferredInitialVoiceSynthesizeResult, isSpecificAudioContentType, normalizeSynthesizeContentType } from "./synthesize-result";
import { mapVoiceGenerationStyleForProvider } from "./style-mapper";
import type {
  CreateConsentInput,
  CreateConsentResult,
  CreateVoiceInput,
  CreateVoiceResult,
  SynthesizeInput,
  SynthesizeResult,
  VoiceProvider
} from "./types";

const ELEVENLABS_PROVIDER_NAME = "elevenlabs";
const ELEVENLABS_ADD_VOICE_URL = "https://api.elevenlabs.io/v1/voices/add";
const ELEVENLABS_VOICES_URL = "https://api.elevenlabs.io/v1/voices";
const ELEVENLABS_TTS_OUTPUT_FORMAT = "mp3_44100_128";
const ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech";
const ELEVENLABS_DEFAULT_MODEL_ID = "eleven_multilingual_v2";

type ElevenLabsVoiceCreateResponse = {
  voice_id?: string;
  name?: string;
  requires_verification?: boolean;
};

type ElevenLabsErrorResponse =
  | {
      detail?: unknown;
      message?: unknown;
      code?: unknown;
      type?: unknown;
      error?: {
        message?: unknown;
        code?: unknown;
        type?: unknown;
      };
    }
  | null;

type ElevenLabsFailurePoint =
  | "sample-reference"
  | "sample-download"
  | "sample-content-type"
  | "voice-create-connect"
  | "voice-create-reject"
  | "voice-verification-required"
  | "voice-response-invalid"
  | "synthesize-connect"
  | "synthesize-reject"
  | "voice-delete-connect"
  | "voice-delete-reject";

export type ElevenLabsVoiceDeletionClassification =
  | "deleted"
  | "not_found"
  | "auth_failed"
  | "rate_limited"
  | "invalid_provider_reference"
  | "provider_unavailable"
  | "provider_rejected";

export type ElevenLabsVoiceDeletionResult =
  | {
      ok: true;
      classification: "deleted";
      requestId: string;
    }
  | {
      ok: false;
      classification: Exclude<ElevenLabsVoiceDeletionClassification, "deleted">;
      requestId: string;
      status: number | null;
      safeReasonCode: string;
    };

function requireElevenLabsApiKey() {
  return requireEnv("ELEVENLABS_API_KEY");
}

function getElevenLabsApiKey(env: NodeJS.ProcessEnv = process.env) {
  const value = env.ELEVENLABS_API_KEY?.trim();

  if (!value) {
    throw new AppError(503, "ElevenLabs provider cleanup には ELEVENLABS_API_KEY が必要です。");
  }

  return value;
}

function getElevenLabsModelId() {
  return process.env.ELEVENLABS_TTS_MODEL_ID?.trim() || ELEVENLABS_DEFAULT_MODEL_ID;
}

function getElevenLabsRequestId(response: Response) {
  return (
    response.headers.get("request-id")?.trim() ||
    response.headers.get("x-request-id")?.trim() ||
    `elevenlabs_${randomUUID()}`
  );
}

function getElevenLabsOutputContentType() {
  return "audio/mpeg";
}

function getFilenameFromStorageKey(storageKey: string) {
  return storageKey.split("/").filter(Boolean).pop()?.trim() || "voice-sample.wav";
}

function getElevenLabsVoiceSampleReference(input: CreateVoiceInput) {
  const audioPath = input.sampleAudio?.audioPath?.trim() || input.sampleAudioPath?.trim();

  if (!audioPath) {
    throw new AppError(400, "ElevenLabs custom voice では見本音声 sample が必要です。先に音声ファイルを保存してください。");
  }

  const audioStorageKey = parseVoiceSampleAudioReference({ audioPath });

  if (!audioStorageKey) {
    throw new AppError(400, "ElevenLabs custom voice の見本音声参照が不正です。storage://voice-samples/... を使用してください。");
  }

  return {
    audioStorageKey,
    contentType: input.sampleAudio?.contentType?.trim() || undefined
  };
}

async function downloadElevenLabsVoiceSample(input: CreateVoiceInput) {
  requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const reference = getElevenLabsVoiceSampleReference(input);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage.from(VOICE_SAMPLES_BUCKET).download(reference.audioStorageKey);

  if (error) {
    console.error("ElevenLabs voice request failed", {
      operation: "createVoice",
      failurePoint: "sample-download",
      storageBucket: VOICE_SAMPLES_BUCKET,
      audioStorageKey: reference.audioStorageKey,
      message: error.message
    });
    throw new AppError(500, `ElevenLabs voice clone 用の見本音声 sample を app-owned storage から読み込めませんでした。sample を再アップロードしてください。${error.message}`);
  }

  const contentType = reference.contentType?.trim() || data.type || "";

  if (!contentType) {
    console.error("ElevenLabs voice request failed", {
      operation: "createVoice",
      failurePoint: "sample-content-type",
      storageBucket: VOICE_SAMPLES_BUCKET,
      audioStorageKey: reference.audioStorageKey
    });
    throw new AppError(500, "ElevenLabs voice clone 用の見本音声 sample の Content-Type を判定できませんでした。sample をアップロードし直してください。");
  }

  return {
    blob: data.type === contentType ? data : new Blob([await data.arrayBuffer()], { type: contentType }),
    contentType,
    filename: getFilenameFromStorageKey(reference.audioStorageKey)
  };
}

function createElevenLabsVoiceFormData(input: CreateVoiceInput, sample: { blob: Blob; filename: string }) {
  const label = input.label.trim();

  if (!label) {
    throw new AppError(400, "ElevenLabs custom voice の名前が空です。");
  }

  const formData = new FormData();
  formData.append("name", label);
  // ElevenLabs validates the multipart payload under the "files" field.
  formData.append("files", sample.blob, sample.filename);
  return formData;
}

function safeStringifyElevenLabsValue(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}

function getTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeElevenLabsErrorValue(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    const parts = value.map((item) => normalizeElevenLabsErrorValue(item)).filter(Boolean);
    return parts.length > 0 ? parts.join(" | ") : safeStringifyElevenLabsValue(value);
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const parts = [record.detail, record.message, record.code, record.type]
      .map((item) => normalizeElevenLabsErrorValue(item))
      .filter(Boolean);

    return parts.length > 0 ? parts.join(" | ") : safeStringifyElevenLabsValue(value);
  }

  return "";
}

async function readElevenLabsErrorDetail(response: Response) {
  const requestId = getElevenLabsRequestId(response);
  const contentType = response.headers.get("content-type")?.trim().toLowerCase() || "";

  if (contentType.includes("application/json")) {
    const payload = (await response.json().catch(() => null)) as ElevenLabsErrorResponse;
    const message =
      normalizeElevenLabsErrorValue(payload?.detail) ||
      normalizeElevenLabsErrorValue(payload?.message) ||
      normalizeElevenLabsErrorValue(payload?.error?.message) ||
      "";

    return {
      requestId,
      message,
      code: getTrimmedString(payload?.code) || getTrimmedString(payload?.error?.code) || "",
      type: getTrimmedString(payload?.type) || getTrimmedString(payload?.error?.type) || "",
      responseBody: payload ? safeStringifyElevenLabsValue(payload) : ""
    };
  }

  const responseBody = (await response.text().catch(() => "")).trim();

  return {
    requestId,
    message: responseBody,
    code: "",
    type: "",
    responseBody
  };
}

function logElevenLabsRequestFailure(input: {
  operation: "createVoice" | "synthesize" | "deleteVoice";
  failurePoint: ElevenLabsFailurePoint;
  status: number;
  message: string;
  code?: string;
  type?: string;
  requestId: string;
}) {
  console.error("ElevenLabs voice request failed", {
    operation: input.operation,
    failurePoint: input.failurePoint,
    status: input.status,
    message: input.message,
    code: input.code,
    type: input.type,
    requestId: input.requestId
  });
}

function isVerificationRequiredMessage(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("verification") && normalized.includes("required");
}

function isSampleRejectedMessage(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("sample") ||
    normalized.includes("audio") ||
    normalized.includes("file") ||
    normalized.includes("voice preview")
  );
}

function isRateLimitMessage(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("rate limit") || normalized.includes("too many requests") || normalized.includes("429");
}

function isBillingOrQuotaMessage(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("billing") ||
    normalized.includes("quota") ||
    normalized.includes("credit") ||
    normalized.includes("payment") ||
    normalized.includes("insufficient") ||
    normalized.includes("limit exceeded")
  );
}

function getCreateVoiceFailureMessage(input: {
  status: number;
  message: string;
  requestId: string;
}) {
  if (isVerificationRequiredMessage(input.message)) {
    return `ElevenLabs voice clone は verification required の状態で止まりました。current repo では pending verification voice を保存しないため、ElevenLabs 側で verification を完了してから再試行してください。request id: ${input.requestId}`;
  }

  if (input.status === 401 || input.status === 403) {
    return `ElevenLabs voice clone の作成権限がありません。ELEVENLABS_API_KEY とアカウント側の voice cloning 利用可否を確認してください。request id: ${input.requestId}`;
  }

  if (input.status === 429 || isRateLimitMessage(input.message)) {
    return `ElevenLabs voice clone は rate limit で止まりました。少し待ってから再試行し、続く場合は ElevenLabs 側の利用枠を確認してください。request id: ${input.requestId}`;
  }

  if (input.status === 402 || isBillingOrQuotaMessage(input.message)) {
    return `ElevenLabs voice clone は利用枠または課金設定で止まりました。ElevenLabs 側の plan / quota / billing を確認してください。request id: ${input.requestId}`;
  }

  if (input.status === 422 || isSampleRejectedMessage(input.message)) {
    return `ElevenLabs voice clone が見本音声 sample を受け付けませんでした。sample の形式・長さ・内容を見直して再アップロードしてください。request id: ${input.requestId}`;
  }

  return `ElevenLabs voice clone の作成に失敗しました。${input.message || "API key・account plan・provider 側の状態を確認してください。"} request id: ${input.requestId}`;
}

function getSynthesizeFailureMessage(input: {
  status: number;
  message: string;
  requestId: string;
}) {
  if (input.status === 401 || input.status === 403) {
    return `ElevenLabs text-to-speech の実行権限がありません。ELEVENLABS_API_KEY とアカウント側の TTS 利用可否を確認してください。request id: ${input.requestId}`;
  }

  if (input.status === 429 || isRateLimitMessage(input.message)) {
    return `ElevenLabs text-to-speech は rate limit で止まりました。少し待ってから再試行し、続く場合は ElevenLabs 側の利用枠を確認してください。request id: ${input.requestId}`;
  }

  if (input.status === 402 || isBillingOrQuotaMessage(input.message)) {
    return `ElevenLabs text-to-speech は利用枠または課金設定で止まりました。ElevenLabs 側の plan / quota / billing を確認してください。request id: ${input.requestId}`;
  }

  if (input.status === 404) {
    return `ElevenLabs 側で voice が見つかりませんでした。voice を作り直すか、当面は mock provider に戻してください。request id: ${input.requestId}`;
  }

  return `ElevenLabs text-to-speech に失敗しました。${input.message || "voice ID・model_id・provider 側の状態を確認してください。"} request id: ${input.requestId}`;
}

function classifyElevenLabsDeleteFailure(input: {
  status: number;
  message: string;
}): Exclude<ElevenLabsVoiceDeletionClassification, "deleted"> {
  if (input.status === 401 || input.status === 403) {
    return "auth_failed";
  }

  if (input.status === 404) {
    return "not_found";
  }

  if (input.status === 429 || isRateLimitMessage(input.message)) {
    return "rate_limited";
  }

  if (input.status === 422) {
    return "invalid_provider_reference";
  }

  if (input.status >= 500) {
    return "provider_unavailable";
  }

  return "provider_rejected";
}

function getElevenLabsDeleteSafeReasonCode(classification: Exclude<ElevenLabsVoiceDeletionClassification, "deleted">) {
  return `elevenlabs_voice_delete_${classification}`;
}

function parseElevenLabsVoiceCreateResponse(payload: ElevenLabsVoiceCreateResponse, fallbackLabel: string): CreateVoiceResult {
  const providerVoiceId = payload.voice_id?.trim();

  if (!providerVoiceId) {
    throw new AppError(502, "ElevenLabs custom voice response から voice ID を取得できませんでした。");
  }

  if (payload.requires_verification) {
    throw new AppError(
      409,
      "ElevenLabs voice clone は verification required の状態で作成されました。current repo では pending verification voice を保存しないため、ElevenLabs 側で verification を完了してから作り直してください。"
    );
  }

  return {
    providerVoiceId,
    label: payload.name?.trim() || fallbackLabel
  };
}

function getElevenLabsLanguageCode(locale?: string) {
  const normalized = locale?.trim().toLowerCase() || "";

  if (!normalized) {
    return undefined;
  }

  const languageCode = normalized.split("-")[0]?.trim();

  if (!languageCode || !/^[a-z]{2,3}$/.test(languageCode)) {
    return undefined;
  }

  return languageCode;
}

function createElevenLabsTtsRequestBody(input: SynthesizeInput) {
  const languageCode = getElevenLabsLanguageCode(input.locale);
  const styleOptions = mapVoiceGenerationStyleForProvider(ELEVENLABS_PROVIDER_NAME, {
    presetId: input.voiceStylePreset ?? DEFAULT_VOICE_STYLE_PRESET
  });

  return {
    text: input.text,
    model_id: getElevenLabsModelId(),
    language_code: languageCode,
    voice_settings: styleOptions.elevenLabs?.voice_settings
  };
}

export class ElevenLabsVoiceProvider implements VoiceProvider {
  async createConsent(input: CreateConsentInput): Promise<CreateConsentResult> {
    // ElevenLabs does not require a separate provider-side consent endpoint for the current
    // instant voice cloning flow. We still keep the app-owned consent row as the canonical
    // product step, but providerConsentId remains a local placeholder and is never sent back.
    return {
      providerConsentId: `elevenlabs_consent_${randomUUID().slice(0, 8)}`,
      provider: input.provider,
      consentedAt: input.termsAcceptedAt
    };
  }

  async createVoice(input: CreateVoiceInput): Promise<CreateVoiceResult> {
    const sample = await downloadElevenLabsVoiceSample(input);
    const formData = createElevenLabsVoiceFormData(input, sample);

    let response: Response;

    try {
      response = await fetch(ELEVENLABS_ADD_VOICE_URL, {
        method: "POST",
        headers: {
          "xi-api-key": requireElevenLabsApiKey()
        },
        body: formData
      });
    } catch {
      console.error("ElevenLabs voice request failed", {
        operation: "createVoice",
        failurePoint: "voice-create-connect"
      });
      throw new AppError(502, "ElevenLabs voice clone への接続に失敗しました。API キー、provider 側の状態、ネットワーク接続を確認してください。");
    }

    if (!response.ok) {
      const detail = await readElevenLabsErrorDetail(response);
      const failurePoint = isVerificationRequiredMessage(detail.message) ? "voice-verification-required" : "voice-create-reject";

      logElevenLabsRequestFailure({
        operation: "createVoice",
        failurePoint,
        status: response.status,
        message: detail.message,
        code: detail.code,
        type: detail.type,
        requestId: detail.requestId
      });

      throw new AppError(502, getCreateVoiceFailureMessage({
        status: response.status,
        message: detail.message,
        requestId: detail.requestId
      }));
    }

    const payload = (await response.json().catch(() => null)) as ElevenLabsVoiceCreateResponse | null;

    if (!payload) {
      console.error("ElevenLabs voice request failed", {
        operation: "createVoice",
        failurePoint: "voice-response-invalid"
      });
      throw new AppError(502, "ElevenLabs voice clone response を読み取れませんでした。provider 側の status と request id を確認してください。");
    }

    return parseElevenLabsVoiceCreateResponse(payload, input.label.trim());
  }

  async synthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
    const url = new URL(`${ELEVENLABS_TTS_URL}/${encodeURIComponent(input.providerVoiceId)}`);
    url.searchParams.set("output_format", ELEVENLABS_TTS_OUTPUT_FORMAT);

    let response: Response;

    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "xi-api-key": requireElevenLabsApiKey(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify(createElevenLabsTtsRequestBody(input))
      });
    } catch {
      console.error("ElevenLabs voice request failed", {
        operation: "synthesize",
        failurePoint: "synthesize-connect",
        providerVoiceId: input.providerVoiceId
      });
      throw new AppError(502, "ElevenLabs text-to-speech への接続に失敗しました。API キー、provider 側の状態、ネットワーク接続を確認してください。");
    }

    if (!response.ok) {
      const detail = await readElevenLabsErrorDetail(response);

      logElevenLabsRequestFailure({
        operation: "synthesize",
        failurePoint: "synthesize-reject",
        status: response.status,
        message: detail.message,
        code: detail.code,
        type: detail.type,
        requestId: detail.requestId
      });

      throw new AppError(502, getSynthesizeFailureMessage({
        status: response.status,
        message: detail.message,
        requestId: detail.requestId
      }));
    }

    const requestId = getElevenLabsRequestId(response);
    const responseContentType = response.headers.get("content-type")?.trim() || "";
    const contentType = isSpecificAudioContentType(responseContentType)
      ? normalizeSynthesizeContentType(responseContentType)
      : getElevenLabsOutputContentType();

    return createPreferredInitialVoiceSynthesizeResult({
      providerRequestId: requestId,
      bytesBase64: Buffer.from(await response.arrayBuffer()).toString("base64"),
      contentType
    });
  }
}

export async function deleteElevenLabsVoiceForAccountDeletion(input: {
  providerVoiceId: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}): Promise<ElevenLabsVoiceDeletionResult> {
  const fetcher = input.fetchImpl ?? fetch;
  const requestUrl = `${ELEVENLABS_VOICES_URL}/${encodeURIComponent(input.providerVoiceId)}`;
  let response: Response;

  try {
    response = await fetcher(requestUrl, {
      method: "DELETE",
      headers: {
        "xi-api-key": getElevenLabsApiKey(input.env)
      }
    });
  } catch {
    console.error("ElevenLabs voice request failed", {
      operation: "deleteVoice",
      failurePoint: "voice-delete-connect"
    });

    return {
      ok: false,
      classification: "provider_unavailable",
      requestId: `elevenlabs_${randomUUID()}`,
      status: null,
      safeReasonCode: "elevenlabs_voice_delete_provider_unavailable"
    };
  }

  const requestId = getElevenLabsRequestId(response);

  if (response.ok) {
    return {
      ok: true,
      classification: "deleted",
      requestId
    };
  }

  const detail = await readElevenLabsErrorDetail(response);
  const classification = classifyElevenLabsDeleteFailure({
    status: response.status,
    message: detail.message
  });

  logElevenLabsRequestFailure({
    operation: "deleteVoice",
    failurePoint: "voice-delete-reject",
    status: response.status,
    message: classification,
    code: detail.code,
    type: detail.type,
    requestId
  });

  return {
    ok: false,
    classification,
    requestId,
    status: response.status,
    safeReasonCode: getElevenLabsDeleteSafeReasonCode(classification)
  };
}

export function createElevenLabsVoiceProvider(): VoiceProvider {
  return new ElevenLabsVoiceProvider();
}
