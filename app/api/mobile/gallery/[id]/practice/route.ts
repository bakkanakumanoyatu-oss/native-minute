import { NextRequest } from "next/server";
import { handleMobileGalleryGet, handleMobileGalleryOptions, handleMobileGalleryPost, handleMobileGalleryUnsupportedMethod } from "@/lib/mobile/gallery-route";

export const dynamic = "force-dynamic";
export function GET(request: NextRequest, { params }: { params: { id: string } }) { return handleMobileGalleryGet(request, params.id); }
export function POST(request: NextRequest, { params }: { params: { id: string } }) { return handleMobileGalleryPost(request, params.id); }
export function OPTIONS(request: NextRequest) { return handleMobileGalleryOptions(request); }
export const HEAD = handleMobileGalleryUnsupportedMethod;
export const PUT = handleMobileGalleryUnsupportedMethod;
export const PATCH = handleMobileGalleryUnsupportedMethod;
export const DELETE = handleMobileGalleryUnsupportedMethod;
