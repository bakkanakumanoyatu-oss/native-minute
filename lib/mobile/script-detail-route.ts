import { NextRequest } from "next/server";
import { timeAsync } from "@/lib/performance/timing";
import type { AppSupabaseClient } from "@/lib/supabase/client";
import { scriptIdSchema, updateScriptSchema, scriptArchiveSchema } from "@/schemas/script";
import { getScript, updateScript, setScriptArchived } from "@/services/scripts/scripts.service";
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
  return handleMobileOptions(request, ["GET", "PATCH", "DELETE"]);
}

export const handleMobileScriptDetailUnsupportedMethod = handleMobileUnsupportedMethod;

export async function handleMobileScriptMutation(request: NextRequest, scriptId: string) {
  const auth = await authenticateMobileRequest(request, defaultDependencies);
  if (!auth.ok) return auth.response;
  const { origin, client, userId } = auth.context;
  if (!scriptIdSchema.safeParse(scriptId).success) return mobileApiError(origin, 400, "request_invalid");
  const payload = await request.json().catch(() => null);
  try {
    if (request.method === "DELETE") {
      const parsed = scriptArchiveSchema.omit({ archived: true }).safeParse(payload);
      if (!parsed.success) return mobileApiError(origin, 400, "request_invalid");
      return mobileApiOk(origin, { script: await setScriptArchived(client, userId, scriptId, true, parsed.data.expectedLockVersion) });
    }
    if (payload && typeof payload.archived === "boolean") {
      const parsed = scriptArchiveSchema.safeParse(payload);
      if (!parsed.success) return mobileApiError(origin, 400, "request_invalid");
      return mobileApiOk(origin, { script: await setScriptArchived(client, userId, scriptId, parsed.data.archived, parsed.data.expectedLockVersion) });
    }
    const parsed = updateScriptSchema.safeParse({ ...payload, id: scriptId });
    if (!parsed.success) return mobileApiError(origin, 400, "request_invalid");
    return mobileApiOk(origin, { script: await updateScript(client, userId, parsed.data) });
  } catch (error) {
    return mapMobileServiceError(origin, error, { unavailable: "scripts_unavailable" });
  }
}
