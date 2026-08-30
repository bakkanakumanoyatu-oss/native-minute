import "server-only";

import { NextRequest } from "next/server";
import { getErrorStatus } from "@/lib/errors";
import { jsonError, jsonOk } from "@/lib/http";
import { requireCurrentUser } from "@/lib/supabase/auth";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { isCanonicalNativeMinuteStagingRuntime } from "./g5c-b7-provider-ownership-probe-route";
import {
  diagnoseStagingManualProviderIncident,
  toSafeManualProviderRecoveryResult,
  unavailableManualProviderRecoveryResult,
  type StagingManualProviderRecoveryResult
} from "@/services/voice-deletion/staging-manual-provider-recovery";
import {
  G5C_B7_MANUAL_PROVIDER_ABSENCE_CONFIRMATION,
  acceptStagingManualProviderAbsence,
  type ManualProviderAbsenceAcceptanceResult
} from "@/services/voice-deletion/staging-manual-provider-absence-acceptance";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff"
};

type RouteClient = ReturnType<typeof createSupabaseRouteClient>;

export type G5cB7ManualProviderRecoveryRouteDependencies = {
  isCanonicalStagingRuntime(): boolean;
  hasSupabaseConfig(): boolean;
  createClient(): RouteClient;
  requireCurrentUser(client: RouteClient): ReturnType<typeof requireCurrentUser>;
  diagnose(userId: string): Promise<StagingManualProviderRecoveryResult>;
  accept(userId: string): Promise<ManualProviderAbsenceAcceptanceResult>;
};

const defaultDependencies: G5cB7ManualProviderRecoveryRouteDependencies = {
  isCanonicalStagingRuntime: isCanonicalNativeMinuteStagingRuntime,
  hasSupabaseConfig,
  createClient: createSupabaseRouteClient,
  requireCurrentUser,
  diagnose: diagnoseStagingManualProviderIncident,
  accept: acceptStagingManualProviderAbsence
};

function withNoStore<T extends Response>(response: T) {
  response.headers.set("Cache-Control", NO_STORE_HEADERS["Cache-Control"]);
  response.headers.set("X-Content-Type-Options", NO_STORE_HEADERS["X-Content-Type-Options"]);
  return response;
}

function safeError(message: string, status: number) {
  return withNoStore(jsonError(message, status, undefined).clone());
}

function unavailable() {
  return safeError("not found", 404);
}

function hasExactManualAcceptanceConfirmation(value: unknown) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    "confirmation" in value &&
    value.confirmation === G5C_B7_MANUAL_PROVIDER_ABSENCE_CONFIRMATION
  );
}

/**
 * Internal incident evidence only: this does not invoke the normal advance path
 * or any durable target, consent, Storage, or database mutation.
 */
export async function handleG5cB7ManualProviderRecoveryGet(
  request: NextRequest,
  dependencies: G5cB7ManualProviderRecoveryRouteDependencies = defaultDependencies
) {
  if (!dependencies.isCanonicalStagingRuntime() || !dependencies.hasSupabaseConfig()) {
    return unavailable();
  }

  if (request.nextUrl.search) {
    return safeError("invalid request", 400);
  }

  let userId: string;
  try {
    userId = (await dependencies.requireCurrentUser(dependencies.createClient())).id;
  } catch (error) {
    return safeError("authentication required", getErrorStatus(error, 503));
  }

  try {
    return jsonOk(
      { manualProviderRecovery: toSafeManualProviderRecoveryResult(await dependencies.diagnose(userId)) },
      { headers: NO_STORE_HEADERS }
    );
  } catch {
    return jsonOk(
      { manualProviderRecovery: unavailableManualProviderRecoveryResult() },
      { headers: NO_STORE_HEADERS }
    );
  }
}

/**
 * This acceptance endpoint neither rechecks the provider nor invokes normal
 * advancement. Its dedicated service can only claim a lease and call the
 * dedicated durable RPC with server-derived state.
 */
export async function handleG5cB7ManualProviderAbsenceAcceptancePost(
  request: NextRequest,
  dependencies: G5cB7ManualProviderRecoveryRouteDependencies = defaultDependencies
) {
  if (!dependencies.isCanonicalStagingRuntime() || !dependencies.hasSupabaseConfig()) {
    return unavailable();
  }

  if (request.nextUrl.search) {
    return safeError("invalid request", 400);
  }

  const payload = await request.json().catch(() => null);
  if (!hasExactManualAcceptanceConfirmation(payload)) {
    return safeError("invalid request", 400);
  }

  let userId: string;
  try {
    userId = (await dependencies.requireCurrentUser(dependencies.createClient())).id;
  } catch (error) {
    return safeError("authentication required", getErrorStatus(error, 503));
  }

  try {
    return jsonOk(
      { manualProviderAbsenceAcceptance: await dependencies.accept(userId) },
      { headers: NO_STORE_HEADERS }
    );
  } catch {
    return safeError("manual provider recovery unavailable", 503);
  }
}
