import { NextRequest } from "next/server";
import { timeAsync } from "@/lib/performance/timing";
import type { AppSupabaseClient } from "@/lib/supabase/client";
import { scriptIdSchema } from "@/schemas/script";
import { getScript } from "@/services/scripts/scripts.service";
import type { ScriptListItem } from "@/services/scripts/types";
import { mobileApiError, mobileApiOk } from "./api-response";
import {
  authenticateMobileRequest,
  defaultMobileRouteAuthDependencies,
  handleMobileOptions,
  handleMobileUnsupportedMethod,
  mapMobileServiceError,
  type MobileRouteAuthDependencies
} from "./route-context";

export interface MobileScriptDetailRouteDependencies extends MobileRouteAuthDependencies {
  getOwnedScript(
    client: AppSupabaseClient,
    userId: string,
    scriptId: string
  ): Promise<ScriptListItem | null>;
}

const defaultDependencies: MobileScriptDetailRouteDependencies = {
  ...defaultMobileRouteAuthDependencies,
  getOwnedScript: getScript
};

export async function handleMobileScriptDetailGet(
  request: NextRequest,
  scriptId: string,
  dependencies: MobileScriptDetailRouteDependencies = defaultDependencies
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

  try {
    const script = await timeAsync("mobile.script.detail", () =>
      dependencies.getOwnedScript(client, userId, parsedId.data)
    );

    if (!script) {
      return mobileApiError(origin, 404, "script_not_found");
    }

    return mobileApiOk(origin, { script });
  } catch (error) {
    return mapMobileServiceError(origin, error, {
      unavailable: "scripts_unavailable",
      notFound: "script_not_found"
    });
  }
}

export function handleMobileScriptDetailOptions(request: NextRequest) {
  return handleMobileOptions(request, ["GET"]);
}

export const handleMobileScriptDetailUnsupportedMethod = handleMobileUnsupportedMethod;
