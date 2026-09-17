import { z } from "zod";
import { NextRequest } from "next/server";
import { loadOwnedTakeAudio } from "@/services/takes/take-audio.service";
import { buildMobileApiHeaders } from "./api-cors";
import { mobileApiError } from "./api-response";
import { authenticateMobileRequest, defaultMobileRouteAuthDependencies, handleMobileOptions,
  handleMobileUnsupportedMethod, type MobileRouteAuthDependencies } from "./route-context";

export interface TakeAudioRouteDependencies extends MobileRouteAuthDependencies { loadOwnedTakeAudio: typeof loadOwnedTakeAudio }
const defaults: TakeAudioRouteDependencies = { ...defaultMobileRouteAuthDependencies, loadOwnedTakeAudio };

export async function handleTakeAudioGet(request: NextRequest, takeId: string, dependencies = defaults) {
  const auth = await authenticateMobileRequest(request, dependencies);
  if (!auth.ok) return auth.response;
  const { origin, client, userId } = auth.context;
  if (!z.string().uuid().safeParse(takeId).success) return mobileApiError(origin, 400, "request_invalid");
  try {
    const audio = await dependencies.loadOwnedTakeAudio(client, userId, takeId);
    const headers = buildMobileApiHeaders(origin, { exposedHeaders: ["Content-Length", "Content-Type", "Content-Disposition"] });
    headers.set("Content-Type", audio.contentType);
    headers.set("Content-Length", String(audio.bytes.byteLength));
    headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(audio.filename)}`);
    return new Response(new Uint8Array(audio.bytes), { headers });
  } catch (error) {
    // No provider/storage errors, names or paths cross the public boundary.
    const status = (error as { status?: number })?.status;
    return status === 404 || status === 403
      ? mobileApiError(origin, 404, "audio_not_found")
      : mobileApiError(origin, 503, "audio_unavailable");
  }
}
export function handleTakeAudioOptions(request: NextRequest) { return handleMobileOptions(request, ["GET"]); }
export const handleTakeAudioUnsupportedMethod = handleMobileUnsupportedMethod;
