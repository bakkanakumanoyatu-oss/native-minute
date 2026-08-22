import { createHash } from "node:crypto";
import { AppError } from "@/lib/errors";
import type { AppSupabaseClient } from "@/lib/supabase/client";
import { VOICE_CONSENTS_BUCKET, VOICE_SAMPLES_BUCKET } from "@/services/storage/constants";
import { parseVoiceConsentRecordingReference } from "@/services/storage/voice-consent-storage.service";
import { parseVoiceSampleAudioReference } from "@/services/storage/voice-sample-storage.service";
import { decodeStoredAssetMetadata } from "@/services/voice/replay.service";
import { SCRIPT_AUDIO_STORAGE_BUCKET } from "@/services/voice/replay-storage";
import type { Database, Json } from "@/types/database";

type VoiceRow = Database["public"]["Tables"]["voices"]["Row"];
type ScriptRow = Database["public"]["Tables"]["scripts"]["Row"];
type ScriptAudioRow = Database["public"]["Tables"]["script_audios"]["Row"];
type SavedModelAudioRow = Database["public"]["Tables"]["script_saved_model_audios"]["Row"];
type VoiceConsentRow = Database["public"]["Tables"]["voice_consents"]["Row"];
type ProcessingConsentRow = Database["public"]["Tables"]["processing_consents"]["Row"];

type ReadClient = Pick<AppSupabaseClient, "from" | "storage">;
type PostgrestErrorLike = { message: string };
type StorageListItem = { name: string; id?: string | null };

const VOICE_ONLY_PROVIDER = "elevenlabs";
const SNAPSHOT_VERSION = "g5c-a.voice-only.v1";
const STORAGE_LIST_PAGE_SIZE = 1000;
const MAX_STORAGE_LIST_DEPTH = 4;

/**
 * Operation status deliberately excludes target-only terminal states.  A future
 * persisted operation may finish only after each target is deleted or independently
 * verified absent.
 */
export type VoiceOnlyDeletionOperationStatus =
  | "pending"
  | "processing"
  | "failed"
  | "manual_required"
  | "completed";

/** A resource target is tracked independently from the operation as a whole. */
export type VoiceOnlyDeletionTargetStatus =
  | "pending"
  | "processing"
  | "deleted"
  | "verified_absent"
  | "failed"
  | "manual_required";

export type VoiceOnlyDeletionStorageTarget = {
  bucket: "voice-samples" | "voice-consents" | "script-audios";
  objectKey: string;
  source: "voice_sample" | "consent_recording" | "script_audio";
  status: VoiceOnlyDeletionTargetStatus;
};

export type VoiceOnlyDeletionManualCandidateReason =
  | "voice_provider_reference_missing"
  | "voice_sample_reference_invalid"
  | "consent_recording_reference_invalid"
  | "target_script_audio_missing_stored_asset"
  | "target_script_audio_storage_attribution_invalid"
  | "script_audio_voice_id_missing"
  | "script_audio_voice_attribution_unknown"
  | "script_audio_provider_attribution_unknown"
  | "storage_object_unattributed"
  | "storage_listing_unavailable"
  | "storage_listing_truncated";

type VoiceOnlyDeletionManualCandidate = {
  reason: VoiceOnlyDeletionManualCandidateReason;
  source: "voice" | "voice_consent" | "script_audio" | "storage";
};

type VoiceOnlyDeletionTargetVoice = {
  appVoiceId: string;
  providerVoiceId: string | null;
  consentId: string | null;
  isDefault: boolean;
  status: VoiceOnlyDeletionTargetStatus;
};

type VoiceOnlyDeletionTargetScriptAudio = {
  scriptAudioId: string;
  scriptId: string;
  appVoiceId: string;
  status: VoiceOnlyDeletionTargetStatus;
};

type VoiceOnlyDeletionTargetSavedModelAudio = {
  savedModelAudioId: string;
  scriptId: string;
  scriptAudioId: string;
  status: VoiceOnlyDeletionTargetStatus;
};

type VoiceOnlyDeletionCanonicalConsent = {
  consentId: string | null;
  status: "active" | "withdrawn" | "not_found";
};

type StorageListing = {
  bucket: "voice-samples" | "voice-consents" | "script-audios";
  status: "available" | "truncated" | "unavailable";
  objectKeys: string[];
};

/**
 * Internal-only, serializable target snapshot. It intentionally carries raw identifiers
 * required by a future server-side cleanup/reconciliation runner and must never be sent
 * to a browser, mobile client, logs, or support tooling.
 */
export type VoiceOnlyDeletionSnapshot = {
  version: typeof SNAPSHOT_VERSION;
  fingerprint: string;
  userId: string;
  operation: { status: VoiceOnlyDeletionOperationStatus };
  targets: {
    voices: VoiceOnlyDeletionTargetVoice[];
    scriptAudios: VoiceOnlyDeletionTargetScriptAudio[];
    savedModelAudios: VoiceOnlyDeletionTargetSavedModelAudio[];
    storageObjects: VoiceOnlyDeletionStorageTarget[];
    canonicalVoiceCloningConsent: VoiceOnlyDeletionCanonicalConsent;
  };
  manualCandidates: VoiceOnlyDeletionManualCandidate[];
  storageListings: StorageListing[];
};

export const VOICE_ONLY_DELETION_RETAINED_CATEGORIES = [
  "account",
  "auth_session",
  "profiles",
  "scripts",
  "recordings",
  "practice_recordings",
  "takes",
  "transcripts",
  "scores",
  "weak_words",
  "coach_feedback",
  "latest",
  "best",
  "progress",
  "script_saved_best_takes"
] as const;

export type VoiceOnlyDeletionRetainedCategory = (typeof VOICE_ONLY_DELETION_RETAINED_CATEGORIES)[number];

export type VoiceOnlyDeletionDryRun = {
  operation: {
    status: "pending";
    mode: "dry_run";
    destructiveActionsCalled: false;
  };
  targetCounts: {
    appVoices: number;
    providerVoices: number;
    defaultVoiceBindings: number;
    voiceSamples: number;
    consentRecordings: number;
    scriptAudios: number;
    savedModelAudioReferences: number;
    storageObjects: number;
  };
  retained: Record<VoiceOnlyDeletionRetainedCategory, true>;
  review: {
    manualRequiredCandidateCount: number;
    unknownOrLegacyCandidateCount: number;
    storageListingUnavailableCount: number;
    storageListingTruncatedCount: number;
  };
  postDeleteVerifier: {
    ready: true;
    providerAbsenceRequiresIndependentReconciliation: true;
    canonicalConsentWithdrawalExpectedInFutureExecution: true;
  };
  notes: string[];
};

export type VoiceOnlyPostDeleteVerification = {
  snapshotFingerprint: string;
  status: "not_run" | "manual_required" | "verified";
  providerVoiceAbsence: "not_checked" | "manual_required" | "verified_absent";
  applicationBindings: {
    currentElevenLabsVoicesRemaining: number;
    targetVoicesRemaining: number;
    defaultVoiceBindingsRemaining: number;
    targetScriptAudiosRemaining: number;
    savedModelAudioReferencesRemaining: number;
  };
  storage: {
    targetedObjectsRemaining: number;
    listingsUnavailable: number;
  };
  consent: {
    currentVoiceCloningConsent: "active" | "withdrawn" | "not_found";
    expectedAfterFutureExecution: "withdrawn";
  };
  preservation: Record<VoiceOnlyDeletionRetainedCategory, "not_checked">;
  notes: string[];
};

function asMany<TRow>(value: unknown) {
  return value as { data: TRow[] | null; error: PostgrestErrorLike | null };
}

function asMaybeSingle<TRow>(value: unknown) {
  return value as { data: TRow | null; error: PostgrestErrorLike | null };
}

function asStorageList(value: unknown) {
  return value as { data: StorageListItem[] | null; error: PostgrestErrorLike | null };
}

function throwReadFailure(subject: string, error: PostgrestErrorLike | null) {
  if (error) {
    throw new AppError(500, `${subject}の確認に失敗しました。`);
  }
}

function isJsonObject(value: Json): value is Record<string, Json | undefined> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getConsentRecordingReference(metadata: Json) {
  if (!isJsonObject(metadata)) {
    return null;
  }

  const recording = metadata.recording;
  if (!recording || !isJsonObject(recording)) {
    return null;
  }

  const audioPath = recording.audioPath;
  return typeof audioPath === "string" ? audioPath : null;
}

function hasOwnedPrefix(userId: string, objectKey: string) {
  return objectKey.startsWith(`${userId}/`);
}

function hasOwnedSamplePrefix(userId: string, consentId: string | null, objectKey: string) {
  return Boolean(consentId) && objectKey.startsWith(`${userId}/${consentId}/`);
}

function hasOwnedScriptAudioPrefix(userId: string, scriptId: string, voiceId: string, objectKey: string) {
  return objectKey.startsWith(`${userId}/${scriptId}/${voiceId}/`);
}

function stableFingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function dedupeAndSort<T extends { bucket: string; objectKey: string }>(targets: T[]) {
  return [...new Map(targets.map((target) => [`${target.bucket}:${target.objectKey}`, target])).values()].sort((left, right) =>
    `${left.bucket}:${left.objectKey}`.localeCompare(`${right.bucket}:${right.objectKey}`)
  );
}

async function listOwnedStorageObjects(
  client: ReadClient,
  bucket: StorageListing["bucket"],
  userId: string
): Promise<StorageListing> {
  const objectKeys = new Set<string>();
  let truncated = false;

  async function walk(prefix: string, depth: number): Promise<void> {
    if (depth > MAX_STORAGE_LIST_DEPTH) {
      truncated = true;
      return;
    }

    for (let offset = 0; ; offset += STORAGE_LIST_PAGE_SIZE) {
      const { data, error } = asStorageList(
        await client.storage.from(bucket).list(prefix, { limit: STORAGE_LIST_PAGE_SIZE, offset })
      );

      if (error) {
        throw error;
      }

      const entries = data ?? [];
      for (const entry of entries) {
        const key = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.id) {
          objectKeys.add(key);
        } else {
          // Preserve the bounded walk, but never treat a visible descendant past
          // the bound as a complete inventory. Its contents remain review-only.
          if (depth >= MAX_STORAGE_LIST_DEPTH) {
            truncated = true;
            continue;
          }

          await walk(key, depth + 1);
        }
      }

      if (entries.length < STORAGE_LIST_PAGE_SIZE) {
        return;
      }
    }
  }

  try {
    // The authenticated client can enumerate only the caller's RLS-visible prefix.
    await walk(userId, 0);
    return { bucket, status: truncated ? "truncated" : "available", objectKeys: [...objectKeys].sort() };
  } catch {
    return { bucket, status: "unavailable", objectKeys: [] };
  }
}

async function listOwnedVoices(client: ReadClient, userId: string) {
  const { data, error } = asMany<VoiceRow>(
    await client.from("voices").select("*").eq("user_id", userId).eq("provider", VOICE_ONLY_PROVIDER)
  );
  throwReadFailure("voice", error);
  return data ?? [];
}

async function listOwnedScripts(client: ReadClient, userId: string) {
  const { data, error } = asMany<ScriptRow>(
    await client.from("scripts").select("id,user_id").eq("user_id", userId)
  );
  throwReadFailure("script", error);
  return data ?? [];
}

async function listOwnedScriptAudios(client: ReadClient, scriptIds: string[]) {
  if (!scriptIds.length) {
    return [];
  }

  const { data, error } = asMany<ScriptAudioRow>(
    await client.from("script_audios").select("*").in("script_id", scriptIds)
  );
  throwReadFailure("script audio", error);
  return data ?? [];
}

async function listSavedModelAudiosForUser(client: ReadClient, userId: string, scriptAudioIds: string[]) {
  if (!scriptAudioIds.length) {
    return [];
  }

  const { data, error } = asMany<SavedModelAudioRow>(
    await client
      .from("script_saved_model_audios")
      .select("*")
      .eq("user_id", userId)
      .in("script_audio_id", scriptAudioIds)
  );
  throwReadFailure("saved model audio", error);
  return data ?? [];
}

async function listOwnedScriptAudiosByIds(client: ReadClient, scriptIds: string[], scriptAudioIds: string[]) {
  if (!scriptIds.length || !scriptAudioIds.length) {
    return [];
  }

  const { data, error } = asMany<ScriptAudioRow>(
    await client.from("script_audios").select("*").in("script_id", scriptIds).in("id", scriptAudioIds)
  );
  throwReadFailure("target script audio", error);
  return data ?? [];
}

async function listOwnedSavedModelAudiosByIds(client: ReadClient, userId: string, savedModelAudioIds: string[]) {
  if (!savedModelAudioIds.length) {
    return [];
  }

  const { data, error } = asMany<SavedModelAudioRow>(
    await client.from("script_saved_model_audios").select("*").eq("user_id", userId).in("id", savedModelAudioIds)
  );
  throwReadFailure("target saved model audio", error);
  return data ?? [];
}

async function listOwnedVoiceConsents(client: ReadClient, userId: string) {
  const { data, error } = asMany<VoiceConsentRow>(
    await client.from("voice_consents").select("*").eq("user_id", userId).eq("provider", VOICE_ONLY_PROVIDER)
  );
  throwReadFailure("voice consent", error);
  return data ?? [];
}

async function getCanonicalVoiceCloningConsent(client: ReadClient, userId: string): Promise<VoiceOnlyDeletionCanonicalConsent> {
  const { data, error } = asMaybeSingle<ProcessingConsentRow>(
    await client
      .from("processing_consents")
      .select("*")
      .eq("user_id", userId)
      .eq("consent_type", "voice_cloning")
      .order("accepted_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  );
  throwReadFailure("canonical voice consent", error);
  return data ? { consentId: data.id, status: data.status } : { consentId: null, status: "not_found" };
}

function retainedCategories(): Record<VoiceOnlyDeletionRetainedCategory, true> {
  return Object.fromEntries(VOICE_ONLY_DELETION_RETAINED_CATEGORIES.map((category) => [category, true])) as Record<
    VoiceOnlyDeletionRetainedCategory,
    true
  >;
}

/**
 * Resolves cleanup targets only from the authenticated user's existing server-owned
 * bindings. There is deliberately no client input for provider IDs, storage keys, or
 * target voice IDs.
 */
export async function collectVoiceOnlyDeletionSnapshot(
  client: ReadClient,
  userId: string
): Promise<VoiceOnlyDeletionSnapshot> {
  const [voices, scripts, voiceConsents, canonicalVoiceCloningConsent, voiceSamples, consentRecordings, scriptAudioStorage] = await Promise.all([
    listOwnedVoices(client, userId),
    listOwnedScripts(client, userId),
    listOwnedVoiceConsents(client, userId),
    getCanonicalVoiceCloningConsent(client, userId),
    listOwnedStorageObjects(client, VOICE_SAMPLES_BUCKET, userId),
    listOwnedStorageObjects(client, VOICE_CONSENTS_BUCKET, userId),
    listOwnedStorageObjects(client, SCRIPT_AUDIO_STORAGE_BUCKET, userId)
  ]);

  const scriptAudios = await listOwnedScriptAudios(client, scripts.map((script) => script.id));
  const targetVoiceIds = new Set(voices.map((voice) => voice.id));
  const targetScriptAudioRows = scriptAudios.filter(
    (audio) => audio.voice_id !== null && targetVoiceIds.has(audio.voice_id) && audio.provider === VOICE_ONLY_PROVIDER
  );
  const savedModelAudios = await listSavedModelAudiosForUser(
    client,
    userId,
    targetScriptAudioRows.map((audio) => audio.id)
  );

  const manualCandidates: VoiceOnlyDeletionManualCandidate[] = [];
  const storageObjects: VoiceOnlyDeletionStorageTarget[] = [];
  const voiceById = new Map(voices.map((voice) => [voice.id, voice]));

  for (const voice of voices) {
    if (!voice.provider_voice_id.trim()) {
      manualCandidates.push({ reason: "voice_provider_reference_missing", source: "voice" });
    }

    if (!voice.sample_audio_path?.trim()) {
      continue;
    }

    const objectKey = parseVoiceSampleAudioReference({ audioPath: voice.sample_audio_path });
    if (!objectKey || !hasOwnedSamplePrefix(userId, voice.consent_id, objectKey)) {
      manualCandidates.push({ reason: "voice_sample_reference_invalid", source: "voice" });
      continue;
    }

    storageObjects.push({
      bucket: VOICE_SAMPLES_BUCKET,
      objectKey,
      source: "voice_sample",
      status: "pending"
    });
  }

  for (const consent of voiceConsents) {
    const recordingReference = getConsentRecordingReference(consent.metadata);
    if (!recordingReference) {
      continue;
    }

    const objectKey = parseVoiceConsentRecordingReference({ audioPath: recordingReference });
    if (!objectKey || !hasOwnedPrefix(userId, objectKey)) {
      manualCandidates.push({ reason: "consent_recording_reference_invalid", source: "voice_consent" });
      continue;
    }

    storageObjects.push({
      bucket: VOICE_CONSENTS_BUCKET,
      objectKey,
      source: "consent_recording",
      status: "pending"
    });
  }

  for (const audio of scriptAudios) {
    if (!audio.voice_id) {
      manualCandidates.push({ reason: "script_audio_voice_id_missing", source: "script_audio" });
      continue;
    }

    const voice = voiceById.get(audio.voice_id);
    if (!voice) {
      manualCandidates.push({ reason: "script_audio_voice_attribution_unknown", source: "script_audio" });
      continue;
    }

    if (audio.provider !== VOICE_ONLY_PROVIDER) {
      manualCandidates.push({ reason: "script_audio_provider_attribution_unknown", source: "script_audio" });
      continue;
    }

    const storedAsset = decodeStoredAssetMetadata(audio.stored_asset);
    if (!storedAsset) {
      manualCandidates.push({ reason: "target_script_audio_missing_stored_asset", source: "script_audio" });
      continue;
    }

    if (
      storedAsset.storageBucket !== SCRIPT_AUDIO_STORAGE_BUCKET ||
      !hasOwnedScriptAudioPrefix(userId, audio.script_id, voice.id, storedAsset.storageObjectKey)
    ) {
      manualCandidates.push({ reason: "target_script_audio_storage_attribution_invalid", source: "script_audio" });
      continue;
    }

    storageObjects.push({
      bucket: SCRIPT_AUDIO_STORAGE_BUCKET,
      objectKey: storedAsset.storageObjectKey,
      source: "script_audio",
      status: "pending"
    });
  }

  const sortedStorageObjects = dedupeAndSort(storageObjects);
  const targetedStorageKeys = new Set(sortedStorageObjects.map((target) => `${target.bucket}:${target.objectKey}`));
  const storageListings = [voiceSamples, consentRecordings, scriptAudioStorage];

  for (const listing of storageListings) {
    if (listing.status === "unavailable") {
      manualCandidates.push({ reason: "storage_listing_unavailable", source: "storage" });
      continue;
    }

    if (listing.status === "truncated") {
      manualCandidates.push({ reason: "storage_listing_truncated", source: "storage" });
    }

    for (const objectKey of listing.objectKeys) {
      if (!targetedStorageKeys.has(`${listing.bucket}:${objectKey}`)) {
        manualCandidates.push({ reason: "storage_object_unattributed", source: "storage" });
      }
    }
  }

  const targets = {
    voices: voices
      .map((voice) => ({
        appVoiceId: voice.id,
        providerVoiceId: voice.provider_voice_id.trim() || null,
        consentId: voice.consent_id,
        isDefault: voice.is_default,
        status: "pending" as const
      }))
      .sort((left, right) => left.appVoiceId.localeCompare(right.appVoiceId)),
    scriptAudios: targetScriptAudioRows
      .map((audio) => ({
        scriptAudioId: audio.id,
        scriptId: audio.script_id,
        appVoiceId: audio.voice_id as string,
        status: "pending" as const
      }))
      .sort((left, right) => left.scriptAudioId.localeCompare(right.scriptAudioId)),
    savedModelAudios: savedModelAudios
      .filter((row) => targetScriptAudioRows.some((audio) => audio.id === row.script_audio_id))
      .map((row) => ({
        savedModelAudioId: row.id,
        scriptId: row.script_id,
        scriptAudioId: row.script_audio_id,
        status: "pending" as const
      }))
      .sort((left, right) => left.savedModelAudioId.localeCompare(right.savedModelAudioId)),
    storageObjects: sortedStorageObjects,
    canonicalVoiceCloningConsent
  };

  const fingerprint = stableFingerprint({ version: SNAPSHOT_VERSION, targets });
  return {
    version: SNAPSHOT_VERSION,
    fingerprint,
    userId,
    operation: { status: manualCandidates.length ? "manual_required" : "pending" },
    targets,
    manualCandidates,
    storageListings
  };
}

/** Converts the internal snapshot into the only browser/mobile-safe G5C-A response. */
export function createVoiceOnlyDeletionDryRun(snapshot: VoiceOnlyDeletionSnapshot): VoiceOnlyDeletionDryRun {
  const storageTargets = snapshot.targets.storageObjects;
  const unknownOrLegacyCandidateCount = snapshot.manualCandidates.filter((candidate) =>
    [
      "voice_sample_reference_invalid",
      "consent_recording_reference_invalid",
      "target_script_audio_missing_stored_asset",
      "target_script_audio_storage_attribution_invalid",
      "script_audio_voice_id_missing",
      "script_audio_voice_attribution_unknown",
      "script_audio_provider_attribution_unknown",
      "storage_object_unattributed"
    ].includes(candidate.reason)
  ).length;

  return {
    operation: { status: "pending", mode: "dry_run", destructiveActionsCalled: false },
    targetCounts: {
      appVoices: snapshot.targets.voices.length,
      providerVoices: snapshot.targets.voices.filter((voice) => voice.providerVoiceId !== null).length,
      defaultVoiceBindings: snapshot.targets.voices.filter((voice) => voice.isDefault).length,
      voiceSamples: storageTargets.filter((target) => target.source === "voice_sample").length,
      consentRecordings: storageTargets.filter((target) => target.source === "consent_recording").length,
      scriptAudios: snapshot.targets.scriptAudios.length,
      savedModelAudioReferences: snapshot.targets.savedModelAudios.length,
      storageObjects: storageTargets.length
    },
    retained: retainedCategories(),
    review: {
      manualRequiredCandidateCount: snapshot.manualCandidates.length,
      unknownOrLegacyCandidateCount,
      storageListingUnavailableCount: snapshot.manualCandidates.filter(
        (candidate) => candidate.reason === "storage_listing_unavailable"
      ).length,
      storageListingTruncatedCount: snapshot.manualCandidates.filter(
        (candidate) => candidate.reason === "storage_listing_truncated"
      ).length
    },
    postDeleteVerifier: {
      ready: true,
      providerAbsenceRequiresIndependentReconciliation: true,
      canonicalConsentWithdrawalExpectedInFutureExecution: true
    },
    notes: [
      "dry-run only: provider, Storage, DB binding, and consent mutations are not called.",
      "Unknown, legacy, and storage-only candidates require manual review; they are not inferred deletion targets.",
      "Canonical processing_consents history is retained; future execution must withdraw the current voice_cloning consent rather than delete audit rows.",
      "Account and learning history categories are retained by policy and are not present in this target snapshot."
    ]
  };
}

export async function runVoiceOnlyDeletionDryRun(client: ReadClient, userId: string) {
  return createVoiceOnlyDeletionDryRun(await collectVoiceOnlyDeletionSnapshot(client, userId));
}

/**
 * Read-only post-delete verifier foundation. G5C-A never calls a provider mutation or
 * tries to interpret a provider DELETE 404 as success; provider absence stays unchecked
 * until a later stage supplies independent reconciliation.
 */
export async function verifyVoiceOnlyDeletionSnapshot(
  client: ReadClient,
  userId: string,
  snapshot: VoiceOnlyDeletionSnapshot
): Promise<VoiceOnlyPostDeleteVerification> {
  if (snapshot.userId !== userId) {
    throw new AppError(403, "別のユーザーの voice-only deletion snapshot は検証できません。");
  }

  const current = await collectVoiceOnlyDeletionSnapshot(client, userId);
  const snapshotVoiceIds = new Set(snapshot.targets.voices.map((voice) => voice.appVoiceId));
  const snapshotScriptAudioIds = new Set(snapshot.targets.scriptAudios.map((audio) => audio.scriptAudioId));
  const snapshotSavedModelAudioIds = snapshot.targets.savedModelAudios.map((audio) => audio.savedModelAudioId);
  const [targetScriptAudiosRemaining, savedModelAudiosRemaining] = await Promise.all([
    listOwnedScriptAudiosByIds(
      client,
      snapshot.targets.scriptAudios.map((audio) => audio.scriptId),
      [...snapshotScriptAudioIds]
    ),
    listOwnedSavedModelAudiosByIds(client, userId, snapshotSavedModelAudioIds)
  ]);
  const snapshotStorageKeys = new Set(snapshot.targets.storageObjects.map((target) => `${target.bucket}:${target.objectKey}`));
  const currentStorageKeys = new Set(
    current.storageListings.flatMap((listing) => listing.objectKeys.map((objectKey) => `${listing.bucket}:${objectKey}`))
  );
  const targetVoicesRemaining = current.targets.voices.filter((voice) => snapshotVoiceIds.has(voice.appVoiceId));
  const targetedObjectsRemaining = [...snapshotStorageKeys].filter((key) => currentStorageKeys.has(key)).length;
  const listingsUnavailable = current.storageListings.filter((listing) => listing.status === "unavailable").length;
  const applicationBindingsRemaining =
    current.targets.voices.length + targetScriptAudiosRemaining.length + savedModelAudiosRemaining.length;
  const unresolved =
    applicationBindingsRemaining > 0 ||
    targetedObjectsRemaining > 0 ||
    listingsUnavailable > 0 ||
    current.targets.canonicalVoiceCloningConsent.status !== "withdrawn";

  return {
    snapshotFingerprint: snapshot.fingerprint,
    status: unresolved ? "not_run" : "manual_required",
    providerVoiceAbsence: "not_checked",
    applicationBindings: {
      currentElevenLabsVoicesRemaining: current.targets.voices.length,
      targetVoicesRemaining: targetVoicesRemaining.length,
      defaultVoiceBindingsRemaining: current.targets.voices.filter((voice) => voice.isDefault).length,
      targetScriptAudiosRemaining: targetScriptAudiosRemaining.length,
      savedModelAudioReferencesRemaining: savedModelAudiosRemaining.length
    },
    storage: { targetedObjectsRemaining, listingsUnavailable },
    consent: {
      currentVoiceCloningConsent: current.targets.canonicalVoiceCloningConsent.status,
      expectedAfterFutureExecution: "withdrawn"
    },
    preservation: Object.fromEntries(
      VOICE_ONLY_DELETION_RETAINED_CATEGORIES.map((category) => [category, "not_checked"])
    ) as Record<VoiceOnlyDeletionRetainedCategory, "not_checked">,
    notes: [
      "G5C-A verifier foundation is read-only and does not perform deletion.",
      "Provider 404 is never treated as success; a future provider stage must independently reconcile absence.",
      "Future execution must verify retained learning history and the authenticated account/session after every destructive stage."
    ]
  };
}
