import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServiceRoleKey } from "@/lib/supabase/config";
import type { ScriptGenerationRequest } from "@/lib/script-studio/generation";
import type { ScriptGenerationPipelineIssue, ScriptGenerationPipelineResult } from "@/lib/script-studio/generator";
import type {
  Database,
  Json,
  QuotaEventBillingStatus,
  QuotaEventFailureStage,
  QuotaEventStatus
} from "@/types/database";

export type { QuotaEventBillingStatus, QuotaEventFailureStage, QuotaEventStatus } from "@/types/database";

export type QuotaEventRef = {
  id: string;
};

export type TextGenerationQuotaKeys = {
  idempotencyKey: string;
  dedupeKey: string;
  requestFingerprint: string;
};

export type VoiceGenerationQuotaKeys = {
  idempotencyKey: string;
  dedupeKey: string;
  requestFingerprint: string;
};

type QuotaEventMetadata = { [key: string]: Json | undefined };
type QuotaEventsTable = Database["public"]["Tables"]["quota_events"];

const SCRIPT_GENERATION_EVENT_TYPE = "script_generation_attempt";
const SCRIPT_AUDIO_GENERATION_EVENT_TYPE = "script_audio_generation_attempt";
const TEXT_GENERATION_CATEGORY = "text_generation_quota";
const VOICE_GENERATION_CATEGORY = "voice_generation_quota";
const SCRIPT_STUDIO_SUBJECT_TYPE = "script_studio";
const SAVED_SCRIPT_SUBJECT_TYPE = "saved_script";
const NO_TARGET_RESOURCE_TYPE = "none";
const SCRIPT_AUDIO_TARGET_RESOURCE_TYPE = "script_audio";
const TEXT_GENERATION_DEDUPE_WINDOW_MS = 5 * 60 * 1000;
const VOICE_GENERATION_DEDUPE_WINDOW_MS = 5 * 60 * 1000;

export function buildTextGenerationQuotaKeys(input: {
  request: ScriptGenerationRequest;
  provider: string | null;
  providerModel?: string | null;
  now?: Date;
}): TextGenerationQuotaKeys {
  const now = input.now ?? new Date();
  const requestFingerprint = hashStableValue({
    eventType: SCRIPT_GENERATION_EVENT_TYPE,
    provider: input.provider,
    providerModel: input.providerModel ?? null,
    request: buildFingerprintableScriptGenerationRequest(input.request)
  });
  const retryWindow = Math.floor(now.getTime() / TEXT_GENERATION_DEDUPE_WINDOW_MS);
  const dedupeKey = `${SCRIPT_GENERATION_EVENT_TYPE}:${input.provider ?? "unknown"}:${requestFingerprint}:${retryWindow}`;

  return {
    idempotencyKey: dedupeKey,
    dedupeKey,
    requestFingerprint
  };
}

export function buildVoiceGenerationQuotaKeys(input: {
  userId?: string;
  scriptId: string;
  voiceId: string | null;
  provider: string | null;
  locale: string | null;
  voiceStylePreset?: string | null;
  scriptAudioCacheKey?: string | null;
  now?: Date;
}): VoiceGenerationQuotaKeys {
  const now = input.now ?? new Date();
  const cacheKeyHash = input.scriptAudioCacheKey ? hashStableValue(input.scriptAudioCacheKey) : null;
  const requestFingerprint = hashStableValue({
    eventType: SCRIPT_AUDIO_GENERATION_EVENT_TYPE,
    userId: input.userId ?? null,
    scriptId: input.scriptId,
    voiceId: input.voiceId,
    provider: input.provider,
    locale: input.locale,
    voiceStylePreset: input.voiceStylePreset ?? null,
    scriptAudioCacheKeyHash: cacheKeyHash
  });
  const retryWindow = Math.floor(now.getTime() / VOICE_GENERATION_DEDUPE_WINDOW_MS);
  const dedupeKey = [
    SCRIPT_AUDIO_GENERATION_EVENT_TYPE,
    input.provider ?? "unknown",
    input.scriptId,
    input.voiceId ?? "default",
    input.locale ?? "unknown",
    input.voiceStylePreset ?? "default",
    cacheKeyHash ?? "no-cache-key",
    retryWindow
  ].join(":");

  return {
    idempotencyKey: dedupeKey,
    dedupeKey,
    requestFingerprint
  };
}

export function buildTextGenerationAttemptMetadata(input: {
  request: ScriptGenerationRequest;
  provider: string | null;
  providerModel?: string | null;
}): QuotaEventMetadata {
  const brief = input.request.brief;
  const userSeedText = brief.userSeedText?.trim() ?? "";

  return compactMetadata({
    provider: input.provider,
    provider_model: input.providerModel ?? null,
    requested_variants: input.request.requestedVariants ?? null,
    bounded_adjustment: input.request.boundedAdjustment ?? null,
    target_length_seconds: brief.targetLengthSeconds ?? null,
    difficulty: brief.difficulty ?? null,
    priority: brief.priority ?? null,
    tone: brief.tone ?? null,
    topic_category: brief.topicCategory ?? null,
    situation: brief.situation ?? null,
    audience: brief.audience ?? null,
    language_preference: brief.languagePreference ?? null,
    has_user_seed_text: userSeedText.length > 0,
    user_seed_text_length: userSeedText.length,
    must_include_count: brief.mustInclude?.length ?? 0,
    avoid_count: brief.avoid?.length ?? 0
  });
}

export function buildTextGenerationCompletionMetadata(input: {
  attemptMetadata: QuotaEventMetadata;
  result: ScriptGenerationPipelineResult;
}): QuotaEventMetadata {
  const issues = collectPipelineIssues(input.result);

  return compactMetadata({
    ...input.attemptMetadata,
    raw_candidate_count: input.result.rawCandidateCount,
    accepted_draft_count: input.result.acceptedDrafts.length,
    rejected_candidate_count: input.result.rejectedCandidates.length,
    requested_variants: input.result.variantLimit.requested,
    max_variants: input.result.variantLimit.max,
    prompt_guardrail_ids: input.result.promptPack.guardrails.map((guardrail) => guardrail.id),
    issue_counts: {
      blocking: issues.filter((issue) => issue.severity === "blocking").length,
      warning: issues.filter((issue) => issue.severity === "warning").length,
      info: issues.filter((issue) => issue.severity === "info").length
    },
    issue_codes: Array.from(new Set(issues.map((issue) => issue.code))).slice(0, 20)
  });
}

export function buildVoiceGenerationAttemptMetadata(input: {
  scriptId?: string | null;
  voiceId?: string | null;
  scriptAudioId?: string | null;
  provider?: string | null;
  providerModel?: string | null;
  locale?: string | null;
  voiceStylePreset?: string | null;
  scriptAudioCacheKey?: string | null;
  cacheLookupResult?: "hit" | "miss" | "skipped" | null;
  cached?: boolean | null;
  storedAssetContentType?: string | null;
  storedAssetByteLength?: number | null;
  failureStage?: QuotaEventFailureStage | null;
  failureCode?: string | null;
}): QuotaEventMetadata {
  const cacheKeyHash = input.scriptAudioCacheKey ? hashStableValue(input.scriptAudioCacheKey) : null;

  return compactMetadata({
    script_id: input.scriptId ?? null,
    voice_id: input.voiceId ?? null,
    script_audio_id: input.scriptAudioId ?? null,
    provider: input.provider ?? null,
    provider_model: input.providerModel ?? null,
    locale: input.locale ?? null,
    voice_style_preset: input.voiceStylePreset ?? null,
    script_audio_cache_key_hash: cacheKeyHash,
    script_audio_cache_key_prefix: input.scriptAudioCacheKey ? input.scriptAudioCacheKey.slice(0, 16) : null,
    cache_lookup_result: input.cacheLookupResult ?? null,
    cached: input.cached ?? null,
    stored_asset_content_type: input.storedAssetContentType ?? null,
    stored_asset_byte_length: input.storedAssetByteLength ?? null,
    failure_stage: input.failureStage ?? null,
    failure_code: sanitizeFailureCode(input.failureCode)
  });
}

export async function recordQuotaEventAttempt(input: {
  userId: string;
  provider: string | null;
  providerModel?: string | null;
  keys: TextGenerationQuotaKeys;
  metadata: QuotaEventMetadata;
  billingStatus?: QuotaEventBillingStatus;
}): Promise<QuotaEventRef> {
  return insertQuotaEvent({
    user_id: input.userId,
    event_type: SCRIPT_GENERATION_EVENT_TYPE,
    category: TEXT_GENERATION_CATEGORY,
    status: "attempted",
    billing_status: input.billingStatus ?? "not_evaluated",
    subject_type: SCRIPT_STUDIO_SUBJECT_TYPE,
    target_resource_type: NO_TARGET_RESOURCE_TYPE,
    idempotency_key: input.keys.idempotencyKey,
    dedupe_key: input.keys.dedupeKey,
    request_fingerprint: input.keys.requestFingerprint,
    provider: input.provider,
    provider_model: input.providerModel ?? null,
    metadata: input.metadata as Json
  });
}

export async function recordVoiceQuotaEventAttempt(input: {
  userId: string;
  scriptId: string;
  scriptAudioId?: string | null;
  provider: string | null;
  providerModel?: string | null;
  keys: VoiceGenerationQuotaKeys;
  metadata: QuotaEventMetadata;
  billingStatus?: QuotaEventBillingStatus;
}): Promise<QuotaEventRef> {
  return insertQuotaEvent({
    user_id: input.userId,
    event_type: SCRIPT_AUDIO_GENERATION_EVENT_TYPE,
    category: VOICE_GENERATION_CATEGORY,
    status: "attempted",
    billing_status: input.billingStatus ?? "not_evaluated",
    subject_type: SAVED_SCRIPT_SUBJECT_TYPE,
    subject_id: input.scriptId,
    target_resource_type: SCRIPT_AUDIO_TARGET_RESOURCE_TYPE,
    target_resource_id: input.scriptAudioId ?? null,
    idempotency_key: input.keys.idempotencyKey,
    dedupe_key: input.keys.dedupeKey,
    request_fingerprint: input.keys.requestFingerprint,
    provider: input.provider,
    provider_model: input.providerModel ?? null,
    metadata: input.metadata as Json
  });
}

export async function recordVoiceQuotaEventCacheHit(input: {
  userId: string;
  scriptId: string;
  scriptAudioId?: string | null;
  provider: string | null;
  providerModel?: string | null;
  keys: VoiceGenerationQuotaKeys;
  metadata: QuotaEventMetadata;
}): Promise<QuotaEventRef> {
  const completedAt = new Date().toISOString();
  const dedupeKey = `${input.keys.dedupeKey}:cache_hit`;

  return insertQuotaEvent({
    user_id: input.userId,
    event_type: SCRIPT_AUDIO_GENERATION_EVENT_TYPE,
    category: VOICE_GENERATION_CATEGORY,
    status: "cache_hit",
    billing_status: "non_billable",
    subject_type: SAVED_SCRIPT_SUBJECT_TYPE,
    subject_id: input.scriptId,
    target_resource_type: SCRIPT_AUDIO_TARGET_RESOURCE_TYPE,
    target_resource_id: input.scriptAudioId ?? null,
    idempotency_key: `${input.keys.idempotencyKey}:cache_hit`,
    dedupe_key: dedupeKey,
    request_fingerprint: input.keys.requestFingerprint,
    provider: input.provider,
    provider_model: input.providerModel ?? null,
    metadata: input.metadata as Json,
    attempted_at: completedAt,
    completed_at: completedAt
  });
}

export async function recordVoiceQuotaEventSkipped(input: {
  userId: string;
  scriptId: string;
  scriptAudioId?: string | null;
  provider: string | null;
  providerModel?: string | null;
  keys: VoiceGenerationQuotaKeys;
  metadata: QuotaEventMetadata;
  failureStage: QuotaEventFailureStage;
  failureCode: string;
  billingStatus?: QuotaEventBillingStatus;
}): Promise<QuotaEventRef> {
  const completedAt = new Date().toISOString();

  return insertQuotaEvent({
    user_id: input.userId,
    event_type: SCRIPT_AUDIO_GENERATION_EVENT_TYPE,
    category: VOICE_GENERATION_CATEGORY,
    status: "skipped",
    failure_stage: input.failureStage,
    failure_code: sanitizeFailureCode(input.failureCode),
    billing_status: input.billingStatus ?? "non_billable",
    subject_type: SAVED_SCRIPT_SUBJECT_TYPE,
    subject_id: input.scriptId,
    target_resource_type: SCRIPT_AUDIO_TARGET_RESOURCE_TYPE,
    target_resource_id: input.scriptAudioId ?? null,
    idempotency_key: input.keys.idempotencyKey,
    dedupe_key: input.keys.dedupeKey,
    request_fingerprint: input.keys.requestFingerprint,
    provider: input.provider,
    provider_model: input.providerModel ?? null,
    metadata: input.metadata as Json,
    attempted_at: completedAt,
    completed_at: completedAt
  });
}

export async function recordVoiceQuotaEventFailed(input: {
  userId: string;
  scriptId: string;
  scriptAudioId?: string | null;
  provider: string | null;
  providerModel?: string | null;
  keys: VoiceGenerationQuotaKeys;
  metadata: QuotaEventMetadata;
  failureStage: QuotaEventFailureStage;
  failureCode: string;
  billingStatus?: QuotaEventBillingStatus;
}): Promise<QuotaEventRef> {
  const completedAt = new Date().toISOString();

  return insertQuotaEvent({
    user_id: input.userId,
    event_type: SCRIPT_AUDIO_GENERATION_EVENT_TYPE,
    category: VOICE_GENERATION_CATEGORY,
    status: "failed",
    failure_stage: input.failureStage,
    failure_code: sanitizeFailureCode(input.failureCode),
    billing_status: input.billingStatus ?? "non_billable",
    subject_type: SAVED_SCRIPT_SUBJECT_TYPE,
    subject_id: input.scriptId,
    target_resource_type: SCRIPT_AUDIO_TARGET_RESOURCE_TYPE,
    target_resource_id: input.scriptAudioId ?? null,
    idempotency_key: input.keys.idempotencyKey,
    dedupe_key: input.keys.dedupeKey,
    request_fingerprint: input.keys.requestFingerprint,
    provider: input.provider,
    provider_model: input.providerModel ?? null,
    metadata: input.metadata as Json,
    attempted_at: completedAt,
    completed_at: completedAt
  });
}

export async function recordQuotaEventSkipped(input: {
  userId: string;
  provider: string | null;
  providerModel?: string | null;
  keys: TextGenerationQuotaKeys;
  metadata: QuotaEventMetadata;
  failureStage: QuotaEventFailureStage;
  failureCode: string;
  billingStatus?: QuotaEventBillingStatus;
}): Promise<QuotaEventRef> {
  const completedAt = new Date().toISOString();

  return insertQuotaEvent({
    user_id: input.userId,
    event_type: SCRIPT_GENERATION_EVENT_TYPE,
    category: TEXT_GENERATION_CATEGORY,
    status: "skipped",
    failure_stage: input.failureStage,
    failure_code: sanitizeFailureCode(input.failureCode),
    billing_status: input.billingStatus ?? "non_billable",
    subject_type: SCRIPT_STUDIO_SUBJECT_TYPE,
    target_resource_type: NO_TARGET_RESOURCE_TYPE,
    idempotency_key: input.keys.idempotencyKey,
    dedupe_key: input.keys.dedupeKey,
    request_fingerprint: input.keys.requestFingerprint,
    provider: input.provider,
    provider_model: input.providerModel ?? null,
    metadata: input.metadata as Json,
    attempted_at: completedAt,
    completed_at: completedAt
  });
}

export async function markQuotaEventSucceeded(
  ref: QuotaEventRef | null,
  input: {
    metadata: QuotaEventMetadata;
    providerRequestId?: string | null;
    targetResourceId?: string | null;
    billingStatus?: QuotaEventBillingStatus;
  }
): Promise<QuotaEventRef | null> {
  const payload: QuotaEventsTable["Update"] = {
    status: "succeeded",
    failure_stage: null,
    failure_code: null,
    billing_status: input.billingStatus ?? "billable_candidate",
    provider_request_id: input.providerRequestId ?? null,
    metadata: input.metadata as Json,
    completed_at: new Date().toISOString()
  };

  if (input.targetResourceId !== undefined) {
    payload.target_resource_id = input.targetResourceId;
  }

  return updateQuotaEvent(ref, payload);
}

export async function markQuotaEventFailed(
  ref: QuotaEventRef | null,
  input: {
    failureStage: QuotaEventFailureStage;
    failureCode: string;
    metadata: QuotaEventMetadata;
    providerRequestId?: string | null;
    targetResourceId?: string | null;
    billingStatus?: QuotaEventBillingStatus;
  }
): Promise<QuotaEventRef | null> {
  const payload: QuotaEventsTable["Update"] = {
    status: "failed",
    failure_stage: input.failureStage,
    failure_code: sanitizeFailureCode(input.failureCode),
    billing_status: input.billingStatus ?? "refund_candidate",
    provider_request_id: input.providerRequestId ?? null,
    metadata: input.metadata as Json,
    completed_at: new Date().toISOString()
  };

  if (input.targetResourceId !== undefined) {
    payload.target_resource_id = input.targetResourceId;
  }

  return updateQuotaEvent(ref, payload);
}

export async function markQuotaEventPartial(
  ref: QuotaEventRef | null,
  input: {
    failureStage: QuotaEventFailureStage;
    failureCode: string;
    metadata: QuotaEventMetadata;
    providerRequestId?: string | null;
    targetResourceId?: string | null;
    billingStatus?: QuotaEventBillingStatus;
  }
): Promise<QuotaEventRef | null> {
  const payload: QuotaEventsTable["Update"] = {
    status: "partial",
    failure_stage: input.failureStage,
    failure_code: sanitizeFailureCode(input.failureCode),
    billing_status: input.billingStatus ?? "refund_candidate",
    provider_request_id: input.providerRequestId ?? null,
    metadata: input.metadata as Json,
    completed_at: new Date().toISOString()
  };

  if (input.targetResourceId !== undefined) {
    payload.target_resource_id = input.targetResourceId;
  }

  return updateQuotaEvent(ref, payload);
}

export async function markQuotaEventSkipped(
  ref: QuotaEventRef | null,
  input: {
    failureStage: QuotaEventFailureStage;
    failureCode: string;
    metadata: QuotaEventMetadata;
    billingStatus?: QuotaEventBillingStatus;
  }
): Promise<QuotaEventRef | null> {
  return updateQuotaEvent(ref, {
    status: "skipped",
    failure_stage: input.failureStage,
    failure_code: sanitizeFailureCode(input.failureCode),
    billing_status: input.billingStatus ?? "non_billable",
    metadata: input.metadata as Json,
    completed_at: new Date().toISOString()
  });
}

export async function markQuotaEventNotBillable(
  ref: QuotaEventRef | null,
  input: {
    metadata: QuotaEventMetadata;
    providerRequestId?: string | null;
  }
): Promise<QuotaEventRef | null> {
  return updateQuotaEvent(ref, {
    status: "not_billable",
    failure_stage: null,
    failure_code: null,
    billing_status: "non_billable",
    provider_request_id: input.providerRequestId ?? null,
    metadata: input.metadata as Json,
    completed_at: new Date().toISOString()
  });
}

export async function withNonBlockingQuotaEventWrite<T>(operation: string, write: () => Promise<T>): Promise<T | null> {
  try {
    return await write();
  } catch (error) {
    console.warn("[quota] Non-blocking quota event write failed.", {
      operation,
      message: error instanceof Error ? error.message : "Unknown quota event write error"
    });

    return null;
  }
}

export function extractProviderRequestIdFromPipeline(result: ScriptGenerationPipelineResult): string | null {
  return result.providerRequestId;
}

async function insertQuotaEvent(payload: QuotaEventsTable["Insert"]): Promise<QuotaEventRef> {
  const client = getQuotaEventAdminClient();
  const { data, error } = await client.from("quota_events").insert(payload).select("id").single();

  if (error) {
    if (isUniqueViolation(error) && payload.dedupe_key) {
      const existing = await findQuotaEventByDedupeKey(payload.user_id, payload.dedupe_key);

      if (existing) {
        return existing;
      }
    }

    throw new Error(`quota_events insert failed: ${error.message}`);
  }

  return { id: data.id };
}

async function updateQuotaEvent(ref: QuotaEventRef | null, payload: QuotaEventsTable["Update"]): Promise<QuotaEventRef | null> {
  if (!ref) {
    return null;
  }

  const client = getQuotaEventAdminClient();
  const { data, error } = await client
    .from("quota_events")
    .update(payload)
    .eq("id", ref.id)
    .is("completed_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`quota_events update failed: ${error.message}`);
  }

  return data ? { id: data.id } : ref;
}

async function findQuotaEventByDedupeKey(userId: string, dedupeKey: string): Promise<QuotaEventRef | null> {
  const client = getQuotaEventAdminClient();
  const { data, error } = await client
    .from("quota_events")
    .select("id")
    .eq("user_id", userId)
    .eq("dedupe_key", dedupeKey)
    .maybeSingle();

  if (error) {
    throw new Error(`quota_events duplicate lookup failed: ${error.message}`);
  }

  return data ? { id: data.id } : null;
}

function getQuotaEventAdminClient() {
  if (!getSupabaseServiceRoleKey().trim()) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for quota event writes.");
  }

  return createSupabaseAdminClient();
}

function buildFingerprintableScriptGenerationRequest(request: ScriptGenerationRequest) {
  const brief = request.brief;

  return {
    userSeedText: brief.userSeedText?.trim() ?? "",
    topicCategory: brief.topicCategory ?? null,
    situation: brief.situation ?? null,
    audience: brief.audience ?? null,
    tone: brief.tone ?? null,
    targetLengthSeconds: brief.targetLengthSeconds ?? null,
    difficulty: brief.difficulty ?? null,
    priority: brief.priority ?? null,
    mustInclude: brief.mustInclude ?? [],
    avoid: brief.avoid ?? [],
    languagePreference: brief.languagePreference ?? null,
    requestedVariants: request.requestedVariants ?? null,
    boundedAdjustment: request.boundedAdjustment ?? null
  };
}

function hashStableValue(value: unknown) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value ?? null);
}

function compactMetadata(metadata: QuotaEventMetadata): QuotaEventMetadata {
  return Object.fromEntries(Object.entries(metadata).filter(([, value]) => value !== undefined)) as QuotaEventMetadata;
}

function sanitizeFailureCode(failureCode: string | null | undefined) {
  if (!failureCode) {
    return null;
  }

  return failureCode
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]/g, "_")
    .slice(0, 80);
}

function collectPipelineIssues(result: ScriptGenerationPipelineResult): ScriptGenerationPipelineIssue[] {
  return [
    ...result.issues,
    ...result.acceptedDrafts.flatMap((draft) => draft.issues),
    ...result.rejectedCandidates.flatMap((candidate) => candidate.issues)
  ];
}

function isUniqueViolation(error: { code?: string }) {
  return error.code === "23505";
}
