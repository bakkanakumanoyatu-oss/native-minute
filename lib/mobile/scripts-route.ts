import type { User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import type { AppSupabaseClient } from "@/lib/supabase/client";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import {
  createSupabaseMobileRouteClient,
  parseMobileBearerAuthorization
} from "@/lib/supabase/mobile-route";
import { listScripts } from "@/services/scripts/scripts.service";
import type { ScriptListItem } from "@/services/scripts/types";
import { buildMobileApiHeaders, isAllowedMobileApiOrigin, parseMobilePreflightHeaders } from "./api-cors";
import { mobileApiError, mobileApiOk } from "./api-response";

interface MobileAuthValidationResult {
  data: { user: Pick<User, "id"> | null };
  error: unknown;
}

export interface MobileScriptsRouteDependencies {
  hasConfig(): boolean;
  createClient(accessToken: string): AppSupabaseClient;
  validateUser(client: AppSupabaseClient, accessToken: string): Promise<MobileAuthValidationResult>;
  listOwnedScripts(client: AppSupabaseClient, userId: string): Promise<ScriptListItem[]>;
}

const defaultDependencies: MobileScriptsRouteDependencies = {
  hasConfig: hasSupabaseConfig,
  createClient: createSupabaseMobileRouteClient,
  validateUser: (client, accessToken) => client.auth.getUser(accessToken),
  listOwnedScripts: listScripts
};

type ErrorShape = {
  code?: unknown;
  status?: unknown;
};

function readSafeErrorShape(error: unknown): ErrorShape {
  return typeof error === "object" && error !== null ? (error as ErrorShape) : {};
}

function mapAuthFailure(origin: string, error: unknown) {
  const { code, status } = readSafeErrorShape(error);

  if (status === 429) {
    return mobileApiError(origin, 429, "rate_limited");
  }

  if (status === 0 || (typeof status === "number" && status >= 500) || code === "request_timeout") {
    return mobileApiError(origin, 503, "auth_unavailable");
  }

  if (code === "session_expired" || code === "jwt_expired") {
    return mobileApiError(origin, 401, "session_expired");
  }

  return mobileApiError(origin, 401, "session_invalid");
}

function mapScriptsFailure(origin: string, error: unknown) {
  if (error instanceof AppError && error.status === 403) {
    return mobileApiError(origin, 403, "account_deletion_in_progress");
  }

  if (error instanceof AppError && error.status === 429) {
    return mobileApiError(origin, 429, "rate_limited");
  }

  return mobileApiError(origin, 500, "scripts_unavailable");
}

export async function handleMobileScriptsGet(
  request: NextRequest,
  dependencies: MobileScriptsRouteDependencies = defaultDependencies
) {
  const origin = request.headers.get("origin");

  if (!isAllowedMobileApiOrigin(origin)) {
    return mobileApiError(origin, 403, "origin_forbidden");
  }

  const bearer = parseMobileBearerAuthorization(request.headers.get("authorization"));

  if (!bearer.ok) {
    return mobileApiError(
      origin,
      401,
      bearer.reason === "missing" ? "auth_required" : "session_invalid"
    );
  }

  if (!dependencies.hasConfig()) {
    return mobileApiError(origin, 503, "auth_unavailable");
  }

  let client: AppSupabaseClient;

  try {
    client = dependencies.createClient(bearer.accessToken);
  } catch {
    return mobileApiError(origin, 503, "auth_unavailable");
  }

  let validation: MobileAuthValidationResult;

  try {
    validation = await dependencies.validateUser(client, bearer.accessToken);
  } catch {
    return mobileApiError(origin, 503, "auth_unavailable");
  }

  if (validation.error || !validation.data.user?.id) {
    return mapAuthFailure(origin, validation.error);
  }

  try {
    const scripts = await dependencies.listOwnedScripts(client, validation.data.user.id);
    return mobileApiOk(origin, { scripts });
  } catch (error) {
    return mapScriptsFailure(origin, error);
  }
}

export function handleMobileScriptsOptions(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (!isAllowedMobileApiOrigin(origin)) {
    return mobileApiError(origin, 403, "origin_forbidden", { preflight: true });
  }

  if (request.headers.get("access-control-request-method")?.toUpperCase() !== "GET") {
    return mobileApiError(origin, 405, "method_not_allowed", { preflight: true });
  }

  const requestedHeaders = parseMobilePreflightHeaders(
    request.headers.get("access-control-request-headers")
  );

  if (!requestedHeaders.allowed || !requestedHeaders.includesAuthorization) {
    return mobileApiError(origin, 400, "request_invalid", { preflight: true });
  }

  return new NextResponse(null, {
    status: 204,
    headers: buildMobileApiHeaders(origin, { preflight: true })
  });
}

export function handleMobileScriptsUnsupportedMethod(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (!isAllowedMobileApiOrigin(origin)) {
    return mobileApiError(origin, 403, "origin_forbidden");
  }

  return mobileApiError(origin, 405, "method_not_allowed");
}
