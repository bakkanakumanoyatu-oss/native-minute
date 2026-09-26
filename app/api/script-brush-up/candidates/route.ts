import { NextRequest } from "next/server";
import { isScriptBrushUpEnabled } from "@/lib/brush-up/capability";
import { getErrorMessage, getErrorStatus } from "@/lib/errors";
import { jsonError, jsonOk } from "@/lib/http";
import { requireCurrentUser } from "@/lib/supabase/auth";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { brushUpGenerateSchema } from "@/schemas/brush-up";
import { getScriptBrushUpView, generateScriptBrushUpCandidate } from "@/services/brush-up/brush-up.service";
import { BetaQuotaError } from "@/services/quota/beta-quota.service";
import { z } from "zod";

export async function GET(request: NextRequest) {
  if (!isScriptBrushUpEnabled()) return jsonError("台本専用のお手本候補は現在利用できません。", 403);
  try {
    const client = createSupabaseRouteClient();
    const user = await requireCurrentUser(client);
    const query = z.object({ scriptId: z.string().uuid(), takeId: z.string().uuid() }).safeParse({
      scriptId: request.nextUrl.searchParams.get("scriptId"),
      takeId: request.nextUrl.searchParams.get("takeId")
    });
    if (!query.success) return jsonError("Take を確認してください。", 400);
    return jsonOk(await getScriptBrushUpView(client, user.id, query.data.scriptId, query.data.takeId));
  } catch (error) {
    return jsonError(getErrorMessage(error, "お手本候補を確認できませんでした。"), getErrorStatus(error, 500));
  }
}

export async function POST(request: NextRequest) {
  if (!isScriptBrushUpEnabled()) return jsonError("台本専用のお手本候補は現在利用できません。", 403);
  try {
    const client = createSupabaseRouteClient();
    const user = await requireCurrentUser(client);
    const parsed = brushUpGenerateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError("Take と専用同意を確認してください。", 400);
    return jsonOk(await generateScriptBrushUpCandidate(client, user.id, parsed.data));
  } catch (error) {
    return jsonError(getErrorMessage(error, "お手本候補を作れませんでした。"), getErrorStatus(error, 500),
      error instanceof BetaQuotaError ? { code: error.code, retryable: false } : undefined);
  }
}
