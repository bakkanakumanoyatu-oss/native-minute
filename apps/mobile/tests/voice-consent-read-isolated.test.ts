import { beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
const f = vi.hoisted(() => ({ rpc: vi.fn(), provider: vi.fn(), accept: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ rpc: f.rpc }) }));
vi.mock("@/lib/supabase/config", () => ({ getSupabaseServiceRoleKey: () => "fixture", hasSupabaseConfig: () => true }));
vi.mock("@/providers/voice", () => ({
  getVoiceProviderStatus: () => ({ supported: true, provider: "mock", requirements: {} }),
  createConfiguredVoiceProvider: () => ({ createConsent: f.provider })
}));
vi.mock("@/services/consent", () => ({ acceptCurrentProcessingConsent: f.accept }));
import { createVoiceConsent } from "@/services/voice/voice.service";
import { createVoiceSourceCleanupRepository } from "@/services/voice/voice-source-cleanup.repository";
import { runVoiceSourceCleanup } from "@/services/voice/voice-source-cleanup.service";

// Only the network-none disposable runner supplies this name. No env-file reads.
const container = process.env.R1_READ_TEST_CONTAINER;
const literal = (value: unknown): string => value == null ? "null" : typeof value === "boolean" ? String(value)
  : `'${(typeof value === "object" ? JSON.stringify(value) : String(value)).replace(/'/g, "''")}'`;
function sql(statement: string) {
  expect(container).toMatch(/^native-minute-r1-proof-[0-9a-f]{10}$/);
  return execFileSync("docker", ["exec", "-i", container!, "psql", "-X", "-At", "-U", "postgres", "-v", "ON_ERROR_STOP=1"],
    { input: statement, encoding: "utf8", timeout: 20000, stdio: ["pipe", "pipe", "pipe"] }).trim();
}
const allowed = new Set([
  "reserve_voice_source_registration", "begin_voice_source_registration", "finish_voice_consent_source_read",
  "finalize_voice_consent_write_intent", "select_voice_source_cleanup", "claim_voice_source_cleanup",
  "check_voice_source_cleanup", "finish_voice_source_cleanup"
]);
async function rpc(name: string, args: Record<string, unknown>) {
  expect(allowed.has(name)).toBe(true);
  try {
    return { data: JSON.parse(sql(`select to_jsonb(public.${name}(${Object.entries(args).map(([key, value]) => `${key}=>${literal(value)}`).join(",")}))`)), error: null };
  } catch (error) {
    const message = error && typeof error === "object" && "stderr" in error ? String(error.stderr) : "isolated RPC rejected";
    return { data: null, error: { message } };
  }
}
let sequence = 60;
let fixture: { u: string; r: string; s: string; t: string };
function source() { return JSON.parse(sql(`select to_jsonb(i) from public.voice_asset_write_intents i where id=${literal(fixture.r)}`)); }
function operation() { return JSON.parse(sql(`select to_jsonb(i) from public.voice_asset_write_intents i where user_id=${literal(fixture.u)} and kind='voice_consent_create' order by created_at desc limit 1`)); }
function claim() { return sql(`select public.claim_voice_source_cleanup(${literal(fixture.r)},${literal(fixture.t)})->>'reason'`); }
function finish(op: ReturnType<typeof operation>, succeeded: boolean, token = op.lease_token, owner = fixture.u) {
  return sql(`select public.finish_voice_consent_source_read(${literal(op.id)},${literal(owner)},${literal(token)},${succeeded})`);
}
function client(download: ReturnType<typeof vi.fn>) {
  return { auth: { getUser: async () => ({ data: { user: { id: fixture.u } }, error: null }) }, storage: { from: () => ({ download }) } } as never;
}
function input() { return { accepted: true, recording: { audioPath: `storage://voice-consents/${fixture.u}/consent.wav` } }; }
function age() { sql(`select r1_test.age_source(${literal(fixture.r)},interval '25 hours')`); }
const goodRead = () => ({ data: new Blob(["fixture"], { type: "audio/wav" }), error: null });
const failedRead = () => ({ data: null, error: { message: "fixture download failed" } });
function pendingRead() {
  let settle!: (value: ReturnType<typeof failedRead>) => void;
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const download = vi.fn(() => { started(); return new Promise(resolve => { settle = resolve; }); });
  return { ready, download, fail: () => settle(failedRead()) };
}

describe.skipIf(!container)("R1-P1-01 actual consent service + repository + isolated SQL", () => {
  beforeEach(() => {
    const state = JSON.parse(execFileSync("docker", ["inspect", container!], { encoding: "utf8" }))[0];
    expect(state.HostConfig.NetworkMode).toBe("none");
    expect(Object.keys(state.HostConfig.PortBindings ?? {})).toHaveLength(0);
    vi.resetAllMocks();
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("external fetch forbidden"); }));
    f.rpc.mockImplementation(rpc);
    f.provider.mockResolvedValue({ consentedAt: new Date().toISOString(), providerConsentId: "fake-consent" });
    sql(`select r1_test.seed(${sequence})`);
    fixture = JSON.parse(sql(`select to_jsonb(f) from r1_test.fixture f where n=${sequence++}`));
  });

  it("exact P1: GET fails, Provider=0, terminal use, unchanged clock, new admission before due", async () => {
    const before = source();
    const download = vi.fn(async () => failedRead());
    await expect(createVoiceConsent(client(download), fixture.u, input())).rejects.toMatchObject({ status: 500 });
    const op = operation();
    expect(op).toMatchObject({ status: "cancelled", lease_token: null, registration_dispatched_at: null });
    expect(op.registration_source_read_started_at).not.toBeNull();
    expect(source()).toEqual(before);
    expect(f.provider).not.toHaveBeenCalled();
    expect(f.accept).not.toHaveBeenCalled();
    expect(claim()).toBe("not_due");
    await expect(createVoiceConsent(client(download), fixture.u, input())).rejects.toMatchObject({ status: 500 });
    expect(operation().id).not.toBe(op.id);
    expect(download).toHaveBeenCalledTimes(2);
    expect(source()).toEqual(before);
    expect(f.provider).not.toHaveBeenCalled();
  });

  it("due crosses during read: failure cancels without cleanup authority; next routine collects", async () => {
    const read = pendingRead();
    const outcome = expect(createVoiceConsent(client(read.download), fixture.u, input())).rejects.toMatchObject({ status: 500 });
    await read.ready;
    const op = operation();
    expect(op.registration_dispatched_at).toBeNull();
    age();
    const before = source();
    expect(claim()).toBe("in_flight_use");
    read.fail(); await outcome;
    expect(source()).toEqual(before);
    expect(operation().status).toBe("cancelled");
    expect(f.provider).not.toHaveBeenCalled();
    const noRead = vi.fn();
    await expect(createVoiceConsent(client(noRead), fixture.u, input())).rejects.toMatchObject({ status: 409 });
    expect(noRead).not.toHaveBeenCalled();
    let present = true;
    const remove = vi.fn(async () => { present = false; return { kind: "request_succeeded" as const }; });
    const hex = (BigInt(`0x${fixture.r.replace(/-/g, "")}`) - 1n).toString(16).padStart(32, "0");
    const afterId = `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
    const result = await runVoiceSourceCleanup({ mode: "execute", afterId }, {
      env: { NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE: "1" },
      repository: createVoiceSourceCleanupRepository({ rpc } as never),
      storage: {
        listOwnedInventory: async () => { throw new Error("no inventory"); },
        verifyObjectAbsence: async () => ({ kind: present ? "present" : "absent" }), deleteObject: remove
      }
    });
    expect(result.safeReasonCode).toBe("cleanup_succeeded"); expect(remove).toHaveBeenCalledTimes(1);
    expect(source()).toMatchObject({ first_registered_at: before.first_registered_at, first_registration_intent_id: before.first_registration_intent_id, cleanup_due_at: before.cleanup_due_at, cleanup_state: "completed" });
    expect(finish(op, false)).toBe("f");
  });

  it("successful read establishes durable dispatch boundary and preserves normal Provider flow", async () => {
    const before = source();
    f.provider.mockImplementation(async () => {
      expect(operation().registration_dispatched_at).not.toBeNull();
      age(); expect(claim()).toBe("in_flight_use");
      return { consentedAt: new Date().toISOString(), providerConsentId: "fake-consent" };
    });
    const download = vi.fn(async () => { expect(operation().registration_dispatched_at).toBeNull(); return goodRead(); });
    await createVoiceConsent(client(download), fixture.u, input());
    expect(f.provider).toHaveBeenCalledTimes(1); expect(f.accept).toHaveBeenCalledTimes(1);
    expect(operation().status).toBe("completed"); expect(claim()).toBe("claimed");
    expect(source().first_registration_intent_id).toBe(before.first_registration_intent_id);
  });

  it("ambiguous Provider failure cannot be terminalized after dispatch", async () => {
    const before = source();
    f.provider.mockRejectedValue(new Error("ambiguous Provider"));
    await expect(createVoiceConsent(client(vi.fn(async () => goodRead())), fixture.u, input())).rejects.toThrow("ambiguous Provider");
    const op = operation();
    expect(op.status).toBe("reserved"); expect(op.registration_dispatched_at).not.toBeNull();
    expect(finish(op, false)).toBe("f"); expect(finish(op, true)).toBe("f");
    expect(operation()).toEqual(op); expect(source()).toEqual(before);
    age(); expect(claim()).toBe("in_flight_use");
  });

  it("lost dispatch CAS response remains unresolved even with Provider call zero", async () => {
    f.rpc.mockImplementation(async (name, args) => {
      const result = await rpc(name, args);
      return name === "finish_voice_consent_source_read" && args.p_read_succeeded
        ? { data: null, error: { message: "lost response after commit" } } : result;
    });
    await expect(createVoiceConsent(client(vi.fn(async () => goodRead())), fixture.u, input())).rejects.toMatchObject({ status: 409 });
    const op = operation();
    expect(op.registration_dispatched_at).not.toBeNull();
    expect(finish(op, false)).toBe("f"); expect(operation()).toEqual(op);
    age(); expect(claim()).toBe("in_flight_use"); expect(f.provider).not.toHaveBeenCalled();
  });

  it("lease expiry alone never terminalizes; only the original settled reader may report failure", async () => {
    const read = pendingRead();
    const outcome = expect(createVoiceConsent(client(read.download), fixture.u, input())).rejects.toMatchObject({ status: 500 });
    await read.ready;
    const op = operation();
    sql(`update public.voice_asset_write_intents set lease_expires_at=clock_timestamp()-interval '1 second' where id=${literal(op.id)}`);
    age(); const before = source();
    expect(claim()).toBe("in_flight_use"); expect(operation().status).toBe("reserved");
    expect(finish(op, false, fixture.t)).toBe("f");
    expect(finish(op, false, op.lease_token, "00000000-0000-4000-8000-000000000000")).toBe("f");
    sql(`select r1_test.reject(${literal(`select public.cancel_voice_asset_write_intent(${literal(op.id)},${literal(fixture.u)},${literal(op.lease_token)},true)`)},'registration_execution_unresolved')`);
    read.fail(); await outcome;
    expect(operation().status).toBe("cancelled"); expect(source()).toEqual(before);
    expect(claim()).toBe("claimed"); expect(f.provider).not.toHaveBeenCalled();
  });

  it("manual_required is not cleared by a settled read failure", async () => {
    const read = pendingRead();
    const outcome = expect(createVoiceConsent(client(read.download), fixture.u, input())).rejects.toMatchObject({ status: 409 });
    await read.ready;
    const op = operation();
    sql(`update public.voice_asset_write_intents set status='manual_required',lease_token=null,lease_expires_at=null where id=${literal(op.id)}`);
    age(); const before = source();
    read.fail(); await outcome;
    expect(operation().status).toBe("manual_required"); expect(source()).toEqual(before);
    expect(claim()).toBe("in_flight_use"); expect(f.provider).not.toHaveBeenCalled();
  });

  it("client roles cannot invoke read completion or mutate its authority", () => {
    expect(sql("select has_function_privilege('authenticated','public.finish_voice_consent_source_read(uuid,uuid,uuid,boolean)','execute')")).toBe("f");
    expect(sql("select has_function_privilege('anon','public.finish_voice_consent_source_read(uuid,uuid,uuid,boolean)','execute')")).toBe("f");
    expect(sql("select has_function_privilege('service_role','public.finish_voice_consent_source_read(uuid,uuid,uuid,boolean)','execute')")).toBe("t");
  });
});
