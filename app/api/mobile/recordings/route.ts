import { NextRequest } from "next/server";
import {
  handleMobileRecordingsOptions,
  handleMobileRecordingsPost,
  handleMobileRecordingsUnsupportedMethod
} from "@/lib/mobile/recordings-route";

export function POST(request: NextRequest) {
  return handleMobileRecordingsPost(request);
}

export function OPTIONS(request: NextRequest) {
  return handleMobileRecordingsOptions(request);
}

export const HEAD = handleMobileRecordingsUnsupportedMethod;
export const GET = handleMobileRecordingsUnsupportedMethod;
export const PUT = handleMobileRecordingsUnsupportedMethod;
export const PATCH = handleMobileRecordingsUnsupportedMethod;
export const DELETE = handleMobileRecordingsUnsupportedMethod;
