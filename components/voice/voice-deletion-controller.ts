export const MAX_VOICE_DELETION_ADVANCES = 3;
export const retainedVoiceDeletionDataCopy = "アカウント、ログイン、台本、練習録音、Take / 文字起こし、発音スコア、コーチフィードバック、最新・ベスト結果、進捗。";

export type VoiceDeletionAdvanceableState = {
  state: string;
  canAdvance: boolean;
};

export type VoiceDeletionBatchResult<T extends VoiceDeletionAdvanceableState> =
  | {
      kind: "status";
      deletion: T;
      advances: number;
      needsContinuation: boolean;
    }
  | { kind: "transport_failure"; advances: number };

export function canStartVoiceDeletionBatch(state: VoiceDeletionAdvanceableState) {
  return state.state === "processing" && state.canAdvance;
}

export function canRetryVoiceDeletion(state: {
  state: string;
  canRetry: boolean;
}) {
  return state.state === "retry_available" && state.canRetry;
}

export function nextVoiceDeletionConfirmationState(action: "open" | "cancel") {
  return action === "open";
}

export function getVoiceDeletionTerminalActions(state: string) {
  if (state === "completed") {
    return { primary: "Voice Setup を開く", secondary: null };
  }
  if (state === "already_no_voice") {
    return { primary: "Voice Setup を始める", secondary: "Settings に戻る" };
  }
  return null;
}

/** A continuation/recovery action is intentionally read-only. */
export async function recheckVoiceDeletionStatus<T>(getStatus: () => Promise<T | null>) {
  return getStatus();
}

export function needsVoiceDeletionContinuation(
  state: VoiceDeletionAdvanceableState,
  remainingAdvanceBudget: number
) {
  return canStartVoiceDeletionBatch(state) && remainingAdvanceBudget === 0;
}

/**
 * Runs one user-visible bounded batch. A POST never authorizes another POST:
 * each step is followed by a read-only status check for the durable state.
 */
export async function runVoiceDeletionAdvanceBatch<T extends VoiceDeletionAdvanceableState>({
  advance,
  getStatus,
  maximumAdvances = MAX_VOICE_DELETION_ADVANCES
}: {
  advance: () => Promise<T | null>;
  getStatus: () => Promise<T | null>;
  maximumAdvances?: number;
}): Promise<VoiceDeletionBatchResult<T>> {
  let advances = 0;

  while (advances < maximumAdvances) {
    const advanced = await advance();
    advances += 1;
    if (!advanced) {
      return { kind: "transport_failure", advances };
    }

    const durableStatus = await getStatus();
    if (!durableStatus) {
      return { kind: "transport_failure", advances };
    }

    if (!canStartVoiceDeletionBatch(durableStatus)) {
      return {
        kind: "status",
        deletion: durableStatus,
        advances,
        needsContinuation: false
      };
    }

    if (advances === maximumAdvances) {
      return {
        kind: "status",
        deletion: durableStatus,
        advances,
        needsContinuation: true
      };
    }
  }

  // maximumAdvances is fixed positive in production. Fail safely for bad callers.
  return { kind: "transport_failure", advances };
}
