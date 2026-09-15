import "server-only";
import { createVoiceSourceCleanupClient } from "./voice-source-cleanup-client";
import { isRetentionCursor } from "@/services/account-deletion/retention-purge.repository";

export const SOURCE_CLEANUP_REASONS = [
  "not_due", "in_flight_use", "legal_hold", "claim_conflict", "storage_delete_transient_failure",
  "verification_failure", "unsafe_locator_or_ownership", "already_absent", "cleanup_succeeded",
  "malformed_canonical_state", "manual_required", "source_authority_removed", "account_deletion_active", "voice_deletion_active"
] as const;
export type SourceCleanupReason = typeof SOURCE_CLEANUP_REASONS[number];
export type CleanupTarget = {
  reason: "claimed"; sourceId: string; userId: string; bucket: "voice-samples" | "voice-consents";
  objectKey: string; leaseExpiresAt: string;
};
export type CleanupClaim = CleanupTarget | { reason: SourceCleanupReason };
export type VoiceSourceCleanupRepository = {
  select(afterId: string | null): Promise<string | null>;
  claim(sourceId: string, token: string): Promise<CleanupClaim>;
  check(sourceId: string, token: string): Promise<boolean>;
  finish(sourceId: string, token: string, result: SourceCleanupReason): Promise<boolean>;
};

/** Strict internal target decoding. None of these raw fields enter operator output. */
export function parseSourceCleanupClaim(value: unknown, sourceId: string): CleanupClaim {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { reason: "malformed_canonical_state" };
  const r = value as Record<string, unknown>;
  if (SOURCE_CLEANUP_REASONS.includes(r.reason as SourceCleanupReason)) return { reason: r.reason as SourceCleanupReason };
  if (r.reason !== "claimed" || r.sourceId !== sourceId || !isRetentionCursor(r.sourceId) || !isRetentionCursor(r.userId)
    || !["voice-samples", "voice-consents"].includes(String(r.bucket)) || typeof r.objectKey !== "string"
    || typeof r.leaseExpiresAt !== "string" || !Number.isFinite(Date.parse(r.leaseExpiresAt))) {
    return { reason: "malformed_canonical_state" };
  }
  const parts = r.objectKey.split("/");
  if (parts[0] !== r.userId || parts.length !== (r.bucket === "voice-samples" ? 3 : 2)
    || parts.some(part => !part || part === "." || part === "..") || r.objectKey.trim() !== r.objectKey || r.objectKey.length > 1024) {
    return { reason: "unsafe_locator_or_ownership" };
  }
  return { reason: "claimed", sourceId, userId: r.userId, bucket: r.bucket as CleanupTarget["bucket"],
    objectKey: r.objectKey, leaseExpiresAt: r.leaseExpiresAt };
}

export function createVoiceSourceCleanupRepository(client = createVoiceSourceCleanupClient()): VoiceSourceCleanupRepository {
  return {
    async select(afterId) {
      const { data, error } = await client.rpc("select_voice_source_cleanup", { p_after_id: afterId });
      if (error || (data !== null && !isRetentionCursor(data))) throw new Error("source_cleanup_state_unknown");
      return data;
    },
    async claim(sourceId, token) {
      const { data, error } = await client.rpc("claim_voice_source_cleanup", { p_source_id: sourceId, p_token: token });
      if (error) throw new Error("source_cleanup_state_unknown");
      return parseSourceCleanupClaim(data, sourceId);
    },
    async check(sourceId, token) {
      const { data, error } = await client.rpc("check_voice_source_cleanup", { p_source_id: sourceId, p_token: token });
      return !error && data === true;
    },
    async finish(sourceId, token, result) {
      const { data, error } = await client.rpc("finish_voice_source_cleanup", {
        p_source_id: sourceId, p_token: token, p_result: result
      });
      return !error && data === true;
    }
  };
}
