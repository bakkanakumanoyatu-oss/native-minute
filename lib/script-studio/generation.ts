import {
  analyzeScriptDraft,
  buildScriptQualityReport,
  getScriptFreezeReadiness,
  normalizeScriptBrief
} from "@/lib/script-studio/quality";
import type {
  NormalizedScriptBrief,
  ScriptBrief,
  ScriptDraft,
  ScriptFreezeReadiness,
  ScriptQualityReport,
  ScriptStudioFocusWord
} from "@/lib/script-studio/types";

export type ScriptGenerationVariantLimit = {
  requested: number;
  max: number;
};

export type ScriptGenerationGuardrail = {
  id: string;
  labelJa: string;
  instruction: string;
};

export type ScriptGenerationRequest = {
  brief: ScriptBrief;
  requestedVariants?: number;
  boundedAdjustment?: "more_natural" | "more_speakable" | "more_self_like" | "shorter" | "simpler";
};

export type ScriptGenerationPromptPack = {
  systemPrompt: string;
  userPrompt: string;
  outputContract: string;
  variantLimit: ScriptGenerationVariantLimit;
  guardrails: ScriptGenerationGuardrail[];
  brief: NormalizedScriptBrief;
};

export type ScriptGenerationCandidate = {
  title?: string;
  englishScript?: string;
  japaneseSummary?: string;
  focusWords?: string[];
  generationNotes?: string[];
  wordCount?: number;
  estimatedSpeakingTime?: unknown;
  chunks?: unknown;
  readiness?: unknown;
};

export type ScriptGenerationResult = {
  candidates?: ScriptGenerationCandidate[];
};

export type ScriptGenerationIssue = {
  severity: "blocking" | "warning" | "info";
  code: string;
  messageJa: string;
};

export type ScriptGenerationValidationResult = {
  ok: boolean;
  issues: ScriptGenerationIssue[];
  drafts: ScriptDraft[];
  rejectedCandidates: number;
  variantLimit: ScriptGenerationVariantLimit;
};

export type ScriptFreezePreflight = {
  canFreeze: boolean;
  freezeReadiness: ScriptFreezeReadiness;
  qualityReport: ScriptQualityReport;
  issues: ScriptGenerationIssue[];
  nextAction: string;
};

const MAX_GENERATION_VARIANTS = 3;
const DEFAULT_GENERATION_VARIANTS = 2;
const MAX_FOCUS_WORDS = 3;

export const SCRIPT_GENERATION_GUARDRAILS: ScriptGenerationGuardrail[] = [
  {
    id: "native-minute-script",
    labelJa: "Native Minute Script",
    instruction: "Output must be a one-minute English practice script, not a generic translation."
  },
  {
    id: "speakable-length",
    labelJa: "1分で話せる長さ",
    instruction: "Keep the script close to the requested target seconds and avoid dense paragraphs."
  },
  {
    id: "chunkable",
    labelJa: "意味の塊",
    instruction: "Use natural sentence and punctuation boundaries so the script splits into short, meaningful practice chunks."
  },
  {
    id: "focus-words",
    labelJa: "focus words",
    instruction: "Return one to three focus words only."
  },
  {
    id: "breath-points",
    labelJa: "息継ぎ",
    instruction: "Create clear breath points with commas or periods. Avoid breath groups longer than about twelve words."
  },
  {
    id: "intent-preservation",
    labelJa: "意図の保持",
    instruction: "Preserve the user's intent and mustInclude items. Do not invent a different message."
  },
  {
    id: "bounded-variants",
    labelJa: "variant 制限",
    instruction: "Return at most three variants. Regeneration should be controlled by bounded choices."
  }
];

export function buildScriptGenerationPromptPack(request: ScriptGenerationRequest | ScriptBrief): ScriptGenerationPromptPack {
  const normalizedRequest = isScriptGenerationRequest(request) ? request : { brief: request };
  const brief = normalizeScriptBrief(normalizedRequest.brief);
  const variantLimit = normalizeVariantLimit(normalizedRequest.requestedVariants);

  return {
    systemPrompt: buildScriptGenerationSystemPrompt(),
    userPrompt: buildScriptGenerationUserPrompt(brief, normalizedRequest.boundedAdjustment, variantLimit),
    outputContract: buildScriptGenerationOutputContract(),
    variantLimit,
    guardrails: SCRIPT_GENERATION_GUARDRAILS,
    brief
  };
}

export function buildScriptGenerationUserPrompt(
  brief: ScriptBrief | NormalizedScriptBrief,
  boundedAdjustment?: ScriptGenerationRequest["boundedAdjustment"],
  variantLimit = normalizeVariantLimit()
) {
  const normalizedBrief = normalizeScriptBrief(brief);
  const targetWordRange = getTargetWordRange(normalizedBrief.targetLengthSeconds);
  const lines = [
    "Create Native Minute script draft variants from this ScriptBrief.",
    `Return ${variantLimit.requested} variant(s), never more than ${variantLimit.max}.`,
    `userSeedText: ${normalizedBrief.userSeedText || "(empty or still unclear)"}`,
    `topicCategory: ${normalizedBrief.topicCategory ?? "(unset)"}`,
    `situation: ${normalizedBrief.situation ?? "(unset)"}`,
    `audience: ${normalizedBrief.audience ?? "(unset)"}`,
    `tone: ${normalizedBrief.tone}`,
    `targetLengthSeconds: ${normalizedBrief.targetLengthSeconds}`,
    `targetWordRange: ${targetWordRange.min}-${targetWordRange.max} English words. Treat the lower bound as important unless the user explicitly asks for a very short script. If the seed is short, add one concrete reason and one simple example that preserve the user's intent; do not pad with generic filler.`,
    "practiceShape: For a 60 second script, use about 8-12 short connected sentences or clauses that still total the targetWordRange.",
    "chunkShape: Keep each breath group about 6-12 words, separated by commas or periods, so practice chunks are short but not robotic.",
    "sentenceBoundary: If one thought gets long, add a comma or period at a natural thought boundary; do not remove useful concrete detail just to make shorter chunks.",
    `difficulty: ${normalizedBrief.difficulty}`,
    `priority: ${normalizedBrief.priority}`,
    `mustInclude: ${formatListForPrompt(normalizedBrief.mustInclude)}`,
    `avoid: ${formatListForPrompt(normalizedBrief.avoid)}`,
    `languagePreference: ${normalizedBrief.languagePreference}`,
    `boundedAdjustment: ${boundedAdjustment ?? "(none)"}`
  ];

  return lines.join("\n");
}

export function buildScriptGenerationOutputContract() {
  return [
    "Return JSON only.",
    "Shape:",
    "{",
    '  "candidates": [',
    "    {",
    '      "title": "short title",',
    '      "englishScript": "the full English practice script",',
    '      "japaneseSummary": "brief Japanese summary",',
    '      "focusWords": ["one", "to", "three"],',
    '      "generationNotes": ["short note about tradeoffs"]',
    "    }",
    "  ]",
    "}",
    "Do not return more than three candidates.",
    "Focus words must be one to three items.",
    "Do not rely on model-supplied word count, chunks, readiness, or estimated time; the app will recalculate those from englishScript.",
    "Keep sentences short enough for breath points and practice chunks."
  ].join("\n");
}

export function validateScriptGenerationCandidate(
  candidate: ScriptGenerationCandidate,
  briefInput: ScriptBrief = {}
): ScriptGenerationValidationResult {
  const validation = validateCandidate(candidate, normalizeScriptBrief(briefInput), 0);

  return {
    ok: validation.draft !== null && !validation.issues.some((issue) => issue.severity === "blocking"),
    issues: validation.issues,
    drafts: validation.draft ? [validation.draft] : [],
    rejectedCandidates: validation.draft ? 0 : 1,
    variantLimit: normalizeVariantLimit(1)
  };
}

export function validateScriptGenerationResult(
  result: ScriptGenerationResult,
  briefInput: ScriptBrief = {},
  requestedVariants = DEFAULT_GENERATION_VARIANTS
): ScriptGenerationValidationResult {
  const brief = normalizeScriptBrief(briefInput);
  const variantLimit = normalizeVariantLimit(requestedVariants);
  const rawCandidates = Array.isArray(result.candidates) ? result.candidates : [];
  const limitedCandidates = rawCandidates.slice(0, variantLimit.max);
  const issues: ScriptGenerationIssue[] = [];

  if (rawCandidates.length === 0) {
    issues.push({
      severity: "blocking",
      code: "generation.no_candidates",
      messageJa: "生成候補がありません。"
    });
  }

  if (rawCandidates.length > variantLimit.max) {
    issues.push({
      severity: "warning",
      code: "generation.too_many_variants",
      messageJa: `候補が多すぎるため、先頭 ${variantLimit.max} 件だけを検証します。`
    });
  }

  const validations = limitedCandidates.map((candidate, index) => validateCandidate(candidate, brief, index));
  const drafts = validations.flatMap((validation) => (validation.draft ? [validation.draft] : []));
  const candidateIssues = validations.flatMap((validation) => validation.issues);
  const allIssues = [...issues, ...candidateIssues];
  const rejectedCandidates = validations.filter((validation) => validation.draft === null).length + Math.max(0, rawCandidates.length - variantLimit.max);

  return {
    ok: drafts.length > 0 && !allIssues.some((issue) => issue.severity === "blocking"),
    issues: allIssues,
    drafts,
    rejectedCandidates,
    variantLimit
  };
}

export function normalizeScriptGenerationCandidate(
  candidate: ScriptGenerationCandidate,
  briefInput: ScriptBrief = {}
): ScriptGenerationCandidate {
  const brief = normalizeScriptBrief(briefInput);
  const englishScript = normalizeInlineText(candidate.englishScript ?? "");

  return {
    title: normalizeInlineText(candidate.title ?? "Generated script draft"),
    englishScript,
    japaneseSummary: normalizeInlineText(candidate.japaneseSummary ?? ""),
    focusWords: normalizeFocusWordTexts(candidate.focusWords ?? brief.mustInclude).slice(0, MAX_FOCUS_WORDS),
    generationNotes: normalizeTextList(candidate.generationNotes ?? [])
  };
}

export function candidateToScriptDraft(candidate: ScriptGenerationCandidate, briefInput: ScriptBrief = {}): ScriptDraft {
  const brief = normalizeScriptBrief(briefInput);
  const normalizedCandidate = normalizeScriptGenerationCandidate(candidate, brief);
  const focusWords = normalizedCandidate.focusWords ?? [];

  return analyzeScriptDraft(normalizedCandidate.englishScript ?? "", brief, {
    title: normalizedCandidate.title,
    japaneseSummary: normalizedCandidate.japaneseSummary,
    focusWords: focusWords.map<ScriptStudioFocusWord>((word) => ({
      text: word,
      source: "draft",
      reasonJa: "generation candidate から受け取った focus word。quality gate では最大3個に制限する。"
    })),
    generationNotes: [
      "Generation candidate was normalized locally. Metrics from the model were ignored.",
      ...normalizeTextList(normalizedCandidate.generationNotes ?? [])
    ]
  });
}

export function buildScriptFreezePreflight(draft: ScriptDraft, briefInput: ScriptBrief = {}): ScriptFreezePreflight {
  const brief = normalizeScriptBrief(briefInput);
  const qualityReport = buildScriptQualityReport(draft.englishScript, {
    brief,
    targetLengthSeconds: draft.targetLengthSeconds,
    focusWords: draft.focusWords
  });
  const recalculatedDraft: ScriptDraft = {
    ...draft,
    wordCount: qualityReport.wordCount,
    estimatedSpeakingTime: qualityReport.estimatedSpeakingTime,
    chunks: qualityReport.chunks,
    readiness: qualityReport,
    revisionHints: qualityReport.revisionHints,
    focusWords: draft.focusWords.slice(0, MAX_FOCUS_WORDS)
  };
  const freezeReadiness = getScriptFreezeReadiness(recalculatedDraft);
  const issues = freezeReadinessToIssues(freezeReadiness);

  return {
    canFreeze: freezeReadiness.canFreeze,
    freezeReadiness,
    qualityReport,
    issues,
    nextAction: freezeReadiness.nextAction
  };
}

export function canFreezeGeneratedDraft(draft: ScriptDraft, briefInput: ScriptBrief = {}) {
  return buildScriptFreezePreflight(draft, briefInput).canFreeze;
}

function buildScriptGenerationSystemPrompt() {
  return [
    "You are Script Studio for Native Minute.",
    "Your task is to turn the user's rough intent into one-minute English practice scripts.",
    "A Native Minute Script preserves the user's meaning, sounds natural, is speakable within the target duration, has breath points, can be split into meaningful chunks, uses one to three focus words, and connects to listen, record, and review.",
    "For a 60 second target, avoid drafts that feel like a short paragraph. Aim for enough substance to practice for about 45 to 75 seconds by adding a concrete reason and example when needed, without padding.",
    "Do not over-expand the user's intent. Keep mustInclude items and avoid requested topics or tones.",
    "Avoid long sentences and dense paragraphs. Prefer clear punctuation, short breath groups, and practice-friendly phrasing.",
    "Return bounded variants only. Never return more than three candidates.",
    "Return JSON that follows the output contract."
  ].join("\n");
}

function validateCandidate(candidate: ScriptGenerationCandidate, brief: NormalizedScriptBrief, index: number) {
  const normalizedCandidate = normalizeScriptGenerationCandidate(candidate, brief);
  const issues: ScriptGenerationIssue[] = [];

  if (!normalizedCandidate.englishScript) {
    issues.push({
      severity: "blocking",
      code: "candidate.empty_english_script",
      messageJa: `候補 ${index + 1}: englishScript が空です。`
    });

    return { draft: null, issues };
  }

  if (candidate.wordCount !== undefined || candidate.estimatedSpeakingTime !== undefined || candidate.chunks !== undefined || candidate.readiness !== undefined) {
    issues.push({
      severity: "info",
      code: "candidate.model_metrics_ignored",
      messageJa: `候補 ${index + 1}: model supplied metrics は信用せず、englishScript から再計算しました。`
    });
  }

  if ((candidate.focusWords?.length ?? 0) > MAX_FOCUS_WORDS) {
    issues.push({
      severity: "warning",
      code: "candidate.too_many_focus_words",
      messageJa: `候補 ${index + 1}: focus words が多いため、先頭 ${MAX_FOCUS_WORDS} 個に絞りました。`
    });
  }

  const draft = candidateToScriptDraft(normalizedCandidate, brief);
  const preflight = buildScriptFreezePreflight(draft, brief);

  for (const reason of preflight.freezeReadiness.blockingReasons) {
    issues.push({
      severity: "blocking",
      code: "candidate.freeze_blocked",
      messageJa: `候補 ${index + 1}: ${reason}`
    });
  }

  for (const warning of preflight.freezeReadiness.warnings.slice(0, 4)) {
    issues.push({
      severity: "warning",
      code: "candidate.freeze_warning",
      messageJa: `候補 ${index + 1}: ${warning}`
    });
  }

  return { draft, issues };
}

function freezeReadinessToIssues(freezeReadiness: ScriptFreezeReadiness) {
  return [
    ...freezeReadiness.blockingReasons.map<ScriptGenerationIssue>((reason) => ({
      severity: "blocking",
      code: "freeze.blocking_reason",
      messageJa: reason
    })),
    ...freezeReadiness.warnings.map<ScriptGenerationIssue>((warning) => ({
      severity: "warning",
      code: "freeze.warning",
      messageJa: warning
    }))
  ];
}

function normalizeVariantLimit(requested = DEFAULT_GENERATION_VARIANTS): ScriptGenerationVariantLimit {
  const safeRequested = Number.isFinite(requested) && requested > 0 ? Math.round(requested) : DEFAULT_GENERATION_VARIANTS;

  return {
    requested: Math.min(safeRequested, MAX_GENERATION_VARIANTS),
    max: MAX_GENERATION_VARIANTS
  };
}

function getTargetWordRange(targetLengthSeconds: number) {
  if (targetLengthSeconds <= 45) {
    return { min: 60, max: 80 };
  }

  if (targetLengthSeconds >= 75) {
    return { min: 90, max: 115 };
  }

  return { min: 75, max: 100 };
}

function isScriptGenerationRequest(input: ScriptGenerationRequest | ScriptBrief): input is ScriptGenerationRequest {
  return "brief" in input;
}

function formatListForPrompt(values: string[]) {
  return values.length > 0 ? values.join(", ") : "(none)";
}

function normalizeFocusWordTexts(values: string[]) {
  return normalizeTextList(values).slice(0, MAX_FOCUS_WORDS);
}

function normalizeInlineText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeTextList(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = normalizeInlineText(value);
    const key = normalized.toLowerCase();

    if (!normalized || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(normalized);
  }

  return result;
}
