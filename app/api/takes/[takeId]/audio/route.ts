import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { requireCurrentUser } from "@/lib/supabase/auth";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { getErrorMessage, getErrorStatus } from "@/lib/errors";
import { timeAsync } from "@/lib/performance/timing";
import { getStoredReviewByTakeId } from "@/services/review/review.service";
import { loadOwnedRecordingForEvaluation } from "@/services/storage";

type RouteParams = {
  params:
    | {
        takeId: string;
      }
    | Promise<{
        takeId: string;
      }>;
};

export async function GET(_request: Request, { params }: RouteParams) {
  if (!hasSupabaseConfig()) {
    return new Response("Supabase configuration is missing.", { status: 503 });
  }

  try {
    const { takeId } = await params;
    const supabase = createSupabaseRouteClient();
    const user = await timeAsync("takesAudio.route.auth", () => requireCurrentUser(supabase));
    const review = await timeAsync("takesAudio.route.storedReview", () => getStoredReviewByTakeId(supabase, user.id, takeId));

    if (!review) {
      return new Response("Take not found.", { status: 404 });
    }

    const recording = await timeAsync("takesAudio.route.recordingDownload", () =>
      loadOwnedRecordingForEvaluation(supabase, user.id, review.take.script_id, {
        audioPath: review.take.audio_path
      })
    );

    if (!recording) {
      return new Response("Recording unavailable.", { status: 404 });
    }

    return new Response(new Uint8Array(recording.bytes), {
      headers: {
        "Content-Type": recording.contentType,
        "Cache-Control": "private, max-age=60",
        "Content-Disposition": `inline; filename="${recording.filename}"`
      }
    });
  } catch (error) {
    return new Response(getErrorMessage(error, "Recording unavailable."), {
      status: getErrorStatus(error, 401)
    });
  }
}
