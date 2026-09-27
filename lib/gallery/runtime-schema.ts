import { createHash } from "node:crypto";
import { z } from "zod";
import { getScriptLength } from "../script-length";
import { editorialGallerySchema, type PublicGallery } from "./schema";

export const GALLERY_RUNTIME_SCHEMA_VERSION = "gallery-runtime/v1" as const;
export const GALLERY_RUNTIME_BUCKET = "gallery-runtime-private" as const;
export const galleryReleaseVersionSchema = z.string().regex(/^[a-z0-9]+(?:[a-z0-9-]{0,78}[a-z0-9])?$/u);

const runtimeItemSchema = z.object({
  id: z.string().max(128).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  practiceTextEn: z.string().trim().min(1),
  translationJa: z.string().trim().min(1).nullable(),
  targetSeconds: z.number().int().min(15).max(120),
  locale: z.string().regex(/^en-[A-Za-z]{2}$/u),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/u)
}).strict();

export function hashGalleryRuntimeContent(value: Pick<z.infer<typeof runtimeItemSchema>, "id" | "practiceTextEn" | "translationJa" | "targetSeconds" | "locale">) {
  return createHash("sha256").update(JSON.stringify({
    id: value.id,
    practiceTextEn: value.practiceTextEn,
    translationJa: value.translationJa,
    targetSeconds: value.targetSeconds,
    locale: value.locale
  })).digest("hex");
}

export const galleryRuntimeSchema = z.object({
  schemaVersion: z.literal(GALLERY_RUNTIME_SCHEMA_VERSION),
  releaseVersion: galleryReleaseVersionSchema,
  sourceCollectionVersion: z.string().trim().min(1),
  items: z.array(runtimeItemSchema)
}).strict().superRefine((release, context) => {
  const ids = new Set<string>();
  for (const [index, item] of release.items.entries()) {
    if (ids.has(item.id)) context.addIssue({ code: "custom", path: ["items", index, "id"], message: "duplicate runtime id" });
    ids.add(item.id);
    if (hashGalleryRuntimeContent(item) !== item.contentHash || getScriptLength(item.practiceTextEn).exceedsLimit) {
      context.addIssue({ code: "custom", path: ["items", index], message: "invalid runtime content" });
    }
  }
});

export type GalleryRuntime = z.infer<typeof galleryRuntimeSchema>;
export type GalleryRuntimeItem = GalleryRuntime["items"][number];

export function buildGalleryRuntimeArtifact(input: unknown, releaseVersion: string): GalleryRuntime {
  const editorial = editorialGallerySchema.parse(input);
  const items = editorial.items.filter(item => item.publicationMode === "PRACTICE").map(item => {
    const fields = {
      id: item.id,
      practiceTextEn: item.practice.practiceTextEn!,
      translationJa: item.practice.translationJa,
      targetSeconds: item.practice.targetSeconds!,
      locale: item.practice.locale
    };
    return { ...fields, contentHash: hashGalleryRuntimeContent(fields) };
  });
  return galleryRuntimeSchema.parse({
    schemaVersion: GALLERY_RUNTIME_SCHEMA_VERSION,
    releaseVersion,
    sourceCollectionVersion: editorial.collectionVersion,
    items
  });
}

export function assertRuntimeMatchesPublic(runtime: GalleryRuntime, catalog: PublicGallery) {
  if (runtime.sourceCollectionVersion !== catalog.collectionVersion) throw new Error("Gallery collection mismatch");
  const practice = catalog.items.filter(item => item.publicationMode === "PRACTICE");
  if (runtime.items.length !== practice.length) throw new Error("Gallery runtime item count mismatch");
  for (const item of runtime.items) {
    const publicItem = practice.find(entry => entry.id === item.id);
    const length = getScriptLength(item.practiceTextEn);
    if (!publicItem || publicItem.targetSeconds !== item.targetSeconds || publicItem.locale !== item.locale ||
      publicItem.wordCount !== length.wordCount || publicItem.characterCount !== length.characterCount) {
      throw new Error("Gallery runtime metadata mismatch");
    }
  }
}

export function parseGalleryRuntimeBytes(bytes: Uint8Array, expectedSha256: string, releaseVersion: string, catalog: PublicGallery) {
  if (createHash("sha256").update(bytes).digest("hex") !== expectedSha256) throw new Error("Gallery runtime hash mismatch");
  const parsed = galleryRuntimeSchema.parse(JSON.parse(Buffer.from(bytes).toString("utf8")));
  if (parsed.releaseVersion !== releaseVersion) throw new Error("Gallery release mismatch");
  assertRuntimeMatchesPublic(parsed, catalog);
  return parsed;
}

export function selectGalleryRuntimeItem(runtime: GalleryRuntime, catalog: PublicGallery, id: string) {
  const publicItem = catalog.items.find(item => item.id === id);
  if (!publicItem || publicItem.publicationMode !== "PRACTICE") return null;
  return runtime.items.find(item => item.id === id) ?? null;
}
