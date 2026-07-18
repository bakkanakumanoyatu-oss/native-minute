const MOBILE_HEALTH_ALLOWED_ORIGINS = new Set([
  "capacitor://localhost",
  "http://localhost:5173"
]);

const BASE_HEALTH_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  Vary: "Origin"
} as const;

export function isAllowedMobileHealthOrigin(origin: string | null) {
  return origin === null || MOBILE_HEALTH_ALLOWED_ORIGINS.has(origin.trim());
}

export function buildMobileHealthHeaders(origin: string | null, options?: { preflight?: boolean }) {
  const headers = new Headers(BASE_HEALTH_HEADERS);
  const normalizedOrigin = origin?.trim() ?? null;

  if (normalizedOrigin && MOBILE_HEALTH_ALLOWED_ORIGINS.has(normalizedOrigin)) {
    headers.set("Access-Control-Allow-Origin", normalizedOrigin);
  }

  if (options?.preflight) {
    headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Accept, Content-Type");
    headers.set("Access-Control-Max-Age", "600");
  }

  return headers;
}
