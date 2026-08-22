import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSupabaseClient } from "../../../lib/supabase/client";
import { handleMobileListenPost } from "../../../lib/mobile/listen-route";
import type { ScriptListItem } from "../../../services/scripts/types";
import { speakScript } from "../../../services/voice/voice.service";

const voiceProviderMocks = vi.hoisted(() => ({
  createConfiguredVoiceProvider: vi.fn(),
  getVoiceProviderName: vi.fn(),
  getVoiceProviderStatus: vi.fn(),
  synthesize: vi.fn()
}));

const scriptServiceMocks = vi.hoisted(() => ({
  getScript: vi.fn()
}));

const quotaMocks = vi.hoisted(() => ({
  buildVoiceGenerationAttemptMetadata: vi.fn(() => ({})),
  buildVoiceGenerationQuotaKeys: vi.fn(() => ({})),
  markQuotaEventFailed: vi.fn(),
  markQuotaEventPartial: vi.fn(),
  markQuotaEventSucceeded: vi.fn(),
  recordVoiceQuotaEventAttempt: vi.fn(),
  recordVoiceQuotaEventCacheHit: vi.fn(),
  recordVoiceQuotaEventFailed: vi.fn(),
  recordVoiceQuotaEventSkipped: vi.fn(),
  withNonBlockingQuotaEventWrite: vi.fn(async (_label: string, operation: () => Promise<unknown>) => operation())
}));

vi.mock("@/providers/voice", () => ({
  createConfiguredVoiceProvider: voiceProviderMocks.createConfiguredVoiceProvider,
  getVoiceProviderName: voiceProviderMocks.getVoiceProviderName,
  getVoiceProviderStatus: voiceProviderMocks.getVoiceProviderStatus
}));

vi.mock("@/services/scripts/scripts.service", () => ({
  getScript: scriptServiceMocks.getScript
}));

vi.mock("@/services/quota", () => quotaMocks);

const BASE_URL = "https://native-minute.example";
const ORIGIN = "capacitor://localhost";
const ACCESS_TOKEN = "header.payload.signature";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const SCRIPT_ID = "22222222-2222-4222-8222-222222222222";
const VOICE_ID = "33333333-3333-4333-8333-333333333333";
const AUDIO_ID = "44444444-4444-4444-8444-444444444444";
const PROVIDER_DETAIL = "private provider diagnostic must not reach the mobile response";

const script: ScriptListItem = {
  id: SCRIPT_ID,
  title: "Morning update",
  content: "A safe one-minute practice script.",
  targetSeconds: 60,
  locale: "en-US",
  createdAt: "2026-08-13T00:00:00.000Z",
  updatedAt: "2026-08-13T00:01:00.000Z"
};

const voice = {
  id: VOICE_ID,
  user_id: USER_ID,
  provider: "elevenlabs",
  consent_id: null,
  provider_voice_id: "provider-voice-private",
  label: "Default",
  sample_audio_path: null,
  is_default: true,
  created_at: "2026-08-13T00:00:00.000Z"
};

const cachedAudio = {
  id: AUDIO_ID,
  script_id: SCRIPT_ID,
  voice_id: VOICE_ID,
  provider: "elevenlabs",
  cache_key: "canonical-cache-key",
  storage_path: `/api/script-audio/${AUDIO_ID}`,
  stored_asset: {},
  duration_seconds: null,
  created_at: "2026-08-13T00:00:00.000Z"
};

function createThenableQuery(result: { data: unknown; error: null }) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    maybeSingle: vi.fn(async () => result),
    then: <TResult1 = { data: unknown; error: null }, TResult2 = never>(
      onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) => Promise.resolve(result).then(onfulfilled, onrejected)
  };

  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);

  return query;
}

function createVoiceCacheClient(input: {
  defaultVoice?: typeof voice | null;
  ownedVoice?: typeof voice | null;
  cachedAudio?: typeof cachedAudio | null;
}) {
  const voicesQuery = createThenableQuery({
    data: input.defaultVoice ? [input.defaultVoice] : [],
    error: null
  });
  voicesQuery.maybeSingle.mockResolvedValue({ data: input.ownedVoice ?? null, error: null });

  const audioQuery = createThenableQuery({ data: null, error: null });
  audioQuery.maybeSingle.mockResolvedValue({ data: input.cachedAudio ?? null, error: null });

  const from = vi.fn((table: string) => {
    if (table === "voices") {
      return voicesQuery;
    }

    if (table === "script_audios") {
      return audioQuery;
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    client: { from } as unknown as AppSupabaseClient,
    audioLookup: audioQuery.maybeSingle
  };
}

function mobileRequest(path: string) {
  return new NextRequest(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      Authorization: `Bearer ${ACCESS_TOKEN}`
    }
  });
}

function mobileAuthDependencies(client: AppSupabaseClient) {
  return {
    hasConfig: () => true,
    createClient: () => client,
    validateUser: async () => ({ data: { user: { id: USER_ID } }, error: null })
  };
}

function providerUnavailableStatus() {
  return {
    provider: "elevenlabs",
    supported: false,
    message: PROVIDER_DETAIL,
    readiness: "unsupported",
    requirements: {},
    diagnostics: []
  };
}

describe("mobile listen cache before provider availability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    voiceProviderMocks.getVoiceProviderName.mockReturnValue("elevenlabs");
    voiceProviderMocks.getVoiceProviderStatus.mockReturnValue(providerUnavailableStatus());
    voiceProviderMocks.createConfiguredVoiceProvider.mockReturnValue({
      synthesize: voiceProviderMocks.synthesize
    });
    scriptServiceMocks.getScript.mockResolvedValue(script);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns owned cached audio through the Mobile Listen route without provider synthesis", async () => {
    const { client, audioLookup } = createVoiceCacheClient({
      defaultVoice: voice,
      cachedAudio
    });

    const response = await handleMobileListenPost(
      mobileRequest(`/api/mobile/scripts/${SCRIPT_ID}/listen`),
      SCRIPT_ID,
      {
        ...mobileAuthDependencies(client),
        getOwnedScript: async () => script,
        speakOwnedScript: speakScript
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: { audioId: AUDIO_ID, cached: true }
    });
    expect(audioLookup).toHaveBeenCalledOnce();
    expect(voiceProviderMocks.createConfiguredVoiceProvider).not.toHaveBeenCalled();
    expect(voiceProviderMocks.synthesize).not.toHaveBeenCalled();
    expect(quotaMocks.recordVoiceQuotaEventCacheHit).toHaveBeenCalledOnce();
  });

  it("keeps the Mobile safe 503 on cache miss without synthesis or provider detail exposure", async () => {
    const { client, audioLookup } = createVoiceCacheClient({
      defaultVoice: voice,
      cachedAudio: null
    });

    const response = await handleMobileListenPost(
      mobileRequest(`/api/mobile/scripts/${SCRIPT_ID}/listen`),
      SCRIPT_ID,
      {
        ...mobileAuthDependencies(client),
        getOwnedScript: async () => script,
        speakOwnedScript: speakScript
      }
    );
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual({
      ok: false,
      error: {
        reasonCode: "listen_unavailable",
        message: "お手本音声を準備できませんでした。",
        retryable: true
      }
    });
    expect(JSON.stringify(payload)).not.toContain(PROVIDER_DETAIL);
    expect(audioLookup).toHaveBeenCalledOnce();
    expect(voiceProviderMocks.createConfiguredVoiceProvider).not.toHaveBeenCalled();
    expect(voiceProviderMocks.synthesize).not.toHaveBeenCalled();
    expect(quotaMocks.recordVoiceQuotaEventSkipped).toHaveBeenCalledOnce();
  });

  it("does not look up cached audio for a missing or foreign script", async () => {
    const { client, audioLookup } = createVoiceCacheClient({
      defaultVoice: voice,
      cachedAudio
    });
    scriptServiceMocks.getScript.mockResolvedValue(null);

    await expect(speakScript(client, USER_ID, { scriptId: SCRIPT_ID })).rejects.toMatchObject({ status: 404 });

    expect(scriptServiceMocks.getScript).toHaveBeenCalledWith(client, USER_ID, SCRIPT_ID);
    expect(audioLookup).not.toHaveBeenCalled();
  });

  it("does not look up cached audio for an unowned voice or provider binding", async () => {
    const foreignVoiceId = "55555555-5555-4555-8555-555555555555";
    const unownedVoice = createVoiceCacheClient({
      defaultVoice: voice,
      ownedVoice: null,
      cachedAudio
    });

    await expect(speakScript(unownedVoice.client, USER_ID, {
      scriptId: SCRIPT_ID,
      voiceId: foreignVoiceId
    })).rejects.toMatchObject({ status: 409 });

    expect(unownedVoice.audioLookup).not.toHaveBeenCalled();

    const wrongProvider = createVoiceCacheClient({
      defaultVoice: { ...voice, provider: "mock" },
      cachedAudio
    });

    await expect(speakScript(wrongProvider.client, USER_ID, { scriptId: SCRIPT_ID })).rejects.toMatchObject({ status: 409 });

    expect(wrongProvider.audioLookup).not.toHaveBeenCalled();
  });
});
