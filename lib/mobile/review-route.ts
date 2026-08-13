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
  getStoredReview(
    client: AppSupabaseClient,
    userId: string,
    scriptId: string,
    takeId: string
  ): Promise<StoredTakeReview | null>;
}

const defaultDependencies: MobileReviewRouteDependencies = {
  ...defaultMobileRouteAuthDependencies,
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

    return mobileApiOk(origin, { review: toMobileReviewDto(hydrateStoredReview(stored)) });
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
