import "server-only";
import type { Database, VoiceDeletionStage } from "@/types/database";
import type { VoiceOnlyDeletionSnapshot } from "./voice-deletion.service";

type Operation = Database["public"]["Tables"]["voice_deletion_operations"]["Row"];

export type VoiceDeletionClientStateName =
  | "not_requested"
  | "processing"
  | "retry_available"
  | "manual_required"
  | "completed"
  | "already_no_voice";

export type VoiceDeletionClientPhase =
  | "none"
  | VoiceDeletionStage
  | "completed"
  | "manual_required";

export type SafeVoiceDeletionClientState = {
  state: VoiceDeletionClientStateName;
  phase: VoiceDeletionClientPhase;
  canRetry: boolean;
  canAdvance: boolean;
  retryAfterSeconds?: number;
};

/**
 * A partial failure is runnable only when its server-authored retry timestamp is
 * present and a real instant. A malformed durable row must never inherit the
 * expired-retry behaviour.
 */
export function hasValidPartialFailureRetryAt(operation: Pick<Operation, "next_retry_at">) {
  return (
    typeof operation.next_retry_at === "string" &&
    operation.next_retry_at.trim().length > 0 &&
    Number.isFinite(Date.parse(operation.next_retry_at))
  );
}

function hasRelevantDeletionState(snapshot: VoiceOnlyDeletionSnapshot) {
  return (
    snapshot.targets.voices.length > 0 ||
    snapshot.targets.scriptAudios.length > 0 ||
    snapshot.targets.savedModelAudios.length > 0 ||
    snapshot.targets.storageObjects.length > 0 ||
    snapshot.targets.canonicalVoiceCloningConsent.status === "active"
  );
}

export function hasVoiceDeletionManualCandidate(snapshot: VoiceOnlyDeletionSnapshot) {
  return snapshot.manualCandidates.length > 0;
}

export function isAlreadyNoVoiceInventory(snapshot: VoiceOnlyDeletionSnapshot) {
  return !hasRelevantDeletionState(snapshot) && !hasVoiceDeletionManualCandidate(snapshot);
}

function processingPhase(operation: Operation): VoiceDeletionClientPhase {
  if (operation.current_stage) {
    return operation.current_stage;
  }
  return "snapshot";
}

function retryState(operation: Operation, now: Date): SafeVoiceDeletionClientState {
  const retryAt = Date.parse(operation.next_retry_at as string);
  const remainingMilliseconds = Math.max(0, retryAt - now.getTime());
  const canRetry = remainingMilliseconds === 0;

  return {
    state: "retry_available",
    phase: processingPhase(operation),
    canRetry,
    canAdvance: canRetry,
    ...(canRetry ? {} : { retryAfterSeconds: Math.max(1, Math.ceil(remainingMilliseconds / 1000)) })
  };
}

/** Maps durable state and a fresh read-only inventory to the only client-safe DTO. */
export function mapVoiceDeletionClientState(input: {
  operation: Operation | null;
  inventory: VoiceOnlyDeletionSnapshot;
  now?: Date;
}): SafeVoiceDeletionClientState {
  const { operation, inventory } = input;
  const unsafeDurableStage = operation && [
    operation.snapshot_status,
    operation.consent_withdrawal_status,
    operation.post_delete_verification_status
  ].some((status) => status === "failed" || status === "manual_required");

  if (operation?.status === "manual_required" || operation?.status === "failed" || unsafeDurableStage) {
    return {
      state: "manual_required",
      phase: "manual_required",
      canRetry: false,
      canAdvance: false
    };
  }

  if (operation?.status === "completed" && isAlreadyNoVoiceInventory(inventory)) {
    return { state: "completed", phase: "completed", canRetry: false, canAdvance: false };
  }

  if (operation?.status === "partial_failure") {
    if (!hasValidPartialFailureRetryAt(operation)) {
      return {
        state: "manual_required",
        phase: "manual_required",
        canRetry: false,
        canAdvance: false
      };
    }
    return retryState(operation, input.now ?? new Date());
  }

  if (operation && ["pending", "processing"].includes(operation.status)) {
    return {
      state: "processing",
      phase: processingPhase(operation),
      canRetry: false,
      canAdvance: true
    };
  }

  if (isAlreadyNoVoiceInventory(inventory)) {
    return { state: "already_no_voice", phase: "none", canRetry: false, canAdvance: false };
  }

  return { state: "not_requested", phase: "none", canRetry: false, canAdvance: false };
}
