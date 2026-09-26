import { NextRequest } from "next/server";
import { z } from "zod";
import { timeAsync } from "@/lib/performance/timing";
import type { AppSupabaseClient } from "@/lib/supabase/client";
import { parseScriptAudioPlaybackPath } from "@/lib/voice-playback-path";
import { scriptIdSchema, practiceIdentitySchema } from "@/schemas/script";
import type { SpeakScriptRequestInput } from "@/schemas/voice";
import { getScript } from "@/services/scripts/scripts.service";
import type { ScriptListItem } from "@/services/scripts/types";
import { ScriptAudioLengthError, speakScript } from "@/services/voice";
import { mobileApiError, mobileApiOk } from "./api-response";
import {
  authenticateMobileRequest,
  defaultMobileRouteAuthDependencies,
  handleMobileOptions,
  handleMobileUnsupportedMethod,
  mapMobileServiceError,
  type MobileRouteAuthDependencies
} from "./route-context";

type SpeakScriptResult = Awaited<ReturnType<typeof speakScript>>;

export interface MobileListenRouteDependencies extends MobileRouteAuthDependencies {
  getOwnedScript(
    client: AppSupabaseClient,
    userId: string,
    scriptId: string
  ): Promise<ScriptListItem | null>;
  speakOwnedScript(
    client: AppSupabaseClient,
    userId: string,
    input: SpeakScriptRequestInput
  ): Promise<SpeakScriptResult>;
}

const defaultDependencies: MobileListenRouteDependencies = {
  ...defaultMobileRouteAuthDependencies,
  getOwnedScript: getScript,
  speakOwnedScript: speakScript
};

export async function handleMobileListenPost(
  request: NextRequest,
  scriptId: string,
  dependencies: MobileListenRouteDependencies = defaultDependencies
) {
  const auth = await authenticateMobileRequest(request, dependencies);

  if (!auth.ok) {
    return auth.response;
  }

  const { origin, client, userId } = auth.context;
  const parsedId = scriptIdSchema.safeParse(scriptId);

  if (!parsedId.success) {
    return mobileApiError(origin, 400, "request_invalid");
  }

  const identity = practiceIdentitySchema.extend({ operationId: z.string().uuid().optional() })
    .strict().safeParse(await request.json().catch(() => null));
  if (!identity.success) return mobileApiError(origin, 400, "request_invalid");
  try {
    const script = await timeAsync("mobile.listen.ownership", () =>
      dependencies.getOwnedScript(client, userId, parsedId.data)
    );

    if (!script) {
      return mobileApiError(origin, 404, "script_not_found");
    }

    const result = await timeAsync("mobile.listen.service", () =>
      dependencies.speakOwnedScript(client, userId, { scriptId: script.id, ...identity.data })
    );
    const audioId = parseScriptAudioPlaybackPath(result.audioUrl);

    if (!audioId) {
      return mobileApiError(origin, 500, "listen_unavailable");
    }

    return mobileApiOk(origin, { audioId, cached: result.cached });
  } catch (error) {
    if (error instanceof ScriptAudioLengthError) {
      return mobileApiError(origin, 400, "script_length_exceeded");
    }
    return mapMobileServiceError(origin, error, {
      unavailable: "listen_unavailable",
      notFound: "script_not_found",
      conflict: "voice_setup_required"
    });
  }
}

export function handleMobileListenOptions(request: NextRequest) {
  return handleMobileOptions(request, ["POST"]);
}

export const handleMobileListenUnsupportedMethod = handleMobileUnsupportedMethod;
