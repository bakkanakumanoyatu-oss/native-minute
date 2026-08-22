import { NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { requireCurrentUser } from "@/lib/supabase/auth";
import { jsonError, jsonOk } from "@/lib/http";
import { getErrorMessage, getErrorStatus } from "@/lib/errors";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { voiceConsentRequestSchema } from "@/schemas/voice";
import { createVoiceConsent } from "@/services/voice";

export async function POST(request: NextRequest) {
  if (!hasSupabaseConfig()) {
    return jsonError("Supabase の環境変数が未設定です。", 503);
  }

  const supabase = createSupabaseRouteClient();

  try {
    const user = await requireCurrentUser(supabase);
    const payload = await request.json().catch(() => null);
    const parsed = voiceConsentRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "同意内容を確認してください。", 400);
    }

    await createVoiceConsent(supabase, user.id, parsed.data);
    // The persisted provider consent can contain a provider ID and app-owned
    // recording reference. The browser only needs to know that state changed.
    return supabase.applyToResponse(jsonOk({ created: true }));
  } catch (error) {
    return supabase.applyToResponse(jsonError(getErrorMessage(error, "同意の記録に失敗しました。"), getErrorStatus(error, 500)));
  }
}
