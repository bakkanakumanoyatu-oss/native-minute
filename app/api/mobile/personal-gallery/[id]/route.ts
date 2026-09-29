import { NextRequest } from "next/server";
import { handleMobilePersonalGallery, handleMobilePersonalGalleryUnsupported, mobilePersonalGalleryOptions } from "@/lib/mobile/personal-gallery-route";
export const dynamic = "force-dynamic";
export function GET(request: NextRequest, { params }: { params: { id: string } }) { return handleMobilePersonalGallery(request, "get", params.id); }
export function PATCH(request: NextRequest, { params }: { params: { id: string } }) { return handleMobilePersonalGallery(request, "update", params.id); }
export function DELETE(request: NextRequest, { params }: { params: { id: string } }) { return handleMobilePersonalGallery(request, "delete", params.id); }
export function OPTIONS(request: NextRequest) { return mobilePersonalGalleryOptions(request, ["GET", "PATCH", "DELETE"]); }
export const HEAD = handleMobilePersonalGalleryUnsupported;
export const PUT = handleMobilePersonalGalleryUnsupported;
export const POST = handleMobilePersonalGalleryUnsupported;
