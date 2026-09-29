import { AppError } from "@/lib/errors";

export function personalGalleryEnabled() {
  return process.env.NATIVE_MINUTE_ENABLE_PERSONAL_GALLERY === "1";
}

export function assertPersonalGalleryEnabled() {
  if (!personalGalleryEnabled()) throw new AppError(503, "自分のコレクションは準備中です。");
}
