import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MobileProgress, MobileProgressTake, MobileScriptProgress } from "../lib/api";
import { ProgressDetails as ProgressContent, ProgressContent as ProgressOverview } from "./ProgressScreen";

function take(id: string, score: number): MobileProgressTake {
  return {scriptRevisionId: "60000000-0000-4000-8000-000000000001", scriptTitleSnapshot: "Saved title", historyStatus: "VERSIONED" as const, recordStatus: "reviewed",
      favorite: false, displayName: null,
    id, scriptId: "script-1", score, accuracyScore: score, fluencyScore: score, rhythmScore: score,
    reviewedAt: "2026-09-05T08:42:00+09:00", createdAt: "2026-09-05T08:40:00+09:00",
    transcriptText: null, weakWords: [],
    coach: { titleJa: "Coach", summaryJa: "Summary", bulletPointsJa: [], nextStepJa: "保存された助言。\n最後まで表示する。", focusWords: ["quiet", "slowly", "morning", "fourth"] },
    evaluation: { score, accuracyScore: score, fluencyScore: score, rhythmScore: score, summaryJa: "Summary", strengthsJa: [], weakWords: [], scriptWordCount: 100, transcriptWordCount: 100 }
  };
}

function script(overrides: Partial<MobileScriptProgress> = {}): MobileScriptProgress {
  return {legacyTakeCount: 0, legacyRecordCount: 0, revisionHistory: [],
    script: {currentRevisionId: "60000000-0000-4000-8000-000000000001", archivedAt: null, id: "script-1", title: "Morning practice", content: "A fixed script.", locale: "en-US", targetSeconds: 60, updatedAt: "2026-09-05T00:00:00Z" },
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
  it("labels result scores and history status by canonical take identity", () => {
    const html = render([script()]);
    expect(html).toContain("次の練習では");
    expect(html).toContain("現在版の最新");
    expect(html).toContain("ベスト結果");
    expect(html).toContain("全期間");
    expect(html).toContain('aria-label="総合スコア 82 / 100"');
    expect(html).toContain('class="progress-take-status"><span>最新</span>');
    expect(html).toContain('class="progress-take-status"><span>ベスト</span>');
    const same = take("same", 86);
    expect(render([script({ latestTake: same, bestTake: same, takeHistory: [same] })]))
      .toContain('class="progress-take-status"><span>最新</span><span>ベスト</span>');
    expect(render([script({ latestTake: same, bestTake: same, takeHistory: [take("different", 86)] })]))
      .not.toContain('class="progress-take-status"');
  });

  it("uses the selected latest and best even when the history scores and dates suggest a different order", () => {
    const item = script({
      latestTake: take("server-latest", 31), bestTake: take("server-best", 74),
      takeHistory: [
        { ...take("first", 43), reviewedAt: null, createdAt: "2026-09-01T00:00:00Z" },
        { ...take("second", 99), createdAt: "2026-09-06T00:00:00Z" }
      ]
    });
    const html = render([item]);
    expect(html).toContain('<dt>現在版の最新<span class="progress-score-label">総合スコア</span></dt><dd class="progress-score"><span>31</span>');
    expect(html).toContain('<dt>ベスト結果<span class="progress-score-label">総合スコア</span></dt><dd class="progress-score"><span>74</span>');
    expect(html.indexOf('スコア 43')).toBeLessThan(html.indexOf('スコア 99'));
    expect(html).toContain('dateTime="2026-09-01T00:00:00Z"');
    expect(item.takeHistory.map((entry) => entry.id)).toEqual(["first", "second"]);
  });

  it("shows the same-take note only for matching IDs, including equal scores on different takes", () => {
    expect(render([script({ latestTake: take("a", 86), bestTake: take("b", 86) })])).not.toContain("最新とベストは同じTake（録音）です。");
    expect(render([script({ latestTake: take("a", 86), bestTake: take("a", 86) })])).toContain("最新とベストは同じTake（録音）です。");
    expect(render([script({ bestTake: null })])).not.toContain("最新とベストは同じTake（録音）です。");
  });

  it("keeps the entire latest advice and the first three focus words in stored order without changing the data", () => {
    const item = script();
    const html = render([item]);
    expect(html).toContain("保存された助言。\n最後まで表示する。");
    expect(html).toContain('<li>quiet</li><li>slowly</li><li>morning</li>');
    expect(html).not.toContain("fourth");
    expect(item.latestTake?.coach.focusWords).toHaveLength(4);
    expect(html.indexOf("保存された助言。")).toBeLessThan(html.indexOf('class="progress-focus"'));
    expect(html.indexOf('class="progress-primary"')).toBeLessThan(html.indexOf('<dt>現在版の最新'));
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
    expect(empty).not.toContain("これまでの練習");
    expect(empty).not.toContain("progress-score-pair");
    expect(render([])).toContain("練習記録はまだありません");
    expect(render([script()], "missing")).toContain("この台本の記録を表示できません");
  });
});


describe("Progress overview and selection", () => {
  it("distinguishes owned scripts from practiced scripts and uses the server take total", () => {
    const practiced = script();
    const empty = script({legacyTakeCount: 0, legacyRecordCount: 0, revisionHistory: [],  script: { ...practiced.script, id: "unpracticed" }, takeCount: 0, latestTake: null, bestTake: null, takeHistory: [] });
    const progress: MobileProgress = { scripts: [practiced, empty], totalScripts: 2, totalReviewedTakes: 19, bestTakeCount: 1 };
    const html = renderToStaticMarkup(<ProgressOverview progress={progress} onNavigate={() => undefined} />);
    expect(html).toContain("練習した台本</dt><dd>1<span>本");
    expect(html).toContain("録音・評価済み</dt><dd>19<span>件");
    expect(html).toContain("保存済みの台本 2本");
    expect(html).not.toContain("progress-next-step");
    expect(html).not.toContain("progress-score-pair");
  });
  it("shows only the requested script's stored advice while keeping the picker available", () => {
    const first = script();
    const second = script({ script: { ...first.script, id: "script-2", title: "Second practice" }, latestTake: { ...take("other", 50), coach: { ...take("other", 50).coach, nextStepJa: "別の台本の助言" } } });
    const progress: MobileProgress = { scripts: [first, second], totalScripts: 2, totalReviewedTakes: 4, bestTakeCount: 2 };
    const html = renderToStaticMarkup(<ProgressOverview progress={progress} scriptId="script-1" onNavigate={() => undefined} />);
    expect(html).toContain("保存された助言。");
    expect(html).not.toContain("別の台本の助言");
    expect(html).toContain('aria-current="true"');
    expect(html).toContain("Second practice");
    expect(html.match(/class="progress-script-title"/g)).toHaveLength(1);
  });
});
