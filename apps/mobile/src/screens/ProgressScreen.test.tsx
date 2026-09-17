import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MobileProgress, MobileProgressTake, MobileScriptProgress } from "../lib/api";
import { ProgressContent } from "./ProgressScreen";

function take(id: string, score: number): MobileProgressTake {
  return {
      favorite: false, displayName: null,
    id, scriptId: "script-1", score, accuracyScore: score, fluencyScore: score, rhythmScore: score,
    reviewedAt: "2026-09-05T08:42:00+09:00", createdAt: "2026-09-05T08:40:00+09:00",
    transcriptText: null, weakWords: [],
    coach: { titleJa: "Coach", summaryJa: "Summary", bulletPointsJa: [], nextStepJa: "保存された助言。\n最後まで表示する。", focusWords: ["quiet", "slowly", "morning", "fourth"] },
    evaluation: { score, accuracyScore: score, fluencyScore: score, rhythmScore: score, summaryJa: "Summary", strengthsJa: [], weakWords: [], scriptWordCount: 100, transcriptWordCount: 100 }
  };
}

function script(overrides: Partial<MobileScriptProgress> = {}): MobileScriptProgress {
  return {
    script: { id: "script-1", title: "Morning practice", content: "A fixed script.", locale: "en-US", targetSeconds: 60, updatedAt: "2026-09-05T00:00:00Z" },
    takeCount: 2, latestTake: take("latest", 82), bestTake: take("best", 86), previousTake: null,
    takeHistory: [take("latest", 82), take("best", 86)], latestVsPrevious: null, latestVsBest: null, improvementTrend: "down",
    ...overrides
  };
}

function render(scripts: MobileScriptProgress[], scriptId?: string) {
  const progress: MobileProgress = { scripts, totalScripts: scripts.length, totalReviewedTakes: 2, bestTakeCount: 1 };
  return renderToStaticMarkup(<ProgressContent progress={progress} scriptId={scriptId} onNavigate={() => undefined} />);
}

describe("Progress presentation preserves canonical results", () => {
  it("uses the selected latest and best even when the history scores and dates suggest a different order", () => {
    const item = script({
      latestTake: take("server-latest", 31), bestTake: take("server-best", 74),
      takeHistory: [
        { ...take("first", 43), reviewedAt: null, createdAt: "2026-09-01T00:00:00Z" },
        { ...take("second", 99), createdAt: "2026-09-06T00:00:00Z" }
      ]
    });
    const html = render([item]);
    expect(html).toContain('<dt lang="en">Latest</dt><dd class="progress-score"><span>31</span>');
    expect(html).toContain('<dt lang="en">Best</dt><dd class="progress-score"><span>74</span>');
    expect(html.indexOf('スコア 43')).toBeLessThan(html.indexOf('スコア 99'));
    expect(html).toContain('dateTime="2026-09-01T00:00:00Z"');
    expect(item.takeHistory.map((entry) => entry.id)).toEqual(["first", "second"]);
  });

  it("shows the same-take note only for matching IDs, including equal scores on different takes", () => {
    expect(render([script({ latestTake: take("a", 86), bestTake: take("b", 86) })])).not.toContain("LatestとBestは同じTakeです。");
    expect(render([script({ latestTake: take("a", 86), bestTake: take("a", 86) })])).toContain("LatestとBestは同じTakeです。");
    expect(render([script({ bestTake: null })])).not.toContain("LatestとBestは同じTakeです。");
  });

  it("keeps the entire latest advice and the first three focus words in stored order without changing the data", () => {
    const item = script();
    const html = render([item]);
    expect(html).toContain("保存された助言。\n最後まで表示する。");
    expect(html).toContain('<li>quiet</li><li>slowly</li><li>morning</li>');
    expect(html).not.toContain("fourth");
    expect(item.latestTake?.coach.focusWords).toHaveLength(4);
    expect(html.indexOf("保存された助言。")).toBeLessThan(html.indexOf('class="progress-focus"'));
    expect(html.indexOf('class="progress-primary"')).toBeLessThan(html.indexOf('<dt lang="en">Latest'));
  });

  it("omits the focus group when the latest coach has no focus words", () => {
    const latest = take("latest", 82);
    latest.coach.focusWords = [];
    expect(render([script({ latestTake: latest })])).not.toContain('class="progress-focus"');
  });

  it("keeps all scripts in server order and filters only by the requested script ID", () => {
    const first = script();
    const second = script({ script: { ...first.script, id: "script-2", title: "Second practice" } });
    const all = render([second, first]);
    expect(all.indexOf("Second practice")).toBeLessThan(all.indexOf("Morning practice"));
    expect(all).not.toContain('class="progress-primary"');
    expect(all.match(/progress-resume/g)).toHaveLength(2);
    const selected = render([second, first], "script-1");
    expect(selected).toContain("Morning practice");
    expect(selected).not.toContain("Second practice");
    expect(selected.match(/class="progress-primary"/g)).toHaveLength(1);
  });

  it("distinguishes a script with no takes from an empty overview or missing target", () => {
    const empty = render([script({ takeCount: 0, latestTake: null, bestTake: null, takeHistory: [] })], "script-1");
    expect(empty).toContain("この台本の練習記録はまだありません");
    expect(empty).toContain("練習する");
    expect(empty).not.toContain("Take history");
    expect(empty).not.toContain("progress-score-pair");
    expect(render([])).toContain("練習記録はまだありません");
    expect(render([script()], "missing")).toContain("この台本の記録を表示できません");
  });
});
