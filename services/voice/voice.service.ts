import { AppError } from "@/lib/errors";
import { timeAsync } from "@/lib/performance/timing";
import { DEFAULT_VOICE_STYLE_PRESET } from "@/lib/voice-style";
import { buildScriptAudioPlaybackPath } from "@/lib/voice-playback-path";
import type { AppSupabaseClient } from "@/lib/supabase/client";
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
import {
  decodeStoredAssetMetadata,
  encodeStoredAssetMetadata,
  stageScriptAudioForReplay,
  type ScriptAudioReplayAsset
} from "./replay.service";

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

type VoicesUpdateBuilder = {
  eq(column: "user_id" | "is_default", value: string | boolean): VoicesUpdateBuilder;
  neq(column: "id", value: string): Promise<{ error: PostgrestErrorLike | null }>;
};

function asMaybeSingle<TRow>(value: unknown) {
  return value as { data: TRow | null; error: PostgrestErrorLike | null };
}

function asMany<TRow>(value: unknown) {
  return value as { data: TRow[] | null; error: PostgrestErrorLike | null };
}

function mapVoiceError(operation: string, error: PostgrestErrorLike) {
  return new AppError(500, `${operation}に失敗しました。${error.message}`);
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

export async function getVoiceSetupState(client: AppSupabaseClient, userId: string) {
  return timeAsync("voice.setupState", async () => {
    const providerStatus = getVoiceProviderStatus();
    const [consent, voices] = await Promise.all([
      getLatestConsent(client, userId, providerStatus.provider),
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

async function saveVoiceRecord(
  client: AppSupabaseClient,
  userId: string,
  consent: VoiceConsentRow,
  providerVoiceId: string,
  input: {
    label: string;
    sampleAudioPath: string | null;
  }
) {
  const voices = client.from("voices") as unknown as InsertSingleBuilder<
    Database["public"]["Tables"]["voices"]["Insert"],
    VoiceRow
  >;

  const { data, error } = await voices
    .insert({
      user_id: userId,
      provider: consent.provider,
      consent_id: consent.id,
      provider_voice_id: providerVoiceId,
      label: input.label,
      sample_audio_path: input.sampleAudioPath,
      is_default: true
    })
    .select("*")
    .single();

  if (error) {
    throw mapVoiceError("voice の保存", error);
  }

  const voicesTable = client.from("voices") as unknown as {
    update(values: Database["public"]["Tables"]["voices"]["Update"]): VoicesUpdateBuilder;
  };

  const { error: unsetError } = await voicesTable
    .update({ is_default: false })
    .eq("user_id", userId)
    .eq("is_default", true)
    .neq("id", data.id);

  if (unsetError) {
    throw mapVoiceError("default voice の更新", unsetError);
  }

  return data;
}

export async function createUserVoice(client: AppSupabaseClient, userId: string, input: CreateVoiceRequestInput) {
  const providerStatus = getVoiceProviderStatus();

  if (!providerStatus.supported) {
    throw new AppError(503, providerStatus.message ?? `VOICE_PROVIDER=${providerStatus.provider} は current repo では利用できません。`);
  }

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

  return saveVoiceRecord(client, userId, consent, created.providerVoiceId, {
    label: input.label,
    sampleAudioPath: resolvedSampleAudio?.audioPath ?? (trimmedSampleAudioPath || null)
  });
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

async function insertScriptAudio(
  client: AppSupabaseClient,
  values: Database["public"]["Tables"]["script_audios"]["Insert"]
) {
  const scriptAudios = client.from("script_audios") as unknown as InsertSingleBuilder<
    Database["public"]["Tables"]["script_audios"]["Insert"],
    ScriptAudioRow
  >;

  const { data, error } = await scriptAudios
    .insert(values)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function ensureScriptAudioPlaybackPath(client: AppSupabaseClient, scriptAudio: ScriptAudioRow) {
  const playbackPath = buildScriptAudioPlaybackPath(scriptAudio.id);

  if (scriptAudio.storage_path === playbackPath) {
    return scriptAudio;
  }

  const scriptAudios = client.from("script_audios") as unknown as UpdateSingleBuilder<
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
    throw error;
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

    const playableAudio = await timeAsync("voice.cachedListenAudio.ensurePlaybackPath", () => ensureScriptAudioPlaybackPath(client, cachedAudio));

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

    if (!providerStatus.supported) {
      await recordSkippedVoiceQuotaEvent(
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
        "provider_config"
      );

      throw new AppError(503, providerStatus.message ?? `VOICE_PROVIDER=${providerStatus.provider} は current repo では利用できません。`);
    }

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
    const playableAudio = await timeAsync("voice.speakScript.ensurePlaybackPath", () => ensureScriptAudioPlaybackPath(client, cachedAudio));

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
        client,
        userId,
        scriptId: script.id,
        voiceId: selectedVoice.id,
        cacheKey,
        synthesized
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
    const newAudio = await timeAsync("voice.speakScript.insertAudio", () => insertScriptAudio(client, {
      script_id: script.id,
      voice_id: selectedVoice.id,
      provider: selectedVoice.provider,
      cache_key: cacheKey,
      // script_audios stores the app-owned replay reference, not a provider URL.
      storage_path: replayAsset.storagePath,
      stored_asset: encodeStoredAssetMetadata(replayAsset.storedAsset),
      duration_seconds: null
    }));
    insertedAudio = await timeAsync("voice.speakScript.ensureInsertedPlaybackPath", () => ensureScriptAudioPlaybackPath(client, newAudio));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";

    if (!message.includes("duplicate") && !message.includes("unique")) {
      await markFailedVoiceQuotaEvent(quotaEvent, quotaContext, "cache_lookup", {
        replayAsset,
        providerRequestId: synthesized.providerRequestId,
        partial: true
      });

      throw mapVoiceError("見本音声キャッシュの保存", { message });
    }
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

  const completedAudio = storedAudio ? await timeAsync("voice.speakScript.ensureCompletedPlaybackPath", () => ensureScriptAudioPlaybackPath(client, storedAudio)) : insertedAudio;
  const completedContext = {
    ...quotaContext,
    scriptAudioId: completedAudio?.id ?? null
  };

  if (completedAudio) {
    await withNonBlockingQuotaEventWrite("mark voice generation quota event succeeded", () =>
      markQuotaEventSucceeded(quotaEvent, {
        metadata: buildVoiceQuotaMetadata(completedContext, {
          cacheLookupResult: "miss",
          cached: Boolean(storedAudio),
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
      cached: Boolean(storedAudio),
      cacheKey,
      voice: selectedVoice
    };
  });
}
