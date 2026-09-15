import "server-only";
import { randomUUID } from "node:crypto";
import { createVoiceSourceCleanupStorageAdapter } from "./voice-source-cleanup-storage-adapter";
import { ACCOUNT_DELETION_DESTRUCTIVE_GUARD_ENV } from "@/services/account-deletion/account-deletion.service";
import { type AccountDeletionStorageAdapter } from "@/services/account-deletion/account-deletion-storage-adapter";
import { isRetentionCursor } from "@/services/account-deletion/retention-purge.repository";
import { createVoiceSourceCleanupRepository, parseSourceCleanupClaim, type SourceCleanupReason, type VoiceSourceCleanupRepository } from "./voice-source-cleanup.repository";

/** Explicit invocation, one source, no scheduler or terminal/release chaining. */
export async function runVoiceSourceCleanup(
  input: { mode?: string; afterId?: string },
  options: { env?: NodeJS.ProcessEnv; repository?: VoiceSourceCleanupRepository; storage?: AccountDeletionStorageAdapter } = {}
) {
  const env = options.env ?? process.env;
  let nextAfterId: string | null = null;
  let examined = 0;
  let deleteCalls = 0;
  let verificationCalls = 0;
  const output = (status: "succeeded" | "skipped" | "blocked" | "retryable_failure" | "unknown", safeReasonCode: string) =>
    ({ status, safeReasonCode, safeCounts: { examined, deleteCalls, verificationCalls }, nextAfterId });
  if (input.mode !== "execute" || (input.afterId !== undefined && !isRetentionCursor(input.afterId))) {
    return output("blocked", "source_cleanup_input_invalid");
  }
  if (env[ACCOUNT_DELETION_DESTRUCTIVE_GUARD_ENV] !== "1") return output("blocked", "destructive_guard_missing");
  try {
    const repository = options.repository ?? createVoiceSourceCleanupRepository();
    const sourceId = await repository.select(input.afterId ?? null);
    if (!sourceId) return output("succeeded", "sweep_complete");
    if (!isRetentionCursor(sourceId) || (input.afterId && sourceId <= input.afterId)) {
      return output("unknown", "malformed_canonical_state");
    }
    nextAfterId = sourceId;
    examined = 1;
    const token = randomUUID();
    const claim = parseSourceCleanupClaim(await repository.claim(sourceId, token), sourceId);
    if (claim.reason !== "claimed") return output("skipped", claim.reason);
    const target = { userId: claim.userId, objectKey: claim.objectKey,
      targetKind: claim.bucket === "voice-samples" ? "voice_sample" as const : "voice_consent_recording" as const };
    const current = async () => {
      const hasTime = () => Date.parse(claim.leaseExpiresAt) - Date.now() > 60_000;
      if (!hasTime()) return false;
      const valid = await repository.check(sourceId, token);
      // A delayed response must not carry an earlier lease check past expiry.
      return valid && hasTime();
    };
    const storage = options.storage ?? createVoiceSourceCleanupStorageAdapter();
    if (!await current()) return output("skipped", "claim_conflict");
    verificationCalls++;
    const initial = await storage.verifyObjectAbsence(target);
    let result: SourceCleanupReason;
    if (initial.kind === "absent") {
      result = "already_absent";
    } else if (initial.kind !== "present") {
      result = "verification_failure";
    } else {
      if (!await current()) return output("skipped", "claim_conflict");
      deleteCalls++;
      const deleted = await storage.deleteObject(target);
      if (!await current()) return output("skipped", "claim_conflict");
      verificationCalls++;
      const verified = await storage.verifyObjectAbsence(target);
      result = verified.kind === "absent" ? "cleanup_succeeded"
        : deleted.kind !== "request_succeeded" && verified.kind === "present"
          ? "storage_delete_transient_failure" : "verification_failure";
    }
    if (!await repository.finish(sourceId, token, result)) return output("unknown", "claim_conflict");
    return output(result === "cleanup_succeeded" || result === "already_absent" ? "succeeded" : "retryable_failure", result);
  } catch {
    // Lost responses keep the durable source fenced; lease expiry permits another
    // invocation to recheck exact absence. Never expose raw Storage/RPC diagnostics.
    return output("unknown", "source_cleanup_state_unknown");
  }
}
