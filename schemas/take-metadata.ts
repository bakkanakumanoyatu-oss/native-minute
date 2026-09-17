import { z } from "zod";

export const TAKE_DISPLAY_NAME_MAX_LENGTH = 60;
export const takeMetadataSchema = z.object({
  favorite: z.boolean().optional(),
  displayName: z.string().max(240).trim().max(TAKE_DISPLAY_NAME_MAX_LENGTH)
    .refine(value => !/[\u0000-\u001f\u007f]/.test(value), "名前に制御文字は使用できません。")
    .transform(value => value || null).nullable().optional()
}).strict().refine(value => value.favorite !== undefined || value.displayName !== undefined);

export type TakeMetadataInput = z.input<typeof takeMetadataSchema>;
