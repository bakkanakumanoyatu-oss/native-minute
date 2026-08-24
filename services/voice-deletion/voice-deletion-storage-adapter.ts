import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { StorageObjectTargetKind } from "./voice-deletion.repository";

type StorageErrorLike = {
  message?: string;
  name?: string;
  statusCode?: number;
  status?: number;
};

type StorageListItem = { name?: unknown; id?: unknown };
type StorageBucketClient = {
  remove(paths: string[]): Promise<{ data: unknown; error: StorageErrorLike | null }>;
  list(
    path?: string,
    options?: { limit?: number; offset?: number; search?: string }
  ): Promise<{ data: StorageListItem[] | null; error: StorageErrorLike | null }>;
};
type StorageClient = {
  storage: { from(bucket: string): StorageBucketClient };
};

export type StorageObjectDeleteResult = {
  kind:
    | "request_succeeded"
    | "timed_out"
    | "rate_limited"
    | "unavailable"
    | "network_error"
    | "auth_failed"
    | "permission_denied"
    | "rejected"
    | "protocol_error";
};

export type StorageObjectVerificationResult = {
  kind:
    | "absent"
    | "present"
    | "timed_out"
    | "rate_limited"
    | "unavailable"
    | "network_error"
    | "auth_failed"
    | "permission_denied"
    | "rejected"
    | "protocol_error";
};

export type VoiceDeletionStorageAdapter = {
  deleteObject(input: { targetKind: StorageObjectTargetKind; objectKey: string }): Promise<StorageObjectDeleteResult>;
  verifyObjectAbsence(input: {
    targetKind: StorageObjectTargetKind;
    objectKey: string;
  }): Promise<StorageObjectVerificationResult>;
};

const STORAGE_BUCKET_BY_TARGET_KIND: Record<StorageObjectTargetKind, "voice-samples" | "voice-consents" | "script-audios"> = {
  voice_sample: "voice-samples",
  voice_consent_recording: "voice-consents",
  script_audio_storage: "script-audios"
};
const LIST_PAGE_SIZE = 1000;

function resolveBucket(targetKind: StorageObjectTargetKind) {
  return STORAGE_BUCKET_BY_TARGET_KIND[targetKind];
}

function isStorageObjectTargetKind(value: unknown): value is StorageObjectTargetKind {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(STORAGE_BUCKET_BY_TARGET_KIND, value);
}

function isExactObjectKey(value: string) {
  const trimmed = value.trim();
  return (
    trimmed === value &&
    trimmed.length > 0 &&
    !trimmed.startsWith("/") &&
    !trimmed.endsWith("/") &&
    trimmed.split("/").every((part) => part.length > 0 && part !== "." && part !== "..")
  );
}

function parseStorageObjectInput(input: unknown): { targetKind: StorageObjectTargetKind; objectKey: string } | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }

  try {
    const { targetKind, objectKey } = input as { targetKind?: unknown; objectKey?: unknown };
    if (!isStorageObjectTargetKind(targetKind) || typeof objectKey !== "string" || !isExactObjectKey(objectKey)) {
      return null;
    }
    return { targetKind, objectKey };
  } catch {
    return null;
  }
}

function normalizeStorageError(error: StorageErrorLike | null | undefined): Exclude<StorageObjectDeleteResult["kind"], "request_succeeded"> {
  const status = typeof error?.statusCode === "number" ? error.statusCode : error?.status;
  const message = `${error?.name ?? ""} ${error?.message ?? ""}`.toLowerCase();

  if (message.includes("timeout") || message.includes("abort")) {
    return "timed_out";
  }
  if (message.includes("rate") || status === 429) {
    return "rate_limited";
  }
  if (status === 401 || message.includes("unauthorized") || message.includes("invalid jwt")) {
    return "auth_failed";
  }
  if (status === 403 || message.includes("permission") || message.includes("forbidden") || message.includes("policy")) {
    return "permission_denied";
  }
  if (message.includes("network") || message.includes("fetch") || message.includes("socket")) {
    return "network_error";
  }
  if ((typeof status === "number" && status >= 500) || message.includes("unavailable") || message.includes("service")) {
    return "unavailable";
  }
  if (typeof status === "number" && status >= 400) {
    return "rejected";
  }
  return "protocol_error";
}

function toVerificationFailure(kind: Exclude<StorageObjectDeleteResult["kind"], "request_succeeded">): Exclude<
  StorageObjectVerificationResult["kind"],
  "absent" | "present"
> {
  return kind;
}

function parentAndBasename(objectKey: string) {
  const slash = objectKey.lastIndexOf("/");
  return slash === -1
    ? { parent: "", basename: objectKey }
    : { parent: objectKey.slice(0, slash), basename: objectKey.slice(slash + 1) };
}

/**
 * Server-only B3 Storage adapter. Bucket selection is fixed by target kind and every
 * destructive request contains exactly one durable object key.
 */
export function createVoiceDeletionStorageAdapter(
  client: StorageClient = createSupabaseAdminClient() as unknown as StorageClient
): VoiceDeletionStorageAdapter {
  async function deleteObject(input: unknown): Promise<StorageObjectDeleteResult> {
    const target = parseStorageObjectInput(input);
    if (!target) {
      return { kind: "rejected" };
    }

    try {
      const { error } = await client.storage.from(resolveBucket(target.targetKind)).remove([target.objectKey]);
      return error ? { kind: normalizeStorageError(error) } : { kind: "request_succeeded" };
    } catch (error) {
      return { kind: normalizeStorageError(error as StorageErrorLike) };
    }
  }

  async function verifyObjectAbsence(input: unknown): Promise<StorageObjectVerificationResult> {
    const target = parseStorageObjectInput(input);
    if (!target) {
      return { kind: "rejected" };
    }

    const { parent, basename } = parentAndBasename(target.objectKey);
    try {
      const { data, error } = await client.storage
        .from(resolveBucket(target.targetKind))
        .list(parent, { limit: LIST_PAGE_SIZE, offset: 0, search: basename });
      if (error) {
        return { kind: toVerificationFailure(normalizeStorageError(error)) };
      }
      if (!Array.isArray(data) || data.some((entry) => typeof entry?.name !== "string" || !entry.name)) {
        return { kind: "protocol_error" };
      }

      const exactMatches = data.filter((entry) => `${parent ? `${parent}/` : ""}${entry.name}` === target.objectKey);
      if (exactMatches.length === 1) {
        return { kind: "present" };
      }
      if (exactMatches.length > 1 || data.length >= LIST_PAGE_SIZE) {
        return { kind: "protocol_error" };
      }

      // A non-truncated, successful parent-prefix list that has no exact key is the
      // only Storage absence authority in B3. No signed URL or download is used.
      return { kind: "absent" };
    } catch (error) {
      return { kind: toVerificationFailure(normalizeStorageError(error as StorageErrorLike)) };
    }
  }

  return { deleteObject, verifyObjectAbsence };
}

export const VOICE_DELETION_STORAGE_BUCKETS = STORAGE_BUCKET_BY_TARGET_KIND;
