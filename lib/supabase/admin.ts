import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "./config";

export function createSupabaseAdminClient() {
  return createClient<Database>(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
