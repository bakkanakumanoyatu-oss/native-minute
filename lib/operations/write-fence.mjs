// One edge/Node-compatible authority. No Supabase client or provider is loaded here.
export const WRITE_FENCE_ENV = "NATIVE_MINUTE_WRITE_FENCE";
export const WRITE_FENCE_STATUS_PATH = "/api/operations/write-fence";
export const WRITE_FENCE_MESSAGE = "現在メンテナンス中です。しばらくしてからもう一度お試しください。";

export function getWriteFenceState(env = process.env) {
  const value = env[WRITE_FENCE_ENV];
  const writesAllowed = value === undefined || value === "" || value === "0";
  return {
    writesAllowed,
    code: writesAllowed ? null : "production_write_fence_active",
    reason: writesAllowed ? "open" : value === "1" ? "maintenance" : "configuration_invalid"
  };
}

export function assertWritesAllowed(env = process.env) {
  const state = getWriteFenceState(env);
  if (!state.writesAllowed) {
    throw Object.assign(new Error(WRITE_FENCE_MESSAGE), { status: 503, code: state.code, reason: state.reason });
  }
}

// These four pages and their shared layout render static copy only. Do not add
// authenticated pages, _next/data, image optimization, or callback paths here.
const PUBLIC_READ_PATHS = new Set(["/privacy", "/terms", "/support", "/support/account-deletion"]);
export function isFenceSafeRead(method, pathname) {
  if (method !== "GET" && method !== "HEAD") return false;
  return pathname.startsWith("/_next/static/") || pathname === "/favicon.ico" || pathname === "/.well-known/apple-app-site-association" || PUBLIC_READ_PATHS.has(pathname);
}

export function createWriteFenceResponse(method, pathname, env = process.env) {
  const state = getWriteFenceState(env);
  const statusRead = pathname === WRITE_FENCE_STATUS_PATH && (method === "GET" || method === "HEAD");
  if (!statusRead && (state.writesAllowed || isFenceSafeRead(method, pathname))) return null;

  const headers = new Headers({ "Cache-Control": "no-store", "X-Native-Minute-Write-Fence": state.writesAllowed ? "open" : "closed" });
  if (!state.writesAllowed) headers.set("Retry-After", "30");
  const json = statusRead || pathname === "/api" || pathname.startsWith("/api/");
  headers.set("Content-Type", json ? "application/json; charset=utf-8" : "text/html; charset=utf-8");
  const payload = JSON.stringify({ ...state, message: state.writesAllowed ? null : WRITE_FENCE_MESSAGE });
  const html = `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Native Minute | メンテナンス</title><main><h1>メンテナンス中</h1><p>${WRITE_FENCE_MESSAGE}</p></main></html>`;
  return new Response(method === "HEAD" ? null : json ? payload : html, { status: state.writesAllowed ? 200 : 503, headers });
}
