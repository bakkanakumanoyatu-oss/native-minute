import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { VOICE_STYLE_PRESETS, getVoiceStylePresetDefinition } from "@/lib/voice-style";
import type { AppSupabaseClient } from "@/lib/supabase/client";
import type { Database, Json } from "@/types/database";
import { decodeStoredAssetMetadata } from "@/services/voice/replay.service";
import { buildScriptAudioCacheKey } from "@/services/voice/cache";
import {
  AudioLibraryError,
  type AudioLibraryMetadata,
  type ReplaceSavedBestTakeEntrySlotInput,
  type ReplaceSavedModelAudioEntrySlotInput,
  type ReplaceSavedBestTakeSlotInput,
  type ReplaceSavedModelAudioSlotInput,
  type SaveBestTakeInput,
  type SaveModelAudioInput,
  type SavedBestTakeRow,
  type SavedModelAudioRow,
  type UpdateSavedBestTakeLabelInput,
  type UpdateSavedModelAudioLabelInput
} from "./types";

type ScriptRow = Database["public"]["Tables"]["scripts"]["Row"];
type ScriptAudioRow = Database["public"]["Tables"]["script_audios"]["Row"];
type VoiceRow = Database["public"]["Tables"]["voices"]["Row"];
type TakeRow = Database["public"]["Tables"]["takes"]["Row"];
type WeakWordRow = Database["public"]["Tables"]["weak_words"]["Row"];
type CoachFeedbackRow = Database["public"]["Tables"]["coach_feedback"]["Row"];
type SupabaseLike = Pick<AppSupabaseClient, "from">;
type PostgrestErrorLike = { message: string; code?: string };
type InsertSingleBuilder<TInsert, TRow> = {
  insert(values: TInsert): {
    select(columns?: string): {
      single(): Promise<{ data: TRow | null; error: PostgrestErrorLike | null }>;
    };
  };
};
type UpsertSingleBuilder<TInsert, TRow> = {
  upsert(values: TInsert, options: { onConflict: string }): {
    select(columns?: string): {
      single(): Promise<{ data: TRow | null; error: PostgrestErrorLike | null }>;
    };
  };
};
type UpdateSingleBuilder<TUpdate, TRow> = {
  update(values: TUpdate): {
    eq(column: string, value: string | number): ReturnType<UpdateSingleBuilder<TUpdate, TRow>["update"]>;
    select(columns?: string): {
      single(): Promise<{ data: TRow | null; error: PostgrestErrorLike | null }>;
    };
  };
};

const LIBRARY_SLOTS = [1, 2, 3, 4, 5] as const;
const MAX_LABEL_LENGTH = 80;

function asMaybeSingle<TRow>(value: unknown) {
  return value as { data: TRow | null; error: PostgrestErrorLike | null };
}

function asMany<TRow>(value: unknown) {
  return value as { data: TRow[] | null; error: PostgrestErrorLike | null };
}

function asSingle<TRow>(value: unknown) {
  return value as { data: TRow | null; error: PostgrestErrorLike | null };
}

function getAdminClient() {
  return createSupabaseAdminClient() as unknown as SupabaseLike;
}

function mapAudioLibraryDbError(operation: string, error: PostgrestErrorLike) {
  return new AudioLibraryError(500, "audio_library_write_failed", `${operation}に失敗しました。${error.message}`);
}

function assertValidSlot(slot: number) {
  if (!Number.isInteger(slot) || slot < 1 || slot > 5) {
    throw new AudioLibraryError(400, "invalid_slot", "保存 slot は 1〜5 の範囲で指定してください。");
  }
}

function normalizeLabel(label: string | undefined, fallback: string) {
  const normalized = label?.trim() || fallback;

  if (normalized.length > MAX_LABEL_LENGTH) {
    throw new AudioLibraryError(400, "label_too_long", `ラベルは ${MAX_LABEL_LENGTH} 文字以内にしてください。`);
  }

  return normalized;
}

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function compactMetadata(input: AudioLibraryMetadata): Json {
  const entries = Object.entries(input).filter(([, value]) => value !== undefined && value !== null);
  return Object.fromEntries(entries) as Json;
}

function findEmptySlot<T extends { slot: number }>(rows: T[]) {
  const used = new Set(rows.map((row) => row.slot));
  return LIBRARY_SLOTS.find((slot) => !used.has(slot)) ?? null;
}

async function getOwnedScript(client: SupabaseLike, userId: string, scriptId: string) {
  const { data, error } = asMaybeSingle<ScriptRow>(
    await client
      .from("scripts")
      .select("*")
      .eq("id", scriptId)
      .eq("user_id", userId)
      .maybeSingle()
  );

  if (error) {
    throw mapAudioLibraryDbError("script の確認", error);
  }

  if (!data) {
    throw new AudioLibraryError(404, "script_not_found", "保存対象の script が見つかりませんでした。");
  }

  return data;
}

async function getOwnedScriptAudio(client: SupabaseLike, userId: string, scriptId: string, scriptAudioId: string) {
  await getOwnedScript(client, userId, scriptId);

  const { data, error } = asMaybeSingle<ScriptAudioRow>(
    await client
      .from("script_audios")
      .select("*")
      .eq("id", scriptAudioId)
      .eq("script_id", scriptId)
      .maybeSingle()
  );

  if (error) {
    throw mapAudioLibraryDbError("見本音声の確認", error);
  }

  if (!data) {
    throw new AudioLibraryError(404, "script_audio_not_found", "保存対象の見本音声が見つかりませんでした。");
  }

  if (data.script_id !== scriptId) {
    throw new AudioLibraryError(403, "ownership_mismatch", "別の script の見本音声は保存できません。");
  }

  return data;
}

async function getOwnedTake(client: SupabaseLike, userId: string, scriptId: string, takeId: string) {
  await getOwnedScript(client, userId, scriptId);

  const { data, error } = asMaybeSingle<TakeRow>(
    await client
      .from("takes")
      .select("*")
      .eq("id", takeId)
      .eq("user_id", userId)
      .eq("script_id", scriptId)
      .maybeSingle()
  );

  if (error) {
    throw mapAudioLibraryDbError("録音結果の確認", error);
  }

  if (!data) {
    throw new AudioLibraryError(404, "take_not_found", "保存対象の録音結果が見つかりませんでした。");
  }

  return data;
}

async function getVoiceLabel(client: SupabaseLike, userId: string, voiceId: string | null) {
  if (!voiceId) {
    return null;
  }

  const { data, error } = asMaybeSingle<VoiceRow>(
    await client
      .from("voices")
      .select("*")
      .eq("id", voiceId)
      .eq("user_id", userId)
      .maybeSingle()
  );

  if (error) {
    throw mapAudioLibraryDbError("voice label の確認", error);
  }

  return data?.label ?? null;
}

async function buildModelAudioMetadata(client: SupabaseLike, userId: string, scriptAudio: ScriptAudioRow) {
  const storedAsset = decodeStoredAssetMetadata(scriptAudio.stored_asset);
  const cacheKeyHash = hashValue(scriptAudio.cache_key);
  const [script, voiceLabel] = await Promise.all([
    getOwnedScript(client, userId, scriptAudio.script_id),
    getVoiceLabel(client, userId, scriptAudio.voice_id)
  ]);
  const voiceStylePreset = inferVoiceStylePreset(scriptAudio, script);
  const voiceStyleDefinition = voiceStylePreset ? getVoiceStylePresetDefinition(voiceStylePreset) : null;

  return compactMetadata({
    provider: scriptAudio.provider,
    voice_id: scriptAudio.voice_id,
    voice_label: voiceLabel,
    voice_style_preset: voiceStylePreset,
    voice_style_label: voiceStyleDefinition?.label ?? null,
    target_speed: voiceStyleDefinition?.targetSpeed ?? null,
    target_wpm: voiceStyleDefinition?.targetWpm ?? null,
    pause_density: voiceStyleDefinition?.pauseDensity ?? null,
    cache_key_hash: cacheKeyHash,
    cache_key_prefix: scriptAudio.cache_key.slice(0, 16),
    generated_at: scriptAudio.created_at,
    content_type: storedAsset?.contentType ?? null,
    byte_length: storedAsset?.byteLength ?? null
  });
}

function inferVoiceStylePreset(scriptAudio: ScriptAudioRow, script: ScriptRow) {
  if (!scriptAudio.voice_id) {
    return null;
  }

  const matchedPreset = VOICE_STYLE_PRESETS.find((preset) => {
    const candidateCacheKey = buildScriptAudioCacheKey({
      provider: scriptAudio.provider,
      voiceId: scriptAudio.voice_id ?? "",
      scriptLocale: script.locale,
      voiceStylePreset: preset,
      scriptContent: script.content
    });

    return candidateCacheKey === scriptAudio.cache_key;
  });

  return matchedPreset ?? null;
}

async function buildBestTakeMetadata(client: SupabaseLike, take: TakeRow) {
  const [weakWordsResult, coachFeedbackResult] = await Promise.all([
      client
        .from("weak_words")
        .select("*")
        .eq("take_id", take.id),
      client
        .from("coach_feedback")
        .select("*")
        .eq("take_id", take.id)
        .maybeSingle()
  ]);
  const { data: weakWords, error: weakWordsError } = asMany<WeakWordRow>(weakWordsResult);
  const { data: coachFeedback, error: coachFeedbackError } = asMaybeSingle<CoachFeedbackRow>(coachFeedbackResult);

  if (weakWordsError) {
    throw mapAudioLibraryDbError("weak words の確認", weakWordsError);
  }

  if (coachFeedbackError) {
    throw mapAudioLibraryDbError("coach feedback の確認", coachFeedbackError);
  }

  const focusWords = Array.isArray(coachFeedback?.focus_words) ? coachFeedback.focus_words : [];

  return compactMetadata({
    score: take.score,
    accuracy_score: take.accuracy_score,
    fluency_score: take.fluency_score,
    rhythm_score: take.rhythm_score,
    duration_seconds: take.duration_seconds,
    reviewed_at: take.reviewed_at,
    weak_word_count: weakWords?.length ?? 0,
    focus_word_count: focusWords.filter((word) => typeof word === "string" && word.trim()).length
  });
}

async function listSavedModelAudioRows(client: SupabaseLike, userId: string, scriptId: string) {
  const { data, error } = asMany<SavedModelAudioRow>(
    await client
      .from("script_saved_model_audios")
      .select("*")
      .eq("user_id", userId)
      .eq("script_id", scriptId)
      .order("slot", { ascending: true })
  );

  if (error) {
    throw mapAudioLibraryDbError("保存済み見本音声の取得", error);
  }

  return data ?? [];
}

async function listSavedBestTakeRows(client: SupabaseLike, userId: string, scriptId: string) {
  const { data, error } = asMany<SavedBestTakeRow>(
    await client
      .from("script_saved_best_takes")
      .select("*")
      .eq("user_id", userId)
      .eq("script_id", scriptId)
      .order("slot", { ascending: true })
  );

  if (error) {
    throw mapAudioLibraryDbError("保存済みベスト録音の取得", error);
  }

  return data ?? [];
}

async function findSavedModelAudioByTarget(client: SupabaseLike, userId: string, scriptId: string, scriptAudioId: string) {
  const { data, error } = asMaybeSingle<SavedModelAudioRow>(
    await client
      .from("script_saved_model_audios")
      .select("*")
      .eq("user_id", userId)
      .eq("script_id", scriptId)
      .eq("script_audio_id", scriptAudioId)
      .maybeSingle()
  );

  if (error) {
    throw mapAudioLibraryDbError("保存済み見本音声の確認", error);
  }

  return data;
}

async function findSavedBestTakeByTarget(client: SupabaseLike, userId: string, scriptId: string, takeId: string) {
  const { data, error } = asMaybeSingle<SavedBestTakeRow>(
    await client
      .from("script_saved_best_takes")
      .select("*")
      .eq("user_id", userId)
      .eq("script_id", scriptId)
      .eq("take_id", takeId)
      .maybeSingle()
  );

  if (error) {
    throw mapAudioLibraryDbError("保存済みベスト録音の確認", error);
  }

  return data;
}

async function findSavedModelAudioBySlot(client: SupabaseLike, userId: string, scriptId: string, slot: number) {
  const { data, error } = asMaybeSingle<SavedModelAudioRow>(
    await client
      .from("script_saved_model_audios")
      .select("*")
      .eq("user_id", userId)
      .eq("script_id", scriptId)
      .eq("slot", slot)
      .maybeSingle()
  );

  if (error) {
    throw mapAudioLibraryDbError("保存 slot の確認", error);
  }

  return data;
}

async function getSavedModelAudioEntry(
  client: SupabaseLike,
  userId: string,
  scriptId: string,
  savedModelAudioId: string
) {
  await getOwnedScript(client, userId, scriptId);

  const { data, error } = asMaybeSingle<SavedModelAudioRow>(
    await client
      .from("script_saved_model_audios")
      .select("*")
      .eq("id", savedModelAudioId)
      .eq("user_id", userId)
      .eq("script_id", scriptId)
      .maybeSingle()
  );

  if (error) {
    throw mapAudioLibraryDbError("保存済み見本音声の確認", error);
  }

  if (!data) {
    throw new AudioLibraryError(404, "saved_entry_not_found", "保存済み見本音声が見つかりませんでした。");
  }

  return data;
}

async function findSavedBestTakeBySlot(client: SupabaseLike, userId: string, scriptId: string, slot: number) {
  const { data, error } = asMaybeSingle<SavedBestTakeRow>(
    await client
      .from("script_saved_best_takes")
      .select("*")
      .eq("user_id", userId)
      .eq("script_id", scriptId)
      .eq("slot", slot)
      .maybeSingle()
  );

  if (error) {
    throw mapAudioLibraryDbError("保存 slot の確認", error);
  }

  return data;
}

async function getSavedBestTakeEntry(
  client: SupabaseLike,
  userId: string,
  scriptId: string,
  savedBestTakeId: string
) {
  await getOwnedScript(client, userId, scriptId);

  const { data, error } = asMaybeSingle<SavedBestTakeRow>(
    await client
      .from("script_saved_best_takes")
      .select("*")
      .eq("id", savedBestTakeId)
      .eq("user_id", userId)
      .eq("script_id", scriptId)
      .maybeSingle()
  );

  if (error) {
    throw mapAudioLibraryDbError("保存済みベスト録音の確認", error);
  }

  if (!data) {
    throw new AudioLibraryError(404, "saved_entry_not_found", "保存済みベスト録音が見つかりませんでした。");
  }

  return data;
}

async function insertSavedModelAudio(
  client: SupabaseLike,
  values: Database["public"]["Tables"]["script_saved_model_audios"]["Insert"]
) {
  const savedModelAudios = client.from("script_saved_model_audios") as unknown as InsertSingleBuilder<
    Database["public"]["Tables"]["script_saved_model_audios"]["Insert"],
    SavedModelAudioRow
  >;
  const { data, error } = asSingle<SavedModelAudioRow>(
    await savedModelAudios
      .insert(values)
      .select("*")
      .single()
  );

  if (error) {
    throw mapAudioLibraryDbError("見本音声の保存", error);
  }

  if (!data) {
    throw new AudioLibraryError(500, "audio_library_write_failed", "保存済み見本音声の作成結果が返りませんでした。");
  }

  return data;
}

async function insertSavedBestTake(
  client: SupabaseLike,
  values: Database["public"]["Tables"]["script_saved_best_takes"]["Insert"]
) {
  const savedBestTakes = client.from("script_saved_best_takes") as unknown as InsertSingleBuilder<
    Database["public"]["Tables"]["script_saved_best_takes"]["Insert"],
    SavedBestTakeRow
  >;
  const { data, error } = asSingle<SavedBestTakeRow>(
    await savedBestTakes
      .insert(values)
      .select("*")
      .single()
  );

  if (error) {
    throw mapAudioLibraryDbError("ベスト録音の保存", error);
  }

  if (!data) {
    throw new AudioLibraryError(500, "audio_library_write_failed", "保存済みベスト録音の作成結果が返りませんでした。");
  }

  return data;
}

async function upsertSavedModelAudioBySlot(
  client: SupabaseLike,
  values: Database["public"]["Tables"]["script_saved_model_audios"]["Insert"]
) {
  const savedModelAudios = client.from("script_saved_model_audios") as unknown as UpsertSingleBuilder<
    Database["public"]["Tables"]["script_saved_model_audios"]["Insert"],
    SavedModelAudioRow
  >;
  const { data, error } = asSingle<SavedModelAudioRow>(
    await savedModelAudios
      .upsert(values, { onConflict: "user_id,script_id,slot" })
      .select("*")
      .single()
  );

  if (error) {
    throw mapAudioLibraryDbError("見本音声 slot の入れ替え", error);
  }

  if (!data) {
    throw new AudioLibraryError(500, "audio_library_write_failed", "保存済み見本音声の入れ替え結果が返りませんでした。");
  }

  return data;
}

async function updateSavedModelAudioById(
  client: SupabaseLike,
  userId: string,
  scriptId: string,
  savedModelAudioId: string,
  values: Database["public"]["Tables"]["script_saved_model_audios"]["Update"]
) {
  const savedModelAudios = client.from("script_saved_model_audios") as unknown as UpdateSingleBuilder<
    Database["public"]["Tables"]["script_saved_model_audios"]["Update"],
    SavedModelAudioRow
  >;
  const { data, error } = asSingle<SavedModelAudioRow>(
    await savedModelAudios
      .update(values)
      .eq("id", savedModelAudioId)
      .eq("user_id", userId)
      .eq("script_id", scriptId)
      .select("*")
      .single()
  );

  if (error) {
    throw mapAudioLibraryDbError("保存済み見本音声の更新", error);
  }

  if (!data) {
    throw new AudioLibraryError(500, "audio_library_write_failed", "保存済み見本音声の更新結果が返りませんでした。");
  }

  return data;
}

async function upsertSavedBestTakeBySlot(
  client: SupabaseLike,
  values: Database["public"]["Tables"]["script_saved_best_takes"]["Insert"]
) {
  const savedBestTakes = client.from("script_saved_best_takes") as unknown as UpsertSingleBuilder<
    Database["public"]["Tables"]["script_saved_best_takes"]["Insert"],
    SavedBestTakeRow
  >;
  const { data, error } = asSingle<SavedBestTakeRow>(
    await savedBestTakes
      .upsert(values, { onConflict: "user_id,script_id,slot" })
      .select("*")
      .single()
  );

  if (error) {
    throw mapAudioLibraryDbError("ベスト録音 slot の入れ替え", error);
  }

  if (!data) {
    throw new AudioLibraryError(500, "audio_library_write_failed", "保存済みベスト録音の入れ替え結果が返りませんでした。");
  }

  return data;
}

async function updateSavedBestTakeById(
  client: SupabaseLike,
  userId: string,
  scriptId: string,
  savedBestTakeId: string,
  values: Database["public"]["Tables"]["script_saved_best_takes"]["Update"]
) {
  const savedBestTakes = client.from("script_saved_best_takes") as unknown as UpdateSingleBuilder<
    Database["public"]["Tables"]["script_saved_best_takes"]["Update"],
    SavedBestTakeRow
  >;
  const { data, error } = asSingle<SavedBestTakeRow>(
    await savedBestTakes
      .update(values)
      .eq("id", savedBestTakeId)
      .eq("user_id", userId)
      .eq("script_id", scriptId)
      .select("*")
      .single()
  );

  if (error) {
    throw mapAudioLibraryDbError("保存済みベスト録音の更新", error);
  }

  if (!data) {
    throw new AudioLibraryError(500, "audio_library_write_failed", "保存済みベスト録音の更新結果が返りませんでした。");
  }

  return data;
}

export async function listSavedModelAudios(client: AppSupabaseClient, userId: string, scriptId: string) {
  await getOwnedScript(client, userId, scriptId);
  return listSavedModelAudioRows(client, userId, scriptId);
}

export async function saveModelAudio(client: AppSupabaseClient, userId: string, input: SaveModelAudioInput) {
  const scriptAudio = await getOwnedScriptAudio(client, userId, input.scriptId, input.scriptAudioId);
  const admin = getAdminClient();
  const existing = await findSavedModelAudioByTarget(admin, userId, input.scriptId, input.scriptAudioId);

  if (existing) {
    return existing;
  }

  const rows = await listSavedModelAudioRows(admin, userId, input.scriptId);
  const slot = input.slot ?? findEmptySlot(rows);

  if (!slot) {
    throw new AudioLibraryError(409, "library_full", "保存済み見本音声は最大 5 件です。入れ替える音声を選んでください。");
  }

  assertValidSlot(slot);

  if (await findSavedModelAudioBySlot(admin, userId, input.scriptId, slot)) {
    throw new AudioLibraryError(409, "slot_occupied", "この slot にはすでに保存済み見本音声があります。入れ替え操作を使ってください。");
  }

  return insertSavedModelAudio(admin, {
    user_id: userId,
    script_id: input.scriptId,
    script_audio_id: input.scriptAudioId,
    slot,
    label: normalizeLabel(input.label, `見本音声 ${slot}`),
    source: "listen",
    metadata: await buildModelAudioMetadata(client, userId, scriptAudio)
  });
}

export async function replaceSavedModelAudioSlot(
  client: AppSupabaseClient,
  userId: string,
  input: ReplaceSavedModelAudioSlotInput
) {
  assertValidSlot(input.slot);
  const scriptAudio = await getOwnedScriptAudio(client, userId, input.scriptId, input.scriptAudioId);
  const admin = getAdminClient();
  const existing = await findSavedModelAudioByTarget(admin, userId, input.scriptId, input.scriptAudioId);

  if (existing && existing.slot !== input.slot) {
    throw new AudioLibraryError(409, "already_saved", "この見本音声は別の slot に保存済みです。先に保存解除してください。");
  }

  return upsertSavedModelAudioBySlot(admin, {
    user_id: userId,
    script_id: input.scriptId,
    script_audio_id: input.scriptAudioId,
    slot: input.slot,
    label: normalizeLabel(input.label, `見本音声 ${input.slot}`),
    source: "listen",
    metadata: await buildModelAudioMetadata(client, userId, scriptAudio),
    saved_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
}

export async function replaceSavedModelAudioEntrySlot(
  client: AppSupabaseClient,
  userId: string,
  input: ReplaceSavedModelAudioEntrySlotInput
) {
  assertValidSlot(input.slot);
  const entry = await getSavedModelAudioEntry(client, userId, input.scriptId, input.savedModelAudioId);

  if (entry.slot !== input.slot) {
    throw new AudioLibraryError(400, "invalid_slot", "入れ替える slot は現在の保存 slot と一致している必要があります。");
  }

  return replaceSavedModelAudioSlot(client, userId, {
    scriptId: input.scriptId,
    scriptAudioId: input.scriptAudioId,
    slot: input.slot,
    label: input.label
  });
}

export async function updateSavedModelAudioLabel(
  client: AppSupabaseClient,
  userId: string,
  input: UpdateSavedModelAudioLabelInput
) {
  await getSavedModelAudioEntry(client, userId, input.scriptId, input.savedModelAudioId);
  const admin = getAdminClient();

  return updateSavedModelAudioById(admin, userId, input.scriptId, input.savedModelAudioId, {
    label: normalizeLabel(input.label, "保存済み見本音声"),
    updated_at: new Date().toISOString()
  });
}

export async function unsaveModelAudio(
  client: AppSupabaseClient,
  userId: string,
  scriptId: string,
  savedModelAudioId: string
) {
  await getSavedModelAudioEntry(client, userId, scriptId, savedModelAudioId);
  const admin = getAdminClient();
  const { data, error } = asMaybeSingle<SavedModelAudioRow>(
    await admin
      .from("script_saved_model_audios")
      .delete()
      .eq("id", savedModelAudioId)
      .eq("user_id", userId)
      .eq("script_id", scriptId)
      .select("*")
      .maybeSingle()
  );

  if (error) {
    throw mapAudioLibraryDbError("見本音声の保存解除", error);
  }

  if (!data) {
    throw new AudioLibraryError(404, "saved_entry_not_found", "保存済み見本音声が見つかりませんでした。");
  }

  return data;
}

export async function listSavedBestTakes(client: AppSupabaseClient, userId: string, scriptId: string) {
  await getOwnedScript(client, userId, scriptId);
  return listSavedBestTakeRows(client, userId, scriptId);
}

export async function saveBestTake(client: AppSupabaseClient, userId: string, input: SaveBestTakeInput) {
  const take = await getOwnedTake(client, userId, input.scriptId, input.takeId);
  const admin = getAdminClient();
  const existing = await findSavedBestTakeByTarget(admin, userId, input.scriptId, input.takeId);

  if (existing) {
    return existing;
  }

  const rows = await listSavedBestTakeRows(admin, userId, input.scriptId);
  const slot = input.slot ?? findEmptySlot(rows);

  if (!slot) {
    throw new AudioLibraryError(409, "library_full", "保存済みベスト録音は最大 5 件です。入れ替える録音を選んでください。");
  }

  assertValidSlot(slot);

  if (await findSavedBestTakeBySlot(admin, userId, input.scriptId, slot)) {
    throw new AudioLibraryError(409, "slot_occupied", "この slot にはすでに保存済みベスト録音があります。入れ替え操作を使ってください。");
  }

  return insertSavedBestTake(admin, {
    user_id: userId,
    script_id: input.scriptId,
    take_id: input.takeId,
    slot,
    label: normalizeLabel(input.label, `ベスト録音 ${slot}`),
    source: "review",
    metadata: await buildBestTakeMetadata(client, take)
  });
}

export async function replaceSavedBestTakeSlot(
  client: AppSupabaseClient,
  userId: string,
  input: ReplaceSavedBestTakeSlotInput
) {
  assertValidSlot(input.slot);
  const take = await getOwnedTake(client, userId, input.scriptId, input.takeId);
  const admin = getAdminClient();
  const existing = await findSavedBestTakeByTarget(admin, userId, input.scriptId, input.takeId);

  if (existing && existing.slot !== input.slot) {
    throw new AudioLibraryError(409, "already_saved", "この録音は別の slot に保存済みです。先に保存解除してください。");
  }

  return upsertSavedBestTakeBySlot(admin, {
    user_id: userId,
    script_id: input.scriptId,
    take_id: input.takeId,
    slot: input.slot,
    label: normalizeLabel(input.label, `ベスト録音 ${input.slot}`),
    source: "review",
    metadata: await buildBestTakeMetadata(client, take),
    saved_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
}

export async function replaceSavedBestTakeEntrySlot(
  client: AppSupabaseClient,
  userId: string,
  input: ReplaceSavedBestTakeEntrySlotInput
) {
  assertValidSlot(input.slot);
  const entry = await getSavedBestTakeEntry(client, userId, input.scriptId, input.savedBestTakeId);

  if (entry.slot !== input.slot) {
    throw new AudioLibraryError(400, "invalid_slot", "入れ替える slot は現在の保存 slot と一致している必要があります。");
  }

  return replaceSavedBestTakeSlot(client, userId, {
    scriptId: input.scriptId,
    takeId: input.takeId,
    slot: input.slot,
    label: input.label
  });
}

export async function updateSavedBestTakeLabel(
  client: AppSupabaseClient,
  userId: string,
  input: UpdateSavedBestTakeLabelInput
) {
  await getSavedBestTakeEntry(client, userId, input.scriptId, input.savedBestTakeId);
  const admin = getAdminClient();

  return updateSavedBestTakeById(admin, userId, input.scriptId, input.savedBestTakeId, {
    label: normalizeLabel(input.label, "保存済みベスト録音"),
    updated_at: new Date().toISOString()
  });
}

export async function unsaveBestTake(
  client: AppSupabaseClient,
  userId: string,
  scriptId: string,
  savedBestTakeId: string
) {
  await getSavedBestTakeEntry(client, userId, scriptId, savedBestTakeId);
  const admin = getAdminClient();
  const { data, error } = asMaybeSingle<SavedBestTakeRow>(
    await admin
      .from("script_saved_best_takes")
      .delete()
      .eq("id", savedBestTakeId)
      .eq("user_id", userId)
      .eq("script_id", scriptId)
      .select("*")
      .maybeSingle()
  );

  if (error) {
    throw mapAudioLibraryDbError("ベスト録音の保存解除", error);
  }

  if (!data) {
    throw new AudioLibraryError(404, "saved_entry_not_found", "保存済みベスト録音が見つかりませんでした。");
  }

  return data;
}
