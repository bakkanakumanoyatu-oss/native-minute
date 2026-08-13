import { z } from "zod";
import { NextRequest } from "next/server";
import { timeAsync } from "@/lib/performance/timing";
import type { AppSupabaseClient } from "@/lib/supabase/client";
import { buildScriptAudioPlaybackPath } from "@/lib/voice-playback-path";
import { loadOwnedScriptAudioReplay } from "@/services/voice";
import type { ScriptAudioReplayPayload } from "@/services/voice/replay.service";
import { buildMobileApiHeaders } from "./api-cors";
import { mobileApiError } from "./api-response";
import {
  authenticateMobileRequest,
  defaultMobileRouteAuthDependencies,
  handleMobileOptions,
  handleMobileUnsupportedMethod,
  mapMobileServiceError,
  type MobileRouteAuthDependencies
} from "./route-context";

const audioIdSchema = z.string().uuid();

export interface MobileScriptAudioRouteDependencies extends MobileRouteAuthDependencies {
  loadOwnedAudio(
    client: AppSupabaseClient,
    playbackPath: string
  ): Promise<ScriptAudioReplayPayload | null>;
}

const defaultDependencies: MobileScriptAudioRouteDependencies = {
  ...defaultMobileRouteAuthDependencies,
  loadOwnedAudio: loadOwnedScriptAudioReplay
};

export async function handleMobileScriptAudioGet(
  request: NextRequest,
  audioId: string,
  dependencies: MobileScriptAudioRouteDependencies = defaultDependencies
) {
  const auth = await authenticateMobileRequest(request, dependencies);

  if (!auth.ok) {
    return auth.response;
  }

  const { origin, client } = auth.context;
  const parsedId = audioIdSchema.safeParse(audioId);

  if (!parsedId.success) {
    return mobileApiError(origin, 400, "request_invalid");
  }

  try {
    const replay = await timeAsync("mobile.audio.load", () =>
      dependencies.loadOwnedAudio(client, buildScriptAudioPlaybackPath(parsedId.data))
    );

    if (!replay) {
      return mobileApiError(origin, 404, "audio_not_found");
    }

    const contentType = replay.contentType.split(";", 1)[0]?.trim().toLowerCase();

    if (!contentType?.startsWith("audio/")) {
      return mobileApiError(origin, 500, "audio_unavailable");
    }

    const bytes = new Uint8Array(replay.bytes);
    const headers = buildMobileApiHeaders(origin, {
      exposedHeaders: ["Content-Length", "Content-Type"]
    });
    headers.set("Content-Type", contentType);
    headers.set("Content-Length", String(bytes.byteLength));

    return new Response(bytes, { status: 200, headers });
  } catch (error) {
    return mapMobileServiceError(origin, error, {
      unavailable: "audio_unavailable",
      notFound: "audio_not_found"
    });
  }
}

export function handleMobileScriptAudioOptions(request: NextRequest) {
  return handleMobileOptions(request, ["GET"]);
}

export const handleMobileScriptAudioUnsupportedMethod = handleMobileUnsupportedMethod;
