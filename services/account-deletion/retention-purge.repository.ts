import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

type Rpc = Database["public"]["Functions"]["routine_purge_retained_evidence"];
export type RetentionResource = "quota" | "voice" | "account";
export type RetentionPurgeResult = Rpc["Returns"][number];
export type RetentionPurgeRepository = {
  purgeNext(resource: RetentionResource, afterId: string | null): Promise<RetentionPurgeResult | null>;
};

export const isRetentionCursor = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);

/** Reconstruct the aggregate allowlist; no RPC diagnostic or surplus fields escape. */
export function parseRetentionPurgeResult(value: unknown): RetentionPurgeResult | null {
  if (!Array.isArray(value) || value.length !== 1 || !value[0] || typeof value[0] !== "object") return null;
  const r = value[0] as Record<string, unknown>;
  const keys = ["examined", "purged", "skipped_hold", "skipped_not_expired", "skipped_unsafe", "legacy_hold_linkage_unresolved"] as const;
  if (keys.some(key => r[key] !== 0 && r[key] !== 1)) return null;
  const counts = Object.fromEntries(keys.map(key => [key, r[key]])) as Omit<RetentionPurgeResult, "next_after_id">;
  if (counts.examined !== counts.purged + counts.skipped_hold + counts.skipped_not_expired + counts.skipped_unsafe + counts.legacy_hold_linkage_unresolved) return null;
  if (counts.examined === 0 ? r.next_after_id !== null : !isRetentionCursor(r.next_after_id)) return null;
  return { ...counts, next_after_id: r.next_after_id as string | null };
}

export function createRetentionPurgeRepository(
  client = createSupabaseAdminClient()
): RetentionPurgeRepository {
  return {
    async purgeNext(resource, afterId) {
      const { data, error } = await client.rpc("routine_purge_retained_evidence", {
        p_resource: resource, p_after_id: afterId
      });
      return error ? null : parseRetentionPurgeResult(data);
    }
  };
}
