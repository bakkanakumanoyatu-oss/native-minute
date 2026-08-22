import { NextRequest } from "next/server";
import type { AccountDeletionRequestStatus } from "@/types/database";
import {
  createAccountDeletionRequest,
  getAccountDeletionStatus,
  type AccountDeletionRequestResult,
  type AccountDeletionRequestView
} from "@/services/account-deletion";
import { createAccountDeletionRequestSchema } from "@/schemas/account-deletion";
import { mobileApiError, mobileApiOk } from "./api-response";
import {
  authenticateMobileRequest,
  defaultMobileRouteAuthDependencies,
  handleMobileOptions,
  handleMobileUnsupportedMethod,
  type MobileRouteAuthDependencies
} from "./route-context";

type SafeMobileAccountDeletion = {
  requestState: AccountDeletionRequestStatus | "not_requested";
  nextAction: "start_request" | "wait_for_review" | "contact_support" | "none";
  created?: boolean;
};

export interface MobileAccountDeletionRouteDependencies extends MobileRouteAuthDependencies {
  getAccountDeletionStatus(
    client: Parameters<typeof getAccountDeletionStatus>[0],
    userId: string
  ): Promise<AccountDeletionRequestView | null>;
  createAccountDeletionRequest(userId: string): Promise<AccountDeletionRequestResult>;
}

const defaultDependencies: MobileAccountDeletionRouteDependencies = {
  ...defaultMobileRouteAuthDependencies,
  getAccountDeletionStatus,
  createAccountDeletionRequest
};

function nextAction(status: AccountDeletionRequestStatus): SafeMobileAccountDeletion["nextAction"] {
  if (status === "requested" || status === "confirmed" || status === "processing") {
    return "wait_for_review";
  }

  if (status.endsWith("_failed")) {
    return "contact_support";
  }

  return "none";
}

function toSafeDeletion(
  deletionRequest: AccountDeletionRequestView | null,
  created?: boolean
): SafeMobileAccountDeletion {
  if (!deletionRequest) {
    return { requestState: "not_requested", nextAction: "start_request" };
  }

  return {
    requestState: deletionRequest.status,
    nextAction: nextAction(deletionRequest.status),
    ...(created === undefined ? {} : { created })
  };
}

export async function handleMobileAccountDeletionStatusGet(
  request: NextRequest,
  dependencies: MobileAccountDeletionRouteDependencies = defaultDependencies
) {
  const auth = await authenticateMobileRequest(request, dependencies);

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const deletionRequest = await dependencies.getAccountDeletionStatus(auth.context.client, auth.context.userId);
    return mobileApiOk(auth.context.origin, { deletion: toSafeDeletion(deletionRequest) });
  } catch {
    return mobileApiError(auth.context.origin, 503, "account_deletion_unavailable");
  }
}

export async function handleMobileAccountDeletionRequestPost(
  request: NextRequest,
  dependencies: MobileAccountDeletionRouteDependencies = defaultDependencies
) {
  const payload = await request.json().catch(() => ({}));

  if (!createAccountDeletionRequestSchema.safeParse(payload).success) {
    return mobileApiError(request.headers.get("origin") ?? "", 400, "request_invalid");
  }

  const auth = await authenticateMobileRequest(request, dependencies);

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const result = await dependencies.createAccountDeletionRequest(auth.context.userId);
    return mobileApiOk(auth.context.origin, {
      deletion: toSafeDeletion(result.deletionRequest, result.created === true)
    }, result.created ? 201 : 200);
  } catch {
    return mobileApiError(auth.context.origin, 503, "account_deletion_unavailable");
  }
}

export function handleMobileAccountDeletionStatusOptions(request: NextRequest) {
  return handleMobileOptions(request, ["GET"]);
}

export function handleMobileAccountDeletionRequestOptions(request: NextRequest) {
  return handleMobileOptions(request, ["POST"]);
}

export const handleMobileAccountDeletionUnsupportedMethod = handleMobileUnsupportedMethod;
