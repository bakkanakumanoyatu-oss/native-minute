import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { requireCurrentUser } from "@/lib/supabase/auth";
import { assertCostGuardEnabled } from "@/lib/cost-guard";
import { jsonError, jsonOk } from "@/lib/http";
import { getErrorMessage, getErrorStatus } from "@/lib/errors";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { uploadRecordingSchema } from "@/schemas/upload";
import { uploadOwnedRecording } from "@/services/storage";

export async function POST(request: Request) {
  if (!hasSupabaseConfig()) {
    return jsonError("Supabase の環境変数が未設定です。", 503);
  }

  try {
    const supabase = createSupabaseRouteClient();
    const user = await requireCurrentUser(supabase);
    assertCostGuardEnabled("storage_uploads");
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return jsonError("録音ファイルが必要です。", 400);
    }

    const parsed = uploadRecordingSchema.safeParse({
      scriptId: typeof formData.get("scriptId") === "string" ? formData.get("scriptId") : undefined,
      durationSeconds: typeof formData.get("durationSeconds") === "string" ? formData.get("durationSeconds") : undefined
    });

    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "録音アップロード入力を確認してください。", 400);
    }

    const uploaded = await uploadOwnedRecording(supabase, user.id, {
      scriptId: parsed.data.scriptId,
      file,
      durationSeconds: parsed.data.durationSeconds
    });

    return jsonOk(uploaded, { status: 201 });
  } catch (error) {
    return jsonError(getErrorMessage(error, "録音ファイルの保存に失敗しました。"), getErrorStatus(error, 500));
  }
}
