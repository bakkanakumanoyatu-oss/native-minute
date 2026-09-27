import "server-only";

import { AppError } from "@/lib/errors";
import { getGalleryItem, gallery } from "@/lib/gallery/public";
import { GALLERY_RUNTIME_BUCKET, galleryReleaseVersionSchema, parseGalleryRuntimeBytes, selectGalleryRuntimeItem, type GalleryRuntime } from "@/lib/gallery/runtime-schema";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AppSupabaseClient } from "@/lib/supabase/client";
import { createScript } from "@/services/scripts/scripts.service";

type RuntimeConfig = { releaseVersion: string; objectKey: string; expectedSha256: string };
let cached: { cacheKey: string; runtime: GalleryRuntime } | null = null;

function runtimeConfig(): RuntimeConfig {
  const releaseVersion = process.env.GALLERY_RUNTIME_RELEASE_VERSION;
  const objectKey = process.env.GALLERY_RUNTIME_OBJECT_KEY;
  const expectedSha256 = process.env.GALLERY_RUNTIME_SHA256;
  if (!releaseVersion || !objectKey || !expectedSha256 || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new AppError(503, "Gallery の練習文は準備中です。");
  }
  if (!galleryReleaseVersionSchema.safeParse(releaseVersion).success ||
    objectKey !== `releases/${releaseVersion}/gallery-runtime.json` ||
    !/^[a-f0-9]{64}$/u.test(expectedSha256)) {
    throw new AppError(503, "Gallery の公開設定を確認できません。");
  }
  return { releaseVersion, objectKey, expectedSha256 };
}

export async function getGalleryPracticePayload(id: string) {
  const publicItem = getGalleryItem(id);
  if (!publicItem || publicItem.publicationMode !== "PRACTICE") {
    throw new AppError(404, "この場面は公開されていません。");
  }
  const config = runtimeConfig();
  const cacheKey = `${config.releaseVersion}:${config.objectKey}:${config.expectedSha256}`;
  if (cached?.cacheKey !== cacheKey) {
    const { data, error } = await createSupabaseAdminClient().storage.from(GALLERY_RUNTIME_BUCKET).download(config.objectKey);
    if (error || !data || data.size > 1_000_000) throw new AppError(503, "Gallery の練習文を取得できませんでした。");
    const bytes = Buffer.from(await data.arrayBuffer());
    try {
      const parsed = parseGalleryRuntimeBytes(bytes, config.expectedSha256, config.releaseVersion, gallery);
      cached = { cacheKey, runtime: parsed };
    } catch {
      throw new AppError(503, "Gallery の練習文を確認できませんでした。");
    }
  }
  const item = cached ? selectGalleryRuntimeItem(cached.runtime, gallery, id) : null;
  if (!item) throw new AppError(404, "この場面は公開されていません。");
  return {
    id: item.id,
    practiceTextEn: item.practiceTextEn,
    translationJa: item.translationJa,
    targetSeconds: item.targetSeconds,
    locale: item.locale,
    contentHash: item.contentHash
  };
}

export async function createScriptFromGallery(client: AppSupabaseClient, userId: string, id: string) {
  const publicItem = getGalleryItem(id);
  if (!publicItem || publicItem.publicationMode !== "PRACTICE") throw new AppError(404, "この場面は公開されていません。");
  const item = await getGalleryPracticePayload(id);
  return createScript(client, userId, {
    title: publicItem.title,
    content: item.practiceTextEn,
    targetSeconds: item.targetSeconds,
    locale: item.locale
  });
}
