import { AppError } from "@/lib/errors";
import { getCostGuardIssue } from "@/lib/cost-guard";
import { getProductionProviderGuardIssue } from "@/lib/production-guard";
import { createAzureSpeechPronunciationEvaluator, getAzurePronunciationProviderStatus } from "./azure-evaluator";
import { createMockPronunciationEvaluator } from "./mock-evaluator";
import type { PronunciationEvaluator, PronunciationProviderDiagnostic, PronunciationProviderStatus } from "./types";

function createRequirementDiagnostic(key: string, label: string, ok: boolean, message: string): PronunciationProviderDiagnostic {
  return { key, label, ok, message };
}

export function getPronunciationProviderName() {
  return (process.env.PRONUNCIATION_PROVIDER ?? "mock").toLowerCase();
}

export function getPronunciationProviderStatus(): PronunciationProviderStatus {
  const provider = getPronunciationProviderName();
  const productionGuardIssue = getProductionProviderGuardIssue("pronunciation", provider);

  if (productionGuardIssue) {
    return {
      provider,
      supported: false as const,
      message: productionGuardIssue.message,
      readiness: "unsupported",
      recommendedDevelopmentFallbackProvider: null,
      diagnostics: [
        createRequirementDiagnostic("production-provider", "production provider", false, productionGuardIssue.message)
      ]
    };
  }

  if (provider === "mock") {
    return {
      provider,
      supported: true as const,
      message: null,
      readiness: "ready",
      recommendedDevelopmentFallbackProvider: null,
      diagnostics: [
        createRequirementDiagnostic("mode", "provider mode", true, "mock evaluator で main loop を継続できます。"),
        createRequirementDiagnostic("audio-contract", "audio-first contract", true, "mock でも `/api/evaluate` は保存済み録音を起点に transcribe -> evaluate -> save を通します。"),
        createRequirementDiagnostic("fallback", "development fallback", true, "実 provider の準備中は `PRONUNCIATION_PROVIDER=mock` を本線にできます。")
      ]
    };
  }

  if (provider === "azure") {
    const costGuardIssue = getCostGuardIssue("azure");

    if (costGuardIssue) {
      return {
        provider,
        supported: false as const,
        message: costGuardIssue.message,
        readiness: "unsupported",
        recommendedDevelopmentFallbackProvider: "mock",
        diagnostics: [
          createRequirementDiagnostic("cost-guard", "cost guard", false, costGuardIssue.message)
        ]
      };
    }

    return getAzurePronunciationProviderStatus();
  }

  return {
    provider,
    supported: false as const,
    message: `PRONUNCIATION_PROVIDER=${provider} は未対応です。mock を使用してください。`,
    readiness: "unsupported",
    recommendedDevelopmentFallbackProvider: "mock",
    diagnostics: [
      createRequirementDiagnostic("unsupported", "provider support", false, `PRONUNCIATION_PROVIDER=${provider} は current repo では未対応です。`)
    ]
  };
}

export function createPronunciationEvaluator(): PronunciationEvaluator {
  const status = getPronunciationProviderStatus();

  if (!status.supported) {
    throw new AppError(503, status.message ?? "pronunciation provider の設定を確認してください。");
  }

  if (status.provider === "mock") {
    return createMockPronunciationEvaluator();
  }

  if (status.provider === "azure") {
    return createAzureSpeechPronunciationEvaluator();
  }

  throw new AppError(503, status.message ?? "pronunciation provider の設定を確認してください。");
}
