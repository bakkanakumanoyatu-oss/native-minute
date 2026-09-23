import type { MobileReview, MobileScript, PracticeApi, PracticeRequestFailure } from "./api";
import { DisplayMemory } from "./display-memory";
import { METADATA_LIMITS, METADATA_REFRESH_AGE_MS } from "./metadata-policy";

export type ReviewDisplay = { review: MobileReview; scriptTitle: string; scriptArchived?: boolean; titleConfirmedAt?: number };
type Events<T> = { onFailure?: (key: string, error: PracticeRequestFailure) => void; onSuccess?: (key: string, data: T) => void };
export function scriptsDisplayMemory(api: Pick<PracticeApi, "listScripts">, ownerIsCurrent?: () => boolean, events: Events<MobileScript[]> = {}) {
  return new DisplayMemory<MobileScript[]>(async (_key, { signal }) => {
    const result = await api.listScripts(signal);
    return result.kind === "success" ? { kind: "success", data: result.scripts } : result;
  }, { limits: METADATA_LIMITS.scripts, ownerIsCurrent, ...events });
}
export function reviewDisplayMemory(api: Pick<PracticeApi, "getReview" | "getScript" | "savedTakeAudioMemory">, ownerIsCurrent?: () => boolean, events: Events<ReviewDisplay> = {}) {
  return new DisplayMemory<ReviewDisplay>(async (key, { previous, signal, reason }) => {
    const [scriptId, takeId] = key.split("/");
    const titleNeeded = previous?.titleConfirmedAt === undefined || performance.now() - previous.titleConfirmedAt >= METADATA_REFRESH_AGE_MS || reason === "manual" || reason === "mutation";
    const invalid = () => ({ kind: "invalid-response" as const });
    const [result, script] = await Promise.all([
      api.getReview(scriptId, takeId, signal).catch(invalid),
      titleNeeded ? api.getScript(scriptId, signal).catch(invalid) : Promise.resolve(null)
    ]);
    if (result.kind !== "success" || (script && script.kind !== "success")) {
      if (result.kind === "success" && result.review.audioVisit) api.savedTakeAudioMemory?.endVisit(result.review.audioVisit);
      return result.kind !== "success" ? result : script! as PracticeRequestFailure;
    }
    return { kind: "success", data: { review: result.review, scriptTitle: result.review.scriptSnapshot?.title ?? (script?.kind === "success" ? `現在の台本名: ${script.script.title}` : previous!.scriptTitle),
      scriptArchived: script?.kind === "success" ? Boolean(script.script.archivedAt) : previous?.scriptArchived,
      titleConfirmedAt: script?.kind === "success" ? performance.now() : previous!.titleConfirmedAt } };
  }, {
    limits: METADATA_LIMITS.reviews, ownerIsCurrent, audioOnEntry: true, ...events,
    snapshot: data => { const review = { ...data.review }; delete review.audioVisit; return { ...data, review }; },
    release: data => { if (data.review.audioVisit) api.savedTakeAudioMemory?.endVisit(data.review.audioVisit); }
  });
}
