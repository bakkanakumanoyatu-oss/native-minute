import type { Database } from "@/types/database";
import type { CoachFeedback } from "@/services/coach";
import type { EvaluateResult } from "@/services/pronunciation";

export interface ReviewArtifacts {
  takeId: string;
  audioPath: string;
  transcriptText: string;
  evaluation: EvaluateResult;
  coach: CoachFeedback;
}

export type StoredWeakWord = Database["public"]["Tables"]["weak_words"]["Row"];
export type StoredTake = Database["public"]["Tables"]["takes"]["Row"];
export type StoredCoachFeedback = Database["public"]["Tables"]["coach_feedback"]["Row"];

export interface StoredTakeReview {
  take: StoredTake;
  weakWords: StoredWeakWord[];
  coachFeedback: StoredCoachFeedback | null;
}

export interface HydratedTakeReview extends StoredTakeReview {
  evaluation: EvaluateResult;
  coach: CoachFeedback;
}
