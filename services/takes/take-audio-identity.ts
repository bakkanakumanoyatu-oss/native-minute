import { createHash } from "node:crypto";
import { AppError } from "@/lib/errors";
import type { AppSupabaseClient } from "@/lib/supabase/client";
import { parseRecordingAudioReference } from "@/services/storage/recording-storage.service";

// A locator alone cannot detect deletion/recreation. Read the current private
// object metadata with the caller's RLS-bound client; never expose its path.
export async function getOwnedTakeAudioIdentity(
  client: AppSupabaseClient,
  userId: string,
  take: { script_id: string; audio_path: string }
): Promise<string | null> {
  const key = parseRecordingAudioReference({ audioPath: take.audio_path });
  const parts = key?.split("/");
  if (!key || !parts || parts.length !== 3 || parts[0] !== userId || parts[1] !== take.script_id || !parts[2]) return null;
  const { data, error } = await client.storage.from("recordings").info(key);
  if (error) {
    const status = String((error as { statusCode?: string }).statusCode);
    if (status === "404" || status === "403") return null;
    throw new AppError(503, "録音を確認できませんでした。");
  }
  if (!data || !data.id || !data.version) {
    // No fallback to a weaker locator-only identity.
    throw new AppError(503, "録音を確認できませんでした。");
  }
  return createHash("sha256").update(JSON.stringify([
    "saved-take-audio-v1", userId, take.script_id, key, data.id,
    data.version, data.etag ?? null, data.size ?? null
  ])).digest("hex");
}
