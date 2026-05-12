import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { Database } from "@/types/database";
import { getSupabaseAnonKey, getSupabaseUrl } from "./config";
import type { SupabaseCookiesToSet } from "./types";

export function createSupabaseRouteClient() {
  const cookieStore = cookies();
  const pendingCookies: SupabaseCookiesToSet = [];

  const supabase = createServerClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: SupabaseCookiesToSet) {
        pendingCookies.push(...cookiesToSet);

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
