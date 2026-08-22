import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import type { AppSupabaseClient } from "../../../lib/supabase/client";
import {
  handleMobileVoiceSetupGet,
  handleMobileVoiceSetupOptions,
  handleMobileVoiceSetupPost,
  type MobileVoiceSetupRouteDependencies
} from "../../../lib/mobile/voice-setup-route";

const BASE_URL = "https://native-minute.example";
const ORIGIN = "capacitor://localhost";
const ACCESS_TOKEN = "header.payload.signature";
const USER_ID = "11111111-1111-4111-8111-111111111111";

type SetupSnapshot = {
  providerSupported: boolean;
  consent: { id: string } | null;
  voiceConsentCurrent: boolean;
  defaultVoice: { id: string } | null;
};

function mobileRequest(path: string, init: {
  method?: string;
  headers?: HeadersInit;
  body?: BodyInit | null;
} = {}) {
  const headers = new Headers(init.headers);
  headers.set("Origin", ORIGIN);
  headers.set("Authorization", `Bearer ${ACCESS_TOKEN}`);
  return new NextRequest(`${BASE_URL}${path}`, { ...init, headers });
}

function dependencies(
  getSnapshot: () => SetupSnapshot,
  overrides: Partial<MobileVoiceSetupRouteDependencies> = {}
): MobileVoiceSetupRouteDependencies {
  const client = { auth: {} } as unknown as AppSupabaseClient;

  return {
    hasConfig: () => true,
    createClient: () => client,
    validateUser: async () => ({ data: { user: { id: USER_ID } }, error: null }),
    getVoiceSetupState: async () => getSnapshot(),
    createVoiceConsent: async () => undefined,
    assertUploadEnabled: () => undefined,
    uploadOwnedVoiceSample: async () => ({
      audioPath: "storage://voice-samples/private-user/private-consent/private-sample.m4a",
      contentType: "audio/mp4",
      byteLength: 8
    }),
    createDefaultVoiceIfMissing: async () => ({ created: true }),
    ...overrides
  };
}

describe("mobile fresh-user voice setup BFF", () => {
  it("returns only a safe readiness state and never a consent, voice, provider, or storage identifier", async () => {
    const response = await handleMobileVoiceSetupGet(
      mobileRequest("/api/mobile/voice-setup"),
      dependencies(() => ({
        providerSupported: true,
        consent: { id: "private-consent-id" },
        voiceConsentCurrent: true,
        defaultVoice: { id: "private-voice-id" }
      }))
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true, data: { status: "ready", created: false } });
    expect(JSON.stringify(payload)).not.toContain("private-");
  });

  it("requires Bearer authentication before consulting fresh-user voice state", async () => {
    const getVoiceSetupState = vi.fn();
    const response = await handleMobileVoiceSetupGet(
      new NextRequest(`${BASE_URL}/api/mobile/voice-setup`, {
        headers: { Origin: ORIGIN, Cookie: "web-session=must-not-be-used" }
      }),
      dependencies(() => ({ providerSupported: true, consent: null, voiceConsentCurrent: false, defaultVoice: null }), { getVoiceSetupState })
    );

    expect(response.status).toBe(401);
    expect((await response.json()).error.reasonCode).toBe("auth_required");
    expect(getVoiceSetupState).not.toHaveBeenCalled();
  });

  it("persists consent once and moves a fresh user to the sample step without exposing its identifier", async () => {
    let snapshot: SetupSnapshot = { providerSupported: true, consent: null, voiceConsentCurrent: false, defaultVoice: null };
    const createVoiceConsent = vi.fn(async () => {
      snapshot = { ...snapshot, consent: { id: "private-consent-id" }, voiceConsentCurrent: true };
    });
    const response = await handleMobileVoiceSetupPost(
      mobileRequest("/api/mobile/voice-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accepted: true })
      }),
      dependencies(() => snapshot, { createVoiceConsent })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(createVoiceConsent).toHaveBeenCalledWith(expect.anything(), USER_ID, { accepted: true });
    expect(payload).toEqual({ ok: true, data: { status: "sample_required", created: false } });
    expect(JSON.stringify(payload)).not.toContain("private-consent-id");
  });

  it("uses the current owned consent and app-owned sample server-side before creating one default voice", async () => {
    let snapshot: SetupSnapshot = {
      providerSupported: true,
      consent: { id: "private-consent-id" },
      voiceConsentCurrent: true,
      defaultVoice: null
    };
    const uploadOwnedVoiceSample = vi.fn(async () => ({
      audioPath: "storage://voice-samples/private-user/private-consent/private-sample.m4a",
      contentType: "audio/mp4",
      byteLength: 8
    }));
    const createDefaultVoiceIfMissing = vi.fn(async () => {
      snapshot = { ...snapshot, defaultVoice: { id: "private-voice-id" } };
      return { created: true };
    });
    const formData = new FormData();
    formData.set("file", new File(["voice"], "sample.m4a", { type: "audio/mp4" }));
    const response = await handleMobileVoiceSetupPost(
      mobileRequest("/api/mobile/voice-setup", { method: "POST", body: formData }),
      dependencies(() => snapshot, { uploadOwnedVoiceSample, createDefaultVoiceIfMissing })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(uploadOwnedVoiceSample).toHaveBeenCalledWith(expect.anything(), USER_ID, expect.objectContaining({
      consentId: "private-consent-id"
    }));
    expect(createDefaultVoiceIfMissing).toHaveBeenCalledWith(expect.anything(), USER_ID, {
      consentId: "private-consent-id",
      label: "My voice",
      sampleAudio: {
        audioPath: "storage://voice-samples/private-user/private-consent/private-sample.m4a",
        contentType: "audio/mp4",
        byteLength: 8
      }
    });
    expect(payload).toEqual({ ok: true, data: { status: "ready", created: true } });
    expect(JSON.stringify(payload)).not.toContain("private-");
  });

  it("makes a repeated create request reuse the persisted default without another upload or provider creation", async () => {
    const uploadOwnedVoiceSample = vi.fn();
    const createDefaultVoiceIfMissing = vi.fn();
    const formData = new FormData();
    formData.set("file", new File(["voice"], "sample.m4a", { type: "audio/mp4" }));
    const response = await handleMobileVoiceSetupPost(
      mobileRequest("/api/mobile/voice-setup", { method: "POST", body: formData }),
      dependencies(
        () => ({
          providerSupported: true,
          consent: { id: "private-consent-id" },
          voiceConsentCurrent: true,
          defaultVoice: { id: "private-voice-id" }
        }),
        { uploadOwnedVoiceSample, createDefaultVoiceIfMissing }
      )
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { status: "ready", created: false } });
    expect(uploadOwnedVoiceSample).not.toHaveBeenCalled();
    expect(createDefaultVoiceIfMissing).not.toHaveBeenCalled();
  });

  it("keeps CORS preflight scoped to the Bearer-only GET and POST contract", () => {
    const response = handleMobileVoiceSetupOptions(
      new NextRequest(`${BASE_URL}/api/mobile/voice-setup`, {
        method: "OPTIONS",
        headers: {
          Origin: ORIGIN,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "authorization, content-type"
        }
      })
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
  });
});
