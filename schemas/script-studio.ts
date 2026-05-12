import { z } from "zod";

export const scriptStudioGenerationRequestSchema = z
  .object({
    userSeedText: z.string().trim().max(2000, "言いたいこと seed は2000文字以内にしてください。").optional(),
    topicCategory: z.enum(["work", "study", "travel", "daily_life", "self_introduction", "opinion", "story", "other"]).optional(),
    situation: z.enum(["meeting", "self_introduction", "travel", "small_talk", "presentation", "lesson", "interview", "daily_reflection"]).optional(),
    audience: z.enum(["friend", "colleague", "teacher", "customer", "interviewer", "group", "general_listener"]).optional(),
    tone: z.enum(["friendly", "calm", "confident", "polite", "casual", "enthusiastic", "reflective"]).optional(),
    targetLengthSeconds: z.coerce
      .number()
      .int("目標秒数は整数で指定してください。")
      .min(30, "目標秒数は30秒以上にしてください。")
      .max(90, "目標秒数は90秒以内にしてください。")
      .optional(),
    difficulty: z.enum(["easy", "standard", "challenging"]).optional(),
    priority: z.enum(["accuracy", "speakability", "self_likeness", "native_likeness"]).optional(),
    mustInclude: z.array(z.string().trim().min(1).max(80)).max(6, "mustInclude は6件以内にしてください。").optional(),
    avoid: z.array(z.string().trim().min(1).max(80)).max(6, "avoid は6件以内にしてください。").optional(),
    languagePreference: z.enum(["mostly_english", "simple_english", "japanese_summary_supported"]).optional(),
    requestedVariants: z.coerce
      .number()
      .int("候補数は整数で指定してください。")
      .min(1, "候補数は1件以上にしてください。")
      .max(3, "候補数は3件以内にしてください。")
      .optional(),
    boundedAdjustment: z.enum(["more_natural", "more_speakable", "more_self_like", "shorter", "simpler"]).optional()
  })
  .strict("未対応の入力項目が含まれています。");

export type ScriptStudioGenerationRequestInput = z.infer<typeof scriptStudioGenerationRequestSchema>;
