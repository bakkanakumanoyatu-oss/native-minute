import { z } from "zod";
import { getScriptLengthError } from "@/lib/script-length";

export const scriptIdSchema = z.string().uuid("正しい script ID を指定してください。");

const scriptContentSchema = z.string().trim().min(1, "台本を入力してください。");
const newScriptContentSchema = scriptContentSchema.superRefine((content, context) => {
  const message = getScriptLengthError(content);
  if (message) context.addIssue({ code: z.ZodIssueCode.custom, message });
});

export const createScriptSchema = z.object({
  title: z.string().trim().min(1, "タイトルを入力してください。").max(120, "タイトルは120文字以内にしてください。"),
  content: newScriptContentSchema,
  targetSeconds: z.coerce.number().int().min(15, "1分練習のため、15秒以上を推奨します。").max(120, "120秒以内で指定してください。").default(60),
  locale: z.string().trim().min(2).default("en-US")
});

const updateScriptFields = z.object({
  id: scriptIdSchema,
  expectedRevisionId: z.string().uuid(),
  expectedLockVersion: z.number().int().positive().safe(),
  title: z.string().trim().min(1, "タイトルを入力してください。").max(120, "タイトルは120文字以内にしてください。").optional(),
  // A persisted long body can be sent unchanged with a title-only edit.
  // The service checks the limit only when the owned body's content changes.
  content: scriptContentSchema.optional(),
  targetSeconds: z.coerce.number().int().min(15, "1分練習のため、15秒以上を推奨します。").max(120, "120秒以内で指定してください。").optional(),
  locale: z.string().trim().min(2).optional()
});

export const updateScriptSchema = updateScriptFields.refine(
  (input) => Object.entries(input).some(([key, value]) => !["id", "expectedRevisionId", "expectedLockVersion"].includes(key) && value !== undefined),
  {
    message: "少なくとも1項目を更新してください。"
  }
);

export type CreateScriptInput = z.infer<typeof createScriptSchema>;
export type UpdateScriptInput = z.infer<typeof updateScriptSchema>;

export const scriptArchiveSchema = z.object({ expectedLockVersion: z.number().int().positive().safe(), archived: z.boolean() }).strict();
export const practiceIdentitySchema = z.object({ expectedRevisionId: z.string().uuid(), expectedPracticeEpoch: z.coerce.number().int().positive().safe() });
