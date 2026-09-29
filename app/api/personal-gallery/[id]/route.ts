import { NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { requireCurrentUser } from "@/lib/supabase/auth";
import { jsonError, jsonOk } from "@/lib/http";
import { getErrorMessage, getErrorStatus, AppError } from "@/lib/errors";
import { assertPersonalGalleryOrigin, parsePersonalGalleryBody } from "@/lib/gallery/personal-request";
import { deletePersonalGallerySchema, updatePersonalGallerySchema } from "@/schemas/personal-gallery";
import { deletePersonalGallery, getPersonalGalleryItem, updatePersonalGallery } from "@/services/gallery/personal-gallery.service";
import { z } from "zod";
import { assertPersonalGalleryEnabled } from "@/lib/gallery/personal-rollout";

export const dynamic = "force-dynamic";
function id(value: string) { if (!z.string().uuid().safeParse(value).success) throw new AppError(404, "場面が見つかりません。"); return value; }
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    assertPersonalGalleryEnabled();
    const client = createSupabaseRouteClient();
    const user = await requireCurrentUser(client);
    const item = await getPersonalGalleryItem(client, user.id, id(params.id));
    if (!item) throw new AppError(404, "場面が見つかりません。");
    return client.applyToResponse(jsonOk(item, { headers: { "Cache-Control": "no-store" } }));
  } catch (error) { return jsonError(getErrorMessage(error, "場面を取得できませんでした。"), getErrorStatus(error, 500)); }
}
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    assertPersonalGalleryEnabled();
    assertPersonalGalleryOrigin(request);
    const client = createSupabaseRouteClient();
    const user = await requireCurrentUser(client);
    const input = await parsePersonalGalleryBody(request, updatePersonalGallerySchema);
    return client.applyToResponse(jsonOk(await updatePersonalGallery(client, user.id, id(params.id), input), { headers: { "Cache-Control": "no-store" } }));
  } catch (error) { return jsonError(getErrorMessage(error, "場面を更新できませんでした。"), getErrorStatus(error, 500)); }
}
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    assertPersonalGalleryEnabled();
    assertPersonalGalleryOrigin(request);
    const client = createSupabaseRouteClient();
    const user = await requireCurrentUser(client);
    const input = await parsePersonalGalleryBody(request, deletePersonalGallerySchema);
    return client.applyToResponse(jsonOk(await deletePersonalGallery(client, user.id, id(params.id), input.expectedLockVersion), { headers: { "Cache-Control": "no-store" } }));
  } catch (error) { return jsonError(getErrorMessage(error, "場面を削除できませんでした。"), getErrorStatus(error, 500)); }
}
