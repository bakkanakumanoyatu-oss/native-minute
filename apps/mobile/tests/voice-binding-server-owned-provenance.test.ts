import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSupabaseClient } from "@/lib/supabase/client";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-822222222222";
const CONSENT_A = "33333333-3333-4333-8333-333333333333";

const mocks = vi.hoisted(() => {
  const createVoice = vi.fn();

  return {
    createSupabaseAdminClient: vi.fn(),
    getSupabaseServiceRoleKey: vi.fn(() => "server-only-test-key"),
    createVoice,
    createConfiguredVoiceProvider: vi.fn(() => ({ createVoice })),
    assertCurrentProcessingConsent: vi.fn(async () => undefined),
    resolveOwnedVoiceSampleInput: vi.fn(async () => null)
  };
});

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.createSupabaseAdminClient }));
vi.mock("@/lib/supabase/config", () => ({
  getSupabaseServiceRoleKey: mocks.getSupabaseServiceRoleKey,
  hasSupabaseConfig: () => true
}));
vi.mock("@/providers/voice", () => ({
  createConfiguredVoiceProvider: mocks.createConfiguredVoiceProvider,
  getVoiceProviderName: () => "elevenlabs",
  getVoiceProviderStatus: () => ({
    provider: "elevenlabs",
    supported: true,
    requirements: {
      requiresProviderConsentId: false,
      requiresSampleAudio: false
    }
  })
}));
vi.mock("@/services/consent", () => ({
  acceptCurrentProcessingConsent: vi.fn(),
  assertCurrentProcessingConsent: mocks.assertCurrentProcessingConsent,
  getCurrentProcessingConsent: vi.fn()
}));
vi.mock("@/services/storage", () => ({
  parseVoiceSampleAudioReference: vi.fn(),
  resolveOwnedVoiceConsentRecordingInput: vi.fn(),
  resolveOwnedVoiceSampleInput: mocks.resolveOwnedVoiceSampleInput
}));

const {
  createSupabaseAdminClient,
  getSupabaseServiceRoleKey,
  createVoice,
  assertCurrentProcessingConsent,
  resolveOwnedVoiceSampleInput
} = mocks;

import { createUserVoice } from "@/services/voice";

const migrationPath = fileURLToPath(
  new URL("../../../supabase/migrations/0014_g5c_voice_binding_server_owned.sql", import.meta.url)
);
const priorVoicesPolicyPath = fileURLToPath(
  new URL("../../../supabase/migrations/0004_phase25_storage_guards.sql", import.meta.url)
);
const voiceServicePath = fileURLToPath(
  new URL("../../../services/voice/voice.service.ts", import.meta.url)
);
const voiceDeletionServicePath = fileURLToPath(
  new URL("../../../services/voice-deletion/voice-deletion.service.ts", import.meta.url)
);

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function createAuthenticatedClient(userId = USER_A) {
  const consent = {
    id: CONSENT_A,
    user_id: USER_A,
    provider: "elevenlabs",
    consented_at: "2026-08-22T00:00:00.000Z",
    metadata: {},
    created_at: "2026-08-22T00:00:00.000Z"
  };
  const query = {
    eq() {
      return query;
    },
    maybeSingle: async () => ({ data: consent, error: null })
  };

  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: userId } }, error: null }))
    },
    from: vi.fn((table: string) => {
      if (table !== "voice_consents") {
        throw new Error(`unexpected authenticated write table: ${table}`);
      }

      return { select: () => query };
    })
  } as unknown as AppSupabaseClient;
}

function createServerWriter() {
  const inserted = {
    id: "44444444-4444-4444-8444-444444444444",
    user_id: USER_A,
    provider: "elevenlabs",
    consent_id: CONSENT_A,
    provider_voice_id: "provider-returned-voice-id",
    label: "My voice",
    sample_audio_path: null,
    is_default: true,
    created_at: "2026-08-22T00:00:00.000Z"
  };
  const inserts: unknown[] = [];
  const updates: unknown[] = [];
  const updateQuery = {
    eq() {
      return updateQuery;
    },
    neq: async () => ({ error: null })
  };
  const writer = {
    from: vi.fn((table: string) => {
      if (table !== "voices") {
        throw new Error(`unexpected server write table: ${table}`);
      }

      return {
        insert(values: unknown) {
          inserts.push(values);
          return { select: () => ({ single: async () => ({ data: inserted, error: null }) }) };
        },
        update(values: unknown) {
          updates.push(values);
          return updateQuery;
        }
      };
    })
  };

  return { writer, inserts, updates };
}

describe("G5C-A server-owned voice binding provenance", () => {
  beforeEach(() => {
    createSupabaseAdminClient.mockReset();
    getSupabaseServiceRoleKey.mockReset();
    getSupabaseServiceRoleKey.mockReturnValue("server-only-test-key");
    createVoice.mockReset();
    createVoice.mockResolvedValue({ providerVoiceId: "provider-returned-voice-id" });
    assertCurrentProcessingConsent.mockClear();
    resolveOwnedVoiceSampleInput.mockClear();
  });

  it("removes all authenticated voices mutation policies while retaining the existing owner read policy", () => {
    const remediationSql = compact(readFileSync(migrationPath, "utf8"));
    const priorSql = compact(readFileSync(priorVoicesPolicyPath, "utf8"));

    expect(priorSql).toContain('create policy "voices_select_own" on public.voices for select using (auth.uid() = user_id);');
    expect(remediationSql).toContain('drop policy if exists "voices_insert_own" on public.voices;');
    expect(remediationSql).toContain('drop policy if exists "voices_update_own" on public.voices;');
    expect(remediationSql).toContain('drop policy if exists "voices_delete_own" on public.voices;');
    expect(remediationSql).not.toContain("on public.voices for insert");
    expect(remediationSql).not.toContain("on public.voices for update");
    expect(remediationSql).not.toContain("on public.voices for delete");
    expect(remediationSql).not.toContain("on public.voices for all");
  });

  it("persists provider provenance only from the server-side provider result after re-resolving the request owner", async () => {
    const { writer, inserts, updates } = createServerWriter();
    createSupabaseAdminClient.mockReturnValue(writer);
    const client = createAuthenticatedClient();

    const voice = await createUserVoice(client, USER_A, {
      consentId: CONSENT_A,
      label: "My voice"
    });

    expect(client.auth.getUser).toHaveBeenCalled();
    expect(assertCurrentProcessingConsent).toHaveBeenCalledWith(client, USER_A, "voice_cloning");
    expect(createVoice).toHaveBeenCalledWith(expect.objectContaining({ userId: USER_A, consentId: CONSENT_A }));
    expect(createSupabaseAdminClient).toHaveBeenCalledTimes(1);
    expect(inserts).toEqual([expect.objectContaining({
      user_id: USER_A,
      provider: "elevenlabs",
      consent_id: CONSENT_A,
      provider_voice_id: "provider-returned-voice-id",
      is_default: true
    })]);
    expect(updates).toEqual([{ is_default: false }]);
    expect(voice.provider_voice_id).toBe("provider-returned-voice-id");
  });

  it("rejects a mismatched authenticated owner before a provider call or server binding write", async () => {
    const { writer, inserts } = createServerWriter();
    createSupabaseAdminClient.mockReturnValue(writer);

    await expect(createUserVoice(createAuthenticatedClient(USER_B), USER_A, {
      consentId: CONSENT_A,
      label: "My voice"
    })).rejects.toMatchObject({ status: 403 });

    expect(createVoice).not.toHaveBeenCalled();
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(inserts).toEqual([]);
  });

  it("keeps the voice-only inventory owner-scoped rather than accepting a client-provided provider binding", () => {
    const source = compact(readFileSync(voiceServicePath, "utf8"));
    const inventorySource = compact(readFileSync(voiceDeletionServicePath, "utf8"));

    expect(source).toContain('await assertAuthenticatedVoiceMutationUser(client, userId);');
    expect(source).toContain('return saveVoiceRecord(userId, consent, created.providerVoiceId, {');
    expect(source).toContain('await client .from("voices") .select("*") .eq("user_id", userId)');
    expect(source).not.toContain("providerVoiceId: input.providerVoiceId");
    expect(inventorySource).toContain(
      'await client.from("voices").select("*").eq("user_id", userId).eq("provider", VOICE_ONLY_PROVIDER)'
    );
  });
});
