export const CAPACITOR_MOBILE_ORIGIN = "capacitor://localhost";
export const LOCAL_MOBILE_ORIGIN = "http://localhost:5173";

export type MobileApiEnvironment = "development" | "preview" | "production";

const MOBILE_API_ALLOWED_ORIGINS: Record<MobileApiEnvironment, ReadonlySet<string>> = {
  development: new Set([CAPACITOR_MOBILE_ORIGIN, LOCAL_MOBILE_ORIGIN]),
  preview: new Set([CAPACITOR_MOBILE_ORIGIN]),
  production: new Set([CAPACITOR_MOBILE_ORIGIN])
};

const MOBILE_API_ALLOWED_REQUEST_HEADERS = new Set(["accept", "authorization", "content-type"]);

function getMobileApiEnvironment(): MobileApiEnvironment {
  if (process.env.VERCEL_ENV === "production") {
    return "production";
  }

  if (process.env.VERCEL_ENV === "preview") {
    return "preview";
  }

  return process.env.NODE_ENV === "production" ? "production" : "development";
}

export function isAllowedMobileApiOrigin(
  origin: string | null,
  environment: MobileApiEnvironment = getMobileApiEnvironment()
): origin is string {
  return origin !== null && MOBILE_API_ALLOWED_ORIGINS[environment].has(origin);
}

export function parseMobilePreflightHeaders(value: string | null) {
  if (!value) {
    return { allowed: false, includesAuthorization: false };
  }

  const names = value.split(",").map((name) => name.trim().toLowerCase());
  const hasEmptyName = names.some((name) => name.length === 0);
  const hasDuplicateName = new Set(names).size !== names.length;
  const hasUnknownName = names.some((name) => !MOBILE_API_ALLOWED_REQUEST_HEADERS.has(name));

  return {
    allowed: !hasEmptyName && !hasDuplicateName && !hasUnknownName,
    includesAuthorization: names.includes("authorization")
  };
}

export function buildMobileApiHeaders(
  origin: string | null,
  options?: {
    environment?: MobileApiEnvironment;
    preflight?: boolean;
  }
) {
  const headers = new Headers({
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
    Vary: options?.preflight
      ? "Origin, Access-Control-Request-Method, Access-Control-Request-Headers"
      : "Origin"
  });

  if (isAllowedMobileApiOrigin(origin, options?.environment)) {
    headers.set("Access-Control-Allow-Origin", origin as string);
  }

  if (options?.preflight) {
    headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Authorization, Accept, Content-Type");
    headers.set("Access-Control-Max-Age", "600");
  } else {
    headers.set("Access-Control-Expose-Headers", "Retry-After, WWW-Authenticate");
  }

  return headers;
}
