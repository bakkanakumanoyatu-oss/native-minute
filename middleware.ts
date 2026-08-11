import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { buildLoginHref } from "@/lib/navigation";
import type { Database } from "@/types/database";
import { getSupabaseAnonKey, getSupabaseUrl, hasSupabaseConfig } from "@/lib/supabase/config";
import type { SupabaseCookiesToSet } from "@/lib/supabase/types";

const PROTECTED_PATH_PREFIXES = ["/scripts", "/setup", "/progress", "/settings"];
const APPLE_APP_SITE_ASSOCIATION_PATH =
  "/.well-known/apple-app-site-association";
const MOBILE_AUTH_FALLBACK_PATHS = new Set([
  "/mobile/auth/callback",
  "/mobile/auth/recovery"
]);

function isProtectedPath(pathname: string) {
  return PROTECTED_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isAuthFlowPath(pathname: string) {
  return pathname === "/auth/callback" || pathname.startsWith("/api/auth/");
}

function isMobileApiPath(pathname: string) {
  return pathname === "/api/mobile" || pathname.startsWith("/api/mobile/");
}

function isAppleAppSiteAssociationPath(pathname: string) {
  return pathname === APPLE_APP_SITE_ASSOCIATION_PATH;
}

function isMobileAuthFallbackPath(pathname: string) {
  return MOBILE_AUTH_FALLBACK_PATHS.has(pathname);
}

function isStaticAssetPath(pathname: string) {
  return pathname.startsWith("/_next/") || pathname === "/favicon.ico";
}

function nextResponse(request: NextRequest) {
  return NextResponse.next({
    request: {
      headers: request.headers
    }
  });
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const protectedPath = isProtectedPath(pathname);

  if (isMobileAuthFallbackPath(pathname)) {
    return nextResponse(request);
  }

  if (isMobileApiPath(pathname)) {
    return nextResponse(request);
  }

  if (isAppleAppSiteAssociationPath(pathname)) {
    return nextResponse(request);
  }

  if (isStaticAssetPath(pathname) || isAuthFlowPath(pathname)) {
    return nextResponse(request);
  }

  const nextPath = `${pathname}${request.nextUrl.search}`;

  if (!hasSupabaseConfig()) {
    if (protectedPath) {
      return NextResponse.redirect(new URL(buildLoginHref(nextPath, "supabase_not_configured", "/scripts"), request.url));
    }

    return nextResponse(request);
  }

  if (!protectedPath && !pathname.startsWith("/api/")) {
    return nextResponse(request);
  }

  let response = nextResponse(request);

  const supabase = createServerClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: SupabaseCookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value));
        response = nextResponse(request);
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });

  const { data, error } = await supabase.auth.getUser();

  if (protectedPath && (error || !data.user)) {
    const loginResponse = NextResponse.redirect(new URL(buildLoginHref(nextPath, "login_required", "/scripts"), request.url));
    response.cookies.getAll().forEach(({ name, value }) => loginResponse.cookies.set(name, value));
    return loginResponse;
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico).*)"]
};
