import { z } from "zod";
import { NextRequest } from "next/server";
import type { AppSupabaseClient } from "@/lib/supabase/client";
import { processingConsentTypeSchema } from "@/schemas/consent";
import {
  acceptCurrentProcessingConsent,
  getProcessingConsentStatus,
  withdrawCurrentProcessingConsent,
  type ProcessingConsentStatus,
  type ProcessingConsentType
} from "@/services/consent";
import { mobileApiError, mobileApiOk } from "./api-response";
import {
  authenticateMobileRequest,
  defaultMobileRouteAuthDependencies,
  handleMobileOptions,
  handleMobileUnsupportedMethod,
  type MobileRouteAuthDependencies
} from "./route-context";

const acceptedSchema = z.object({ accepted: z.literal(true) }).strict();

type MobileConsentSnapshot = { type: ProcessingConsentType; status: ProcessingConsentStatus };

export interface MobileConsentsRouteDependencies extends MobileRouteAuthDependencies {
  getProcessingConsentStatus(
    client: AppSupabaseClient,
    userId: string,
    type: ProcessingConsentType
  ): Promise<MobileConsentSnapshot>;
  acceptCurrentProcessingConsent(
    client: AppSupabaseClient,
    userId: string,
    type: ProcessingConsentType
  ): Promise<unknown>;
  withdrawCurrentProcessingConsent(
    client: AppSupabaseClient,
    userId: string,
    type: ProcessingConsentType
  ): Promise<MobileConsentSnapshot>;
}

const defaultDependencies: MobileConsentsRouteDependencies = {
  ...defaultMobileRouteAuthDependencies,
  getProcessingConsentStatus,
  acceptCurrentProcessingConsent,
  withdrawCurrentProcessingConsent
};

function parseConsentType(value: string) {
  return processingConsentTypeSchema.safeParse(value);
}

function toSafeConsent(snapshot: MobileConsentSnapshot) {
  return { status: snapshot.status };
}

export async function handleMobileConsentGet(
  request: NextRequest,
  consentType: string,
  dependencies: MobileConsentsRouteDependencies = defaultDependencies
) {
  const parsedType = parseConsentType(consentType);

  if (!parsedType.success) {
    return mobileApiError(request.headers.get("origin") ?? "", 400, "request_invalid");
  }

  const auth = await authenticateMobileRequest(request, dependencies);

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const consent = await dependencies.getProcessingConsentStatus(auth.context.client, auth.context.userId, parsedType.data);
    return mobileApiOk(auth.context.origin, { consent: toSafeConsent(consent) });
  } catch {
    return mobileApiError(auth.context.origin, 503, "consent_unavailable");
  }
}

export async function handleMobileConsentPost(
  request: NextRequest,
  consentType: string,
  dependencies: MobileConsentsRouteDependencies = defaultDependencies
) {
  const parsedType = parseConsentType(consentType);
  const payload = await request.json().catch(() => null);

  if (!parsedType.success || !acceptedSchema.safeParse(payload).success) {
    return mobileApiError(request.headers.get("origin") ?? "", 400, "request_invalid");
  }

  const auth = await authenticateMobileRequest(request, dependencies);

  if (!auth.ok) {
    return auth.response;
  }

  try {
    await dependencies.acceptCurrentProcessingConsent(auth.context.client, auth.context.userId, parsedType.data);
    const consent = await dependencies.getProcessingConsentStatus(auth.context.client, auth.context.userId, parsedType.data);
    return mobileApiOk(auth.context.origin, { consent: toSafeConsent(consent) });
  } catch {
    return mobileApiError(auth.context.origin, 503, "consent_unavailable");
  }
}

export async function handleMobileConsentDelete(
  request: NextRequest,
  consentType: string,
  dependencies: MobileConsentsRouteDependencies = defaultDependencies
) {
  const parsedType = parseConsentType(consentType);

  if (!parsedType.success) {
    return mobileApiError(request.headers.get("origin") ?? "", 400, "request_invalid");
  }

  const auth = await authenticateMobileRequest(request, dependencies);

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const consent = await dependencies.withdrawCurrentProcessingConsent(auth.context.client, auth.context.userId, parsedType.data);
    return mobileApiOk(auth.context.origin, { consent: toSafeConsent(consent) });
  } catch {
    return mobileApiError(auth.context.origin, 503, "consent_unavailable");
  }
}

export function handleMobileConsentOptions(request: NextRequest) {
  return handleMobileOptions(request, ["GET", "POST", "DELETE"]);
}

export const handleMobileConsentUnsupportedMethod = handleMobileUnsupportedMethod;
