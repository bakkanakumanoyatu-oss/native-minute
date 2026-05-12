import { randomUUID } from "node:crypto";
import { AppError } from "@/lib/errors";
import type { AppSupabaseClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";
import { MAX_VOICE_SAMPLE_BYTES, VOICE_SAMPLES_BUCKET, VOICE_SAMPLE_MIME_TYPES } from "./constants";

type VoiceConsentRow = Database["public"]["Tables"]["voice_consents"]["Row"];
type StorageUploadInput = {
  consentId: string;
  file: File;
};

type PostgrestMaybeSingle<TRow> = {
  data: TRow | null;
  error: { message: string } | null;
};

export type UploadedVoiceSample = {
  audioPath: string;
  audioStorageKey: string;
  contentType: string;
  byteLength: number;
};

export type VoiceSampleInput = {
  audioPath: string;
  contentType?: string;
  byteLength?: number;
};

function getStorageFailureMessage(errorMessage: string, operation: "upload" | "download") {
  const normalized = errorMessage.toLowerCase();

  if (normalized.includes("bucket") && normalized.includes("not found")) {
    return "voice-samples バケットが見つかりません。`0007_phase7_voice_sample_storage.sql` が適用済みか確認してください。";
  }

  if (normalized.includes("row-level security") || normalized.includes("policy")) {
    return operation === "upload"
      ? "見本音声 sample の保存権限がありません。ログイン状態と storage policy を確認してください。"
      : "見本音声 sample の参照権限がありません。ログイン状態と storage policy を確認してください。";
  }

  if (normalized.includes("not found")) {
    return operation === "upload"
      ? "見本音声 sample の保存先を確認できませんでした。storage 設定を見直してください。"
      : "見本音声 sample が見つかりませんでした。upload が完了しているか確認してください。";
  }

  return operation === "upload"
    ? `見本音声 sample の保存に失敗しました。${errorMessage}`
    : `見本音声 sample の読み込みに失敗しました。${errorMessage}`;
}

function getExtension(contentType: string, originalName: string) {
  const fromName = originalName.includes(".") ? originalName.split(".").pop()?.toLowerCase() : "";

  if (fromName) {
    return fromName;
  }

  if (contentType.includes("webm")) {
    return "webm";
  }

  if (contentType.includes("wav")) {
    return "wav";
  }

  if (contentType.includes("mpeg")) {
    return "mp3";
  }

  if (contentType.includes("ogg")) {
    return "ogg";
  }

  if (contentType.includes("mp4")) {
    return "m4a";
  }

  return "bin";
}

function inferContentType(file: File) {
  if (file.type) {
    return file.type;
  }

  const extension = getExtension("", file.name);

  if (extension === "webm") {
    return "audio/webm";
  }

  if (extension === "wav") {
    return "audio/wav";
  }

  if (extension === "mp3") {
    return "audio/mpeg";
  }

  if (extension === "ogg") {
    return "audio/ogg";
  }

  if (extension === "m4a") {
    return "audio/mp4";
  }

  return "application/octet-stream";
}

function normalizeVoiceSampleContentType(contentType: string) {
  if (contentType === "video/webm") {
    return "audio/webm";
  }

  return contentType;
}

function asMaybeSingle<TRow>(value: unknown) {
  return value as PostgrestMaybeSingle<TRow>;
}

async function getOwnedConsent(client: AppSupabaseClient, userId: string, consentId: string) {
  const { data, error } = asMaybeSingle<VoiceConsentRow>(
    await client
      .from("voice_consents")
      .select("*")
      .eq("user_id", userId)
      .eq("id", consentId)
      .maybeSingle()
  );

  if (error) {
    throw new AppError(500, `見本音声 sample 用の同意確認に失敗しました。${error.message}`);
  }

  if (!data) {
    throw new AppError(404, "利用可能な同意記録が見つかりませんでした。先に同意を完了してください。");
  }

  return data;
}

export function createVoiceSampleAudioPath(audioStorageKey: string) {
  return `storage://${VOICE_SAMPLES_BUCKET}/${audioStorageKey}`;
}

export function parseVoiceSampleAudioReference(input: { audioPath?: string; audioStorageKey?: string }) {
  if (input.audioStorageKey?.trim()) {
    return input.audioStorageKey.trim();
  }

  const path = input.audioPath?.trim();

  if (!path) {
    return null;
  }

  const prefix = `storage://${VOICE_SAMPLES_BUCKET}/`;

  if (!path.startsWith(prefix)) {
    return null;
  }

  return path.slice(prefix.length);
}

function validateOwnedVoiceSampleKey(userId: string, consentId: string, audioStorageKey: string) {
  const parts = audioStorageKey.split("/").filter(Boolean);

  if (parts.length < 3) {
    throw new AppError(400, "見本音声 sample の参照形式が不正です。");
  }

  if (parts[0] !== userId || parts[1] !== consentId) {
    throw new AppError(403, "他のユーザーまたは別の同意記録の見本音声 sample は利用できません。");
  }
}

export async function uploadOwnedVoiceSample(
  client: AppSupabaseClient,
  userId: string,
  input: StorageUploadInput
): Promise<UploadedVoiceSample> {
  await getOwnedConsent(client, userId, input.consentId);

  if (!input.file.size) {
    throw new AppError(400, "見本音声 sample が空です。ファイルを確認してください。");
  }

  if (input.file.size > MAX_VOICE_SAMPLE_BYTES) {
    throw new AppError(400, "見本音声 sample が大きすぎます。15MB 以下で再試行してください。");
  }

  const contentType = normalizeVoiceSampleContentType(inferContentType(input.file));

  if (!VOICE_SAMPLE_MIME_TYPES.has(contentType)) {
    throw new AppError(400, "対応していない見本音声形式です。webm / wav / m4a / mp3 / ogg を使用してください。");
  }

  const extension = getExtension(contentType, input.file.name);
  const objectKey = `${userId}/${input.consentId}/${randomUUID()}.${extension}`;
  const bytes = Buffer.from(await input.file.arrayBuffer());

  const { error } = await client.storage.from(VOICE_SAMPLES_BUCKET).upload(objectKey, bytes, {
    contentType,
    cacheControl: "3600",
    upsert: false
  });

  if (error) {
    throw new AppError(500, getStorageFailureMessage(error.message, "upload"));
  }

  return {
    audioPath: createVoiceSampleAudioPath(objectKey),
    audioStorageKey: objectKey,
    contentType,
    byteLength: bytes.length
  };
}

export async function resolveOwnedVoiceSampleInput(
  client: AppSupabaseClient,
  userId: string,
  consentId: string,
  input: VoiceSampleInput | null
): Promise<VoiceSampleInput | null> {
  if (!input?.audioPath?.trim()) {
    return null;
  }

  const audioStorageKey = parseVoiceSampleAudioReference({ audioPath: input.audioPath });

  if (!audioStorageKey) {
    throw new AppError(400, "見本音声 sample の参照先を確認してください。");
  }

  validateOwnedVoiceSampleKey(userId, consentId, audioStorageKey);
  await getOwnedConsent(client, userId, consentId);

  return {
    audioPath: createVoiceSampleAudioPath(audioStorageKey),
    contentType: input.contentType,
    byteLength: input.byteLength
  };
}
