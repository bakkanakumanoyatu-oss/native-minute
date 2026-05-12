import { NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { jsonError, jsonOk } from "@/lib/http";
import { getErrorMessage, getErrorStatus } from "@/lib/errors";
import { testLoginRequestSchema } from "@/schemas/test-auth";
import { assertTestLoginAllowed, signInE2ETestUser } from "@/services/test-auth/test-login.service";

export async function POST(request: NextRequest) {
  if (!hasSupabaseConfig()) {
    return jsonError("Supabase の環境変数が未設定です。", 503);
  }

  try {
    const payload = await request.json().catch(() => null);
    const parsed = testLoginRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "test-login 入力を確認してください。", 400);
    }

    assertTestLoginAllowed(parsed.data.secret);

    const supabase = createSupabaseRouteClient();
    const user = await signInE2ETestUser(supabase);

    return supabase.applyToResponse(
      jsonOk({
        signedIn: true,
        user: {
          id: user.id,
          email: user.email
        }
      })
    );
  } catch (error) {
    return jsonError(getErrorMessage(error, "test-login に失敗しました。"), getErrorStatus(error, 500));
  }
}
