import { AppError } from "@/lib/errors";

export const AI_SCRIPT_GENERATION_UNAVAILABLE_MESSAGE = "AI台本生成はβ版では現在利用できません。";

export function isAiScriptGenerationEnabled(env: NodeJS.ProcessEnv = process.env) {
  return ["1", "true", "yes", "on"].includes(
    (env.NATIVE_MINUTE_ENABLE_AI_SCRIPT_GENERATION ?? "").trim().toLowerCase()
  );
}

export function assertAiScriptGenerationEnabled() {
  if (!isAiScriptGenerationEnabled()) {
    throw new AppError(403, AI_SCRIPT_GENERATION_UNAVAILABLE_MESSAGE);
  }
}
