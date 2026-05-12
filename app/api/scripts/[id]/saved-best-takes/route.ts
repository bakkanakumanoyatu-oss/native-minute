import { NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { requireCurrentUser } from "@/lib/supabase/auth";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { getErrorMessage, getErrorStatus } from "@/lib/errors";
import { jsonError, jsonOk } from "@/lib/http";
import { scriptIdSchema } from "@/schemas/script";
import { saveBestTakeRequestSchema } from "@/schemas/audio-library";
import { AudioLibraryError, listSavedBestTakes, saveBestTake } from "@/services/audio-library";

type RouteParams = {
  params:
    | {
        id: string;
      }
    | Promise<{
        id: string;
      }>;
};

function jsonAudioLibraryError(error: unknown, fallback: string) {
  if (error instanceof AudioLibraryError) {
    return jsonError(error.message, error.status, { code: error.code });
  }

  return jsonError(getErrorMessage(error, fallback), getErrorStatus(error, 500));
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  if (!hasSupabaseConfig()) {
    return jsonError("Supabase の環境変数が未設定です。", 503);
  }

  try {
    const { id } = await params;
    const parsedScriptId = scriptIdSchema.safeParse(id);

    if (!parsedScriptId.success) {
      return jsonError(parsedScriptId.error.issues[0]?.message ?? "script ID を確認してください。", 400);
    }

    const supabase = createSupabaseRouteClient();
    const user = await requireCurrentUser(supabase);
    const savedBestTakes = await listSavedBestTakes(supabase, user.id, parsedScriptId.data);

    return jsonOk({ savedBestTakes });
  } catch (error) {
    return jsonAudioLibraryError(error, "保存済みベスト録音を取得できませんでした。");
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  if (!hasSupabaseConfig()) {
    return jsonError("Supabase の環境変数が未設定です。", 503);
  }

  try {
    const { id } = await params;
    const parsedScriptId = scriptIdSchema.safeParse(id);

    if (!parsedScriptId.success) {
      return jsonError(parsedScriptId.error.issues[0]?.message ?? "script ID を確認してください。", 400);
    }

    const payload = await request.json().catch(() => null);
    const parsedBody = saveBestTakeRequestSchema.safeParse(payload);

    if (!parsedBody.success) {
      return jsonError(parsedBody.error.issues[0]?.message ?? "保存する録音結果を確認してください。", 400);
    }

    const supabase = createSupabaseRouteClient();
    const user = await requireCurrentUser(supabase);
    const savedBestTake = await saveBestTake(supabase, user.id, {
      scriptId: parsedScriptId.data,
      takeId: parsedBody.data.takeId,
      slot: parsedBody.data.slot,
      label: parsedBody.data.label
    });

    return jsonOk({ savedBestTake }, { status: 201 });
  } catch (error) {
    return jsonAudioLibraryError(error, "ベスト録音を保存できませんでした。");
  }
}
