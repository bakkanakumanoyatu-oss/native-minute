import { NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { requireCurrentUser } from "@/lib/supabase/auth";
import { jsonError, jsonOk } from "@/lib/http";
import { getErrorMessage, getErrorStatus } from "@/lib/errors";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { speakScriptRequestSchema } from "@/schemas/voice";
import { speakScript } from "@/services/voice";

export async function POST(request: NextRequest) {
  if (!hasSupabaseConfig()) {
    return jsonError("Supabase の環境変数が未設定です。", 503);
  }

  try {
    const supabase = createSupabaseRouteClient();
    const user = await requireCurrentUser(supabase);
    const payload = await request.json().catch(() => null);
    const parsed = speakScriptRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "お手本ボイスの入力を確認してください。", 400);
    }

    const result = await speakScript(supabase, user.id, parsed.data);
    return jsonOk({
      audioUrl: result.audioUrl,
      cached: result.cached,
      cacheKey: result.cacheKey,
      voice: {
        id: result.voice.id,
        label: result.voice.label,
        provider: result.voice.provider
      }
    });
  } catch (error) {
    return jsonError(getErrorMessage(error, "お手本ボイスを生成できませんでした。"), getErrorStatus(error, 500));
  }
}
