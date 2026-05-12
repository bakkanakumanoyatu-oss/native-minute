import { NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { requireCurrentUser } from "@/lib/supabase/auth";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { getErrorMessage, getErrorStatus } from "@/lib/errors";
import { jsonError, jsonOk } from "@/lib/http";
import { testSeedScriptRequestSchema } from "@/schemas/test-seed";
import { assertTestLoginAllowed } from "@/services/test-auth/test-login.service";
import { ensureE2ESmokeScript } from "@/services/test-auth/test-seed-script.service";

export async function POST(request: NextRequest) {
  if (!hasSupabaseConfig()) {
    return jsonError("Supabase の環境変数が未設定です。", 503);
  }

  try {
    const payload = await request.json().catch(() => null);
    const parsed = testSeedScriptRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "test-seed-script 入力を確認してください。", 400);
    }

    assertTestLoginAllowed(parsed.data.secret);

    const supabase = createSupabaseRouteClient();
    const user = await requireCurrentUser(supabase);
    const result = await ensureE2ESmokeScript(supabase, user.id);

    return jsonOk(result);
  } catch (error) {
    return jsonError(getErrorMessage(error, "test-seed-script に失敗しました。"), getErrorStatus(error, 500));
  }
}
