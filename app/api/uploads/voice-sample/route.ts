import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { requireCurrentUser } from "@/lib/supabase/auth";
import { assertCostGuardEnabled } from "@/lib/cost-guard";
import { jsonError, jsonOk } from "@/lib/http";
import { getErrorMessage, getErrorStatus } from "@/lib/errors";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { uploadVoiceSampleSchema } from "@/schemas/upload";
import { uploadOwnedVoiceSample } from "@/services/storage";

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
      return jsonError("見本音声 sample が必要です。", 400);
    }

    const parsed = uploadVoiceSampleSchema.safeParse({
      consentId: typeof formData.get("consentId") === "string" ? formData.get("consentId") : undefined
    });

    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "見本音声 sample アップロード入力を確認してください。", 400);
    }

    const uploaded = await uploadOwnedVoiceSample(supabase, user.id, {
      consentId: parsed.data.consentId,
      file
    });

    return supabase.applyToResponse(
      jsonOk(
        {
          sampleAudio: {
            audioPath: uploaded.audioPath,
            contentType: uploaded.contentType,
            byteLength: uploaded.byteLength
          }
        },
        { status: 201 }
      )
    );
  } catch (error) {
    return supabase.applyToResponse(jsonError(getErrorMessage(error, "見本音声 sample の保存に失敗しました。"), getErrorStatus(error, 500)));
  }
}
