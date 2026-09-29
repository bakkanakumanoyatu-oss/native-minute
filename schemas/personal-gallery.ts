import { z } from "zod";

const optionalText = (limit: number) => z.string().trim().max(limit).nullable().optional();
const labels = z.array(z.string().trim().min(1).max(240)).max(20);
const sourceUrl = z.string().trim().max(2048).refine(value => !value || /^https?:\/\//iu.test(value), "http または https の URL を入力してください。").nullable().optional();

export const personalGalleryFields = z.object({
  sceneTitle: z.string().trim().min(1, "場面の名前を入力してください。").max(240),
  sourceType: optionalText(80),
  workTitle: optionalText(240),
  speaker: optionalText(160),
  context: optionalText(4000),
  personalNote: optionalText(4000),
  excerptText: z.string().max(20000).nullable().optional(),
  sourceUrl,
  sourceLocator: optionalText(2048),
  speakingNotes: labels.optional(),
  themes: labels.optional(),
  locale: z.string().trim().min(2).max(20).default("en-US")
}).strict();

export const createPersonalGallerySchema = personalGalleryFields;
export const updatePersonalGallerySchema = personalGalleryFields.partial().extend({
  expectedLockVersion: z.number().int().positive().safe()
}).strict().refine(value => Object.keys(value).some(key => key !== "expectedLockVersion"), "更新する項目を入力してください。");
export const deletePersonalGallerySchema = z.object({ expectedLockVersion: z.number().int().positive().safe() }).strict();
export const createScriptFromPersonalGallerySchema = z.object({
  expectedLockVersion: z.number().int().positive().safe(),
  scriptTitle: z.string().trim().min(1, "台本名を入力してください。").max(120, "台本名は120文字以内にしてください。"),
  selectedText: z.string().min(1).max(20000).nullable().optional()
}).strict();
export const personalGalleryListSchema = z.object({
  query: z.string().max(120).default(""),
  sourceType: z.string().max(80).default(""),
  theme: z.string().max(240).default(""),
  sort: z.enum(["recent", "work"]).default("recent"),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(30)
});

export type CreatePersonalGalleryInput = z.infer<typeof createPersonalGallerySchema>;
export type UpdatePersonalGalleryInput = z.infer<typeof updatePersonalGallerySchema>;
export type PersonalGalleryListInput = z.infer<typeof personalGalleryListSchema>;
