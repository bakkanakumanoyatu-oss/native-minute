import { z } from "zod";

export const brushUpConsentSchema = z.object({
  scriptId: z.string().uuid(), takeId: z.string().uuid(), revisionId: z.string().uuid()
}).strict();

export const brushUpGenerateSchema = brushUpConsentSchema.extend({
  consentId: z.string().uuid(), operationId: z.string().uuid()
}).strict();

export const brushUpDecisionSchema = z.object({
  decision: z.enum(["adopt", "reject", "rollback", "retry_cleanup"])
}).strict();
