import { NextRequest } from "next/server";
import { getErrorMessage, getErrorStatus } from "@/lib/errors";
import { jsonError, jsonOk } from "@/lib/http";
import { requireCurrentUser } from "@/lib/supabase/auth";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { scriptStudioGenerationRequestSchema } from "@/schemas/script-studio";
import { generateScriptStudioDrafts } from "@/services/script-studio";

export async function POST(request: NextRequest) {
  if (!hasSupabaseConfig()) {
    return jsonError("Supabase の環境変数が未設定です。", 503);
  }

  try {
    const supabase = createSupabaseRouteClient();
    const user = await requireCurrentUser(supabase);

    const payload = await request.json().catch(() => null);
    const parsed = scriptStudioGenerationRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "Script Studio generation 入力を確認してください。", 400);
    }

    const result = await generateScriptStudioDrafts(parsed.data, { userId: user.id });

    return jsonOk(result);
  } catch (error) {
    return jsonError(getErrorMessage(error, "Script Studio generation に失敗しました。"), getErrorStatus(error, 500));
  }
}
