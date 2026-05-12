import { NextRequest, NextResponse } from "next/server";
import { buildAuthCallbackPath, LOGIN_CONTINUITY_COOKIE, getInternalPath, getRequestOrigin } from "@/lib/navigation";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { getPublicAppUrl } from "@/lib/env";
import { jsonError, jsonOk } from "@/lib/http";
import { signInSchema } from "@/schemas/auth";
import { hasSupabaseConfig } from "@/lib/supabase/config";

function expireCookie(response: NextResponse, name: string) {
  response.cookies.set(name, "", {
    path: "/",
    maxAge: 0,
    expires: new Date(0)
  });
}

type SignInFailureKind =
  | "rate_limited"
  | "origin_or_redirect"
  | "email_provider_unavailable"
  | "provider_rejected";

function classifySignInFailure(input: {
  errorMessage: string;
  requestOrigin: string;
  publicAppUrl: string;
}) {
  const normalized = input.errorMessage.toLowerCase();
  const originMismatch = input.requestOrigin !== input.publicAppUrl;

  if (normalized.includes("rate") || normalized.includes("too many")) {
    return {
      kind: "rate_limited" as const,
      message:
        "短時間にログインメールを何度も送信したため、一時的に送信できません。しばらく待ってから、または別のメールアドレスで試してください。"
    };
  }

  if (normalized.includes("redirect") || normalized.includes("invalid") || normalized.includes("not allowed")) {
    return {
      kind: "origin_or_redirect" as const,
      message: originMismatch
        ? `ログイン用メールを送信できませんでした。現在のアクセス origin (${input.requestOrigin}) を Supabase の許可済み redirect URL に追加し、NEXT_PUBLIC_APP_URL (${input.publicAppUrl}) と同じ origin で開いてください。`
        : "ログイン用メールを送信できませんでした。現在のアクセス origin を Supabase の許可済み redirect URL に追加してください。"
    };
  }

  if (originMismatch) {
    return {
      kind: "origin_or_redirect" as const,
      message: `ログイン用メールを送信できませんでした。現在のアクセス origin (${input.requestOrigin}) と NEXT_PUBLIC_APP_URL (${input.publicAppUrl}) がずれているため、メールリンク後に session を確立できない可能性があります。origin をそろえてから再試行してください。`
    };
  }

  if (
    normalized.includes("smtp") ||
    normalized.includes("mailer") ||
    normalized.includes("email provider") ||
    normalized.includes("email login") ||
    normalized.includes("sending confirmation email")
  ) {
    return {
      kind: "email_provider_unavailable" as const,
      message: "ログイン用メールを送信できませんでした。Supabase Auth のメール送信設定または email login の有効化を確認してください。"
    };
  }

  return {
    kind: "provider_rejected" as const,
    message: "ログイン用メールを送信できませんでした。少し待ってからもう一度お試しください。"
  };
}

export async function POST(request: NextRequest) {
  if (!hasSupabaseConfig()) {
    return jsonError("Supabase の環境変数が未設定です。", 503);
  }

  const nextPath = getInternalPath(request.nextUrl.searchParams.get("next"), "/scripts");

  const payload = await request.json().catch(() => null);
  const parsed = signInSchema.safeParse(payload);

  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "メールアドレスを確認してください。", 400);
  }

  const supabase = createSupabaseRouteClient();
  const callbackPath = buildAuthCallbackPath();
  const requestOrigin = getRequestOrigin(request);
  const publicAppUrl = getPublicAppUrl();
  const emailRedirectTo = new URL(callbackPath, requestOrigin).toString();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo
    }
  });

  if (!error) {
    const response = supabase.applyToResponse(jsonOk({ sent: true }));
    response.cookies.set(LOGIN_CONTINUITY_COOKIE, nextPath, {
      httpOnly: true,
      sameSite: "lax",
      secure: new URL(requestOrigin).protocol === "https:",
      path: "/",
      maxAge: 10 * 60
    });
    return response;
  }

  const failure = classifySignInFailure({ errorMessage: error.message, requestOrigin, publicAppUrl });

  console.error("Auth sign-in failed", {
    failureKind: failure.kind satisfies SignInFailureKind,
    supabaseErrorCode: error.code ?? null,
    originMatchesPublicAppUrl: requestOrigin === publicAppUrl,
    origin: requestOrigin,
    publicAppUrl,
    emailRedirectTo,
    nextPath
  });

  const response = jsonError(failure.message, 400);
  supabase
    .getPendingCookies()
    .filter((cookie) => cookie.name.endsWith("-code-verifier"))
    .forEach((cookie) => expireCookie(response, cookie.name));

  return response;
}
