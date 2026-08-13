import { NextRequest } from "next/server";
import {
  handleMobileReviewGet,
  handleMobileReviewOptions,
  handleMobileReviewUnsupportedMethod
} from "@/lib/mobile/review-route";

type RouteParams = {
  params:
    | { id: string; takeId: string }
    | Promise<{ id: string; takeId: string }>;
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id, takeId } = await params;
  return handleMobileReviewGet(request, id, takeId);
}

export function OPTIONS(request: NextRequest) {
  return handleMobileReviewOptions(request);
}

export const HEAD = handleMobileReviewUnsupportedMethod;
export const POST = handleMobileReviewUnsupportedMethod;
export const PUT = handleMobileReviewUnsupportedMethod;
export const PATCH = handleMobileReviewUnsupportedMethod;
export const DELETE = handleMobileReviewUnsupportedMethod;
