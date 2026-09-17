import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MobileProgress, MobileProgressTake, MobileScriptProgress } from "../lib/api";
import { HomeContent, HomeScreen, TakeRows, recentPractice } from "./HomeScreen";
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
  it("shows a quiet first Home without a zero dashboard, including unpracticed scripts", () => {
    for (const scripts of [[], [{ ...item, takeCount: 0, latestTake: null, bestTake: null, takeHistory: [] }]]) {
      const html = render({ ...empty, scripts });
      expect(html).not.toContain("最初の1分から、");
      expect(html).not.toContain("YOUR FIRST MINUTE");
      expect(html).not.toContain("これから、ここに並ぶもの");
      expect(html).toContain("練習すると、ここに結果と録音が残ります。");
      expect(html).toContain("最初の台本を選ぶ");
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
  it("uses server latest/best, counts practiced scripts only, and never fabricates favorites", () => {
    const html = render({ scripts: [item, { ...item, script: { ...item.script, id: "s2" }, takeCount: 0, latestTake: null, bestTake: null, takeHistory: [] }], totalScripts: 2, totalReviewedTakes: 2, bestTakeCount: 1 });
    expect(html).toContain("前回 <strong>61点</strong>");
    expect(html).toContain("同じ台本の最高点 <strong>88点</strong>");
    expect(html).toContain('<strong>1</strong><span>練習した台本</span>');
    expect(html).toContain('<strong>2</strong><span>保存済み録音</span>');
    expect(html).toContain('<strong>0</strong><span>お気に入り</span>');
    expect(html).not.toContain("準備中");
    expect(html).not.toContain("Favorite");
    expect(html).not.toContain("お気に入りの録音");
  });
  it("shows one recent item for one practiced script, using canonical latest/best rather than history maxima", () => {
    const html = render({ ...empty, scripts: [{ ...item, takeHistory: [...item.takeHistory, take("different", 99, "2026-09-18T00:00:00Z")] }], totalReviewedTakes: 3 });
    const recent = html.split('aria-label="最近練習した台本"')[1].split('</ol>')[0];
    expect(recent.match(/<li>/g)).toHaveLength(1);
    expect(recent).toContain("Persisted title");
    expect(recent).toContain("前回 <strong>61点</strong>");
    expect(recent).toContain("最高点 <strong>88点</strong>");
    expect(recent).not.toContain("99点");
    expect(recent).toContain('dateTime="2026-09-17T00:00:00Z"');
  });
  it("shows at most three recent scripts in practice order, with each script's own best", () => {
    const scripts = [1, 4, 2, 3].map(n => ({ ...item, script: { ...item.script, id: `s${n}`, title: `Title ${n}` },
      latestTake: { ...latest, id: `t${n}`, scriptId: `s${n}`, createdAt: `2026-09-1${n}T00:00:00Z` }, bestTake: { ...best, scriptId: `s${n}`, score: 80 + n } }));
    const recent = render({ ...empty, scripts, totalReviewedTakes: 8 }).split('aria-label="最近練習した台本"')[1].split('</ol>')[0];
    expect(recent.match(/<li>/g)).toHaveLength(3);
    expect(recent.indexOf("Title 4")).toBeLessThan(recent.indexOf("Title 3"));
    expect(recent.indexOf("Title 3")).toBeLessThan(recent.indexOf("Title 2"));
    expect(recent).not.toContain("Title 1");
    expect(recent).toContain("最高点 <strong>84点</strong>");
    expect(scripts.map(entry => entry.script.id)).toEqual(["s1", "s4", "s2", "s3"]);
  });
  it("omits unavailable best without a fabricated zero and preserves zero when it is stored", () => {
    const missing = render({ ...empty, scripts: [{ ...item, bestTake: null }], totalReviewedTakes: 2 });
    expect(missing).not.toContain("最高点");
    const storedZero = render({ ...empty, scripts: [{ ...item, latestTake: { ...latest, score: 0 }, bestTake: { ...best, score: 0 } }], totalReviewedTakes: 2 });
    expect(storedZero).toContain("前回 <strong>0点</strong>");
    expect(storedZero).toContain("同じ台本の最高点 <strong>0点</strong>");
  });
  it("retains the complete script title before scores in Home and in saved Take rows", () => {
    const title = "A very long script title about explaining a quiet morning to colleagues ".repeat(3);
    const progress = { ...empty, scripts: [{ ...item, script: { ...item.script, title } }], totalReviewedTakes: 2 };
    const last = render(progress).split('id="space-last-title"')[1];
    expect(last.indexOf(title)).toBeLessThan(last.indexOf("61点"));
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
      expect(html).not.toContain("最初の台本を選ぶ");
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
    expect(preview).toContain('台本: Persisted title');
    expect(preview).not.toContain('スコア 88');
    expect(html).toContain('同じ台本の最高点 <strong>88点</strong>');
    expect(html).not.toContain('準備中');
  });
});
