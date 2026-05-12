import { getListenExecutionCue, getRecordExecutionCue } from "@/lib/guidance-execution";
import { formatFocusedWordList, prioritizeFocusWordGroups } from "@/lib/focus-words";
import type { GuidanceActionKind, GuidanceTone } from "@/lib/guidance-ui";

export type ListenPracticeContext = {
  takeCount: number;
  improvementTrend: "up" | "down" | "flat" | "insufficient_data";
  latestTake: {
    weakWords: string[];
    coachNextStepJa: string;
    coachFocusWords: string[];
  } | null;
  latestVsBest: {
    regressedWeakWords: string[];
    commonWeakWords: string[];
  } | null;
} | null;

export type ListenPracticeGuidance = {
  tone: GuidanceTone;
  actionKind: GuidanceActionKind;
  actionLabelJa: string;
  summaryJa: string;
  reasonJa: string;
  focusWords: string[];
  focusReasonJa: string | null;
  focusSummaryJa: string | null;
  executionCueJa: string;
  followupCueJa: string | null;
};

function uniqueWords(words: Array<string | null | undefined>) {
  return [...new Set(words.map((word) => word?.trim()).filter((word): word is string => Boolean(word)))];
}

function getFocus(context: ListenPracticeContext) {
  const prioritized = prioritizeFocusWordGroups([
    {
      words: uniqueWords(context?.latestVsBest?.regressedWeakWords ?? []),
      reasonJa: "ベスト結果との差として、listen で先に戻す価値が高い単語だからです。"
    },
    {
      words: uniqueWords(context?.latestVsBest?.commonWeakWords ?? []),
      reasonJa: "ベスト結果と比べても、まだ残っている弱点だからです。"
    },
    {
      words: uniqueWords(context?.latestTake?.weakWords ?? []),
      reasonJa: "直前の結果でも weak words に残っていたためです。"
    },
    {
      words: uniqueWords(context?.latestTake?.coachFocusWords ?? []),
      reasonJa: "直前 coach が次の結果の重点として挙げているためです。"
    }
  ]);

  return {
    words: prioritized.words,
    reasonJa: prioritized.reasonJa,
    summaryJa: formatFocusedWordList(prioritized.words, prioritized.hiddenCount)
  };
}

function formatFocusLabel(words: string[]) {
  return words.length > 0 ? words.join("、") : null;
}

export function getListenPracticeGuidance(input: {
  hasAudio: boolean;
  practiceContext: ListenPracticeContext;
  hasConfirmedListen?: boolean;
}): ListenPracticeGuidance {
  const focus = getFocus(input.practiceContext);
  const focusLabel = formatFocusLabel(focus.words);
  const latestTake = input.practiceContext?.latestTake ?? null;
  const latestVsBest = input.practiceContext?.latestVsBest ?? null;
  const isDown = input.practiceContext?.improvementTrend === "down";
  const hasConfirmedListen = input.hasConfirmedListen ?? false;

  if (!input.practiceContext?.takeCount) {
    return {
      tone: hasConfirmedListen ? "steady" : "info",
      actionKind: hasConfirmedListen ? "record" : "listen",
      actionLabelJa: hasConfirmedListen
        ? "listen は足りたので record に進む"
        : input.hasAudio
          ? "まず 1 回だけ Listen する"
          : "見本音声を生成して 1 回だけ Listen する",
      summaryJa: hasConfirmedListen
        ? "見本音声を 1 回確認できたので、これ以上聞き込むより今の感覚のまま 1 本目を録るのが最短です。"
        : "まだ保存済み結果がないので、最初は script 全体のテンポを合わせてから 1 本目の録音に進むのが最短です。",
      reasonJa: hasConfirmedListen
        ? "listen で全体の流れは確認できたので、次は最初の結果を作る段階です。"
        : "最初の結果を作る前は、発音点を増やすより全体の流れをつかむほうが効率的です。",
      focusWords: [],
      focusReasonJa: null,
      focusSummaryJa: null,
      executionCueJa: hasConfirmedListen ? getRecordExecutionCue([]) : getListenExecutionCue([]),
      followupCueJa: getRecordExecutionCue([])
    };
  }

  if (latestVsBest?.regressedWeakWords.length || isDown) {
    return {
      tone: hasConfirmedListen ? "focus" : "alert",
      actionKind: hasConfirmedListen ? "record" : "listen",
      actionLabelJa: hasConfirmedListen
        ? "listen は足りたので崩れた箇所を意識して record に進む"
        : input.hasAudio
          ? "崩れた箇所を 1 回で Listen する"
          : "見本音声を生成して崩れた箇所を Listen する",
      summaryJa: hasConfirmedListen
        ? focusLabel
          ? `${focusLabel} を耳で合わせ直せたので、聞き直しを増やすより今の感覚のまま次の 1 本に進むほうが自然です。`
          : "listen で感覚を戻せたので、これ以上聞き直すより次の 1 本に進むほうが自然です。"
        : focusLabel
          ? `${focusLabel} がベスト結果より崩れているので、録る前に listen で先にリズムを戻すのが安全です。`
          : "直近の結果はベスト結果より落ちているので、録る前に listen で先にリズムを戻すのが安全です。",
      reasonJa: hasConfirmedListen
        ? focusLabel
          ? `${focusLabel} はベスト結果との差として目立っていましたが、listen はもう足りています。`
          : "ベスト結果との差は意識できたので、次は録音で戻す段階です。"
        : focusLabel
          ? `${focusLabel} はベスト結果との差として目立つので、いまは耳を合わせ直す段階です。`
          : "ベスト結果との差があるので、いまは耳を合わせ直す段階です。",
      focusWords: focus.words,
      focusReasonJa: focus.reasonJa,
      focusSummaryJa: focus.summaryJa,
      executionCueJa: hasConfirmedListen ? getRecordExecutionCue(focus.words) : getListenExecutionCue(focus.words),
      followupCueJa: getRecordExecutionCue(focus.words)
    };
  }

  if (focus.words.length > 0) {
    return {
      tone: "focus",
      actionKind: hasConfirmedListen ? "record" : "listen",
      actionLabelJa: hasConfirmedListen
        ? "focus を保ったまま record に進む"
        : input.hasAudio
          ? "focus を 1 回で Listen する"
          : "見本音声を生成して focus を Listen する",
      summaryJa: hasConfirmedListen
        ? focusLabel
          ? `${focusLabel} を 1 回聞けたので、聞き直しを増やさずその focus のまま record に進むと意識点を広げすぎずに済みます。`
          : "必要な listen はできたので、すぐ次の record に移るほうが練習効率が上がります。"
        : focusLabel
          ? `${focusLabel} を含むフレーズだけを 1 回合わせてから record に進むと、意識点を広げすぎずに済みます。`
          : "この listen は 1 回で十分です。すぐ次の record に移るほうが練習効率が上がります。",
      reasonJa: hasConfirmedListen
        ? latestTake?.coachNextStepJa ?? "listen で focus は確認できたので、次はそのまま発話に戻す段階です。"
        : latestTake?.coachNextStepJa ?? "直前の結果の重点をそのまま次の 1 本に持ち込めます。",
      focusWords: focus.words,
      focusReasonJa: focus.reasonJa,
      focusSummaryJa: focus.summaryJa,
      executionCueJa: hasConfirmedListen ? getRecordExecutionCue(focus.words) : getListenExecutionCue(focus.words),
      followupCueJa: getRecordExecutionCue(focus.words)
    };
  }

  return {
    tone: "steady",
    actionKind: "record",
    actionLabelJa: input.hasAudio ? "聞きすぎず次の record に進む" : "必要なら見本音声を作ってすぐ record に進む",
    summaryJa: "大きな弱点は見えていないので、listen は短く済ませて今の感覚のまま次の 1 本に進む段階です。",
    reasonJa: latestTake?.coachNextStepJa ?? "いまは細かく聞き込むより、同じ感覚で 1 本重ねる価値があります。",
    focusWords: focus.words,
    focusReasonJa: focus.reasonJa,
    focusSummaryJa: focus.summaryJa,
    executionCueJa: getListenExecutionCue(focus.words),
    followupCueJa: getRecordExecutionCue(focus.words)
  };
}
