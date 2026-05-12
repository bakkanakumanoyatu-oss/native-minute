export type ProductionProviderArea = "voice" | "transcription" | "pronunciation" | "script_generation";

export const PRODUCTION_PROVIDER_POLICY: Record<ProductionProviderArea, string> = {
  voice: "elevenlabs",
  transcription: "openai",
  pronunciation: "azure",
  script_generation: "openai"
};

const PROVIDER_ENV_NAMES: Record<ProductionProviderArea, string> = {
  voice: "VOICE_PROVIDER",
  transcription: "TRANSCRIPTION_PROVIDER",
  pronunciation: "PRONUNCIATION_PROVIDER",
  script_generation: "SCRIPT_GENERATION_PROVIDER"
};

function isTruthyEnv(value: string | undefined) {
  if (!value) {
    return false;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export function isStrictProductionRuntime(env: NodeJS.ProcessEnv = process.env) {
  return (
    env.VERCEL_ENV?.trim().toLowerCase() === "production" ||
    env.NATIVE_MINUTE_ENV?.trim().toLowerCase() === "production" ||
    isTruthyEnv(env.NATIVE_MINUTE_PRODUCTION_GUARD)
  );
}

export function getProductionProviderGuardIssue(
  area: ProductionProviderArea,
  provider: string,
  env: NodeJS.ProcessEnv = process.env
) {
  if (!isStrictProductionRuntime(env)) {
    return null;
  }

  const normalizedProvider = provider.trim().toLowerCase();
  const requiredProvider = PRODUCTION_PROVIDER_POLICY[area];

  if (normalizedProvider === requiredProvider) {
    return null;
  }

  const envName = PROVIDER_ENV_NAMES[area];

  return {
    area,
    envName,
    provider: normalizedProvider,
    requiredProvider,
    message: `production では ${envName}=${requiredProvider} が必要です。現在の provider 設定では本番公開できません。`
  };
}

export function hasProductionE2ETestEnv(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(
    env.E2E_TEST_SECRET?.trim() ||
      env.E2E_TEST_EMAIL?.trim() ||
      env.E2E_TEST_PASSWORD?.trim()
  );
}
