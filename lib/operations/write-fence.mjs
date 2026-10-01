// One edge/Node-compatible authority. No Supabase client or provider is loaded here.
export const WRITE_FENCE_ENV = "NATIVE_MINUTE_WRITE_FENCE";
export const WRITE_FENCE_STATUS_PATH = "/api/operations/write-fence";
export const WRITE_FENCE_MESSAGE = "現在メンテナンス中です。しばらくしてからもう一度お試しください。";

export function getWriteFenceState(env = process.env) {
  // This branch is a dedicated probe artifact, never a product release.
  // Preserve the signature used by operator CLIs, but deliberately ignore env.
  void env;
  return {
    writesAllowed: false,
    code: "production_write_fence_active",
    reason: "source_hard_probe"
  };
}

export function assertWritesAllowed(env = process.env) {
  const state = getWriteFenceState(env);
  if (!state.writesAllowed) {
    throw Object.assign(new Error(WRITE_FENCE_MESSAGE), { status: 503, code: state.code, reason: state.reason });
  }
}

// Only Next's inert build assets may be read. Product routes are excluded from
// this artifact by pageExtensions and rejected again by its own catch-all.
export function isFenceSafeRead(method, pathname) {
  if (method !== "GET" && method !== "HEAD") return false;
  return pathname.startsWith("/_next/static/");
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
