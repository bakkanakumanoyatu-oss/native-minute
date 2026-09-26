import { describe, expect, it, vi } from "vitest";
import { readBetaQuotaPolicy, type BetaQuotaPolicy } from "@/services/quota/beta-quota-policy";
import { BetaQuotaError, reserveBetaQuota } from "@/services/quota/beta-quota.service";

const policy: BetaQuotaPolicy = {
  reference_audio_generation: { perUser: 2, global: 4, periodKind: "calendar_month_utc" },
  pronunciation_evaluation: { perUser: 3, global: 5, periodKind: "account_lifetime" },
  voice_creation: { perUser: 1, global: 2, periodKind: "account_lifetime" }
};
const input = { userId: "10000000-0000-4000-8000-000000000001", kind: "voice_creation" as const, operationId: "20000000-0000-4000-8000-000000000001" };

function client(reserveResult: Record<string, unknown>) {
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => name === "reserve_beta_provider_quota"
    ? { data: reserveResult, error: null }
    : { data: name === "begin_voice_registration_with_beta_quota" ? true : args.p_transition, error: null });
  return { rpc, client: { rpc } };
}

describe("beta quota server policy and provider lifecycle", () => {
  it("requires a separate fourth bucket only when brush-up is enabled", async () => {
    const core = {
      NATIVE_MINUTE_ENABLE_BETA_QUOTA_ENFORCEMENT: "1",
      NATIVE_MINUTE_QUOTA_REFERENCE_AUDIO_PER_USER_LIMIT: "2",
      NATIVE_MINUTE_QUOTA_REFERENCE_AUDIO_GLOBAL_LIMIT: "4",
      NATIVE_MINUTE_QUOTA_REFERENCE_AUDIO_PERIOD: "calendar_month_utc",
      NATIVE_MINUTE_QUOTA_EVALUATION_PER_USER_LIMIT: "3",
      NATIVE_MINUTE_QUOTA_EVALUATION_GLOBAL_LIMIT: "5",
      NATIVE_MINUTE_QUOTA_EVALUATION_PERIOD: "account_lifetime",
      NATIVE_MINUTE_QUOTA_VOICE_CREATION_PER_USER_LIMIT: "1",
      NATIVE_MINUTE_QUOTA_VOICE_CREATION_GLOBAL_LIMIT: "2",
      NATIVE_MINUTE_QUOTA_VOICE_CREATION_PERIOD: "account_lifetime"
    };
    expect(readBetaQuotaPolicy(core)).toEqual(policy);
    expect(() => readBetaQuotaPolicy({ ...core, NATIVE_MINUTE_ENABLE_SCRIPT_BRUSH_UP: "1" })).toThrow();
    const withBrush = readBetaQuotaPolicy({ ...core, NATIVE_MINUTE_ENABLE_SCRIPT_BRUSH_UP: "1",
      NATIVE_MINUTE_QUOTA_BRUSH_UP_PER_USER_LIMIT: "1",
      NATIVE_MINUTE_QUOTA_BRUSH_UP_GLOBAL_LIMIT: "2",
      NATIVE_MINUTE_QUOTA_BRUSH_UP_PERIOD: "account_lifetime" });
    expect(withBrush?.script_brush_up_candidate_generation).toEqual({ perUser: 1, global: 2, periodKind: "account_lifetime" });
    const fake = client({ result: "reserved", reservation_id: "brush-1", status: "reserved", period_id: "account_lifetime" });
    const reservation = await reserveBetaQuota({ ...input, kind: "script_brush_up_candidate_generation" },
      { policy: withBrush, client: fake.client });
    reservation.acknowledgeAtomicProviderStart();
    await reservation.consume();
    expect(fake.rpc.mock.calls.map(([name, args]) => name === "transition_beta_provider_quota" ? args.p_transition : name))
      .toEqual(["reserve_beta_provider_quota", "consumed"]);
  });

  it("requires all six limits and three explicit periods only when enabled", () => {
    expect(readBetaQuotaPolicy({ NATIVE_MINUTE_ENABLE_BETA_QUOTA_ENFORCEMENT: "0" })).toBeNull();
    expect(() => readBetaQuotaPolicy({ NATIVE_MINUTE_ENABLE_BETA_QUOTA_ENFORCEMENT: "1" })).toThrow();
    expect(readBetaQuotaPolicy({
      NATIVE_MINUTE_ENABLE_BETA_QUOTA_ENFORCEMENT: "1",
      NATIVE_MINUTE_QUOTA_REFERENCE_AUDIO_PER_USER_LIMIT: "2",
      NATIVE_MINUTE_QUOTA_REFERENCE_AUDIO_GLOBAL_LIMIT: "4",
      NATIVE_MINUTE_QUOTA_REFERENCE_AUDIO_PERIOD: "calendar_month_utc",
      NATIVE_MINUTE_QUOTA_EVALUATION_PER_USER_LIMIT: "3",
      NATIVE_MINUTE_QUOTA_EVALUATION_GLOBAL_LIMIT: "5",
      NATIVE_MINUTE_QUOTA_EVALUATION_PERIOD: "account_lifetime",
      NATIVE_MINUTE_QUOTA_VOICE_CREATION_PER_USER_LIMIT: "1",
      NATIVE_MINUTE_QUOTA_VOICE_CREATION_GLOBAL_LIMIT: "2",
      NATIVE_MINUTE_QUOTA_VOICE_CREATION_PERIOD: "account_lifetime"
    })).toEqual(policy);
  });

  it("sends server policy, releases a certain pre-provider failure, and never starts a provider", async () => {
    const fake = client({ result: "reserved", reservation_id: "r1", status: "reserved", period_id: "account_lifetime" });
    const reservation = await reserveBetaQuota(input, { policy, client: fake.client });
    expect(fake.rpc).toHaveBeenCalledWith("reserve_beta_provider_quota", expect.objectContaining({
      p_kind: "voice_creation", p_user_limit: 1, p_global_limit: 2, p_period_kind: "account_lifetime"
    }));
    await reservation.releaseIfUnreached();
    expect(fake.rpc.mock.calls.map(([name, args]) => name === "transition_beta_provider_quota" ? args.p_transition : name))
      .toEqual(["reserve_beta_provider_quota", "released"]);
  });

  it("consumes success and keeps provider-reached failures charged", async () => {
    const success = client({ result: "reserved", reservation_id: "r2", status: "reserved", period_id: "account_lifetime" });
    const successReservation = await reserveBetaQuota(input, { policy, client: success.client });
    await successReservation.startProvider();
    await successReservation.consume();
    await successReservation.releaseIfUnreached();
    expect(success.rpc.mock.calls.map(([name, args]) => name === "transition_beta_provider_quota" ? args.p_transition : name))
      .toEqual(["reserve_beta_provider_quota", "provider_started", "consumed"]);

    const failed = client({ result: "reserved", reservation_id: "r3", status: "reserved", period_id: "account_lifetime" });
    const failedReservation = await reserveBetaQuota(input, { policy, client: failed.client });
    await failedReservation.startProvider();
    await failedReservation.failAfterProviderStart();
    await failedReservation.releaseIfUnreached();
    expect(failed.rpc.mock.calls.map(([name, args]) => name === "transition_beta_provider_quota" ? args.p_transition : name))
      .toEqual(["reserve_beta_provider_quota", "provider_started", "failed_or_unknown"]);
  });

  it("admits voice registration and quota start through one DB operation", async () => {
    const fake = client({ result: "reserved", reservation_id: "r-voice", status: "reserved", period_id: "account_lifetime" });
    const reservation = await reserveBetaQuota(input, { policy, client: fake.client });
    const beginWithoutQuota = vi.fn(async () => undefined);
    await reservation.startVoiceRegistration({ intentId: "intent-1", leaseToken: "lease-1", beginWithoutQuota });
    expect(beginWithoutQuota).not.toHaveBeenCalled();
    expect(fake.rpc).toHaveBeenCalledWith("begin_voice_registration_with_beta_quota", {
      p_user_id: input.userId, p_reservation_id: "r-voice", p_intent_id: "intent-1", p_lease_token: "lease-1"
    });
    await reservation.consume();
    expect(fake.rpc).toHaveBeenCalledWith("transition_beta_provider_quota", expect.objectContaining({ p_transition: "consumed" }));
  });

  it("returns stable nonretryable limit and duplicate codes before provider dispatch", async () => {
    for (const [result, code] of [["limit_reached", "quota_limit_reached"], ["duplicate", "quota_operation_already_used"]] as const) {
      const fake = client({ result, reservation_id: "r4", status: "provider_started", period_id: "account_lifetime" });
      await expect(reserveBetaQuota(input, { policy, client: fake.client })).rejects.toMatchObject({
        code, status: 409
      } satisfies Partial<BetaQuotaError>);
      expect(fake.rpc).toHaveBeenCalledTimes(1);
    }
  });
});
