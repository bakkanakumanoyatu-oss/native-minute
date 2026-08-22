import { z } from "zod";
import { NextRequest } from "next/server";
import { assertCostGuardEnabled } from "@/lib/cost-guard";
import { timeAsync } from "@/lib/performance/timing";
import { parseMobilePcmWav } from "@/lib/pcm-wav";
import type { AppSupabaseClient } from "@/lib/supabase/client";
import { assertCurrentProcessingConsent } from "@/services/consent";
import { MAX_RECORDING_BYTES } from "@/services/storage/constants";
import {
  uploadOwnedRecording,
  type UploadedRecording
} from "@/services/storage/recording-storage.service";
import { mobileApiError, mobileApiOk } from "./api-response";
import {
  authenticateMobileRequest,
  defaultMobileRouteAuthDependencies,
  handleMobileOptions,
  handleMobileUnsupportedMethod,
  mapMobileServiceError,
  type MobileRouteAuthDependencies
} from "./route-context";

const recordingFormSchema = z.object({
  scriptId: z.string().uuid(),
  recordingRef: z.string().uuid(),
  durationSeconds: z.coerce.number().int().positive().max(120).optional()
});

const MOBILE_DURATION_TOLERANCE_SECONDS = 2;
export { parseMobilePcmWav } from "@/lib/pcm-wav";

export interface MobileRecordingsRouteDependencies extends MobileRouteAuthDependencies {
  assertPronunciationConsent(client: AppSupabaseClient, userId: string): Promise<unknown>;
  assertUploadEnabled(): void;
  uploadOwnedRecording(
    client: AppSupabaseClient,
    userId: string,
    input: {
      scriptId: string;
      recordingId: string;
      file: File;
      durationSeconds?: number;
    }
  ): Promise<UploadedRecording>;
}

const defaultDependencies: MobileRecordingsRouteDependencies = {
  ...defaultMobileRouteAuthDependencies,
  assertPronunciationConsent: (client, userId) =>
    assertCurrentProcessingConsent(client, userId, "pronunciation_processing"),
  assertUploadEnabled: () => assertCostGuardEnabled("storage_uploads"),
  uploadOwnedRecording
};

export function parseOwnedMobileRecordingId(
  audioStorageKey: string,
  userId: string,
  scriptId: string
) {
  const prefix = `${userId}/${scriptId}/`;

  if (!audioStorageKey.startsWith(prefix)) {
    return null;
  }

  const filename = audioStorageKey.slice(prefix.length);
  const suffix = ".wav";

  if (!filename.endsWith(suffix)) {
    return null;
  }

  const recordingId = filename.slice(0, -suffix.length);
  return z.string().uuid().safeParse(recordingId).success ? recordingId : null;
}

function hasOnlyRecordingFields(formData: FormData) {
  const allowed = new Set(["file", "scriptId", "recordingRef", "durationSeconds"]);
  const keys = Array.from(formData.keys());

  return (
    keys.every((key) => allowed.has(key)) &&
    formData.getAll("file").length === 1 &&
    formData.getAll("scriptId").length === 1 &&
    formData.getAll("recordingRef").length === 1 &&
    formData.getAll("durationSeconds").length <= 1
  );
}

export async function handleMobileRecordingsPost(
  request: NextRequest,
  dependencies: MobileRecordingsRouteDependencies = defaultDependencies
) {
  const auth = await authenticateMobileRequest(request, dependencies);

  if (!auth.ok) {
    return auth.response;
  }

  const { origin, client, userId } = auth.context;
  const requestContentType = request.headers.get("content-type")?.toLowerCase() ?? "";

  if (!requestContentType.startsWith("multipart/form-data;")) {
    return mobileApiError(origin, 415, "recording_format_unsupported");
  }

  const formData = await request.formData().catch(() => null);

  if (!formData || !hasOnlyRecordingFields(formData)) {
    return mobileApiError(origin, 400, "recording_invalid");
  }

  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return mobileApiError(origin, 400, "recording_invalid");
  }

  if (file.size > MAX_RECORDING_BYTES) {
    return mobileApiError(origin, 413, "recording_too_large");
  }

  if (file.type.trim().toLowerCase() !== "audio/wav") {
    return mobileApiError(origin, 415, "recording_format_unsupported");
  }

  const recordingBytes = new Uint8Array(await file.arrayBuffer().catch(() => new ArrayBuffer(0)));
  const pcmMetadata = parseMobilePcmWav(recordingBytes);

  if (!pcmMetadata) {
    return mobileApiError(origin, 415, "recording_format_unsupported");
  }

  const parsed = recordingFormSchema.safeParse({
    scriptId: formData.get("scriptId"),
    recordingRef: formData.get("recordingRef"),
    durationSeconds: formData.get("durationSeconds") ?? undefined
  });

  if (!parsed.success) {
    return mobileApiError(origin, 400, "recording_invalid");
  }

  if (
    parsed.data.durationSeconds !== undefined &&
    Math.abs(parsed.data.durationSeconds - pcmMetadata.durationSeconds) >
      MOBILE_DURATION_TOLERANCE_SECONDS
  ) {
    return mobileApiError(origin, 400, "recording_invalid");
  }

  try {
    await timeAsync("mobile.recording.consent", () =>
      dependencies.assertPronunciationConsent(client, userId)
    );
    dependencies.assertUploadEnabled();
    const uploaded = await timeAsync("mobile.recording.upload", () =>
      dependencies.uploadOwnedRecording(client, userId, {
        scriptId: parsed.data.scriptId,
        recordingId: parsed.data.recordingRef,
        file,
        durationSeconds: pcmMetadata.durationSeconds
      })
    );
    const recordingRef = parseOwnedMobileRecordingId(
      uploaded.audioStorageKey,
      userId,
      parsed.data.scriptId
    );

    if (!recordingRef) {
      return mobileApiError(origin, 500, "recording_unavailable");
    }


    if (recordingRef !== parsed.data.recordingRef) {
      return mobileApiError(origin, 500, "recording_unavailable");
    }

    return mobileApiOk(
      origin,
      {
        recordingRef,
        durationSeconds: uploaded.durationSeconds,
        contentType: uploaded.contentType
      },
      201
    );
  } catch (error) {
    return mapMobileServiceError(origin, error, {
      unavailable: "recording_unavailable",
      notFound: "script_not_found",
      invalid: "recording_invalid",
      conflict: "pronunciation_consent_required"
    });
  }
}

export function handleMobileRecordingsOptions(request: NextRequest) {
  return handleMobileOptions(request, ["POST"]);
}

export const handleMobileRecordingsUnsupportedMethod = handleMobileUnsupportedMethod;
