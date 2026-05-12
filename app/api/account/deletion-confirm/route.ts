import { NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { requireCurrentUser } from "@/lib/supabase/auth";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { getErrorMessage, getErrorStatus } from "@/lib/errors";
import { jsonError, jsonOk } from "@/lib/http";
import { confirmAccountDeletionRequest } from "@/services/account-deletion";
import { confirmAccountDeletionRequestSchema } from "@/schemas/account-deletion";

export async function POST(request: NextRequest) {
  if (!hasSupabaseConfig()) {
    return jsonError("Supabase の環境変数が未設定です。", 503);
  }

  try {
    const supabase = createSupabaseRouteClient();
    const user = await requireCurrentUser(supabase);
    const payload = await request.json().catch(() => null);
    const parsed = confirmAccountDeletionRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "削除確認の入力を確認してください。", 400);
    }

    const result = await confirmAccountDeletionRequest(user.id);

    return jsonOk(result);
  } catch (error) {
    return jsonError(getErrorMessage(error, "削除リクエストを確認できませんでした。"), getErrorStatus(error, 500));
  }
}
