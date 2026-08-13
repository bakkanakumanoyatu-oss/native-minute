import type { User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { timeAsync } from "@/lib/performance/timing";
import type { AppSupabaseClient } from "@/lib/supabase/client";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import {
  createSupabaseMobileRouteClient,
  parseMobileBearerAuthorization
} from "@/lib/supabase/mobile-route";
import { buildMobileApiHeaders, isAllowedMobileApiOrigin, parseMobilePreflightHeaders } from "./api-cors";
import { mobileApiError } from "./api-response";
import type { MobileApiReasonCode } from "./contracts";

export interface MobileAuthValidationResult {
  data: { user: Pick<User, "id"> | null };
  error: unknown;
}

export interface MobileRouteAuthDependencies {
  hasConfig(): boolean;
  createClient(accessToken: string): AppSupabaseClient;
  validateUser(
    client: AppSupabaseClient,
    accessToken: string
  ): Promise<MobileAuthValidationResult>;
}

export const defaultMobileRouteAuthDependencies: MobileRouteAuthDependencies = {
  hasConfig: hasSupabaseConfig,
  createClient: createSupabaseMobileRouteClient,
  validateUser: (client, accessToken) => client.auth.getUser(accessToken)
};

export type MobileRouteContext = {
  origin: string;
  client: AppSupabaseClient;
  userId: string;
};

type MobileRouteContextResult =
  | { ok: true; context: MobileRouteContext }
  | { ok: false; response: NextResponse };

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

export async function authenticateMobileRequest(
  request: NextRequest,
  dependencies: MobileRouteAuthDependencies = defaultMobileRouteAuthDependencies
): Promise<MobileRouteContextResult> {
  const origin = request.headers.get("origin");

  if (!isAllowedMobileApiOrigin(origin)) {
    return { ok: false, response: mobileApiError(origin, 403, "origin_forbidden") };
  }

  const bearer = parseMobileBearerAuthorization(request.headers.get("authorization"));

  if (!bearer.ok) {
    return {
      ok: false,
      response: mobileApiError(
        origin,
        401,
        bearer.reason === "missing" ? "auth_required" : "session_invalid"
      )
    };
  }

  if (!dependencies.hasConfig()) {
    return { ok: false, response: mobileApiError(origin, 503, "auth_unavailable") };
  }

  let client: AppSupabaseClient;

  try {
    client = dependencies.createClient(bearer.accessToken);
  } catch {
    return { ok: false, response: mobileApiError(origin, 503, "auth_unavailable") };
  }

  try {
    const validation = await timeAsync("mobile.route.auth", () =>
      dependencies.validateUser(client, bearer.accessToken)
    );

    if (validation.error || !validation.data.user?.id) {
      return { ok: false, response: mapAuthFailure(origin, validation.error) };
    }

    return {
      ok: true,
      context: { origin, client, userId: validation.data.user.id }
    };
  } catch {
    return { ok: false, response: mobileApiError(origin, 503, "auth_unavailable") };
  }
}

export function handleMobileOptions(request: NextRequest, allowedMethods: readonly string[]) {
  const origin = request.headers.get("origin");

  if (!isAllowedMobileApiOrigin(origin)) {
    return mobileApiError(origin, 403, "origin_forbidden", {
      preflight: true,
      allowedMethods
    });
  }

  const requestedMethod = request.headers.get("access-control-request-method")?.toUpperCase();

  if (!requestedMethod || !allowedMethods.includes(requestedMethod)) {
    return mobileApiError(origin, 405, "method_not_allowed", {
      preflight: true,
      allowedMethods
    });
  }

  const requestedHeaders = parseMobilePreflightHeaders(
    request.headers.get("access-control-request-headers")
  );

  if (!requestedHeaders.allowed || !requestedHeaders.includesAuthorization) {
    return mobileApiError(origin, 400, "request_invalid", {
      preflight: true,
      allowedMethods
    });
  }

  return new NextResponse(null, {
    status: 204,
    headers: buildMobileApiHeaders(origin, {
      preflight: true,
      allowedMethods: [requestedMethod]
    })
  });
}

export function handleMobileUnsupportedMethod(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (!isAllowedMobileApiOrigin(origin)) {
    return mobileApiError(origin, 403, "origin_forbidden");
  }

  return mobileApiError(origin, 405, "method_not_allowed");
}

export function mapMobileServiceError(
  origin: string,
  error: unknown,
  codes: {
    unavailable: MobileApiReasonCode;
    notFound?: MobileApiReasonCode;
    conflict?: MobileApiReasonCode;
    invalid?: MobileApiReasonCode;
  }
) {
  const status = error instanceof AppError ? error.status : 500;

  if (status === 400 || status === 422) {
    return mobileApiError(origin, 400, codes.invalid ?? "request_invalid");
  }

  if (status === 401) {
    return mobileApiError(origin, 401, "session_invalid");
  }

  if (status === 403 || status === 404) {
    return mobileApiError(origin, 404, codes.notFound ?? "request_invalid");
  }

  if (status === 409) {
    return mobileApiError(origin, 409, codes.conflict ?? "request_invalid");
  }

  if (status === 429) {
    return mobileApiError(origin, 429, "rate_limited");
  }

  if (status === 502 || status === 503 || status === 504) {
    return mobileApiError(origin, 503, codes.unavailable);
  }

  return mobileApiError(origin, 500, codes.unavailable);
}
