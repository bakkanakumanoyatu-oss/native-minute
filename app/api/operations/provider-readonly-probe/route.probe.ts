import { isAuthorizedProbe } from "@/lib/operations/probe-operator-auth.mjs";
import { runProbe } from "@/lib/operations/provider-readonly-probe.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function reply(value: unknown, status: number) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store", "X-Native-Minute-Write-Fence": "closed" } });
}

export async function GET(request: Request) {
  if (!isAuthorizedProbe(request)) return reply({ code: "probe_operator_authorization_required" }, 403);
  try {
    const mode = new URL(request.url).searchParams.get("mode") === "selector" ? "selector" : "inventory";
    return reply(await runProbe(mode), 200);
  } catch {
    return reply({ code: "probe_read_failed", pagination_complete: false }, 503);
  }
}

function denied() { return reply({ code: "production_write_fence_active", writesAllowed: false }, 503); }
export const HEAD = denied;
export const POST = denied;
export const PUT = denied;
export const PATCH = denied;
export const DELETE = denied;
export const OPTIONS = denied;
