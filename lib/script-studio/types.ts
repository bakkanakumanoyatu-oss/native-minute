import type { ScriptManualRevisionHintKind, ScriptPracticeReadiness } from "@/lib/script-practice-readiness";

export type ScriptStudioPriority = "accuracy" | "speakability" | "self_likeness" | "native_likeness";
export type ScriptStudioTone = "friendly" | "calm" | "confident" | "polite" | "casual" | "enthusiastic" | "reflective";
export type ScriptStudioDifficulty = "easy" | "standard" | "challenging";
export type ScriptStudioAudience = "friend" | "colleague" | "teacher" | "customer" | "interviewer" | "group" | "general_listener";
export type ScriptStudioSituation =
  | "meeting"
  | "self_introduction"
  | "travel"
  | "small_talk"
  | "presentation"
  | "lesson"
  | "interview"
  | "daily_reflection";
export type ScriptStudioTopicCategory =
  | "work"
  | "study"
  | "travel"
  | "daily_life"
  | "self_introduction"
  | "opinion"
  | "story"
  | "other";
export type ScriptStudioLanguagePreference = "mostly_english" | "simple_english" | "japanese_summary_supported";
export type ScriptStudioReadinessStatus = "empty" | "ready" | "needs_small_edit" | "too_long" | "too_short";

export type ScriptStudioLengthTarget = {
  id: "short_45" | "standard_60" | "extended_75";
  labelJa: string;
  targetLengthSeconds: number;
  descriptionJa: string;
};

export type ScriptBrief = {
  userSeedText?: string;
  topicCategory?: ScriptStudioTopicCategory;
  situation?: ScriptStudioSituation;
  audience?: ScriptStudioAudience;
  tone?: ScriptStudioTone;
  targetLengthSeconds?: number;
  difficulty?: ScriptStudioDifficulty;
  priority?: ScriptStudioPriority;
  mustInclude?: string[];
  avoid?: string[];
  languagePreference?: ScriptStudioLanguagePreference;
};

export type NormalizedScriptBrief = {
  userSeedText: string;
  topicCategory?: ScriptStudioTopicCategory;
  situation?: ScriptStudioSituation;
  audience?: ScriptStudioAudience;
  tone: ScriptStudioTone;
  targetLengthSeconds: number;
  difficulty: ScriptStudioDifficulty;
  priority: ScriptStudioPriority;
  mustInclude: string[];
  avoid: string[];
  languagePreference: ScriptStudioLanguagePreference;
};

export type ScriptStudioChunk = {
  index: number;
  text: string;
  wordCount: number;
  cueJa: string;
};

export type ScriptStudioFocusWord = {
  text: string;
  source: "user" | "draft" | "brief" | "quality_gate";
  reasonJa?: string;
};

export type ScriptStudioRevisionHint = {
  kind: ScriptManualRevisionHintKind | "tone";
  labelJa: string;
  summaryJa: string;
  excerptJa?: string;
  blockingLevel: "none" | "warning" | "blocking";
};

export type ScriptStudioEstimatedSpeakingTime = {
  naturalSeconds: number;
  practiceSeconds: number;
  targetSeconds: number;
  practiceDeltaSeconds: number;
};

export type ScriptStudioPlaceholderCheck = {
  status: "placeholder";
  notesJa: string[];
};

export type ScriptQualityReport = {
  readinessStatus: ScriptStudioReadinessStatus;
  readiness: ScriptPracticeReadiness;
  wordCount: number;
  estimatedSpeakingTime: ScriptStudioEstimatedSpeakingTime;
  sentenceCount: number;
  chunkCount: number;
  longSentenceCount: number;
  longChunkCount: number;
  breathPointCount: number;
  focusWordCount: number;
  chunks: ScriptStudioChunk[];
  revisionHints: ScriptStudioRevisionHint[];
  warnings: string[];
  blockingReasons: string[];
  ttsFriendliness: ScriptStudioPlaceholderCheck;
  userIntentPreservation: ScriptStudioPlaceholderCheck;
};

export type ScriptDraft = {
  title: string;
  englishScript: string;
  japaneseSummary: string;
  tone: ScriptStudioTone;
  targetLengthSeconds: number;
  estimatedSpeakingTime: ScriptStudioEstimatedSpeakingTime;
  wordCount: number;
  chunks: ScriptStudioChunk[];
  focusWords: ScriptStudioFocusWord[];
  readiness: ScriptQualityReport;
  revisionHints: ScriptStudioRevisionHint[];
  generationNotes: string[];
};

export type ScriptFreezeReadiness = {
  canFreeze: boolean;
  blockingReasons: string[];
  warnings: string[];
  nextAction: string;
};

export type ScriptQualityReportOptions = {
  targetLengthSeconds?: number;
  focusWords?: Array<string | ScriptStudioFocusWord>;
  brief?: ScriptBrief;
};

export type AnalyzeScriptDraftOptions = {
  title?: string;
  japaneseSummary?: string;
  focusWords?: Array<string | ScriptStudioFocusWord>;
  generationNotes?: string[];
};
