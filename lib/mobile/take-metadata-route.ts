import { z } from "zod";
import { NextRequest } from "next/server";
import { takeMetadataSchema } from "@/schemas/take-metadata";
import { updateTakeMetadata } from "@/services/takes/take-metadata.service";
import { mobileApiError, mobileApiOk } from "./api-response";
import { authenticateMobileRequest, defaultMobileRouteAuthDependencies, handleMobileOptions,
  mapMobileServiceError, type MobileRouteAuthDependencies } from "./route-context";

export interface TakeMetadataRouteDependencies extends MobileRouteAuthDependencies {
  updateTakeMetadata: typeof updateTakeMetadata;
}
const defaults: TakeMetadataRouteDependencies = { ...defaultMobileRouteAuthDependencies, updateTakeMetadata };

export async function handleTakeMetadataPatch(request: NextRequest, takeId: string, dependencies = defaults) {
  const auth = await authenticateMobileRequest(request, dependencies);
  if (!auth.ok) return auth.response;
  const { origin, client, userId } = auth.context;
  const input = takeMetadataSchema.safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(takeId).success || !input.success) return mobileApiError(origin, 400, "request_invalid");
  try {
    const metadata = await dependencies.updateTakeMetadata(client, userId, takeId, input.data);
    return mobileApiOk(origin, { metadata });
  } catch (error) {
    return mapMobileServiceError(origin, error, { unavailable: "take_metadata_unavailable", notFound: "review_not_found" });
  }
}
export function handleTakeMetadataOptions(request: NextRequest) {
  return handleMobileOptions(request, ["PATCH"]);
}
