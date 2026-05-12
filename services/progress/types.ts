import type { CoachFeedback } from "@/services/coach";
import type { EvaluateResult } from "@/services/pronunciation";
import type { HydratedTakeReview } from "@/services/review";

export interface ProgressTakeSummary {
  id: string;
  scriptId: string;
  score: number;
  accuracyScore: number;
  fluencyScore: number;
  rhythmScore: number;
  reviewedAt: string | null;
  createdAt: string;
  transcriptText: string | null;
  weakWords: EvaluateResult["weakWords"];
  coach: CoachFeedback;
  evaluation: EvaluateResult;
}

export interface TakeDiffSummary {
  scoreDelta: number;
  accuracyDelta: number;
  fluencyDelta: number;
  rhythmDelta: number;
  improvedWeakWords: string[];
  regressedWeakWords: string[];
  commonWeakWords: string[];
  coachShift: {
    currentSummary: string;
    bestSummary: string;
  };
}

export interface ScriptProgressItem {
  script: {
    id: string;
    title: string;
    content: string;
    locale: string;
    targetSeconds: number;
    updatedAt: string;
  };
  takeCount: number;
  latestTake: ProgressTakeSummary | null;
  bestTake: ProgressTakeSummary | null;
  previousTake: ProgressTakeSummary | null;
  latestVsPrevious: TakeDiffSummary | null;
  latestVsBest: TakeDiffSummary | null;
  improvementTrend: "up" | "down" | "flat" | "insufficient_data";
}

export interface ProgressOverview {
  scripts: ScriptProgressItem[];
  totalScripts: number;
  totalReviewedTakes: number;
  bestTakeCount: number;
}

export interface RankedTakeReview extends HydratedTakeReview {
  bestRankKey: [number, string, string, string];
}
