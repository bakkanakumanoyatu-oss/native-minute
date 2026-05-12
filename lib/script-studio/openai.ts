import "server-only";

import { requireEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import type { ScriptGenerationCandidate, ScriptGenerationResult } from "@/lib/script-studio/generation";
import type {
  ScriptGenerationAsyncProvider,
  ScriptGenerationProviderInput,
  ScriptGenerationProviderOutput
} from "@/lib/script-studio/generator";

export const OPENAI_SCRIPT_GENERATION_PROVIDER_ID = "openai-script-generation";
export const OPENAI_SCRIPT_GENERATION_DEFAULT_MODEL = "gpt-4.1-mini";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MAX_OUTPUT_TOKENS = 1800;

type OpenAiScriptGenerationProviderOptions = {
  apiKey?: string;
  model?: string;
  maxOutputTokens?: number;
  fetchImpl?: typeof fetch;
};

type OpenAiResponseErrorPayload = {
  error?: {
    message?: string;
    code?: string;
    type?: string;
  };
};

type OpenAiResponsesPayload = {
  id?: string;
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
      refusal?: string;
    }>;
  }>;
};

type OpenAiScriptGenerationJsonPayload = {
  candidates?: unknown;
};

export class OpenAiScriptGenerationProvider implements ScriptGenerationAsyncProvider {
  id = OPENAI_SCRIPT_GENERATION_PROVIDER_ID;

  private readonly apiKey?: string;
  private readonly model: string;
  private readonly maxOutputTokens: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenAiScriptGenerationProviderOptions = {}) {
    this.apiKey = options.apiKey;
    this.model = options.model?.trim() || process.env.OPENAI_SCRIPT_GENERATION_MODEL?.trim() || OPENAI_SCRIPT_GENERATION_DEFAULT_MODEL;
    this.maxOutputTokens = options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async generate(input: ScriptGenerationProviderInput): Promise<ScriptGenerationProviderOutput> {
    const requestBody = createOpenAiScriptGenerationRequestBody(input, {
      model: this.model,
      maxOutputTokens: this.maxOutputTokens
    });

    let response: Response;

    try {
      response = await this.fetchImpl(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey ?? requireEnv("OPENAI_API_KEY")}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
      });
    } catch {
      throw new AppError(502, "OpenAI script generation への接続に失敗しました。API キー、モデル名、ネットワーク状態を確認してください。");
    }

    if (!response.ok) {
      const detail = await readOpenAiScriptGenerationError(response);
      throw new AppError(502, `OpenAI script generation に失敗しました。${detail || "API キー、モデル名、入力内容を確認してください。"}`);
    }

    const payload = (await response.json().catch(() => null)) as OpenAiResponsesPayload | null;

    if (!payload) {
      throw new AppError(502, "OpenAI script generation response を読み取れませんでした。");
    }

    const result = parseOpenAiScriptGenerationResponse(payload);

    return {
      providerId: this.id,
      providerRequestId: payload.id ?? null,
      candidates: result.candidates,
      notes: [
        "OpenAI provider returned structured candidates.",
        `Model: ${this.model}`,
        "Model supplied metrics are ignored by the Script Studio pipeline."
      ]
    };
  }
}

export function createOpenAiScriptGenerationProvider(options: OpenAiScriptGenerationProviderOptions = {}) {
  return new OpenAiScriptGenerationProvider(options);
}

export function createOpenAiScriptGenerationRequestBody(
  input: ScriptGenerationProviderInput,
  options: { model?: string; maxOutputTokens?: number } = {}
) {
  const model = options.model?.trim() || OPENAI_SCRIPT_GENERATION_DEFAULT_MODEL;
  const maxOutputTokens = options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;

  return {
    model,
    input: [
      {
        role: "system",
        content: input.promptPack.systemPrompt
      },
      {
        role: "user",
        content: [
          input.promptPack.userPrompt,
          "",
          "Output contract:",
          input.promptPack.outputContract,
          "",
          "Return JSON that matches the schema exactly. Do not include markdown fences."
        ].join("\n")
      }
    ],
    max_output_tokens: maxOutputTokens,
    text: {
      format: createOpenAiScriptGenerationResponseFormat(input.promptPack.variantLimit.max)
    }
  };
}

export function createOpenAiScriptGenerationResponseFormat(maxCandidates: number) {
  return {
    type: "json_schema",
    name: "native_minute_script_generation",
    description: "Native Minute Script Studio draft candidates.",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["candidates"],
      properties: {
        candidates: {
          type: "array",
          minItems: 1,
          maxItems: Math.max(1, Math.min(maxCandidates, 3)),
          items: {
            type: "object",
            additionalProperties: false,
            required: ["title", "englishScript", "japaneseSummary", "focusWords", "generationNotes"],
            properties: {
              title: {
                type: "string"
              },
              englishScript: {
                type: "string"
              },
              japaneseSummary: {
                type: "string"
              },
              focusWords: {
                type: "array",
                minItems: 1,
                maxItems: 3,
                items: {
                  type: "string"
                }
              },
              generationNotes: {
                type: "array",
                maxItems: 4,
                items: {
                  type: "string"
                }
              }
            }
          }
        }
      }
    }
  };
}

export function parseOpenAiScriptGenerationResponse(payload: OpenAiResponsesPayload): ScriptGenerationResult {
  const text = extractOpenAiResponseText(payload);

  if (!text) {
    throw new AppError(502, "OpenAI script generation response に JSON text がありませんでした。");
  }

  let parsed: OpenAiScriptGenerationJsonPayload;

  try {
    parsed = JSON.parse(text) as OpenAiScriptGenerationJsonPayload;
  } catch {
    throw new AppError(502, "OpenAI script generation response の JSON を解析できませんでした。");
  }

  return normalizeOpenAiScriptGenerationJson(parsed);
}

function normalizeOpenAiScriptGenerationJson(payload: OpenAiScriptGenerationJsonPayload): ScriptGenerationResult {
  if (!Array.isArray(payload.candidates)) {
    throw new AppError(502, "OpenAI script generation response に candidates がありませんでした。");
  }

  return {
    candidates: payload.candidates.map(toScriptGenerationCandidate)
  };
}

function toScriptGenerationCandidate(value: unknown): ScriptGenerationCandidate {
  if (!isRecord(value)) {
    return {};
  }

  return {
    title: stringValue(value.title),
    englishScript: stringValue(value.englishScript),
    japaneseSummary: stringValue(value.japaneseSummary),
    focusWords: stringArrayValue(value.focusWords),
    generationNotes: stringArrayValue(value.generationNotes)
  };
}

function extractOpenAiResponseText(payload: OpenAiResponsesPayload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const outputText = payload.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => (content.type === "output_text" || content.type === "text" ? content.text : undefined))
    .filter((text): text is string => typeof text === "string" && text.trim().length > 0)
    .join("\n")
    .trim();

  return outputText ?? "";
}

async function readOpenAiScriptGenerationError(response: Response) {
  const requestId = response.headers.get("x-request-id");
  const requestIdSuffix = requestId ? ` request id: ${requestId}` : "";
  const text = await response.text().catch(() => "");

  if (!text) {
    return `HTTP ${response.status}.${requestIdSuffix}`;
  }

  try {
    const payload = JSON.parse(text) as OpenAiResponseErrorPayload;
    const code = payload.error?.code ? ` code: ${payload.error.code}.` : "";
    const type = payload.error?.type ? ` type: ${payload.error.type}.` : "";

    return `HTTP ${response.status}.${code}${type}${requestIdSuffix}`;
  } catch {
    return `HTTP ${response.status}.${requestIdSuffix}`;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : undefined;
}

function stringArrayValue(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}
