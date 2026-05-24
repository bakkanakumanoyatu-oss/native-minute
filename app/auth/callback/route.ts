import { NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { buildLoginHref, LOGIN_CONTINUITY_COOKIE, getInternalPath, getRequestOrigin } from "@/lib/navigation";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { hasSupabaseConfig } from "@/lib/supabase/config";

const EMAIL_OTP_TYPES = new Set<EmailOtpType>(["signup", "invite", "magiclink", "recovery", "email_change", "email"]);

function getEmailOtpType(type: string): EmailOtpType {
  return EMAIL_OTP_TYPES.has(type as EmailOtpType) ? type as EmailOtpType : "magiclink";
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const requestOrigin = getRequestOrigin(request);
  const nextPath = getInternalPath(requestUrl.searchParams.get("next") ?? request.cookies.get(LOGIN_CONTINUITY_COOKIE)?.value, "/scripts");
  const cookieNames = request.cookies.getAll().map((cookie) => cookie.name);
  const hasPkceVerifierCookie = cookieNames.some((name) => name.endsWith("-code-verifier"));

  function redirectTo(path: string) {
    return new NextResponse(null, {
      status: 307,
      headers: {
        Location: path
      }
    });
  }

  function finalize(response: NextResponse, options: { clearPkceVerifierCookies: boolean }) {
    response.cookies.set(LOGIN_CONTINUITY_COOKIE, "", {
      path: "/",
      maxAge: 0,
      expires: new Date(0)
    });

    if (options.clearPkceVerifierCookies) {
      cookieNames
        .filter((name) => name.endsWith("-code-verifier"))
        .forEach((name) => {
          response.cookies.set(name, "", {
            path: "/",
            maxAge: 0,
            expires: new Date(0)
          });
        });
    }

    return response;
  }

  if (!hasSupabaseConfig()) {
    return finalize(redirectTo(buildLoginHref(nextPath, "supabase_not_configured", "/scripts")), {
      clearPkceVerifierCookies: false
    });
  }

  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const otpType = requestUrl.searchParams.get("type") ?? "magiclink";
  const providerError = requestUrl.searchParams.get("error");

  if (providerError) {
    console.error("Auth callback returned provider error", {
      error: providerError,
      origin: requestOrigin,
      nextPath
    });

    return finalize(redirectTo(buildLoginHref(nextPath, "callback_failed", "/scripts")), {
      clearPkceVerifierCookies: false
    });
  }

  if (!code && !tokenHash) {
    return finalize(redirectTo(buildLoginHref(nextPath, "missing_code", "/scripts")), {
      clearPkceVerifierCookies: false
    });
  }

  const supabase = createSupabaseRouteClient();
  const { error } = tokenHash
    ? await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: getEmailOtpType(otpType)
      })
    : await supabase.auth.exchangeCodeForSession(code as string);

  if (error) {
    const errorCode = tokenHash || hasPkceVerifierCookie ? "callback_exchange_failed" : "callback_pkce_missing";

    console.error("Auth callback exchange failed", {
      message: error.message,
      code: error.code ?? null,
      origin: requestOrigin,
      nextPath,
      callbackMode: tokenHash ? "token_hash" : "code",
      otpType: tokenHash ? otpType : null,
      hasPkceVerifierCookie,
      callbackCookieNames: cookieNames.filter((name) => name.includes("auth-token") || name === LOGIN_CONTINUITY_COOKIE)
    });

    return finalize(supabase.applyToResponse(
      redirectTo(buildLoginHref(nextPath, errorCode, "/scripts"))
    ), {
      clearPkceVerifierCookies: false
    });
  }

  return finalize(supabase.applyToResponse(redirectTo(nextPath)), {
    clearPkceVerifierCookies: true
  });
}
