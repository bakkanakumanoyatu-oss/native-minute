import { NextRequest } from "next/server";
import {
  handleMobileVoiceDeletionStatusGet,
  handleMobileVoiceDeletionStatusOptions,
  handleMobileVoiceDeletionUnsupportedMethod
} from "@/lib/mobile/voice-deletion-route";

export function GET(request: NextRequest) {
  return handleMobileVoiceDeletionStatusGet(request);
}

export function OPTIONS(request: NextRequest) {
  return handleMobileVoiceDeletionStatusOptions(request);
}

export const HEAD = handleMobileVoiceDeletionUnsupportedMethod;
export const POST = handleMobileVoiceDeletionUnsupportedMethod;
export const PUT = handleMobileVoiceDeletionUnsupportedMethod;
export const PATCH = handleMobileVoiceDeletionUnsupportedMethod;
export const DELETE = handleMobileVoiceDeletionUnsupportedMethod;
