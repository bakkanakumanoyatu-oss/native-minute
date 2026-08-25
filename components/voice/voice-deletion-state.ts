export type VoiceDeletionUiStateName =
  | "not_requested"
  | "processing"
  | "retry_available"
  | "manual_required"
  | "completed"
  | "already_no_voice";

export type VoiceDeletionUiState = {
  state: VoiceDeletionUiStateName;
  phase: "none" | "snapshot" | "consent_withdrawal" | "provider_cleanup" | "storage_cleanup" | "database_cleanup" | "post_delete_verification" | "completed" | "manual_required";
  canRetry: boolean;
  canAdvance: boolean;
  retryAfterSeconds?: number;
};

const ALLOWED_STATES = new Set<VoiceDeletionUiStateName>([
  "not_requested", "processing", "retry_available", "manual_required", "completed", "already_no_voice"
]);
const ALLOWED_PHASES = new Set<VoiceDeletionUiState["phase"]>([
  "none", "snapshot", "consent_withdrawal", "provider_cleanup", "storage_cleanup", "database_cleanup", "post_delete_verification", "completed", "manual_required"
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Decodes only the server's public allowlist; raw operation/provider data is discarded. */
export function parseVoiceDeletionUiResponse(value: unknown): VoiceDeletionUiState | null {
  if (!isObject(value) || value.ok !== true || !isObject(value.data) || !isObject(value.data.deletion)) {
    return null;
  }

  const deletion = value.data.deletion;
  if (
    typeof deletion.state !== "string" || !ALLOWED_STATES.has(deletion.state as VoiceDeletionUiStateName) ||
    typeof deletion.phase !== "string" || !ALLOWED_PHASES.has(deletion.phase as VoiceDeletionUiState["phase"]) ||
    typeof deletion.canRetry !== "boolean" || typeof deletion.canAdvance !== "boolean"
  ) {
    return null;
  }

  if (deletion.retryAfterSeconds !== undefined && (typeof deletion.retryAfterSeconds !== "number" || !Number.isSafeInteger(deletion.retryAfterSeconds) || deletion.retryAfterSeconds < 1 || deletion.retryAfterSeconds > 86_400)) {
    return null;
  }

  return {
    state: deletion.state as VoiceDeletionUiStateName,
    phase: deletion.phase as VoiceDeletionUiState["phase"],
    canRetry: deletion.canRetry,
    canAdvance: deletion.canAdvance,
    ...(typeof deletion.retryAfterSeconds === "number" ? { retryAfterSeconds: deletion.retryAfterSeconds } : {})
  };
}

export function voiceDeletionStatusCopy(deletion: VoiceDeletionUiState) {
  switch (deletion.state) {
    case "not_requested":
      return "削除を開始する前に、対象と残るデータを確認できます。";
    case "processing":
      return "ボイスデータの削除状況を確認しています。画面を閉じても、次回この画面で状態を確認できます。";
    case "retry_available":
      return deletion.canRetry ? "もう一度確認して削除を進められます。" : "再試行できる時刻までお待ちください。";
    case "manual_required":
      return "一部のボイスデータについてサポートでの確認が必要です。アカウントと学習履歴は削除されていません。";
    case "completed":
      return "クローンボイスと関連するボイスデータを削除しました。学習履歴はそのまま残っています。";
    case "already_no_voice":
      return "削除対象のクローンボイスと関連するボイスデータはありません。アカウントと学習履歴はそのままです。";
  }
}
