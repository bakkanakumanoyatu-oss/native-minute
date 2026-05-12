import {
  buildScriptFreezePreflight,
  buildScriptGenerationPromptPack,
  candidateToScriptDraft,
  validateScriptGenerationCandidate,
  validateScriptGenerationResult
} from "@/lib/script-studio/generation";
import { normalizeScriptBrief } from "@/lib/script-studio/quality";
import type {
  ScriptFreezePreflight,
  ScriptGenerationCandidate,
  ScriptGenerationIssue,
  ScriptGenerationPromptPack,
  ScriptGenerationRequest,
  ScriptGenerationResult,
  ScriptGenerationVariantLimit
} from "@/lib/script-studio/generation";
import type { NormalizedScriptBrief, ScriptBrief, ScriptDraft, ScriptQualityReport } from "@/lib/script-studio/types";

export type ScriptGenerationProviderInput = {
  brief: NormalizedScriptBrief;
  promptPack: ScriptGenerationPromptPack;
  request: ScriptGenerationRequest;
};

export type ScriptGenerationProviderOutput = ScriptGenerationResult & {
  providerId: string;
  notes?: string[];
  providerRequestId?: string | null;
};

export type ScriptGenerationProvider = {
  id: string;
  generate(input: ScriptGenerationProviderInput): ScriptGenerationProviderOutput;
};

export type ScriptGenerationAsyncProvider = {
  id: string;
  generate(input: ScriptGenerationProviderInput): Promise<ScriptGenerationProviderOutput>;
};

export type ScriptGenerationPipelineIssue = ScriptGenerationIssue & {
  candidateIndex?: number;
};

export type ScriptGenerationAcceptedDraft = {
  candidateIndex: number;
  draft: ScriptDraft;
  qualityReport: ScriptQualityReport;
  freezePreflight: ScriptFreezePreflight;
  issues: ScriptGenerationPipelineIssue[];
};

export type ScriptGenerationRejectedCandidate = {
  candidateIndex: number;
  candidate: ScriptGenerationCandidate;
  issues: ScriptGenerationPipelineIssue[];
};

export type ScriptGenerationPipelineResult = {
  providerId: string;
  providerRequestId: string | null;
  promptPack: ScriptGenerationPromptPack;
  variantLimit: ScriptGenerationVariantLimit;
  rawCandidateCount: number;
  acceptedDrafts: ScriptGenerationAcceptedDraft[];
  rejectedCandidates: ScriptGenerationRejectedCandidate[];
  issues: ScriptGenerationPipelineIssue[];
  providerNotes: string[];
};

export function runScriptGenerationPipeline(
  requestInput: ScriptGenerationRequest | ScriptBrief,
  provider: ScriptGenerationProvider
): ScriptGenerationPipelineResult {
  const request = normalizeGenerationRequest(requestInput);
  const promptPack = buildScriptGenerationPromptPack(request);
  const providerOutput = provider.generate({
    brief: promptPack.brief,
    promptPack,
    request
  });

  return createScriptGenerationPipelineResult(promptPack, providerOutput);
}

export function generateScriptDraftsWithProvider(request: ScriptGenerationRequest | ScriptBrief, provider: ScriptGenerationProvider) {
  return runScriptGenerationPipeline(request, provider).acceptedDrafts;
}

export async function runAsyncScriptGenerationPipeline(
  requestInput: ScriptGenerationRequest | ScriptBrief,
  provider: ScriptGenerationAsyncProvider
): Promise<ScriptGenerationPipelineResult> {
  const request = normalizeGenerationRequest(requestInput);
  const promptPack = buildScriptGenerationPromptPack(request);
  const providerOutput = await provider.generate({
    brief: promptPack.brief,
    promptPack,
    request
  });

  return createScriptGenerationPipelineResult(promptPack, providerOutput);
}

export async function generateScriptDraftsWithAsyncProvider(request: ScriptGenerationRequest | ScriptBrief, provider: ScriptGenerationAsyncProvider) {
  return (await runAsyncScriptGenerationPipeline(request, provider)).acceptedDrafts;
}

export function createScriptGenerationPipelineResult(
  promptPack: ScriptGenerationPromptPack,
  providerOutput: ScriptGenerationProviderOutput
): ScriptGenerationPipelineResult {
  const rawCandidates = Array.isArray(providerOutput.candidates) ? providerOutput.candidates : [];
  const limitedCandidates = rawCandidates.slice(0, promptPack.variantLimit.max);
  const resultValidation = validateScriptGenerationResult(
    { candidates: rawCandidates },
    promptPack.brief,
    promptPack.variantLimit.requested
  );
  const acceptedDrafts: ScriptGenerationAcceptedDraft[] = [];
  const rejectedCandidates: ScriptGenerationRejectedCandidate[] = [];

  limitedCandidates.forEach((candidate, index) => {
    const candidateValidation = validateScriptGenerationCandidate(candidate, promptPack.brief);
    const draft = candidateValidation.drafts[0] ?? null;
    const issues = candidateValidation.issues.map((issue) => ({
      ...issue,
      candidateIndex: index
    }));

    if (!draft) {
      rejectedCandidates.push({
        candidateIndex: index,
        candidate,
        issues
      });
      return;
    }

    const normalizedDraft = candidateToScriptDraft(candidate, promptPack.brief);
    const freezePreflight = buildScriptFreezePreflight(normalizedDraft, promptPack.brief);

    acceptedDrafts.push({
      candidateIndex: index,
      draft: normalizedDraft,
      qualityReport: freezePreflight.qualityReport,
      freezePreflight,
      issues: [
        ...issues,
        ...freezePreflight.issues.map((issue) => ({
          ...issue,
          candidateIndex: index
        }))
      ]
    });
  });

  const globalIssues: ScriptGenerationPipelineIssue[] = [
    ...resultValidation.issues.map((issue) => ({ ...issue })),
    ...providerNotesToIssues(providerOutput.notes ?? [])
  ];

  return {
    providerId: providerOutput.providerId,
    providerRequestId: providerOutput.providerRequestId ?? null,
    promptPack,
    variantLimit: promptPack.variantLimit,
    rawCandidateCount: rawCandidates.length,
    acceptedDrafts,
    rejectedCandidates,
    issues: dedupeIssues(globalIssues),
    providerNotes: providerOutput.notes ?? []
  };
}

export function createMockScriptGenerationProvider(): ScriptGenerationProvider {
  return {
    id: "script-studio-mock",
    generate(input) {
      return {
        providerId: "script-studio-mock",
        candidates: generateMockScriptCandidates(input.brief),
        notes: [
          "Mock provider only. No OpenAI request was made.",
          "Output is deterministic and only checks the adapter boundary."
        ]
      };
    }
  };
}

export const mockScriptGenerationProvider = createMockScriptGenerationProvider();

export function generateMockScriptCandidates(briefInput: ScriptBrief | NormalizedScriptBrief): ScriptGenerationCandidate[] {
  const brief = normalizeScriptBrief(briefInput);
  const seed = brief.userSeedText.trim();
  const seedLooksEnglish = countEnglishWords(seed) >= 6;
  const topic = labelFromValue(brief.topicCategory ?? "daily life");
  const situation = labelFromValue(brief.situation ?? "daily practice");
  const audience = labelFromValue(brief.audience ?? "general listener");
  const priorityPhrase = getPriorityPhrase(brief.priority);
  const englishScript = seedLooksEnglish
    ? buildEnglishSeedMockScript(seed, brief.tone, priorityPhrase)
    : buildPlaceholderMockScript(topic, situation, audience);

  return [
    {
      title: "Script Studio mock draft",
      englishScript,
      japaneseSummary: "入力と選択肢から、将来の draft 生成フローだけを確認するための仮表示です。",
      focusWords: brief.mustInclude.slice(0, 3),
      generationNotes: [
        "これは UI / contract 確認用の mock draft です。本番のAI生成や翻訳はまだ行っていません。",
        "保存・音声生成・外部API呼び出しは行いません。"
      ]
    }
  ];
}

function normalizeGenerationRequest(input: ScriptGenerationRequest | ScriptBrief): ScriptGenerationRequest {
  if ("brief" in input) {
    return {
      ...input,
      brief: normalizeScriptBrief(input.brief)
    };
  }

  return {
    brief: normalizeScriptBrief(input)
  };
}

function buildEnglishSeedMockScript(seed: string, tone: string, priorityPhrase: string) {
  const cleanSeed = seed.replace(/\s+/g, " ").replace(/[。！？]/g, ".").trim();

  return `${cleanSeed} I will keep the main point simple, with clear breath points. I want this one minute practice to sound ${tone}, easy to repeat, and focused on ${priorityPhrase}.`;
}

function buildPlaceholderMockScript(topic: string, situation: string, audience: string) {
  return `This is a local mock draft, not a final generated script. I want to talk about ${topic} in a ${situation} situation. I will speak to a ${audience} and keep the message simple. First, I will say the main point clearly. Then, I will add one reason and one example. Finally, I will finish with a short next step.`;
}

function getPriorityPhrase(priority: NormalizedScriptBrief["priority"]) {
  if (priority === "accuracy") {
    return "keeping the meaning";
  }

  if (priority === "self_likeness") {
    return "my own voice";
  }

  if (priority === "native_likeness") {
    return "natural English";
  }

  return "speaking smoothly";
}

function countEnglishWords(value: string) {
  return value.split(/\s+/).filter((word) => /[A-Za-z]/.test(word)).length;
}

function labelFromValue(value: string) {
  return value.replace(/_/g, " ");
}

function providerNotesToIssues(notes: string[]): ScriptGenerationPipelineIssue[] {
  return notes.map((note) => ({
    severity: "info",
    code: "provider.note",
    messageJa: note
  }));
}

function dedupeIssues(issues: ScriptGenerationPipelineIssue[]) {
  const seen = new Set<string>();
  const result: ScriptGenerationPipelineIssue[] = [];

  for (const issue of issues) {
    const key = `${issue.severity}:${issue.code}:${issue.messageJa}:${issue.candidateIndex ?? "global"}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(issue);
  }

  return result;
}
