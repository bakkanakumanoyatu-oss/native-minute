import { z } from "zod";

export const createAccountDeletionRequestSchema = z.object({}).strict("未対応の入力項目が含まれています。");

export const confirmAccountDeletionRequestSchema = z
  .object({
    confirmationText: z.string().trim()
  })
  .strict("未対応の入力項目が含まれています。")
  .refine((input) => input.confirmationText === "DELETE", {
    message: "確認のため DELETE と入力してください。"
  });

export type CreateAccountDeletionRequestInput = z.infer<typeof createAccountDeletionRequestSchema>;
export type ConfirmAccountDeletionRequestInput = z.infer<typeof confirmAccountDeletionRequestSchema>;
