import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({
  rpc: vi.fn(), providerConsent: vi.fn(), providerVoice: vi.fn(), resolveRecording: vi.fn(),
  resolveSample: vi.fn(), accept: vi.fn(), processing: vi.fn(), events: [] as string[]
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ rpc: f.rpc }) }));
vi.mock("@/lib/supabase/config", () => ({ getSupabaseServiceRoleKey: () => "fake", hasSupabaseConfig: () => true }));
vi.mock("@/providers/voice", () => ({
  getVoiceProviderName: () => "mock",
  getVoiceProviderStatus: () => ({ supported: true, provider: "mock", requirements: {} }),
  createConfiguredVoiceProvider: () => ({ createConsent: f.providerConsent, createVoice: f.providerVoice })
}));
vi.mock("@/services/storage", () => ({
  resolveOwnedVoiceConsentRecordingInput: f.resolveRecording, resolveOwnedVoiceSampleInput: f.resolveSample,
  parseVoiceSampleAudioReference: (input: { audioPath: string }) => input.audioPath.startsWith("storage://voice-samples/") ? "owned" : null
}));
vi.mock("@/services/consent", () => ({
  acceptCurrentProcessingConsent: f.accept, assertCurrentProcessingConsent: f.processing, getCurrentProcessingConsent: vi.fn()
}));
import { createVoiceConsent, createUserVoice } from "@/services/voice/voice.service";
const user = "10000000-0000-4000-8000-000000000001";
const consent = "20000000-0000-4000-8000-000000000001";
const recording = { audioPath: `storage://voice-consents/${user}/r.wav`, contentType: "audio/wav", byteLength: 100 };
const sample = { audioPath: `storage://voice-samples/${user}/${consent}/s.wav` };
function client() {
  const query = { eq: () => query, maybeSingle: async () => ({ data: { id: consent, user_id: user, provider: "mock", metadata: { recording } }, error: null }) };
  return { auth: { getUser: async () => ({ data: { user: { id: user } }, error: null }) }, from: () => ({ select: () => query }) } as never;
}
beforeEach(() => {
  vi.resetAllMocks(); f.events.length = 0;
  f.rpc.mockImplementation(async (name, args) => {
    f.events.push(name);
    if (name === "reserve_voice_source_registration") return { data: { id: "operation", status: "reserved", lease_token: args.p_lease_token }, error: null };
    if (name === "begin_voice_source_registration" || name === "finish_voice_consent_source_read") return { data: true, error: null };
    if (name === "finalize_voice_consent_write_intent") return { data: { id: consent }, error: null };
    if (name === "finalize_voice_create_write_intent") return { data: { id: "voice" }, error: null };
    throw new Error("unexpected RPC");
  });
  f.resolveRecording.mockImplementation(async () => { f.events.push("audio-read"); return recording; });
  f.resolveSample.mockImplementation(async (_c, _u, _consent, input) => input);
  f.providerConsent.mockImplementation(async () => { f.events.push("consent-provider"); return { consentedAt: "2026-09-15T00:00:00Z", providerConsentId: "provider-evidence" }; });
  f.providerVoice.mockImplementation(async () => { f.events.push("voice-provider-read-dispatch"); return { providerVoiceId: "provider-voice" }; });
});
describe("R1 registration service boundaries", () => {
  it("consent reserves immutable context and begins before resolver audio read", async () => {
    await createVoiceConsent(client(), user, { accepted: true, recording, name: "Test", language: "en" });
    expect(f.events).toEqual(["reserve_voice_source_registration", "begin_voice_source_registration", "audio-read", "finish_voice_consent_source_read", "consent-provider", "finalize_voice_consent_write_intent"]);
    expect(f.rpc.mock.calls[0][1]).toMatchObject({ p_user_id: user, p_kind: "voice_consent_create", p_provider: "mock", p_recording_path: recording.audioPath, p_sample_path: null });
    expect(f.rpc.mock.calls[0][1].p_consent_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(f.rpc.mock.calls[3][1].p_metadata).toMatchObject({ recording, providerConsentId: "provider-evidence", termsAcceptedAt: expect.any(String) });
    expect(f.accept).toHaveBeenCalledWith(expect.anything(), user, "voice_cloning");
  });
  it("consent without a recording keeps the normal Provider flow", async () => {
    f.resolveRecording.mockResolvedValue(null);
    await createVoiceConsent(client(), user, { accepted: true });
    expect(f.rpc.mock.calls[0][1].p_recording_path).toBeNull();
    expect(f.rpc.mock.calls[2][1].p_read_succeeded).toBe(true);
    expect(f.providerConsent).toHaveBeenCalledTimes(1);
    expect(f.providerConsent.mock.calls[0][0].recording).toBeUndefined();
  });
  it.each(["source_reupload_required", "malformed_canonical_state", "unsafe_locator_or_ownership", "account_deletion_active"])("%s rejects before consent read and dispatch", async message => {
    f.rpc.mockResolvedValue({ data: null, error: { message } });
    await expect(createVoiceConsent(client(), user, { accepted: true, recording })).rejects.toMatchObject({ status: 409 });
    expect(f.resolveRecording).not.toHaveBeenCalled(); expect(f.providerConsent).not.toHaveBeenCalled();
  });
  it("stale consent process cannot read after a failed begin CAS", async () => {
    f.rpc.mockImplementation(async name => ({ data: name === "reserve_voice_source_registration" ? { id: "x", status: "reserved", lease_token: "bad" } : false, error: null }));
    await expect(createVoiceConsent(client(), user, { accepted: true, recording })).rejects.toThrow();
    expect(f.resolveRecording).not.toHaveBeenCalled();
  });
  it("ambiguous Provider consent failure never claims terminal success/cancellation", async () => {
    f.providerConsent.mockRejectedValue(new Error("ambiguous"));
    await expect(createVoiceConsent(client(), user, { accepted: true, recording })).rejects.toThrow("ambiguous");
    expect(f.rpc).toHaveBeenCalledTimes(3); expect(f.accept).not.toHaveBeenCalled();
  });
  it("consent finalizer failure does not accept processing evidence prematurely", async () => {
    f.rpc.mockImplementationOnce(async (_name, args) => ({ data: { id: "op", status: "reserved", lease_token: args.p_lease_token }, error: null }))
      .mockImplementationOnce(async () => ({ data: true, error: null }))
      .mockImplementationOnce(async () => ({ data: true, error: null }))
      .mockImplementationOnce(async () => ({ data: null, error: { message: "lost" } }));
    await expect(createVoiceConsent(client(), user, { accepted: true, recording })).rejects.toThrow();
    expect(f.accept).not.toHaveBeenCalled();
  });
  it("settled consent read failure terminalizes before any Provider dispatch", async () => {
    f.resolveRecording.mockRejectedValue(new Error("storage-read-failed"));
    await expect(createVoiceConsent(client(), user, { accepted: true, recording })).rejects.toThrow("storage-read-failed");
    expect(f.rpc.mock.calls.map(([name]) => name)).toEqual([
      "reserve_voice_source_registration", "begin_voice_source_registration", "finish_voice_consent_source_read"
    ]);
    expect(f.rpc.mock.calls[2][1]).toMatchObject({ p_user_id: user, p_intent_id: "operation", p_read_succeeded: false });
    expect(f.providerConsent).not.toHaveBeenCalled(); expect(f.accept).not.toHaveBeenCalled();
  });
  it("pending read never reports completion or calls Provider", async () => {
    let rejectRead!: (error: Error) => void;
    let started!: () => void;
    const readStarted = new Promise<void>(resolve => { started = resolve; });
    f.resolveRecording.mockImplementation(() => { started(); return new Promise((_resolve, reject) => { rejectRead = reject; }); });
    const result = createVoiceConsent(client(), user, { accepted: true, recording });
    const rejected = expect(result).rejects.toThrow("settled");
    await readStarted;
    expect(f.rpc).toHaveBeenCalledTimes(2); expect(f.providerConsent).not.toHaveBeenCalled();
    rejectRead(new Error("settled"));
    await rejected;
    expect(f.rpc.mock.calls[2][1].p_read_succeeded).toBe(false);
  });
  it.each([false, "lost-response"])("dispatch boundary rejection %s never attempts failure terminalization", async outcome => {
    const rpc = f.rpc.getMockImplementation()!;
    f.rpc.mockImplementation(async (name, args) => name === "finish_voice_consent_source_read"
      ? { data: outcome === false ? false : null, error: outcome === false ? null : { message: "lost" } }
      : rpc(name, args));
    await expect(createVoiceConsent(client(), user, { accepted: true, recording })).rejects.toMatchObject({ status: 409 });
    expect(f.rpc.mock.calls.filter(([name]) => name === "finish_voice_consent_source_read")).toHaveLength(1);
    expect(f.rpc.mock.calls[2][1].p_read_succeeded).toBe(true);
    expect(f.providerConsent).not.toHaveBeenCalled();
  });
  it("failed read terminalization CAS does not claim cancellation or call Provider", async () => {
    const rpc = f.rpc.getMockImplementation()!;
    f.rpc.mockImplementation(async (name, args) => name === "finish_voice_consent_source_read" ? { data: false, error: null } : rpc(name, args));
    f.resolveRecording.mockRejectedValue(new Error("storage-read-failed"));
    await expect(createVoiceConsent(client(), user, { accepted: true, recording })).rejects.toMatchObject({ status: 409 });
    expect(f.providerConsent).not.toHaveBeenCalled();
  });
  it("voice reserves source use and begins before Provider sample read", async () => {
    await createUserVoice(client(), user, { consentId: consent, label: "Voice", sampleAudio: sample });
    expect(f.events).toEqual(["reserve_voice_source_registration", "begin_voice_source_registration", "voice-provider-read-dispatch", "finalize_voice_create_write_intent"]);
    expect(f.rpc.mock.calls[0][1]).toMatchObject({ p_sample_path: sample.audioPath, p_recording_path: null, p_consent_id: consent });
  });
  it("new voice after due cannot dispatch Provider", async () => {
    f.rpc.mockResolvedValue({ data: null, error: { message: "source_reupload_required" } });
    await expect(createUserVoice(client(), user, { consentId: consent, label: "Voice", sampleAudio: sample })).rejects.toMatchObject({ status: 409 });
    expect(f.providerVoice).not.toHaveBeenCalled();
  });
  it("Provider voice failure remains unresolved without automatic new retry", async () => {
    f.providerVoice.mockRejectedValue(new Error("ambiguous"));
    await expect(createUserVoice(client(), user, { consentId: consent, label: "Voice", sampleAudio: sample })).rejects.toThrow("ambiguous");
    expect(f.rpc).toHaveBeenCalledTimes(2);
  });
  it("app-owned legacy fallback goes through identical source admission", async () => {
    await createUserVoice(client(), user, { consentId: consent, label: "Voice", sampleAudioPath: sample.audioPath });
    expect(f.rpc.mock.calls[0][1].p_sample_path).toBe(sample.audioPath);
  });
  it("raw legacy path cannot bypass source authority even with mock", async () => {
    await expect(createUserVoice(client(), user, { consentId: consent, label: "Voice", sampleAudioPath: "raw-provider-locator" })).rejects.toMatchObject({ status: 400 });
    expect(f.providerVoice).not.toHaveBeenCalled(); expect(f.rpc).not.toHaveBeenCalled();
  });
});
