import { AppError } from "@/lib/errors";
import type { CoachFeedback } from "@/services/coach";
import type { EvaluateResult } from "@/services/pronunciation";
import type { EvaluateRequestInput } from "@/schemas/evaluate";

export interface MockReviewInput extends EvaluateRequestInput {
  takeId?: string;
}

export interface MockReviewResult {
  takeId: string;
  evaluation: EvaluateResult;
  coach: CoachFeedback;
}

export async function createMockReviewResult(input: MockReviewInput): Promise<MockReviewResult> {
  void input;
  throw new AppError(501, "mock review helper は現在の保存フローでは使用していません。`/api/evaluate` を利用してください。");
}
