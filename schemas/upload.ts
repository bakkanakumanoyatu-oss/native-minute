import { z } from "zod";

export const uploadRecordingSchema = z.object({
  scriptId: z.string().uuid("台本 ID を確認してください。"),
  durationSeconds: z.coerce.number().positive().max(600).optional()
});

export const uploadVoiceSampleSchema = z.object({
  consentId: z.string().uuid("consent ID を確認してください。")
});

export type UploadRecordingInput = z.infer<typeof uploadRecordingSchema>;
export type UploadVoiceSampleInput = z.infer<typeof uploadVoiceSampleSchema>;
