import type { User } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import { createSupabaseServerClient } from "./server";
import { hasSupabaseConfig } from "./config";
import type { AppSupabaseClient } from "./client";

export type AuthState =
  | { kind: "configured"; user: User | null }
  | { kind: "config_error"; message: string };

export const SUPABASE_CONFIG_ERROR_MESSAGE = "Supabase の環境変数が未設定です。";

export async function getCurrentUser(): Promise<User | null> {
  const authState = await getAuthState();

  if (authState.kind !== "configured") {
    return null;
  }

  return authState.user;
}

export async function getAuthState(): Promise<AuthState> {
  if (!hasSupabaseConfig()) {
    return {
      kind: "config_error",
      message: SUPABASE_CONFIG_ERROR_MESSAGE
    };
  }

  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      return {
        kind: "configured",
        user: null
      };
    }

    return {
      kind: "configured",
      user: data.user
    };
  } catch {
    return {
      kind: "config_error",
      message: "Supabase の初期化に失敗しました。環境変数を確認してください。"
    };
  }
}

export async function requireCurrentUser(client: AppSupabaseClient): Promise<User> {
  if (!hasSupabaseConfig()) {
    throw new AppError(503, SUPABASE_CONFIG_ERROR_MESSAGE);
  }

  const { data, error } = await client.auth.getUser();

  if (error || !data.user) {
    throw new AppError(401, "ログインが必要です。");
  }

  return data.user;
}
