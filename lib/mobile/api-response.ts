import { NextResponse } from "next/server";
import { buildMobileApiHeaders } from "./api-cors";
import type { MobileApiErrorBody, MobileApiReasonCode, MobileApiSuccessBody } from "./contracts";

const MOBILE_API_ERROR_COPY: Record<MobileApiReasonCode, { message: string; retryable: boolean }> = {
  auth_required: { message: "ログインが必要です。", retryable: false },
  session_expired: { message: "ログインし直してください。", retryable: false },
  session_invalid: { message: "セッションを確認できませんでした。", retryable: false },
  auth_unavailable: { message: "認証サービスに接続できません。", retryable: true },
  request_invalid: { message: "リクエストを確認してください。", retryable: false },
  origin_forbidden: { message: "このアプリ環境からは接続できません。", retryable: false },
  method_not_allowed: { message: "この操作は利用できません。", retryable: false },
  rate_limited: { message: "しばらく待ってから再試行してください。", retryable: true },
  scripts_unavailable: { message: "台本一覧を取得できませんでした。", retryable: true },
  account_deletion_in_progress: { message: "アカウント処理中のため台本を表示できません。", retryable: false },
  mobile_auth_disabled: { message: "モバイル認証は現在利用できません。", retryable: true }
};

export function mobileApiOk<T>(origin: string, data: T, status = 200) {
  return NextResponse.json<MobileApiSuccessBody<T>>(
    { ok: true, data },
    {
      status,
      headers: buildMobileApiHeaders(origin)
    }
  );
}

export function mobileApiError(
  origin: string | null,
  status: number,
  reasonCode: MobileApiReasonCode,
  options?: { retryAfterSeconds?: number; preflight?: boolean }
) {
  const copy = MOBILE_API_ERROR_COPY[reasonCode];
  const headers = buildMobileApiHeaders(origin, { preflight: options?.preflight });

  if (status === 401) {
    headers.set("WWW-Authenticate", "Bearer");
  }

  if (status === 429) {
    const retryAfterSeconds = Math.max(1, Math.min(300, Math.trunc(options?.retryAfterSeconds ?? 30)));
    headers.set("Retry-After", String(retryAfterSeconds));
  }

  return NextResponse.json<MobileApiErrorBody>(
    {
      ok: false,
      error: {
        reasonCode,
        message: copy.message,
        retryable: copy.retryable
      }
    },
    { status, headers }
  );
}
