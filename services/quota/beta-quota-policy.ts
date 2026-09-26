import { AppError } from "@/lib/errors";

export type BetaQuotaKind = "reference_audio_generation" | "pronunciation_evaluation" | "voice_creation";
export type BetaQuotaPeriodKind = "calendar_month_utc" | "account_lifetime";
export type BetaQuotaLimit = { perUser: number; global: number; periodKind: BetaQuotaPeriodKind };
export type BetaQuotaPolicy = Record<BetaQuotaKind, BetaQuotaLimit>;

export const BETA_QUOTA_ENV = {
  reference_audio_generation: {
    perUser: "NATIVE_MINUTE_QUOTA_REFERENCE_AUDIO_PER_USER_LIMIT",
    global: "NATIVE_MINUTE_QUOTA_REFERENCE_AUDIO_GLOBAL_LIMIT",
    periodKind: "NATIVE_MINUTE_QUOTA_REFERENCE_AUDIO_PERIOD"
  },
  pronunciation_evaluation: {
    perUser: "NATIVE_MINUTE_QUOTA_EVALUATION_PER_USER_LIMIT",
    global: "NATIVE_MINUTE_QUOTA_EVALUATION_GLOBAL_LIMIT",
    periodKind: "NATIVE_MINUTE_QUOTA_EVALUATION_PERIOD"
  },
  voice_creation: {
    perUser: "NATIVE_MINUTE_QUOTA_VOICE_CREATION_PER_USER_LIMIT",
    global: "NATIVE_MINUTE_QUOTA_VOICE_CREATION_GLOBAL_LIMIT",
    periodKind: "NATIVE_MINUTE_QUOTA_VOICE_CREATION_PERIOD"
  }
} as const;

const ENABLE_ENV = "NATIVE_MINUTE_ENABLE_BETA_QUOTA_ENFORCEMENT";
const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);
const DISABLED_VALUES = new Set(["", "0", "false", "no", "off"]);

function parsePositiveLimit(value: string | undefined): number | null {
  const trimmed = value?.trim() ?? "";
  if (!/^[1-9]\d*$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed <= 2_147_483_647 ? parsed : null;
}

export function readBetaQuotaPolicy(
  source: Record<string, string | undefined> = process.env
): BetaQuotaPolicy | null {
  const enabled = (source[ENABLE_ENV] ?? "").trim().toLowerCase();
  if (DISABLED_VALUES.has(enabled)) return null;
  if (!ENABLED_VALUES.has(enabled)) throw new AppError(503, "利用上限の設定を確認できません。");

  const policy = {} as BetaQuotaPolicy;
  for (const kind of Object.keys(BETA_QUOTA_ENV) as BetaQuotaKind[]) {
    const names = BETA_QUOTA_ENV[kind];
    const perUser = parsePositiveLimit(source[names.perUser]);
    const global = parsePositiveLimit(source[names.global]);
    const periodKind = source[names.periodKind]?.trim();
    if (!perUser || !global || (periodKind !== "calendar_month_utc" && periodKind !== "account_lifetime")) {
      throw new AppError(503, "利用上限の設定を確認できません。");
    }
    policy[kind] = { perUser, global, periodKind };
  }
  return policy;
}

export function isBetaQuotaEnforcementEnabled(source: Record<string, string | undefined> = process.env) {
  return readBetaQuotaPolicy(source) !== null;
}
