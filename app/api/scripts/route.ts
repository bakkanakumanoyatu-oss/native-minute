import { NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { requireCurrentUser } from "@/lib/supabase/auth";
import { createScriptSchema } from "@/schemas/script";
import { jsonError, jsonOk } from "@/lib/http";
import { getErrorMessage, getErrorStatus } from "@/lib/errors";
import { createScript, listScripts } from "@/services/scripts/scripts.service";
import { hasSupabaseConfig } from "@/lib/supabase/config";

export async function GET() {
  if (!hasSupabaseConfig()) {
    return jsonError("Supabase の環境変数が未設定です。", 503);
  }

  try {
    const supabase = createSupabaseRouteClient();
    const user = await requireCurrentUser(supabase);
    const scripts = await listScripts(supabase, user.id);
    return jsonOk({ scripts });
  } catch (error) {
    return jsonError(getErrorMessage(error, "台本一覧を取得できませんでした。"), getErrorStatus(error, 500));
  }
}

export async function POST(request: NextRequest) {
  if (!hasSupabaseConfig()) {
    return jsonError("Supabase の環境変数が未設定です。", 503);
  }

  try {
    const supabase = createSupabaseRouteClient();
    const user = await requireCurrentUser(supabase);
    const payload = await request.json().catch(() => null);
    const parsed = createScriptSchema.safeParse(payload);

    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "台本の入力を確認してください。", 400);
    }

    const script = await createScript(supabase, user.id, parsed.data);
    return jsonOk(script, { status: 201 });
  } catch (error) {
    return jsonError(getErrorMessage(error, "台本を保存できませんでした。"), getErrorStatus(error, 500));
  }
}
