import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const ACCOUNT_DELETION_STORAGE_BUCKET_BY_TARGET_KIND = {
  recording: "recordings",
  script_audio: "script-audios",
  voice_sample: "voice-samples",
  voice_consent_recording: "voice-consents"
} as const;

export type AccountDeletionStorageTargetKind = keyof typeof ACCOUNT_DELETION_STORAGE_BUCKET_BY_TARGET_KIND;
export type AccountDeletionStorageBucket =
  (typeof ACCOUNT_DELETION_STORAGE_BUCKET_BY_TARGET_KIND)[AccountDeletionStorageTargetKind];
export type AccountDeletionStorageInventory = Record<AccountDeletionStorageBucket, string[]>;

type StorageErrorLike = {
  message?: string;
  name?: string;
  status?: number;
  statusCode?: number;
};
type StorageListItem = { name?: unknown; id?: unknown; metadata?: unknown };
type StorageInfo = { id?: unknown; name?: unknown; bucketId?: unknown };
type StorageBucketClient = {
  remove(paths: string[]): Promise<{ data: unknown; error: StorageErrorLike | null }>;
  list(
    path?: string,
    options?: { limit?: number; offset?: number; sortBy?: { column: string; order: string } }
  ): Promise<{ data: StorageListItem[] | null; error: StorageErrorLike | null }>;
  info(path: string): Promise<{ data: StorageInfo | null; error: StorageErrorLike | null }>;
};
type StorageClient = { storage: { from(bucket: string): StorageBucketClient } };

export type AccountDeletionStorageDeleteResult = {
  kind:
    | "request_succeeded"
    | "invalid_target"
    | "timed_out"
    | "rate_limited"
    | "unavailable"
    | "network_error"
    | "auth_failed"
    | "permission_denied"
    | "rejected"
    | "protocol_error";
};

export type AccountDeletionStorageVerificationResult = {
  kind:
    | "absent"
    | "present"
    | "invalid_target"
    | "timed_out"
    | "rate_limited"
    | "unavailable"
    | "network_error"
    | "auth_failed"
    | "permission_denied"
    | "rejected"
    | "protocol_error";
};

export type AccountDeletionStorageAdapter = {
  listOwnedInventory(userId: string): Promise<AccountDeletionStorageInventory>;
  deleteObject(input: {
    userId: string;
    targetKind: AccountDeletionStorageTargetKind;
    objectKey: string;
  }): Promise<AccountDeletionStorageDeleteResult>;
  verifyObjectAbsence(input: {
    userId: string;
    targetKind: AccountDeletionStorageTargetKind;
    objectKey: string;
  }): Promise<AccountDeletionStorageVerificationResult>;
};

const LIST_PAGE_SIZE = 1000;
const MAX_LIST_DEPTH: Record<AccountDeletionStorageBucket, number> = {
  recordings: 2,
  "script-audios": 3,
  "voice-samples": 2,
  "voice-consents": 1
};
const MAX_LISTED_OBJECTS = 10_000;

function isExactOwnedObjectKey(userId: string, objectKey: string) {
  const parts = objectKey.split("/");

  return (
    objectKey.length > userId.length + 1 &&
    objectKey.length <= 1024 &&
    objectKey.trim() === objectKey &&
    !objectKey.startsWith("/") &&
    !objectKey.endsWith("/") &&
    parts[0] === userId &&
    parts.every((part) => part.length > 0 && part !== "." && part !== "..")
  );
}

function normalizeStorageError(error: StorageErrorLike | null | undefined) {
  const status = typeof error?.statusCode === "number" ? error.statusCode : error?.status;
  const message = `${error?.name ?? ""} ${error?.message ?? ""}`.toLowerCase();

  if (message.includes("timeout") || message.includes("abort")) return "timed_out" as const;
  if (status === 429 || message.includes("rate")) return "rate_limited" as const;
  if (status === 401 || message.includes("unauthorized") || message.includes("invalid jwt")) {
    return "auth_failed" as const;
  }
  if (status === 403 || message.includes("permission") || message.includes("forbidden") || message.includes("policy")) {
    return "permission_denied" as const;
  }
  if (message.includes("network") || message.includes("fetch") || message.includes("socket")) {
    return "network_error" as const;
  }
  if ((typeof status === "number" && status >= 500) || message.includes("unavailable")) {
    return "unavailable" as const;
  }
  if (typeof status === "number" && status >= 400) return "rejected" as const;
  return "protocol_error" as const;
}

function getErrorStatus(error: StorageErrorLike | null | undefined) {
  return typeof error?.statusCode === "number" ? error.statusCode : error?.status;
}

function resolveTarget(input: {
  userId: string;
  targetKind: AccountDeletionStorageTargetKind;
  objectKey: string;
}) {
  const bucket = ACCOUNT_DELETION_STORAGE_BUCKET_BY_TARGET_KIND[input.targetKind];

  return bucket && isExactOwnedObjectKey(input.userId, input.objectKey)
    ? { bucket, objectKey: input.objectKey }
    : null;
}

export function createAccountDeletionStorageAdapter(
  client: StorageClient = createSupabaseAdminClient() as unknown as StorageClient
): AccountDeletionStorageAdapter {
  async function listBucket(bucket: AccountDeletionStorageBucket, userId: string) {
    const keys = new Set<string>();

    async function walk(prefix: string, depth: number): Promise<void> {
      if (depth > MAX_LIST_DEPTH[bucket]) {
        throw new Error("storage_listing_depth_exceeded");
      }

      for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
        const { data, error } = await client.storage.from(bucket).list(prefix, {
          limit: LIST_PAGE_SIZE,
          offset,
          sortBy: { column: "name", order: "asc" }
        });

        if (error || !Array.isArray(data)) {
          throw new Error("storage_listing_unavailable");
        }

        for (const entry of data) {
          if (typeof entry.name !== "string" || !entry.name || entry.name.includes("/")) {
            throw new Error("storage_listing_protocol_error");
          }

          const key = `${prefix}/${entry.name}`;
          const isObject = typeof entry.id === "string" && entry.id.length > 0;
          const isFolder = !isObject && entry.metadata == null;

          if (isObject) {
            if (!isExactOwnedObjectKey(userId, key) || keys.has(key)) {
              throw new Error("storage_listing_ownership_or_duplicate_error");
            }
            keys.add(key);
            if (keys.size > MAX_LISTED_OBJECTS) {
              throw new Error("storage_listing_budget_exceeded");
            }
          } else if (isFolder) {
            if (depth >= MAX_LIST_DEPTH[bucket]) {
              throw new Error("storage_listing_depth_exceeded");
            }
            await walk(key, depth + 1);
          } else {
            throw new Error("storage_listing_protocol_error");
          }
        }

        if (data.length < LIST_PAGE_SIZE) break;
      }
    }

    await walk(userId, 0);
    return [...keys].sort();
  }

  async function listOwnedInventory(userId: string): Promise<AccountDeletionStorageInventory> {
    const buckets = Object.values(ACCOUNT_DELETION_STORAGE_BUCKET_BY_TARGET_KIND);
    const listed = await Promise.all(buckets.map(async (bucket) => [bucket, await listBucket(bucket, userId)] as const));

    return Object.fromEntries(listed) as AccountDeletionStorageInventory;
  }

  async function deleteObject(input: {
    userId: string;
    targetKind: AccountDeletionStorageTargetKind;
    objectKey: string;
  }): Promise<AccountDeletionStorageDeleteResult> {
    const target = resolveTarget(input);
    if (!target) return { kind: "invalid_target" };

    try {
      const { error } = await client.storage.from(target.bucket).remove([target.objectKey]);
      return error ? { kind: normalizeStorageError(error) } : { kind: "request_succeeded" };
    } catch (error) {
      return { kind: normalizeStorageError(error as StorageErrorLike) };
    }
  }

  async function verifyObjectAbsence(input: {
    userId: string;
    targetKind: AccountDeletionStorageTargetKind;
    objectKey: string;
  }): Promise<AccountDeletionStorageVerificationResult> {
    const target = resolveTarget(input);
    if (!target) return { kind: "invalid_target" };

    try {
      const { data, error } = await client.storage.from(target.bucket).info(target.objectKey);

      // Only an exact-object 404 is absence authority. A prefix listing omission,
      // DELETE success, 400, or malformed response never proves absence.
      if (error) {
        return getErrorStatus(error) === 404
          ? { kind: "absent" }
          : { kind: normalizeStorageError(error) };
      }
      if (!data || typeof data.id !== "string" || !data.id) {
        return { kind: "protocol_error" };
      }

      return { kind: "present" };
    } catch (error) {
      return { kind: normalizeStorageError(error as StorageErrorLike) };
    }
  }

  return { listOwnedInventory, deleteObject, verifyObjectAbsence };
}
