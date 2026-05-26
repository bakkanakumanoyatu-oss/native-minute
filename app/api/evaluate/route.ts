import { NextRequest } from "next/server";
import { timeAsync } from "@/lib/performance/timing";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { requireCurrentUser } from "@/lib/supabase/auth";
import { jsonError, jsonOk } from "@/lib/http";
import { getErrorMessage, getErrorStatus } from "@/lib/errors";
import { evaluateRequestSchema } from "@/schemas/evaluate";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createPersistedReview } from "@/services/review/review.service";

export async function POST(request: NextRequest) {
  if (!hasSupabaseConfig()) {
    return jsonError("Supabase の環境変数が未設定です。", 503);
  }

  try {
    const supabase = createSupabaseRouteClient();
    const user = await timeAsync("evaluate.route.auth", () => requireCurrentUser(supabase));

    const parsed = await timeAsync("evaluate.route.validation", async () => {
      const payload = await request.json().catch(() => null);
      return evaluateRequestSchema.safeParse(payload);
    });

    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "評価入力を確認してください。", 400);
    }

    const review = await timeAsync("evaluate.route.createPersistedReview", () => createPersistedReview(supabase, user.id, parsed.data));
    return jsonOk({
      takeId: review.takeId,
      evaluation: review.evaluation,
      coach: review.coach
    });
  } catch (error) {
    return jsonError(getErrorMessage(error, "評価に失敗しました。"), getErrorStatus(error, 500));
  }
}
