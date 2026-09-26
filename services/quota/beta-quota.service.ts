import { AppError } from "@/lib/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { BetaQuotaKind, BetaQuotaPolicy } from "./beta-quota-policy";
import { readBetaQuotaPolicy } from "./beta-quota-policy";

export const QUOTA_LIMIT_REACHED = "quota_limit_reached";
export const QUOTA_OPERATION_ALREADY_USED = "quota_operation_already_used";
export const QUOTA_OPERATION_REQUIRED = "quota_operation_required";

export class BetaQuotaError extends AppError {
  constructor(public readonly code: string, status: number, message: string) {
    super(status, message);
    this.name = "BetaQuotaError";
  }
}

type ReserveResult =
  | { result: "reserved"; reservation_id: string; status: "reserved"; period_id: string }
  | { result: "duplicate"; reservation_id: string; status: string; period_id: string }
  | { result: "limit_reached"; period_id: string };

export type BetaQuotaRpcClient = {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>;
};

export type BetaQuotaReservation = {
  reservationId: string | null;
  acknowledgeAtomicProviderStart(): void;
  startProvider(): Promise<void>;
  startVoiceRegistration(input: { intentId: string; leaseToken: string; beginWithoutQuota(): Promise<void> }): Promise<void>;
  consume(): Promise<void>;
  failAfterProviderStart(): Promise<void>;
  releaseIfUnreached(): Promise<void>;
};

const disabledReservation: BetaQuotaReservation = {
  reservationId: null,
  acknowledgeAtomicProviderStart: () => undefined,
  startProvider: async () => undefined,
  startVoiceRegistration: (input) => input.beginWithoutQuota(),
  consume: async () => undefined,
  failAfterProviderStart: async () => undefined,
  releaseIfUnreached: async () => undefined
};

export async function reserveBetaQuota(input: {
  userId: string;
  kind: BetaQuotaKind;
  operationId: string;
}, options: { policy?: BetaQuotaPolicy | null; client?: BetaQuotaRpcClient } = {}): Promise<BetaQuotaReservation> {
  const policy = options.policy === undefined ? readBetaQuotaPolicy() : options.policy;
  if (!policy) return disabledReservation;
  if (!input.operationId || input.operationId.length > 160) {
    throw new BetaQuotaError(QUOTA_OPERATION_REQUIRED, 400, "操作を確認できませんでした。もう一度開始してください。");
  }
  const client = options.client ?? createSupabaseAdminClient() as unknown as BetaQuotaRpcClient;
  const limit = policy[input.kind];
  if (!limit) throw new AppError(503, "この操作の利用上限設定を確認できません。");
  const { data, error } = await client.rpc("reserve_beta_provider_quota", {
    p_user_id: input.userId,
    p_kind: input.kind,
    p_operation_id: input.operationId,
    p_period_kind: limit.periodKind,
    p_user_limit: limit.perUser,
    p_global_limit: limit.global
  });
  if (error) {
    if (error.message.includes("account_deletion_active")) {
      throw new BetaQuotaError("account_deletion_in_progress", 409, "アカウント処理中のため、この操作を開始できません。");
    }
    if (error.message.includes("quota_operation_owner_conflict")) {
      throw new BetaQuotaError(QUOTA_OPERATION_ALREADY_USED, 409, "この操作は処理済みか確認中です。結果を確認してください。");
    }
    throw new AppError(503, "利用上限を確認できませんでした。");
  }
  const result = data as ReserveResult | null;
  if (result?.result === "limit_reached") {
    throw new BetaQuotaError(QUOTA_LIMIT_REACHED, 409, "今はこの操作の利用上限に達しています。");
  }
  if (result?.result === "duplicate") {
    throw new BetaQuotaError(QUOTA_OPERATION_ALREADY_USED, 409, "この操作は処理済みか確認中です。結果を確認してください。");
  }
  if (result?.result !== "reserved" || !result.reservation_id) {
    throw new AppError(503, "利用上限を確認できませんでした。");
  }
  const reservationId = result.reservation_id;

  let state: "reserved" | "provider_started" | "terminal" = "reserved";
  async function transition(next: "provider_started" | "consumed" | "failed_or_unknown" | "released") {
    const response = await client.rpc("transition_beta_provider_quota", {
      p_user_id: input.userId,
      p_reservation_id: reservationId,
      p_transition: next
    });
    if (response.error || response.data !== next) {
      throw new AppError(503, "利用上限の記録を確認できませんでした。");
    }
  }
  return {
    reservationId,
    acknowledgeAtomicProviderStart() {
      if (state !== "reserved") throw new AppError(409, "操作の状態を確認できませんでした。");
      state = "provider_started";
    },
    async startProvider() {
      if (state !== "reserved") throw new AppError(409, "操作の状態を確認できませんでした。");
      await transition("provider_started");
      state = "provider_started";
    },
    async startVoiceRegistration(registration) {
      if (state !== "reserved") throw new AppError(409, "操作の状態を確認できませんでした。");
      const response = await client.rpc("begin_voice_registration_with_beta_quota", {
        p_user_id: input.userId,
        p_reservation_id: reservationId,
        p_intent_id: registration.intentId,
        p_lease_token: registration.leaseToken
      });
      if (response.error || response.data !== true) {
        throw new AppError(503, "音声登録と利用上限の開始を確認できませんでした。");
      }
      state = "provider_started";
    },
    async consume() {
      if (state !== "provider_started") throw new AppError(409, "操作の状態を確認できませんでした。");
      await transition("consumed");
      state = "terminal";
    },
    async failAfterProviderStart() {
      if (state !== "provider_started") return;
      try {
        await transition("failed_or_unknown");
        state = "terminal";
      } catch {
        // provider_started remains charged when the classification write fails.
      }
    },
    async releaseIfUnreached() {
      if (state !== "reserved") return;
      try {
        await transition("released");
        state = "terminal";
      } catch {
        // A start write may have committed despite a lost response. The DB
        // refuses release after provider_started, so keep the slot charged.
      }
    }
  };
}
