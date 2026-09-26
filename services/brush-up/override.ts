import { AppError } from "@/lib/errors";
import type { AppSupabaseClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";

type Candidate = Database["public"]["Tables"]["script_brush_up_candidates"]["Row"];
type ScriptAudio = Database["public"]["Tables"]["script_audios"]["Row"];

export async function getAdoptedBrushUpAudio(
  client: AppSupabaseClient,
  userId: string,
  scriptId: string,
  revisionId: string
): Promise<ScriptAudio | null> {
  const { data: candidate, error } = await client.from("script_brush_up_candidates")
    .select("*").eq("user_id", userId).eq("script_id", scriptId)
    .eq("script_revision_id", revisionId).eq("status", "adopted").maybeSingle();
  if (error) throw new AppError(503, "台本専用のお手本を確認できませんでした。");
  const row = candidate as Candidate | null;
  if (!row?.candidate_script_audio_id || row.provider_cleanup_state !== "verified_absent") return null;
  const { data: audio, error: audioError } = await client.from("script_audios")
    .select("*").eq("id", row.candidate_script_audio_id).eq("script_id", scriptId)
    .eq("script_revision_id", revisionId).eq("generation_preset", "brush_up_candidate").maybeSingle();
  if (audioError) throw new AppError(503, "台本専用のお手本を確認できませんでした。");
  if (!audio) throw new AppError(503, "採用したお手本音声を確認できませんでした。");
  return audio as ScriptAudio;
}
