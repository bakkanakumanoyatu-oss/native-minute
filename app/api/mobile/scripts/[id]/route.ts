import { NextRequest } from "next/server";
import {
  handleMobileScriptMutation,
  handleMobileScriptDetailGet,
  handleMobileScriptDetailOptions,
  handleMobileScriptDetailUnsupportedMethod
} from "@/lib/mobile/script-detail-route";

type RouteParams = {
  params: { id: string } | Promise<{ id: string }>;
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  return handleMobileScriptDetailGet(request, id);
}

export function OPTIONS(request: NextRequest) {
  return handleMobileScriptDetailOptions(request);
}

export const HEAD = handleMobileScriptDetailUnsupportedMethod;
export const POST = handleMobileScriptDetailUnsupportedMethod;
export const PUT = handleMobileScriptDetailUnsupportedMethod;
export async function PATCH(request: NextRequest, { params }: RouteParams) { return handleMobileScriptMutation(request, (await params).id); }
export async function DELETE(request: NextRequest, { params }: RouteParams) { return handleMobileScriptMutation(request, (await params).id); }
