import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  AccountDeletionRequestControls,
  deletionStatusCopy
} from "./AccountDeletionScreen";
import type { MobileProgress, MobileReview, MobileScript } from "../practice/api";
import { ProgressContent } from "./ProgressScreen";
import { ReviewContent } from "./ReviewScreen";
import { getListenPrepareButtonLabel } from "./ListenScreen";
import { ScriptsList } from "./ScriptsScreen";
import {
  navigateToAccountDeletion,
  resolveSettingsState,
  SettingsAccountDataSection
} from "./SettingsScreen";

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

  it.each([
    ["not_requested", "アカウント削除を開始"],
    ["cancelled", "もう一度削除を申し込む"],
    ["expired", "削除をあらためて申し込む"]
  ] as const)("renders the reapplication CTA for %s", (requestState, expectedLabel) => {
    const html = renderToStaticMarkup(
      <AccountDeletionRequestControls
        deletion={{ requestState, nextAction: requestState === "not_requested" ? "start_request" : "none" }}
        isSubmitting={false}
        onStart={() => undefined}
      />
    );

    expect(html).toContain(expectedLabel);
  });

  it("does not render a duplicate start CTA for an active request", () => {
    const html = renderToStaticMarkup(
      <AccountDeletionRequestControls
        deletion={{ requestState: "requested", nextAction: "wait_for_review" }}
        isSubmitting={false}
        onStart={() => undefined}
      />
    );

    expect(html).toBe("");
  });

  it("keeps terminal-state copy clear that a new request may be started", () => {
    expect(deletionStatusCopy({ requestState: "cancelled", nextAction: "none" })).toContain("もう一度");
    expect(deletionStatusCopy({ requestState: "expired", nextAction: "none" })).toContain("あらためて");
  });

  it("renders canonical G5A consent responses and navigates to the dedicated deletion route", () => {
    const settingsState = resolveSettingsState({
      pronunciationConsent: { kind: "success", status: "accepted" },
      voiceCloningConsent: { kind: "success", status: "withdrawn" },
      voiceSetup: { kind: "success", status: "ready", created: false }
    });
    const onNavigate = vi.fn();

    expect(settingsState).toMatchObject({
      kind: "ready",
      pronunciationConsent: { status: "accepted" },
      voiceCloningConsent: { status: "withdrawn" }
    });

    if (settingsState.kind !== "ready") {
      throw new Error("expected canonical consent API responses to resolve for Settings");
    }

    const html = renderToStaticMarkup(
      <SettingsAccountDataSection
        pronunciationConsent={settingsState.pronunciationConsent}
        voiceCloningConsent={settingsState.voiceCloningConsent}
        onNavigate={onNavigate}
      />
    );

    expect(html).toContain("録音と発音評価");
    expect(html).toContain("同意済み");
    expect(html).toContain("クローンボイス");
    expect(html).toContain("同意を取り消しました");
    expect(html).toContain("アカウント削除へ");

    navigateToAccountDeletion(onNavigate);
    expect(onNavigate).toHaveBeenCalledWith({ name: "account_deletion" });
  });
});
