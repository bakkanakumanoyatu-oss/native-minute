import { createRoot } from "react-dom/client";
import { ListenScreen } from "../src/screens/ListenScreen";
import { encodeMonoPcm16Wav } from "../../../lib/browser-pcm-wav";
import type { PracticeApi, PracticeRequestFailure } from "../src/practice/api";
import { notifyLifecycle } from "./listen-lifecycle-fixture";
import "../src/styles.css";

const root = createRoot(document.getElementById("root")!);
const script = { id: "script-a", title: "A full practice script", locale: "en-US", targetSeconds: 60,
  content: ("Read this complete sentence and keep going.\n\n").repeat(30) + "FINAL SCRIPT LINE.", createdAt: "2026-09-17", updatedAt: "2026-09-17" };
const wav = encodeMonoPcm16Wav(new Float32Array(24000 * 36).map((_, i) => Math.sin(i * 0.06) * 0.02), 24000);
let resolveDownload: (() => void) | null = null;
let resolveRequest: (() => void) | null = null;
const qa = {
  requests: [] as string[], downloads: [] as string[], revoked: [] as string[], plays: 0,
  outcome: null as PracticeRequestFailure | null, holdDownload: false, holdRequest: false,
  rejectDownload: false, online: true,
  releaseDownload: () => { resolveDownload?.(); resolveDownload = null; },
  releaseRequest: () => { resolveRequest?.(); resolveRequest = null; },
  native: notifyLifecycle,
  visibility(hidden: boolean) {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: hidden ? "hidden" : "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  },
  render: (owner = "a", scriptId = "script-a") => render(owner, scriptId),
  unmount: () => root.render(null)
};
declare global { interface Window { listenQA: typeof qa } }
window.listenQA = qa;
const revoke = URL.revokeObjectURL.bind(URL);
URL.revokeObjectURL = (url) => { qa.revoked.push(url); revoke(url); };
document.addEventListener("play", () => { qa.plays++; }, true);
const apis = new Map<string, PracticeApi>();
function apiFor(owner: string): PracticeApi {
  if (!apis.has(owner)) apis.set(owner, {
    getScript: async (id: string) => ({ kind: "success", script: { ...script, id } }),
    requestListen: async (id: string) => {
      qa.requests.push(owner + ":" + id);
      if (qa.holdRequest) await new Promise<void>(resolve => { resolveRequest = resolve; });
      return { kind: "success", audioId: owner + ":" + id + ":audio", cached: true };
    },
    downloadAudio: async (id: string) => {
      qa.downloads.push(id);
      const outcome = qa.outcome;
      if (qa.holdDownload) await new Promise<void>(resolve => { resolveDownload = resolve; });
      if (qa.rejectDownload) throw new Error("synthetic network failure");
      return outcome ?? { kind: "success", audio: new Blob([wav], { type: "audio/wav" }) };
    }
  } as PracticeApi);
  return apis.get(owner)!;
}
function render(owner: string, scriptId: string) {
  root.render(<main className="app-shell"><div className="practice-shell"><header className="practice-focus-header"><button>← 戻る</button><span>1 / 3</span><button>練習を終了（Home）</button></header><div><ListenScreen api={apiFor(owner)} scriptId={scriptId} isOnline={qa.online} onNavigate={() => qa.unmount()} /></div></div></main>);
}
render("a", "script-a");
