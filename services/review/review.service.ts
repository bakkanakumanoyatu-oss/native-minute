import { randomUUID } from "node:crypto";
import { AppError } from "@/lib/errors";
import { timeAsync, timeSync } from "@/lib/performance/timing";
import type { AppSupabaseClient } from "@/lib/supabase/client";
import type { Database, Json } from "@/types/database";
import type { CoachFeedback } from "@/services/coach";
import { createMockCoachFeedback, type CoachInput } from "@/services/coach";
import type { EvaluateRequestInput } from "@/schemas/evaluate";
import { createPronunciationEvaluator, type EvaluateResult } from "@/services/pronunciation";
import { getScript } from "@/services/scripts/scripts.service";
import { createTranscriptionProvider } from "@/services/transcription";
import { createRecordingAudioPath, loadOwnedRecordingForEvaluation } from "@/services/storage";
import type { HydratedTakeReview, ReviewArtifacts, StoredTakeReview, StoredWeakWord } from "./types";

type PersistReviewBundleArgs = Database["public"]["Functions"]["persist_review_bundle"]["Args"];
type TakeRow = Database["public"]["Tables"]["takes"]["Row"];
type CoachFeedbackRow = Database["public"]["Tables"]["coach_feedback"]["Row"];
type PersistReviewRpcClient = {
  rpc(
    fn: "persist_review_bundle",
    args: PersistReviewBundleArgs
  ): Promise<{ data: string | null; error: { message: string } | null }>;
};
type PostgrestErrorLike = { message: string; code?: string };
type ReviewTakeClaimRow = Pick<TakeRow, "script_id" | "audio_path" | "status">;
type ReviewTakeClaimTable = {
  insert(values: Database["public"]["Tables"]["takes"]["Insert"]): Promise<{
    error: PostgrestErrorLike | null;
  }>;
  select(columns: string): {
    eq(column: string, value: string): ReturnType<ReviewTakeClaimTable["select"]>;
    maybeSingle(): Promise<{
      data: ReviewTakeClaimRow | null;
      error: PostgrestErrorLike | null;
    }>;
  };
};

export type ReviewTakeClaimResult =
  | "claimed"
  | "processing"
  | "reviewed"
  | "conflict";

export type ReviewTakeClaimInput = {
  takeId: string;
  scriptId: string;
  audioPath: string;
};

function toStoredWeakWord(row: Database["public"]["Tables"]["weak_words"]["Row"]): StoredWeakWord {
  return row;
}

function toJson(value: unknown): Json {
  return value as Json;
}

function toStringArray(value: Json | null | undefined) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function countWords(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function toAudioPath(input: EvaluateRequestInput, takeId: string) {
  if (input.audioPath) {
    return input.audioPath;
  }

  if (input.audioStorageKey) {
    return createRecordingAudioPath(input.audioStorageKey);
  }

  return `mock/${takeId}.wav`;
}

function toCoachFromRow(row: CoachFeedbackRow | null): CoachFeedback {
  if (!row) {
    return {
      titleJa: "日本語コーチング",
      summaryJa: "コーチング結果はまだ保存されていません。",
      bulletPointsJa: [],
      nextStepJa: "Record から再度評価してください。",
      focusWords: []
    };
  }

  return {
    titleJa: row.title,
    summaryJa: row.summary,
    bulletPointsJa: toStringArray(row.bullets),
    nextStepJa: row.next_step,
    focusWords: toStringArray(row.focus_words)
  };
}

function toEvaluationFromStoredReview(review: StoredTakeReview): EvaluateResult {
  return {
    score: review.take.score ?? 0,
    accuracyScore: review.take.accuracy_score ?? 0,
    fluencyScore: review.take.fluency_score ?? 0,
    rhythmScore: review.take.rhythm_score ?? 0,
    summaryJa: review.take.evaluation_summary_ja ?? "評価コメントはまだ保存されていません。",
    strengthsJa: toStringArray(review.take.evaluation_strengths_ja),
    weakWords: review.weakWords.map((word) => ({
      word: word.word,
      score: word.score ?? 0,
      note: word.note ?? ""
    })),
    scriptWordCount: review.take.total_words ?? 0,
    transcriptWordCount: countWords(review.take.transcript_text)
  };
}

export function hydrateStoredReview(review: StoredTakeReview): HydratedTakeReview {
  return {
    ...review,
    evaluation: toEvaluationFromStoredReview(review),
    coach: toCoachFromRow(review.coachFeedback)
  };
}

export async function createReviewArtifacts(
  client: AppSupabaseClient,
  userId: string,
  input: EvaluateRequestInput
): Promise<ReviewArtifacts> {
  return timeAsync("evaluate.artifacts", async () => {
    const takeId = input.takeId ?? randomUUID();
    const transcription = createTranscriptionProvider();
    const evaluator = createPronunciationEvaluator();
    const script = await timeAsync("evaluate.script", () => getScript(client, userId, input.scriptId));

    if (!script) {
      throw new AppError(404, "台本が見つかりませんでした。");
    }

    const recording = await timeAsync("evaluate.audioInput", () =>
      loadOwnedRecordingForEvaluation(client, userId, input.scriptId, {
        audioPath: input.audioPath,
        audioStorageKey: input.audioStorageKey
      })
    );
    const durationSeconds = recording?.durationSeconds ?? input.durationSeconds ?? null;

    const transcriptionResult = await timeAsync("evaluate.transcription", () =>
      transcription.transcribe({
        audioFile: recording
          ? {
              filename: recording.filename,
              contentType: recording.contentType,
              bytes: recording.bytes
            }
          : undefined,
        audioPath: recording?.audioPath ?? input.audioPath,
        audioStorageKey: recording?.audioStorageKey ?? input.audioStorageKey,
        transcriptText: input.transcriptText,
        locale: input.locale
      })
    );

    const evaluation = await timeAsync("evaluate.pronunciation", () =>
      evaluator.evaluate({
        scriptText: script.content,
        transcript: transcriptionResult.transcriptText,
        durationSeconds: durationSeconds ?? undefined,
        targetSeconds: script.targetSeconds,
        locale: script.locale,
        audioFile: recording
          ? {
              filename: recording.filename,
              contentType: recording.contentType,
              bytes: recording.bytes,
              audioPath: recording.audioPath,
              audioStorageKey: recording.audioStorageKey
            }
          : undefined,
        audioPath: recording?.audioPath ?? input.audioPath,
        audioStorageKey: recording?.audioStorageKey ?? input.audioStorageKey
      })
    );

    const coach = timeSync("evaluate.coach", () =>
      createMockCoachFeedback({
        scriptText: script.content,
        transcript: transcriptionResult.transcriptText,
        evaluation,
        locale: script.locale
      } satisfies CoachInput)
    );

    return {
      takeId,
      audioPath: recording?.audioPath ?? toAudioPath(input, takeId),
      durationSeconds,
      transcriptText: transcriptionResult.transcriptText,
      evaluation,
      coach
    };
  });
}

async function persistReviewBundle(
  client: AppSupabaseClient,
  input: EvaluateRequestInput,
  review: ReviewArtifacts
) {
  const rpcArgs: PersistReviewBundleArgs = {
    p_take_id: review.takeId,
    p_script_id: input.scriptId,
    p_audio_path: review.audioPath,
    p_duration_seconds: review.durationSeconds,
    p_status: "reviewed",
    p_score: review.evaluation.score,
    p_total_words: review.evaluation.scriptWordCount,
    p_transcript_text: review.transcriptText,
    p_accuracy_score: review.evaluation.accuracyScore,
    p_fluency_score: review.evaluation.fluencyScore,
    p_rhythm_score: review.evaluation.rhythmScore,
    p_evaluation_summary_ja: review.evaluation.summaryJa,
    p_evaluation_strengths_ja: toJson(review.evaluation.strengthsJa),
    p_evaluation_payload: toJson(review.evaluation),
    p_coach_feedback_payload: toJson(review.coach),
    p_coach_title: review.coach.titleJa,
    p_coach_summary: review.coach.summaryJa,
    p_coach_bullets: toJson(review.coach.bulletPointsJa),
    p_coach_next_step: review.coach.nextStepJa,
    p_coach_focus_words: toJson(review.coach.focusWords),
    p_weak_words: toJson(review.evaluation.weakWords)
  };

  const rpcClient = client as unknown as PersistReviewRpcClient;
  const { data, error } = await timeAsync("evaluate.persistenceRpc", () => rpcClient.rpc("persist_review_bundle", rpcArgs));

  if (error) {
    throw new AppError(500, `review の保存に失敗しました。${error.message}`);
  }

  if (!data) {
    throw new AppError(500, "review の保存結果が返りませんでした。");
  }

  return data;
}

async function loadStoredReview(client: AppSupabaseClient, take: TakeRow): Promise<StoredTakeReview> {
  const [{ data: weakWords, error: weakWordsError }, { data: coachFeedback, error: coachFeedbackError }] = await timeAsync("review.loadStoredReview", () =>
    Promise.all([
      client.from("weak_words").select("*").eq("take_id", take.id).order("created_at", { ascending: true }),
      client.from("coach_feedback").select("*").eq("take_id", take.id).maybeSingle()
    ])
  );

  if (weakWordsError) {
    throw new AppError(500, `weak_words の取得に失敗しました。${weakWordsError.message}`);
  }

  if (coachFeedbackError) {
    throw new AppError(500, `coach_feedback の取得に失敗しました。${coachFeedbackError.message}`);
  }

  return {
    take,
    weakWords: (weakWords ?? []).map(toStoredWeakWord),
    coachFeedback
  };
}

export async function createPersistedReview(client: AppSupabaseClient, userId: string, input: EvaluateRequestInput) {
  return timeAsync("evaluate.persistedReview", async () => {
    const reviewArtifacts = await createReviewArtifacts(client, userId, input);
    const takeId = await persistReviewBundle(client, input, reviewArtifacts);
    const storedReview = await timeAsync("evaluate.refetchStoredReview", () => getStoredReview(client, userId, input.scriptId, takeId));

    if (!storedReview) {
      throw new AppError(500, "保存した take を再取得できませんでした。");
    }

    const hydrated = hydrateStoredReview(storedReview);

    return {
      takeId: hydrated.take.id,
      transcriptText: hydrated.take.transcript_text ?? reviewArtifacts.transcriptText,
      evaluation: hydrated.evaluation,
      coach: hydrated.coach,
      storedReview: hydrated
    };
  });
}

export async function claimReviewTake(
  client: AppSupabaseClient,
  userId: string,
  input: ReviewTakeClaimInput
): Promise<ReviewTakeClaimResult> {
  return timeAsync("evaluate.claim", async () => {
    const takes = client.from("takes") as unknown as ReviewTakeClaimTable;
    const { error: insertError } = await takes.insert({
      id: input.takeId,
      script_id: input.scriptId,
      user_id: userId,
      audio_path: input.audioPath,
      status: "pending"
    });

    if (!insertError) {
      return "claimed";
    }

    if (insertError.code !== "23505") {
      throw new AppError(500, `take claim の保存に失敗しました。${insertError.message}`);
    }

    const { data: existing, error: existingError } = await takes
      .select("script_id, audio_path, status")
      .eq("id", input.takeId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existingError) {
      throw new AppError(500, `take claim の確認に失敗しました。${existingError.message}`);
    }

    if (
      !existing ||
      existing.script_id !== input.scriptId ||
      existing.audio_path !== input.audioPath
    ) {
      return "conflict";
    }

    if (existing.status === "reviewed") {
      return "reviewed";
    }

    return existing.status === "pending" ? "processing" : "conflict";
  });
}

export async function releaseReviewTakeClaim(
  client: AppSupabaseClient,
  userId: string,
  input: ReviewTakeClaimInput
) {
  const { error } = await client
    .from("takes")
    .delete()
    .eq("id", input.takeId)
    .eq("user_id", userId)
    .eq("script_id", input.scriptId)
    .eq("audio_path", input.audioPath)
    .eq("status", "pending");

  if (error) {
    console.warn("Pending review take claim could not be released");
  }
}

export async function getStoredReview(client: AppSupabaseClient, userId: string, scriptId: string, takeId: string): Promise<StoredTakeReview | null> {
  return timeAsync("review.storedReview", async () => {
    const { data: take, error } = await client
      .from("takes")
      .select("*")
      .eq("id", takeId)
      .eq("user_id", userId)
      .eq("script_id", scriptId)
      .eq("status", "reviewed")
      .maybeSingle();

    if (error) {
      throw new AppError(500, `take の取得に失敗しました。${error.message}`);
    }

    if (!take) {
      return null;
    }

    return loadStoredReview(client, take);
  });
}

export async function getStoredReviewByTakeId(client: AppSupabaseClient, userId: string, takeId: string): Promise<StoredTakeReview | null> {
  return timeAsync("review.storedReviewByTakeId", async () => {
    const { data: take, error } = await client
      .from("takes")
      .select("*")
      .eq("id", takeId)
      .eq("user_id", userId)
      .eq("status", "reviewed")
      .maybeSingle();

    if (error) {
      throw new AppError(500, `take の取得に失敗しました。${error.message}`);
    }

    if (!take) {
      return null;
    }

    return loadStoredReview(client, take);
  });
}

export async function getPersistedCoach(client: AppSupabaseClient, userId: string, takeId: string) {
  const storedReview = await getStoredReviewByTakeId(client, userId, takeId);

  if (!storedReview) {
    return null;
  }

  return hydrateStoredReview(storedReview).coach;
}
