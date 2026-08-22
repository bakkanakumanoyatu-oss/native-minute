import { z } from "zod";
import { PROCESSING_CONSENT_TYPES } from "@/services/consent";

export const processingConsentTypeSchema = z.enum(PROCESSING_CONSENT_TYPES);
export const acceptProcessingConsentSchema = z.object({
  accepted: z.literal(true)
}).strict();
