import { describe, expect, it, vi } from "vitest";
import type { MobileReview, MobileScript } from "../lib/api";
import { reviewDisplayMemory } from "./display-loaders";

const currentScript: MobileScript = {
  id: "script", title: "Current title", content: "Current content.", locale: "en-US", targetSeconds: 60,
  currentRevisionId: "60000000-0000-4000-8000-000000000002", archivedAt: null,
  lockVersion: 2, practiceEpoch: 2, createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-24T00:00:00Z"
};
const review: MobileReview = {
  takeId: "take", scriptId: "script", historyStatus: "UNVERIFIED_LEGACY", scriptSnapshot: null,
  scriptTitleSnapshot: null, recordStatus: "reviewed", favorite: false, displayName: null,
  createdAt: "2026-09-01T00:00:00Z", reviewedAt: "2026-09-01T00:01:00Z", transcriptText: "Saved transcript",
  evaluation: { score: 80, accuracyScore: 80, fluencyScore: 80, rhythmScore: 80, summaryJa: "Saved evaluation",
    strengthsJa: [], weakWords: [], scriptWordCount: 2, transcriptWordCount: 2 },
  coach: { titleJa: "Saved coach", summaryJa: "Saved coach", bulletPointsJa: [], nextStepJa: "Next", focusWords: [] }
};

describe("saved Review title source", () => {
  it("uses the current title only as a current title when legacy has no saved title", async () => {
    const getReview = vi.fn(async () => ({ kind: "success" as const, review }));
    const getScript = vi.fn(async () => ({ kind: "success" as const, script: { ...currentScript, archivedAt: "2026-09-24T00:00:00Z" } }));
    const memory = reviewDisplayMemory({ getReview, getScript });
    const leave = memory.enter("script/take");
    await memory.revalidate();
    expect(memory.peek("script/take")).toMatchObject({ review: { scriptSnapshot: null, scriptTitleSnapshot: null }, scriptTitle: "Current title", scriptArchived: true });
    expect(getReview).toHaveBeenCalledWith("script", "take", expect.any(AbortSignal));
    expect(getScript).toHaveBeenCalledOnce();
    leave();
    memory.revoke();
  });

  it("keeps a stored revision title after the current script is edited", async () => {
    const savedReview: MobileReview = { ...review, historyStatus: "VERSIONED", scriptTitleSnapshot: "Saved title",
      scriptSnapshot: { revisionId: "60000000-0000-4000-8000-000000000001", revisionNo: 1,
        title: "Saved title", content: "Saved content.", locale: "en-US", targetSeconds: 60 } };
    const memory = reviewDisplayMemory({
      getReview: async () => ({ kind: "success", review: savedReview }),
      getScript: async () => ({ kind: "success", script: currentScript })
    });
    const leave = memory.enter("script/take");
    await memory.revalidate();
    expect(memory.peek("script/take")?.scriptTitle).toBe("Saved title");
    leave();
    memory.revoke();
  });
});
