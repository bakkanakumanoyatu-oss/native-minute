import { NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { requireCurrentUser } from "@/lib/supabase/auth";
import { jsonError, jsonOk } from "@/lib/http";
import { getErrorMessage, getErrorStatus } from "@/lib/errors";
import { coachRequestSchema } from "@/schemas/evaluate";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { getPersistedCoach } from "@/services/review/review.service";

export async function POST(request: NextRequest) {
  if (!hasSupabaseConfig()) {
    return jsonError("Supabase の環境変数が未設定です。", 503);
  }

  try {
    const supabase = createSupabaseRouteClient();
    const user = await requireCurrentUser(supabase);

    const payload = await request.json().catch(() => null);
    const parsed = coachRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "コーチング入力を確認してください。", 400);
    }

    const coach = await getPersistedCoach(supabase, user.id, parsed.data.takeId);

    if (!coach) {
      return jsonError("保存済みの take が見つかりませんでした。", 404);
    }

    return jsonOk({ coach });
  } catch (error) {
    return jsonError(getErrorMessage(error, "コーチングを生成できませんでした。"), getErrorStatus(error, 500));
  }
}
