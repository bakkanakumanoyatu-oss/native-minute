import { NextRequest } from "next/server";
import { handleTakeMetadataPatch, handleTakeMetadataOptions } from "@/lib/mobile/take-metadata-route";
import { handleMobileUnsupportedMethod } from "@/lib/mobile/route-context";

export async function PATCH(request: NextRequest, { params }: { params: { takeId: string } | Promise<{ takeId: string }> }) {
  return handleTakeMetadataPatch(request, (await params).takeId);
}
export const OPTIONS = handleTakeMetadataOptions;
export const GET = handleMobileUnsupportedMethod;
export const HEAD = handleMobileUnsupportedMethod;
export const POST = handleMobileUnsupportedMethod;
export const PUT = handleMobileUnsupportedMethod;
export const DELETE = handleMobileUnsupportedMethod;
