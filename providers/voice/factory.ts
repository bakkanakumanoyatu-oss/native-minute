import { cookies } from "next/headers";
import { getCostGuardIssue } from "@/lib/cost-guard";
import { isE2ETestModeEnabled } from "@/lib/e2e-test-mode";
import { AppError } from "@/lib/errors";
import { getProductionProviderGuardIssue } from "@/lib/production-guard";
import { createElevenLabsVoiceProvider } from "./elevenlabs";
import { createMockVoiceProvider } from "./mock";
import { createOpenAiVoiceProvider } from "./openai";
import type { VoiceProvider, VoiceProviderDiagnostic, VoiceProviderRequirements, VoiceProviderStatus } from "./types";

export const TEST_VOICE_PROVIDER_STATUS_COOKIE = "nm-test-voice-provider-status";

const MOCK_PROVIDER_REQUIREMENTS: VoiceProviderRequirements = {
  provider: "mock",
  providerLabel: "mock",
  voiceLabel: "mock voice",
  requiresConsentName: false,
  requiresConsentLanguage: false,
  requiresConsentRecording: false,
  requiresSampleAudio: false,
  requiresProviderConsentId: false,
  entitlementSensitive: false,
  builtInVoiceFallbackAvailable: true,
  recommendedDevelopmentFallbackProvider: null
};

const OPENAI_PROVIDER_REQUIREMENTS: VoiceProviderRequirements = {
  provider: "openai",
  providerLabel: "OpenAI",
  voiceLabel: "OpenAI custom voice",
  requiresConsentName: true,
  requiresConsentLanguage: true,
  requiresConsentRecording: true,
  requiresSampleAudio: true,
  requiresProviderConsentId: true,
  entitlementSensitive: true,
  builtInVoiceFallbackAvailable: false,
  recommendedDevelopmentFallbackProvider: "mock"
};

const ELEVENLABS_PROVIDER_REQUIREMENTS: VoiceProviderRequirements = {
  provider: "elevenlabs",
  providerLabel: "ElevenLabs",
  voiceLabel: "ElevenLabs voice clone",
  requiresConsentName: false,
  requiresConsentLanguage: false,
  requiresConsentRecording: false,
  requiresSampleAudio: true,
  requiresProviderConsentId: false,
  entitlementSensitive: false,
  builtInVoiceFallbackAvailable: false,
  recommendedDevelopmentFallbackProvider: "mock"
};

function createUnsupportedProviderRequirements(provider: string): VoiceProviderRequirements {
  return {
    provider,
    providerLabel: provider,
    voiceLabel: `${provider} voice`,
    requiresConsentName: false,
    requiresConsentLanguage: false,
    requiresConsentRecording: false,
    requiresSampleAudio: false,
    requiresProviderConsentId: false,
    entitlementSensitive: false,
    builtInVoiceFallbackAvailable: false,
    recommendedDevelopmentFallbackProvider: "mock"
  };
}

function createEnvDiagnostic(
  key: string,
  label: string,
  envValue: string | undefined,
  configuredMessage: string,
  missingMessage: string
): VoiceProviderDiagnostic {
  return {
    key,
    label,
    ok: Boolean(envValue?.trim()),
    message: envValue?.trim() ? configuredMessage : missingMessage
  };
}

function createRequirementDiagnostic(key: string, label: string, ok: boolean, message: string): VoiceProviderDiagnostic {
  return { key, label, ok, message };
}

function createProviderScopeDiagnostic(providerLabel: string) {
  return createRequirementDiagnostic(
    "provider-scope",
    "provider scope",
    true,
    `setup/voice・listen・progress は現在の ${providerLabel} provider に一致する consent / default voice / script audio だけを参照します。別 provider の保存済み state は自動再利用しません。`
  );
}

function getTestVoiceProviderStatusOverride(provider: string) {
  if (!isE2ETestModeEnabled()) {
    return null;
  }

  try {
    const value = cookies().get(TEST_VOICE_PROVIDER_STATUS_COOKIE)?.value?.trim();

    if (!value) {
      return null;
    }

    const [targetProvider, mode] = value.split(":");

    if (targetProvider !== provider || mode !== "provider_unavailable") {
      return null;
    }

    return {
      message: `E2E override により VOICE_PROVIDER=${provider} は一時的に unavailable 扱いです。`,
      diagnostics: [
        createRequirementDiagnostic(
          "test-override",
          "provider override",
          false,
          "E2E test seam が provider_unavailable を強制しています。"
        )
      ]
    };
  } catch {
    return null;
  }
}

export function getVoiceProviderName() {
  return (process.env.VOICE_PROVIDER ?? "mock").toLowerCase();
}

export function getVoiceProviderRequirements(provider = getVoiceProviderName()): VoiceProviderRequirements {
  if (provider === "openai") {
    return OPENAI_PROVIDER_REQUIREMENTS;
  }

  if (provider === "elevenlabs") {
    return ELEVENLABS_PROVIDER_REQUIREMENTS;
  }

  if (provider === "mock") {
    return MOCK_PROVIDER_REQUIREMENTS;
  }

  return createUnsupportedProviderRequirements(provider);
}

export function getVoiceProviderStatus(): VoiceProviderStatus {
  const provider = getVoiceProviderName();
  const requirements = getVoiceProviderRequirements(provider);
  const productionGuardIssue = getProductionProviderGuardIssue("voice", provider);

  if (productionGuardIssue) {
    return {
      provider,
      supported: false as const,
      message: productionGuardIssue.message,
      readiness: "unsupported",
      requirements,
      diagnostics: [
        createRequirementDiagnostic("production-provider", "production provider", false, productionGuardIssue.message)
      ]
    };
  }

  const costGuardIssue =
    provider === "elevenlabs"
      ? getCostGuardIssue("elevenlabs")
      : provider === "openai"
        ? getCostGuardIssue("openai")
        : null;

  if (costGuardIssue) {
    return {
      provider,
      supported: false as const,
      message: costGuardIssue.message,
      readiness: "unsupported",
      requirements,
      diagnostics: [
        createRequirementDiagnostic("cost-guard", "cost guard", false, costGuardIssue.message)
      ]
    };
  }

  const testOverride = getTestVoiceProviderStatusOverride(provider);

  if (testOverride) {
    return {
      provider,
      supported: false as const,
      message: testOverride.message,
      readiness: "unsupported",
      requirements,
      diagnostics: testOverride.diagnostics
    };
  }

  if (provider === "mock") {
    return {
      provider,
      supported: true as const,
      message: null,
      readiness: "ready",
      requirements,
      diagnostics: [
        createRequirementDiagnostic("mode", "provider mode", true, "mock voice で main loop を継続できます。"),
        createProviderScopeDiagnostic("mock"),
        createRequirementDiagnostic("consent-mode", "consent mode", true, "mock では provider-side consent endpoint を使いません。app 内同意だけを canonical step として扱います。"),
        createRequirementDiagnostic("consent-recording", "同意録音", true, "mock では provider-side の同意録音は必須ではありません。"),
        createRequirementDiagnostic("sample-audio", "見本音声 sample", true, "mock では provider-side の見本音声 sample は必須ではありません。"),
        createRequirementDiagnostic("synthesize-source", "synthesize source", true, "mock は app replay path を返し、stageScriptAudioForReplay が app-owned wav upload に正規化します。")
      ]
    };
  }

  if (provider === "openai") {
    const diagnostics = [
      createEnvDiagnostic("api-key", "OPENAI_API_KEY", process.env.OPENAI_API_KEY, "OpenAI API key は設定済みです。", "OpenAI API key が未設定です。"),
      createEnvDiagnostic(
        "service-role",
        "SUPABASE_SERVICE_ROLE_KEY",
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        "service role key は設定済みです。",
        "service role key が未設定です。app-owned audio を provider へ渡せません。"
      ),
      createProviderScopeDiagnostic("OpenAI"),
      createRequirementDiagnostic("consent-mode", "consent mode", true, "OpenAI custom voice では provider-side consent endpoint を使います。app 内 consent row は canonical source のまま保持します。"),
      createRequirementDiagnostic("consent-recording", "同意録音", true, "OpenAI custom voice では同意録音が必要です。"),
      createRequirementDiagnostic("sample-audio", "見本音声 sample", true, "OpenAI custom voice では見本音声 sample が必要です。"),
      createRequirementDiagnostic("synthesize-source", "synthesize source", true, "OpenAI synthesize は inline-bytes を返し、stageScriptAudioForReplay が app-owned storage へ載せ替えます。"),
      createRequirementDiagnostic("live-readiness", "live readiness", false, "repo-side の env と upload 導線までは確認できますが、custom voice entitlement と provider-side response は manual smoke でのみ確認できます。"),
      createRequirementDiagnostic("fallback", "built-in fallback", false, "OpenAI entitlement が無い場合の built-in voice fallback はまだありません。")
    ];

    if (!process.env.OPENAI_API_KEY?.trim()) {
      return {
        provider,
        supported: false as const,
        message: "VOICE_PROVIDER=openai ですが OPENAI_API_KEY が未設定です。",
        readiness: "not_configured",
        requirements,
        diagnostics
      };
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      return {
        provider,
        supported: false as const,
        message: "VOICE_PROVIDER=openai ですが SUPABASE_SERVICE_ROLE_KEY が未設定です。",
        readiness: "not_configured",
        requirements,
        diagnostics
      };
    }

    return {
      provider,
      supported: true as const,
      message: null,
      readiness: "ready",
      requirements,
      diagnostics
    };
  }

  if (provider === "elevenlabs") {
    const diagnostics = [
      createEnvDiagnostic(
        "api-key",
        "ELEVENLABS_API_KEY",
        process.env.ELEVENLABS_API_KEY,
        "ElevenLabs API key は設定済みです。",
        "ElevenLabs API key が未設定です。"
      ),
      createEnvDiagnostic(
        "service-role",
        "SUPABASE_SERVICE_ROLE_KEY",
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        "service role key は設定済みです。",
        "service role key が未設定です。app-owned sample audio を provider へ渡せません。"
      ),
      createProviderScopeDiagnostic("ElevenLabs"),
      createRequirementDiagnostic(
        "tts-model",
        "TTS model",
        true,
        process.env.ELEVENLABS_TTS_MODEL_ID?.trim()
          ? `ELEVENLABS_TTS_MODEL_ID=${process.env.ELEVENLABS_TTS_MODEL_ID?.trim()} を使用します。`
          : "ELEVENLABS_TTS_MODEL_ID が未設定のときは eleven_multilingual_v2 を使用します。"
      ),
      createRequirementDiagnostic("consent-mode", "consent mode", true, "ElevenLabs では provider-side consent endpoint を使わず、app 内同意だけを canonical step として扱います。"),
      createRequirementDiagnostic("consent-recording", "同意録音", true, "ElevenLabs voice clone では provider-side の同意録音 endpoint は使いません。app 内同意だけを保持します。"),
      createRequirementDiagnostic("sample-audio", "見本音声 sample", true, "ElevenLabs voice clone では見本音声 sample が必要です。"),
      createRequirementDiagnostic("output-format", "output format", true, "current repo の ElevenLabs synthesize は mp3_44100_128 を要求し、返った bytes を app-owned replay に保存します。"),
      createRequirementDiagnostic("synthesize-source", "synthesize source", true, "ElevenLabs synthesize は inline-bytes を返し、stageScriptAudioForReplay が app-owned storage へ載せ替えます。"),
      createRequirementDiagnostic("live-readiness", "live readiness", false, "repo-side の env と upload 導線までは確認できますが、voice clone reject / verification required / provider-side response は manual smoke でのみ確定します。"),
      createRequirementDiagnostic("verification", "verification pending", false, "verification required voice は current repo では保存せず fail-fast します。")
    ];

    if (!process.env.ELEVENLABS_API_KEY?.trim()) {
      return {
        provider,
        supported: false as const,
        message: "VOICE_PROVIDER=elevenlabs ですが ELEVENLABS_API_KEY が未設定です。",
        readiness: "not_configured",
        requirements,
        diagnostics
      };
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      return {
        provider,
        supported: false as const,
        message: "VOICE_PROVIDER=elevenlabs ですが SUPABASE_SERVICE_ROLE_KEY が未設定です。見本音声 sample を app-owned storage から読むために必要です。",
        readiness: "not_configured",
        requirements,
        diagnostics
      };
    }

    return {
      provider,
      supported: true as const,
      message: null,
      readiness: "ready",
      requirements,
      diagnostics
    };
  }

  return {
    provider,
    supported: false as const,
    message: `VOICE_PROVIDER=${provider} は Phase 3 では未対応です。mock を使用してください。`,
    readiness: "unsupported",
    requirements,
    diagnostics: [
      createRequirementDiagnostic("unsupported", "provider support", false, `VOICE_PROVIDER=${provider} は current repo では未対応です。`)
    ]
  };
}

export function createConfiguredVoiceProvider(): VoiceProvider {
  const status = getVoiceProviderStatus();

  if (!status.supported) {
    throw new AppError(503, status.message ?? `VOICE_PROVIDER=${status.provider} は current repo では利用できません。`);
  }

  if (status.provider === "openai") {
    return createOpenAiVoiceProvider();
  }

  if (status.provider === "elevenlabs") {
    return createElevenLabsVoiceProvider();
  }

  return createMockVoiceProvider();
}
