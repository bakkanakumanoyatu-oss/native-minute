import { NextRequest } from "next/server";
import {
  handleMobileScriptAudioGet,
  handleMobileScriptAudioOptions,
  handleMobileScriptAudioUnsupportedMethod
} from "@/lib/mobile/script-audio-route";

type RouteParams = {
  params: { audioId: string } | Promise<{ audioId: string }>;
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { audioId } = await params;
  return handleMobileScriptAudioGet(request, audioId);
}

export function OPTIONS(request: NextRequest) {
  return handleMobileScriptAudioOptions(request);
}

export const HEAD = handleMobileScriptAudioUnsupportedMethod;
export const POST = handleMobileScriptAudioUnsupportedMethod;
export const PUT = handleMobileScriptAudioUnsupportedMethod;
export const PATCH = handleMobileScriptAudioUnsupportedMethod;
export const DELETE = handleMobileScriptAudioUnsupportedMethod;
