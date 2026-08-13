import { NextRequest } from "next/server";
import {
  handleMobileListenOptions,
  handleMobileListenPost,
  handleMobileListenUnsupportedMethod
} from "@/lib/mobile/listen-route";

type RouteParams = {
  params: { id: string } | Promise<{ id: string }>;
};

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  return handleMobileListenPost(request, id);
}

export function OPTIONS(request: NextRequest) {
  return handleMobileListenOptions(request);
}

export const HEAD = handleMobileListenUnsupportedMethod;
export const GET = handleMobileListenUnsupportedMethod;
export const PUT = handleMobileListenUnsupportedMethod;
export const PATCH = handleMobileListenUnsupportedMethod;
export const DELETE = handleMobileListenUnsupportedMethod;
