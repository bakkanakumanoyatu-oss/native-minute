import { NextRequest, NextResponse } from "next/server";
import { LOGIN_CONTINUITY_COOKIE } from "@/lib/navigation";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { jsonError, jsonOk } from "@/lib/http";
import { hasSupabaseConfig } from "@/lib/supabase/config";

function expireCookie(response: NextResponse, name: string) {
  response.cookies.set(name, "", {
    path: "/",
    maxAge: 0,
    expires: new Date(0)
  });
}

function clearTransientAuthCookies(request: NextRequest, response: NextResponse) {
  expireCookie(response, LOGIN_CONTINUITY_COOKIE);

  request.cookies
    .getAll()
    .filter((cookie) => cookie.name.includes("auth-token") || cookie.name.endsWith("-code-verifier"))
    .forEach((cookie) => expireCookie(response, cookie.name));

  return response;
}

export async function POST(request: NextRequest) {
  if (!hasSupabaseConfig()) {
    return jsonError("Supabase の環境変数が未設定です。", 503);
  }

  const supabase = createSupabaseRouteClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    return supabase.applyToResponse(jsonError("サインアウトできませんでした。", 400, { detail: error.message }));
  }

  return clearTransientAuthCookies(request, supabase.applyToResponse(jsonOk({ signedOut: true })));
}
