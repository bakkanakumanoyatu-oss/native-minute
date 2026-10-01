import { NextRequest, NextResponse } from "next/server";
import { createWriteFenceResponse } from "@/lib/operations/write-fence";

const PROVIDER_PROBE_PATH = "/api/operations/provider-readonly-probe";

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  // The route itself verifies an operator signature before any provider GET.
  if (request.method === "GET" && pathname === PROVIDER_PROBE_PATH) {
    return NextResponse.next();
  }

  return createWriteFenceResponse(request.method, pathname) ?? NextResponse.next();
}

export const config = { matcher: ["/:path*"] };
