const listeners = new Set<(active: boolean) => void>();
export async function addAppStateChangeListener(listener: (active: boolean) => void) {
  listeners.add(listener);
  return { remove: async () => { listeners.delete(listener); } };
}
export function notifyLifecycle(active: boolean) { listeners.forEach(listener => listener(active)); }
