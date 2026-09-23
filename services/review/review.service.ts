import { randomUUID } from "node:crypto";
import { AppError } from "@/lib/errors";
import { timeAsync, timeSync } from "@/lib/performance/timing";
import type { AppSupabaseClient } from "@/lib/supabase/client";
import type { Database, Json } from "@/types/database";
import type { CoachFeedback } from "@/services/coach";
import { createMockCoachFeedback, type CoachInput } from "@/services/coach";
import type { EvaluateRequestInput } from "@/schemas/evaluate";
import { createPronunciationEvaluator, type EvaluateResult } from "@/services/pronunciation";
import { getScript, assertPracticeScript, mapScriptStateError, ScriptStateError } from "@/services/scripts/scripts.service";
import { assertCurrentProcessingConsent } from "@/services/consent";
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
export type ReviewTakeClaimResult =
  | "claimed"
  | "processing"
  | "reviewed"
  | "conflict";

export type ReviewTakeClaimInput = {
  expectedRevisionId: string;
  expectedPracticeEpoch: number;
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
    // This is the provider-processing boundary for every Web and Mobile
    // evaluation path. Upload has a separate earlier guard.
    await assertCurrentProcessingConsent(client, userId, "pronunciation_processing");
    const transcription = createTranscriptionProvider();
    const evaluator = createPronunciationEvaluator();
    const script = await timeAsync("evaluate.script", () => getScript(client, userId, input.scriptId));

    if (!script) {
      throw new AppError(404, "台本が見つかりませんでした。");
    }

    assertPracticeScript(script, input);
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
        locale: script.locale
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
    throw mapScriptStateError(error);
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

  const scriptSnapshot = await getReviewScriptSnapshot(client, take);
  return {
    take,
    scriptSnapshot,
    weakWords: (weakWords ?? []).map(toStoredWeakWord),
    coachFeedback
  };
}

export async function getReviewScriptSnapshot(client: AppSupabaseClient, take: TakeRow) {
  let scriptSnapshot: StoredTakeReview["scriptSnapshot"] = null;
  if (take.script_revision_id) {
    const { data: revision, error } = await client.from("script_revisions").select("*").eq("script_id", take.script_id).eq("id", take.script_revision_id).maybeSingle() as unknown as { data: Database["public"]["Tables"]["script_revisions"]["Row"] | null; error: unknown };
    if (error || !revision) throw new AppError(500, "保存時の台本を確認できませんでした。");
    scriptSnapshot = { revisionId: revision.id, revisionNo: revision.revision_no, title: take.script_title_snapshot ?? "保存時の台本", content: revision.content, locale: revision.locale, targetSeconds: revision.target_seconds };
  }
  return scriptSnapshot;
}

export async function createPersistedReview(client: AppSupabaseClient, userId: string, input: EvaluateRequestInput, alreadyClaimed = false) {
  return timeAsync("evaluate.persistedReview", async () => {
    input = { ...input, takeId: input.takeId ?? randomUUID() };
    const claimInput = { takeId: input.takeId!, scriptId: input.scriptId, audioPath: toAudioPath(input, input.takeId!), expectedRevisionId: input.expectedRevisionId, expectedPracticeEpoch: input.expectedPracticeEpoch };
    if (!alreadyClaimed) {
      const claim = await claimReviewTake(client, userId, claimInput);
      if (claim === "reviewed") {
        const stored = await getStoredReview(client, userId, input.scriptId, input.takeId!);
        if (!stored) throw new ScriptStateError("review_claim_conflict");
        const hydrated = hydrateStoredReview(stored);
        return { takeId: hydrated.take.id, transcriptText: hydrated.take.transcript_text ?? "", evaluation: hydrated.evaluation, coach: hydrated.coach, storedReview: hydrated };
      }
      if (claim !== "claimed") throw new ScriptStateError("review_claim_conflict");
    }
    try {
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
    } catch (error) {
      if (!alreadyClaimed) await releaseReviewTakeClaim(client, userId, claimInput);
      throw error;
    }
  });
}

export async function claimReviewTake(client: AppSupabaseClient, _userId: string, input: ReviewTakeClaimInput): Promise<ReviewTakeClaimResult> {
  const rpc = client as unknown as { rpc(name: "claim_review_take", args: Database["public"]["Functions"]["claim_review_take"]["Args"]): Promise<{ data: string; error: { message: string } | null }> };
  const { data, error } = await rpc.rpc("claim_review_take", { p_take_id: input.takeId, p_script_id: input.scriptId,
    p_audio_path: input.audioPath, p_revision_id: input.expectedRevisionId, p_epoch: input.expectedPracticeEpoch });
  if (error) throw mapScriptStateError(error);
  if (!["claimed", "processing", "reviewed", "conflict"].includes(data)) throw new AppError(500, "録音の保存状態を確認できませんでした。");
  return data as ReviewTakeClaimResult;
}
export async function releaseReviewTakeClaim(client: AppSupabaseClient, _userId: string, input: ReviewTakeClaimInput) {
  const rpc = client as unknown as { rpc(name: "release_review_take_claim", args: Database["public"]["Functions"]["release_review_take_claim"]["Args"]): Promise<{ error: unknown }> };
  const { error } = await rpc.rpc("release_review_take_claim", { p_take_id: input.takeId, p_script_id: input.scriptId, p_audio_path: input.audioPath });
  if (error) console.warn("Pending review take claim could not be released");
}

export async function getStoredReview(client: AppSupabaseClient, userId: string, scriptId: string, takeId: string): Promise<StoredTakeReview | null> {
  return timeAsync("review.storedReview", async () => {
    const { data: take, error } = await client
      .from("takes")
      .select("*")
      .eq("id", takeId)
      .eq("user_id", userId)
      .eq("script_id", scriptId)
      .in("status", ["reviewed", "completed"])
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
      .in("status", ["reviewed", "completed"])
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
