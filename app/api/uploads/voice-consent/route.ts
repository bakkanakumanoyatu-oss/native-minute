import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { requireCurrentUser } from "@/lib/supabase/auth";
import { assertCostGuardEnabled } from "@/lib/cost-guard";
import { jsonError, jsonOk } from "@/lib/http";
import { getErrorMessage, getErrorStatus } from "@/lib/errors";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { uploadOwnedVoiceConsentRecording } from "@/services/storage";

export async function POST(request: Request) {
  if (!hasSupabaseConfig()) {
    return jsonError("Supabase の環境変数が未設定です。", 503);
  }

  const supabase = createSupabaseRouteClient();

  try {
    const user = await requireCurrentUser(supabase);
    assertCostGuardEnabled("storage_uploads");
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return jsonError("同意録音ファイルが必要です。", 400);
    }

    const uploaded = await uploadOwnedVoiceConsentRecording(supabase, user.id, {
      file
    });

    return supabase.applyToResponse(
      jsonOk(
        {
          recording: {
            audioPath: uploaded.audioPath,
            contentType: uploaded.contentType,
            byteLength: uploaded.byteLength
          }
        },
        { status: 201 }
      )
    );
  } catch (error) {
    return supabase.applyToResponse(jsonError(getErrorMessage(error, "同意録音の保存に失敗しました。"), getErrorStatus(error, 500)));
  }
}
