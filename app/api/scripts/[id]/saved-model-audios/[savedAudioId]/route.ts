import { NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { requireCurrentUser } from "@/lib/supabase/auth";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { getErrorMessage, getErrorStatus } from "@/lib/errors";
import { jsonError, jsonOk } from "@/lib/http";
import { savedModelAudioIdSchema, patchSavedModelAudioRequestSchema } from "@/schemas/audio-library";
import { scriptIdSchema } from "@/schemas/script";
import {
  AudioLibraryError,
  replaceSavedModelAudioEntrySlot,
  unsaveModelAudio,
  updateSavedModelAudioLabel
} from "@/services/audio-library";

type RouteParams = {
  params:
    | {
        id: string;
        savedAudioId: string;
      }
    | Promise<{
        id: string;
        savedAudioId: string;
      }>;
};

function jsonAudioLibraryError(error: unknown, fallback: string) {
  if (error instanceof AudioLibraryError) {
    return jsonError(error.message, error.status, { code: error.code });
  }

  return jsonError(getErrorMessage(error, fallback), getErrorStatus(error, 500));
}

async function parseRouteIds(params: RouteParams["params"]) {
  const { id, savedAudioId } = await params;
  const parsedScriptId = scriptIdSchema.safeParse(id);

  if (!parsedScriptId.success) {
    return {
      error: jsonError(parsedScriptId.error.issues[0]?.message ?? "script ID を確認してください。", 400)
    };
  }

  const parsedSavedAudioId = savedModelAudioIdSchema.safeParse(savedAudioId);

  if (!parsedSavedAudioId.success) {
    return {
      error: jsonError(parsedSavedAudioId.error.issues[0]?.message ?? "保存済み見本音声 ID を確認してください。", 400)
    };
  }

  return {
    scriptId: parsedScriptId.data,
    savedAudioId: parsedSavedAudioId.data
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
    const parsedBody = patchSavedModelAudioRequestSchema.safeParse(payload);

    if (!parsedBody.success) {
      return jsonError(parsedBody.error.issues[0]?.message ?? "保存済み見本音声の更新内容を確認してください。", 400);
    }

    const supabase = createSupabaseRouteClient();
    const user = await requireCurrentUser(supabase);
    const body = parsedBody.data;
    const savedModelAudio =
      body.scriptAudioId && body.slot
        ? await replaceSavedModelAudioEntrySlot(supabase, user.id, {
            scriptId: routeIds.scriptId,
            savedModelAudioId: routeIds.savedAudioId,
            scriptAudioId: body.scriptAudioId,
            slot: body.slot,
            label: body.label
          })
        : await updateSavedModelAudioLabel(supabase, user.id, {
            scriptId: routeIds.scriptId,
            savedModelAudioId: routeIds.savedAudioId,
            label: body.label ?? ""
          });

    return jsonOk({ savedModelAudio });
  } catch (error) {
    return jsonAudioLibraryError(error, "保存済み見本音声を更新できませんでした。");
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
    const savedModelAudio = await unsaveModelAudio(supabase, user.id, routeIds.scriptId, routeIds.savedAudioId);

    return jsonOk({ deleted: true, savedModelAudio });
  } catch (error) {
    return jsonAudioLibraryError(error, "見本音声の保存を解除できませんでした。");
  }
}
