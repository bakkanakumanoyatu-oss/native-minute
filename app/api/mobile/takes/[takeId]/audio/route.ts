import { NextRequest } from "next/server";
import { handleTakeAudioGet, handleTakeAudioOptions, handleTakeAudioUnsupportedMethod } from "@/lib/mobile/take-audio-route";

export async function GET(request: NextRequest, { params }: { params: { takeId: string } | Promise<{ takeId: string }> }) {
  return handleTakeAudioGet(request, (await params).takeId);
}
export const OPTIONS = handleTakeAudioOptions;
export const HEAD = handleTakeAudioUnsupportedMethod;
export const POST = handleTakeAudioUnsupportedMethod;
export const PUT = handleTakeAudioUnsupportedMethod;
export const PATCH = handleTakeAudioUnsupportedMethod;
export const DELETE = handleTakeAudioUnsupportedMethod;
