import { NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { requireCurrentUser } from "@/lib/supabase/auth";
import { jsonError, jsonOk } from "@/lib/http";
import { getErrorMessage, getErrorStatus } from "@/lib/errors";
import { assertPersonalGalleryOrigin } from "@/lib/gallery/personal-request";
import { savePersonalGalleryExample } from "@/services/gallery/personal-gallery.service";
import { assertPersonalGalleryEnabled } from "@/lib/gallery/personal-rollout";

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    assertPersonalGalleryEnabled();
    assertPersonalGalleryOrigin(request);
    const client = createSupabaseRouteClient();
    const user = await requireCurrentUser(client);
    return client.applyToResponse(jsonOk(await savePersonalGalleryExample(client, user.id, params.id), { headers: { "Cache-Control": "no-store" } }));
  } catch (error) { return jsonError(getErrorMessage(error, "見本を保存できませんでした。"), getErrorStatus(error, 500)); }
}
