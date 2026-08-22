import { NextRequest } from "next/server";
import {
  handleMobileConsentDelete,
  handleMobileConsentGet,
  handleMobileConsentOptions,
  handleMobileConsentPost,
  handleMobileConsentUnsupportedMethod
} from "@/lib/mobile/consents-route";

type RouteContext = { params: { consentType: string } };

export function GET(request: NextRequest, context: RouteContext) {
  return handleMobileConsentGet(request, context.params.consentType);
}

export function POST(request: NextRequest, context: RouteContext) {
  return handleMobileConsentPost(request, context.params.consentType);
}

export function DELETE(request: NextRequest, context: RouteContext) {
  return handleMobileConsentDelete(request, context.params.consentType);
}

export function OPTIONS(request: NextRequest) {
  return handleMobileConsentOptions(request);
}

export const HEAD = handleMobileConsentUnsupportedMethod;
export const PUT = handleMobileConsentUnsupportedMethod;
export const PATCH = handleMobileConsentUnsupportedMethod;
