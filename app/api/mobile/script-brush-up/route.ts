import { NextRequest } from "next/server";
import { z } from "zod";
import { isScriptBrushUpEnabled } from "@/lib/brush-up/capability";
import { mobileApiError, mobileApiOk } from "@/lib/mobile/api-response";
import {
  authenticateMobileRequest,
  handleMobileOptions,
  handleMobileUnsupportedMethod,
  mapMobileServiceError
} from "@/lib/mobile/route-context";
import { brushUpConsentSchema, brushUpDecisionSchema, brushUpGenerateSchema } from "@/schemas/brush-up";
import {
  acceptScriptBrushUpConsent,
  decideScriptBrushUpCandidate,
  generateScriptBrushUpCandidate,
  getScriptBrushUpView,
  retryScriptBrushUpCleanup
} from "@/services/brush-up/brush-up.service";

const querySchema = z.object({ scriptId: z.string().uuid(), takeId: z.string().uuid() });
const actionSchema = z.discriminatedUnion("action", [
  brushUpConsentSchema.extend({ action: z.literal("consent") }),
  brushUpGenerateSchema.extend({ action: z.literal("generate") }),
  brushUpDecisionSchema.extend({ action: z.literal("decide"), candidateId: z.string().uuid() })
]);

function gated(request: NextRequest) {
  return isScriptBrushUpEnabled() ? null : mobileApiError(request.headers.get("origin"), 403, "brush_up_unavailable");
}

function publicView(view: Awaited<ReturnType<typeof getScriptBrushUpView>>) {
  if (!view) return null;
  return {
    candidateId: view.candidateId,
    status: view.status,
    isCurrentRevision: view.isCurrentRevision,
    baselineAudioId: view.baselineAudioId,
    candidateAudioId: view.candidateAudioId,
    cleanupPending: view.cleanupPending,
    manualCleanupRequired: view.manualCleanupRequired
  };
}

export async function GET(request: NextRequest) {
  const blocked = gated(request);
  if (blocked) return blocked;
  const auth = await authenticateMobileRequest(request);
  if (!auth.ok) return auth.response;
  const { origin, client, userId } = auth.context;
  const input = querySchema.safeParse({
    scriptId: request.nextUrl.searchParams.get("scriptId"),
    takeId: request.nextUrl.searchParams.get("takeId")
  });
  if (!input.success) return mobileApiError(origin, 400, "request_invalid");
  try {
    return mobileApiOk(origin, { view: publicView(await getScriptBrushUpView(client, userId, input.data.scriptId, input.data.takeId)) });
  } catch (error) {
    return mapMobileServiceError(origin, error, { unavailable: "brush_up_unavailable" });
  }
}

export async function POST(request: NextRequest) {
  const blocked = gated(request);
  if (blocked) return blocked;
  const auth = await authenticateMobileRequest(request);
  if (!auth.ok) return auth.response;
  const { origin, client, userId } = auth.context;
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return mobileApiError(origin, 400, "request_invalid");
  try {
    const input = parsed.data;
    if (input.action === "consent") {
      return mobileApiOk(origin, await acceptScriptBrushUpConsent(client, userId, input));
    }
    if (input.action === "generate") {
      return mobileApiOk(origin, await generateScriptBrushUpCandidate(client, userId, input));
    }
    if (input.decision === "retry_cleanup") {
      await retryScriptBrushUpCleanup(userId, input.candidateId);
      return mobileApiOk(origin, { candidateId: input.candidateId });
    }
    return mobileApiOk(origin, await decideScriptBrushUpCandidate(client, userId, input.candidateId, input.decision));
  } catch (error) {
    return mapMobileServiceError(origin, error, {
      unavailable: "brush_up_unavailable",
      conflict: "practice_state_conflict"
    });
  }
}

export function OPTIONS(request: NextRequest) {
  return handleMobileOptions(request, ["GET", "POST"]);
}

export const HEAD = handleMobileUnsupportedMethod;
export const PUT = handleMobileUnsupportedMethod;
export const PATCH = handleMobileUnsupportedMethod;
export const DELETE = handleMobileUnsupportedMethod;
