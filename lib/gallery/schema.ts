import { z } from "zod";
import { getScriptLength } from "../script-length";

export const GALLERY_SCHEMA_VERSION = "gallery-editorial/v1" as const;
export const PUBLIC_GALLERY_SCHEMA_VERSION = "gallery-public/v1" as const;
export const GALLERY_SOURCE_TYPES = ["Movies", "Speeches", "Conversations", "Books, Essays & Letters", "Your Story"] as const;

const nonPlaceholder = z.string().trim().min(1).refine(
  value => !/^(?:todo\b|tbd\b|placeholder\b|coming soon\b|xxx\b|未定|要確認|仮$)/iu.test(value),
  "placeholder is not a production value"
);
const optionalText = nonPlaceholder.nullable();
const optionalHttpsUrl = z.string().url().regex(/^https:\/\//u).nullable();
const review = z.object({
  state: z.enum(["APPROVED", "REJECTED", "UNRESOLVED"]),
  evidenceRefs: z.array(nonPlaceholder),
  note: z.string().nullable().optional()
}).passthrough().superRefine((value, context) => {
  if (value.state === "APPROVED" && value.evidenceRefs.length === 0) {
    context.addIssue({ code: "custom", message: "approved review requires evidence" });
  }
});

const editorialItem = z.object({
  id: z.string().max(128).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  collectionVersion: nonPlaceholder,
  editorialStatus: z.enum(["COMPLETE", "NEEDS_USER_TEXT_INSERTION"]),
  publicationMode: z.enum(["PRACTICE", "DISCOVERY", "HOLD"]),
  identity: z.object({
    title: nonPlaceholder.pipe(z.string().max(120)),
    workTitle: nonPlaceholder,
    sourceType: z.enum(GALLERY_SOURCE_TYPES),
    speaker: nonPlaceholder,
    addressee: optionalText,
    year: z.number().int().min(1000).max(2200).nullable()
  }).passthrough(),
  editorial: z.object({
    moment: nonPlaceholder,
    contextJa: nonPlaceholder,
    whyItMattersJa: nonPlaceholder,
    speakingNotes: z.array(nonPlaceholder),
    themes: z.array(nonPlaceholder).min(1),
    moreLikeThis: z.array(z.string())
  }).passthrough(),
  practice: z.object({
    practiceTextEn: optionalText,
    translationJa: optionalText,
    targetSeconds: z.number().int().min(15).max(120).nullable(),
    expectedReadingSeconds: z.number().positive().nullable(),
    sourceSegmentSeconds: z.number().positive().nullable(),
    locale: z.string().regex(/^en-[A-Za-z]{2}$/u)
  }).passthrough(),
  source: z.object({
    primarySourceUrl: optionalHttpsUrl,
    canonicalSourceLocator: nonPlaceholder,
    sourceKind: z.enum(["official", "released-master", "book", "transcript", "subtitle", "draft-script", "other"]),
    startCue: optionalText,
    endCue: optionalText,
    releasedMasterTimecode: optionalText,
    releasedMasterTimecodeRequired: z.boolean(),
    sourceCheckedAt: z.string().datetime()
  }).passthrough(),
  rights: z.object({
    textDisplayReview: review,
    translationReview: review,
    ttsReview: review,
    userRecordingReview: review,
    sharingReview: review,
    commercialReview: review,
    territoryReview: review,
    rightsNote: z.string().nullable(),
    evidenceRefs: z.array(nonPlaceholder)
  }).passthrough()
}).passthrough();

export const editorialGallerySchema = z.object({
  schemaVersion: z.literal(GALLERY_SCHEMA_VERSION),
  collectionVersion: nonPlaceholder,
  themes: z.array(nonPlaceholder),
  items: z.array(editorialItem)
}).passthrough().superRefine((gallery, context) => {
  const ids = new Set<string>();
  const themes = new Set(gallery.themes);
  if (themes.size !== gallery.themes.length) context.addIssue({ code: "custom", message: "duplicate theme" });
  for (const [index, item] of gallery.items.entries()) {
    const path = ["items", index];
    if (ids.has(item.id)) context.addIssue({ code: "custom", path: [...path, "id"], message: "duplicate id" });
    ids.add(item.id);
    if (item.collectionVersion !== gallery.collectionVersion) context.addIssue({ code: "custom", path: [...path, "collectionVersion"], message: "collection version mismatch" });
    for (const theme of item.editorial.themes) {
      if (!themes.has(theme)) context.addIssue({ code: "custom", path: [...path, "editorial", "themes"], message: `unknown theme: ${theme}` });
    }
    if (item.identity.sourceType === "Movies" && item.source.releasedMasterTimecodeRequired && !item.source.releasedMasterTimecode && item.publicationMode !== "HOLD") {
      context.addIssue({ code: "custom", path: [...path, "source", "releasedMasterTimecode"], message: "licensed master timecode unresolved" });
    }
    if (item.publicationMode === "PRACTICE") {
      if (item.editorialStatus !== "COMPLETE" || !item.practice.practiceTextEn || item.practice.targetSeconds === null) {
        context.addIssue({ code: "custom", path, message: "practice requires complete editorial text and target" });
      }
      const required = ["textDisplayReview", "ttsReview", "userRecordingReview", "sharingReview", "commercialReview", "territoryReview"] as const;
      for (const axis of required) {
        if (item.rights[axis].state !== "APPROVED") context.addIssue({ code: "custom", path: [...path, "rights", axis], message: `${axis} is not approved` });
      }
    }
    if (item.publicationMode !== "HOLD" && (item.rights.commercialReview.state !== "APPROVED" || item.rights.territoryReview.state !== "APPROVED")) {
      context.addIssue({ code: "custom", path, message: "public item lacks commercial or territory clearance" });
    }
    if (item.publicationMode !== "HOLD" && item.practice.practiceTextEn && getScriptLength(item.practice.practiceTextEn).exceedsLimit) {
      context.addIssue({ code: "custom", path: [...path, "practice", "practiceTextEn"], message: "practice text exceeds canonical length limit; hold item" });
    }
    if (item.publicationMode === "PRACTICE" && item.practice.practiceTextEn) {
      if (/^\s*(?:INT\.|EXT\.|[A-Z][A-Z ]{2,}:|\[[^\]]+\]|\([^)]*\))\s*/mu.test(item.practice.practiceTextEn)) {
        context.addIssue({ code: "custom", path: [...path, "practice", "practiceTextEn"], message: "practice text appears to include a cue or speaker label" });
      }
    }
    if (item.practice.translationJa && item.publicationMode === "PRACTICE" && item.rights.translationReview.state !== "APPROVED") {
      context.addIssue({ code: "custom", path: [...path, "rights", "translationReview"], message: "translation is not approved" });
    }
  }
  for (const [index, item] of gallery.items.entries()) {
    for (const related of item.editorial.moreLikeThis) {
      if (!ids.has(related) || related === item.id) context.addIssue({ code: "custom", path: ["items", index, "editorial", "moreLikeThis"], message: `invalid relation: ${related}` });
    }
  }
});

export type EditorialGallery = z.infer<typeof editorialGallerySchema>;

const publicBase = z.object({
  id: z.string().max(128).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  collectionVersion: z.string(),
  title: z.string(),
  workTitle: z.string(),
  sourceType: z.enum(GALLERY_SOURCE_TYPES),
  speaker: z.string(),
  year: z.number().nullable(),
  moment: z.string(),
  contextJa: z.string(),
  whyItMattersJa: z.string(),
  speakingNotes: z.array(z.string()),
  themes: z.array(z.string()),
  moreLikeThis: z.array(z.string()),
  primarySourceUrl: optionalHttpsUrl,
  canonicalSourceLocator: z.string(),
  sourceKind: z.string()
});

export const publicGalleryItemSchema = z.discriminatedUnion("publicationMode", [
  publicBase.extend({ publicationMode: z.literal("DISCOVERY") }).strict(),
  publicBase.extend({
    publicationMode: z.literal("PRACTICE"),
    practiceTextEn: z.string().min(1),
    translationJa: z.string().nullable(),
    targetSeconds: z.number().int().min(15).max(120),
    locale: z.string(),
    wordCount: z.number().int().nonnegative(),
    characterCount: z.number().int().nonnegative()
  }).strict()
]);
export const publicGallerySchema = z.object({
  schemaVersion: z.literal(PUBLIC_GALLERY_SCHEMA_VERSION),
  collectionVersion: z.string(),
  themes: z.array(z.string()),
  items: z.array(publicGalleryItemSchema)
}).strict().superRefine((catalog, context) => {
  const ids = new Set<string>();
  const themes = new Set(catalog.themes);
  if (themes.size !== catalog.themes.length) context.addIssue({ code: "custom", path: ["themes"], message: "duplicate public theme" });
  for (const [index, item] of catalog.items.entries()) {
    if (ids.has(item.id)) context.addIssue({ code: "custom", path: ["items", index, "id"], message: "duplicate public id" });
    ids.add(item.id);
    if (item.collectionVersion !== catalog.collectionVersion) context.addIssue({ code: "custom", path: ["items", index], message: "collection version mismatch" });
    for (const theme of item.themes) if (!themes.has(theme)) context.addIssue({ code: "custom", path: ["items", index, "themes"], message: "unknown public theme" });
    if (item.publicationMode === "PRACTICE" && (getScriptLength(item.practiceTextEn).exceedsLimit || item.title.length > 120 || !/^en-[A-Za-z]{2}$/u.test(item.locale)
      || item.wordCount !== getScriptLength(item.practiceTextEn).wordCount || item.characterCount !== getScriptLength(item.practiceTextEn).characterCount)) {
      context.addIssue({ code: "custom", path: ["items", index], message: "invalid public practice payload" });
    }
  }
  for (const [index, item] of catalog.items.entries()) for (const related of item.moreLikeThis) {
    if (!ids.has(related) || related === item.id) context.addIssue({ code: "custom", path: ["items", index, "moreLikeThis"], message: "broken public relation" });
  }
});
export type PublicGalleryItem = z.infer<typeof publicGalleryItemSchema>;
export type PublicGallery = z.infer<typeof publicGallerySchema>;
