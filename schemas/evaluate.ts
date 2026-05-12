import { z } from "zod";

export const evaluateRequestSchema = z
  .object({
    scriptId: z.string().uuid("台本 ID を確認してください。"),
    takeId: z.string().uuid("take ID を確認してください。").optional(),
    audioPath: z.string().trim().min(1, "audioPath を確認してください。").max(500).optional(),
    audioStorageKey: z.string().trim().min(1, "audioStorageKey を確認してください。").max(500).optional(),
    transcriptText: z.string().trim().min(1, "開発用 transcript を確認してください。").max(20000).optional(),
    durationSeconds: z.coerce.number().int().positive().max(600).optional(),
    locale: z.string().trim().min(2).default("en-US")
  })
  .refine(
    (input) => Boolean(input.audioPath || input.audioStorageKey),
    {
      message: "audioPath または audioStorageKey のどちらかが必要です。",
      path: ["audioPath"]
    }
  );

export const coachRequestSchema = z.object({
  takeId: z.string().uuid("take ID を確認してください。")
});

export type EvaluateRequestInput = z.infer<typeof evaluateRequestSchema>;
export type CoachRequestInput = z.infer<typeof coachRequestSchema>;
