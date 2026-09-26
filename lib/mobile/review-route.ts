import { z } from "zod";
import { NextRequest } from "next/server";
import { timeAsync } from "@/lib/performance/timing";
import type { AppSupabaseClient } from "@/lib/supabase/client";
import {
  getStoredReview,
  hydrateStoredReview,
  type StoredTakeReview
} from "@/services/review";
import { mobileApiError, mobileApiOk } from "./api-response";
import { toMobileReviewDto } from "./dto";
import { getOwnedTakeAudioIdentity } from "@/services/takes/take-audio-identity";
import { isScriptBrushUpEnabled } from "@/lib/brush-up/capability";
import { getScript } from "@/services/scripts/scripts.service";
import {
  authenticateMobileRequest,
  defaultMobileRouteAuthDependencies,
  handleMobileOptions,
  handleMobileUnsupportedMethod,
  mapMobileServiceError,
  type MobileRouteAuthDependencies
} from "./route-context";

const idSchema = z.string().uuid();

export interface MobileReviewRouteDependencies extends MobileRouteAuthDependencies {
  getOwnedTakeAudioIdentity: typeof getOwnedTakeAudioIdentity;
  getStoredReview(
    client: AppSupabaseClient,
    userId: string,
    scriptId: string,
    takeId: string
  ): Promise<StoredTakeReview | null>;
}

const defaultDependencies: MobileReviewRouteDependencies = {
  ...defaultMobileRouteAuthDependencies,
  getOwnedTakeAudioIdentity,
  getStoredReview
};

export async function handleMobileReviewGet(
  request: NextRequest,
  scriptId: string,
  takeId: string,
  dependencies: MobileReviewRouteDependencies = defaultDependencies
) {
  const auth = await authenticateMobileRequest(request, dependencies);

  if (!auth.ok) {
    return auth.response;
  }

  const { origin, client, userId } = auth.context;
  const parsedScriptId = idSchema.safeParse(scriptId);
  const parsedTakeId = idSchema.safeParse(takeId);

  if (!parsedScriptId.success || !parsedTakeId.success) {
    return mobileApiError(origin, 400, "request_invalid");
  }

  try {
    const stored = await timeAsync("mobile.review.load", () =>
      dependencies.getStoredReview(
        client,
        userId,
        parsedScriptId.data,
        parsedTakeId.data
      )
    );

    if (!stored) {
      return mobileApiError(origin, 404, "review_not_found");
    }

    const audioIdentity = await dependencies.getOwnedTakeAudioIdentity(client, userId, stored.take);
    const dto = toMobileReviewDto(hydrateStoredReview(stored));
    let brushUpAvailable = false;
    let brushUpCurrentRevision = false;
    if (isScriptBrushUpEnabled() && audioIdentity && dto.scriptSnapshot?.revisionId) {
      const script = await getScript(client, userId, parsedScriptId.data);
      brushUpAvailable = Boolean(script && ["reviewed", "completed"].includes(stored.take.status));
      brushUpCurrentRevision = Boolean(script && !script.archivedAt &&
        script.currentRevisionId === dto.scriptSnapshot.revisionId);
    }
    return mobileApiOk(origin, { review: { ...dto, audioIdentity, brushUpAvailable, brushUpCurrentRevision } });
  } catch (error) {
    return mapMobileServiceError(origin, error, {
      unavailable: "evaluation_unavailable",
      notFound: "review_not_found"
    });
  }
}

export function handleMobileReviewOptions(request: NextRequest) {
  return handleMobileOptions(request, ["GET"]);
}

export const handleMobileReviewUnsupportedMethod = handleMobileUnsupportedMethod;
