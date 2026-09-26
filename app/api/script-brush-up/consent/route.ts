import { NextRequest } from "next/server";
import { isScriptBrushUpEnabled } from "@/lib/brush-up/capability";
import { getErrorMessage, getErrorStatus } from "@/lib/errors";
import { jsonError, jsonOk } from "@/lib/http";
import { requireCurrentUser } from "@/lib/supabase/auth";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { brushUpConsentSchema } from "@/schemas/brush-up";
import { acceptScriptBrushUpConsent } from "@/services/brush-up/brush-up.service";

export async function POST(request: NextRequest) {
  if (!isScriptBrushUpEnabled()) return jsonError("台本専用のお手本候補は現在利用できません。", 403);
  try {
    const client = createSupabaseRouteClient();
    const user = await requireCurrentUser(client);
    const parsed = brushUpConsentSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError("Take と台本の版を確認してください。", 400);
    return jsonOk(await acceptScriptBrushUpConsent(client, user.id, parsed.data));
  } catch (error) {
    return jsonError(getErrorMessage(error, "専用同意を保存できませんでした。"), getErrorStatus(error, 500));
  }
}
