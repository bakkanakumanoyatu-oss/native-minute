import { createHash } from "node:crypto";
import { AppError } from "@/lib/errors";
import { timeAsync } from "@/lib/performance/timing";
import { buildScriptAudioPlaybackPath, parseScriptAudioPlaybackPath } from "@/lib/voice-playback-path";
import type { AppSupabaseClient } from "@/lib/supabase/client";
import type { SynthesizeResult } from "@/providers/voice";
import type { Database, Json } from "@/types/database";
import { SCRIPT_AUDIO_STORAGE_BUCKET, buildScriptAudioStorageObjectKey } from "./replay-storage";

type ScriptAudioRow = Database["public"]["Tables"]["script_audios"]["Row"];
type PostgrestErrorLike = { message: string };

type ReplayMaybeSingle<TRow> = {
  data: TRow | null;
  error: PostgrestErrorLike | null;
};

export type ScriptAudioReplayPayload = {
  bytes: Buffer;
  contentType: string;
  storagePath: string;
};

export type ScriptAudioStoredAssetMetadata = {
  storageBucket: string;
  storageObjectKey: string;
  contentType: string;
  byteLength: number;
};

export type ScriptAudioReplayAsset = {
  storagePath: string;
  storedAsset: ScriptAudioStoredAssetMetadata | null;
};

type ResolvedSynthesizeReplayInput = {
  playbackPath: string;
  bytes: Buffer;
  contentType: string;
};

function isRecord(value: Json): value is Record<string, Json | undefined> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function encodeStoredAssetMetadata(metadata: ScriptAudioStoredAssetMetadata | null): Json {
  if (!metadata) {
    return {};
  }

  return {
    storageBucket: metadata.storageBucket,
    storageObjectKey: metadata.storageObjectKey,
    contentType: metadata.contentType,
    byteLength: metadata.byteLength
  };
}

export function decodeStoredAssetMetadata(value: Json): ScriptAudioStoredAssetMetadata | null {
  if (!isRecord(value)) {
    return null;
  }

  const storageBucket = value.storageBucket;
  const storageObjectKey = value.storageObjectKey;
  const contentType = value.contentType;
  const byteLength = value.byteLength;

  if (
    typeof storageBucket !== "string" ||
    typeof storageObjectKey !== "string" ||
    typeof contentType !== "string" ||
    typeof byteLength !== "number"
  ) {
    return null;
  }

  return {
    storageBucket,
    storageObjectKey,
    contentType,
    byteLength
  };
}

function asMaybeSingle<TRow>(value: unknown) {
  return value as ReplayMaybeSingle<TRow>;
}

function mapReplayError(operation: string, error: PostgrestErrorLike) {
  return new AppError(500, `${operation}に失敗しました。${error.message}`);
}

function getScriptAudioStorageFailureMessage(errorMessage: string, operation: "upload" | "download") {
  const normalized = errorMessage.toLowerCase();

  if (normalized.includes("bucket") && normalized.includes("not found")) {
    return "script-audios バケットが見つかりません。`0006_phase6_script_audio_storage.sql` が適用済みか確認してください。";
  }

  if (normalized.includes("row-level security") || normalized.includes("policy")) {
    return operation === "upload"
      ? "見本音声の保存権限がありません。ログイン状態と storage policy を確認してください。"
      : "見本音声の参照権限がありません。ログイン状態と storage policy を確認してください。";
  }

  if (normalized.includes("not found")) {
    return operation === "upload"
      ? "見本音声の保存先を確認できませんでした。storage 設定を見直してください。"
      : "見本音声ファイルが見つかりませんでした。保存処理が完了しているか確認してください。";
  }

  return operation === "upload"
    ? `見本音声の保存に失敗しました。${errorMessage}`
    : `見本音声の読み込みに失敗しました。${errorMessage}`;
}

function createMockWave(audioId: string) {
  const sampleRate = 16000;
  const durationSeconds = 1.1;
  const sampleCount = Math.floor(sampleRate * durationSeconds);
  const pcm = Buffer.alloc(sampleCount * 2);
  const hash = createHash("sha256").update(audioId).digest();
  const frequency = 220 + (hash[0] % 180);
  const amplitude = 0.18;

  for (let index = 0; index < sampleCount; index += 1) {
    const envelope = Math.min(index / 1200, 1, (sampleCount - index) / 1200);
    const sample = Math.sin((2 * Math.PI * frequency * index) / sampleRate) * 32767 * amplitude * envelope;
    pcm.writeInt16LE(Math.round(sample), index * 2);
  }

  const header = Buffer.alloc(44);
  const byteRate = sampleRate * 2;
  const blockAlign = 2;

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

function getResolvedPlaybackPath(synthesized: SynthesizeResult) {
  const fromSource = synthesized.audioSource?.kind === "mock-replay-path" ? synthesized.audioSource.playbackPath : null;
  const explicitPath = synthesized.playbackPath?.trim() || null;
  const legacyPath = parseScriptAudioPlaybackPath(synthesized.audioUrl) ? synthesized.audioUrl : null;

  return fromSource ?? explicitPath ?? legacyPath ?? buildScriptAudioPlaybackPath(`provider-${synthesized.providerRequestId}`);
}

function resolveSynthesizeReplayInput(synthesized: SynthesizeResult): ResolvedSynthesizeReplayInput {
  const playbackPath = getResolvedPlaybackPath(synthesized);
  const source = synthesized.audioSource;

  if (source?.kind === "inline-bytes") {
    // Adapters should already normalize contentType before returning audioSource.
    return {
      playbackPath,
      bytes: Buffer.from(source.bytesBase64, "base64"),
      contentType: source.contentType
    };
  }

  if (source?.kind === "temporary-url") {
    const temporaryUrlHost = (() => {
      try {
        return new URL(source.url).host || "unknown";
      } catch {
        return "unknown";
      }
    })();

    // This is the next real-provider adapter seam:
    // the first real provider should avoid this path when possible and prefer inline bytes,
    // because the current repo already has a complete app-owned upload path but not the extra fetch step yet.
    // fetch bytes server-side here, normalize contentType, then continue with the same storage upload path.
    throw new AppError(
      501,
      `一時 URL 形式の見本音声はまだ未接続です。temporary URL host=${temporaryUrlHost} から provider bytes を取得して app-owned storage に載せ替える前に、許可する host と fetch 方針を固定する必要があります。`
    );
  }

  const audioId = parseScriptAudioPlaybackPath(playbackPath);

  if (!audioId) {
    throw new AppError(500, "見本音声の再生参照が不正です。");
  }

  return {
    playbackPath,
    bytes: createMockWave(audioId),
    contentType: "audio/wav"
  };
}

async function getOwnedScriptAudioByPlaybackPath(client: AppSupabaseClient, playbackPath: string) {
  const { data, error } = asMaybeSingle<ScriptAudioRow>(
    await client
      .from("script_audios")
      .select("*")
      .eq("storage_path", playbackPath)
      .maybeSingle()
  );

  if (error) {
    throw mapReplayError("見本音声参照の取得", error);
  }

  return data;
}

export async function stageScriptAudioForReplay(input: {
  client: AppSupabaseClient;
  userId: string;
  scriptId: string;
  voiceId: string;
  cacheKey: string;
  synthesized: SynthesizeResult;
}): Promise<ScriptAudioReplayAsset> {
  return timeAsync("voice.replay.stage", async () => {
    // Fixed boundary for real providers:
    // 1. receive provider bytes in voice service
    // 2. persist them under app ownership
    // 3. return the stable app replay reference that script_audios.storage_path will store
    //
    // Chosen storage direction for real providers:
    // - store the bytes in Supabase Storage under app ownership
    // - keep script_audios.storage_path as the replay-route reference only
    // - use the dedicated script audio bucket instead of recordings, because generated exemplars
    //   have different lifecycle / cache semantics than user-uploaded takes
    //
    // Why not temp files / in-memory only:
    // - script_audios is a persisted cache, so the bytes need to survive request boundaries
    // - replay should keep working across deploys / server instances
    // - signed URLs are intentionally out of scope for this flow
    //
    // Minimum metadata to carry alongside the stored bytes:
    // - storageBucket
    // - storageObjectKey
    // - contentType
    // - byteLength
    //
    // Chosen object key direction for real providers:
    // - <userId>/<scriptId>/<voiceId>/<cacheKey>.<ext>
    // - userId stays as the coarse storage boundary
    // - scriptId / voiceId help inspect ownership without using provider IDs as storage identity
    // - cacheKey keeps regenerated assets aligned with the same persisted cache slot
    //
    // duration, waveform, provider latency, or provider model/version are not required to replay the cached audio.
    const resolved = resolveSynthesizeReplayInput(input.synthesized);
    const objectKey = buildScriptAudioStorageObjectKey({
      userId: input.userId,
      scriptId: input.scriptId,
      voiceId: input.voiceId,
      cacheKey: input.cacheKey,
      contentType: resolved.contentType
    });

    const { error } = await timeAsync("voice.replay.storageUpload", () =>
      input.client.storage.from(SCRIPT_AUDIO_STORAGE_BUCKET).upload(objectKey, resolved.bytes, {
        contentType: resolved.contentType,
        cacheControl: "3600",
        upsert: false
      })
    );

    if (error) {
      const normalized = error.message.toLowerCase();
      const isConflict = normalized.includes("duplicate") || normalized.includes("already exists");

      if (!isConflict) {
        throw new AppError(500, getScriptAudioStorageFailureMessage(error.message, "upload"));
      }
    }

    return {
      storagePath: resolved.playbackPath,
      storedAsset: {
        storageBucket: SCRIPT_AUDIO_STORAGE_BUCKET,
        storageObjectKey: objectKey,
        contentType: resolved.contentType,
        byteLength: resolved.bytes.length
      }
    };
  });
}

export async function loadOwnedScriptAudioReplay(
  client: AppSupabaseClient,
  playbackPath: string
): Promise<ScriptAudioReplayPayload | null> {
  return timeAsync("voice.replay.loadOwned", async () => {
    const record = await getOwnedScriptAudioByPlaybackPath(client, playbackPath);

    if (!record) {
      return null;
    }

    const audioId = parseScriptAudioPlaybackPath(record.storage_path);

    if (!audioId) {
      throw new AppError(500, "見本音声の再生参照が不正です。");
    }

    const storedAsset = decodeStoredAssetMetadata(record.stored_asset);

    // Fixed boundary for real providers:
    // replay routes read app-owned bytes from the reference stored in script_audios.storage_path.
    // The intended production read path is an app-owned Supabase Storage object referenced by storedAsset metadata.
    // Route handlers stay thin: auth + playback-path parsing happen at the route edge,
    // while the owned row lookup and storage download stay in services.
    if (storedAsset) {
      const { data, error } = await timeAsync("voice.replay.storageDownload", () =>
        client.storage
          .from(storedAsset.storageBucket)
          .download(storedAsset.storageObjectKey)
      );

      if (error) {
        throw new AppError(500, getScriptAudioStorageFailureMessage(error.message, "download"));
      }

      return {
        bytes: await timeAsync("voice.replay.downloadToBuffer", async () => Buffer.from(await data.arrayBuffer())),
        contentType: storedAsset.contentType,
        storagePath: record.storage_path
      };
    }

    return {
      bytes: createMockWave(audioId),
      contentType: "audio/wav",
      storagePath: record.storage_path
    };
  });
}
