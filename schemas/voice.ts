import { z } from "zod";
import { VOICE_STYLE_PRESETS } from "@/lib/voice-style";

export const voiceConsentRequestSchema = z.object({
  accepted: z.boolean().refine((value) => value, {
    message: "音声クローン利用への同意が必要です。"
  }),
  name: z.string().trim().min(1, "同意者名を確認してください。").max(120).optional(),
  language: z.string().trim().min(2, "同意音声の言語を確認してください。").max(35).optional(),
  recording: z
    .object({
      audioPath: z.string().trim().min(1, "recording.audioPath を確認してください。").max(500),
      contentType: z.string().trim().min(1, "recording.contentType を確認してください。").max(120).optional(),
      byteLength: z.coerce.number().int().positive().max(50 * 1024 * 1024).optional()
    })
    .optional()
});

export const voiceSampleReferenceSchema = z.object({
  audioPath: z.string().trim().min(1, "sampleAudio.audioPath を確認してください。").max(500),
  contentType: z.string().trim().min(1, "sampleAudio.contentType を確認してください。").max(120).optional(),
  byteLength: z.coerce.number().int().positive().max(50 * 1024 * 1024).optional()
});

export const createVoiceRequestSchema = z.object({
  consentId: z.string().uuid("consent ID を確認してください。"),
  label: z.string().trim().min(1, "voice 名を入力してください。").max(80),
  sampleAudio: voiceSampleReferenceSchema.optional(),
  sampleAudioPath: z.string().trim().min(1, "sampleAudioPath を確認してください。").max(500).optional()
});

export const speakScriptRequestSchema = z.object({
  scriptId: z.string().uuid("script ID を確認してください。"),
  voiceId: z.string().uuid("voice ID を確認してください。").optional(),
  // Current public listen API remains on the original four presets.
  // Expanded S7 preset ids are local definitions until the UI/API explicitly opts in.
  voiceStylePreset: z.enum(VOICE_STYLE_PRESETS).optional()
});

export type VoiceConsentRequestInput = z.infer<typeof voiceConsentRequestSchema>;
export type CreateVoiceRequestInput = z.infer<typeof createVoiceRequestSchema>;
export type SpeakScriptRequestInput = z.infer<typeof speakScriptRequestSchema>;
