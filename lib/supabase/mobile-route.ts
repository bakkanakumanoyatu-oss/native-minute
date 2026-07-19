import { createClient } from "@supabase/supabase-js";
import type { AppSupabaseClient } from "./client";
import { getSupabaseAnonKey, getSupabaseUrl } from "./config";
import type { Database } from "@/types/database";

export const MAX_MOBILE_BEARER_LENGTH = 8_192;

export type MobileBearerParseResult =
  | { ok: true; accessToken: string }
  | { ok: false; reason: "missing" | "malformed" };

export function parseMobileBearerAuthorization(value: string | null): MobileBearerParseResult {
  if (value === null || value.length === 0) {
    return { ok: false, reason: "missing" };
  }

  if (value.length > MAX_MOBILE_BEARER_LENGTH + "Bearer ".length) {
    return { ok: false, reason: "malformed" };
  }

  const match = /^Bearer ([A-Za-z0-9._~-]+)$/i.exec(value);
  const accessToken = match?.[1];

  if (!accessToken || accessToken.length > MAX_MOBILE_BEARER_LENGTH) {
    return { ok: false, reason: "malformed" };
  }

  return { ok: true, accessToken };
}

export function createSupabaseMobileRouteClient(accessToken: string): AppSupabaseClient {
  const client = createClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  });

  return client as unknown as AppSupabaseClient;
}
