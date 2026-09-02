import { randomUUID } from "node:crypto";
import { AppError } from "@/lib/errors";
import { timeAsync } from "@/lib/performance/timing";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCurrentUser } from "@/lib/supabase/auth";
import { DEFAULT_VOICE_STYLE_PRESET } from "@/lib/voice-style";
import { buildScriptAudioPlaybackPath } from "@/lib/voice-playback-path";
import type { AppSupabaseClient } from "@/lib/supabase/client";
import { getSupabaseServiceRoleKey } from "@/lib/supabase/config";
import type { Database } from "@/types/database";
import type { Json } from "@/types/database";
import type { CreateVoiceRequestInput, SpeakScriptRequestInput, VoiceConsentRequestInput } from "@/schemas/voice";
import { createConfiguredVoiceProvider, getVoiceProviderName, getVoiceProviderStatus } from "@/providers/voice";
import type { VoiceProviderRequirements } from "@/providers/voice";
import {
  parseVoiceSampleAudioReference,
  resolveOwnedVoiceConsentRecordingInput,
  resolveOwnedVoiceSampleInput
} from "@/services/storage";
import { getScript } from "@/services/scripts/scripts.service";
import {
  acceptCurrentProcessingConsent,
  assertCurrentProcessingConsent,
  getCurrentProcessingConsent
} from "@/services/consent";
import {
  buildVoiceGenerationAttemptMetadata,
  buildVoiceGenerationQuotaKeys,
  markQuotaEventFailed,
  markQuotaEventPartial,
  markQuotaEventSucceeded,
  recordVoiceQuotaEventAttempt,
  recordVoiceQuotaEventCacheHit,
  recordVoiceQuotaEventFailed,
  recordVoiceQuotaEventSkipped,
  withNonBlockingQuotaEventWrite,
  type QuotaEventBillingStatus,
  type QuotaEventFailureStage,
  type QuotaEventRef,
  type VoiceGenerationQuotaKeys
} from "@/services/quota";
import { buildScriptAudioCacheKey } from "./cache";
import { createVoiceAssetWriteIntentRepository } from "./voice-asset-write-intent.repository";
import {
  decodeStoredAssetMetadata,
  encodeStoredAssetMetadata,
  stageScriptAudioForReplay,
  type ScriptAudioReplayAsset
} from "./replay.service";
import { SCRIPT_AUDIO_STORAGE_BUCKET, buildScriptAudioStorageObjectKey } from "./replay-storage";

type VoiceConsentRow = Database["public"]["Tables"]["voice_consents"]["Row"];
type VoiceRow = Database["public"]["Tables"]["voices"]["Row"];
type ScriptAudioRow = Database["public"]["Tables"]["script_audios"]["Row"];
type PostgrestErrorLike = { message: string };

type VoiceQuotaContext = {
  userId: string;
  scriptId: string;
  voiceId: string | null;
  scriptAudioId?: string | null;
  provider: string | null;
  providerModel?: string | null;
  locale: string | null;
  voiceStylePreset: string | null;
  cacheKey?: string | null;
  keys: VoiceGenerationQuotaKeys;
};

export type EnsureDefaultVoiceResult = {
  voice: VoiceRow;
  created: boolean;
};

// This only coalesces concurrent requests handled by the same server runtime. The
// persisted default-voice recheck before creation also makes a retry after a lost
// client response reuse the canonical row instead of issuing another provider call.
const defaultVoiceCreationRequests = new Map<string, Promise<EnsureDefaultVoiceResult>>();

type InsertSingleBuilder<TInsert, TRow> = {
  insert(values: TInsert): {
    select(columns?: string): {
      single(): Promise<{ data: TRow; error: PostgrestErrorLike | null }>;
    };
  };
};

type UpdateSingleBuilder<TUpdate, TRow> = {
  update(values: TUpdate): {
    eq(column: "id", value: string): {
      select(columns?: string): {
        single(): Promise<{ data: TRow; error: PostgrestErrorLike | null }>;
      };
    };
  };
};

type ScriptAudioWriteClient = Pick<AppSupabaseClient, "from">;

function asMaybeSingle<TRow>(value: unknown) {
  return value as { data: TRow | null; error: PostgrestErrorLike | null };
}

function asMany<TRow>(value: unknown) {
  return value as { data: TRow[] | null; error: PostgrestErrorLike | null };
}

function mapVoiceError(operation: string, error: PostgrestErrorLike) {
  if (error.message.toLowerCase().includes("voice deletion writer fence")) {
    return new AppError(409, "voice-only deletion の処理中は、新しい voice と見本音声を変更できません。処理の完了後にもう一度お試しください。");
  }

  return new AppError(500, `${operation}に失敗しました。`);
}

async function assertAuthenticatedVoiceMutationUser(client: AppSupabaseClient, userId: string) {
  const user = await requireCurrentUser(client);

  if (user.id !== userId) {
    throw new AppError(403, "voice binding の所有者確認に失敗しました。");
  }
}

function createServerOwnedScriptAudioWriter(): ScriptAudioWriteClient {
  if (!getSupabaseServiceRoleKey().trim()) {
    throw new AppError(503, "見本音声の保存に必要なサーバー設定が未完了です。");
  }

  return createSupabaseAdminClient() as unknown as ScriptAudioWriteClient;
}

function getVoiceQuotaFailureCode(failureStage: QuotaEventFailureStage) {
  switch (failureStage) {
    case "provider_config":
      return "voice_provider_config_unavailable";
    case "provider_request":
      return "voice_provider_synthesize_failed";
    case "storage_staging":
      return "script_audio_storage_staging_failed";
    case "cache_lookup":
      return "script_audio_cache_lookup_failed";
    case "ownership_check":
      return "voice_generation_ownership_check_failed";
    case "pipeline_validation":
      return "voice_generation_pipeline_validation_failed";
    default:
      return "voice_generation_failed";
  }
}

function getVoiceQuotaBillingStatus(provider: string | null, failureStage?: QuotaEventFailureStage): QuotaEventBillingStatus {
  if (provider === "mock") {
    return "non_billable";
  }

  if (!failureStage || failureStage === "provider_request" || failureStage === "storage_staging" || failureStage === "cache_lookup") {
    return "refund_candidate";
  }

  return "non_billable";
}

function createVoiceQuotaContext(input: Omit<VoiceQuotaContext, "keys">): VoiceQuotaContext {
  return {
    ...input,
    keys: buildVoiceGenerationQuotaKeys({
      userId: input.userId,
      scriptId: input.scriptId,
      voiceId: input.voiceId,
      provider: input.provider,
      locale: input.locale,
      voiceStylePreset: input.voiceStylePreset,
      scriptAudioCacheKey: input.cacheKey ?? null
    })
  };
}

function buildVoiceQuotaMetadata(
  context: VoiceQuotaContext,
  input?: {
    cacheLookupResult?: "hit" | "miss" | "skipped" | null;
    cached?: boolean | null;
    replayAsset?: ScriptAudioReplayAsset | null;
    failureStage?: QuotaEventFailureStage | null;
    failureCode?: string | null;
  }
) {
  return buildVoiceGenerationAttemptMetadata({
    scriptId: context.scriptId,
    voiceId: context.voiceId,
    scriptAudioId: context.scriptAudioId ?? null,
    provider: context.provider,
    providerModel: context.providerModel ?? null,
    locale: context.locale,
    voiceStylePreset: context.voiceStylePreset,
    scriptAudioCacheKey: context.cacheKey ?? null,
    cacheLookupResult: input?.cacheLookupResult ?? null,
    cached: input?.cached ?? null,
    storedAssetContentType: input?.replayAsset?.storedAsset?.contentType ?? null,
    storedAssetByteLength: input?.replayAsset?.storedAsset?.byteLength ?? null,
    failureStage: input?.failureStage ?? null,
    failureCode: input?.failureCode ?? null
  });
}

function buildCachedVoiceQuotaMetadata(context: VoiceQuotaContext, cachedAudio: ScriptAudioRow) {
  const storedAsset = decodeStoredAssetMetadata(cachedAudio.stored_asset);

  return buildVoiceGenerationAttemptMetadata({
    scriptId: context.scriptId,
    voiceId: context.voiceId,
    scriptAudioId: cachedAudio.id,
    provider: context.provider,
    providerModel: context.providerModel ?? null,
    locale: context.locale,
    voiceStylePreset: context.voiceStylePreset,
    scriptAudioCacheKey: context.cacheKey ?? null,
    cacheLookupResult: "hit",
    cached: true,
    storedAssetContentType: storedAsset?.contentType ?? null,
    storedAssetByteLength: storedAsset?.byteLength ?? null
  });
}

async function recordSkippedVoiceQuotaEvent(context: VoiceQuotaContext, failureStage: QuotaEventFailureStage) {
  const failureCode = getVoiceQuotaFailureCode(failureStage);

  await withNonBlockingQuotaEventWrite("record skipped voice generation quota event", () =>
    recordVoiceQuotaEventSkipped({
      userId: context.userId,
      scriptId: context.scriptId,
      scriptAudioId: context.scriptAudioId ?? null,
      provider: context.provider,
      providerModel: context.providerModel ?? null,
      keys: context.keys,
      metadata: buildVoiceQuotaMetadata(context, {
        cacheLookupResult: "skipped",
        failureStage,
        failureCode
      }),
      failureStage,
      failureCode,
      billingStatus: "non_billable"
    })
  );
}

async function recordFailedVoiceQuotaEvent(context: VoiceQuotaContext, failureStage: QuotaEventFailureStage) {
  const failureCode = getVoiceQuotaFailureCode(failureStage);

  await withNonBlockingQuotaEventWrite("record failed voice generation quota event", () =>
    recordVoiceQuotaEventFailed({
      userId: context.userId,
      scriptId: context.scriptId,
      scriptAudioId: context.scriptAudioId ?? null,
      provider: context.provider,
      providerModel: context.providerModel ?? null,
      keys: context.keys,
      metadata: buildVoiceQuotaMetadata(context, {
        cacheLookupResult: context.cacheKey ? "miss" : "skipped",
        cached: false,
        failureStage,
        failureCode
      }),
      failureStage,
      failureCode,
      billingStatus: "non_billable"
    })
  );
}

async function markFailedVoiceQuotaEvent(
  ref: QuotaEventRef | null,
  context: VoiceQuotaContext,
  failureStage: QuotaEventFailureStage,
  input?: {
    replayAsset?: ScriptAudioReplayAsset | null;
    providerRequestId?: string | null;
    partial?: boolean;
  }
) {
  const failureCode = getVoiceQuotaFailureCode(failureStage);
  const marker = input?.partial ? markQuotaEventPartial : markQuotaEventFailed;

  await withNonBlockingQuotaEventWrite(input?.partial ? "mark voice generation quota event partial" : "mark voice generation quota event failed", () =>
    marker(ref, {
      failureStage,
      failureCode,
      metadata: buildVoiceQuotaMetadata(context, {
        cacheLookupResult: context.cacheKey ? "miss" : "skipped",
        cached: false,
        replayAsset: input?.replayAsset ?? null,
        failureStage,
        failureCode
      }),
      providerRequestId: input?.providerRequestId ?? null,
      targetResourceId: context.scriptAudioId ?? null,
      billingStatus: getVoiceQuotaBillingStatus(context.provider, failureStage)
    })
  );
}

function getJsonObject(value: Json) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value;
}

async function getLatestConsent(client: AppSupabaseClient, userId: string, provider = getVoiceProviderName()) {
  const { data, error } = asMaybeSingle<VoiceConsentRow>(
    await client
      .from("voice_consents")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", provider)
      .order("consented_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  );

  if (error) {
    throw mapVoiceError("同意状態の取得", error);
  }

  return data;
}

async function listVoices(client: AppSupabaseClient, userId: string, provider = getVoiceProviderName()) {
  const { data, error } = asMany<VoiceRow>(
    await client
      .from("voices")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", provider)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false })
  );

  if (error) {
    throw mapVoiceError("voice 一覧の取得", error);
  }

  return data ?? [];
}

export async function getDefaultVoice(client: AppSupabaseClient, userId: string) {
  const voices = await listVoices(client, userId, getVoiceProviderName());
  return voices[0] ?? null;
}

export function didReuseGeneratedScriptAudioCache(input: {
  insertSucceeded: boolean;
  finalCacheFound: boolean;
}) {
  return !input.insertSucceeded && input.finalCacheFound;
}

export async function getVoiceSetupState(client: AppSupabaseClient, userId: string) {
  return timeAsync("voice.setupState", async () => {
    const providerStatus = getVoiceProviderStatus();
    const [consent, currentVoiceCloningConsent, voices] = await Promise.all([
      getLatestConsent(client, userId, providerStatus.provider),
      getCurrentProcessingConsent(client, userId, "voice_cloning"),
      listVoices(client, userId, providerStatus.provider)
    ]);

    return {
      provider: providerStatus.provider,
      providerSupported: providerStatus.supported,
      providerMessage: providerStatus.message,
      providerReadiness: providerStatus.readiness,
      providerRequirements: providerStatus.requirements,
      providerDiagnostics: providerStatus.diagnostics,
      consent,
      voiceConsentCurrent: Boolean(currentVoiceCloningConsent),
      voices,
      defaultVoice: voices[0] ?? null
    };
  });
}

function assertProviderConsentRequirements(input: {
  requirements: VoiceProviderRequirements;
  name?: string;
  language?: string;
  recording: { audioPath: string; contentType?: string; byteLength?: number } | null;
}) {
  if (input.requirements.requiresConsentName && !input.name?.trim()) {
    throw new AppError(400, `${input.requirements.voiceLabel} では同意者名が必要です。`);
  }

  if (input.requirements.requiresConsentLanguage && !input.language?.trim()) {
    throw new AppError(400, `${input.requirements.voiceLabel} では同意音声の言語が必要です。`);
  }

  if (input.requirements.requiresConsentRecording && !input.recording?.audioPath) {
    throw new AppError(400, `${input.requirements.voiceLabel} では同意録音の upload が必要です。先に録音ファイルを保存してください。`);
  }
}

export async function createVoiceConsent(client: AppSupabaseClient, userId: string, input: VoiceConsentRequestInput) {
  const providerStatus = getVoiceProviderStatus();

  if (!providerStatus.supported) {
    throw new AppError(503, providerStatus.message ?? `VOICE_PROVIDER=${providerStatus.provider} は current repo では利用できません。`);
  }

  const resolvedRecording = await resolveOwnedVoiceConsentRecordingInput(client, userId, input.recording ?? null);
  const trimmedName = input.name?.trim() || undefined;
  const trimmedLanguage = input.language?.trim() || undefined;

  assertProviderConsentRequirements({
    requirements: providerStatus.requirements,
    name: trimmedName,
    language: trimmedLanguage,
    recording: resolvedRecording
  });

  const provider = createConfiguredVoiceProvider();
  const termsAcceptedAt = new Date().toISOString();
  // Fixed boundary:
  // - service re-validates owned recording references first
  // - provider adapter may call an external consent endpoint
  // - canonical consent state still persists in voice_consents
  const providerConsent = await provider.createConsent({
    userId,
    provider: providerStatus.provider,
    termsAcceptedAt,
    name: trimmedName,
    language: trimmedLanguage,
    recording: resolvedRecording ?? undefined
  });

  const voiceConsents = client.from("voice_consents") as unknown as InsertSingleBuilder<
    Database["public"]["Tables"]["voice_consents"]["Insert"],
    VoiceConsentRow
  >;

  const { data, error } = await voiceConsents
    .insert({
      user_id: userId,
      provider: providerStatus.provider,
      consented_at: providerConsent.consentedAt,
      metadata: {
        providerConsentId: providerConsent.providerConsentId,
        termsAcceptedAt,
        name: trimmedName,
        language: trimmedLanguage,
        recording: resolvedRecording
      }
    })
    .select("*")
    .single();

  if (error) {
    throw mapVoiceError("同意記録の保存", error);
  }

  // Legacy voice_consents keeps provider-specific workflow history. The separate
  // record below is the versioned product consent used by new clone creation.
  await acceptCurrentProcessingConsent(client, userId, "voice_cloning");

  return data;
}

async function getOwnedConsent(client: AppSupabaseClient, userId: string, consentId: string) {
  const { data, error } = asMaybeSingle<VoiceConsentRow>(
    await client
      .from("voice_consents")
      .select("*")
      .eq("user_id", userId)
      .eq("id", consentId)
      .maybeSingle()
  );

  if (error) {
    throw mapVoiceError("同意情報の取得", error);
  }

  return data;
}

export async function createUserVoice(client: AppSupabaseClient, userId: string, input: CreateVoiceRequestInput) {
  // Every voice write starts by re-resolving the authenticated server request.
  // The supplied userId is an ownership scope, never an authority by itself.
  await assertAuthenticatedVoiceMutationUser(client, userId);

  const providerStatus = getVoiceProviderStatus();

  if (!providerStatus.supported) {
    throw new AppError(503, providerStatus.message ?? `VOICE_PROVIDER=${providerStatus.provider} は current repo では利用できません。`);
  }

  // Do this before resolving sample data or calling the provider. A legacy
  // provider consent alone is intentionally insufficient after G5A.
  await assertCurrentProcessingConsent(client, userId, "voice_cloning");

  const consent = await getOwnedConsent(client, userId, input.consentId);

  if (!consent) {
    throw new AppError(404, "利用可能な同意記録が見つかりませんでした。先に同意を完了してください。");
  }

  if (consent.provider !== providerStatus.provider) {
    throw new AppError(409, "現在の voice provider と同意記録の provider が一致しません。もう一度同意からやり直してください。");
  }

  const consentMetadata = getJsonObject(consent.metadata);
  const providerConsentId =
    typeof consentMetadata?.providerConsentId === "string" ? consentMetadata.providerConsentId.trim() : "";

  if (providerStatus.requirements.requiresProviderConsentId && !providerConsentId) {
    throw new AppError(409, `${providerStatus.requirements.voiceLabel} 用の consent ID が見つかりません。もう一度同意からやり直してください。`);
  }

  const trimmedSampleAudioPath = input.sampleAudioPath?.trim() || "";
  const resolvedFallbackSampleAudio = trimmedSampleAudioPath
    ? parseVoiceSampleAudioReference({ audioPath: trimmedSampleAudioPath })
      ? await resolveOwnedVoiceSampleInput(client, userId, consent.id, {
          audioPath: trimmedSampleAudioPath
        })
      : null
    : null;

  if (providerStatus.requirements.requiresSampleAudio && trimmedSampleAudioPath && !resolvedFallbackSampleAudio && !input.sampleAudio) {
    throw new AppError(400, `${providerStatus.requirements.voiceLabel} では、見本音声 path に app-owned な storage://voice-samples/... 参照が必要です。`);
  }

  const resolvedSampleAudio =
    (await resolveOwnedVoiceSampleInput(client, userId, consent.id, input.sampleAudio ?? null)) ??
    (resolvedFallbackSampleAudio ??
      (trimmedSampleAudioPath
        ? {
            audioPath: trimmedSampleAudioPath
          }
        : null));

  if (providerStatus.requirements.requiresSampleAudio && !resolvedSampleAudio) {
    throw new AppError(400, `${providerStatus.requirements.voiceLabel} では見本音声 sample が必要です。先に upload 済み sample を用意してください。`);
  }

  const provider = createConfiguredVoiceProvider();
  const writeIntents = createVoiceAssetWriteIntentRepository();
  const reservation = await writeIntents.reserve({
    userId,
    kind: "voice_create",
    leaseToken: randomUUID(),
    leaseSeconds: 900
  });
  // Fixed boundary:
  // - service resolves owned sample references before provider calls
  // - provider adapter handles multipart/provider-specific createVoice details
  // - persisted voices row remains the canonical default-voice source for listen/cache flows
  const created = await provider.createVoice({
    userId,
    consentId: consent.id,
    providerConsentId: providerConsentId || undefined,
    label: input.label,
    sampleAudio: resolvedSampleAudio ?? undefined,
    sampleAudioPath: trimmedSampleAudioPath || undefined
  });

  return writeIntents.finalizeVoice({
    ...reservation,
    userId,
    consentId: consent.id,
    providerVoiceId: created.providerVoiceId,
    label: input.label,
    sampleAudioPath: resolvedSampleAudio?.audioPath ?? (trimmedSampleAudioPath || null)
  });
}

export async function createDefaultVoiceIfMissing(
  client: AppSupabaseClient,
  userId: string,
  input: CreateVoiceRequestInput
): Promise<EnsureDefaultVoiceResult> {
  const existing = await getDefaultVoice(client, userId);

  if (existing) {
    return { voice: existing, created: false };
  }

  const requestKey = `${userId}:${getVoiceProviderName()}`;
  const inFlight = defaultVoiceCreationRequests.get(requestKey);

  if (inFlight) {
    return inFlight;
  }

  const pending = (async () => {
    const rechecked = await getDefaultVoice(client, userId);

    if (rechecked) {
      return { voice: rechecked, created: false };
    }

    return {
      voice: await createUserVoice(client, userId, input),
      created: true
    };
  })();

  defaultVoiceCreationRequests.set(requestKey, pending);

  try {
    return await pending;
  } finally {
    if (defaultVoiceCreationRequests.get(requestKey) === pending) {
      defaultVoiceCreationRequests.delete(requestKey);
    }
  }
}

async function getOwnedVoice(client: AppSupabaseClient, userId: string, voiceId: string) {
  const { data, error } = asMaybeSingle<VoiceRow>(
    await client
      .from("voices")
      .select("*")
      .eq("user_id", userId)
      .eq("id", voiceId)
      .maybeSingle()
  );

  if (error) {
    throw mapVoiceError("voice の取得", error);
  }

  return data;
}

async function getCachedScriptAudio(
  client: AppSupabaseClient,
  scriptId: string,
  voiceId: string,
  cacheKey: string
) {
  const { data, error } = asMaybeSingle<ScriptAudioRow>(
    await client
      .from("script_audios")
      .select("*")
      .eq("script_id", scriptId)
      .eq("voice_id", voiceId)
      .eq("cache_key", cacheKey)
      .maybeSingle()
  );

  if (error) {
    throw mapVoiceError("キャッシュ音声の取得", error);
  }

  return data;
}

async function assertServerOwnedScriptAudioWrite(
  client: AppSupabaseClient,
  userId: string,
  input: {
    scriptId: string;
    voiceId: string;
    provider: string;
    cacheKey: string;
    voiceStylePreset: string;
  }
) {
  await assertAuthenticatedVoiceMutationUser(client, userId);

  const [script, voice] = await Promise.all([
    getScript(client, userId, input.scriptId),
    getOwnedVoice(client, userId, input.voiceId)
  ]);

  if (!script || !voice || voice.provider !== input.provider) {
    throw new AppError(409, "見本音声の所有者または provider を確認できませんでした。");
  }

  const expectedCacheKey = buildScriptAudioCacheKey({
    provider: voice.provider,
    voiceId: voice.id,
    scriptLocale: script.locale,
    voiceStylePreset: input.voiceStylePreset,
    scriptContent: script.content
  });

  if (input.cacheKey !== expectedCacheKey) {
    throw new AppError(409, "見本音声キャッシュの識別情報を確認できませんでした。");
  }

  return { script, voice, writer: createServerOwnedScriptAudioWriter() };
}

async function ensureServerOwnedScriptAudioPlaybackPath(
  client: AppSupabaseClient,
  userId: string,
  scriptAudio: ScriptAudioRow,
  voiceStylePreset: string
) {
  const playbackPath = buildScriptAudioPlaybackPath(scriptAudio.id);

  if (scriptAudio.storage_path === playbackPath) {
    return scriptAudio;
  }

  const { writer } = await assertServerOwnedScriptAudioWrite(client, userId, {
    scriptId: scriptAudio.script_id,
    voiceId: scriptAudio.voice_id ?? "",
    provider: scriptAudio.provider,
    cacheKey: scriptAudio.cache_key,
    voiceStylePreset
  });
  const scriptAudios = writer.from("script_audios") as unknown as UpdateSingleBuilder<
    Database["public"]["Tables"]["script_audios"]["Update"],
    ScriptAudioRow
  >;

  const { data, error } = await scriptAudios
    .update({
      storage_path: playbackPath
    })
    .eq("id", scriptAudio.id)
    .select("*")
    .single();

  if (error) {
    throw mapVoiceError("見本音声キャッシュの更新", error);
  }

  return data;
}

export async function getCachedListenAudio(client: AppSupabaseClient, userId: string, scriptId: string) {
  return timeAsync("voice.cachedListenAudio", async () => {
    const [script, voice] = await Promise.all([getScript(client, userId, scriptId), getDefaultVoice(client, userId)]);

    if (!script || !voice) {
      return null;
    }

    const cacheKey = buildScriptAudioCacheKey({
      provider: voice.provider,
      voiceId: voice.id,
      scriptLocale: script.locale,
      voiceStylePreset: DEFAULT_VOICE_STYLE_PRESET,
      scriptContent: script.content
    });

    const cachedAudio = await timeAsync("voice.cachedListenAudio.cacheLookup", () => getCachedScriptAudio(client, script.id, voice.id, cacheKey));

    if (!cachedAudio) {
      return null;
    }

    const playableAudio = await timeAsync("voice.cachedListenAudio.ensurePlaybackPath", () =>
      ensureServerOwnedScriptAudioPlaybackPath(client, userId, cachedAudio, DEFAULT_VOICE_STYLE_PRESET)
    );

    return {
      audioUrl: playableAudio.storage_path,
      cached: true,
      cacheKey,
      voice
    };
  });
}

export async function speakScript(client: AppSupabaseClient, userId: string, input: SpeakScriptRequestInput) {
  return timeAsync("voice.speakScript", async () => {
    const providerStatus = getVoiceProviderStatus();
    const voiceStylePreset = input.voiceStylePreset ?? DEFAULT_VOICE_STYLE_PRESET;

    const [script, selectedVoice] = await timeAsync("voice.speakScript.ownershipLoad", () =>
      Promise.all([
        getScript(client, userId, input.scriptId),
        input.voiceId ? getOwnedVoice(client, userId, input.voiceId) : getDefaultVoice(client, userId)
      ])
    );

  if (!script) {
    await recordFailedVoiceQuotaEvent(
      createVoiceQuotaContext({
        userId,
        scriptId: input.scriptId,
        voiceId: input.voiceId ?? null,
        provider: providerStatus.provider,
        providerModel: null,
        locale: null,
        voiceStylePreset,
        cacheKey: null
      }),
      "ownership_check"
    );

    throw new AppError(404, "台本が見つかりませんでした。");
  }

  if (!selectedVoice) {
    await recordFailedVoiceQuotaEvent(
      createVoiceQuotaContext({
        userId,
        scriptId: script.id,
        voiceId: input.voiceId ?? null,
        provider: providerStatus.provider,
        providerModel: null,
        locale: script.locale,
        voiceStylePreset,
        cacheKey: null
      }),
      "ownership_check"
    );

    throw new AppError(409, "見本音声を作る前に `/setup/voice` で voice を準備してください。");
  }

  if (selectedVoice.provider !== providerStatus.provider) {
    await recordFailedVoiceQuotaEvent(
      createVoiceQuotaContext({
        userId,
        scriptId: script.id,
        voiceId: selectedVoice.id,
        provider: providerStatus.provider,
        providerModel: null,
        locale: script.locale,
        voiceStylePreset,
        cacheKey: null
      }),
      "ownership_check"
    );

    throw new AppError(409, "現在の voice provider と保存済み voice の provider が一致しません。`/setup/voice` で作り直してください。");
  }

  const cacheKey = buildScriptAudioCacheKey({
    provider: selectedVoice.provider,
    voiceId: selectedVoice.id,
    scriptLocale: script.locale,
    voiceStylePreset,
    scriptContent: script.content
  });

  const quotaContext = createVoiceQuotaContext({
    userId,
    scriptId: script.id,
    voiceId: selectedVoice.id,
    provider: selectedVoice.provider,
    providerModel: null,
    locale: script.locale,
    voiceStylePreset,
    cacheKey
  });

  let cachedAudio: ScriptAudioRow | null;

  try {
    cachedAudio = await timeAsync("voice.speakScript.cacheLookup", () => getCachedScriptAudio(client, script.id, selectedVoice.id, cacheKey));
  } catch (error) {
    await recordFailedVoiceQuotaEvent(quotaContext, "cache_lookup");
    throw error;
  }

  if (cachedAudio) {
    const playableAudio = await timeAsync("voice.speakScript.ensurePlaybackPath", () =>
      ensureServerOwnedScriptAudioPlaybackPath(client, userId, cachedAudio, voiceStylePreset)
    );

    await withNonBlockingQuotaEventWrite("record cache hit voice generation quota event", () =>
      recordVoiceQuotaEventCacheHit({
        userId,
        scriptId: script.id,
        scriptAudioId: playableAudio.id,
        provider: selectedVoice.provider,
        providerModel: null,
        keys: quotaContext.keys,
        metadata: buildCachedVoiceQuotaMetadata(quotaContext, playableAudio)
      })
    );

    // Cache identity stays app-owned:
    // script content/locale + app voice row drive reuse, not provider URLs or client state.
    return {
      audioUrl: playableAudio.storage_path,
      cached: true,
      cacheKey,
      voice: selectedVoice
    };
  }

  // A persisted, owned cache entry remains playable when the provider is
  // temporarily unavailable. Authorization, provider binding, and cache
  // identity were resolved before this branch, so no unowned asset can be
  // returned.
  if (!providerStatus.supported) {
    await recordSkippedVoiceQuotaEvent(quotaContext, "provider_config");

    throw new AppError(503, providerStatus.message ?? `VOICE_PROVIDER=${providerStatus.provider} は current repo では利用できません。`);
  }

  await assertAuthenticatedVoiceMutationUser(client, userId);
  const reservedStorageObjectKey = buildScriptAudioStorageObjectKey({
    userId,
    scriptId: script.id,
    voiceId: selectedVoice.id,
    cacheKey,
    contentType: "application/octet-stream"
  });
  const scriptAudioWriterClient = createSupabaseAdminClient();
  const writeIntents = createVoiceAssetWriteIntentRepository(scriptAudioWriterClient);
  const reservation = await writeIntents.reserve({
    userId,
    kind: "script_audio_create",
    leaseToken: randomUUID(),
    leaseSeconds: 900,
    scriptId: script.id,
    voiceId: selectedVoice.id,
    cacheKey,
    storageBucket: SCRIPT_AUDIO_STORAGE_BUCKET,
    storageObjectKey: reservedStorageObjectKey
  });
  const provider = createConfiguredVoiceProvider();
  const quotaEvent: QuotaEventRef | null = await withNonBlockingQuotaEventWrite("record voice generation quota attempt", () =>
    recordVoiceQuotaEventAttempt({
      userId,
      scriptId: script.id,
      provider: selectedVoice.provider,
      providerModel: null,
      keys: quotaContext.keys,
      metadata: buildVoiceQuotaMetadata(quotaContext, {
        cacheLookupResult: "miss",
        cached: false
      }),
      billingStatus: selectedVoice.provider === "mock" ? "non_billable" : "not_evaluated"
    })
  );

  // Fixed replay boundary:
  // provider output is normalized into app-owned replay/storage before
  // script_audios points at the replay route reference.
  const synthesized = await (async () => {
    try {
      return await timeAsync("voice.speakScript.providerSynthesize", () => provider.synthesize({
        providerVoiceId: selectedVoice.provider_voice_id,
        text: script.content,
        locale: script.locale,
        voiceStylePreset
      }));
    } catch (error) {
      await markFailedVoiceQuotaEvent(quotaEvent, quotaContext, "provider_request");
      throw error;
    }
  })();
  const replayAsset = await (async () => {
    try {
      return await timeAsync("voice.speakScript.stageReplay", () => stageScriptAudioForReplay({
        storageClient: scriptAudioWriterClient,
        userId,
        scriptId: script.id,
        voiceId: selectedVoice.id,
        cacheKey,
        synthesized,
        reservedStorageObjectKey
      }));
    } catch (error) {
      await markFailedVoiceQuotaEvent(quotaEvent, quotaContext, "storage_staging", {
        providerRequestId: synthesized.providerRequestId
      });
      throw error;
    }
  })();

  let insertedAudio: ScriptAudioRow | null = null;
  try {
    const newAudio = await timeAsync("voice.speakScript.insertAudio", () =>
      writeIntents.finalizeScriptAudio({
        ...reservation,
        userId,
        provider: selectedVoice.provider,
        // script_audios stores the app-owned replay reference, not a provider URL.
        storagePath: replayAsset.storagePath,
        storedAsset: encodeStoredAssetMetadata(replayAsset.storedAsset),
        durationSeconds: null
      })
    );
    insertedAudio = await timeAsync("voice.speakScript.ensureInsertedPlaybackPath", () =>
      ensureServerOwnedScriptAudioPlaybackPath(client, userId, newAudio, voiceStylePreset)
    );
  } catch (error) {
    await markFailedVoiceQuotaEvent(quotaEvent, quotaContext, "cache_lookup", {
      replayAsset,
      providerRequestId: synthesized.providerRequestId,
      partial: true
    });

    throw error instanceof AppError
      ? error
      : mapVoiceError("見本音声キャッシュの保存", { message: error instanceof Error ? error.message : "" });
  }

  let storedAudio: ScriptAudioRow | null;

  try {
    storedAudio = await timeAsync("voice.speakScript.finalCacheLookup", () => getCachedScriptAudio(client, script.id, selectedVoice.id, cacheKey));
  } catch (error) {
    await markFailedVoiceQuotaEvent(quotaEvent, quotaContext, "cache_lookup", {
      replayAsset,
      providerRequestId: synthesized.providerRequestId,
      partial: true
    });
    throw error;
  }

  const completedAudio = storedAudio
    ? await timeAsync("voice.speakScript.ensureCompletedPlaybackPath", () =>
        ensureServerOwnedScriptAudioPlaybackPath(client, userId, storedAudio, voiceStylePreset)
      )
    : insertedAudio;
  const reusedGeneratedCache = didReuseGeneratedScriptAudioCache({
    insertSucceeded: Boolean(insertedAudio),
    finalCacheFound: Boolean(storedAudio)
  });
  const completedContext = {
    ...quotaContext,
    scriptAudioId: completedAudio?.id ?? null
  };

  if (completedAudio) {
    await withNonBlockingQuotaEventWrite("mark voice generation quota event succeeded", () =>
      markQuotaEventSucceeded(quotaEvent, {
        metadata: buildVoiceQuotaMetadata(completedContext, {
          cacheLookupResult: "miss",
          cached: reusedGeneratedCache,
          replayAsset
        }),
        providerRequestId: synthesized.providerRequestId,
        targetResourceId: completedAudio.id,
        billingStatus: selectedVoice.provider === "mock" ? "non_billable" : "billable_candidate"
      })
    );
  } else {
    await markFailedVoiceQuotaEvent(quotaEvent, completedContext, "cache_lookup", {
      replayAsset,
      providerRequestId: synthesized.providerRequestId,
      partial: true
    });
  }

    return {
      audioUrl: completedAudio?.storage_path ?? replayAsset.storagePath,
      cached: reusedGeneratedCache,
      cacheKey,
      voice: selectedVoice
    };
  });
}
