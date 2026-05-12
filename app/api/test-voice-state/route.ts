import { NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { requireCurrentUser } from "@/lib/supabase/auth";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { getErrorMessage, getErrorStatus } from "@/lib/errors";
import { jsonError, jsonOk } from "@/lib/http";
import { getVoiceProviderName, TEST_VOICE_PROVIDER_STATUS_COOKIE } from "@/providers/voice/factory";
import { testVoiceStateRequestSchema } from "@/schemas/test-auth";
import { assertTestLoginAllowed } from "@/services/test-auth/test-login.service";
import { resetCurrentProviderVoiceSetupState } from "@/services/test-auth/test-voice-state.service";

export async function POST(request: NextRequest) {
  if (!hasSupabaseConfig()) {
    return jsonError("Supabase の環境変数が未設定です。", 503);
  }

  const supabase = createSupabaseRouteClient();

  try {
    const payload = await request.json().catch(() => null);
    const parsed = testVoiceStateRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "test-voice-state 入力を確認してください。", 400);
    }

    assertTestLoginAllowed(parsed.data.secret);

    const user = await requireCurrentUser(supabase);

    if (parsed.data.action === "reset_current_provider_voice_setup") {
      const result = await resetCurrentProviderVoiceSetupState(user.id);
      const response = supabase.applyToResponse(jsonOk(result));
      response.cookies.delete(TEST_VOICE_PROVIDER_STATUS_COOKIE);
      return response;
    }

    if (parsed.data.action === "set_current_provider_unavailable") {
      const provider = getVoiceProviderName();
      const response = supabase.applyToResponse(
        jsonOk({
          provider,
          override: "provider_unavailable"
        })
      );
      response.cookies.set(TEST_VOICE_PROVIDER_STATUS_COOKIE, `${provider}:provider_unavailable`, {
        httpOnly: true,
        sameSite: "lax",
        path: "/"
      });
      return response;
    }

    if (parsed.data.action === "clear_current_provider_status_override") {
      const response = supabase.applyToResponse(
        jsonOk({
          cleared: true
        })
      );
      response.cookies.delete(TEST_VOICE_PROVIDER_STATUS_COOKIE);
      return response;
    }

    return supabase.applyToResponse(jsonError("未対応の test-voice-state action です。", 400));
  } catch (error) {
    return supabase.applyToResponse(jsonError(getErrorMessage(error, "test-voice-state に失敗しました。"), getErrorStatus(error, 500)));
  }
}
