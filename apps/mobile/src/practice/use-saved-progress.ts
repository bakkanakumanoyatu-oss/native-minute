import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { PracticeApi } from "./api";
import { ProgressMemory } from "./progress-memory";

export function useSavedProgress(api: PracticeApi, isOnline: boolean) {
  // Alternate API implementations (including isolated UI fixtures) remain usable.
  const memory = useMemo(() => api.progressMemory ?? new ProgressMemory(() => api.getProgress()), [api]);
  const state = useSyncExternalStore(memory.subscribe, memory.getSnapshot, memory.getSnapshot);
  useEffect(() => {
    memory.setOnline(isOnline);
  }, [memory, isOnline]);
  useEffect(() => memory.enter(), [memory]);
  return {
    state: state.kind === "ready" || isOnline ? state : { kind: "error" as const, error: { kind: "offline" as const } },
    retry: memory.revalidate
  };
}
