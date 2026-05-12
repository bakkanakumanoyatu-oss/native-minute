import { z } from "zod";

export const scriptIdSchema = z.string().uuid("正しい script ID を指定してください。");

export const createScriptSchema = z.object({
  title: z.string().trim().min(1, "タイトルを入力してください。").max(120, "タイトルは120文字以内にしてください。"),
  content: z.string().trim().min(1, "台本を入力してください。").max(4000, "台本が長すぎます。"),
  targetSeconds: z.coerce.number().int().min(15, "1分練習のため、15秒以上を推奨します。").max(120, "120秒以内で指定してください。").default(60),
  locale: z.string().trim().min(2).default("en-US")
});

const updateScriptFields = z.object({
  id: scriptIdSchema,
  title: z.string().trim().min(1, "タイトルを入力してください。").max(120, "タイトルは120文字以内にしてください。").optional(),
  content: z.string().trim().min(1, "台本を入力してください。").max(4000, "台本が長すぎます。").optional(),
  targetSeconds: z.coerce.number().int().min(15, "1分練習のため、15秒以上を推奨します。").max(120, "120秒以内で指定してください。").optional(),
  locale: z.string().trim().min(2).optional()
});

export const updateScriptSchema = updateScriptFields.refine(
  (input) => Object.entries(input).some(([key, value]) => key !== "id" && value !== undefined),
  {
    message: "少なくとも1項目を更新してください。"
  }
);

export type CreateScriptInput = z.infer<typeof createScriptSchema>;
export type UpdateScriptInput = z.infer<typeof updateScriptSchema>;
