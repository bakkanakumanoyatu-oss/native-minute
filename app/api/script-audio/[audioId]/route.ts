import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { requireCurrentUser } from "@/lib/supabase/auth";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { buildScriptAudioPlaybackPath } from "@/lib/voice-playback-path";
import { getErrorMessage, getErrorStatus } from "@/lib/errors";
import { loadOwnedScriptAudioReplay } from "@/services/voice";

type RouteParams = {
  params:
    | {
        audioId: string;
      }
    | Promise<{
        audioId: string;
      }>;
};

export async function GET(_request: Request, { params }: RouteParams) {
  if (!hasSupabaseConfig()) {
    return new Response("Supabase configuration is missing.", { status: 503 });
  }

  try {
    const { audioId } = await params;
    const supabase = createSupabaseRouteClient();
    await requireCurrentUser(supabase);

    const storagePath = buildScriptAudioPlaybackPath(audioId);
    const replay = await loadOwnedScriptAudioReplay(supabase, storagePath);

    if (!replay) {
      return new Response("Audio not found.", { status: 404 });
    }

    return new Response(new Uint8Array(replay.bytes), {
      headers: {
        "Content-Type": replay.contentType,
        "Cache-Control": "private, max-age=60"
      }
    });
  } catch (error) {
    return new Response(getErrorMessage(error, "Audio unavailable."), {
      status: getErrorStatus(error, 401)
    });
  }
}
