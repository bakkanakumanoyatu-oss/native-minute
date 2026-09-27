import { NextRequest } from "next/server";
import { getGalleryPracticePayload, createScriptFromGallery } from "@/services/gallery/gallery-content.service";
import { mobileApiOk } from "./api-response";
import { authenticateMobileRequest, defaultMobileRouteAuthDependencies, handleMobileOptions, handleMobileUnsupportedMethod, mapMobileServiceError, type MobileRouteAuthDependencies } from "./route-context";

type GalleryDependencies = MobileRouteAuthDependencies & {
  getPractice: typeof getGalleryPracticePayload;
  createFromGallery: typeof createScriptFromGallery;
};

const defaultDependencies: GalleryDependencies = {
  ...defaultMobileRouteAuthDependencies,
  getPractice: getGalleryPracticePayload,
  createFromGallery: createScriptFromGallery
};

export async function handleMobileGalleryGet(request: NextRequest, id: string, dependencies: GalleryDependencies = defaultDependencies) {
  const auth = await authenticateMobileRequest(request, dependencies);
  if (!auth.ok) return auth.response;
  const { origin } = auth.context;
  try {
    const practice = await dependencies.getPractice(id);
    return mobileApiOk(origin, { practice });
  } catch (error) {
    return mapMobileServiceError(origin, error, { unavailable: "gallery_unavailable", notFound: "gallery_not_found" });
  }
}

export async function handleMobileGalleryPost(request: NextRequest, id: string, dependencies: GalleryDependencies = defaultDependencies) {
  const auth = await authenticateMobileRequest(request, dependencies);
  if (!auth.ok) return auth.response;
  const { origin, client, userId } = auth.context;
  try {
    const script = await dependencies.createFromGallery(client, userId, id);
    return mobileApiOk(origin, { script }, 201);
  } catch (error) {
    return mapMobileServiceError(origin, error, { unavailable: "gallery_unavailable", notFound: "gallery_not_found", conflict: "script_limit_reached" });
  }
}

export function handleMobileGalleryOptions(request: NextRequest) { return handleMobileOptions(request, ["GET", "POST"]); }
export const handleMobileGalleryUnsupportedMethod = handleMobileUnsupportedMethod;
