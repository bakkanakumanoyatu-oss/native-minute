import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MobileProgress, MobileProgressTake, MobileScriptProgress } from "../lib/api";
import { HomeContent, HomeScreen, TakeRows, recentPractice, scriptFirstLine } from "./HomeScreen";
import type { PracticeApi } from "../practice/api";

function take(id: string, score: number, createdAt: string): MobileProgressTake {
  const coach = { titleJa: "保存された助言", summaryJa: "要約", nextStepJa: "ゆっくり", focusWords: [], bulletPointsJa: [] };
  const evaluation = { score, accuracyScore: score, fluencyScore: score, rhythmScore: score, summaryJa: "結果", strengthsJa: [], weakWords: [], scriptWordCount: 1, transcriptWordCount: 1 };
  return { favorite: false, displayName: null, id, scriptId: "s1", score, accuracyScore: score, fluencyScore: score, rhythmScore: score, createdAt, reviewedAt: null, transcriptText: null, weakWords: [], coach, evaluation };
}
const latest = take("latest", 61, "2026-09-17T00:00:00Z");
const best = take("best", 88, "2026-09-16T00:00:00Z");
const item: MobileScriptProgress = {
  script: { id: "s1", title: "Persisted title", content: "Hello.", locale: "en-US", targetSeconds: 60, updatedAt: "2026-09-17T00:00:00Z" },
  takeCount: 2, latestTake: latest, bestTake: best, previousTake: best, takeHistory: [best, latest], latestVsPrevious: null, latestVsBest: null, improvementTrend: "down"
};
const empty: MobileProgress = { scripts: [], totalScripts: 0, totalReviewedTakes: 0, bestTakeCount: 0 };
const render = (progress: MobileProgress) => renderToStaticMarkup(<HomeContent progress={progress} onNavigate={() => undefined} />);

describe("Personal Space uses persisted results", () => {
  it("selects the hero from server latest Takes by creation time then ID, independent of script order, update time, best and history", () => {
    const scripts = ["a", "z", "m"].map(id => ({ ...item,
      script: { ...item.script, id, title: `Script ${id}`, updatedAt: id === "a" ? "2026-09-20T00:00:00Z" : item.script.updatedAt },
      latestTake: { ...latest, id, scriptId: id, reviewedAt: id === "a" ? "2026-09-20T00:00:00Z" : latest.createdAt },
      takeHistory: [take("history-newer", 99, "2026-09-21T00:00:00Z")]
    }));
    for (const ordered of [scripts, [...scripts].reverse()]) {
      const html = render({ ...empty, scripts: ordered, totalReviewedTakes: 3 });
      const hero = html.split('aria-labelledby="space-practice-title"')[1].split('</section>')[0];
      expect(hero).toContain("Script z");
      expect(hero).not.toContain("Script a");
      expect(hero).toContain("最近練習した台本");
      expect(hero).not.toContain("評価して保存した録音から");
    }
    scripts[0].latestTake.createdAt = "2026-09-18T00:00:00Z";
    expect(render({ ...empty, scripts, totalReviewedTakes: 3 }).split('id="space-practice-title"')[1].split('</h2>')[0]).toContain("Script a");
  });

  it("does not invent a selected script when saved count exists but latest is missing", () => {
    const html = render({ ...empty, scripts: [{ ...item, latestTake: null }], totalReviewedTakes: 2 });
    expect(html).toContain("前回の台本を表示できません");
    expect(html).not.toContain("最新の録音の台本");
    expect(html).toContain("練習する");
  });

  it("places practice and recent before results and counts, keeping primary and secondary actions distinct", () => {
    const html = render({ ...empty, scripts: [item], totalReviewedTakes: 2 });
    expect(html.indexOf('space-hero')).toBeLessThan(html.indexOf('space-recent-section'));
    expect(html.indexOf('space-recent-section')).toBeLessThan(html.indexOf('space-counts'));
    expect(html).not.toContain("space-last");
    expect(html).not.toContain(">前回の結果</h2>");
    expect(html).toContain('class="space-practice" aria-label="Persisted titleを練習する"');
    expect(html).toContain('class="space-text space-result-link"');
  });
  it("shows a quiet first Home without a zero dashboard, including unpracticed scripts", () => {
    for (const scripts of [[], [{ ...item, takeCount: 0, latestTake: null, bestTake: null, takeHistory: [] }]]) {
      const html = render({ ...empty, scripts });
      expect(html).not.toContain("最初の1分から、");
      expect(html).not.toContain("YOUR FIRST MINUTE");
      expect(html).not.toContain("これから、ここに並ぶもの");
      expect(html).toContain("練習すると、ここに結果と録音が残ります。");
      expect(html).toContain("練習する");
      expect(html).not.toContain("space-counts");
      expect(html).not.toContain("CONTINUE YOUR PRACTICE");
    }
  });
  it("previews at most three owned scripts in server order with duration, locale and practice actions", () => {
    const scripts = [1, 2, 3, 4].map(n => ({ ...item, script: { ...item.script, id: `s${n}`, title: `Owned script ${n}`, locale: n === 2 ? "en-GB" : "en-US", targetSeconds: n === 2 ? 45 : 60 }, takeCount: 0, latestTake: null, bestTake: null, takeHistory: [] }));
    const html = render({ ...empty, scripts, totalScripts: 4 });
    expect(html).not.toContain("<h1>Home</h1>");
    expect(html).toContain("台本から選ぶ");
    expect(html.match(/<li>/g)).toHaveLength(3);
    expect(html).not.toContain("Owned script 4");
    expect(html.indexOf("Owned script 1")).toBeLessThan(html.indexOf("Owned script 2"));
    expect(html).toContain('目標 45秒 · <span lang="en">en-GB</span>');
    expect(html.match(/を練習する/g)).toHaveLength(3);
    expect(html).toContain("すべて見る");
    expect(render(empty)).not.toContain("Owned script");
    expect(render(empty)).toContain("まだ台本がありません。");
  });
  it("shows at most two real saved takes without inventing recording names or filling missing rows", () => {
    for (const history of [[], [latest], [latest, best, take("third", 42, "2026-09-15T00:00:00Z")]]) {
      const html = render({ ...empty, scripts: [{ ...item, takeHistory: history }], totalReviewedTakes: history.length });
      if (!history.length) {
        expect(html).not.toContain("space-own-takes");
        continue;
      }
      const recordings = html.split('aria-labelledby="space-own-takes-title"')[1];
      expect(recordings.match(/<li>/g)).toHaveLength(Math.min(history.length, 2));
      expect(recordings).toContain("Persisted title");
      expect(recordings).toContain("スコア 61");
      expect(recordings).not.toContain("スコア 42");
      expect(recordings).not.toContain("名前");
      expect(recordings).toContain("録音履歴へ");
    }
  });
  it.each([1, 2, 3, 5])("shows actual preview / authoritative total for %i reviewed Takes", total => {
    const history = Array.from({ length: total }, (_, n) => ({ ...latest, id: `take-${n}` }));
    const html = render({ ...empty, scripts: [{ ...item, takeCount: total, takeHistory: history }], totalReviewedTakes: total });
    const shown = Math.min(total, 2);
    expect(html).toContain(`aria-label="全${total}件中${shown}件を表示">${shown} / ${total}</span>`);
    expect(html.includes('space-preview-more')).toBe(total > shown);
    expect(html).toContain('録音・評価済み');
    expect(html).not.toContain('自分の録音');
    expect(html).not.toContain('保存済み録音');
  });
  it("uses the server total even if only two history rows are available", () => {
    const html = render({ ...empty, scripts: [item], totalReviewedTakes: 5 });
    expect(html).toContain('全5件中2件を表示">2 / 5');
    expect(html).toContain('<strong>5</strong><span>録音・<wbr/>評価済み</span>');
    expect(html).toContain('space-preview-more');
  });
  it("does not invent a preview count for zero or unavailable history", () => {
    expect(render(empty)).not.toContain('space-preview-count');
    expect(render({ ...empty, totalReviewedTakes: 5 })).not.toContain('space-preview-count');
  });
  it("counts practiced scripts only, and never fabricates favorites", () => {
    const html = render({ scripts: [item, { ...item, script: { ...item.script, id: "s2" }, takeCount: 0, latestTake: null, bestTake: null, takeHistory: [] }], totalScripts: 2, totalReviewedTakes: 2, bestTakeCount: 1 });
    expect(html).not.toContain("前回 <strong>");
    expect(html).not.toContain("最高点");
    expect(html).toContain('<strong>1</strong><span>練習した<wbr/>台本</span>');
    expect(html).toContain('<strong>2</strong><span>録音・<wbr/>評価済み</span>');
    expect(html).toContain('<strong>0</strong><span>お気に入り</span>');
    expect(html).not.toContain("準備中");
    expect(html).not.toContain("Favorite");
    expect(html).not.toContain("お気に入りの録音");
  });
  it("shows one recent item for one practiced script, without score metadata", () => {
    const html = render({ ...empty, scripts: [{ ...item, takeHistory: [...item.takeHistory, take("different", 99, "2026-09-18T00:00:00Z")] }], totalReviewedTakes: 3 });
    const recent = html.split('aria-label="最近練習した台本"')[1].split('</ol>')[0];
    expect(recent.match(/<li>/g)).toHaveLength(1);
    expect(recent).toContain("Persisted title");
    expect(recent).toContain("Hello.");
    expect(recent).not.toMatch(/最高点|前回 <strong>|録音|dateTime|スコア/);
    expect(recent).not.toContain("99点");
  });
  it("shows at most three recent scripts in practice order, without detailed results", () => {
    const scripts = [1, 4, 2, 3].map(n => ({ ...item, script: { ...item.script, id: `s${n}`, title: `Title ${n}` },
      latestTake: { ...latest, id: `t${n}`, scriptId: `s${n}`, createdAt: `2026-09-1${n}T00:00:00Z` }, bestTake: { ...best, scriptId: `s${n}`, score: 80 + n } }));
    const recent = render({ ...empty, scripts, totalReviewedTakes: 8 }).split('aria-label="最近練習した台本"')[1].split('</ol>')[0];
    expect(recent.match(/<li>/g)).toHaveLength(3);
    expect(recent.indexOf("Title 4")).toBeLessThan(recent.indexOf("Title 3"));
    expect(recent.indexOf("Title 3")).toBeLessThan(recent.indexOf("Title 2"));
    expect(recent).not.toContain("Title 1");
    expect(recent).not.toContain("最高点");
    expect(scripts.map(entry => entry.script.id)).toEqual(["s1", "s4", "s2", "s3"]);
  });
  it("uses the first nonblank actual script line without translation or fallback", () => {
    expect(scriptFirstLine(" \r\n  Actual English.  \r\nSecond line.")).toBe("Actual English.");
    for (const content of [undefined, null, "", " \n \r\n"]) expect(scriptFirstLine(content)).toBeUndefined();
    for (const content of ["", " \n", "\n  <Actual English> \nDo not show this."]) {
      const recent = render({ ...empty, scripts: [{ ...item, script: { ...item.script, content } }], totalReviewedTakes: 2 }).split('aria-label="最近練習した台本"')[1].split('</ol>')[0];
      expect(recent).not.toContain("Do not show this.");
      if (content.includes("Actual")) expect(recent).toContain('&lt;Actual English&gt;');
      else expect(recent).not.toContain('space-script-preview-line');
    }
  });
  it("retains the complete script title in Home and in saved Take rows", () => {
    const title = "A very long script title about explaining a quiet morning to colleagues ".repeat(3);
    const progress = { ...empty, scripts: [{ ...item, script: { ...item.script, title } }], totalReviewedTakes: 2 };
    expect(render(progress)).toContain(title);
    const history = renderToStaticMarkup(<TakeRows rows={recentPractice(progress)} onNavigate={() => undefined} />);
    expect(history.split(title)).toHaveLength(3);
    expect(history).not.toContain("名前");
  });
  it("orders recent practice without mutating stored histories", () => {
    expect(recentPractice({ ...empty, scripts: [item] }).map(row => row.take.id)).toEqual(["latest", "best"]);
    expect(item.takeHistory.map(row => row.id)).toEqual(["best", "latest"]);
  });
  it("does not render counts or first Home when offline or still loading", () => {
    for (const isOnline of [true, false]) {
      const html = renderToStaticMarkup(<HomeScreen api={{} as PracticeApi} isOnline={isOnline} onNavigate={() => undefined} />);
      expect(html).not.toContain("space-counts");
      expect(html).not.toContain("練習する");
    }
  });
});


describe("P2 canonical favorites", () => {
  it("supports multiple favorites and caps the preview without reducing the count", () => {
    const favorites = [latest, best, take("third-favorite", 50, "2026-09-15T00:00:00Z")].map(row => ({ ...row, favorite: true }));
    const html = render({ ...empty, totalReviewedTakes: 3, scripts: [{ ...item, takeHistory: favorites }] });
    expect(html).toContain('<strong>3</strong><span>お気に入り</span>');
    const preview = html.split('aria-labelledby="space-favorites-title"')[1].split('</section>')[0];
    expect(preview.match(/<li>/g)).toHaveLength(2);
    expect(preview).not.toContain('スコア 50');
  });

  it("counts all favorites, previews only favorites and keeps script title below an escaped custom name", () => {
    const named = { ...latest, favorite: true, displayName: "<b>My voice</b>" };
    const progress = { ...empty, totalReviewedTakes: 2, scripts: [{ ...item, takeHistory: [best, named] }] };
    const html = render(progress);
    expect(html).toContain('<strong>1</strong><span>お気に入り</span>');
    const preview = html.split('aria-labelledby="space-favorites-title"')[1].split('</section>')[0];
    expect(preview.match(/<li>/g)).toHaveLength(1);
    expect(preview).toContain('&lt;b&gt;My voice&lt;/b&gt;');
    expect(preview).toContain('Persisted title');
    expect(preview).not.toMatch(/♥|スコア|dateTime/);
    expect(html).toContain('space-recordings-history');
    expect(html).toContain('space-recordings-favorite');
    expect(preview).not.toContain('スコア 88');
    expect(html).not.toContain('同じ台本の最高点');
    expect(html).not.toContain('準備中');
  });
});
