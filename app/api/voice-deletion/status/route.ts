import { getErrorStatus } from "@/lib/errors";
import { jsonError, jsonOk } from "@/lib/http";
import { requireCurrentUser } from "@/lib/supabase/auth";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { getVoiceDeletionStatus } from "@/services/voice-deletion";

export async function GET() {
  if (!hasSupabaseConfig()) {
    return jsonError("voice-only deletion は現在利用できません。", 503);
  }

  try {
    const client = createSupabaseRouteClient();
    const user = await requireCurrentUser(client);
    const deletion = await getVoiceDeletionStatus({ client, userId: user.id });
    return jsonOk({ deletion }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    return jsonError("voice-only deletion の状態を取得できませんでした。", getErrorStatus(error, 500));
  }
}
