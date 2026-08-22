import { getErrorMessage, getErrorStatus } from "@/lib/errors";
import { jsonError, jsonOk } from "@/lib/http";
import { requireCurrentUser } from "@/lib/supabase/auth";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { runVoiceOnlyDeletionDryRun } from "@/services/voice-deletion";

/**
 * G5C-A has no client-controlled target input. The authenticated server-side user is
 * the only source of ownership for the inventory and dry-run summary.
 */
export async function GET() {
  if (!hasSupabaseConfig()) {
    return jsonError("Supabase の環境変数が未設定です。", 503);
  }

  try {
    const supabase = createSupabaseRouteClient();
    const user = await requireCurrentUser(supabase);
    const dryRun = await runVoiceOnlyDeletionDryRun(supabase, user.id);

    return jsonOk({ dryRun });
  } catch (error) {
    return jsonError(getErrorMessage(error, "voice-only deletion の安全確認を取得できませんでした。"), getErrorStatus(error, 500));
  }
}
