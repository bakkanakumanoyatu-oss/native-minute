import { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { requireCurrentUser } from "@/lib/supabase/auth";
import { jsonError, jsonOk } from "@/lib/http";
import { getErrorMessage, getErrorStatus, AppError } from "@/lib/errors";
import { assertPersonalGalleryOrigin, parsePersonalGalleryBody } from "@/lib/gallery/personal-request";
import { createScriptFromPersonalGallerySchema } from "@/schemas/personal-gallery";
import { createScriptFromPersonalGallery } from "@/services/gallery/personal-gallery.service";
import { assertPersonalGalleryEnabled } from "@/lib/gallery/personal-rollout";

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    assertPersonalGalleryEnabled();
    assertPersonalGalleryOrigin(request);
    if (!z.string().uuid().safeParse(params.id).success) throw new AppError(404, "場面が見つかりません。");
    const client = createSupabaseRouteClient();
    const user = await requireCurrentUser(client);
    const input = await parsePersonalGalleryBody(request, createScriptFromPersonalGallerySchema);
    return client.applyToResponse(jsonOk(await createScriptFromPersonalGallery(client, user.id, params.id, input), { headers: { "Cache-Control": "no-store" } }));
  } catch (error) { return jsonError(getErrorMessage(error, "台本を作成できませんでした。"), getErrorStatus(error, 500)); }
}
