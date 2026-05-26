const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

export function isTimingEnabled() {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  return ENABLED_VALUES.has((process.env.NATIVE_MINUTE_ENABLE_TIMING ?? "").trim().toLowerCase());
}

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }

  return Date.now();
}

function formatDuration(durationMs: number) {
  if (durationMs < 10) {
    return `${durationMs.toFixed(1)}ms`;
  }

  return `${Math.round(durationMs)}ms`;
}

export function logTiming(label: string, durationMs: number) {
  if (!isTimingEnabled()) {
    return;
  }

  console.info(`[timing] ${label} ${formatDuration(durationMs)}`);
}

export async function timeAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (!isTimingEnabled()) {
    return fn();
  }

  const start = nowMs();

  try {
    return await fn();
  } finally {
    logTiming(label, nowMs() - start);
  }
}

export function timeSync<T>(label: string, fn: () => T): T {
  if (!isTimingEnabled()) {
    return fn();
  }

  const start = nowMs();

  try {
    return fn();
  } finally {
    logTiming(label, nowMs() - start);
  }
}
