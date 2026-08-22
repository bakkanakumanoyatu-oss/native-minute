import { z } from "zod";
import { NextRequest } from "next/server";
import { assertCostGuardEnabled } from "@/lib/cost-guard";
import { timeAsync } from "@/lib/performance/timing";
import type { AppSupabaseClient } from "@/lib/supabase/client";
import { uploadOwnedVoiceSample } from "@/services/storage";
import {
  createDefaultVoiceIfMissing,
  createVoiceConsent,
  getVoiceSetupState
} from "@/services/voice";
import { mobileApiError, mobileApiOk } from "./api-response";
import {
  authenticateMobileRequest,
  defaultMobileRouteAuthDependencies,
  handleMobileOptions,
  handleMobileUnsupportedMethod,
  type MobileRouteAuthDependencies
} from "./route-context";

const mobileVoiceConsentSchema = z.object({
  accepted: z.literal(true)
}).strict();

type MobileVoiceSetupSnapshot = {
  providerSupported: boolean;
  consent: { id: string } | null;
  voiceConsentCurrent: boolean;
  defaultVoice: { id: string } | null;
};

type MobileVoiceSetupStatus = "ready" | "consent_required" | "sample_required";

export interface MobileVoiceSetupRouteDependencies extends MobileRouteAuthDependencies {
  getVoiceSetupState(
    client: AppSupabaseClient,
    userId: string
  ): Promise<MobileVoiceSetupSnapshot>;
  createVoiceConsent(
    client: AppSupabaseClient,
    userId: string,
    input: { accepted: true }
  ): Promise<unknown>;
  assertUploadEnabled(): void;
  uploadOwnedVoiceSample(
    client: AppSupabaseClient,
    userId: string,
    input: { consentId: string; file: File }
  ): Promise<{
    audioPath: string;
    contentType: string;
    byteLength: number;
  }>;
  createDefaultVoiceIfMissing(
    client: AppSupabaseClient,
    userId: string,
    input: {
      consentId: string;
      label: string;
      sampleAudio: { audioPath: string; contentType: string; byteLength: number };
    }
  ): Promise<{ created: boolean }>;
}

const defaultDependencies: MobileVoiceSetupRouteDependencies = {
  ...defaultMobileRouteAuthDependencies,
  getVoiceSetupState,
  createVoiceConsent,
  assertUploadEnabled: () => assertCostGuardEnabled("storage_uploads"),
  uploadOwnedVoiceSample,
  createDefaultVoiceIfMissing
};

function getStatus(state: MobileVoiceSetupSnapshot): MobileVoiceSetupStatus {
  if (state.defaultVoice) {
    return "ready";
  }

  return state.consent && state.voiceConsentCurrent ? "sample_required" : "consent_required";
}

function toSafeResponse(state: MobileVoiceSetupSnapshot, created = false) {
  return {
    status: getStatus(state),
    created: created && Boolean(state.defaultVoice)
  };
}

function hasOnlyVoiceSampleField(formData: FormData) {
  const keys = Array.from(formData.keys());

  return keys.length === 1 && keys[0] === "file" && formData.getAll("file").length === 1;
}

async function loadSetupState(
  client: AppSupabaseClient,
  userId: string,
  dependencies: MobileVoiceSetupRouteDependencies
) {
  return timeAsync("mobile.voiceSetup.state", () => dependencies.getVoiceSetupState(client, userId));
}

function unavailable(origin: string) {
  return mobileApiError(origin, 503, "voice_setup_unavailable");
}

export async function handleMobileVoiceSetupGet(
  request: NextRequest,
  dependencies: MobileVoiceSetupRouteDependencies = defaultDependencies
) {
  const auth = await authenticateMobileRequest(request, dependencies);

  if (!auth.ok) {
    return auth.response;
  }

  const { origin, client, userId } = auth.context;

  try {
    const state = await loadSetupState(client, userId, dependencies);
    return state.providerSupported
      ? mobileApiOk(origin, toSafeResponse(state))
      : unavailable(origin);
  } catch {
    return unavailable(origin);
  }
}

async function handleConsentPost(
  request: NextRequest,
  context: { origin: string; client: AppSupabaseClient; userId: string },
  dependencies: MobileVoiceSetupRouteDependencies
) {
  const payload = await request.json().catch(() => null);
  const parsed = mobileVoiceConsentSchema.safeParse(payload);

  if (!parsed.success) {
    return mobileApiError(context.origin, 400, "request_invalid");
  }

  try {
    const current = await loadSetupState(context.client, context.userId, dependencies);

    if (!current.providerSupported) {
      return unavailable(context.origin);
    }

    if ((!current.consent || !current.voiceConsentCurrent) && !current.defaultVoice) {
      await timeAsync("mobile.voiceSetup.consent", () =>
        dependencies.createVoiceConsent(context.client, context.userId, parsed.data)
      );
    }

    const resolved = await loadSetupState(context.client, context.userId, dependencies);
    return resolved.providerSupported
      ? mobileApiOk(context.origin, toSafeResponse(resolved))
      : unavailable(context.origin);
  } catch {
    return unavailable(context.origin);
  }
}

async function handleSamplePost(
  request: NextRequest,
  context: { origin: string; client: AppSupabaseClient; userId: string },
  dependencies: MobileVoiceSetupRouteDependencies
) {
  const formData = await request.formData().catch(() => null);

  if (!formData || !hasOnlyVoiceSampleField(formData)) {
    return mobileApiError(context.origin, 400, "voice_sample_invalid");
  }

  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return mobileApiError(context.origin, 400, "voice_sample_invalid");
  }

  try {
    const current = await loadSetupState(context.client, context.userId, dependencies);

    if (!current.providerSupported) {
      return unavailable(context.origin);
    }

    // A retry after a lost client response must observe the persisted default
    // voice before reading or uploading another sample.
    if (current.defaultVoice) {
      return mobileApiOk(context.origin, toSafeResponse(current));
    }

    if (!current.consent || !current.voiceConsentCurrent) {
      return mobileApiError(context.origin, 409, "voice_setup_required");
    }

    dependencies.assertUploadEnabled();
    const sample = await timeAsync("mobile.voiceSetup.sampleUpload", () =>
      dependencies.uploadOwnedVoiceSample(context.client, context.userId, {
        consentId: current.consent!.id,
        file
      })
    );
    const result = await timeAsync("mobile.voiceSetup.createVoice", () =>
      dependencies.createDefaultVoiceIfMissing(context.client, context.userId, {
        consentId: current.consent!.id,
        label: "My voice",
        sampleAudio: sample
      })
    );
    const resolved = await loadSetupState(context.client, context.userId, dependencies);

    return resolved.providerSupported && resolved.defaultVoice
      ? mobileApiOk(context.origin, toSafeResponse(resolved, result.created))
      : unavailable(context.origin);
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error
      ? (error as { status?: unknown }).status
      : undefined;

    if (status === 400 || status === 422) {
      return mobileApiError(context.origin, 400, "voice_sample_invalid");
    }

    if (status === 409) {
      return mobileApiError(context.origin, 409, "voice_setup_required");
    }

    return unavailable(context.origin);
  }
}

export async function handleMobileVoiceSetupPost(
  request: NextRequest,
  dependencies: MobileVoiceSetupRouteDependencies = defaultDependencies
) {
  const auth = await authenticateMobileRequest(request, dependencies);

  if (!auth.ok) {
    return auth.response;
  }

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.startsWith("application/json")) {
    return handleConsentPost(request, auth.context, dependencies);
  }

  if (contentType.startsWith("multipart/form-data;")) {
    return handleSamplePost(request, auth.context, dependencies);
  }

  return mobileApiError(auth.context.origin, 400, "request_invalid");
}

export function handleMobileVoiceSetupOptions(request: NextRequest) {
  return handleMobileOptions(request, ["GET", "POST"]);
}

export const handleMobileVoiceSetupUnsupportedMethod = handleMobileUnsupportedMethod;
