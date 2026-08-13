import { z } from "zod";
import { NextRequest } from "next/server";
import { timeAsync } from "@/lib/performance/timing";
import type { AppSupabaseClient } from "@/lib/supabase/client";
import { evaluateRequestSchema, type EvaluateRequestInput } from "@/schemas/evaluate";
import {
  claimReviewTake,
  createPersistedReview,
  getStoredReview,
  hydrateStoredReview,
  releaseReviewTakeClaim,
  type ReviewTakeClaimInput,
  type ReviewTakeClaimResult,
  type StoredTakeReview
} from "@/services/review";
import { getScript } from "@/services/scripts/scripts.service";
import type { ScriptListItem } from "@/services/scripts/types";
import { createRecordingAudioPath } from "@/services/storage";
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

const mobileEvaluatePayloadSchema = z
  .object({
    scriptId: z.string().uuid(),
    takeId: z.string().uuid(),
    recordingRef: z.string().uuid(),
    locale: z.literal("en-US").optional()
  })
  .strict();

type PersistedReviewResult = Awaited<ReturnType<typeof createPersistedReview>>;

export interface MobileEvaluateRouteDependencies extends MobileRouteAuthDependencies {
  getStoredReview(
    client: AppSupabaseClient,
    userId: string,
    scriptId: string,
    takeId: string
  ): Promise<StoredTakeReview | null>;
  getOwnedScript(
    client: AppSupabaseClient,
    userId: string,
    scriptId: string
  ): Promise<ScriptListItem | null>;
  createPersistedReview(
    client: AppSupabaseClient,
    userId: string,
    input: EvaluateRequestInput
  ): Promise<PersistedReviewResult>;
  claimReviewTake(
    client: AppSupabaseClient,
    userId: string,
    input: ReviewTakeClaimInput
  ): Promise<ReviewTakeClaimResult>;
  releaseReviewTakeClaim(
    client: AppSupabaseClient,
    userId: string,
    input: ReviewTakeClaimInput
  ): Promise<void>;
}

const defaultDependencies: MobileEvaluateRouteDependencies = {
  ...defaultMobileRouteAuthDependencies,
  getStoredReview,
  getOwnedScript: getScript,
  createPersistedReview,
  claimReviewTake,
  releaseReviewTakeClaim
};

export async function handleMobileEvaluatePost(
  request: NextRequest,
  dependencies: MobileEvaluateRouteDependencies = defaultDependencies
) {
  const auth = await authenticateMobileRequest(request, dependencies);

  if (!auth.ok) {
    return auth.response;
  }

  const { origin, client, userId } = auth.context;
  const payload = await request.json().catch(() => null);
  const mobilePayload = mobileEvaluatePayloadSchema.safeParse(payload);

  if (!mobilePayload.success) {
    return mobileApiError(origin, 400, "request_invalid");
  }

  const parsed = evaluateRequestSchema.safeParse({
    scriptId: mobilePayload.data.scriptId,
    takeId: mobilePayload.data.takeId,
    audioStorageKey: `${userId}/${mobilePayload.data.scriptId}/${mobilePayload.data.recordingRef}.wav`,
    locale: mobilePayload.data.locale ?? "en-US"
  });

  if (!parsed.success) {
    return mobileApiError(origin, 400, "request_invalid");
  }

  const audioStorageKey = parsed.data.audioStorageKey;

  if (!audioStorageKey) {
    return mobileApiError(origin, 400, "request_invalid");
  }

  let activeClaim: ReviewTakeClaimInput | null = null;

  try {
    const script = await timeAsync("mobile.evaluate.ownership", () =>
      dependencies.getOwnedScript(client, userId, parsed.data.scriptId)
    );

    if (!script) {
      return mobileApiError(origin, 404, "script_not_found");
    }

    const claimInput: ReviewTakeClaimInput = {
      takeId: mobilePayload.data.takeId,
      scriptId: parsed.data.scriptId,
      audioPath: createRecordingAudioPath(audioStorageKey)
    };
    const claim = await timeAsync("mobile.evaluate.claim", () =>
      dependencies.claimReviewTake(client, userId, claimInput)
    );

    if (claim === "conflict") {
      return mobileApiError(origin, 409, "request_invalid");
    }

    if (claim === "processing") {
      return mobileApiError(origin, 409, "evaluation_in_progress");
    }

    if (claim === "reviewed") {
      const canonical = await dependencies.getStoredReview(
        client,
        userId,
        parsed.data.scriptId,
        mobilePayload.data.takeId
      );

      return canonical
        ? mobileApiOk(origin, { review: toMobileReviewDto(hydrateStoredReview(canonical)) })
        : mobileApiError(origin, 409, "evaluation_in_progress");
    }

    activeClaim = claimInput;

    const persisted = await timeAsync("mobile.evaluate.service", () =>
      dependencies.createPersistedReview(client, userId, parsed.data)
    );

    return mobileApiOk(origin, { review: toMobileReviewDto(persisted.storedReview) }, 201);
  } catch (error) {
    if (activeClaim) {
      await dependencies.releaseReviewTakeClaim(client, userId, activeClaim);
    }

    return mapMobileServiceError(origin, error, {
      unavailable: "evaluation_unavailable",
      notFound: "recording_invalid",
      invalid: "recording_invalid"
    });
  }
}

export function handleMobileEvaluateOptions(request: NextRequest) {
  return handleMobileOptions(request, ["POST"]);
}

export const handleMobileEvaluateUnsupportedMethod = handleMobileUnsupportedMethod;
