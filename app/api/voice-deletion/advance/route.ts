import { NextRequest } from "next/server";
import { getErrorStatus } from "@/lib/errors";
import { jsonError, jsonOk } from "@/lib/http";
import { requireCurrentUser } from "@/lib/supabase/auth";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { voiceDeletionAdvanceSchema } from "@/schemas/voice-deletion";
import { advanceVoiceDeletion } from "@/services/voice-deletion";

export async function POST(request: NextRequest) {
  if (!hasSupabaseConfig()) {
    return jsonError("voice-only deletion は現在利用できません。", 503);
  }

  try {
    const client = createSupabaseRouteClient();
    const user = await requireCurrentUser(client);
    const payload = await request.json().catch(() => null);
    if (!voiceDeletionAdvanceSchema.safeParse(payload).success) {
      return jsonError("voice-only deletion の入力を確認してください。", 400);
    }

    const deletion = await advanceVoiceDeletion({ client, userId: user.id });
    return jsonOk({ deletion }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    return jsonError("voice-only deletion を進行できませんでした。", getErrorStatus(error, 500));
  }
}
