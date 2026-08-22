import { NextRequest } from "next/server";
import { getErrorMessage, getErrorStatus } from "@/lib/errors";
import { jsonError, jsonOk } from "@/lib/http";
import { requireCurrentUser } from "@/lib/supabase/auth";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { acceptProcessingConsentSchema, processingConsentTypeSchema } from "@/schemas/consent";
import {
  acceptCurrentProcessingConsent,
  getProcessingConsentStatus,
  withdrawCurrentProcessingConsent
} from "@/services/consent";

type RouteContext = { params: { consentType: string } };

function parseType(value: string) {
  return processingConsentTypeSchema.safeParse(value);
}

async function withCurrentUser() {
  if (!hasSupabaseConfig()) {
    return null;
  }

  const supabase = createSupabaseRouteClient();
  const user = await requireCurrentUser(supabase);
  return { supabase, user };
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const parsedType = parseType(context.params.consentType);

  if (!parsedType.success) {
    return jsonError("同意種別を確認してください。", 400);
  }

  try {
    const auth = await withCurrentUser();

    if (!auth) {
      return jsonError("Supabase の環境変数が未設定です。", 503);
    }

    const consent = await getProcessingConsentStatus(auth.supabase, auth.user.id, parsedType.data);
    return auth.supabase.applyToResponse(jsonOk({ consent }));
  } catch (error) {
    return jsonError(getErrorMessage(error, "同意状態を取得できませんでした。"), getErrorStatus(error, 500));
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const parsedType = parseType(context.params.consentType);
  const payload = await request.json().catch(() => null);
  const accepted = acceptProcessingConsentSchema.safeParse(payload);

  if (!parsedType.success || !accepted.success) {
    return jsonError("同意内容を確認してください。", 400);
  }

  try {
    const auth = await withCurrentUser();

    if (!auth) {
      return jsonError("Supabase の環境変数が未設定です。", 503);
    }

    await acceptCurrentProcessingConsent(auth.supabase, auth.user.id, parsedType.data);
    const consent = await getProcessingConsentStatus(auth.supabase, auth.user.id, parsedType.data);
    return auth.supabase.applyToResponse(jsonOk({ consent }));
  } catch (error) {
    return jsonError(getErrorMessage(error, "同意の保存に失敗しました。"), getErrorStatus(error, 500));
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const parsedType = parseType(context.params.consentType);

  if (!parsedType.success) {
    return jsonError("同意種別を確認してください。", 400);
  }

  try {
    const auth = await withCurrentUser();

    if (!auth) {
      return jsonError("Supabase の環境変数が未設定です。", 503);
    }

    const consent = await withdrawCurrentProcessingConsent(auth.supabase, auth.user.id, parsedType.data);
    return auth.supabase.applyToResponse(jsonOk({ consent }));
  } catch (error) {
    return jsonError(getErrorMessage(error, "同意の撤回に失敗しました。"), getErrorStatus(error, 500));
  }
}
