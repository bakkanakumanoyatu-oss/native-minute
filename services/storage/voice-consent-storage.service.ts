import { randomUUID } from "node:crypto";
import { AppError } from "@/lib/errors";
import type { AppSupabaseClient } from "@/lib/supabase/client";
import {
  MAX_VOICE_CONSENT_BYTES,
  VOICE_CONSENTS_BUCKET,
  VOICE_CONSENT_MIME_TYPES
} from "./constants";

type StorageUploadInput = {
  file: File;
};

export type UploadedVoiceConsentRecording = {
  audioPath: string;
  audioStorageKey: string;
  contentType: string;
  byteLength: number;
};

export type VoiceConsentRecordingInput = {
  audioPath: string;
  contentType?: string;
  byteLength?: number;
};

function getStorageFailureMessage(errorMessage: string, operation: "upload" | "download") {
  const normalized = errorMessage.toLowerCase();

  if (normalized.includes("bucket") && normalized.includes("not found")) {
    return "voice-consents バケットが見つかりません。`0008_phase8_voice_consent_storage.sql` が適用済みか確認してください。";
  }

  if (normalized.includes("row-level security") || normalized.includes("policy")) {
    return operation === "upload"
      ? "同意録音の保存権限がありません。ログイン状態と storage policy を確認してください。"
      : "同意録音の参照権限がありません。ログイン状態と storage policy を確認してください。";
  }

  if (normalized.includes("not found")) {
    return operation === "upload"
      ? "同意録音の保存先を確認できませんでした。storage 設定を見直してください。"
      : "同意録音が見つかりませんでした。upload が完了しているか確認してください。";
  }

  return operation === "upload"
    ? `同意録音の保存に失敗しました。${errorMessage}`
    : `同意録音の読み込みに失敗しました。${errorMessage}`;
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

  if (contentType.includes("aac")) {
    return "aac";
  }

  if (contentType.includes("flac")) {
    return "flac";
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

  if (extension === "aac") {
    return "audio/aac";
  }

  if (extension === "flac") {
    return "audio/flac";
  }

  return "application/octet-stream";
}

function normalizeVoiceConsentContentType(contentType: string) {
  if (contentType === "video/webm") {
    return "audio/webm";
  }

  if (contentType === "audio/x-m4a") {
    return "audio/mp4";
  }

  if (contentType === "audio/x-wav") {
    return "audio/wav";
  }

  return contentType;
}

export function createVoiceConsentRecordingAudioPath(audioStorageKey: string) {
  return `storage://${VOICE_CONSENTS_BUCKET}/${audioStorageKey}`;
}

export function parseVoiceConsentRecordingReference(input: { audioPath?: string; audioStorageKey?: string }) {
  if (input.audioStorageKey?.trim()) {
    return input.audioStorageKey.trim();
  }

  const path = input.audioPath?.trim();

  if (!path) {
    return null;
  }

  const prefix = `storage://${VOICE_CONSENTS_BUCKET}/`;

  if (!path.startsWith(prefix)) {
    return null;
  }

  return path.slice(prefix.length);
}

function validateOwnedVoiceConsentKey(userId: string, audioStorageKey: string) {
  const parts = audioStorageKey.split("/").filter(Boolean);

  if (parts.length < 2) {
    throw new AppError(400, "同意録音の参照形式が不正です。");
  }

  if (parts[0] !== userId) {
    throw new AppError(403, "他のユーザーの同意録音は利用できません。");
  }
}

export async function uploadOwnedVoiceConsentRecording(
  client: AppSupabaseClient,
  userId: string,
  input: StorageUploadInput
): Promise<UploadedVoiceConsentRecording> {
  if (!input.file.size) {
    throw new AppError(400, "同意録音が空です。ファイルを確認してください。");
  }

  if (input.file.size > MAX_VOICE_CONSENT_BYTES) {
    throw new AppError(400, "同意録音が大きすぎます。10MB 以下で再試行してください。");
  }

  const contentType = normalizeVoiceConsentContentType(inferContentType(input.file));

  if (!VOICE_CONSENT_MIME_TYPES.has(contentType)) {
    throw new AppError(400, "対応していない同意録音形式です。webm / wav / m4a / mp3 / ogg / aac / flac を使用してください。");
  }

  const extension = getExtension(contentType, input.file.name);
  const objectKey = `${userId}/${randomUUID()}.${extension}`;
  const bytes = Buffer.from(await input.file.arrayBuffer());

  const { error } = await client.storage.from(VOICE_CONSENTS_BUCKET).upload(objectKey, bytes, {
    contentType,
    cacheControl: "3600",
    upsert: false
  });

  if (error) {
    throw new AppError(500, getStorageFailureMessage(error.message, "upload"));
  }

  return {
    audioPath: createVoiceConsentRecordingAudioPath(objectKey),
    audioStorageKey: objectKey,
    contentType,
    byteLength: bytes.length
  };
}

export async function resolveOwnedVoiceConsentRecordingInput(
  client: AppSupabaseClient,
  userId: string,
  input: VoiceConsentRecordingInput | null
): Promise<VoiceConsentRecordingInput | null> {
  if (!input?.audioPath?.trim()) {
    return null;
  }

  const audioStorageKey = parseVoiceConsentRecordingReference({ audioPath: input.audioPath });

  if (!audioStorageKey) {
    throw new AppError(400, "同意録音の参照先を確認してください。");
  }

  validateOwnedVoiceConsentKey(userId, audioStorageKey);

  const { data, error } = await client.storage.from(VOICE_CONSENTS_BUCKET).download(audioStorageKey);

  if (error) {
    throw new AppError(500, getStorageFailureMessage(error.message, "download"));
  }

  const byteLength = input.byteLength ?? data.size;
  const contentType = input.contentType?.trim() || data.type || undefined;

  return {
    audioPath: createVoiceConsentRecordingAudioPath(audioStorageKey),
    contentType,
    byteLength
  };
}
