import { AppError } from "@/lib/errors";
import type { AppSupabaseClient } from "@/lib/supabase/client";
import { takeAudioFormat, takeExportFilename } from "@/lib/take-audio-format";
import { loadOwnedRecordingForEvaluation } from "@/services/storage";
import { MAX_RECORDING_BYTES } from "@/services/storage/constants";
import type { Database } from "@/types/database";

export async function loadOwnedTakeAudio(client: AppSupabaseClient, userId: string, takeId: string) {
  const { data: takeData, error } = await client.from("takes")
    .select("id, script_id, audio_path, display_name")
    .eq("id", takeId).eq("user_id", userId).eq("status", "reviewed").maybeSingle();
  if (error) throw new AppError(500, "録音を取得できませんでした。");
  const take = takeData as Pick<Database["public"]["Tables"]["takes"]["Row"], "id" | "script_id" | "audio_path" | "display_name"> | null;
  if (!take) throw new AppError(404, "保存済み録音が見つかりません。");
  const { data: scriptData, error: scriptError } = await client.from("scripts")
    .select("title").eq("id", take.script_id).eq("user_id", userId).maybeSingle();
  if (scriptError) throw new AppError(500, "台本を確認できませんでした。");
  const script = scriptData as { title: string } | null;
  if (!script) throw new AppError(404, "保存済み録音が見つかりません。");
  // Only the canonical Take's recordings locator is accepted. The existing loader
  // rechecks owner + script and downloads from the private recordings bucket.
  const audio = await loadOwnedRecordingForEvaluation(client, userId, take.script_id, { audioPath: take.audio_path });
  if (!audio) throw new AppError(404, "この録音は利用できません。");
  if (!audio.bytes.length || audio.bytes.length > MAX_RECORDING_BYTES) throw new AppError(400, "この録音は利用できません。");
  const format = takeAudioFormat(audio.contentType, audio.bytes);
  if (!format) throw new AppError(400, "この録音形式は利用できません。");
  return { bytes: audio.bytes, contentType: format.contentType,
    filename: takeExportFilename(take.display_name, script.title, format.extension) };
}
