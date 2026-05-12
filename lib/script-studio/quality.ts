import { createPracticeChunks } from "@/lib/script-practice-chunks";
import { analyzeScriptPracticeReadiness } from "@/lib/script-practice-readiness";
import type {
  AnalyzeScriptDraftOptions,
  NormalizedScriptBrief,
  ScriptBrief,
  ScriptDraft,
  ScriptFreezeReadiness,
  ScriptQualityReport,
  ScriptQualityReportOptions,
  ScriptStudioChunk,
  ScriptStudioFocusWord,
  ScriptStudioReadinessStatus,
  ScriptStudioRevisionHint
} from "@/lib/script-studio/types";

const DEFAULT_TARGET_SECONDS = 60;
const EXTREME_LONG_GRACE_SECONDS = 25;
const EXTREME_LONG_SENTENCE_COUNT = 3;
const EXTREME_LONG_CHUNK_COUNT = 5;

export function normalizeScriptBrief(input: ScriptBrief = {}): NormalizedScriptBrief {
  return {
    userSeedText: normalizeInlineText(input.userSeedText ?? ""),
    topicCategory: input.topicCategory,
    situation: input.situation,
    audience: input.audience,
    tone: input.tone ?? "friendly",
    targetLengthSeconds: normalizeTargetSeconds(input.targetLengthSeconds),
    difficulty: input.difficulty ?? "standard",
    priority: input.priority ?? "speakability",
    mustInclude: normalizeTextList(input.mustInclude ?? []),
    avoid: normalizeTextList(input.avoid ?? []),
    languagePreference: input.languagePreference ?? "japanese_summary_supported"
  };
}

export function buildScriptQualityReport(scriptText: string, options: ScriptQualityReportOptions = {}): ScriptQualityReport {
  const brief = normalizeScriptBrief(options.brief);
  const targetSeconds = normalizeTargetSeconds(options.targetLengthSeconds ?? brief.targetLengthSeconds);
  const normalizedScript = normalizeScriptText(scriptText);
  const readiness = analyzeScriptPracticeReadiness(normalizedScript, targetSeconds);
  const chunks = createPracticeChunks(normalizedScript).map(toScriptStudioChunk);
  const focusWords = normalizeFocusWords(options.focusWords ?? inferFocusWordsFromBrief(brief));
  const estimatedSpeakingTime = {
    naturalSeconds: readiness.estimatedNaturalSeconds,
    practiceSeconds: readiness.estimatedPracticeSeconds,
    targetSeconds: readiness.targetSeconds,
    practiceDeltaSeconds: readiness.estimatedPracticeSeconds - readiness.targetSeconds
  };
  const revisionHints = readiness.manualRevisionHints.map<ScriptStudioRevisionHint>((hint) => ({
    ...hint,
    blockingLevel: hint.kind === "focus" ? "none" : "warning"
  }));
  const warnings = getQualityWarnings({
    readinessStatus: getReadinessStatus(readiness.tone, readiness.estimatedPracticeSeconds, readiness.targetSeconds),
    longSentenceCount: readiness.longSentenceCount,
    longChunkCount: readiness.longChunkCount,
    breathPointCount: readiness.breathPointCount,
    focusWordCount: focusWords.length,
    nextActionsJa: readiness.nextActionsJa
  });
  const blockingReasons = getQualityBlockingReasons({
    wordCount: readiness.wordCount,
    estimatedPracticeSeconds: readiness.estimatedPracticeSeconds,
    targetSeconds: readiness.targetSeconds,
    longSentenceCount: readiness.longSentenceCount,
    longChunkCount: readiness.longChunkCount,
    focusWordCount: focusWords.length
  });

  return {
    readinessStatus: getReadinessStatus(readiness.tone, readiness.estimatedPracticeSeconds, readiness.targetSeconds),
    readiness,
    wordCount: readiness.wordCount,
    estimatedSpeakingTime,
    sentenceCount: readiness.sentenceCount,
    chunkCount: chunks.length,
    longSentenceCount: readiness.longSentenceCount,
    longChunkCount: readiness.longChunkCount,
    breathPointCount: readiness.breathPointCount,
    focusWordCount: focusWords.length,
    chunks,
    revisionHints,
    warnings,
    blockingReasons,
    ttsFriendliness: {
      status: "placeholder",
      notesJa: getTtsFriendlinessNotes(readiness.longSentenceCount, readiness.longChunkCount)
    },
    userIntentPreservation: {
      status: "placeholder",
      notesJa: getIntentPreservationNotes(brief)
    }
  };
}

export function analyzeScriptDraft(
  scriptText: string,
  briefInput: ScriptBrief = {},
  options: AnalyzeScriptDraftOptions = {}
): ScriptDraft {
  const brief = normalizeScriptBrief(briefInput);
  const englishScript = normalizeScriptText(scriptText);
  const quality = buildScriptQualityReport(englishScript, {
    brief,
    targetLengthSeconds: brief.targetLengthSeconds,
    focusWords: options.focusWords ?? inferFocusWordsFromBrief(brief)
  });
  const focusWords = normalizeFocusWords(options.focusWords ?? inferFocusWordsFromBrief(brief));

  return {
    title: normalizeInlineText(options.title ?? inferDraftTitle(brief)),
    englishScript,
    japaneseSummary: normalizeInlineText(options.japaneseSummary ?? ""),
    tone: brief.tone,
    targetLengthSeconds: brief.targetLengthSeconds,
    estimatedSpeakingTime: quality.estimatedSpeakingTime,
    wordCount: quality.wordCount,
    chunks: quality.chunks,
    focusWords,
    readiness: quality,
    revisionHints: quality.revisionHints,
    generationNotes: normalizeTextList([
      "Phase S1 local analysis only. No AI generation has run.",
      ...normalizeTextList(options.generationNotes ?? [])
    ])
  };
}

export function getScriptFreezeReadiness(draft: ScriptDraft): ScriptFreezeReadiness {
  const warnings = [...draft.readiness.warnings];
  const blockingReasons = [...draft.readiness.blockingReasons];

  if (draft.focusWords.length === 0 && draft.wordCount > 0) {
    blockingReasons.push("focus words を1〜3個選ぶ");
  }

  if (draft.focusWords.length > 3) {
    blockingReasons.push("focus words を1〜3個に絞る");
  }

  if (draft.revisionHints.some((hint) => hint.blockingLevel === "blocking")) {
    blockingReasons.push("blocking level の revision hint を先に確認する");
  }

  const uniqueBlockingReasons = uniqueStrings(blockingReasons);
  const uniqueWarnings = uniqueStrings(warnings);

  return {
    canFreeze: uniqueBlockingReasons.length === 0,
    blockingReasons: uniqueBlockingReasons,
    warnings: uniqueWarnings,
    nextAction: getFreezeNextAction(uniqueBlockingReasons, uniqueWarnings)
  };
}

function getQualityWarnings(input: {
  readinessStatus: ScriptStudioReadinessStatus;
  longSentenceCount: number;
  longChunkCount: number;
  breathPointCount: number;
  focusWordCount: number;
  nextActionsJa: string[];
}) {
  const warnings = [...input.nextActionsJa];

  if (input.readinessStatus === "too_short") {
    warnings.push("短めなので、必要なら理由か具体例を1文だけ足す");
  }

  if (input.longSentenceCount > 0) {
    warnings.push("長い文は freeze 前に2文へ分ける候補");
  }

  if (input.longChunkCount > 0) {
    warnings.push("長い chunk は comma か period で分ける候補");
  }

  if (input.breathPointCount === 0) {
    warnings.push("息継ぎポイントを1つ以上作る");
  }

  if (input.focusWordCount === 0) {
    warnings.push("freeze 前に focus words を1〜3個選ぶ");
  }

  if (input.focusWordCount > 3) {
    warnings.push("focus words が多いので1〜3個へ絞る");
  }

  return uniqueStrings(warnings).slice(0, 6);
}

function getQualityBlockingReasons(input: {
  wordCount: number;
  estimatedPracticeSeconds: number;
  targetSeconds: number;
  longSentenceCount: number;
  longChunkCount: number;
  focusWordCount: number;
}) {
  const reasons: string[] = [];

  if (input.wordCount === 0) {
    reasons.push("台本本文を入れる");
  }

  if (input.estimatedPracticeSeconds > input.targetSeconds + EXTREME_LONG_GRACE_SECONDS) {
    reasons.push("1分練習から大きく外れているので短くする");
  }

  if (input.longSentenceCount >= EXTREME_LONG_SENTENCE_COUNT) {
    reasons.push("長すぎる文が多いので分ける");
  }

  if (input.longChunkCount >= EXTREME_LONG_CHUNK_COUNT) {
    reasons.push("長すぎる意味の塊が多いので区切る");
  }

  if (input.focusWordCount > 3) {
    reasons.push("focus words を1〜3個に絞る");
  }

  return uniqueStrings(reasons);
}

function getReadinessStatus(
  tone: ScriptQualityReport["readiness"]["tone"],
  estimatedPracticeSeconds: number,
  targetSeconds: number
): ScriptStudioReadinessStatus {
  if (tone === "empty") {
    return "empty";
  }

  if (estimatedPracticeSeconds > targetSeconds + 12) {
    return "too_long";
  }

  if (estimatedPracticeSeconds > 0 && estimatedPracticeSeconds < Math.max(25, targetSeconds * 0.45)) {
    return "too_short";
  }

  if (tone === "notice" || tone === "alert") {
    return "needs_small_edit";
  }

  return "ready";
}

function getTtsFriendlinessNotes(longSentenceCount: number, longChunkCount: number) {
  const notes = ["TTS friendliness は Phase S1 では placeholder。長さと区切りだけを安全な目安として見る。"];

  if (longSentenceCount > 0) {
    notes.push("長い文があるため、見本音声では読み上げが速く聞こえる可能性がある。");
  }

  if (longChunkCount > 0) {
    notes.push("長い chunk があるため、息継ぎ位置を増やすと聞き取りやすい。");
  }

  return notes;
}

function getIntentPreservationNotes(brief: NormalizedScriptBrief) {
  const notes = ["user intent preservation は Phase S1 では placeholder。生成結果との意味照合はまだ行わない。"];

  if (brief.mustInclude.length > 0) {
    notes.push("将来の生成では mustInclude が draft に残っているか確認する。");
  }

  if (brief.priority === "accuracy") {
    notes.push("priority が正確さなので、意味の欠落確認を優先する。");
  }

  return notes;
}

function getFreezeNextAction(blockingReasons: string[], warnings: string[]) {
  if (blockingReasons.length > 0) {
    return blockingReasons[0];
  }

  if (warnings.length > 0) {
    return "warning を確認してから「この台本で練習開始」へ進む";
  }

  return "この台本で練習開始";
}

function inferFocusWordsFromBrief(brief: NormalizedScriptBrief) {
  return brief.mustInclude.slice(0, 3).map<ScriptStudioFocusWord>((text) => ({
    text,
    source: "brief",
    reasonJa: "mustInclude から仮の focus word として扱う"
  }));
}

function normalizeFocusWords(words: Array<string | ScriptStudioFocusWord>) {
  const seen = new Set<string>();
  const normalizedWords: ScriptStudioFocusWord[] = [];

  for (const item of words) {
    const focusWord = typeof item === "string" ? { text: item, source: "user" as const } : item;
    const text = normalizeInlineText(focusWord.text);
    const key = text.toLowerCase();

    if (!text || seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalizedWords.push({
      ...focusWord,
      text
    });
  }

  return normalizedWords.slice(0, 6);
}

function toScriptStudioChunk(chunk: { index: number; text: string; wordCount: number; cueJa: string }): ScriptStudioChunk {
  return {
    index: chunk.index,
    text: chunk.text,
    wordCount: chunk.wordCount,
    cueJa: chunk.cueJa
  };
}

function inferDraftTitle(brief: NormalizedScriptBrief) {
  if (brief.topicCategory) {
    return `Script Studio draft: ${brief.topicCategory}`;
  }

  if (brief.userSeedText) {
    return `Script Studio draft: ${brief.userSeedText.split(/\s+/).slice(0, 6).join(" ")}`;
  }

  return "Script Studio draft";
}

function normalizeTargetSeconds(value: number | undefined) {
  if (!Number.isFinite(value) || !value || value <= 0) {
    return DEFAULT_TARGET_SECONDS;
  }

  return Math.round(value);
}

function normalizeScriptText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeInlineText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeTextList(values: string[]) {
  return uniqueStrings(values.map(normalizeInlineText).filter(Boolean));
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const key = value.toLowerCase();

    if (!value || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(value);
  }

  return result;
}
