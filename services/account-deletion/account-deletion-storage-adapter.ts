import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/supabase/config";

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
  statusCode?: unknown;
  // Unmodified parsed info GET error body; SDK errors omit error/code fields.
  infoBody?: unknown;
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
  const status = error?.status ?? (typeof error?.statusCode === "number" ? error.statusCode : undefined);
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

function isExactInfoAbsence(error: StorageErrorLike) {
  // Transport status is authority. Never coerce or fall back to body statusCode.
  if (error.status === 404) return true;
  if (error.status !== 400) return false;
  const body = error.infoBody;
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const fields = body as Record<string, unknown>;
  return fields.statusCode === "404" && fields.error === "not_found" &&
    fields.code === "NoSuchKey" && fields.message === "Object not found";
}

function createAccountDeletionStorageClient(): StorageClient {
  const client = createSupabaseAdminClient();
  const url = getSupabaseUrl().replace(/\/$/, "");
  const key = getSupabaseServiceRoleKey();
  return { storage: { from(bucket) {
    const storage = client.storage.from(bucket);
    return {
      remove: (paths) => storage.remove(paths),
      list: (path, options) => storage.list(path, options),
      // Only Account deletion exact-owned info uses this narrow transport.
      // Keep the raw JSON instead of the SDK's lossy StorageApiError projection.
      async info(path) {
        const response = await fetch(`${url}/storage/v1/object/info/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`, {
          method: "GET", headers: { apikey: key, Authorization: `Bearer ${key}` },
          redirect: "error", signal: AbortSignal.timeout(20_000), cache: "no-store"
        });
        if (response.status === 404) return { data: null, error: { status: response.status } };
        let body: unknown;
        try { body = await response.json(); } catch (error) {
          if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) throw error;
          body = null;
        }
        if (!response.ok) {
          const fields = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
          const nestedError = fields?.error && typeof fields.error === "object" ? fields.error as Record<string, unknown> : null;
          // Preserve the SDK's diagnostic message precedence for other failures.
          const message = fields?.msg || fields?.message || fields?.error_description ||
            (typeof fields?.error === "string" ? fields.error : nestedError?.message) || JSON.stringify(body);
          return { data: null, error: { status: response.status, infoBody: body,
            message: typeof message === "string" ? message : undefined } };
        }
        return { data: body && typeof body === "object" && !Array.isArray(body) ? body as StorageInfo : null, error: null };
      }
    };
  } } };
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
  client: StorageClient = createAccountDeletionStorageClient()
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

      // HTTP 404, or HTTP 400 with all four exact JSON strings, is authority.
      // A listing omission, DELETE success or body status alone never is.
      if (error) {
        return isExactInfoAbsence(error)
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
