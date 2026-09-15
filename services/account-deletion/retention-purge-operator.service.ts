import "server-only";
import { createRetentionPurgeRepository, isRetentionCursor, type RetentionPurgeRepository } from "./retention-purge.repository";
import { ACCOUNT_DELETION_DESTRUCTIVE_GUARD_ENV } from "./account-deletion.service";

/** One explicit invocation / one bounded DB transaction. No release/scheduler chain. */
export async function runRetentionPurgeOperator(
  input: { resource?: string; mode?: string; afterId?: string },
  options: { env?: NodeJS.ProcessEnv; repository?: RetentionPurgeRepository } = {}
) {
  const env = options.env ?? process.env;
  const { resource } = input;
  if (input.mode !== "execute" || !["quota", "voice", "account"].includes(resource ?? "") ||
    (input.afterId !== undefined && !isRetentionCursor(input.afterId))) {
    return { status: "blocked", safeReasonCode: "retention_input_invalid", rpcCalls: 0 } as const;
  }
  if (env[ACCOUNT_DELETION_DESTRUCTIVE_GUARD_ENV] !== "1") {
    return { status: "blocked", safeReasonCode: "destructive_guard_missing", rpcCalls: 0 } as const;
  }
  let rpcCalls = 0;
  try {
    const repository = options.repository ?? createRetentionPurgeRepository();
    rpcCalls = 1;
    const result = await repository.purgeNext(resource as "quota" | "voice" | "account", input.afterId ?? null);
    if (!result || (input.afterId && result.next_after_id && result.next_after_id <= input.afterId)) {
      return { status: "unknown", safeReasonCode: "retention_result_unknown", rpcCalls } as const;
    }
    return { status: "succeeded", safeReasonCode: null, rpcCalls, resource, safeCounts: {
      examined: result.examined, purged: result.purged, skipped_hold: result.skipped_hold,
      skipped_not_expired: result.skipped_not_expired, skipped_unsafe: result.skipped_unsafe,
      legacy_hold_linkage_unresolved: result.legacy_hold_linkage_unresolved
    }, nextAfterId: result.next_after_id } as const;
  } catch {
    return { status: "unknown", safeReasonCode: "retention_result_unknown", rpcCalls } as const;
  }
}
