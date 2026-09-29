import { NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { requireCurrentUser } from "@/lib/supabase/auth";
import { jsonError, jsonOk } from "@/lib/http";
import { getErrorMessage, getErrorStatus } from "@/lib/errors";
import { assertPersonalGalleryOrigin, parsePersonalGalleryBody } from "@/lib/gallery/personal-request";
import { createPersonalGallerySchema, personalGalleryListSchema } from "@/schemas/personal-gallery";
import { listPersonalGallery, quickAddPersonalGallery } from "@/services/gallery/personal-gallery.service";
import { assertPersonalGalleryEnabled } from "@/lib/gallery/personal-rollout";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    assertPersonalGalleryEnabled();
    const client = createSupabaseRouteClient();
    const user = await requireCurrentUser(client);
    const parsed = personalGalleryListSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "検索条件を確認してください。", 400);
    return client.applyToResponse(jsonOk(await listPersonalGallery(client, user.id, parsed.data), { headers: { "Cache-Control": "no-store" } }));
  } catch (error) { return jsonError(getErrorMessage(error, "コレクションを取得できませんでした。"), getErrorStatus(error, 500)); }
}
export async function POST(request: NextRequest) {
  try {
    assertPersonalGalleryEnabled();
    assertPersonalGalleryOrigin(request);
    const client = createSupabaseRouteClient();
    const user = await requireCurrentUser(client);
    const input = await parsePersonalGalleryBody(request, createPersonalGallerySchema);
    return client.applyToResponse(jsonOk(await quickAddPersonalGallery(client, user.id, input), { status: 201, headers: { "Cache-Control": "no-store" } }));
  } catch (error) { return jsonError(getErrorMessage(error, "場面を保存できませんでした。"), getErrorStatus(error, 500)); }
}
