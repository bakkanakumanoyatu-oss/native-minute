import { z } from "zod";

export const signInSchema = z.object({
  email: z.string().email("メールアドレスを入力してください。")
});

export type SignInInput = z.infer<typeof signInSchema>;
