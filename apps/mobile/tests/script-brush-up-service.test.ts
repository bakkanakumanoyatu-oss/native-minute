import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSupabaseClient } from "@/lib/supabase/client";
import type { VoiceProvider } from "@/providers/voice";
import type { VoiceDeletionProviderAdapter } from "@/providers/voice-deletion";

vi.mock("server-only", () => ({}));

const USER = "10000000-0000-4000-8000-000000000001";
const SCRIPT = "20000000-0000-4000-8000-000000000001";
const REVISION = "30000000-0000-4000-8000-000000000001";
const TAKE = "40000000-0000-4000-8000-000000000001";
const CONSENT = "50000000-0000-4000-8000-000000000001";
const CANDIDATE = "60000000-0000-4000-8000-000000000001";
const BASELINE = "70000000-0000-4000-8000-000000000001";
const CANDIDATE_AUDIO = "80000000-0000-4000-8000-000000000001";
const AUDIO_PATH = "/api/script-audio/90000000-0000-4000-8000-000000000001";
const IDENTITY = "a".repeat(64);
const previousGate = process.env.NATIVE_MINUTE_ENABLE_SCRIPT_BRUSH_UP;

const mocks = vi.hoisted(() => ({
  getScript: vi.fn(),
  getOwnedTakeAudioIdentity: vi.fn(),
  loadOwnedTakeAudio: vi.fn(),
  getCachedListenAudio: vi.fn(),
  getVoiceProviderStatus: vi.fn(),
  readBetaQuotaPolicy: vi.fn(),
  reserveBetaQuota: vi.fn(),
  stageScriptAudioForReplay: vi.fn(),
  createAccountDeletionStorageAdapter: vi.fn(),
  createSupabaseAdminClient: vi.fn()
}));

vi.mock("@/services/scripts/scripts.service", () => ({ getScript: mocks.getScript }));
vi.mock("@/services/takes/take-audio-identity", () => ({ getOwnedTakeAudioIdentity: mocks.getOwnedTakeAudioIdentity }));
vi.mock("@/services/takes/take-audio.service", () => ({ loadOwnedTakeAudio: mocks.loadOwnedTakeAudio }));
vi.mock("@/services/voice/voice.service", () => ({ getCachedListenAudio: mocks.getCachedListenAudio }));
vi.mock("@/providers/voice", () => ({
  getVoiceProviderStatus: mocks.getVoiceProviderStatus,
  createConfiguredVoiceProvider: vi.fn(() => { throw new Error("unexpected provider construction"); })
}));
vi.mock("@/services/quota/beta-quota-policy", () => ({ readBetaQuotaPolicy: mocks.readBetaQuotaPolicy }));
vi.mock("@/services/quota/beta-quota.service", () => ({ reserveBetaQuota: mocks.reserveBetaQuota }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.createSupabaseAdminClient }));
vi.mock("@/services/account-deletion/account-deletion-storage-adapter", () => ({
  createAccountDeletionStorageAdapter: mocks.createAccountDeletionStorageAdapter
}));
vi.mock("@/services/voice/replay.service", async importOriginal => ({
  ...await importOriginal<typeof import("@/services/voice/replay.service")>(),
  stageScriptAudioForReplay: mocks.stageScriptAudioForReplay
}));

import { advanceAccountDeletionBrushUpProviderCleanup, decideScriptBrushUpCandidate, generateScriptBrushUpCandidate, getScriptBrushUpView } from "@/services/brush-up/brush-up.service";

function query(row: () => unknown) {
  return {
    select() { return this; },
    eq() { return this; },
    in() { return this; },
    order() { return this; },
    limit() { return this; },
    maybeSingle: async () => ({ data: row(), error: null })
  };
}

function harness(options: { synthesizeFails?: boolean; storageFails?: boolean; deleteFails?: boolean;
  providerPersistFails?: boolean; absenceUncertain?: boolean;
  takeRevisionId?: string | null; consentMissing?: boolean } = {}) {
  const candidate = {
    id: CANDIDATE, user_id: USER, script_id: SCRIPT, script_revision_id: REVISION,
    source_take_id: TAKE, consent_id: CONSENT, provider_operation_label: `nm-brush-${CANDIDATE}`,
    provider_candidate_voice_id: null as string | null,
    provider_cleanup_state: "create_unknown", asset_cleanup_state: "not_needed",
    candidate_storage_object_key: null as string | null,
    candidate_script_audio_id: null as string | null, status: "preparing"
  };
  const baseline = { id: BASELINE, generation_preset: "default", storage_path: AUDIO_PATH };
  const client = {
    from: vi.fn((table: string) => query(() => ({
      takes: { id: TAKE, user_id: USER, script_id: SCRIPT, script_revision_id: options.takeRevisionId === undefined ? REVISION : options.takeRevisionId,
        status: "reviewed", audio_path: `storage://recordings/${USER}/${SCRIPT}/take.wav` },
      script_brush_up_consents: options.consentMissing ? null : { id: CONSENT, user_id: USER, script_id: SCRIPT,
        script_revision_id: REVISION, source_take_id: TAKE, source_recording_identity: IDENTITY },
      script_brush_up_candidates: candidate,
      script_audios: baseline
    } as Record<string, unknown>)[table]))
  } as unknown as AppSupabaseClient;
  const storage = {
    deleteObject: vi.fn(async () => ({ kind: "request_succeeded" })),
    verifyObjectAbsence: vi.fn(async () => ({ kind: options.absenceUncertain ? "protocol_error" : "absent" }))
  };
  mocks.createAccountDeletionStorageAdapter.mockReturnValue(storage);
  const admin = {
    from: vi.fn((table: string) => query(() => table === "script_brush_up_candidates" ? candidate : null)),
    storage: { from: vi.fn() },
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === "begin_script_brush_up_candidate") return { data: { ...candidate }, error: null };
      if (name === "transition_script_brush_up_candidate") {
        const action = args.p_action;
        if (action === "provider_created" && options.providerPersistFails) return { data: null, error: { message: "lost DB response" } };
        if (action === "delete_pending" && candidate.provider_cleanup_state === "create_unknown") {
          return { data: null, error: { message: "provider ID not recorded" } };
        }
        if (action === "provider_created") { candidate.provider_candidate_voice_id = String(args.p_provider_voice_id); candidate.provider_cleanup_state = "present"; }
        if (action === "delete_pending") candidate.provider_cleanup_state = "delete_pending";
        if (action === "delete_failed") { candidate.provider_cleanup_state = "delete_failed"; candidate.status = "failed"; }
        if (action === "create_unknown") candidate.status = "failed";
        if (action === "provider_absent") {
          candidate.provider_candidate_voice_id = null; candidate.provider_cleanup_state = "verified_absent";
          candidate.status = candidate.candidate_script_audio_id ? "ready" : "failed";
        }
        if (action === "provider_absent_unrecorded") {
          candidate.provider_cleanup_state = "verified_absent"; candidate.status = "failed";
        }
        if (action === "adopt") candidate.status = "adopted";
        if (action === "rollback") { candidate.status = "rolled_back"; candidate.asset_cleanup_state = "pending"; }
        if (action === "asset_cleanup_failed") candidate.asset_cleanup_state = "failed";
        return { data: { ...candidate }, error: null };
      }
      if (name === "reserve_script_brush_up_asset") {
        candidate.candidate_storage_object_key = String(args.p_object_key);
        candidate.asset_cleanup_state = "pending";
        return { data: { ...candidate }, error: null };
      }
      if (name === "finalize_script_brush_up_audio") {
        candidate.candidate_script_audio_id = CANDIDATE_AUDIO;
        candidate.asset_cleanup_state = "not_needed";
        candidate.status = "audio_staged";
        return { data: { ...candidate }, error: null };
      }
      if (name === "finish_script_brush_up_asset_cleanup") {
        candidate.asset_cleanup_state = "complete";
        candidate.candidate_storage_object_key = null;
        return { data: { ...candidate }, error: null };
      }
      return { data: null, error: { message: "unexpected RPC" } };
    })
  };
  const provider = {
    createVoice: vi.fn(async () => ({ providerVoiceId: "tempVoice123" })),
    synthesize: vi.fn(async () => {
      if (options.synthesizeFails) throw new Error("tts failed");
      return { providerRequestId: "request-1", audioSource: { kind: "inline-bytes", bytesBase64: "YQ==", contentType: "audio/mpeg" } };
    })
  };
  const deletion = {
    deleteVoice: vi.fn(async () => ({ kind: options.deleteFails ? "provider_unavailable" : "deleted" })),
    reconcileVoiceAbsence: vi.fn(async () => ({ kind: options.deleteFails ? "present" : "verified_absent" }))
  };
  const quota = {
    reservationId: "quota-1", acknowledgeAtomicProviderStart: vi.fn(),
    startProvider: vi.fn(), consume: vi.fn(async () => undefined),
    failAfterProviderStart: vi.fn(async () => undefined), releaseIfUnreached: vi.fn(async () => undefined)
  };
  mocks.reserveBetaQuota.mockResolvedValue(quota);
  mocks.stageScriptAudioForReplay.mockImplementation(async () => {
    if (options.storageFails) throw new Error("storage failed");
    return { storagePath: "/api/script-audio/90000000-0000-4000-8000-000000000002",
      storedAsset: { storageBucket: "script-audios", storageObjectKey: candidate.candidate_storage_object_key,
        contentType: "audio/mpeg", byteLength: 1 } };
  });
  mocks.createSupabaseAdminClient.mockReturnValue(admin);
  return { client, admin, storage, candidate, provider, deletion, quota };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NATIVE_MINUTE_ENABLE_SCRIPT_BRUSH_UP = "1";
  mocks.getScript.mockResolvedValue({ id: SCRIPT, currentRevisionId: REVISION, practiceEpoch: 1,
    archivedAt: null, content: "A calm one minute practice script.", locale: "en-US" });
  mocks.getOwnedTakeAudioIdentity.mockResolvedValue(IDENTITY);
  mocks.loadOwnedTakeAudio.mockResolvedValue({ bytes: Buffer.from("sample"), contentType: "audio/wav",
    filename: "take.wav", audioIdentity: IDENTITY });
  mocks.getCachedListenAudio.mockResolvedValue({ audioUrl: AUDIO_PATH });
  mocks.getVoiceProviderStatus.mockReturnValue({ provider: "elevenlabs", supported: true });
  mocks.readBetaQuotaPolicy.mockReturnValue({ script_brush_up_candidate_generation: {
    perUser: 1, global: 2, periodKind: "account_lifetime"
  } });
});
afterEach(() => {
  if (previousGate === undefined) delete process.env.NATIVE_MINUTE_ENABLE_SCRIPT_BRUSH_UP;
  else process.env.NATIVE_MINUTE_ENABLE_SCRIPT_BRUSH_UP = previousGate;
});

describe("limited brush-up provider orchestration", () => {
  const input = { scriptId: SCRIPT, takeId: TAKE, revisionId: REVISION,
    consentId: CONSENT, operationId: "operation-1" };

  it("rejects legacy, changed-revision, missing recording, and missing consent before quota or provider", async () => {
    const legacy = harness({ takeRevisionId: null });
    await expect(generateScriptBrushUpCandidate(legacy.client, USER, input, {
      admin: legacy.admin as never, provider: legacy.provider as unknown as VoiceProvider,
      deletion: legacy.deletion as unknown as VoiceDeletionProviderAdapter
    })).rejects.toThrow();
    expect(legacy.provider.createVoice).not.toHaveBeenCalled();

    const changed = harness();
    mocks.getScript.mockResolvedValueOnce({ id: SCRIPT, currentRevisionId: "other", archivedAt: null });
    await expect(generateScriptBrushUpCandidate(changed.client, USER, input, {
      admin: changed.admin as never, provider: changed.provider as unknown as VoiceProvider,
      deletion: changed.deletion as unknown as VoiceDeletionProviderAdapter
    })).rejects.toThrow();
    expect(changed.provider.createVoice).not.toHaveBeenCalled();

    const missingRecording = harness();
    mocks.getOwnedTakeAudioIdentity.mockResolvedValueOnce(null);
    await expect(generateScriptBrushUpCandidate(missingRecording.client, USER, input, {
      admin: missingRecording.admin as never, provider: missingRecording.provider as unknown as VoiceProvider,
      deletion: missingRecording.deletion as unknown as VoiceDeletionProviderAdapter
    })).rejects.toThrow();
    expect(missingRecording.provider.createVoice).not.toHaveBeenCalled();

    const missingConsent = harness({ consentMissing: true });
    await expect(generateScriptBrushUpCandidate(missingConsent.client, USER, input, {
      admin: missingConsent.admin as never, provider: missingConsent.provider as unknown as VoiceProvider,
      deletion: missingConsent.deletion as unknown as VoiceDeletionProviderAdapter
    })).rejects.toThrow();
    expect(missingConsent.provider.createVoice).not.toHaveBeenCalled();
    expect(mocks.reserveBetaQuota).not.toHaveBeenCalled();
  });

  it("uses one composite quota and the exact Take bytes and revision, then verifies temporary voice absence", async () => {
    const state = harness();
    await expect(generateScriptBrushUpCandidate(state.client, USER, input, {
      admin: state.admin as never, provider: state.provider as unknown as VoiceProvider,
      deletion: state.deletion as unknown as VoiceDeletionProviderAdapter
    })).resolves.toMatchObject({ candidateId: CANDIDATE, status: "ready" });
    expect(mocks.reserveBetaQuota).toHaveBeenCalledWith(expect.objectContaining({
      kind: "script_brush_up_candidate_generation", operationId: "operation-1"
    }), expect.anything());
    expect(state.quota.acknowledgeAtomicProviderStart).toHaveBeenCalledOnce();
    expect(state.quota.startProvider).not.toHaveBeenCalled();
    expect(state.provider.createVoice).toHaveBeenCalledWith(expect.objectContaining({
      sampleAudioBytes: { bytes: Buffer.from("sample"), contentType: "audio/wav", filename: "take.wav" }
    }));
    expect(state.provider.synthesize).toHaveBeenCalledWith(expect.objectContaining({
      providerVoiceId: "tempVoice123", text: "A calm one minute practice script.", locale: "en-US"
    }));
    expect(mocks.stageScriptAudioForReplay).toHaveBeenCalledWith(expect.objectContaining({ storageClient: state.client }));
    expect(state.deletion.deleteVoice).toHaveBeenCalledOnce();
    expect(state.deletion.reconcileVoiceAbsence).toHaveBeenCalledOnce();
    expect(state.quota.consume).toHaveBeenCalledOnce();
  });

  it("deletes the temporary voice and charges the operation after TTS failure", async () => {
    const state = harness({ synthesizeFails: true });
    await expect(generateScriptBrushUpCandidate(state.client, USER, input, {
      admin: state.admin as never, provider: state.provider as unknown as VoiceProvider,
      deletion: state.deletion as unknown as VoiceDeletionProviderAdapter
    })).rejects.toThrow("tts failed");
    expect(state.deletion.reconcileVoiceAbsence).toHaveBeenCalledOnce();
    expect(state.candidate.provider_cleanup_state).toBe("verified_absent");
    expect(state.candidate.status).toBe("failed");
    expect(state.quota.failAfterProviderStart).toHaveBeenCalledOnce();
  });

  it("removes the reserved app asset after Storage failure", async () => {
    const state = harness({ storageFails: true });
    await expect(generateScriptBrushUpCandidate(state.client, USER, input, {
      admin: state.admin as never, provider: state.provider as unknown as VoiceProvider,
      deletion: state.deletion as unknown as VoiceDeletionProviderAdapter
    })).rejects.toThrow("storage failed");
    expect(state.storage.deleteObject).toHaveBeenCalledOnce();
    expect(state.storage.verifyObjectAbsence).toHaveBeenCalledOnce();
    expect(state.candidate.asset_cleanup_state).toBe("complete");
    expect(state.quota.failAfterProviderStart).toHaveBeenCalledOnce();
  });

  it("keeps a failed DELETE unresolved and blocks candidate reuse", async () => {
    const state = harness({ deleteFails: true });
    await expect(generateScriptBrushUpCandidate(state.client, USER, input, {
      admin: state.admin as never, provider: state.provider as unknown as VoiceProvider,
      deletion: state.deletion as unknown as VoiceDeletionProviderAdapter
    })).rejects.toThrow("一時voiceの削除を確認できませんでした");
    expect(state.candidate.provider_cleanup_state).toBe("delete_failed");
    expect(state.candidate.provider_candidate_voice_id).toBe("tempVoice123");
    expect(state.quota.failAfterProviderStart).toHaveBeenCalledOnce();
  });

  it("attempts remote deletion when persisting the created provider ID fails", async () => {
    const state = harness({ providerPersistFails: true });
    await expect(generateScriptBrushUpCandidate(state.client, USER, input, {
      admin: state.admin as never, provider: state.provider as unknown as VoiceProvider,
      deletion: state.deletion as unknown as VoiceDeletionProviderAdapter
    })).rejects.toThrow("お手本候補の状態を保存できませんでした");
    expect(state.deletion.deleteVoice).toHaveBeenCalledWith({ providerResourceId: "tempVoice123" });
    expect(state.deletion.reconcileVoiceAbsence).toHaveBeenCalledOnce();
    expect(state.candidate.provider_cleanup_state).toBe("verified_absent");
    expect(state.quota.failAfterProviderStart).toHaveBeenCalledOnce();
  });

  it("keeps uncertain Storage absence blocking after a failed upload", async () => {
    const state = harness({ storageFails: true, absenceUncertain: true });
    await expect(generateScriptBrushUpCandidate(state.client, USER, input, {
      admin: state.admin as never, provider: state.provider as unknown as VoiceProvider,
      deletion: state.deletion as unknown as VoiceDeletionProviderAdapter
    })).rejects.toThrow("storage failed");
    expect(state.storage.verifyObjectAbsence).toHaveBeenCalledOnce();
    expect(state.candidate.asset_cleanup_state).toBe("failed");
  });

  it("reads A/B without provider or quota work and rolls adoption back without synthesis", async () => {
    const state = harness();
    state.candidate.status = "ready";
    state.candidate.provider_cleanup_state = "verified_absent";
    state.candidate.candidate_script_audio_id = CANDIDATE_AUDIO;
    state.candidate.candidate_storage_object_key = `${USER}/${SCRIPT}/${CANDIDATE}/${CANDIDATE}.mp3`;
    const view = await getScriptBrushUpView(state.client, USER, SCRIPT, TAKE);
    expect(view).toMatchObject({ status: "ready", cleanupPending: false });
    expect(mocks.reserveBetaQuota).not.toHaveBeenCalled();
    expect(state.provider.synthesize).not.toHaveBeenCalled();
    await expect(decideScriptBrushUpCandidate(state.client, USER, CANDIDATE, "adopt"))
      .resolves.toMatchObject({ status: "adopted" });
    await expect(decideScriptBrushUpCandidate(state.client, USER, CANDIDATE, "rollback"))
      .resolves.toMatchObject({ status: "rolled_back" });
    expect(state.storage.verifyObjectAbsence).toHaveBeenCalledOnce();
    expect(mocks.reserveBetaQuota).not.toHaveBeenCalled();
    expect(state.provider.synthesize).not.toHaveBeenCalled();
  });

  it("keeps an unknown provider outcome manual and advances known account deletion cleanup one action at a time", async () => {
    const state = harness();
    expect(await advanceAccountDeletionBrushUpProviderCleanup(USER, {
      admin: state.admin as never, deletion: state.deletion as unknown as VoiceDeletionProviderAdapter
    })).toEqual({ kind: "manual_required", externalActions: 0 });
    expect(state.deletion.deleteVoice).not.toHaveBeenCalled();

    state.candidate.provider_cleanup_state = "present";
    state.candidate.provider_candidate_voice_id = "tempVoice123";
    expect(await advanceAccountDeletionBrushUpProviderCleanup(USER, {
      admin: state.admin as never, deletion: state.deletion as unknown as VoiceDeletionProviderAdapter
    })).toEqual({ kind: "progressed", externalActions: 1 });
    expect(state.candidate.provider_cleanup_state).toBe("delete_pending");
    expect(state.deletion.deleteVoice).toHaveBeenCalledOnce();
    expect(state.deletion.reconcileVoiceAbsence).not.toHaveBeenCalled();

    expect(await advanceAccountDeletionBrushUpProviderCleanup(USER, {
      admin: state.admin as never, deletion: state.deletion as unknown as VoiceDeletionProviderAdapter
    })).toEqual({ kind: "progressed", externalActions: 1 });
    expect(state.candidate.provider_cleanup_state).toBe("verified_absent");
    expect(state.candidate.provider_candidate_voice_id).toBeNull();
    expect(state.deletion.reconcileVoiceAbsence).toHaveBeenCalledOnce();
  });
});
