import { NextRequest } from "next/server";
import {
  handleMobileVoiceDeletionAdvancePost,
  handleMobileVoiceDeletionPostOptions,
  handleMobileVoiceDeletionUnsupportedMethod
} from "@/lib/mobile/voice-deletion-route";

export function POST(request: NextRequest) {
  return handleMobileVoiceDeletionAdvancePost(request);
}

export function OPTIONS(request: NextRequest) {
  return handleMobileVoiceDeletionPostOptions(request);
}

export const HEAD = handleMobileVoiceDeletionUnsupportedMethod;
export const GET = handleMobileVoiceDeletionUnsupportedMethod;
export const PUT = handleMobileVoiceDeletionUnsupportedMethod;
export const PATCH = handleMobileVoiceDeletionUnsupportedMethod;
export const DELETE = handleMobileVoiceDeletionUnsupportedMethod;
