import { createRoot } from "react-dom/client";
import { PracticeApp } from "../../apps/mobile/src/practice/PracticeApp";
import "../../apps/mobile/src/styles.css";
const coach = { titleJa: "\u3086\u3063\u304F\u308A\u3001\u6700\u5F8C\u307E\u3067", summaryJa: "\u843D\u3061\u7740\u3044\u305F\u58F0\u3067\u4F1D\u3048\u3089\u308C\u3066\u3044\u307E\u3059\u3002", bulletPointsJa: ["\u6587\u306E\u7D42\u308F\u308A\u3092\u4E01\u5BE7\u306B\u3002"], nextStepJa: "\u6B21\u306F morning \u3068 slowly \u306E\u6BCD\u97F3\u3092\u610F\u8B58\u3057\u3066\u3001\u540C\u3058\u53F0\u672C\u3092\u8AAD\u3093\u3067\u307F\u307E\u3057\u3087\u3046\u3002", focusWords: ["morning", "slowly"] };
const evaluation = { score: 82, accuracyScore: 84, fluencyScore: 81, rhythmScore: 80, summaryJa: "\u6700\u5F8C\u307E\u3067\u5B89\u5B9A\u3057\u3066\u8A71\u305B\u307E\u3057\u305F\u3002", strengthsJa: ["\u5B89\u5B9A\u3057\u305F\u30EA\u30BA\u30E0\u3067\u3059\u3002"], weakWords: [], scriptWordCount: 120, transcriptWordCount: 118 };
const script = { id: "preview-script", title: "A small pause", content: "Every morning, I take a small pause before the day begins. I open the window and listen to the sounds outside. The world is already moving, but I do not need to hurry. A cup of tea, a quiet breath, and a few words in English help me find my own pace. ".repeat(4) + "This is the final line of my practice.", locale: "en-US", targetSeconds: 60, updatedAt: "2026-09-17T00:00:00Z", createdAt: "2026-09-17T00:00:00Z" };
const take = (id, score, createdAt) => ({ id, favorite: false, displayName: null, scriptId: script.id, score, accuracyScore: score, fluencyScore: score, rhythmScore: score, createdAt, reviewedAt: createdAt, transcriptText: "Every morning, I take a small pause.", weakWords: [], coach, evaluation: { ...evaluation, score } });
const history = [take("preview-latest", 82, "2026-09-17T00:00:00Z"), take("preview-best", 86, "2026-09-16T00:00:00Z")];
const item = { script, takeCount: 2, latestTake: history[0], bestTake: history[1], previousTake: history[1], takeHistory: history, latestVsPrevious: null, latestVsBest: null, improvementTrend: "down" };
const mode = new URLSearchParams(location.search).get("fixture") ?? sessionStorage.getItem("qss-p2-fixture") ?? "populated";
sessionStorage.setItem("qss-p2-fixture", mode);
const longTitle = "A small pause before a busy morning — sharing the details of my day with colleagues and friends at my own pace";
const makeItem = (id, title, day, score, bestScore) => {
  const current = { ...take(id + '-latest', score, `2026-09-${day}T00:00:00Z`), scriptId: id };
  const best = { ...take(id + '-best', bestScore, `2026-09-${day - 1}T00:00:00Z`), scriptId: id };
  return { ...item, script: { ...script, id, title }, latestTake: current, bestTake: best, previousTake: best, takeHistory: [current, best] };
};
const unpracticed = row => ({ ...row, takeCount: 0, latestTake: null, bestTake: null, previousTake: null, takeHistory: [] });
const fixtures = {
  first: [item, makeItem('preview-morning', 'A better morning', 15, 74, 79), makeItem('preview-weekend', 'Plans for the weekend', 13, 81, 81)].map(unpracticed),
  empty: [],
  'first-long': [unpracticed({ ...item, script: { ...script, title: longTitle } })],
  'no-result': [{ ...item, takeCount: 0, latestTake: null, bestTake: null, previousTake: null, takeHistory: [] }],
  one: [{ ...item, takeCount: 1, latestTake: history[0], bestTake: history[0], previousTake: null, takeHistory: [history[0]] }],
  populated: [item, makeItem('preview-morning', 'A better morning', 15, 74, 79), makeItem('preview-weekend', 'Plans for the weekend', 13, 81, 81)],
  long: [{ ...item, script: { ...script, title: longTitle } }, makeItem('preview-morning', 'A better morning', 15, 74, 79)]
};
const selected = structuredClone(fixtures[mode] ?? fixtures.populated);
const storageKey = 'qss-p2-metadata-' + mode;
const metadata = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
for (const row of selected) for (const take of row.takeHistory) Object.assign(take, metadata[take.id] ?? {});
window.p2QA = { failUpdate: false, failRead: false, delay: 0, calls: 0, deleted: false };

const progress = { scripts: selected, totalScripts: selected.length, totalReviewedTakes: selected.reduce((sum, row) => sum + row.takeCount, 0), bestTakeCount: selected.filter(row => row.bestTake).length };
const failed = async () => ({ kind: "server-error", status: 503 });
const api = new Proxy({
  getProgress: async () => (mode === "error" || window.p2QA.failRead) ? { kind: "server-error", status: 503 } : { kind: "success", progress },
  listScripts: async () => ({ kind: "success", scripts: selected.map(row => row.script) }),
  getScript: async id => ({ kind: "success", script: selected.find(row => row.script.id === id)?.script ?? script }),
  getPronunciationConsent: async () => ({ kind: "success", status: "accepted" }),
  updateTakeMetadata: async (takeId, input) => {
    window.p2QA.calls++;
    const failure = window.p2QA.failUpdate;
    await new Promise(resolve => setTimeout(resolve, window.p2QA.delay));
    if (failure) return { kind: "server-error", status: 503 };
    if (window.p2QA.deleted) return { kind: "not-found", reasonCode: "review_not_found" };
    const found = selected.flatMap(row => row.takeHistory).find(row => row.id === takeId);
    if (!found) return { kind: "not-found", reasonCode: "review_not_found" };
    if (input.favorite !== undefined) found.favorite = input.favorite;
    if (input.displayName !== undefined) found.displayName = input.displayName?.trim() || null;
    metadata[takeId] = { favorite: found.favorite, displayName: found.displayName };
    localStorage.setItem(storageKey, JSON.stringify(metadata));
    return { kind: "success", metadata: { takeId, ...metadata[takeId] } };
  },
  getReview: async (scriptId, takeId) => {
    const found = selected.flatMap(row => row.takeHistory).find(row => row.id === takeId);
    return { kind: "success", review: { favorite: found?.favorite ?? false, displayName: found?.displayName ?? null, takeId, scriptId, createdAt: found?.createdAt ?? history[0].createdAt, reviewedAt: found?.reviewedAt ?? history[0].createdAt, transcriptText: found?.transcriptText ?? history[0].transcriptText, evaluation: found?.evaluation ?? evaluation, coach } };
  }
}, { get: (target, prop) => target[prop] ?? failed });
createRoot(document.getElementById("root")).render(<>
  <aside style={{ position: "fixed", top: 0, left: 0, zIndex: 50, background: "#eaf0f2", fontSize: 10, padding: 4 }}>
    P2 QA fixture・合成データ｜<a href="/?fixture=first">初回</a> / <a href="/?fixture=populated">複数</a> / <a href="/?fixture=one">1件</a> / <a href="/?fixture=no-result">結果なし</a> / <a href="/?fixture=long">長い台本名</a> / <a href="/?fixture=error">失敗</a>
  </aside>
  <main className="app-shell" style={{ marginTop: 26 }}><PracticeApp api={api} isOnline={true} onLogout={() => {}} /></main>
</>);
