import { NextRequest } from "next/server";
import {
  handleG5cB7ManualProviderAbsenceAcceptancePost,
  handleG5cB7ManualProviderRecoveryGet
} from "@/lib/internal/g5c-b7-manual-provider-recovery-route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(request: NextRequest) {
  return handleG5cB7ManualProviderRecoveryGet(request);
}

export function POST(request: NextRequest) {
  return handleG5cB7ManualProviderAbsenceAcceptancePost(request);
}
