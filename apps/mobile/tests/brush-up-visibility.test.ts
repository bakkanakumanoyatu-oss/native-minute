import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BrushUpView } from "@/services/brush-up/brush-up.service";
import type { MobileBrushUpView, MobileReview } from "../src/lib/api";
import type { PracticeApi } from "../src/practice/api";

vi.mock("@/components/audio/protected-audio-player", () => ({ ProtectedAudioPlayer: () => null }));

import { BrushUpControl as WebBrushUpControl } from "@/components/brush-up/brush-up-control";
import { BrushUpControl as MobileBrushUpControl } from "../src/screens/BrushUpControl";

const CREATION = "このTakeから台本専用のお手本候補を作る";
const MAINTENANCE = "この版のお手本候補";

function webView(status: BrushUpView["status"], overrides: Partial<BrushUpView> = {}): BrushUpView {
  return {
    candidateId: "candidate", status, isCurrentRevision: false,
    baselineAudioId: "baseline", candidateAudioId: "candidate-audio",
    baselineAudioUrl: "/api/script-audio/baseline", candidateAudioUrl: "/api/script-audio/candidate",
    cleanupPending: false, manualCleanupRequired: false, ...overrides
  };
}

function mobileView(status: MobileBrushUpView["status"], overrides: Partial<MobileBrushUpView> = {}): MobileBrushUpView {
  return {
    candidateId: "candidate", status, isCurrentRevision: false,
    baselineAudioId: "baseline", candidateAudioId: "candidate-audio",
    cleanupPending: false, manualCleanupRequired: false, ...overrides
  };
}

function visible(renderer: ReactTestRenderer) {
  return JSON.stringify(renderer.toJSON());
}

async function renderWeb(currentRevision: boolean, view: BrushUpView | null) {
  let complete!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { complete = resolve; })));
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(createElement(WebBrushUpControl, {
      scriptId: "script", takeId: "take", revisionId: "revision", currentRevision
    }));
  });
  const loading = visible(renderer);
  await act(async () => {
    complete(new Response(JSON.stringify({ ok: true, data: view }), { status: 200 }));
  });
  return { loading, settled: visible(renderer), renderer };
}

async function renderMobile(currentRevision: boolean, view: MobileBrushUpView | null) {
  let complete!: (value: { kind: "success"; view: MobileBrushUpView | null }) => void;
  const api = { getBrushUpView: vi.fn(() => new Promise(resolve => { complete = resolve; })) } as unknown as PracticeApi;
  const review = {
    scriptId: "script", takeId: "take", brushUpAvailable: true,
    brushUpCurrentRevision: currentRevision, scriptSnapshot: { revisionId: "revision" }
  } as unknown as MobileReview;
  let renderer!: ReactTestRenderer;
  act(() => { renderer = create(createElement(MobileBrushUpControl, { api, review, isOnline: true })); });
  const loading = visible(renderer);
  await act(async () => { complete({ kind: "success", view }); });
  return { loading, settled: visible(renderer), renderer };
}

afterEach(() => { vi.unstubAllGlobals(); });

for (const [platform, render, candidate] of [
  ["Web", renderWeb, webView],
  ["Mobile", renderMobile, mobileView]
] as const) {
  describe(`${platform} brush-up visibility`, () => {
    it("shows creation only after confirming the current revision has no candidate", async () => {
      const result = await render(true, null);
      expect(result.loading).not.toContain(CREATION);
      expect(result.settled).toContain(CREATION);
      expect(result.settled).toContain("同意して候補を作る");
    });

    it("renders no old-revision section before or after a null candidate response", async () => {
      const result = await render(false, null);
      expect(result.loading).toBe("null");
      expect(result.settled).toBe("null");
    });

    it("keeps old ready-candidate A/B and reject, without creation or adopt", async () => {
      const result = await render(false, candidate("ready") as BrushUpView & MobileBrushUpView);
      expect(result.loading).toBe("null");
      expect(result.settled).toContain(MAINTENANCE);
      expect(result.settled).toContain("元のお手本");
      expect(result.settled).toContain("候補のお手本");
      expect(result.settled).toContain("却下");
      expect(result.settled).not.toContain(CREATION);
      expect(result.settled).not.toContain("同意して候補を作る");
      expect(result.settled).not.toContain("この台本の版に採用");
    });

    it("keeps old adopted-candidate A/B and rollback", async () => {
      const result = await render(false, candidate("adopted") as BrushUpView & MobileBrushUpView);
      expect(result.settled).toContain("元のお手本");
      expect(result.settled).toContain("候補のお手本");
      expect(result.settled).toContain("元のお手本に戻す");
      expect(result.settled).not.toContain(CREATION);
    });

    it("keeps old cleanup state and retry action", async () => {
      const result = await render(false, candidate("failed", { cleanupPending: true }) as BrushUpView & MobileBrushUpView);
      expect(result.settled).toContain(MAINTENANCE);
      expect(result.settled).toContain("片付けを再確認");
      expect(result.settled).not.toContain(CREATION);
    });

    it("keeps old manual cleanup notice", async () => {
      const result = await render(false, candidate("failed", { manualCleanupRequired: true }) as BrushUpView & MobileBrushUpView);
      expect(result.settled).toContain("運営による確認が必要");
    });

    it.each(["rejected", "rolled_back", "failed"] as const)("hides old terminal %s without cleanup", async status => {
      const result = await render(false, candidate(status) as BrushUpView & MobileBrushUpView);
      expect(result.settled).toBe("null");
    });

    it.each(["preparing", "audio_staged"] as const)("keeps old %s state", async status => {
      const result = await render(false, candidate(status) as BrushUpView & MobileBrushUpView);
      expect(result.settled).toContain("候補を準備しています");
      expect(result.settled).not.toContain(CREATION);
    });

    it("preserves current ready candidate controls", async () => {
      const result = await render(true, candidate("ready") as BrushUpView & MobileBrushUpView);
      expect(result.settled).toContain("この台本の版に採用");
      expect(result.settled).toContain("却下");
      expect(result.settled).toContain("元のお手本");
      expect(result.settled).toContain("候補のお手本");
    });
  });
}
