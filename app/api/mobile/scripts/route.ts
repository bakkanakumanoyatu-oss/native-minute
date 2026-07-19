import { NextRequest } from "next/server";
import {
  handleMobileScriptsGet,
  handleMobileScriptsOptions,
  handleMobileScriptsUnsupportedMethod
} from "@/lib/mobile/scripts-route";

export function GET(request: NextRequest) {
  return handleMobileScriptsGet(request);
}

export function OPTIONS(request: NextRequest) {
  return handleMobileScriptsOptions(request);
}

export const HEAD = handleMobileScriptsUnsupportedMethod;
export const POST = handleMobileScriptsUnsupportedMethod;
export const PUT = handleMobileScriptsUnsupportedMethod;
export const PATCH = handleMobileScriptsUnsupportedMethod;
export const DELETE = handleMobileScriptsUnsupportedMethod;
