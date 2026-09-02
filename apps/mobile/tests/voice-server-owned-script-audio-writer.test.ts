import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSupabaseClient } from "@/lib/supabase/client";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SCRIPT_ID = "22222222-2222-4222-8222-222222222222";
const VOICE_ID = "33333333-3333-4333-8333-333333333333";
const AUDIO_ID = "44444444-4444-4444-8444-444444444444";

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  getSupabaseServiceRoleKey: vi.fn(() => "server-only-test-key"),
  requireCurrentUser: vi.fn(async () => ({ id: USER_ID })),
  getScript: vi.fn(),
  createConfiguredVoiceProvider: vi.fn(),
  getVoiceProviderStatus: vi.fn(),
  stageScriptAudioForReplay: vi.fn(),
  quota: {
    buildVoiceGenerationAttemptMetadata: vi.fn(() => ({})),
    buildVoiceGenerationQuotaKeys: vi.fn(() => ({})),
    markQuotaEventFailed: vi.fn(),
    markQuotaEventPartial: vi.fn(),
    markQuotaEventSucceeded: vi.fn(),
    recordVoiceQuotaEventAttempt: vi.fn(async () => null),
    recordVoiceQuotaEventCacheHit: vi.fn(),
    recordVoiceQuotaEventFailed: vi.fn(),
    recordVoiceQuotaEventSkipped: vi.fn(),
    withNonBlockingQuotaEventWrite: vi.fn(async (_label: string, operation: () => Promise<unknown>) => operation())
  }
}));

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.createSupabaseAdminClient }));
vi.mock("@/lib/supabase/config", () => ({ getSupabaseServiceRoleKey: mocks.getSupabaseServiceRoleKey }));
vi.mock("@/lib/supabase/auth", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
vi.mock("@/services/scripts/scripts.service", () => ({ getScript: mocks.getScript }));
vi.mock("@/providers/voice", () => ({
  createConfiguredVoiceProvider: mocks.createConfiguredVoiceProvider,
  getVoiceProviderName: () => "elevenlabs",
  getVoiceProviderStatus: mocks.getVoiceProviderStatus
}));
vi.mock("@/services/voice/replay.service", async () => {
  const actual = await vi.importActual<typeof import("@/services/voice/replay.service")>("@/services/voice/replay.service");
  return { ...actual, stageScriptAudioForReplay: mocks.stageScriptAudioForReplay };
});
vi.mock("@/services/quota", () => mocks.quota);

import { speakScript } from "@/services/voice/voice.service";

const script = {
  id: SCRIPT_ID,
  title: "Morning update",
  content: "A safe one-minute practice script.",
  targetSeconds: 60,
  locale: "en-US",
  createdAt: "2026-08-24T00:00:00.000Z",
  updatedAt: "2026-08-24T00:00:00.000Z"
};
const voice = {
  id: VOICE_ID,
  user_id: USER_ID,
  provider: "elevenlabs",
  consent_id: null,
  provider_voice_id: "provider-voice-a",
  label: "Default",
  sample_audio_path: null,
  is_default: true,
  created_at: "2026-08-24T00:00:00.000Z"
};

function voiceQuery() {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data: voice, error: null })),
    then: (resolve: (value: { data: typeof voice[]; error: null }) => unknown) =>
      Promise.resolve({ data: [voice], error: null }).then(resolve)
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  return query;
}

function createClient(finalAudio: { current: Record<string, unknown> | null }) {
  const voices = voiceQuery();
  const audio = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data: finalAudio.current, error: null }))
  };
  audio.select.mockReturnValue(audio);
  audio.eq.mockReturnValue(audio);

  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER_ID } }, error: null })) },
    from: vi.fn((table: string) => {
      if (table === "voices") return voices;
      if (table === "script_audios") return audio;
      throw new Error(`unexpected request table: ${table}`);
    })
  } as unknown as AppSupabaseClient;
}

function configureHappyPath(input: { reservationError?: { message: string } | null } = {}) {
  const finalAudio = { current: null as Record<string, unknown> | null };
  const inserted = {
    id: AUDIO_ID,
    script_id: SCRIPT_ID,
    voice_id: VOICE_ID,
    provider: "elevenlabs",
    cache_key: "",
    storage_path: `/api/script-audio/${AUDIO_ID}`,
    stored_asset: {},
    duration_seconds: null,
    created_at: "2026-08-24T00:00:00.000Z"
  };
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "reserve_voice_asset_write_intent") {
      if (input.reservationError) {
        return { data: null, error: input.reservationError };
      }

      inserted.cache_key = String(args.p_cache_key);
      return {
        data: {
          id: "55555555-5555-4555-8555-555555555555",
          user_id: USER_ID,
          kind: "script_audio_create",
          status: "reserved",
          lease_token: args.p_lease_token
        },
        error: null
      };
    }

    if (name === "finalize_script_audio_write_intent") {
      finalAudio.current = inserted;
      return { data: inserted, error: null };
    }

    throw new Error(`unexpected admin RPC: ${name}`);
  });
  mocks.createSupabaseAdminClient.mockReturnValue({
    rpc
  });
  mocks.getScript.mockResolvedValue(script);
  mocks.getVoiceProviderStatus.mockReturnValue({ provider: "elevenlabs", supported: true });
  mocks.createConfiguredVoiceProvider.mockReturnValue({ synthesize: vi.fn(async () => ({ audio: new Uint8Array([1, 2, 3]) })) });
  mocks.stageScriptAudioForReplay.mockImplementation(async (stageInput: { reservedStorageObjectKey: string }) => ({
    storagePath: `/api/script-audio/${AUDIO_ID}`,
    storedAsset: {
      storageBucket: "script-audios",
      storageObjectKey: stageInput.reservedStorageObjectKey,
      contentType: "audio/mpeg",
      byteLength: 3
    }
  }));
  return { client: createClient(finalAudio), rpc };
}

describe("G5C-B4 server-owned Listen cache writer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("re-authenticates, validates owned script/voice/cache identity, and writes through the server client", async () => {
    const { client, rpc } = configureHappyPath();

    await expect(speakScript(client, USER_ID, { scriptId: SCRIPT_ID })).resolves.toMatchObject({ cached: false, voice });
    expect(mocks.requireCurrentUser).toHaveBeenCalled();
    expect(rpc).toHaveBeenNthCalledWith(1, "reserve_voice_asset_write_intent", expect.objectContaining({
      p_user_id: USER_ID,
      p_kind: "script_audio_create",
      p_script_id: SCRIPT_ID,
      p_voice_id: VOICE_ID
    }));
    expect(rpc).toHaveBeenNthCalledWith(2, "finalize_script_audio_write_intent", expect.objectContaining({
      p_user_id: USER_ID,
      p_provider: "elevenlabs"
    }));
    expect(mocks.stageScriptAudioForReplay).toHaveBeenCalledWith(expect.objectContaining({
      storageClient: expect.objectContaining({ rpc })
    }));
    expect(mocks.createSupabaseAdminClient).toHaveBeenCalledTimes(1);
  });

  it("rejects before synthesis or Storage when deletion is active", async () => {
    const { client } = configureHappyPath({ reservationError: { message: "voice_deletion_active" } });

    await expect(speakScript(client, USER_ID, { scriptId: SCRIPT_ID })).rejects.toMatchObject({ status: 409 });
    expect(mocks.createConfiguredVoiceProvider).not.toHaveBeenCalled();
    expect(mocks.stageScriptAudioForReplay).not.toHaveBeenCalled();
  });
});
