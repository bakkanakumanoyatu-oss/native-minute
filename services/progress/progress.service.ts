import { AppError } from "@/lib/errors";
import type { AppSupabaseClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";
import type { CoachFeedback } from "@/services/coach";
import type { ScriptListItem } from "@/services/scripts/types";
import { listScripts } from "@/services/scripts/scripts.service";
import type { HydratedTakeReview, StoredTakeReview } from "@/services/review";
import { hydrateStoredReview } from "@/services/review";
import type {
  ProgressOverview,
  ProgressTakeSummary,
  RankedTakeReview,
  ScriptProgressItem,
  TakeDiffSummary
} from "./types";

type TakeRow = Database["public"]["Tables"]["takes"]["Row"];
type WeakWordRow = Database["public"]["Tables"]["weak_words"]["Row"];
type CoachFeedbackRow = Database["public"]["Tables"]["coach_feedback"]["Row"];

function mapProgressError(operation: string, error: { message: string }) {
  return new AppError(500, `progress の${operation}に失敗しました。${error.message}`);
}

function asMany<TRow>(value: unknown) {
  return value as { data: TRow[] | null; error: { message: string } | null };
}

function toStoredTakeReview(
  take: TakeRow,
  weakWords: WeakWordRow[],
  coachFeedback: CoachFeedbackRow | null
): StoredTakeReview {
  return {
    take,
    weakWords,
    coachFeedback
  };
}

function toProgressTakeSummary(review: HydratedTakeReview): ProgressTakeSummary {
  return {
    id: review.take.id,
    scriptId: review.take.script_id,
    score: review.take.score ?? 0,
    accuracyScore: review.take.accuracy_score ?? 0,
    fluencyScore: review.take.fluency_score ?? 0,
    rhythmScore: review.take.rhythm_score ?? 0,
    reviewedAt: review.take.reviewed_at,
    createdAt: review.take.created_at,
    transcriptText: review.take.transcript_text,
    weakWords: review.evaluation.weakWords,
    coach: review.coach,
    evaluation: review.evaluation
  };
}

function toBestRankKey(review: HydratedTakeReview): [number, string, string, string] {
  return [
    review.take.score ?? 0,
    review.take.reviewed_at ?? "",
    review.take.created_at,
    review.take.id
  ];
}

function compareBestRank(a: RankedTakeReview, b: RankedTakeReview) {
  for (let index = 0; index < a.bestRankKey.length; index += 1) {
    if (a.bestRankKey[index] === b.bestRankKey[index]) {
      continue;
    }

    return a.bestRankKey[index] > b.bestRankKey[index] ? -1 : 1;
  }

  return 0;
}

export function rankTakeReview(review: HydratedTakeReview): RankedTakeReview {
  return {
    ...review,
    bestRankKey: toBestRankKey(review)
  };
}

export function pickBestTake(reviews: HydratedTakeReview[]) {
  if (reviews.length === 0) {
    return null;
  }

  return reviews.map(rankTakeReview).sort(compareBestRank)[0];
}

function weakWordSet(review: ProgressTakeSummary) {
  return new Set(review.weakWords.map((item) => item.word));
}

export function buildTakeDiff(current: ProgressTakeSummary, best: ProgressTakeSummary): TakeDiffSummary {
  const currentWeakWords = weakWordSet(current);
  const bestWeakWords = weakWordSet(best);

  return {
    scoreDelta: current.score - best.score,
    accuracyDelta: current.accuracyScore - best.accuracyScore,
    fluencyDelta: current.fluencyScore - best.fluencyScore,
    rhythmDelta: current.rhythmScore - best.rhythmScore,
    improvedWeakWords: best.weakWords.map((item) => item.word).filter((word) => !currentWeakWords.has(word)),
    regressedWeakWords: current.weakWords.map((item) => item.word).filter((word) => !bestWeakWords.has(word)),
    commonWeakWords: current.weakWords.map((item) => item.word).filter((word) => bestWeakWords.has(word)),
    coachShift: {
      currentSummary: current.coach.summaryJa,
      bestSummary: best.coach.summaryJa
    }
  };
}

function getImprovementTrend(latest: ProgressTakeSummary | null, previous: ProgressTakeSummary | null): ScriptProgressItem["improvementTrend"] {
  if (!latest || !previous) {
    return "insufficient_data";
  }

  if (latest.score > previous.score) {
    return "up";
  }

  if (latest.score < previous.score) {
    return "down";
  }

  return "flat";
}

async function getHydratedReviews(client: AppSupabaseClient, userId: string) {
  const [{ data: takes, error: takesError }, { data: weakWords, error: weakWordsError }, { data: coachFeedback, error: coachFeedbackError }] =
    await Promise.all([
      asMany<TakeRow>(await client.from("takes").select("*").eq("user_id", userId).order("created_at", { ascending: false })),
      client
        .from("weak_words")
        .select("*, takes!inner(user_id)")
        .eq("takes.user_id", userId)
        .order("created_at", { ascending: true }),
      client.from("coach_feedback").select("*, takes!inner(user_id)").eq("takes.user_id", userId)
    ]);

  if (takesError) {
    throw mapProgressError("take 一覧取得", takesError);
  }

  if (weakWordsError) {
    throw mapProgressError("weak_words 取得", weakWordsError);
  }

  if (coachFeedbackError) {
    throw mapProgressError("coach_feedback 取得", coachFeedbackError);
  }

  const weakWordsByTakeId = new Map<string, WeakWordRow[]>();
  for (const row of (weakWords ?? []) as Array<WeakWordRow & { takes: { user_id: string } }>) {
    const list = weakWordsByTakeId.get(row.take_id) ?? [];
    list.push({
      id: row.id,
      take_id: row.take_id,
      word: row.word,
      score: row.score,
      note: row.note,
      created_at: row.created_at
    });
    weakWordsByTakeId.set(row.take_id, list);
  }

  const coachByTakeId = new Map<string, CoachFeedbackRow>();
  for (const row of (coachFeedback ?? []) as Array<CoachFeedbackRow & { takes: { user_id: string } }>) {
    coachByTakeId.set(row.take_id, {
      id: row.id,
      take_id: row.take_id,
      locale: row.locale,
      title: row.title,
      summary: row.summary,
      bullets: row.bullets,
      next_step: row.next_step,
      focus_words: row.focus_words,
      created_at: row.created_at
    });
  }

  return (takes ?? []).map((take) =>
    hydrateStoredReview(
      toStoredTakeReview(
        take,
        weakWordsByTakeId.get(take.id) ?? [],
        coachByTakeId.get(take.id) ?? null
      )
    )
  );
}

function toScriptProgressItem(script: ScriptListItem, reviews: HydratedTakeReview[]): ScriptProgressItem {
  const sortedByCreated = [...reviews].sort((a, b) => (a.take.created_at < b.take.created_at ? 1 : -1));
  const latest = sortedByCreated[0] ? toProgressTakeSummary(sortedByCreated[0]) : null;
  const previous = sortedByCreated[1] ? toProgressTakeSummary(sortedByCreated[1]) : null;
  const best = pickBestTake(reviews);
  const bestSummary = best ? toProgressTakeSummary(best) : null;

  return {
    script: {
      id: script.id,
      title: script.title,
      content: script.content,
      locale: script.locale,
      targetSeconds: script.targetSeconds,
      updatedAt: script.updatedAt
    },
    takeCount: reviews.length,
    latestTake: latest,
    bestTake: bestSummary,
    previousTake: previous,
    latestVsPrevious: latest && previous ? buildTakeDiff(latest, previous) : null,
    latestVsBest: latest && bestSummary && latest.id !== bestSummary.id ? buildTakeDiff(latest, bestSummary) : null,
    improvementTrend: getImprovementTrend(latest, previous)
  };
}

export async function getProgressOverview(client: AppSupabaseClient, userId: string): Promise<ProgressOverview> {
  const [scripts, hydratedReviews] = await Promise.all([listScripts(client, userId), getHydratedReviews(client, userId)]);
  const reviewsByScriptId = new Map<string, HydratedTakeReview[]>();

  for (const review of hydratedReviews) {
    const list = reviewsByScriptId.get(review.take.script_id) ?? [];
    list.push(review);
    reviewsByScriptId.set(review.take.script_id, list);
  }

  const scriptItems = scripts.map((script) => toScriptProgressItem(script, reviewsByScriptId.get(script.id) ?? []));

  return {
    scripts: scriptItems,
    totalScripts: scripts.length,
    totalReviewedTakes: hydratedReviews.length,
    bestTakeCount: scriptItems.filter((item) => item.bestTake).length
  };
}

export async function getScriptTakeComparison(client: AppSupabaseClient, userId: string, scriptId: string, takeId: string) {
  const reviews = (await getHydratedReviews(client, userId)).filter((review) => review.take.script_id === scriptId);
  const current = reviews.find((review) => review.take.id === takeId);

  if (!current) {
    return null;
  }

  const best = pickBestTake(reviews);
  const currentSummary = toProgressTakeSummary(current);
  const bestSummary = best ? toProgressTakeSummary(best) : null;

  return {
    current: currentSummary,
    best: bestSummary,
    isBest: Boolean(bestSummary && bestSummary.id === currentSummary.id),
    diff: bestSummary && bestSummary.id !== currentSummary.id ? buildTakeDiff(currentSummary, bestSummary) : null,
    takeCount: reviews.length
  };
}
