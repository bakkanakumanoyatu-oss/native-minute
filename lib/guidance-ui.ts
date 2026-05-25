export type GuidanceTone = "alert" | "focus" | "steady" | "info";

export type GuidanceActionKind =
  | "listen"
  | "record"
  | "retry_saved_evaluate"
  | "prepare_recording"
  | "fallback"
  | "settings";

export function getGuidanceToneClasses(tone: GuidanceTone) {
  if (tone === "alert") {
    return "border-[var(--line-inset)] bg-[var(--surface-notice)]";
  }

  if (tone === "focus") {
    return "border-[var(--line-inset)] bg-[var(--surface-inset)]";
  }

  return "border-[var(--line-subtle)] bg-[var(--surface-secondary)]";
}

export function getGuidanceActionBadgeLabel(actionKind: GuidanceActionKind) {
  if (actionKind === "listen") {
    return "まず聞く";
  }

  if (actionKind === "record") {
    return "次は録る";
  }

  if (actionKind === "retry_saved_evaluate") {
    return "保存済み録音で再試行";
  }

  if (actionKind === "prepare_recording") {
    return "録音を準備";
  }

  if (actionKind === "fallback") {
    return "開発用入力を使う";
  }

  return "設定を確認";
}

export function getGuidancePrimaryButtonLabel(actionKind: GuidanceActionKind) {
  if (actionKind === "listen") {
    return "聞いてから進む";
  }

  if (actionKind === "record") {
    return "録音へ進む";
  }

  if (actionKind === "retry_saved_evaluate") {
    return "保存済み録音で再試行する";
  }

  if (actionKind === "prepare_recording") {
    return "録音を準備する";
  }

  if (actionKind === "fallback") {
    return "開発用入力を使う";
  }

  return "設定を確認する";
}
