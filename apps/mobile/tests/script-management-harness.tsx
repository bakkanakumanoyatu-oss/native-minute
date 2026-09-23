import { createRoot } from "react-dom/client";
import { DisplayMemory } from "../src/practice/display-memory";
import { ScriptsScreen } from "../src/screens/ScriptsScreen";
import type { MobileScript, PracticeApi } from "../src/practice/api";
import "../src/styles.css";
import "../src/app-theme.css";

document.documentElement.classList.add("mobile-theme");

const script = (index: number): MobileScript => ({
  id: `script-${index}`,
  title: `Practice ${index}`,
  content: `A one-minute script for practice number ${index}. ${"The rest of the script is here. ".repeat(8)}`,
  locale: "en-US",
  targetSeconds: 60,
  currentRevisionId: `60000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  practiceEpoch: 1,
  lockVersion: 1,
  archivedAt: null,
  createdAt: "2026-09-23T00:00:00.000Z",
  updatedAt: "2026-09-23T00:00:00.000Z"
});

let active = Array.from({ length: 8 }, (_, index) => script(index + 1));
let archived: MobileScript[] = [{ ...script(9), archivedAt: "2026-09-23T01:00:00.000Z" }];
const legacyHistory = ["take-before-revision"];
const mutations: Array<{ scriptId: string; input: unknown }> = [];
let nextMutationFailure: { kind: "conflict"; reasonCode: string } | null = null;
const scriptsMemory = new DisplayMemory<MobileScript[]>(async () => ({ kind: "success", data: active }));
scriptsMemory.seed("scripts", active);

const api = {
  scriptsMemory,
  listScripts: async () => ({ kind: "success" as const, scripts: active }),
  listArchivedScripts: async () => ({ kind: "success" as const, scripts: archived }),
  getScript: async (id: string) => ({ kind: "success" as const, script: [...active, ...archived].find(item => item.id === id)! }),
  createScript: async () => ({ kind: "invalid-request" as const, reasonCode: "fixture" }),
  mutateScript: async (scriptId: string, input: { archived?: boolean }) => {
    if (nextMutationFailure) {
      const failure = nextMutationFailure;
      nextMutationFailure = null;
      active = active.map(item => item.id === scriptId ? { ...item, lockVersion: item.lockVersion + 1 } : item);
      return failure;
    }
    mutations.push({ scriptId, input });
    const base = [...active, ...archived].find(item => item.id === scriptId)!;
    const updated = { ...base, archivedAt: input.archived ? "2026-09-24T00:00:00.000Z" : null, lockVersion: base.lockVersion + 1 };
    if (input.archived === true) {
      active = active.filter(item => item.id !== scriptId);
      archived = [updated, ...archived];
    } else if (input.archived === false) {
      archived = archived.filter(item => item.id !== scriptId);
      active = [...active, updated];
    }
    scriptsMemory.seed("scripts", active);
    return { kind: "success" as const, script: updated };
  }
} as unknown as PracticeApi;

const qa = {
  mutations,
  failNextMutation: () => { nextMutationFailure = { kind: "conflict", reasonCode: "script_edit_conflict" }; },
  get activeIds() { return active.map(item => item.id); },
  get archivedIds() { return archived.map(item => item.id); },
  get legacyHistory() { return legacyHistory; }
};
declare global { interface Window { scriptsQA: typeof qa } }
window.scriptsQA = qa;

createRoot(document.getElementById("root")!).render(
  <main className="app-shell"><div className="practice-shell"><div><ScriptsScreen api={api} isOnline onNavigate={() => undefined} /></div></div></main>
);
