import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  providerGenerate: vi.fn(),
  createMockProvider: vi.fn(),
  createOpenAiProvider: vi.fn(),
  runPipeline: vi.fn(),
  recordQuotaEventAttempt: vi.fn(),
  recordQuotaEventSkipped: vi.fn()
}));

vi.mock("@/lib/script-studio", () => ({
  createMockScriptGenerationProvider: mocks.createMockProvider,
  runAsyncScriptGenerationPipeline: mocks.runPipeline
}));
vi.mock("@/lib/script-studio/server", () => ({
  createOpenAiScriptGenerationProvider: mocks.createOpenAiProvider,
  OPENAI_SCRIPT_GENERATION_DEFAULT_MODEL: "test-model"
}));
vi.mock("@/services/quota/quota-event.service", () => ({
  buildTextGenerationAttemptMetadata: vi.fn(() => ({})),
  buildTextGenerationCompletionMetadata: vi.fn(() => ({})),
  buildTextGenerationQuotaKeys: vi.fn(() => ({})),
  extractProviderRequestIdFromPipeline: vi.fn(() => null),
  markQuotaEventFailed: vi.fn(),
  markQuotaEventNotBillable: vi.fn(),
  markQuotaEventSucceeded: vi.fn(),
  recordQuotaEventAttempt: mocks.recordQuotaEventAttempt,
  recordQuotaEventSkipped: mocks.recordQuotaEventSkipped,
  withNonBlockingQuotaEventWrite: vi.fn(async (_label: string, operation: () => Promise<unknown>) => operation())
}));

import { AI_SCRIPT_GENERATION_UNAVAILABLE_MESSAGE, isAiScriptGenerationEnabled } from "@/lib/script-studio/generation-capability";
import { generateScriptStudioDrafts } from "@/services/script-studio/script-generation.service";
import { createTranscriptionProvider, getTranscriptionProviderStatus } from "@/services/transcription/factory";
import { OpenAiTranscriptionProvider } from "@/services/transcription/openai-transcriber";

const originalEnv = {
  enable: process.env.NATIVE_MINUTE_ENABLE_AI_SCRIPT_GENERATION,
  generationProvider: process.env.SCRIPT_GENERATION_PROVIDER,
  transcriptionProvider: process.env.TRANSCRIPTION_PROVIDER,
  openAiKey: process.env.OPENAI_API_KEY,
  openAiDisabled: process.env.NATIVE_MINUTE_DISABLE_OPENAI,
  vercelEnv: process.env.VERCEL_ENV,
  nativeMinuteEnv: process.env.NATIVE_MINUTE_ENV,
  productionGuard: process.env.NATIVE_MINUTE_PRODUCTION_GUARD
};

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.NATIVE_MINUTE_ENABLE_AI_SCRIPT_GENERATION;
  process.env.SCRIPT_GENERATION_PROVIDER = "mock";
  process.env.NATIVE_MINUTE_DISABLE_OPENAI = "0";
  delete process.env.VERCEL_ENV;
  delete process.env.NATIVE_MINUTE_ENV;
  delete process.env.NATIVE_MINUTE_PRODUCTION_GUARD;
});

afterEach(() => {
  vi.restoreAllMocks();
  const values = {
    NATIVE_MINUTE_ENABLE_AI_SCRIPT_GENERATION: originalEnv.enable,
    SCRIPT_GENERATION_PROVIDER: originalEnv.generationProvider,
    TRANSCRIPTION_PROVIDER: originalEnv.transcriptionProvider,
    OPENAI_API_KEY: originalEnv.openAiKey,
    NATIVE_MINUTE_DISABLE_OPENAI: originalEnv.openAiDisabled,
    VERCEL_ENV: originalEnv.vercelEnv,
    NATIVE_MINUTE_ENV: originalEnv.nativeMinuteEnv,
    NATIVE_MINUTE_PRODUCTION_GUARD: originalEnv.productionGuard
  };
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("AI script generation capability", () => {
  it("defaults off and requires an explicit server enable value", () => {
    expect(isAiScriptGenerationEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(isAiScriptGenerationEnabled({ NATIVE_MINUTE_ENABLE_AI_SCRIPT_GENERATION: "0" } as NodeJS.ProcessEnv)).toBe(false);
    expect(isAiScriptGenerationEnabled({ NATIVE_MINUTE_ENABLE_AI_SCRIPT_GENERATION: "true" } as NodeJS.ProcessEnv)).toBe(true);
  });

  it("stops direct service calls before provider selection and quota writes", async () => {
    process.env.SCRIPT_GENERATION_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "local-test-key-never-used";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network is disabled in this test"));

    await expect(generateScriptStudioDrafts({}, { userId: "owner" })).rejects.toMatchObject({
      status: 403,
      message: AI_SCRIPT_GENERATION_UNAVAILABLE_MESSAGE
    });
    expect(mocks.createMockProvider).not.toHaveBeenCalled();
    expect(mocks.createOpenAiProvider).not.toHaveBeenCalled();
    expect(mocks.runPipeline).not.toHaveBeenCalled();
    expect(mocks.recordQuotaEventAttempt).not.toHaveBeenCalled();
    expect(mocks.recordQuotaEventSkipped).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps the existing mock generation path available when explicitly enabled", async () => {
    process.env.NATIVE_MINUTE_ENABLE_AI_SCRIPT_GENERATION = "1";
    mocks.providerGenerate.mockResolvedValue([]);
    mocks.createMockProvider.mockReturnValue({ id: "script-studio-mock", generate: mocks.providerGenerate });
    mocks.recordQuotaEventAttempt.mockResolvedValue(null);
    mocks.runPipeline.mockImplementation(async (request: unknown, provider: { generate: (input: unknown) => Promise<unknown> }) => {
      await provider.generate(request);
      return {
        acceptedDrafts: [],
        rejectedCandidates: [],
        issues: [],
        variantLimit: { requested: 1, max: 3 },
        promptPack: { guardrails: [] }
      };
    });

    const result = await generateScriptStudioDrafts({ userSeedText: "A brief" }, { userId: "owner" });
    expect(result.provider).toBe("mock");
    expect(mocks.createMockProvider).toHaveBeenCalledOnce();
    expect(mocks.runPipeline).toHaveBeenCalledOnce();
    expect(mocks.providerGenerate).toHaveBeenCalledOnce();
    expect(mocks.createOpenAiProvider).not.toHaveBeenCalled();
  });

  it("leaves OpenAI transcription selectable while generation is disabled", () => {
    process.env.TRANSCRIPTION_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "local-test-key-never-used";

    expect(getTranscriptionProviderStatus()).toMatchObject({ provider: "openai", supported: true });
    expect(createTranscriptionProvider()).toBeInstanceOf(OpenAiTranscriptionProvider);
    expect(mocks.createOpenAiProvider).not.toHaveBeenCalled();
  });
});
