import { z } from "zod";

export const testLoginRequestSchema = z.object({
  secret: z.string().min(1, "E2E secret が必要です。")
});

export type TestLoginRequestInput = z.infer<typeof testLoginRequestSchema>;

export const testVoiceStateRequestSchema = z.object({
  secret: z.string().min(1, "E2E secret が必要です。"),
  action: z.enum([
    "reset_current_provider_voice_setup",
    "set_current_provider_unavailable",
    "clear_current_provider_status_override"
  ])
});

export type TestVoiceStateRequestInput = z.infer<typeof testVoiceStateRequestSchema>;
