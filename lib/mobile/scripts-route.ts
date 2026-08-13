import { z } from "zod";
import { NextRequest } from "next/server";
import { AppError } from "@/lib/errors";
import { timeAsync } from "@/lib/performance/timing";
import type { AppSupabaseClient } from "@/lib/supabase/client";
import { createScriptSchema, type CreateScriptInput } from "@/schemas/script";
import { createScript, listScripts } from "@/services/scripts/scripts.service";
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

export interface MobileScriptsRouteDependencies extends MobileRouteAuthDependencies {
  listOwnedScripts(client: AppSupabaseClient, userId: string): Promise<ScriptListItem[]>;
  createOwnedScript?(
    client: AppSupabaseClient,
    userId: string,
    input: CreateScriptInput
  ): Promise<ScriptListItem>;
}

const defaultDependencies: MobileScriptsRouteDependencies = {
  ...defaultMobileRouteAuthDependencies,
  listOwnedScripts: listScripts,
  createOwnedScript: createScript
};

const mobileCreateScriptPayloadSchema = z
  .object({
    title: z.string(),
    content: z.string(),
    targetSeconds: z.literal(60).optional(),
    locale: z.literal("en-US").optional()
  })
  .strict();

function mapScriptsFailure(origin: string, error: unknown) {
  if (error instanceof AppError && error.status === 403) {
    return mobileApiError(origin, 403, "account_deletion_in_progress");
  }

  return mapMobileServiceError(origin, error, {
    unavailable: "scripts_unavailable",
    conflict: "script_limit_reached"
  });
}

export async function handleMobileScriptsGet(
  request: NextRequest,
  dependencies: MobileScriptsRouteDependencies = defaultDependencies
) {
  const auth = await authenticateMobileRequest(request, dependencies);

  if (!auth.ok) {
    return auth.response;
  }

  const { origin, client, userId } = auth.context;

  try {
    const scripts = await timeAsync("mobile.scripts.list", () =>
      dependencies.listOwnedScripts(client, userId)
    );
    return mobileApiOk(origin, { scripts });
  } catch (error) {
    return mapScriptsFailure(origin, error);
  }
}

export async function handleMobileScriptsPost(
  request: NextRequest,
  dependencies: MobileScriptsRouteDependencies = defaultDependencies
) {
  const auth = await authenticateMobileRequest(request, dependencies);

  if (!auth.ok) {
    return auth.response;
  }

  const { origin, client, userId } = auth.context;
  const payload = await request.json().catch(() => null);
  const mobilePayload = mobileCreateScriptPayloadSchema.safeParse(payload);

  if (!mobilePayload.success) {
    return mobileApiError(origin, 400, "request_invalid");
  }

  const parsed = createScriptSchema.safeParse({
    ...mobilePayload.data,
    targetSeconds: mobilePayload.data.targetSeconds ?? 60,
    locale: mobilePayload.data.locale ?? "en-US"
  });

  if (!parsed.success) {
    return mobileApiError(origin, 400, "request_invalid");
  }

  try {
    const createOwnedScript = dependencies.createOwnedScript ?? createScript;
    const script = await timeAsync("mobile.scripts.create", () =>
      createOwnedScript(client, userId, parsed.data)
    );
    return mobileApiOk(origin, { script }, 201);
  } catch (error) {
    return mapScriptsFailure(origin, error);
  }
}

export function handleMobileScriptsOptions(request: NextRequest) {
  return handleMobileOptions(request, ["GET", "POST"]);
}

export const handleMobileScriptsUnsupportedMethod = handleMobileUnsupportedMethod;
