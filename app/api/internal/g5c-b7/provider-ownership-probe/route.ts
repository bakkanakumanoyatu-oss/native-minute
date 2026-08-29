import { NextRequest } from "next/server";
import { handleG5cB7ProviderOwnershipProbeGet } from "@/lib/internal/g5c-b7-provider-ownership-probe-route";

export function GET(request: NextRequest) {
  return handleG5cB7ProviderOwnershipProbeGet(request);
}
