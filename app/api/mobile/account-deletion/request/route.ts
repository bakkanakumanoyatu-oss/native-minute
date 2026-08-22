import { NextRequest } from "next/server";
import {
  handleMobileAccountDeletionRequestOptions,
  handleMobileAccountDeletionRequestPost,
  handleMobileAccountDeletionUnsupportedMethod
} from "@/lib/mobile/account-deletion-route";

export function POST(request: NextRequest) {
  return handleMobileAccountDeletionRequestPost(request);
}

export function OPTIONS(request: NextRequest) {
  return handleMobileAccountDeletionRequestOptions(request);
}

export const HEAD = handleMobileAccountDeletionUnsupportedMethod;
export const GET = handleMobileAccountDeletionUnsupportedMethod;
export const PUT = handleMobileAccountDeletionUnsupportedMethod;
export const PATCH = handleMobileAccountDeletionUnsupportedMethod;
export const DELETE = handleMobileAccountDeletionUnsupportedMethod;
