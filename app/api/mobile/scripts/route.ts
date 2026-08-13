import { NextRequest } from "next/server";
import {
  handleMobileScriptsGet,
  handleMobileScriptsOptions,
  handleMobileScriptsPost,
  handleMobileScriptsUnsupportedMethod
} from "@/lib/mobile/scripts-route";

export function GET(request: NextRequest) {
  return handleMobileScriptsGet(request);
}

export function OPTIONS(request: NextRequest) {
  return handleMobileScriptsOptions(request);
}

export function POST(request: NextRequest) {
  return handleMobileScriptsPost(request);
}

export const HEAD = handleMobileScriptsUnsupportedMethod;
export const PUT = handleMobileScriptsUnsupportedMethod;
export const PATCH = handleMobileScriptsUnsupportedMethod;
export const DELETE = handleMobileScriptsUnsupportedMethod;
