import { NextRequest } from "next/server";
import {
  handleMobileAccountDeletionStatusGet,
  handleMobileAccountDeletionStatusOptions,
  handleMobileAccountDeletionUnsupportedMethod
} from "@/lib/mobile/account-deletion-route";

export function GET(request: NextRequest) {
  return handleMobileAccountDeletionStatusGet(request);
}

export function OPTIONS(request: NextRequest) {
  return handleMobileAccountDeletionStatusOptions(request);
}

export const HEAD = handleMobileAccountDeletionUnsupportedMethod;
export const POST = handleMobileAccountDeletionUnsupportedMethod;
export const PUT = handleMobileAccountDeletionUnsupportedMethod;
export const PATCH = handleMobileAccountDeletionUnsupportedMethod;
export const DELETE = handleMobileAccountDeletionUnsupportedMethod;
