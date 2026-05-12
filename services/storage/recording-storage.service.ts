import { randomUUID } from "node:crypto";
import { AppError } from "@/lib/errors";
import type { AppSupabaseClient } from "@/lib/supabase/client";
import { getScript } from "@/services/scripts/scripts.service";
import { MAX_RECORDING_BYTES, RECORDINGS_BUCKET, RECORDING_MIME_TYPES } from "./constants";

type StorageUploadInput = {
  scriptId: string;
  file: File;
  durationSeconds?: number;
};

export type UploadedRecording = {
  audioPath: string;
  audioStorageKey: string;
  durationSeconds: number | null;
  contentType: string;
};

export type RecordingFileReference = {
  audioPath: string;
  audioStorageKey: string;
  filename: string;
  contentType: string;
  bytes: Buffer;
};

function getStorageFailureMessage(errorMessage: string, operation: "upload" | "download") {
  const normalized = errorMessage.toLowerCase();

  if (normalized.includes("bucket") && normalized.includes("not found")) {
    return "recordings バケットが見つかりません。`0005_phase5_recordings_storage.sql` が適用済みか確認してください。";
  }

  if (normalized.includes("row-level security") || normalized.includes("policy")) {
    return operation === "upload"
      ? "録音ファイルの保存権限がありません。ログイン状態と storage policy を確認してください。"
      : "録音ファイルの参照権限がありません。ログイン状態と storage policy を確認してください。";
  }

  if (normalized.includes("not found")) {
    return operation === "upload"
      ? "録音ファイルの保存先を確認できませんでした。storage 設定を見直してください。"
      : "録音ファイルが見つかりませんでした。upload が完了しているか確認してください。";
  }

  return operation === "upload"
    ? `録音ファイルの保存に失敗しました。${errorMessage}`
    : `録音ファイルを読み込めませんでした。${errorMessage}`;
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

function normalizeRecordingContentType(contentType: string) {
  if (contentType === "video/webm") {
    return "audio/webm";
  }

  return contentType;
}

export function createRecordingAudioPath(audioStorageKey: string) {
  return `storage://${RECORDINGS_BUCKET}/${audioStorageKey}`;
}

export function parseRecordingAudioReference(input: { audioPath?: string; audioStorageKey?: string }) {
  if (input.audioStorageKey?.trim()) {
    return input.audioStorageKey.trim();
  }

  const path = input.audioPath?.trim();

  if (!path) {
    return null;
  }

  const prefix = `storage://${RECORDINGS_BUCKET}/`;

  if (!path.startsWith(prefix)) {
    return null;
  }

  return path.slice(prefix.length);
}

function validateOwnedRecordingKey(userId: string, scriptId: string, audioStorageKey: string) {
  const parts = audioStorageKey.split("/").filter(Boolean);

  if (parts.length < 3) {
    throw new AppError(400, "録音ファイルの参照形式が不正です。");
  }

  if (parts[0] !== userId || parts[1] !== scriptId) {
    throw new AppError(403, "他のユーザーまたは別の台本の録音ファイルは利用できません。");
  }
}

async function ensureOwnedScript(client: AppSupabaseClient, userId: string, scriptId: string) {
  const script = await getScript(client, userId, scriptId);

  if (!script) {
    throw new AppError(404, "台本が見つかりませんでした。");
  }

  return script;
}

export async function uploadOwnedRecording(
  client: AppSupabaseClient,
  userId: string,
  input: StorageUploadInput
): Promise<UploadedRecording> {
  await ensureOwnedScript(client, userId, input.scriptId);

  if (!input.file.size) {
    throw new AppError(400, "録音ファイルが空です。録音を確認してください。");
  }

  if (input.file.size > MAX_RECORDING_BYTES) {
    throw new AppError(400, "録音ファイルが大きすぎます。1分以内の音声で再試行してください。");
  }

  const contentType = normalizeRecordingContentType(inferContentType(input.file));

  if (!RECORDING_MIME_TYPES.has(contentType)) {
    throw new AppError(400, "対応していない録音形式です。webm / wav / m4a / mp3 / ogg を使用してください。");
  }

  const extension = getExtension(contentType, input.file.name);
  const objectKey = `${userId}/${input.scriptId}/${randomUUID()}.${extension}`;
  const bytes = Buffer.from(await input.file.arrayBuffer());

  const { error } = await client.storage.from(RECORDINGS_BUCKET).upload(objectKey, bytes, {
    contentType,
    cacheControl: "3600",
    upsert: false
  });

  if (error) {
    throw new AppError(500, getStorageFailureMessage(error.message, "upload"));
  }

  return {
    audioPath: createRecordingAudioPath(objectKey),
    audioStorageKey: objectKey,
    durationSeconds: input.durationSeconds ?? null,
    contentType
  };
}

export async function loadOwnedRecordingForEvaluation(
  client: AppSupabaseClient,
  userId: string,
  scriptId: string,
  input: {
    audioPath?: string;
    audioStorageKey?: string;
  }
): Promise<RecordingFileReference | null> {
  const audioStorageKey = parseRecordingAudioReference(input);

  if (!audioStorageKey) {
    return null;
  }

  validateOwnedRecordingKey(userId, scriptId, audioStorageKey);
  await ensureOwnedScript(client, userId, scriptId);

  const { data, error } = await client.storage.from(RECORDINGS_BUCKET).download(audioStorageKey);

  if (error) {
    throw new AppError(400, getStorageFailureMessage(error.message, "download"));
  }

  const contentType = data.type || "application/octet-stream";
  const bytes = Buffer.from(await data.arrayBuffer());
  const filename = audioStorageKey.split("/").pop() ?? `recording-${randomUUID()}.webm`;

  return {
    audioPath: createRecordingAudioPath(audioStorageKey),
    audioStorageKey,
    filename,
    contentType,
    bytes
  };
}
