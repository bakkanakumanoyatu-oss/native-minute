import { NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { requireCurrentUser } from "@/lib/supabase/auth";
import { updateScriptSchema, scriptIdSchema, scriptArchiveSchema } from "@/schemas/script";
import { jsonError, jsonOk } from "@/lib/http";
import { getErrorMessage, getErrorStatus } from "@/lib/errors";
import { deleteScript, getScript, updateScript, setScriptArchived } from "@/services/scripts/scripts.service";
import { hasSupabaseConfig } from "@/lib/supabase/config";

type RouteParams = {
  params:
    | {
        id: string;
      }
    | Promise<{
        id: string;
      }>;
};

export async function GET(_request: NextRequest, { params }: RouteParams) {
  if (!hasSupabaseConfig()) {
    return jsonError("Supabase の環境変数が未設定です。", 503);
  }

  try {
    const { id } = await params;
    const scriptId = scriptIdSchema.parse(id);
    const supabase = createSupabaseRouteClient();
    const user = await requireCurrentUser(supabase);
    const script = await getScript(supabase, user.id, scriptId);

    if (!script) {
      return jsonError("台本が見つかりませんでした。", 404);
    }

    return jsonOk({ script });
  } catch (error) {
    return jsonError(getErrorMessage(error, "台本を取得できませんでした。"), getErrorStatus(error, 500));
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  if (!hasSupabaseConfig()) {
    return jsonError("Supabase の環境変数が未設定です。", 503);
  }

  try {
    const { id } = await params;
    const supabase = createSupabaseRouteClient();
    const user = await requireCurrentUser(supabase);
    const payload = await request.json().catch(() => null);
    const body = payload && typeof payload === "object" ? payload : {};
    if ("archived" in body) {
      const state = scriptArchiveSchema.safeParse(body);
      if (!state.success) return jsonError("更新内容を確認してください。", 400);
      return jsonOk({ script: await setScriptArchived(supabase, user.id, scriptIdSchema.parse(id), state.data.archived, state.data.expectedLockVersion) });
    }
    const parsed = updateScriptSchema.safeParse({ ...body, id });

    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "更新内容を確認してください。", 400);
    }

    const script = await updateScript(supabase, user.id, parsed.data);
    return jsonOk({ script });
  } catch (error) {
    return jsonError(getErrorMessage(error, "台本を更新できませんでした。"), getErrorStatus(error, 500));
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  if (!hasSupabaseConfig()) {
    return jsonError("Supabase の環境変数が未設定です。", 503);
  }

  try {
    const { id } = await params;
    const scriptId = scriptIdSchema.parse(id);
    const supabase = createSupabaseRouteClient();
    const user = await requireCurrentUser(supabase);
    const payload = await request.json().catch(() => null);
    const expected = payload?.expectedLockVersion;
    if (expected !== undefined && (!Number.isSafeInteger(expected) || expected < 1)) return jsonError("更新内容を確認してください。", 400);
    const result = await deleteScript(supabase, user.id, scriptId, expected);
    return jsonOk({ deleted: { id: result.id }, script: result, archivedScript: result });
  } catch (error) {
    return jsonError(getErrorMessage(error, "台本を削除できませんでした。"), getErrorStatus(error, 500));
  }
}
