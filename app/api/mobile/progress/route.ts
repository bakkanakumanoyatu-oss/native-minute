import { NextRequest } from "next/server";
import {
  handleMobileProgressGet,
  handleMobileProgressOptions,
  handleMobileProgressUnsupportedMethod
} from "@/lib/mobile/progress-route";

export function GET(request: NextRequest) {
  return handleMobileProgressGet(request);
}

export function OPTIONS(request: NextRequest) {
  return handleMobileProgressOptions(request);
}

export const HEAD = handleMobileProgressUnsupportedMethod;
export const POST = handleMobileProgressUnsupportedMethod;
export const PUT = handleMobileProgressUnsupportedMethod;
export const PATCH = handleMobileProgressUnsupportedMethod;
export const DELETE = handleMobileProgressUnsupportedMethod;
