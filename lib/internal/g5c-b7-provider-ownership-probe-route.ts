import "server-only";

import { NextRequest } from "next/server";
import { getErrorStatus } from "@/lib/errors";
import { jsonError, jsonOk } from "@/lib/http";
import { requireCurrentUser } from "@/lib/supabase/auth";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import {
  probeStagingProviderOwnership,
  unavailableProbeResult,
  type StagingProviderOwnershipProbeResult
} from "@/services/voice-deletion/staging-provider-ownership-probe";

const CANONICAL_STAGING_PROJECT_DOMAIN = "native-minute-staging.vercel.app";
const CANONICAL_STAGING_SUPABASE_ORIGIN = "https://ztlliqishddrrvqqrrlu.supabase.co";
const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff"
};

type RouteClient = ReturnType<typeof createSupabaseRouteClient>;

export type G5cB7ProviderOwnershipProbeRouteDependencies = {
  isCanonicalStagingRuntime(): boolean;
  hasSupabaseConfig(): boolean;
  createClient(): RouteClient;
  requireCurrentUser(client: RouteClient): ReturnType<typeof requireCurrentUser>;
  probe(userId: string): Promise<StagingProviderOwnershipProbeResult>;
};

function normalizedOrigin(value: string | undefined) {
  return value?.trim().replace(/\/$/, "").toLowerCase() ?? "";
}

function normalizedDomain(value: string | undefined) {
  return value?.trim().replace(/\/$/, "").toLowerCase() ?? "";
}

/**
 * Only Vercel's server-provided deployment identity and the exact server-side
 * Supabase project are accepted. Request Host is intentionally not an authority.
 */
export function isCanonicalNativeMinuteStagingRuntime(env: NodeJS.ProcessEnv = process.env) {
  return (
    env.VERCEL === "1" &&
    env.VERCEL_ENV === "production" &&
    normalizedDomain(env.VERCEL_PROJECT_PRODUCTION_URL) === CANONICAL_STAGING_PROJECT_DOMAIN &&
    normalizedOrigin(env.NEXT_PUBLIC_SUPABASE_URL) === CANONICAL_STAGING_SUPABASE_ORIGIN
  );
}

const defaultDependencies: G5cB7ProviderOwnershipProbeRouteDependencies = {
  isCanonicalStagingRuntime: isCanonicalNativeMinuteStagingRuntime,
  hasSupabaseConfig,
  createClient: createSupabaseRouteClient,
  requireCurrentUser,
  probe: probeStagingProviderOwnership
};

function safeError(message: string, status: number) {
  return jsonError(message, status, undefined).clone();
}

function withNoStore<T extends Response>(response: T) {
  response.headers.set("Cache-Control", NO_STORE_HEADERS["Cache-Control"]);
  response.headers.set("X-Content-Type-Options", NO_STORE_HEADERS["X-Content-Type-Options"]);
  return response;
}

function unavailable() {
  return withNoStore(safeError("not found", 404));
}

export async function handleG5cB7ProviderOwnershipProbeGet(
  request: NextRequest,
  dependencies: G5cB7ProviderOwnershipProbeRouteDependencies = defaultDependencies
) {
  if (!dependencies.isCanonicalStagingRuntime() || !dependencies.hasSupabaseConfig()) {
    return unavailable();
  }

  if (request.nextUrl.search) {
    return withNoStore(safeError("invalid request", 400));
  }

  let userId: string;
  try {
    const user = await dependencies.requireCurrentUser(dependencies.createClient());
    userId = user.id;
  } catch (error) {
    return withNoStore(safeError("authentication required", getErrorStatus(error, 503)));
  }

  try {
    return jsonOk(
      { providerOwnershipProbe: await dependencies.probe(userId) },
      { headers: NO_STORE_HEADERS }
    );
  } catch {
    return jsonOk(
      { providerOwnershipProbe: unavailableProbeResult() satisfies StagingProviderOwnershipProbeResult },
      { headers: NO_STORE_HEADERS }
    );
  }
}
