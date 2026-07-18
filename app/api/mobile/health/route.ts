import { NextRequest, NextResponse } from "next/server";
import { buildMobileHealthHeaders, isAllowedMobileHealthOrigin } from "@/lib/mobile/health-cors";

const SERVICE_NAME = "native-minute-bff";

function forbiddenResponse(origin: string | null) {
  return NextResponse.json(
    { ok: false, message: "Origin is not allowed." },
    {
      status: 403,
      headers: buildMobileHealthHeaders(origin)
    }
  );
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (!isAllowedMobileHealthOrigin(origin)) {
    return forbiddenResponse(origin);
  }

  return NextResponse.json(
    {
      ok: true,
      data: {
        status: "ok",
        service: SERVICE_NAME,
        timestamp: new Date().toISOString()
      }
    },
    {
      status: 200,
      headers: buildMobileHealthHeaders(origin)
    }
  );
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (!origin || !isAllowedMobileHealthOrigin(origin)) {
    return forbiddenResponse(origin);
  }

  const requestedMethod = request.headers.get("access-control-request-method")?.toUpperCase();

  if (requestedMethod !== "GET") {
    return new NextResponse(null, {
      status: 405,
      headers: buildMobileHealthHeaders(origin)
    });
  }

  return new NextResponse(null, {
    status: 204,
    headers: buildMobileHealthHeaders(origin, { preflight: true })
  });
}
