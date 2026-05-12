import { NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { requireCurrentUser } from "@/lib/supabase/auth";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { getErrorMessage, getErrorStatus } from "@/lib/errors";
import { jsonError, jsonOk } from "@/lib/http";
import { savedBestTakeIdSchema, patchSavedBestTakeRequestSchema } from "@/schemas/audio-library";
import { scriptIdSchema } from "@/schemas/script";
import {
  AudioLibraryError,
  replaceSavedBestTakeEntrySlot,
  unsaveBestTake,
  updateSavedBestTakeLabel
} from "@/services/audio-library";

type RouteParams = {
  params:
    | {
        id: string;
        savedBestTakeId: string;
      }
    | Promise<{
        id: string;
        savedBestTakeId: string;
      }>;
};

function jsonAudioLibraryError(error: unknown, fallback: string) {
  if (error instanceof AudioLibraryError) {
    return jsonError(error.message, error.status, { code: error.code });
  }

  return jsonError(getErrorMessage(error, fallback), getErrorStatus(error, 500));
}

async function parseRouteIds(params: RouteParams["params"]) {
  const { id, savedBestTakeId } = await params;
  const parsedScriptId = scriptIdSchema.safeParse(id);

  if (!parsedScriptId.success) {
    return {
      error: jsonError(parsedScriptId.error.issues[0]?.message ?? "script ID を確認してください。", 400)
    };
  }

  const parsedSavedBestTakeId = savedBestTakeIdSchema.safeParse(savedBestTakeId);

  if (!parsedSavedBestTakeId.success) {
    return {
      error: jsonError(parsedSavedBestTakeId.error.issues[0]?.message ?? "保存済みベスト録音 ID を確認してください。", 400)
    };
  }

  return {
    scriptId: parsedScriptId.data,
    savedBestTakeId: parsedSavedBestTakeId.data
  };
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  if (!hasSupabaseConfig()) {
    return jsonError("Supabase の環境変数が未設定です。", 503);
  }

  try {
    const routeIds = await parseRouteIds(params);

    if ("error" in routeIds) {
      return routeIds.error;
    }

    const payload = await request.json().catch(() => null);
    const parsedBody = patchSavedBestTakeRequestSchema.safeParse(payload);

    if (!parsedBody.success) {
      return jsonError(parsedBody.error.issues[0]?.message ?? "保存済みベスト録音の更新内容を確認してください。", 400);
    }

    const supabase = createSupabaseRouteClient();
    const user = await requireCurrentUser(supabase);
    const body = parsedBody.data;
    const savedBestTake =
      body.takeId && body.slot
        ? await replaceSavedBestTakeEntrySlot(supabase, user.id, {
            scriptId: routeIds.scriptId,
            savedBestTakeId: routeIds.savedBestTakeId,
            takeId: body.takeId,
            slot: body.slot,
            label: body.label
          })
        : await updateSavedBestTakeLabel(supabase, user.id, {
            scriptId: routeIds.scriptId,
            savedBestTakeId: routeIds.savedBestTakeId,
            label: body.label ?? ""
          });

    return jsonOk({ savedBestTake });
  } catch (error) {
    return jsonAudioLibraryError(error, "保存済みベスト録音を更新できませんでした。");
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  if (!hasSupabaseConfig()) {
    return jsonError("Supabase の環境変数が未設定です。", 503);
  }

  try {
    const routeIds = await parseRouteIds(params);

    if ("error" in routeIds) {
      return routeIds.error;
    }

    const supabase = createSupabaseRouteClient();
    const user = await requireCurrentUser(supabase);
    const savedBestTake = await unsaveBestTake(supabase, user.id, routeIds.scriptId, routeIds.savedBestTakeId);

    return jsonOk({ deleted: true, savedBestTake });
  } catch (error) {
    return jsonAudioLibraryError(error, "ベスト録音の保存を解除できませんでした。");
  }
}
