import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { requireCurrentUser } from "@/lib/supabase/auth";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { getErrorMessage, getErrorStatus } from "@/lib/errors";
import { jsonError, jsonOk } from "@/lib/http";
import { getAccountDeletionStatus } from "@/services/account-deletion";

export async function GET() {
  if (!hasSupabaseConfig()) {
    return jsonError("Supabase の環境変数が未設定です。", 503);
  }

  try {
    const supabase = createSupabaseRouteClient();
    const user = await requireCurrentUser(supabase);
    const deletionRequest = await getAccountDeletionStatus(supabase, user.id);

    return jsonOk({ deletionRequest });
  } catch (error) {
    return jsonError(getErrorMessage(error, "削除リクエスト状態を取得できませんでした。"), getErrorStatus(error, 500));
  }
}
