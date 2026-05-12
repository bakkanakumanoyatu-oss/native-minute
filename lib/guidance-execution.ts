import type { GuidanceActionKind } from "@/lib/guidance-ui";

function formatFocusLabel(words: string[]) {
  return words.length > 0 ? words.join("、") : null;
}

export function getListenExecutionCue(words: string[]) {
  const focusLabel = formatFocusLabel(words);

  return focusLabel
    ? `${focusLabel} が入るフレーズの語尾とリズムだけを 1 回で確認します。`
    : "語尾と全体のテンポだけを 1 回で確認します。";
}

export function getRecordExecutionCue(words: string[]) {
  const focusLabel = formatFocusLabel(words);

  return focusLabel
    ? `${focusLabel} を単語で止めず、フレーズの流れごとに言い切ります。`
    : "語尾まで止めず、1 本を言い切ることだけに集中します。";
}

export function getActionExecutionCue(actionKind: GuidanceActionKind, words: string[]) {
  if (actionKind === "listen") {
    return getListenExecutionCue(words);
  }

  if (actionKind === "record") {
    return getRecordExecutionCue(words);
  }

  if (actionKind === "retry_saved_evaluate") {
    return "録り直さず、補助 transcript か設定だけ整えて同じ録音で進めます。";
  }

  if (actionKind === "prepare_recording") {
    return "録音の有無と長さだけを確かめ、意識点は増やしすぎません。";
  }

  if (actionKind === "fallback") {
    return "台本どおりに補助 transcript を入れ、録音自体は変えずに進めます。";
  }

  return "録音内容ではなく provider / key / storage の設定を確認します。";
}
