import { getListenExecutionCue, getRecordExecutionCue } from "@/lib/guidance-execution";
import { formatFocusedWordList, prioritizeFocusWordGroups } from "@/lib/focus-words";
import { getShortRecordingPrompt } from "@/lib/recording";
import type { GuidanceActionKind, GuidanceTone } from "@/lib/guidance-ui";
import type { CoachFeedback } from "@/services/coach";
import type { ScriptProgressItem, TakeDiffSummary } from "@/services/progress/types";
import type { WeakWord } from "@/services/pronunciation";

export type PracticeGuidance = {
  tone: GuidanceTone;
  actionKind: GuidanceActionKind;
  actionLabelJa: string;
  summaryJa: string;
  reasonJa: string;
  checklistJa: string[];
  focusWords: string[];
  focusReasonJa: string | null;
  focusSummaryJa: string | null;
  executionCueJa: string;
  followupCueJa: string | null;
  changeSummaryJa: string | null;
};

type ReviewGuidanceInput = {
  targetSeconds: number;
  durationSeconds: number | null | undefined;
  weakWords: Array<{ word: string }>;
  coach: CoachFeedback;
  comparison:
    | {
        takeCount: number;
        isBest: boolean;
        diff: TakeDiffSummary | null;
      }
    | null;
};

function uniqueWords(words: Array<string | null | undefined>) {
  return [...new Set(words.map((word) => word?.trim()).filter((word): word is string => Boolean(word)))];
}

function topWeakWords(words: WeakWord[] | Array<{ word: string }>) {
  return words.map((word) => word.word).filter(Boolean);
}

function formatWordList(words: string[]) {
  if (words.length === 0) {
    return null;
  }

  return words.slice(0, 3).join("、");
}

function getFocusWords(
  currentWords: Array<{ word: string }>,
  coach: CoachFeedback,
  diff: TakeDiffSummary | null
) {
  const prioritized = prioritizeFocusWordGroups([
    {
      words: uniqueWords(diff?.regressedWeakWords ?? []),
      reasonJa: "ベスト結果では弱くなかった単語が、いまは崩れているためです。"
    },
    {
      words: uniqueWords(diff?.commonWeakWords ?? []),
      reasonJa: "ベスト結果と比べても、まだ残っている弱点だからです。"
    },
    {
      words: uniqueWords(topWeakWords(currentWords)),
      reasonJa: "直前の結果でも weak words に残っていたためです。"
    },
    {
      words: uniqueWords(coach.focusWords),
      reasonJa: "coach が次の結果の重点として挙げているためです。"
    }
  ]);

  return {
    words: prioritized.words,
    reasonJa: prioritized.reasonJa,
    summaryJa: formatFocusedWordList(prioritized.words, prioritized.hiddenCount)
  };
}

function getChangeSummaryFromDiff(diff: TakeDiffSummary | null) {
  if (!diff) {
    return null;
  }

  if (diff.regressedWeakWords.length > 0) {
    return `前回より崩れた単語は ${formatWordList(diff.regressedWeakWords) ?? "なし"} です。`;
  }

  if (diff.improvedWeakWords.length > 0) {
    return `前回より改善した単語は ${formatWordList(diff.improvedWeakWords) ?? "なし"} です。`;
  }

  if (diff.commonWeakWords.length > 0) {
    return `引き続き残っている弱点は ${formatWordList(diff.commonWeakWords) ?? "なし"} です。`;
  }

  return `大きな単語差分はなく、総合 ${diff.scoreDelta > 0 ? "+" : ""}${diff.scoreDelta} の変化です。`;
}

export function getProgressPracticeGuidance(item: ScriptProgressItem): PracticeGuidance {
  if (!item.latestTake) {
    return {
      tone: "focus",
      actionKind: "record",
      actionLabelJa: "まず 1 回録音する",
      summaryJa: "まだ保存済み結果がないので、比較より先に 1 本目の結果を作るのが最短です。",
      reasonJa: "最初の 1 本ができると、weak words と coach feedback が次の練習材料になります。",
      checklistJa: [
        "見本音声を 1 回だけ聞いて、全体のテンポを確認する",
        "1 分に近い長さで最後まで言い切る",
        "結果確認で weak words を確認してから次の 1 本に進む"
      ],
      focusWords: [],
      focusReasonJa: null,
      focusSummaryJa: null,
      executionCueJa: getRecordExecutionCue([]),
      followupCueJa: null,
      changeSummaryJa: null
    };
  }

  const latest = item.latestTake;
  const diffFromBest = item.latestVsBest;
  const diffFromPrevious = item.latestVsPrevious;
  const focus = getFocusWords(latest.weakWords, latest.coach, diffFromBest);
  const focusWords = focus.words;
  const focusLabel = formatWordList(focusWords);

  if (diffFromBest && (diffFromBest.regressedWeakWords.length > 0 || diffFromBest.scoreDelta <= -5 || item.improvementTrend === "down")) {
    return {
      tone: "alert",
      actionKind: "listen",
      actionLabelJa: "まず Listen を挟む",
      summaryJa: focusLabel
        ? `${focusLabel} がベスト結果より崩れているので、先に見本音声でリズムを戻してから録り直すのが安全です。`
        : "直近の結果はベスト結果より落ちているので、先に見本音声でテンポを戻してから録り直すのが安全です。",
      reasonJa:
        diffFromBest.regressedWeakWords.length > 0
          ? `ベスト結果では弱くなかった ${formatWordList(diffFromBest.regressedWeakWords) ?? "いくつかの単語"} が今回の重点です。`
          : `ベスト結果との差は総合 ${diffFromBest.scoreDelta} なので、勢いで録り直すより一度 listen したほうが戻しやすいです。`,
      checklistJa: [
        "見本音声を 1 回聞いて、語尾とリズムの落ち方を確認する",
        focusLabel ? `${focusLabel} をフレーズごとに小さく口慣らしする` : "coach feedback の next step を 1 回読み直す",
        "そのまま 1 本だけ録り直して比較する"
      ],
      focusWords,
      focusReasonJa: focus.reasonJa,
      focusSummaryJa: focus.summaryJa,
      executionCueJa: getListenExecutionCue(focusWords),
      followupCueJa: getRecordExecutionCue(focusWords),
      changeSummaryJa: getChangeSummaryFromDiff(diffFromPrevious)
    };
  }

  if (latest.weakWords.length > 0 || latest.coach.focusWords.length > 0) {
    return {
      tone: "focus",
      actionKind: "record",
      actionLabelJa: "このまま record をやり直す",
      summaryJa: focusLabel
        ? `次は ${focusLabel} を意識して 1 本だけ録ると、改善点を絞って練習できます。`
        : "今の弱点は絞れているので、そのまま 1 本だけ録り直すのが効果的です。",
      reasonJa: latest.coach.nextStepJa,
      checklistJa: [
        focusLabel ? `${focusLabel} を単語ではなくフレーズで 1 回読む` : "coach feedback の next step を 1 回読む",
        "語尾まで言い切ることだけを意識して録る",
        "録り直し後は最新結果とベスト結果の差だけを見る"
      ],
      focusWords,
      focusReasonJa: focus.reasonJa,
      focusSummaryJa: focus.summaryJa,
      executionCueJa: getRecordExecutionCue(focusWords),
      followupCueJa: null,
      changeSummaryJa: getChangeSummaryFromDiff(diffFromPrevious)
    };
  }

  return {
    tone: "steady",
    actionKind: "record",
    actionLabelJa: item.improvementTrend === "up" ? "この調子で record を続ける" : "安定したまま 1 本追加する",
    summaryJa:
      item.improvementTrend === "up"
        ? "弱い単語が少なく、直近の流れも良いので、同じ感覚でもう 1 本重ねる価値があります。"
        : "大きな弱点は見えていないので、今のペースを保ったまま 1 本追加して安定性を確認できます。",
    reasonJa: latest.coach.nextStepJa,
    checklistJa: [
      "見本音声は必要なときだけ短く聞く",
      "今のテンポを崩さず 1 本だけ追加する",
        "ベスト結果を更新できたかだけを確認する"
    ],
    focusWords,
    focusReasonJa: focus.reasonJa,
    focusSummaryJa: focus.summaryJa,
    executionCueJa: getRecordExecutionCue(focusWords),
    followupCueJa: null,
    changeSummaryJa: getChangeSummaryFromDiff(diffFromPrevious)
  };
}

export function getReviewPracticeGuidance(input: ReviewGuidanceInput): PracticeGuidance {
  const focus = getFocusWords(input.weakWords, input.coach, input.comparison?.diff ?? null);
  const focusWords = focus.words;
  const focusLabel = formatWordList(focusWords);
  const shortRecordingPrompt = getShortRecordingPrompt(input.durationSeconds, input.targetSeconds);

  if (shortRecordingPrompt) {
    return {
      tone: "alert",
      actionKind: "listen",
      actionLabelJa: "まず長さを戻す",
      summaryJa: "この結果は短めなので、単語より先に 1 分近い長さまで戻すことが優先です。",
      reasonJa: shortRecordingPrompt,
      checklistJa: [
        "見本音声を 1 回聞いて、どこで早く切れているか確認する",
        focusLabel ? `${focusLabel} を急がずに含む形で通し読みする` : "語尾まで言い切ることを優先して通し読みする",
        "短さを解消するつもりで 1 本だけ録り直す"
      ],
      focusWords,
      focusReasonJa: focus.reasonJa,
      focusSummaryJa: focus.summaryJa,
      executionCueJa: getListenExecutionCue(focusWords),
      followupCueJa: getRecordExecutionCue(focusWords),
      changeSummaryJa: getChangeSummaryFromDiff(input.comparison?.diff ?? null)
    };
  }

  if (input.comparison?.diff && (input.comparison.diff.regressedWeakWords.length > 0 || input.comparison.diff.scoreDelta <= -5)) {
    return {
      tone: "alert",
      actionKind: "listen",
      actionLabelJa: "ベスト結果を聞き直すつもりで Listen",
      summaryJa: focusLabel
        ? `${focusLabel} がベスト結果より崩れているので、先に聞き直してから録るほうが戻しやすいです。`
        : "ベスト結果との差があるので、先に見本音声でリズムを戻してから録るほうが戻しやすいです。",
      reasonJa:
        input.comparison.diff.regressedWeakWords.length > 0
          ? `特に ${formatWordList(input.comparison.diff.regressedWeakWords) ?? "一部の単語"} はベスト結果より後退しています。`
          : `ベスト結果との差は総合 ${input.comparison.diff.scoreDelta} で、今は耳を合わせ直す段階です。`,
      checklistJa: [
        "保存済み録音を短く聞き返し、崩れた箇所を確認する",
        "見本音声を 1 回聞いてテンポをそろえる",
        "そのあと 1 本だけ録り直して差分を見る"
      ],
      focusWords,
      focusReasonJa: focus.reasonJa,
      focusSummaryJa: focus.summaryJa,
      executionCueJa: getListenExecutionCue(focusWords),
      followupCueJa: getRecordExecutionCue(focusWords),
      changeSummaryJa: getChangeSummaryFromDiff(input.comparison.diff)
    };
  }

  if (focusWords.length > 0) {
    return {
      tone: "focus",
      actionKind: "record",
      actionLabelJa: "focus words を意識して record",
      summaryJa: focusLabel
        ? `次は ${focusLabel} だけを意識して録ると、改善点を広げすぎずに済みます。`
        : "次は weak words を絞って録り直すと、改善点を広げすぎずに済みます。",
      reasonJa: input.coach.nextStepJa,
      checklistJa: [
        focusLabel ? `${focusLabel} をフレーズ単位で 1 回だけ口慣らしする` : "weak words の note を 1 回だけ見返す",
        "保存済み録音を聞き返しすぎず、1 本だけ録る",
        "録り直し後は weak words が減ったかだけを見る"
      ],
      focusWords,
      focusReasonJa: focus.reasonJa,
      focusSummaryJa: focus.summaryJa,
      executionCueJa: getRecordExecutionCue(focusWords),
      followupCueJa: null,
      changeSummaryJa: getChangeSummaryFromDiff(input.comparison?.diff ?? null)
    };
  }

  return {
    tone: "steady",
    actionKind: "record",
    actionLabelJa: input.comparison?.isBest ? "いまの感覚で 1 本追加する" : "このまま record を続ける",
    summaryJa:
      input.comparison?.isBest
        ? "この結果はかなり良いので、聞き返しすぎず同じ感覚で 1 本追加するのが向いています。"
        : "大きな弱点は見えないので、今の感覚を崩さずにもう 1 本試す段階です。",
    reasonJa: input.coach.nextStepJa,
    checklistJa: [
      "listen は必要なときだけ 1 回にとどめる",
      "同じテンポを保ったまま 1 本だけ追加する",
      "ベスト結果を更新できたかだけを確認する"
    ],
    focusWords,
    focusReasonJa: focus.reasonJa,
    focusSummaryJa: focus.summaryJa,
    executionCueJa: getRecordExecutionCue(focusWords),
    followupCueJa: null,
    changeSummaryJa: getChangeSummaryFromDiff(input.comparison?.diff ?? null)
  };
}
