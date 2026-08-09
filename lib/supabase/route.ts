import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/types/database";
import { getSupabaseAnonKey, getSupabaseUrl } from "./config";
import type { SupabaseCookiesToSet } from "./types";

type SafeCookieSummaryInput = {
  name: string;
  path?: string;
  sameSite?: boolean | string;
  secure?: boolean;
  httpOnly?: boolean;
  options?: {
    path?: string;
    sameSite?: boolean | string;
    secure?: boolean;
    httpOnly?: boolean;
  };
};

function getCookieAttributeSummary(cookie: SafeCookieSummaryInput) {
  const options = cookie.options ?? cookie;

  return {
    path: options.path ?? null,
    sameSite: options.sameSite === undefined ? null : String(options.sameSite),
    secure: Boolean(options.secure),
    httpOnly: Boolean(options.httpOnly)
  };
}

export function isSupabasePkceVerifierCookieName(name: string) {
  return name.endsWith("-code-verifier");
}

export function isSupabaseAuthTokenCookieName(name: string) {
  return name.includes("auth-token");
}

export function getSafeAuthCookieSummary(
  cookiesToSummarize: SafeCookieSummaryInput[],
  loginContinuityCookieName: string
) {
  const pkceVerifierCookie = cookiesToSummarize.find((cookie) => isSupabasePkceVerifierCookieName(cookie.name));
  const loginContinuityCookie = cookiesToSummarize.find((cookie) => cookie.name === loginContinuityCookieName);
  const authTokenCookie = cookiesToSummarize.find((cookie) => isSupabaseAuthTokenCookieName(cookie.name));

  return {
    totalCount: cookiesToSummarize.length,
    hasPkceVerifierCookie: Boolean(pkceVerifierCookie),
    hasLoginContinuityCookie: Boolean(loginContinuityCookie),
    hasAuthTokenCookie: Boolean(authTokenCookie),
    pkceVerifierCookie: pkceVerifierCookie ? getCookieAttributeSummary(pkceVerifierCookie) : null,
    loginContinuityCookie: loginContinuityCookie ? getCookieAttributeSummary(loginContinuityCookie) : null
  };
}

export function createSupabaseRouteClient(request?: NextRequest) {
  const cookieStore = cookies();
  const pendingCookies: SupabaseCookiesToSet = [];

  const supabase = createServerClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        if (request) {
          return request.cookies.getAll();
        }

        return cookieStore.getAll();
      },
      setAll(cookiesToSet: SupabaseCookiesToSet) {
        pendingCookies.push(...cookiesToSet);

        if (request) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
        }

        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Best-effort session refresh only.
        }
      }
    }
  });

  return Object.assign(supabase, {
    getPendingCookies() {
      return pendingCookies;
    },
    applyToResponse(response: NextResponse) {
      pendingCookies.forEach(({ name, value, options }) => {
        response.cookies.set(name, value, options);
      });

      return response;
    }
  });
}
