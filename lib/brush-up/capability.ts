import { AppError } from "@/lib/errors";

const ENABLED = new Set(["1", "true", "yes", "on"]);

export function isScriptBrushUpEnabled(source: Record<string, string | undefined> = process.env) {
  return ENABLED.has((source.NATIVE_MINUTE_ENABLE_SCRIPT_BRUSH_UP ?? "").trim().toLowerCase());
}

export function assertScriptBrushUpEnabled(source: Record<string, string | undefined> = process.env) {
  if (!isScriptBrushUpEnabled(source)) {
    throw new AppError(403, "台本専用のお手本候補は現在利用できません。");
  }
}
