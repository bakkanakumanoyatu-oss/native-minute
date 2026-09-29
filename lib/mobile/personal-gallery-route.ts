import { NextRequest } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { personalGalleryEnabled } from "@/lib/gallery/personal-rollout";
import { parsePersonalGalleryBody } from "@/lib/gallery/personal-request";
import { createPersonalGallerySchema, createScriptFromPersonalGallerySchema, deletePersonalGallerySchema, personalGalleryListSchema, updatePersonalGallerySchema } from "@/schemas/personal-gallery";
import { createScriptFromPersonalGallery, deletePersonalGallery, getPersonalGalleryItem, listPersonalGallery, quickAddPersonalGallery, savePersonalGalleryExample, updatePersonalGallery } from "@/services/gallery/personal-gallery.service";
import { mobileApiError, mobileApiOk } from "./api-response";
import { authenticateMobileRequest, handleMobileOptions, handleMobileUnsupportedMethod } from "./route-context";

type Operation = "list" | "create" | "get" | "update" | "delete" | "save-example" | "create-script";

export async function handleMobilePersonalGallery(request: NextRequest, operation: Operation, id?: string) {
  const auth = await authenticateMobileRequest(request);
  if (!auth.ok) return auth.response;
  const { origin, client, userId } = auth.context;
  if (!personalGalleryEnabled()) return mobileApiError(origin, 503, "personal_gallery_unavailable");
  try {
    if (id && operation !== "save-example" && !z.string().uuid().safeParse(id).success) throw new AppError(404, "not found");
    if (operation === "list") {
      const parsed = personalGalleryListSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
      if (!parsed.success) throw new AppError(400, "invalid list");
      return mobileApiOk(origin, { collection: await listPersonalGallery(client, userId, parsed.data) });
    }
    if (operation === "create") return mobileApiOk(origin, { item: await quickAddPersonalGallery(client, userId, await parsePersonalGalleryBody(request, createPersonalGallerySchema)) }, 201);
    if (operation === "save-example") return mobileApiOk(origin, { item: await savePersonalGalleryExample(client, userId, id!) });
    if (operation === "get") {
      const item = await getPersonalGalleryItem(client, userId, id!);
      if (!item) throw new AppError(404, "not found");
      return mobileApiOk(origin, { item });
    }
    if (operation === "update") return mobileApiOk(origin, { item: await updatePersonalGallery(client, userId, id!, await parsePersonalGalleryBody(request, updatePersonalGallerySchema)) });
    if (operation === "delete") {
      const input = await parsePersonalGalleryBody(request, deletePersonalGallerySchema);
      return mobileApiOk(origin, await deletePersonalGallery(client, userId, id!, input.expectedLockVersion));
    }
    const input = await parsePersonalGalleryBody(request, createScriptFromPersonalGallerySchema);
    return mobileApiOk(origin, { script: await createScriptFromPersonalGallery(client, userId, id!, input) });
  } catch (error) {
    const status = error instanceof AppError ? error.status : 500;
    if (status === 403) return mobileApiError(origin, 403, "account_deletion_in_progress");
    if (status === 404) return mobileApiError(origin, 404, "personal_gallery_not_found");
    if (status === 409) return mobileApiError(origin, 409, error instanceof Error && error.message.includes("10本") ? "script_limit_reached" : "personal_gallery_conflict");
    if (status === 400) return mobileApiError(origin, 400, "request_invalid");
    return mobileApiError(origin, 503, "personal_gallery_unavailable");
  }
}

export const handleMobilePersonalGalleryUnsupported = handleMobileUnsupportedMethod;
export function mobilePersonalGalleryOptions(request: NextRequest, methods: string[]) { return handleMobileOptions(request, methods); }
