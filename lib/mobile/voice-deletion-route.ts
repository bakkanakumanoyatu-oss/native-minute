import { NextRequest } from "next/server";
import { voiceDeletionAdvanceSchema, voiceDeletionRequestSchema } from "@/schemas/voice-deletion";
import {
  advanceVoiceDeletion,
  getVoiceDeletionStatus,
  requestVoiceDeletion,
  type SafeVoiceDeletionClientState
} from "@/services/voice-deletion";
import { mobileApiError, mobileApiOk } from "./api-response";
import {
  authenticateMobileRequest,
  defaultMobileRouteAuthDependencies,
  handleMobileOptions,
  handleMobileUnsupportedMethod,
  type MobileRouteAuthDependencies
} from "./route-context";

type VoiceDeletionCall = (input: {
  client: Parameters<typeof getVoiceDeletionStatus>[0]["client"];
  userId: string;
}) => Promise<SafeVoiceDeletionClientState>;

export interface MobileVoiceDeletionRouteDependencies extends MobileRouteAuthDependencies {
  getStatus: VoiceDeletionCall;
  requestDeletion: VoiceDeletionCall;
  advanceDeletion: VoiceDeletionCall;
}

const defaultDependencies: MobileVoiceDeletionRouteDependencies = {
  ...defaultMobileRouteAuthDependencies,
  getStatus: getVoiceDeletionStatus,
  requestDeletion: requestVoiceDeletion,
  advanceDeletion: advanceVoiceDeletion
};

async function authenticateAndRun(
  request: NextRequest,
  dependencies: MobileVoiceDeletionRouteDependencies,
  action: VoiceDeletionCall
) {
  const auth = await authenticateMobileRequest(request, dependencies);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const deletion = await action({ client: auth.context.client, userId: auth.context.userId });
    return mobileApiOk(auth.context.origin, { deletion });
  } catch {
    return mobileApiError(auth.context.origin, 503, "voice_deletion_unavailable");
  }
}

export function handleMobileVoiceDeletionStatusGet(
  request: NextRequest,
  dependencies: MobileVoiceDeletionRouteDependencies = defaultDependencies
) {
  return authenticateAndRun(request, dependencies, dependencies.getStatus);
}

async function handlePost(
  request: NextRequest,
  schema: typeof voiceDeletionRequestSchema,
  dependencies: MobileVoiceDeletionRouteDependencies,
  action: VoiceDeletionCall
) {
  const auth = await authenticateMobileRequest(request, dependencies);
  if (!auth.ok) {
    return auth.response;
  }

  const payload = await request.json().catch(() => null);
  if (!schema.safeParse(payload).success) {
    return mobileApiError(auth.context.origin, 400, "request_invalid");
  }

  try {
    const deletion = await action({ client: auth.context.client, userId: auth.context.userId });
    return mobileApiOk(auth.context.origin, { deletion });
  } catch {
    return mobileApiError(auth.context.origin, 503, "voice_deletion_unavailable");
  }
}

export function handleMobileVoiceDeletionRequestPost(
  request: NextRequest,
  dependencies: MobileVoiceDeletionRouteDependencies = defaultDependencies
) {
  return handlePost(request, voiceDeletionRequestSchema, dependencies, dependencies.requestDeletion);
}

export function handleMobileVoiceDeletionAdvancePost(
  request: NextRequest,
  dependencies: MobileVoiceDeletionRouteDependencies = defaultDependencies
) {
  return handlePost(request, voiceDeletionAdvanceSchema, dependencies, dependencies.advanceDeletion);
}

export function handleMobileVoiceDeletionStatusOptions(request: NextRequest) {
  return handleMobileOptions(request, ["GET"]);
}

export function handleMobileVoiceDeletionPostOptions(request: NextRequest) {
  return handleMobileOptions(request, ["POST"]);
}

export const handleMobileVoiceDeletionUnsupportedMethod = handleMobileUnsupportedMethod;
