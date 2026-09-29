import { NextRequest } from "next/server";
import { handleMobilePersonalGallery, handleMobilePersonalGalleryUnsupported, mobilePersonalGalleryOptions } from "@/lib/mobile/personal-gallery-route";
export const dynamic = "force-dynamic";
export function GET(request: NextRequest) { return handleMobilePersonalGallery(request, "list"); }
export function POST(request: NextRequest) { return handleMobilePersonalGallery(request, "create"); }
export function OPTIONS(request: NextRequest) { return mobilePersonalGalleryOptions(request, ["GET", "POST"]); }
export const HEAD = handleMobilePersonalGalleryUnsupported;
export const PUT = handleMobilePersonalGalleryUnsupported;
export const PATCH = handleMobilePersonalGalleryUnsupported;
export const DELETE = handleMobilePersonalGalleryUnsupported;
