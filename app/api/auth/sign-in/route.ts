import { NextRequest, NextResponse } from "next/server";
import {
  buildAuthCallbackHref,
  buildLoginHref,
  LOGIN_CONTINUITY_COOKIE,
  getInternalPath,
  getRequestOrigin
} from "@/lib/navigation";
import { createSupabaseRouteClient, getSafeAuthCookieSummary, isSupabasePkceVerifierCookieName } from "@/lib/supabase/route";
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

function isFormPostRequest(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";
  return contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data");
}

async function readSignInPayload(request: NextRequest) {
  if (isFormPostRequest(request)) {
    const formData = await request.formData().catch(() => null);
    const email = formData?.get("email") ?? formData?.get("login-email");
    return {
      payload: {
        email: typeof email === "string" ? email : ""
      },
      isFormPost: true
    };
  }

  return {
    payload: await request.json().catch(() => null),
    isFormPost: false
  };
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
        ? "ログイン用メールを送信できませんでした。アプリを開いているURLとログイン用リンクの戻り先がずれています。"
        : "ログイン用メールを送信できませんでした。ログイン用リンクの戻り先を確認してください。"
    };
  }

  if (originMismatch) {
    return {
      kind: "origin_or_redirect" as const,
      message: "ログイン用メールを送信できませんでした。アプリを開いているURLを確認して、もう一度お試しください。"
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
      message: "ログイン用メールを送信できませんでした。少し待ってからもう一度お試しください。"
    };
  }

  return {
    kind: "provider_rejected" as const,
    message: "ログイン用メールを送信できませんでした。少し待ってからもう一度お試しください。"
  };
}

function buildLoginSentHref(nextPath: string) {
  return `/login?sent=1&next=${encodeURIComponent(nextPath)}`;
}

function redirectTo(requestOrigin: string, path: string, status = 303) {
  return NextResponse.redirect(new URL(path, requestOrigin), status);
}

function signInFailureResponse(input: {
  message: string;
  status: number;
  isFormPost: boolean;
  nextPath: string;
  requestOrigin: string;
}) {
  if (input.isFormPost) {
    return redirectTo(input.requestOrigin, buildLoginHref(input.nextPath, "sign_in_failed", "/scripts"), 303);
  }

  return jsonError(input.message, input.status);
}

function shouldExposeSetCookieSummary(request: NextRequest) {
  return process.env.NODE_ENV !== "production" && request.nextUrl.searchParams.get("debugAuthCookies") !== "0";
}

function attachSafeSetCookieSummary(response: NextResponse, request: NextRequest) {
  const setCookieSummary = getSafeAuthCookieSummary(response.cookies.getAll(), LOGIN_CONTINUITY_COOKIE);

  if (shouldExposeSetCookieSummary(request)) {
    response.headers.set("x-native-minute-auth-set-cookie-summary", JSON.stringify(setCookieSummary));
  }

  return setCookieSummary;
}

export async function POST(request: NextRequest) {
  const nextPath = getInternalPath(request.nextUrl.searchParams.get("next"), "/scripts");
  const requestOrigin = getRequestOrigin(request);
  const { payload, isFormPost } = await readSignInPayload(request);

  if (!hasSupabaseConfig()) {
    return signInFailureResponse({
      message: "ログインの準備がまだ完了していません。時間をおいてもう一度お試しください。",
      status: 503,
      isFormPost,
      nextPath,
      requestOrigin
    });
  }

  const parsed = signInSchema.safeParse(payload);

  if (!parsed.success) {
    return signInFailureResponse({
      message: parsed.error.issues[0]?.message ?? "メールアドレスを確認してください。",
      status: 400,
      isFormPost,
      nextPath,
      requestOrigin
    });
  }

  const supabase = createSupabaseRouteClient(request);
  const callbackPath = buildAuthCallbackHref(nextPath, "/scripts");
  const publicAppUrl = getPublicAppUrl();
  const emailRedirectTo = new URL(callbackPath, requestOrigin).toString();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo
    }
  });

  if (!error) {
    const response = supabase.applyToResponse(
      isFormPost ? redirectTo(requestOrigin, buildLoginSentHref(nextPath), 303) : jsonOk({ sent: true })
    );

    response.cookies.set(LOGIN_CONTINUITY_COOKIE, nextPath, {
      httpOnly: true,
      sameSite: "lax",
      secure: new URL(requestOrigin).protocol === "https:",
      path: "/",
      maxAge: 10 * 60
    });

    const setCookieSummary = attachSafeSetCookieSummary(response, request);

    if (!setCookieSummary.hasPkceVerifierCookie || !setCookieSummary.hasLoginContinuityCookie) {
      console.error("Auth sign-in response missing expected auth cookies", {
        originMatchesPublicAppUrl: requestOrigin === publicAppUrl,
        origin: requestOrigin,
        publicAppUrl,
        nextPath,
        setCookieSummary
      });

      return signInFailureResponse({
        message: "ログイン用メールの準備に失敗しました。少し待ってからもう一度お試しください。",
        status: 500,
        isFormPost,
        nextPath,
        requestOrigin
      });
    }

    return response;
  }

  const failure = classifySignInFailure({ errorMessage: error.message, requestOrigin, publicAppUrl });

  console.error("Auth sign-in failed", {
    failureKind: failure.kind satisfies SignInFailureKind,
    supabaseErrorCode: error.code ?? null,
    originMatchesPublicAppUrl: requestOrigin === publicAppUrl,
    origin: requestOrigin,
    publicAppUrl,
    callbackPath,
    nextPath
  });

  const response = signInFailureResponse({
    message: failure.message,
    status: 400,
    isFormPost,
    nextPath,
    requestOrigin
  });

  supabase
    .getPendingCookies()
    .filter((cookie) => isSupabasePkceVerifierCookieName(cookie.name))
    .forEach((cookie) => expireCookie(response, cookie.name));

  return response;
}

export function GET(request: NextRequest) {
  const nextPath = getInternalPath(request.nextUrl.searchParams.get("next"), "/scripts");
  const requestOrigin = getRequestOrigin(request);

  return redirectTo(requestOrigin, buildLoginHref(nextPath, "sign_in_failed", "/scripts"), 303);
}
