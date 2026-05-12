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
    return "border-amber-200 bg-amber-50";
  }

  if (tone === "focus") {
    return "border-[var(--accent)] bg-[rgba(217,119,6,0.06)]";
  }

  return "border-[var(--line)] bg-ink-50";
}

export function getGuidanceActionBadgeLabel(actionKind: GuidanceActionKind) {
  if (actionKind === "listen") {
    return "まず listen";
  }

  if (actionKind === "record") {
    return "次は record";
  }

  if (actionKind === "retry_saved_evaluate") {
    return "保存済み録音で再試行";
  }

  if (actionKind === "prepare_recording") {
    return "録音を準備";
  }

  if (actionKind === "fallback") {
    return "補助 transcript を入力";
  }

  return "設定を確認";
}

export function getGuidancePrimaryButtonLabel(actionKind: GuidanceActionKind) {
  if (actionKind === "listen") {
    return "listen してから進む";
  }

  if (actionKind === "record") {
    return "record に進む";
  }

  if (actionKind === "retry_saved_evaluate") {
    return "保存済み録音で再試行する";
  }

  if (actionKind === "prepare_recording") {
    return "録音を準備する";
  }

  if (actionKind === "fallback") {
    return "補助 transcript を入力する";
  }

  return "設定を確認する";
}
