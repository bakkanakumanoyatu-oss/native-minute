import { z } from "zod";

export const savedModelAudioIdSchema = z.string().uuid("保存済み見本音声 ID を確認してください。");
export const savedBestTakeIdSchema = z.string().uuid("保存済みベスト録音 ID を確認してください。");

export const saveModelAudioRequestSchema = z
  .object({
    scriptAudioId: z.string().uuid("見本音声 ID を確認してください。"),
    slot: z.coerce.number().int("slot は整数で指定してください。").min(1, "slot は 1〜5 で指定してください。").max(5, "slot は 1〜5 で指定してください。").optional(),
    label: z.string().trim().min(1, "ラベルを入力してください。").max(80, "ラベルは80文字以内にしてください。").optional()
  })
  .strict("未対応の入力項目が含まれています。");

export const patchSavedModelAudioRequestSchema = z
  .object({
    scriptAudioId: z.string().uuid("見本音声 ID を確認してください。").optional(),
    slot: z.coerce.number().int("slot は整数で指定してください。").min(1, "slot は 1〜5 で指定してください。").max(5, "slot は 1〜5 で指定してください。").optional(),
    label: z.string().trim().min(1, "ラベルを入力してください。").max(80, "ラベルは80文字以内にしてください。").optional()
  })
  .strict("未対応の入力項目が含まれています。")
  .refine((input) => input.label !== undefined || input.scriptAudioId !== undefined || input.slot !== undefined, {
    message: "更新内容を指定してください。"
  })
  .refine((input) => (input.scriptAudioId === undefined && input.slot === undefined) || (input.scriptAudioId !== undefined && input.slot !== undefined), {
    message: "見本音声を入れ替える場合は scriptAudioId と slot を両方指定してください。"
  });

export const saveBestTakeRequestSchema = z
  .object({
    takeId: z.string().uuid("録音結果 ID を確認してください。"),
    slot: z.coerce.number().int("slot は整数で指定してください。").min(1, "slot は 1〜5 で指定してください。").max(5, "slot は 1〜5 で指定してください。").optional(),
    label: z.string().trim().min(1, "ラベルを入力してください。").max(80, "ラベルは80文字以内にしてください。").optional()
  })
  .strict("未対応の入力項目が含まれています。");

export const patchSavedBestTakeRequestSchema = z
  .object({
    takeId: z.string().uuid("録音結果 ID を確認してください。").optional(),
    slot: z.coerce.number().int("slot は整数で指定してください。").min(1, "slot は 1〜5 で指定してください。").max(5, "slot は 1〜5 で指定してください。").optional(),
    label: z.string().trim().min(1, "ラベルを入力してください。").max(80, "ラベルは80文字以内にしてください。").optional()
  })
  .strict("未対応の入力項目が含まれています。")
  .refine((input) => input.label !== undefined || input.takeId !== undefined || input.slot !== undefined, {
    message: "更新内容を指定してください。"
  })
  .refine((input) => (input.takeId === undefined && input.slot === undefined) || (input.takeId !== undefined && input.slot !== undefined), {
    message: "ベスト録音を入れ替える場合は takeId と slot を両方指定してください。"
  });

export type SaveModelAudioRequestInput = z.infer<typeof saveModelAudioRequestSchema>;
export type PatchSavedModelAudioRequestInput = z.infer<typeof patchSavedModelAudioRequestSchema>;
export type SaveBestTakeRequestInput = z.infer<typeof saveBestTakeRequestSchema>;
export type PatchSavedBestTakeRequestInput = z.infer<typeof patchSavedBestTakeRequestSchema>;
