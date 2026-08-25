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
  script_not_found: { message: "台本が見つかりませんでした。", retryable: false },
  script_limit_reached: { message: "台本の保存上限に達しています。", retryable: false },
  listen_unavailable: { message: "お手本音声を準備できませんでした。", retryable: true },
  voice_setup_required: { message: "お手本音声の準備が必要です。", retryable: false },
  voice_setup_unavailable: { message: "お手本ボイスを準備できませんでした。少し待ってから再試行してください。", retryable: true },
  voice_sample_invalid: { message: "声の録音を確認して、もう一度録音してください。", retryable: false },
  consent_unavailable: { message: "同意状態を確認できませんでした。少し待ってから再試行してください。", retryable: true },
  pronunciation_consent_required: { message: "録音と発音評価への同意が必要です。", retryable: false },
  audio_not_found: { message: "お手本音声が見つかりませんでした。", retryable: false },
  audio_unavailable: { message: "お手本音声を取得できませんでした。", retryable: true },
  recording_invalid: { message: "録音データを確認してください。", retryable: false },
  recording_too_large: { message: "録音データが大きすぎます。", retryable: false },
  recording_format_unsupported: { message: "録音形式を確認してください。", retryable: false },
  recording_unavailable: { message: "録音データを保存できませんでした。", retryable: true },
  review_not_found: { message: "レビューが見つかりませんでした。", retryable: false },
  evaluation_in_progress: { message: "同じ Take の評価を処理中です。少し待ってから再試行してください。", retryable: true },
  evaluation_unavailable: { message: "評価を完了できませんでした。", retryable: true },
  progress_unavailable: { message: "進捗を取得できませんでした。", retryable: true },
  account_deletion_in_progress: { message: "アカウント処理中のため台本を表示できません。", retryable: false },
  account_deletion_unavailable: { message: "削除リクエストの状況を確認できませんでした。少し待ってから再試行してください。", retryable: true },
  voice_deletion_unavailable: { message: "ボイス削除の状況を確認できませんでした。少し待ってから再試行してください。", retryable: true },
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
  options?: {
    retryAfterSeconds?: number;
    preflight?: boolean;
    allowedMethods?: readonly string[];
  }
) {
  const copy = MOBILE_API_ERROR_COPY[reasonCode];
  const headers = buildMobileApiHeaders(origin, {
    preflight: options?.preflight,
    allowedMethods: options?.allowedMethods
  });

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
