import { NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { requireCurrentUser } from "@/lib/supabase/auth";
import { jsonError, jsonOk } from "@/lib/http";
import { getErrorMessage, getErrorStatus } from "@/lib/errors";
import { createScriptFromGallery } from "@/services/gallery/gallery-content.service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin) return jsonError("この操作は利用できません。", 403);
    const supabase = createSupabaseRouteClient();
    const user = await requireCurrentUser(supabase);
    const script = await createScriptFromGallery(supabase, user.id, params.id);
    return supabase.applyToResponse(jsonOk(script, { status: 201, headers: { "Cache-Control": "no-store" } }));
  } catch (error) {
    return jsonError(getErrorMessage(error, "台本を保存できませんでした。"), getErrorStatus(error, 500));
  }
}
