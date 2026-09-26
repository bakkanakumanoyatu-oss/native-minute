export type MobileApiReasonCode =
  | "auth_required"
  | "session_expired"
  | "session_invalid"
  | "auth_unavailable"
  | "request_invalid"
  | "origin_forbidden"
  | "method_not_allowed"
  | "rate_limited"
  | "quota_limit_reached"
  | "quota_operation_already_used"
  | "quota_operation_required"
  | "scripts_unavailable"
  | "script_not_found"
  | "script_limit_reached"
  | "script_length_exceeded"
  | "script_archived"
  | "script_edit_conflict"
  | "script_revision_conflict"
  | "practice_state_conflict"
  | "recording_revision_conflict"
  | "review_claim_conflict"
  | "listen_unavailable"
  | "voice_setup_required"
  | "voice_setup_unavailable"
  | "voice_sample_invalid"
  | "consent_unavailable"
  | "pronunciation_consent_required"
  | "audio_not_found"
  | "audio_unavailable"
  | "recording_invalid"
  | "recording_too_large"
  | "recording_format_unsupported"
  | "recording_unavailable"
  | "review_not_found"
  | "evaluation_in_progress"
  | "evaluation_unavailable"
  | "take_metadata_unavailable"
  | "progress_unavailable"
  | "account_deletion_in_progress"
  | "account_deletion_unavailable"
  | "voice_deletion_unavailable"
  | "mobile_auth_disabled";

export interface MobileApiErrorBody {
  ok: false;
  error: {
    reasonCode: MobileApiReasonCode;
    message: string;
    retryable: boolean;
  };
}

export interface MobileApiSuccessBody<T> {
  ok: true;
  data: T;
}

export interface MobileReviewDto {
  recordStatus: string;
  historyStatus: "VERSIONED" | "UNVERIFIED_LEGACY";
  scriptSnapshot: { revisionId: string; revisionNo: number; title: string; content: string; locale: string; targetSeconds: number } | null;
  scriptTitleSnapshot: string | null;
  favorite: boolean;
  displayName: string | null;
  takeId: string;
  scriptId: string;
  createdAt: string;
  reviewedAt: string | null;
  transcriptText: string;
  evaluation: {
    score: number;
    accuracyScore: number;
    fluencyScore: number;
    rhythmScore: number;
    summaryJa: string;
    strengthsJa: string[];
    weakWords: Array<{
      word: string;
      score: number;
      note: string;
    }>;
    scriptWordCount: number;
    transcriptWordCount: number;
  };
  coach: {
    titleJa: string;
    summaryJa: string;
    bulletPointsJa: string[];
    nextStepJa: string;
    focusWords: string[];
  };
}
