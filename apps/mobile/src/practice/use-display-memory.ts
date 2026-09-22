import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { DisplayMemory } from "./display-memory";

export function useDisplayMemory<T>(memory: DisplayMemory<T>, key: string, isOnline: boolean) {
  const getSnapshot = useCallback(() => memory.getSnapshot(key), [memory, key]);
  const state = useSyncExternalStore(memory.subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    memory.setOnline(isOnline);
  }, [memory, isOnline]);
  useEffect(() => memory.enter(key), [memory, key]);
  return { state: state.kind === "ready" || isOnline ? state : { kind: "error" as const, error: { kind: "offline" as const } }, retry: memory.revalidate };
}
