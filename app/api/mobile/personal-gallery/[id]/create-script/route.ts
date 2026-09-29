import { NextRequest } from "next/server";
import { handleMobilePersonalGallery, handleMobilePersonalGalleryUnsupported, mobilePersonalGalleryOptions } from "@/lib/mobile/personal-gallery-route";
export const dynamic = "force-dynamic";
export function POST(request: NextRequest, { params }: { params: { id: string } }) { return handleMobilePersonalGallery(request, "create-script", params.id); }
export function OPTIONS(request: NextRequest) { return mobilePersonalGalleryOptions(request, ["POST"]); }
export const HEAD = handleMobilePersonalGalleryUnsupported;
export const GET = handleMobilePersonalGalleryUnsupported;
export const PUT = handleMobilePersonalGalleryUnsupported;
export const PATCH = handleMobilePersonalGalleryUnsupported;
export const DELETE = handleMobilePersonalGalleryUnsupported;
