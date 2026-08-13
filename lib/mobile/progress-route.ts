import { NextRequest } from "next/server";
import { timeAsync } from "@/lib/performance/timing";
import type { AppSupabaseClient } from "@/lib/supabase/client";
import {
  getProgressOverview,
  type ProgressOverview
} from "@/services/progress";
import { mobileApiOk } from "./api-response";
import {
  authenticateMobileRequest,
  defaultMobileRouteAuthDependencies,
  handleMobileOptions,
  handleMobileUnsupportedMethod,
  mapMobileServiceError,
  type MobileRouteAuthDependencies
} from "./route-context";

export interface MobileProgressRouteDependencies extends MobileRouteAuthDependencies {
  getOwnedProgress(
    client: AppSupabaseClient,
    userId: string
  ): Promise<ProgressOverview>;
}

const defaultDependencies: MobileProgressRouteDependencies = {
  ...defaultMobileRouteAuthDependencies,
  getOwnedProgress: getProgressOverview
};

export async function handleMobileProgressGet(
  request: NextRequest,
  dependencies: MobileProgressRouteDependencies = defaultDependencies
) {
  const auth = await authenticateMobileRequest(request, dependencies);

  if (!auth.ok) {
    return auth.response;
  }

  const { origin, client, userId } = auth.context;

  try {
    const progress = await timeAsync("mobile.progress.load", () =>
      dependencies.getOwnedProgress(client, userId)
    );
    return mobileApiOk(origin, { progress });
  } catch (error) {
    return mapMobileServiceError(origin, error, {
      unavailable: "progress_unavailable"
    });
  }
}

export function handleMobileProgressOptions(request: NextRequest) {
  return handleMobileOptions(request, ["GET"]);
}

export const handleMobileProgressUnsupportedMethod = handleMobileUnsupportedMethod;
