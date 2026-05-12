import { getScriptListenPath } from "@/lib/script-routes";

export const LOGIN_CONTINUITY_COOKIE = "nm-login-next";

const KNOWN_INTERNAL_ROUTE_PREFIXES = new Set(["scripts", "setup", "progress", "settings", "login"]);
const ALLOWED_EXACT_RETURN_PATHS = new Set([
  "/",
  "/scripts",
  "/scripts/new",
  "/setup/voice",
  "/progress",
  "/settings",
  "/privacy",
  "/terms",
  "/support",
  "/support/account-deletion"
]);

function isAllowedScriptReturnPath(segments: string[]) {
  if (segments.length === 1 && segments[0] === "scripts") {
    return true;
  }

  if (segments.length === 2 && segments[0] === "scripts" && segments[1] === "new") {
    return true;
  }

  if (segments.length === 3 && segments[0] === "scripts" && ["listen", "record"].includes(segments[2] ?? "")) {
    return Boolean(segments[1]);
  }

  if (segments.length === 5 && segments[0] === "scripts" && segments[2] === "review") {
    return Boolean(segments[1] && segments[3] && segments[4]);
  }

  return false;
}

function isAllowedLoginReturnPath(path: string) {
  try {
    const url = new URL(path, "https://native-minute.local");
    const pathname = url.pathname;

    if (ALLOWED_EXACT_RETURN_PATHS.has(pathname)) {
      return true;
    }

    const segments = pathname.split("/").filter(Boolean);
    return isAllowedScriptReturnPath(segments);
  } catch {
    return false;
  }
}

function normalizeKnownInternalPath(path: string) {
  try {
    const url = new URL(path, "https://native-minute.local");
    const segments = url.pathname.split("/");
    const firstSegment = segments[1]?.toLowerCase();

    if (!firstSegment || !KNOWN_INTERNAL_ROUTE_PREFIXES.has(firstSegment)) {
      return path;
    }

    url.pathname = `/${[firstSegment, ...segments.slice(2).map((segment) => segment.toLowerCase())].filter(Boolean).join("/")}`;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return path;
  }
}

export function getOptionalInternalPath(path: string | null | undefined) {
  if (!path) {
    return null;
  }

  const trimmedPath = path.trim();

  if (!trimmedPath.startsWith("/") || trimmedPath.startsWith("//")) {
    return null;
  }

  const normalizedPath = normalizeKnownInternalPath(trimmedPath);
  return isAllowedLoginReturnPath(normalizedPath) ? normalizedPath : null;
}

export function getInternalPath(path: string | null | undefined, fallbackPath: string) {
  return getOptionalInternalPath(path) ?? fallbackPath;
}

export function buildLoginHref(nextPath: string | null | undefined, error: string, fallbackPath: string) {
  const resolvedNextPath = getInternalPath(nextPath, fallbackPath);
  return `/login?error=${encodeURIComponent(error)}&next=${encodeURIComponent(resolvedNextPath)}`;
}

export function buildVoiceSetupHref(nextPath: string | null | undefined, fallbackPath: string) {
  const resolvedNextPath = getInternalPath(nextPath, fallbackPath);
  return `/setup/voice?next=${encodeURIComponent(resolvedNextPath)}`;
}

export function buildScriptListenVoiceSetupHref(scriptId: string, fallbackPath: string) {
  return buildVoiceSetupHref(getScriptListenPath(scriptId), fallbackPath);
}

export function buildAuthCallbackHref(nextPath: string | null | undefined, fallbackPath: string) {
  const resolvedNextPath = getInternalPath(nextPath, fallbackPath);
  return `/auth/callback?next=${encodeURIComponent(resolvedNextPath)}`;
}

export function buildAuthCallbackPath() {
  return "/auth/callback";
}

function getFirstForwardedValue(value: string | null) {
  return value?.split(",")[0]?.trim() ?? "";
}

export function getRequestOrigin(request: { headers: Headers; nextUrl: { origin: string; protocol: string } }) {
  const forwardedProto = getFirstForwardedValue(request.headers.get("x-forwarded-proto"));
  const forwardedHost = getFirstForwardedValue(request.headers.get("x-forwarded-host"));
  const host = forwardedHost || request.headers.get("host")?.trim();
  const protocol = forwardedProto || request.nextUrl.protocol.replace(/:$/, "");

  if (!host || !protocol) {
    return request.nextUrl.origin;
  }

  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return request.nextUrl.origin;
  }
}
