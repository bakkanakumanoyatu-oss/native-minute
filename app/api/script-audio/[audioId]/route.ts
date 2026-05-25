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

function parseRangeHeader(rangeHeader: string | null, byteLength: number) {
  if (!rangeHeader) {
    return null;
  }

  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);

  if (!match) {
    return "invalid" as const;
  }

  const [, startText, endText] = match;
  let start = startText ? Number(startText) : 0;
  let end = endText ? Number(endText) : byteLength - 1;

  if (!startText && endText) {
    const suffixLength = Number(endText);

    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return "invalid" as const;
    }

    start = Math.max(byteLength - suffixLength, 0);
    end = byteLength - 1;
  }

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    start >= byteLength
  ) {
    return "invalid" as const;
  }

  return {
    start,
    end: Math.min(end, byteLength - 1)
  };
}

export async function GET(request: Request, { params }: RouteParams) {
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

    const bytes = new Uint8Array(replay.bytes);
    const range = parseRangeHeader(request.headers.get("range"), bytes.byteLength);
    const baseHeaders = {
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=60",
      "Content-Type": replay.contentType
    };

    if (range === "invalid") {
      return new Response(null, {
        status: 416,
        headers: {
          ...baseHeaders,
          "Content-Range": `bytes */${bytes.byteLength}`
        }
      });
    }

    if (range) {
      const body = bytes.slice(range.start, range.end + 1);

      return new Response(body, {
        status: 206,
        headers: {
          ...baseHeaders,
          "Content-Length": String(body.byteLength),
          "Content-Range": `bytes ${range.start}-${range.end}/${bytes.byteLength}`
        }
      });
    }

    return new Response(bytes, {
      headers: {
        ...baseHeaders,
        "Content-Length": String(bytes.byteLength)
      }
    });
  } catch (error) {
    return new Response(getErrorMessage(error, "Audio unavailable."), {
      status: getErrorStatus(error, 401)
    });
  }
}
