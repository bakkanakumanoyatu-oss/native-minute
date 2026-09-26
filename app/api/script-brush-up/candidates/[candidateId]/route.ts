import { NextRequest } from "next/server";
import { isScriptBrushUpEnabled } from "@/lib/brush-up/capability";
import { getErrorMessage, getErrorStatus } from "@/lib/errors";
import { jsonError, jsonOk } from "@/lib/http";
import { requireCurrentUser } from "@/lib/supabase/auth";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { brushUpDecisionSchema } from "@/schemas/brush-up";
import { decideScriptBrushUpCandidate, retryScriptBrushUpCleanup } from "@/services/brush-up/brush-up.service";
import { z } from "zod";

export async function POST(request: NextRequest, { params }: { params: { candidateId: string } | Promise<{ candidateId: string }> }) {
  if (!isScriptBrushUpEnabled()) return jsonError("台本専用のお手本候補は現在利用できません。", 403);
  try {
    const { candidateId } = await params;
    if (!z.string().uuid().safeParse(candidateId).success) return jsonError("お手本候補を確認してください。", 400);
    const client = createSupabaseRouteClient();
    const user = await requireCurrentUser(client);
    const parsed = brushUpDecisionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError("操作を確認してください。", 400);
    if (parsed.data.decision === "retry_cleanup") {
      await retryScriptBrushUpCleanup(user.id, candidateId);
      return jsonOk({ candidateId });
    }
    return jsonOk(await decideScriptBrushUpCandidate(client, user.id, candidateId, parsed.data.decision));
  } catch (error) {
    return jsonError(getErrorMessage(error, "お手本候補を変更できませんでした。"), getErrorStatus(error, 500));
  }
}
