import { z } from "zod";

export const testSeedScriptRequestSchema = z.object({
  secret: z.string().min(1, "E2E secret が必要です。")
});

export type TestSeedScriptRequestInput = z.infer<typeof testSeedScriptRequestSchema>;
