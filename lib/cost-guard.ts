import { AppError } from "@/lib/errors";

export type CostGuardArea = "openai" | "azure" | "elevenlabs" | "storage_uploads";

const COST_GUARD_ENV: Record<CostGuardArea, string> = {
  openai: "NATIVE_MINUTE_DISABLE_OPENAI",
  azure: "NATIVE_MINUTE_DISABLE_AZURE",
  elevenlabs: "NATIVE_MINUTE_DISABLE_ELEVENLABS",
  storage_uploads: "NATIVE_MINUTE_DISABLE_STORAGE_UPLOADS"
};

const COST_GUARD_LABEL: Record<CostGuardArea, string> = {
  openai: "OpenAI を使う文字起こし / script generation",
  azure: "Azure pronunciation assessment",
  elevenlabs: "ElevenLabs の voice clone / 見本音声生成",
  storage_uploads: "音声アップロード"
};

function isTruthyEnv(value: string | undefined) {
  if (!value) {
    return false;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export function isCostGuardDisabled(area: CostGuardArea, env: NodeJS.ProcessEnv = process.env) {
  return isTruthyEnv(env[COST_GUARD_ENV[area]]);
}

export function getCostGuardIssue(area: CostGuardArea, env: NodeJS.ProcessEnv = process.env) {
  if (!isCostGuardDisabled(area, env)) {
    return null;
  }

  const envName = COST_GUARD_ENV[area];
  const label = COST_GUARD_LABEL[area];

  return {
    area,
    envName,
    message: `${label} は現在一時停止しています。しばらく待ってから再試行してください。`
  };
}

export function assertCostGuardEnabled(area: CostGuardArea, env: NodeJS.ProcessEnv = process.env) {
  const issue = getCostGuardIssue(area, env);

  if (issue) {
    throw new AppError(503, issue.message);
  }
}
