import { verify } from "node:crypto";
import { PROBE_OPERATOR_PUBLIC_KEY } from "./probe-operator-public-key.mjs";

export const PROBE_PATH = "/api/operations/provider-readonly-probe";

export function isAuthorizedProbe(request, env = process.env, now = Date.now(), key = PROBE_OPERATOR_PUBLIC_KEY) {
  const url = new URL(request.url);
  if (request.method !== "GET" || url.pathname !== PROBE_PATH ||
      env.VERCEL_ENV !== "production" || url.hostname !== env.VERCEL_URL ||
      !["?mode=selector", "?mode=inventory"].includes(url.search)) return false;
  const timestamp = request.headers.get("x-native-minute-probe-time") ?? "";
  const nonce = request.headers.get("x-native-minute-probe-nonce") ?? "";
  const signature = request.headers.get("x-native-minute-probe-signature") ?? "";
  if (!/^\d{13}$/.test(timestamp) || Math.abs(now - Number(timestamp)) > 120_000 ||
      !/^[A-Za-z0-9_-]{22}$/.test(nonce) || !/^[A-Za-z0-9_-]{86}$/.test(signature)) return false;
  const message = `GET\n${url.hostname}\n${url.pathname}${url.search}\n${timestamp}\n${nonce}`;
  try {
    return verify(null, Buffer.from(message), key, Buffer.from(signature, "base64url"));
  } catch {
    return false;
  }
}
