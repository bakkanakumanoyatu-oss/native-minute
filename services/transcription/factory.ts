import { AppError } from "@/lib/errors";
import { getCostGuardIssue } from "@/lib/cost-guard";
import { getProductionProviderGuardIssue } from "@/lib/production-guard";
import { createOpenAiTranscriptionProvider } from "./openai-transcriber";
import { createMockTranscriptionProvider } from "./mock-transcriber";
import type { TranscriptionProvider } from "./types";

function getTranscriptionProviderName() {
  return (process.env.TRANSCRIPTION_PROVIDER ?? "mock").toLowerCase();
}

export function getTranscriptionProviderStatus() {
  const provider = getTranscriptionProviderName();
  const productionGuardIssue = getProductionProviderGuardIssue("transcription", provider);

  if (productionGuardIssue) {
    return {
      provider,
      supported: false as const,
      message: productionGuardIssue.message
    };
  }

  if (provider === "mock") {
    return {
      provider,
      supported: true as const,
      message: null
    };
  }

  if (provider === "openai") {
    const costGuardIssue = getCostGuardIssue("openai");

    if (costGuardIssue) {
      return {
        provider,
        supported: false as const,
        message: costGuardIssue.message
      };
    }

    if (!process.env.OPENAI_API_KEY) {
      return {
        provider,
        supported: false as const,
        message: "TRANSCRIPTION_PROVIDER=openai を使うには OPENAI_API_KEY が必要です。"
      };
    }

    return {
      provider,
      supported: true as const,
      message: null
    };
  }

  return {
    provider,
    supported: false as const,
    message: `TRANSCRIPTION_PROVIDER=${provider} は未対応です。mock または openai を使用してください。`
  };
}

export function createTranscriptionProvider(): TranscriptionProvider {
  const status = getTranscriptionProviderStatus();

  if (!status.supported) {
    throw new AppError(503, status.message);
  }

  if (status.provider === "mock") {
    return createMockTranscriptionProvider();
  }

  if (status.provider === "openai") {
    return createOpenAiTranscriptionProvider();
  }

  throw new AppError(503, status.message ?? "transcription provider の設定を確認してください。");
}
