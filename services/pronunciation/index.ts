export * from "./types";
export { MockPronunciationEvaluator, createMockPronunciationEvaluator } from "./mock-evaluator";
export {
  AzureSpeechPronunciationEvaluator,
  createAzureSpeechPronunciationEvaluator,
  getAzurePronunciationProviderStatus,
  getAzurePronunciationStatusMessage
} from "./azure-evaluator";
export { createPronunciationEvaluator, getPronunciationProviderName, getPronunciationProviderStatus } from "./factory";
