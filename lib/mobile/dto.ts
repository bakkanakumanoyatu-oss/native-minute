import type { HydratedTakeReview } from "@/services/review";
import type { MobileReviewDto } from "./contracts";

export function toMobileReviewDto(review: HydratedTakeReview): MobileReviewDto {
  return {
    takeId: review.take.id,
    scriptId: review.take.script_id,
    createdAt: review.take.created_at,
    reviewedAt: review.take.reviewed_at,
    transcriptText: review.take.transcript_text ?? "",
    evaluation: {
      score: review.evaluation.score,
      accuracyScore: review.evaluation.accuracyScore,
      fluencyScore: review.evaluation.fluencyScore,
      rhythmScore: review.evaluation.rhythmScore,
      summaryJa: review.evaluation.summaryJa,
      strengthsJa: review.evaluation.strengthsJa,
      weakWords: review.evaluation.weakWords,
      scriptWordCount: review.evaluation.scriptWordCount,
      transcriptWordCount: review.evaluation.transcriptWordCount
    },
    coach: {
      titleJa: review.coach.titleJa,
      summaryJa: review.coach.summaryJa,
      bulletPointsJa: review.coach.bulletPointsJa,
      nextStepJa: review.coach.nextStepJa,
      focusWords: review.coach.focusWords
    }
  };
}
