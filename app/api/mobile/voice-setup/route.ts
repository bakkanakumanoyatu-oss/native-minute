import { NextRequest } from "next/server";
import {
  handleMobileVoiceSetupGet,
  handleMobileVoiceSetupOptions,
  handleMobileVoiceSetupPost,
  handleMobileVoiceSetupUnsupportedMethod
} from "@/lib/mobile/voice-setup-route";

export function GET(request: NextRequest) {
  return handleMobileVoiceSetupGet(request);
}

export function POST(request: NextRequest) {
  return handleMobileVoiceSetupPost(request);
}

export function OPTIONS(request: NextRequest) {
  return handleMobileVoiceSetupOptions(request);
}

export const HEAD = handleMobileVoiceSetupUnsupportedMethod;
export const PUT = handleMobileVoiceSetupUnsupportedMethod;
export const PATCH = handleMobileVoiceSetupUnsupportedMethod;
export const DELETE = handleMobileVoiceSetupUnsupportedMethod;
