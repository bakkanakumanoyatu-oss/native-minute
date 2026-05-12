import { AppError } from "@/lib/errors";
import { requireEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  VOICE_CONSENTS_BUCKET,
  VOICE_SAMPLES_BUCKET,
  parseVoiceConsentRecordingReference,
  parseVoiceSampleAudioReference
} from "@/services/storage";
import {
  createPreferredInitialVoiceSynthesizeResult,
  isSpecificAudioContentType,
  normalizeSynthesizeContentType
} from "./synthesize-result";
import type {
  CreateConsentInput,
  CreateConsentResult,
  CreateVoiceInput,
  CreateVoiceResult,
  SynthesizeInput,
  SynthesizeResult,
  VoiceProvider
} from "./types";

export const OPENAI_VOICE_PROVIDER_NAME = "openai";
export const OPENAI_VOICE_RESPONSE_FORMAT = "wav";
const OPENAI_VOICE_SPEECH_URL = "https://api.openai.com/v1/audio/speech";
const OPENAI_VOICE_CONSENT_URL = "https://api.openai.com/v1/audio/voice_consents";
const OPENAI_VOICE_CREATE_URL = "https://api.openai.com/v1/audio/voices";
const OPENAI_VOICE_UPLOAD_LIMIT_BYTES = 10 * 1024 * 1024;
const OPENAI_VOICE_ALLOWED_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/aac",
  "audio/flac",
  "audio/webm",
  "audio/mp4"
]);

type OpenAiFailurePoint =
  | "consent-recording-reference"
  | "consent-recording-download"
  | "consent-recording-content-type"
  | "consent-connect"
  | "consent-reject"
  | "consent-response-invalid"
  | "voice-sample-reference"
  | "voice-sample-download"
  | "voice-sample-content-type"
  | "voice-create-connect"
  | "voice-create-reject"
  | "voice-response-invalid"
  | "synthesize-connect"
  | "synthesize-reject";

type OpenAiSpeechResponseFormat = "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";
type OpenAiVoiceConsentResponse = {
  id?: string;
  created_at?: number;
};
type OpenAiVoiceCreateResponse = {
  id?: string;
  name?: string;
};
type OpenAiErrorResponse = {
  error?: {
    message?: string;
    code?: string;
    type?: string;
  };
};

type OpenAiSpeechResponseHeadersInput = {
  requestIdHeader?: string | null;
  contentTypeHeader?: string | null;
  responseFormat?: OpenAiSpeechResponseFormat;
};

type OpenAiSpeechSynthesizeResultInput = OpenAiSpeechResponseHeadersInput & {
  audioBytes: ArrayBuffer | Uint8Array | Buffer;
  playbackPath?: string;
  cached?: boolean;
};

function toBuffer(value: ArrayBuffer | Uint8Array | Buffer) {
  if (Buffer.isBuffer(value)) {
    return value;
  }

  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }

  return Buffer.from(new Uint8Array(value));
}

function getOpenAiSpeechResponseContentType(responseFormat: OpenAiSpeechResponseFormat) {
  switch (responseFormat) {
    case "mp3":
      return "audio/mpeg";
    case "opus":
      return "audio/opus";
    case "aac":
      return "audio/aac";
    case "flac":
      return "audio/flac";
    case "pcm":
      return "audio/pcm";
    case "wav":
    default:
      return "audio/wav";
  }
}

export function getOpenAiVoiceModel() {
  return process.env.OPENAI_VOICE_MODEL?.trim() || "gpt-4o-mini-tts";
}

export function requireOpenAiVoiceApiKey() {
  return requireEnv("OPENAI_API_KEY");
}

export function getOpenAiSpeechResponseHeaders(input: OpenAiSpeechResponseHeadersInput) {
  const requestId = input.requestIdHeader?.trim();

  if (!requestId) {
    throw new AppError(502, "OpenAI voice response の request id が見つかりませんでした。");
  }

  const fallbackContentType = getOpenAiSpeechResponseContentType(input.responseFormat ?? OPENAI_VOICE_RESPONSE_FORMAT);
  const normalizedHeaderContentType = input.contentTypeHeader
    ? normalizeSynthesizeContentType(input.contentTypeHeader)
    : "";

  return {
    providerRequestId: requestId,
    contentType: isSpecificAudioContentType(normalizedHeaderContentType)
      ? normalizedHeaderContentType
      : fallbackContentType
  };
}

export function createOpenAiInlineSpeechSynthesizeResult(input: OpenAiSpeechSynthesizeResultInput) {
  const metadata = getOpenAiSpeechResponseHeaders(input);
  const bytesBase64 = toBuffer(input.audioBytes).toString("base64");

  return createPreferredInitialVoiceSynthesizeResult({
    providerRequestId: metadata.providerRequestId,
    bytesBase64,
    contentType: metadata.contentType,
    playbackPath: input.playbackPath,
    cached: input.cached
  });
}

function getOpenAiVoiceParameter(providerVoiceId: string) {
  const trimmed = providerVoiceId.trim();

  if (!trimmed) {
    throw new AppError(400, "OpenAI voice ID が空です。voice 設定を確認してください。");
  }

  return trimmed.startsWith("voice_") ? { id: trimmed } : trimmed;
}

type OpenAiSpeechRequestBody = {
  model: string;
  input: string;
  voice: string | { id: string };
  response_format: OpenAiSpeechResponseFormat;
};

function createOpenAiSpeechRequestBody(input: SynthesizeInput): OpenAiSpeechRequestBody {
  return {
    model: getOpenAiVoiceModel(),
    input: input.text,
    voice: getOpenAiVoiceParameter(input.providerVoiceId),
    response_format: OPENAI_VOICE_RESPONSE_FORMAT
  };
}

function requireSupabaseServiceRoleKey() {
  return requireEnv("SUPABASE_SERVICE_ROLE_KEY");
}

function getOpenAiConsentName(input: CreateConsentInput) {
  const value = input.name?.trim();

  if (!value) {
    throw new AppError(400, "OpenAI voice の同意では同意者名が必要です。");
  }

  return value;
}

function getOpenAiConsentLanguage(input: CreateConsentInput) {
  const value = input.language?.trim();

  if (!value) {
    throw new AppError(400, "OpenAI voice の同意では言語タグが必要です。");
  }

  return value;
}

function getOpenAiConsentRecordingReference(input: CreateConsentInput) {
  const audioPath = input.recording?.audioPath?.trim();

  if (!audioPath) {
    throw new AppError(400, "OpenAI voice の同意では録音ファイルが必要です。");
  }

  const audioStorageKey = parseVoiceConsentRecordingReference({ audioPath });

  if (!audioStorageKey) {
    logOpenAiRequestFailure({
      operation: "consent",
      failurePoint: "consent-recording-reference",
      message: "invalid app-owned consent recording reference"
    });
    throw new AppError(400, "OpenAI voice の同意録音参照が不正です。");
  }

  return {
    audioPath,
    audioStorageKey,
    contentType: input.recording?.contentType?.trim() || undefined
  };
}

function getFilenameFromStorageKey(storageKey: string) {
  const lastSegment = storageKey.split("/").filter(Boolean).pop()?.trim();
  return lastSegment || "consent-recording.wav";
}

function normalizeOpenAiUploadContentType(contentType: string) {
  if (contentType === "audio/wave") {
    return "audio/wav";
  }

  if (contentType === "audio/x-m4a") {
    return "audio/mp4";
  }

  return contentType;
}

function assertOpenAiUploadRequirements(input: { contentType: string; byteLength?: number; label: string }) {
  const normalized = normalizeOpenAiUploadContentType(input.contentType);

  if (!OPENAI_VOICE_ALLOWED_MIME_TYPES.has(normalized)) {
    throw new AppError(400, `${input.label}の形式が OpenAI custom voice の対応外です。wav / mp3 / ogg / aac / flac / webm / mp4 を使用してください。`);
  }

  if (typeof input.byteLength === "number" && input.byteLength > OPENAI_VOICE_UPLOAD_LIMIT_BYTES) {
    throw new AppError(400, `${input.label}が大きすぎます。10MB 以下で再試行してください。`);
  }

  return normalized;
}

async function downloadStorageBlob(input: {
  bucket: string;
  storageKey: string;
  contentType?: string;
  byteLength?: number;
  errorLabel: string;
  operation: "consent" | "createVoice";
  downloadFailurePoint: OpenAiFailurePoint;
  contentTypeFailurePoint: OpenAiFailurePoint;
}) {
  requireSupabaseServiceRoleKey();

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage.from(input.bucket).download(input.storageKey);

  if (error) {
    logOpenAiRequestFailure({
      operation: input.operation,
      failurePoint: input.downloadFailurePoint,
      message: error.message,
      storageBucket: input.bucket,
      storageKey: input.storageKey
    });
    throw new AppError(500, `${input.errorLabel}を読み込めませんでした。${error.message}`);
  }

  const actualByteLength = data.size;
  const contentType = input.contentType?.trim() || data.type || "";

  if (!contentType) {
    logOpenAiRequestFailure({
      operation: input.operation,
      failurePoint: input.contentTypeFailurePoint,
      message: "content-type missing after storage download",
      storageBucket: input.bucket,
      storageKey: input.storageKey
    });
    throw new AppError(500, `${input.errorLabel}の Content-Type を判定できませんでした。アップロードし直してください。`);
  }

  const normalizedContentType = assertOpenAiUploadRequirements({
    contentType,
    byteLength: input.byteLength ?? actualByteLength,
    label: input.errorLabel
  });

  const byteLength = input.byteLength ?? actualByteLength;

  return {
    blob: data.type === normalizedContentType ? data : new Blob([await data.arrayBuffer()], { type: normalizedContentType }),
    contentType: normalizedContentType,
    byteLength
  };
}

async function downloadOpenAiConsentRecording(input: CreateConsentInput) {
  const reference = getOpenAiConsentRecordingReference(input);
  const downloaded = await downloadStorageBlob({
    bucket: VOICE_CONSENTS_BUCKET,
    storageKey: reference.audioStorageKey,
    contentType: reference.contentType,
    byteLength: input.recording?.byteLength,
    errorLabel: "OpenAI voice 用の同意録音",
    operation: "consent",
    downloadFailurePoint: "consent-recording-download",
    contentTypeFailurePoint: "consent-recording-content-type"
  });

  return {
    blob: downloaded.blob,
    contentType: downloaded.contentType,
    filename: getFilenameFromStorageKey(reference.audioStorageKey)
  };
}

function createOpenAiConsentFormData(input: CreateConsentInput, recording: { blob: Blob; filename: string }) {
  const formData = new FormData();
  formData.append("name", getOpenAiConsentName(input));
  formData.append("language", getOpenAiConsentLanguage(input));
  formData.append("recording", recording.blob, recording.filename);
  return formData;
}

function parseOpenAiConsentResponse(payload: OpenAiVoiceConsentResponse, fallbackTimestamp: string): CreateConsentResult {
  const providerConsentId = payload.id?.trim();

  if (!providerConsentId) {
    throw new AppError(502, "OpenAI voice consent response から consent ID を取得できませんでした。");
  }

  const consentedAt =
    typeof payload.created_at === "number" && Number.isFinite(payload.created_at)
      ? new Date(payload.created_at * 1000).toISOString()
      : fallbackTimestamp;

  return {
    providerConsentId,
    provider: OPENAI_VOICE_PROVIDER_NAME,
    consentedAt
  };
}

function getOpenAiVoiceSampleReference(input: CreateVoiceInput) {
  const audioPath = input.sampleAudio?.audioPath?.trim() || input.sampleAudioPath?.trim();

  if (!audioPath) {
    throw new AppError(400, "OpenAI custom voice では見本音声 sample が必要です。先に音声ファイルを保存してください。");
  }

  const audioStorageKey = parseVoiceSampleAudioReference({ audioPath });

  if (!audioStorageKey) {
    logOpenAiRequestFailure({
      operation: "createVoice",
      failurePoint: "voice-sample-reference",
      message: "invalid app-owned sample audio reference"
    });
    throw new AppError(400, "OpenAI custom voice の見本音声参照が不正です。");
  }

  return {
    audioStorageKey,
    contentType: input.sampleAudio?.contentType?.trim() || undefined,
    byteLength: input.sampleAudio?.byteLength
  };
}

async function downloadOpenAiVoiceSample(input: CreateVoiceInput) {
  const reference = getOpenAiVoiceSampleReference(input);
  const downloaded = await downloadStorageBlob({
    bucket: VOICE_SAMPLES_BUCKET,
    storageKey: reference.audioStorageKey,
    contentType: reference.contentType,
    byteLength: reference.byteLength,
    errorLabel: "OpenAI custom voice 用の見本音声",
    operation: "createVoice",
    downloadFailurePoint: "voice-sample-download",
    contentTypeFailurePoint: "voice-sample-content-type"
  });

  return {
    blob: downloaded.blob,
    contentType: downloaded.contentType,
    filename: getFilenameFromStorageKey(reference.audioStorageKey)
  };
}

function getOpenAiProviderConsentId(input: CreateVoiceInput) {
  const providerConsentId = input.providerConsentId?.trim();

  if (!providerConsentId) {
    throw new AppError(400, "OpenAI custom voice では provider consent ID が必要です。先に同意を記録し直してください。");
  }

  return providerConsentId;
}

function createOpenAiVoiceCreateFormData(input: CreateVoiceInput, sample: { blob: Blob; filename: string }) {
  const formData = new FormData();
  formData.append("audio_sample", sample.blob, sample.filename);
  formData.append("consent", getOpenAiProviderConsentId(input));
  formData.append("name", input.label.trim());
  return formData;
}

function parseOpenAiVoiceCreateResponse(payload: OpenAiVoiceCreateResponse, fallbackLabel: string): CreateVoiceResult {
  const providerVoiceId = payload.id?.trim();

  if (!providerVoiceId) {
    throw new AppError(502, "OpenAI custom voice response から voice ID を取得できませんでした。");
  }

  return {
    providerVoiceId,
    label: payload.name?.trim() || fallbackLabel
  };
}

async function readOpenAiErrorDetail(response: Response) {
  const requestId = response.headers.get("x-request-id")?.trim() || null;
  const contentType = response.headers.get("content-type")?.trim().toLowerCase() || "";

  if (contentType.includes("application/json")) {
    const payload = (await response.json().catch(() => null)) as OpenAiErrorResponse | null;
    const message = payload?.error?.message?.trim() || "";

    return {
      requestId,
      message,
      code: payload?.error?.code?.trim() || "",
      type: payload?.error?.type?.trim() || ""
    };
  }

  return {
    requestId,
    message: (await response.text().catch(() => "")).trim(),
    code: "",
    type: ""
  };
}

function isOpenAiEndpointAccessError(input: { status: number; message: string; code?: string; type?: string }) {
  const normalizedMessage = input.message.toLowerCase();
  const normalizedCode = input.code?.toLowerCase() ?? "";
  const normalizedType = input.type?.toLowerCase() ?? "";

  if (input.status === 403) {
    return true;
  }

  return (
    normalizedMessage.includes("does not have access to this endpoint") ||
    normalizedMessage.includes("do not have access to this endpoint") ||
    normalizedMessage.includes("not have access to this endpoint") ||
    normalizedMessage.includes("insufficient permissions") ||
    normalizedCode.includes("access") ||
    normalizedType.includes("permission")
  );
}

function logOpenAiRequestFailure(input: {
  operation: "consent" | "createVoice" | "synthesize";
  failurePoint: OpenAiFailurePoint;
  status?: number;
  message: string;
  code?: string;
  type?: string;
  requestId?: string | null;
  storageBucket?: string;
  storageKey?: string;
}) {
  console.error("OpenAI voice request failed", {
    operation: input.operation,
    failurePoint: input.failurePoint,
    status: input.status ?? null,
    message: input.message,
    code: input.code || null,
    type: input.type || null,
    requestId: input.requestId || null,
    storageBucket: input.storageBucket || null,
    storageKey: input.storageKey || null
  });
}

function isOpenAiSampleRejectedMessage(message: string) {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("sample") ||
    normalized.includes("audio") ||
    normalized.includes("file") ||
    normalized.includes("mime") ||
    normalized.includes("content-type")
  );
}

function getOpenAiConsentFailureMessage(input: {
  status: number;
  message: string;
  requestId: string | null;
}) {
  const requestIdSuffix = input.requestId ? ` request id: ${input.requestId}` : "";

  if (input.status === 401 || input.status === 403) {
    return `OpenAI voice consent の実行権限がありません。API key と custom voice 利用可否を確認してください。${requestIdSuffix}`;
  }

  if (input.status === 422 || isOpenAiSampleRejectedMessage(input.message)) {
    return `OpenAI voice consent が同意録音を受け付けませんでした。録音形式・長さ・内容を見直して再アップロードしてください。${requestIdSuffix}`;
  }

  return `OpenAI voice consent に失敗しました。${input.message || "同意者名、言語、録音形式、OpenAI の利用権限を確認してください。"}${requestIdSuffix}`;
}

function getOpenAiCreateVoiceFailureMessage(input: {
  status: number;
  message: string;
  requestId: string | null;
}) {
  const requestIdSuffix = input.requestId ? ` request id: ${input.requestId}` : "";

  if (input.status === 401 || input.status === 403) {
    return `OpenAI custom voice の作成権限がありません。API key と custom voice 利用可否を確認してください。${requestIdSuffix}`;
  }

  if (input.status === 422 || isOpenAiSampleRejectedMessage(input.message)) {
    return `OpenAI custom voice が見本音声 sample を受け付けませんでした。sample の形式・長さ・内容を見直して再アップロードしてください。${requestIdSuffix}`;
  }

  return `OpenAI custom voice の作成に失敗しました。${input.message || "見本音声、consent ID、OpenAI の利用権限を確認してください。"}${requestIdSuffix}`;
}

function getOpenAiSynthesizeFailureMessage(input: {
  status: number;
  message: string;
  requestId: string | null;
}) {
  const requestIdSuffix = input.requestId ? ` request id: ${input.requestId}` : "";

  if (input.status === 401 || input.status === 403) {
    return `OpenAI voice の実行権限がありません。API key と音声モデル利用可否を確認してください。${requestIdSuffix}`;
  }

  if (input.status === 404) {
    return `OpenAI 側で voice が見つかりませんでした。voice を作り直すか、当面は mock provider に戻してください。${requestIdSuffix}`;
  }

  return `OpenAI voice に失敗しました。${input.message || "API キー、モデル名、voice ID、入力テキストを確認してください。"}${requestIdSuffix}`;
}

function createOpenAiEndpointAccessAppError(operation: "consent" | "createVoice") {
  const baseMessage =
    operation === "consent"
      ? "OpenAI custom voice の同意登録を続けられませんでした。"
      : "OpenAI custom voice を作成できませんでした。";

  return new AppError(
    403,
    `${baseMessage} 実装失敗ではなく、現在の OpenAI 組織で custom voice endpoint の利用権限が不足している可能性があります。OpenAI 側で entitlement を確認するか、当面は VOICE_PROVIDER=mock に戻して main loop を進めてください。`
  );
}

export class OpenAiVoiceProvider implements VoiceProvider {
  async createConsent(input: CreateConsentInput): Promise<CreateConsentResult> {
    const recording = await downloadOpenAiConsentRecording(input);
    const formData = createOpenAiConsentFormData(input, recording);

    let response: Response;

    try {
      response = await fetch(OPENAI_VOICE_CONSENT_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${requireOpenAiVoiceApiKey()}`
        },
        body: formData
      });
    } catch {
      logOpenAiRequestFailure({
        operation: "consent",
        failurePoint: "consent-connect",
        message: "network connection failed"
      });
      throw new AppError(502, "OpenAI voice consent への接続に失敗しました。API キー、service role key、ネットワーク状態を確認してください。");
    }

    if (!response.ok) {
      const detail = await readOpenAiErrorDetail(response);

      logOpenAiRequestFailure({
        operation: "consent",
        failurePoint: "consent-reject",
        status: response.status,
        message: detail.message,
        code: detail.code,
        type: detail.type,
        requestId: detail.requestId
      });

      if (isOpenAiEndpointAccessError({ status: response.status, message: detail.message, code: detail.code, type: detail.type })) {
        throw createOpenAiEndpointAccessAppError("consent");
      }

      throw new AppError(502, getOpenAiConsentFailureMessage({
        status: response.status,
        message: detail.message,
        requestId: detail.requestId
      }));
    }

    const payload = (await response.json().catch(() => null)) as OpenAiVoiceConsentResponse | null;

    if (!payload) {
      logOpenAiRequestFailure({
        operation: "consent",
        failurePoint: "consent-response-invalid",
        message: "response json missing or invalid"
      });
      throw new AppError(502, "OpenAI voice consent response を読み取れませんでした。");
    }

    return parseOpenAiConsentResponse(payload, input.termsAcceptedAt);
  }

  async createVoice(input: CreateVoiceInput): Promise<CreateVoiceResult> {
    const sample = await downloadOpenAiVoiceSample(input);
    const formData = createOpenAiVoiceCreateFormData(input, sample);

    let response: Response;

    try {
      response = await fetch(OPENAI_VOICE_CREATE_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${requireOpenAiVoiceApiKey()}`
        },
        body: formData
      });
    } catch {
      logOpenAiRequestFailure({
        operation: "createVoice",
        failurePoint: "voice-create-connect",
        message: "network connection failed"
      });
      throw new AppError(502, "OpenAI custom voice への接続に失敗しました。API キー、service role key、ネットワーク状態を確認してください。");
    }

    if (!response.ok) {
      const detail = await readOpenAiErrorDetail(response);

      logOpenAiRequestFailure({
        operation: "createVoice",
        failurePoint: "voice-create-reject",
        status: response.status,
        message: detail.message,
        code: detail.code,
        type: detail.type,
        requestId: detail.requestId
      });

      if (isOpenAiEndpointAccessError({ status: response.status, message: detail.message, code: detail.code, type: detail.type })) {
        throw createOpenAiEndpointAccessAppError("createVoice");
      }

      throw new AppError(502, getOpenAiCreateVoiceFailureMessage({
        status: response.status,
        message: detail.message,
        requestId: detail.requestId
      }));
    }

    const payload = (await response.json().catch(() => null)) as OpenAiVoiceCreateResponse | null;

    if (!payload) {
      logOpenAiRequestFailure({
        operation: "createVoice",
        failurePoint: "voice-response-invalid",
        message: "response json missing or invalid"
      });
      throw new AppError(502, "OpenAI custom voice response を読み取れませんでした。");
    }

    return parseOpenAiVoiceCreateResponse(payload, input.label.trim());
  }

  async synthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
    const requestBody = createOpenAiSpeechRequestBody(input);

    let response: Response;

    try {
      response = await fetch(OPENAI_VOICE_SPEECH_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${requireOpenAiVoiceApiKey()}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
      });
    } catch {
      logOpenAiRequestFailure({
        operation: "synthesize",
        failurePoint: "synthesize-connect",
        message: "network connection failed"
      });
      throw new AppError(502, "OpenAI voice への接続に失敗しました。API キーとネットワーク状態を確認してください。");
    }

    if (!response.ok) {
      const detail = await readOpenAiErrorDetail(response);

      logOpenAiRequestFailure({
        operation: "synthesize",
        failurePoint: "synthesize-reject",
        status: response.status,
        message: detail.message,
        code: detail.code,
        type: detail.type,
        requestId: detail.requestId
      });

      throw new AppError(502, getOpenAiSynthesizeFailureMessage({
        status: response.status,
        message: detail.message,
        requestId: detail.requestId
      }));
    }

    return createOpenAiInlineSpeechSynthesizeResult({
      audioBytes: await response.arrayBuffer(),
      requestIdHeader: response.headers.get("x-request-id"),
      contentTypeHeader: response.headers.get("content-type"),
      responseFormat: OPENAI_VOICE_RESPONSE_FORMAT
    });
  }
}

export function createOpenAiVoiceProvider(): VoiceProvider {
  return new OpenAiVoiceProvider();
}
