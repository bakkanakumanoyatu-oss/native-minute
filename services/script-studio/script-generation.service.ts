import { AppError } from "@/lib/errors";
import { getCostGuardIssue } from "@/lib/cost-guard";
import { getProductionProviderGuardIssue } from "@/lib/production-guard";
import {
  createMockScriptGenerationProvider,
  runAsyncScriptGenerationPipeline,
  type ScriptGenerationAsyncProvider,
  type ScriptGenerationPipelineIssue,
  type ScriptGenerationPipelineResult
} from "@/lib/script-studio";
import { createOpenAiScriptGenerationProvider, OPENAI_SCRIPT_GENERATION_DEFAULT_MODEL } from "@/lib/script-studio/server";
import type { ScriptGenerationRequest } from "@/lib/script-studio/generation";
import type { ScriptDraft, ScriptQualityReport } from "@/lib/script-studio/types";
import type { ScriptStudioGenerationRequestInput } from "@/schemas/script-studio";
import {
  buildTextGenerationAttemptMetadata,
  buildTextGenerationCompletionMetadata,
  buildTextGenerationQuotaKeys,
  extractProviderRequestIdFromPipeline,
  markQuotaEventFailed,
  markQuotaEventNotBillable,
  markQuotaEventSucceeded,
  recordQuotaEventAttempt,
  recordQuotaEventSkipped,
  withNonBlockingQuotaEventWrite,
  type QuotaEventBillingStatus,
  type QuotaEventFailureStage
} from "@/services/quota/quota-event.service";

type ScriptGenerationProviderName = "mock" | "openai";

export type SafeScriptStudioGenerationResponse = {
  provider: ScriptGenerationProviderName;
  acceptedDrafts: SafeGeneratedDraft[];
  rejectedCandidates: SafeRejectedCandidate[];
  issues: ScriptGenerationPipelineIssue[];
  promptPackSummary: {
    requestedVariants: number;
    maxVariants: number;
    guardrails: Array<{
      id: string;
      labelJa: string;
    }>;
  };
  nextAction: string;
};

type SafeGeneratedDraft = {
  candidateIndex: number;
  title: string;
  englishScript: string;
  japaneseSummary: string;
  qualityReport: ScriptQualityReport;
  freezePreflight: {
    canFreeze: boolean;
    blockingReasons: string[];
    warnings: string[];
    nextAction: string;
  };
  focusWords: ScriptDraft["focusWords"];
  generationNotes: string[];
  issues: ScriptGenerationPipelineIssue[];
};

type SafeRejectedCandidate = {
  candidateIndex: number;
  issues: ScriptGenerationPipelineIssue[];
};

export async function generateScriptStudioDrafts(
  input: ScriptStudioGenerationRequestInput,
  context: { userId: string }
): Promise<SafeScriptStudioGenerationResponse> {
  const request = toScriptGenerationRequest(input);
  const providerSelection = getScriptGenerationProviderSelection();
  const providerModel = getScriptGenerationProviderModel(providerSelection.providerName);
  const attemptMetadata = buildTextGenerationAttemptMetadata({
    request,
    provider: providerSelection.rawProvider,
    providerModel
  });
  const quotaKeys = buildTextGenerationQuotaKeys({
    request,
    provider: providerSelection.rawProvider,
    providerModel
  });

  if (!providerSelection.providerName) {
    await withNonBlockingQuotaEventWrite("record skipped script generation quota event", () =>
      recordQuotaEventSkipped({
        userId: context.userId,
        provider: providerSelection.rawProvider,
        providerModel,
        keys: quotaKeys,
        metadata: attemptMetadata,
        failureStage: "provider_selection",
        failureCode: "invalid_script_generation_provider"
      })
    );

    throw new AppError(
      503,
      providerSelection.productionGuardMessage ?? "SCRIPT_GENERATION_PROVIDER は mock または openai を指定してください。"
    );
  }

  const providerName = providerSelection.providerName;

  if (providerName === "openai") {
    const costGuardIssue = getCostGuardIssue("openai");

    if (costGuardIssue) {
      await withNonBlockingQuotaEventWrite("record skipped script generation quota event", () =>
        recordQuotaEventSkipped({
          userId: context.userId,
          provider: providerName,
          providerModel,
          keys: quotaKeys,
          metadata: attemptMetadata,
          failureStage: "provider_config",
          failureCode: "openai_cost_guard_disabled"
        })
      );

      throw new AppError(503, costGuardIssue.message);
    }
  }

  if (providerName === "openai" && !process.env.OPENAI_API_KEY?.trim()) {
    await withNonBlockingQuotaEventWrite("record skipped script generation quota event", () =>
      recordQuotaEventSkipped({
        userId: context.userId,
        provider: providerName,
        providerModel,
        keys: quotaKeys,
        metadata: attemptMetadata,
        failureStage: "provider_config",
        failureCode: "missing_openai_api_key"
      })
    );

    throw new AppError(503, "SCRIPT_GENERATION_PROVIDER=openai を使うには OPENAI_API_KEY が必要です。");
  }

  const provider = createScriptGenerationProvider(providerName);
  const quotaEvent = await withNonBlockingQuotaEventWrite("record script generation quota attempt", () =>
    recordQuotaEventAttempt({
      userId: context.userId,
      provider: providerName,
      providerModel,
      keys: quotaKeys,
      metadata: attemptMetadata,
      billingStatus: providerName === "mock" ? "non_billable" : "not_evaluated"
    })
  );

  try {
    const result = await runAsyncScriptGenerationPipeline(request, provider);
    const completionMetadata = buildTextGenerationCompletionMetadata({
      attemptMetadata,
      result
    });
    const providerRequestId = extractProviderRequestIdFromPipeline(result);

    if (providerName === "mock") {
      await withNonBlockingQuotaEventWrite("mark script generation quota event not billable", () =>
        markQuotaEventNotBillable(quotaEvent, {
          metadata: completionMetadata,
          providerRequestId
        })
      );
    } else if (result.acceptedDrafts.length > 0) {
      await withNonBlockingQuotaEventWrite("mark script generation quota event succeeded", () =>
        markQuotaEventSucceeded(quotaEvent, {
          metadata: completionMetadata,
          providerRequestId,
          billingStatus: "billable_candidate"
        })
      );
    } else {
      await withNonBlockingQuotaEventWrite("mark script generation quota event failed", () =>
        markQuotaEventFailed(quotaEvent, {
          failureStage: "pipeline_rejected",
          failureCode: "accepted_draft_missing",
          metadata: completionMetadata,
          providerRequestId,
          billingStatus: getFailureBillingStatus(providerName, "pipeline_rejected")
        })
      );
    }

    return shapeSafeGenerationResponse(providerName, result);
  } catch (error) {
    const failureStage = getTextGenerationFailureStage(error, providerName);

    await withNonBlockingQuotaEventWrite("mark script generation quota event failed", () =>
      markQuotaEventFailed(quotaEvent, {
        failureStage,
        failureCode: getTextGenerationFailureCode(failureStage),
        metadata: attemptMetadata,
        billingStatus: getFailureBillingStatus(providerName, failureStage)
      })
    );

    throw error;
  }
}

function toScriptGenerationRequest(input: ScriptStudioGenerationRequestInput): ScriptGenerationRequest {
  const {
    requestedVariants,
    boundedAdjustment,
    ...brief
  } = input;

  return {
    brief,
    requestedVariants,
    boundedAdjustment
  };
}

function getScriptGenerationProviderSelection(): {
  rawProvider: string;
  providerName: ScriptGenerationProviderName | null;
  productionGuardMessage?: string;
} {
  const rawProvider = (process.env.SCRIPT_GENERATION_PROVIDER?.trim() || "mock").toLowerCase();

  if (rawProvider === "mock" || rawProvider === "openai") {
    const productionGuardIssue = getProductionProviderGuardIssue("script_generation", rawProvider);

    if (productionGuardIssue) {
      return {
        rawProvider,
        providerName: null,
        productionGuardMessage: productionGuardIssue.message
      };
    }

    return {
      rawProvider,
      providerName: rawProvider
    };
  }

  return {
    rawProvider,
    providerName: null
  };
}

function createScriptGenerationProvider(providerName: ScriptGenerationProviderName): ScriptGenerationAsyncProvider {
  if (providerName === "mock") {
    const mockProvider = createMockScriptGenerationProvider();

    return {
      id: mockProvider.id,
      async generate(input) {
        return mockProvider.generate(input);
      }
    };
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new AppError(503, "SCRIPT_GENERATION_PROVIDER=openai を使うには OPENAI_API_KEY が必要です。");
  }

  return createOpenAiScriptGenerationProvider();
}

function getScriptGenerationProviderModel(providerName: ScriptGenerationProviderName | null) {
  if (providerName === "openai") {
    return process.env.OPENAI_SCRIPT_GENERATION_MODEL?.trim() || OPENAI_SCRIPT_GENERATION_DEFAULT_MODEL;
  }

  if (providerName === "mock") {
    return "mock";
  }

  return null;
}

function shapeSafeGenerationResponse(
  providerName: ScriptGenerationProviderName,
  result: ScriptGenerationPipelineResult
): SafeScriptStudioGenerationResponse {
  return {
    provider: providerName,
    acceptedDrafts: result.acceptedDrafts.map((accepted) => ({
      candidateIndex: accepted.candidateIndex,
      title: accepted.draft.title,
      englishScript: accepted.draft.englishScript,
      japaneseSummary: accepted.draft.japaneseSummary,
      qualityReport: accepted.qualityReport,
      freezePreflight: {
        canFreeze: accepted.freezePreflight.canFreeze,
        blockingReasons: accepted.freezePreflight.freezeReadiness.blockingReasons,
        warnings: accepted.freezePreflight.freezeReadiness.warnings,
        nextAction: accepted.freezePreflight.nextAction
      },
      focusWords: accepted.draft.focusWords,
      generationNotes: accepted.draft.generationNotes,
      issues: accepted.issues
    })),
    rejectedCandidates: result.rejectedCandidates.map((rejected) => ({
      candidateIndex: rejected.candidateIndex,
      issues: rejected.issues
    })),
    issues: result.issues,
    promptPackSummary: {
      requestedVariants: result.variantLimit.requested,
      maxVariants: result.variantLimit.max,
      guardrails: result.promptPack.guardrails.map((guardrail) => ({
        id: guardrail.id,
        labelJa: guardrail.labelJa
      }))
    },
    nextAction: getGenerationNextAction(result)
  };
}

function getGenerationNextAction(result: ScriptGenerationPipelineResult) {
  if (result.acceptedDrafts.length === 0) {
    return "入力を少し短くするか、話したい目的を1つに絞って再生成する";
  }

  const firstDraft = result.acceptedDrafts[0];

  if (!firstDraft.freezePreflight.canFreeze) {
    return firstDraft.freezePreflight.nextAction;
  }

  return "候補を確認し、freeze 接続の実装後にこの台本で練習開始へ進む";
}

function getTextGenerationFailureStage(error: unknown, providerName: ScriptGenerationProviderName): QuotaEventFailureStage {
  const message = error instanceof Error ? error.message : "";

  if (message.includes("response を読み取れません") || message.includes("response JSON") || message.includes("JSON")) {
    return "provider_response_parse";
  }

  if (providerName === "openai") {
    return "provider_request";
  }

  return "pipeline_validation";
}

function getTextGenerationFailureCode(failureStage: QuotaEventFailureStage) {
  switch (failureStage) {
    case "provider_response_parse":
      return "provider_response_parse_failed";
    case "provider_request":
      return "provider_request_failed";
    case "pipeline_rejected":
      return "accepted_draft_missing";
    case "pipeline_validation":
      return "pipeline_validation_failed";
    default:
      return "script_generation_failed";
  }
}

function getFailureBillingStatus(
  providerName: ScriptGenerationProviderName,
  failureStage: QuotaEventFailureStage
): QuotaEventBillingStatus {
  if (providerName === "mock") {
    return "non_billable";
  }

  if (failureStage === "provider_request" || failureStage === "provider_response_parse") {
    return "refund_candidate";
  }

  return "billable_candidate";
}
