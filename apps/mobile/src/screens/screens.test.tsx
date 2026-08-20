import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MobileProgress, MobileReview, MobileScript } from "../practice/api";
import { ProgressContent } from "./ProgressScreen";
import { ReviewContent } from "./ReviewScreen";
import { getListenPrepareButtonLabel } from "./ListenScreen";
import { ScriptsList } from "./ScriptsScreen";

const evaluation = {
  score: 82,
  accuracyScore: 84,
  fluencyScore: 79,
  rhythmScore: 81,
  summaryJa: "リズムが安定しました。",
  strengthsJa: ["最後まで話せました。"],
  weakWords: [{ word: "native", score: 64, note: "母音を短くします。" }],
  scriptWordCount: 100,
  transcriptWordCount: 98
};

const coach = {
  titleJa: "語尾まで保つ",
  summaryJa: "後半も同じ速さで話しましょう。",
  bulletPointsJa: ["区切りを意識します。"],
  nextStepJa: "nativeを3回練習します。",
  focusWords: ["native"]
};

const review: MobileReview = {
  takeId: "take-1",
  scriptId: "script-1",
  createdAt: "2026-08-13T00:00:00.000Z",
  reviewedAt: "2026-08-13T00:01:00.000Z",
  transcriptText: "This is the persisted transcript.",
  evaluation,
  coach
};

describe("mobile practice static screens", () => {
  it("keeps a backgrounded reference audio visibly cached instead of looking ungenerated", () => {
    expect(getListenPrepareButtonLabel("idle", true)).toBe("保存済みのお手本を再準備");
    expect(getListenPrepareButtonLabel("idle", false)).toBe("お手本を準備");
  });

  it("renders script selection actions", () => {
    const script: MobileScript = {
      id: "script-1",
      title: "Morning update",
      content: "A fixed one-minute practice script.",
      targetSeconds: 60,
      locale: "en-US",
      createdAt: "2026-08-13T00:00:00.000Z",
      updatedAt: "2026-08-13T00:00:00.000Z"
    };
    const html = renderToStaticMarkup(<ScriptsList scripts={[script]} onNavigate={() => undefined} />);
    expect(html).toContain("Morning update");
    expect(html).toContain("お手本を聴く");
    expect(html).toContain("録音する");
  });

  it("renders only persisted review fields, including word-level feedback and coach", () => {
    const html = renderToStaticMarkup(<ReviewContent review={review} />);
    expect(html).toContain("This is the persisted transcript.");
    expect(html).toContain("Accuracy");
    expect(html).toContain("native");
    expect(html).toContain("語尾まで保つ");
    expect(html).not.toContain("phoneme");
  });

  it("preserves the server-provided progress and take-history order", () => {
    const take = {
      id: "take-1",
      scriptId: "script-1",
      score: 82,
      accuracyScore: 84,
      fluencyScore: 79,
      rhythmScore: 81,
      reviewedAt: review.reviewedAt,
      createdAt: review.createdAt,
      transcriptText: review.transcriptText,
      weakWords: evaluation.weakWords,
      coach,
      evaluation
    };
    const progress: MobileProgress = {
      totalScripts: 1,
      totalReviewedTakes: 1,
      bestTakeCount: 1,
      scripts: [{
        script: {
          id: "script-1",
          title: "Morning update",
          content: "A fixed one-minute practice script.",
          targetSeconds: 60,
          locale: "en-US",
          updatedAt: "2026-08-13T00:00:00.000Z"
        },
        takeCount: 1,
        latestTake: take,
        bestTake: take,
        previousTake: null,
        takeHistory: [take],
        latestVsPrevious: null,
        latestVsBest: null,
        improvementTrend: "insufficient_data"
      }]
    };
    const html = renderToStaticMarkup(<ProgressContent progress={progress} onNavigate={() => undefined} />);
    expect(html).toContain("Latest");
    expect(html).toContain("Best");
    expect(html).toContain("Take history");
    expect(html).toContain("82");
  });
});
