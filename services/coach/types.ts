import type { EvaluateResult } from "@/services/pronunciation";

export interface CoachFeedback {
  titleJa: string;
  summaryJa: string;
  bulletPointsJa: string[];
  nextStepJa: string;
  focusWords: string[];
}

export interface CoachInput {
  scriptText: string;
  transcript: string;
  evaluation: EvaluateResult;
  locale?: string;
}
