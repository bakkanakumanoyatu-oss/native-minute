import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { buildLoginHref } from "@/lib/navigation";
import type { Database } from "@/types/database";
import { getSupabaseAnonKey, getSupabaseUrl, hasSupabaseConfig } from "@/lib/supabase/config";
import type { SupabaseCookiesToSet } from "@/lib/supabase/types";

const PROTECTED_PATH_PREFIXES = ["/scripts", "/setup", "/progress", "/settings"];

function isProtectedPath(pathname: string) {
  return PROTECTED_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isAuthFlowPath(pathname: string) {
  return pathname === "/auth/callback" || pathname.startsWith("/api/auth/");
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const nextPath = `${pathname}${request.nextUrl.search}`;
  const protectedPath = isProtectedPath(pathname);

  if (isAuthFlowPath(pathname)) {
    return NextResponse.next({
      request: {
        headers: request.headers
      }
    });
  }

  if (!hasSupabaseConfig()) {
    if (protectedPath) {
      return NextResponse.redirect(new URL(buildLoginHref(nextPath, "supabase_not_configured", "/scripts"), request.url));
    }

    return NextResponse.next({
      request: {
        headers: request.headers
      }
    });
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers
    }
  });

  const supabase = createServerClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: SupabaseCookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value));
        response = NextResponse.next({
          request: {
            headers: request.headers
          }
        });
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
