import { AppError } from "@/lib/errors";
import { isE2ETestModeEnabled } from "@/lib/e2e-test-mode";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AppSupabaseClient } from "@/lib/supabase/client";

type AdminUser = {
  id: string;
  email?: string;
};

function requireTestAuthEnv(name: "E2E_TEST_SECRET" | "E2E_TEST_EMAIL" | "E2E_TEST_PASSWORD") {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new AppError(503, `${name} が未設定です。E2E 用の環境変数を確認してください。`);
  }

  return value;
}

function requireServiceRoleKey() {
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!value) {
    throw new AppError(503, "SUPABASE_SERVICE_ROLE_KEY が未設定です。E2E test-login には service role key が必要です。");
  }

  return value;
}

export function assertTestLoginAllowed(secret: string) {
  if (!isE2ETestModeEnabled()) {
    throw new AppError(404, "test-login route は development または E2E test mode でのみ利用できます。");
  }

  const expectedSecret = requireTestAuthEnv("E2E_TEST_SECRET");

  if (secret !== expectedSecret) {
    throw new AppError(403, "E2E secret が一致しません。");
  }
}

async function findTestUserByEmail(email: string) {
  requireServiceRoleKey();
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200
  });

  if (error) {
    throw new AppError(500, `テストユーザー一覧を取得できませんでした。${error.message}`);
  }

  return (data.users ?? []).find((user) => user.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

async function ensureTestUser() {
  requireServiceRoleKey();
  const admin = createSupabaseAdminClient();
  const email = requireTestAuthEnv("E2E_TEST_EMAIL");
  const password = requireTestAuthEnv("E2E_TEST_PASSWORD");
  const existingUser = await findTestUserByEmail(email);

  if (!existingUser) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (error || !data.user) {
      throw new AppError(500, `テストユーザーを作成できませんでした。${error?.message ?? "user が返りませんでした。"}`);
    }

    return {
      id: data.user.id,
      email
    } satisfies AdminUser;
  }

  const { data, error } = await admin.auth.admin.updateUserById(existingUser.id, {
    password,
    email_confirm: true
  });

  if (error || !data.user) {
    throw new AppError(500, `テストユーザーを更新できませんでした。${error?.message ?? "user が返りませんでした。"}`);
  }

  return {
    id: data.user.id,
    email
  } satisfies AdminUser;
}

export async function signInE2ETestUser(routeClient: AppSupabaseClient) {
  const user = await ensureTestUser();
  const password = requireTestAuthEnv("E2E_TEST_PASSWORD");

  const { data, error } = await routeClient.auth.signInWithPassword({
    email: user.email ?? requireTestAuthEnv("E2E_TEST_EMAIL"),
    password
  });

  if (error || !data.user) {
    throw new AppError(500, `E2E テストユーザーでログインできませんでした。${error?.message ?? "session が返りませんでした。"}`);
  }

  return {
    id: data.user.id,
    email: data.user.email ?? user.email
  };
}
