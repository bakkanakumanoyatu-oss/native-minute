import { NextRequest } from "next/server";
import {
  handleMobileEvaluateOptions,
  handleMobileEvaluatePost,
  handleMobileEvaluateUnsupportedMethod
} from "@/lib/mobile/evaluate-route";

export function POST(request: NextRequest) {
  return handleMobileEvaluatePost(request);
}

export function OPTIONS(request: NextRequest) {
  return handleMobileEvaluateOptions(request);
}

export const HEAD = handleMobileEvaluateUnsupportedMethod;
export const GET = handleMobileEvaluateUnsupportedMethod;
export const PUT = handleMobileEvaluateUnsupportedMethod;
export const PATCH = handleMobileEvaluateUnsupportedMethod;
export const DELETE = handleMobileEvaluateUnsupportedMethod;
