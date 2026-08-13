import { randomUUID } from "node:crypto";
import { AppError } from "@/lib/errors";
import { timeAsync } from "@/lib/performance/timing";
import { parseMobilePcmWav } from "@/lib/pcm-wav";
import type { AppSupabaseClient } from "@/lib/supabase/client";
import { getScript } from "@/services/scripts/scripts.service";
import { MAX_RECORDING_BYTES, RECORDINGS_BUCKET, RECORDING_MIME_TYPES } from "./constants";

type StorageUploadInput = {
  scriptId: string;
  recordingId?: string;
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
  durationSeconds: number | null;
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

function getExtensionFromFilename(originalName: string) {
  const fromName = originalName.includes(".") ? originalName.split(".").pop()?.toLowerCase() : "";

  return fromName ?? "";
}

export function getRecordingStorageExtension(contentType: string) {
  const normalized = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";

  if (normalized === "audio/webm") {
    return "webm";
  }

  if (["audio/wav", "audio/wave", "audio/x-wav"].includes(normalized)) {
    return "wav";
  }

  if (normalized === "audio/mpeg") {
    return "mp3";
  }

  if (normalized === "audio/ogg") {
    return "ogg";
  }

  if (["audio/mp4", "audio/x-m4a"].includes(normalized)) {
    return "m4a";
  }

  return "bin";
}

function inferContentType(file: File) {
  if (file.type) {
    return file.type;
  }

  const extension = getExtensionFromFilename(file.name);

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
  return timeAsync("recording.uploadOwned", async () => {
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

    // Object keys are derived only from the validated MIME allowlist. The client filename
    // is display metadata and must not control the private storage path or extension.
    const recordingId = input.recordingId?.trim();
    if (
      recordingId &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(recordingId)
    ) {
      throw new AppError(400, "録音ファイルの参照形式が不正です。");
    }

    const extension = getRecordingStorageExtension(contentType);
    const objectKey = `${userId}/${input.scriptId}/${recordingId ?? randomUUID()}.${extension}`;
    const bytes = await timeAsync("recording.fileToBuffer", async () => Buffer.from(await input.file.arrayBuffer()));
    const recordingBucket = client.storage.from(RECORDINGS_BUCKET);
    const { error } = await timeAsync("recording.storageUpload", () =>
      recordingBucket.upload(objectKey, bytes, {
        contentType,
        cacheControl: "3600",
        upsert: false
      })
    );

    if (error && recordingId) {
      const { data: existing, error: existingError } = await timeAsync(
        "recording.storageIdempotencyCheck",
        () => recordingBucket.download(objectKey)
      );

      if (!existingError && existing) {
        const existingBytes = Buffer.from(await existing.arrayBuffer());
        if (existingBytes.equals(bytes)) {
          return {
            audioPath: createRecordingAudioPath(objectKey),
            audioStorageKey: objectKey,
            durationSeconds: input.durationSeconds ?? null,
            contentType
          };
        }
      }
    }

    if (error) {
      throw new AppError(500, getStorageFailureMessage(error.message, "upload"));
    }

    return {
      audioPath: createRecordingAudioPath(objectKey),
      audioStorageKey: objectKey,
      durationSeconds: input.durationSeconds ?? null,
      contentType
    };
  });
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
  return timeAsync("recording.loadOwnedForEvaluation", async () => {
    const audioStorageKey = parseRecordingAudioReference(input);

    if (!audioStorageKey) {
      return null;
    }

    validateOwnedRecordingKey(userId, scriptId, audioStorageKey);
    await ensureOwnedScript(client, userId, scriptId);

    const { data, error } = await timeAsync("recording.storageDownload", () =>
      client.storage.from(RECORDINGS_BUCKET).download(audioStorageKey)
    );

    if (error) {
      throw new AppError(400, getStorageFailureMessage(error.message, "download"));
    }

    const contentType = data.type || "application/octet-stream";
    const bytes = await timeAsync("recording.downloadToBuffer", async () => Buffer.from(await data.arrayBuffer()));
    const filename = audioStorageKey.split("/").pop() ?? `recording-${randomUUID()}.webm`;

    return {
      audioPath: createRecordingAudioPath(audioStorageKey),
      audioStorageKey,
      filename,
      contentType,
      bytes,
      durationSeconds: parseMobilePcmWav(new Uint8Array(bytes))?.durationSeconds ?? null
    };
  });
}
