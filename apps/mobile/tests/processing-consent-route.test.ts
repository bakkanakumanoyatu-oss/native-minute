import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../../lib/errors";
import {
  handleMobileConsentDelete,
  handleMobileConsentGet,
  handleMobileConsentPost,
  type MobileConsentsRouteDependencies
} from "../../../lib/mobile/consents-route";
import { handleMobileEvaluatePost } from "../../../lib/mobile/evaluate-route";
import { handleMobileRecordingsPost } from "../../../lib/mobile/recordings-route";
import { handleMobileVoiceSetupPost } from "../../../lib/mobile/voice-setup-route";
import type { AppSupabaseClient } from "../../../lib/supabase/client";
import { isCurrentProcessingConsentContract } from "../../../services/consent";

const BASE_URL = "https://native-minute.example";
const ORIGIN = "capacitor://localhost";
const ACCESS_TOKEN = "header.payload.signature";
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-822222222222";
const SCRIPT_ID = "33333333-3333-4333-8333-333333333333";
const TAKE_ID = "44444444-4444-4444-8444-444444444444";
const RECORDING_ID = "55555555-5555-4555-8555-555555555555";

function mobileRequest(path: string, init: { method?: string; headers?: HeadersInit; body?: BodyInit | null } = {}) {
  const headers = new Headers(init.headers);
  headers.set("Origin", ORIGIN);
  headers.set("Authorization", `Bearer ${ACCESS_TOKEN}`);
  return new NextRequest(`${BASE_URL}${path}`, { ...init, headers });
}

function authDependencies(userId = USER_A) {
  const client = { auth: {} } as unknown as AppSupabaseClient;
  return {
    hasConfig: () => true,
    createClient: () => client,
    validateUser: async () => ({ data: { user: { id: userId } }, error: null })
  };
}

function consentDependencies(
  userId = USER_A,
  overrides: Partial<MobileConsentsRouteDependencies> = {}
): MobileConsentsRouteDependencies {
  return {
    ...authDependencies(userId),
    getProcessingConsentStatus: async (_client, requestedUserId, type) => ({
      type,
      status: requestedUserId === USER_A ? "accepted" : "required"
    }),
    acceptCurrentProcessingConsent: async () => undefined,
    withdrawCurrentProcessingConsent: async (_client, _requestedUserId, type) => ({ type, status: "withdrawn" }),
    ...overrides
  };
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function createPcmWave() {
  const dataByteLength = 32_000;
  const bytes = new Uint8Array(44 + dataByteLength);
  const view = new DataView(bytes.buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataByteLength, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16_000, true);
  view.setUint32(28, 32_000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataByteLength, true);
  return bytes;
}

describe("canonical processing consent", () => {
  it("treats only the exact versioned contract as current and requires re-consent for old versions", () => {
    const current = {
      consent_type: "pronunciation_processing" as const,
      consent_version: "2026-08-22.v1",
      purpose_id: "pronunciation_processing",
      purpose_version: "v1",
      provider_set: ["openai", "azure"],
      data_categories: ["recorded_audio", "transcript", "pronunciation_result"]
    };

    expect(isCurrentProcessingConsentContract(current, "pronunciation_processing")).toBe(true);
    expect(isCurrentProcessingConsentContract({ ...current, consent_version: "2026-01-01.v0" }, "pronunciation_processing")).toBe(false);
  });

  it("uses the authenticated owner to return a minimal consent status with no private provider data", async () => {
    const response = await handleMobileConsentGet(
      mobileRequest("/api/mobile/consents/pronunciation_processing"),
      "pronunciation_processing",
      consentDependencies(USER_B)
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true, data: { consent: { status: "required" } } });
    expect(JSON.stringify(payload)).not.toContain("provider");
    expect(JSON.stringify(payload)).not.toContain("storage");
  });

  it("accepts and withdraws consent through the same safe mobile contract", async () => {
    let status: "accepted" | "required" | "withdrawn" = "required";
    const acceptCurrentProcessingConsent = vi.fn(async () => {
      status = "accepted";
    });
    const dependencies = consentDependencies(USER_A, {
      acceptCurrentProcessingConsent,
      getProcessingConsentStatus: async (_client, _userId, type) => ({ type, status }),
      withdrawCurrentProcessingConsent: async (_client, _userId, type) => {
        status = "withdrawn";
        return { type, status };
      }
    });

    const accepted = await handleMobileConsentPost(
      mobileRequest("/api/mobile/consents/pronunciation_processing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accepted: true })
      }),
      "pronunciation_processing",
      dependencies
    );
    expect(await accepted.json()).toEqual({ ok: true, data: { consent: { status: "accepted" } } });
    expect(acceptCurrentProcessingConsent).toHaveBeenCalledWith(expect.anything(), USER_A, "pronunciation_processing");

    const withdrawn = await handleMobileConsentDelete(
      mobileRequest("/api/mobile/consents/pronunciation_processing", { method: "DELETE" }),
      "pronunciation_processing",
      dependencies
    );
    expect(await withdrawn.json()).toEqual({ ok: true, data: { consent: { status: "withdrawn" } } });
  });
});

describe("pronunciation consent fail-closed boundaries", () => {
  it("permits an owned upload after the current pronunciation consent check succeeds", async () => {
    const formData = new FormData();
    formData.set("scriptId", SCRIPT_ID);
    formData.set("recordingRef", RECORDING_ID);
    formData.set("file", new File([createPcmWave()], "take.wav", { type: "audio/wav" }));
    const assertPronunciationConsent = vi.fn(async () => undefined);
    const uploadOwnedRecording = vi.fn(async () => ({
      audioPath: "storage://recordings/private",
      audioStorageKey: `${USER_A}/${SCRIPT_ID}/${RECORDING_ID}.wav`,
      durationSeconds: 1,
      contentType: "audio/wav"
    }));

    const response = await handleMobileRecordingsPost(
      mobileRequest("/api/mobile/recordings", { method: "POST", body: formData }),
      {
        ...authDependencies(),
        assertPronunciationConsent,
        assertUploadEnabled: () => undefined,
        uploadOwnedRecording
      }
    );

    expect(response.status).toBe(201);
    expect(assertPronunciationConsent).toHaveBeenCalledWith(expect.anything(), USER_A);
    expect(uploadOwnedRecording).toHaveBeenCalledTimes(1);
  });

  it("blocks mobile recording storage before any upload when consent is missing", async () => {
    const formData = new FormData();
    formData.set("scriptId", SCRIPT_ID);
    formData.set("recordingRef", RECORDING_ID);
    formData.set("file", new File([createPcmWave()], "take.wav", { type: "audio/wav" }));
    const uploadOwnedRecording = vi.fn();
    const assertPronunciationConsent = vi.fn(async () => {
      throw new AppError(409, "consent required");
    });

    const response = await handleMobileRecordingsPost(
      mobileRequest("/api/mobile/recordings", { method: "POST", body: formData }),
      {
        ...authDependencies(),
        assertPronunciationConsent,
        assertUploadEnabled: () => undefined,
        uploadOwnedRecording
      }
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error.reasonCode).toBe("pronunciation_consent_required");
    expect(uploadOwnedRecording).not.toHaveBeenCalled();
  });

  it("blocks evaluation before the review service and therefore before OpenAI or Azure work", async () => {
    const createPersistedReview = vi.fn();
    const claimReviewTake = vi.fn();
    const response = await handleMobileEvaluatePost(
      mobileRequest("/api/mobile/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptId: SCRIPT_ID, takeId: TAKE_ID, recordingRef: RECORDING_ID })
      }),
      {
        ...authDependencies(),
        assertPronunciationConsent: async () => {
          throw new AppError(409, "consent required");
        },
        getOwnedScript: async () => ({
          id: SCRIPT_ID,
          title: "Owned script",
          content: "A safe script.",
          targetSeconds: 60,
          locale: "en-US",
          createdAt: "2026-08-22T00:00:00.000Z",
          updatedAt: "2026-08-22T00:00:00.000Z"
        }),
        getStoredReview: async () => null,
        claimReviewTake,
        releaseReviewTakeClaim: async () => undefined,
        createPersistedReview
      }
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error.reasonCode).toBe("pronunciation_consent_required");
    expect(claimReviewTake).not.toHaveBeenCalled();
    expect(createPersistedReview).not.toHaveBeenCalled();
  });
});

describe("voice cloning consent fail-closed boundary", () => {
  it("permits a new voice only after the current voice-cloning consent is present", async () => {
    let snapshot = {
      providerSupported: true,
      consent: { id: "current-provider-consent" },
      voiceConsentCurrent: true,
      defaultVoice: null as { id: string } | null
    };
    const uploadOwnedVoiceSample = vi.fn(async () => ({
      audioPath: "storage://voice-samples/private",
      contentType: "audio/mp4",
      byteLength: 5
    }));
    const createDefaultVoiceIfMissing = vi.fn(async () => {
      snapshot = { ...snapshot, defaultVoice: { id: "private-voice" } };
      return { created: true };
    });
    const formData = new FormData();
    formData.set("file", new File(["voice"], "sample.m4a", { type: "audio/mp4" }));
    const response = await handleMobileVoiceSetupPost(
      mobileRequest("/api/mobile/voice-setup", { method: "POST", body: formData }),
      {
        ...authDependencies(),
        getVoiceSetupState: async () => snapshot,
        createVoiceConsent: async () => undefined,
        assertUploadEnabled: () => undefined,
        uploadOwnedVoiceSample,
        createDefaultVoiceIfMissing
      }
    );

    expect(response.status).toBe(200);
    expect(uploadOwnedVoiceSample).toHaveBeenCalledTimes(1);
    expect(createDefaultVoiceIfMissing).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(await response.json())).not.toContain("private-");
  });

  it("does not upload a sample or call voice creation for a legacy or withdrawn consent", async () => {
    const uploadOwnedVoiceSample = vi.fn();
    const createDefaultVoiceIfMissing = vi.fn();
    const formData = new FormData();
    formData.set("file", new File(["voice"], "sample.m4a", { type: "audio/mp4" }));
    const response = await handleMobileVoiceSetupPost(
      mobileRequest("/api/mobile/voice-setup", { method: "POST", body: formData }),
      {
        ...authDependencies(),
        getVoiceSetupState: async () => ({
          providerSupported: true,
          consent: { id: "legacy-provider-consent" },
          voiceConsentCurrent: false,
          defaultVoice: null
        }),
        createVoiceConsent: async () => undefined,
        assertUploadEnabled: () => undefined,
        uploadOwnedVoiceSample,
        createDefaultVoiceIfMissing
      }
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error.reasonCode).toBe("voice_setup_required");
    expect(uploadOwnedVoiceSample).not.toHaveBeenCalled();
    expect(createDefaultVoiceIfMissing).not.toHaveBeenCalled();
  });
});
