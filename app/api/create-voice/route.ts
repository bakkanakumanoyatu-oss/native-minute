import { NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { requireCurrentUser } from "@/lib/supabase/auth";
import { jsonError, jsonOk } from "@/lib/http";
import { getErrorMessage, getErrorStatus } from "@/lib/errors";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createVoiceRequestSchema } from "@/schemas/voice";
import { createUserVoice } from "@/services/voice";

export async function POST(request: NextRequest) {
  if (!hasSupabaseConfig()) {
    return jsonError("Supabase の環境変数が未設定です。", 503);
  }

  const supabase = createSupabaseRouteClient();

  try {
    const user = await requireCurrentUser(supabase);
    const payload = await request.json().catch(() => null);
    const parsed = createVoiceRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "voice 作成入力を確認してください。", 400);
    }

    const voice = await createUserVoice(supabase, user.id, parsed.data);
    return supabase.applyToResponse(jsonOk({ voice }));
  } catch (error) {
    return supabase.applyToResponse(jsonError(getErrorMessage(error, "voice の作成に失敗しました。"), getErrorStatus(error, 500)));
  }
}
