export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type QuotaEventType = "script_generation_attempt" | "script_audio_generation_attempt";
export type QuotaEventCategory = "text_generation_quota" | "voice_generation_quota";
export type QuotaEventStatus =
  | "attempted"
  | "succeeded"
  | "failed"
  | "skipped"
  | "not_billable"
  | "cache_hit"
  | "partial";
export type QuotaEventFailureStage =
  | "provider_selection"
  | "provider_config"
  | "provider_request"
  | "provider_response_parse"
  | "pipeline_validation"
  | "pipeline_rejected"
  | "response_shaping"
  | "quota_event_write"
  | "storage_staging"
  | "cache_lookup"
  | "ownership_check";
export type QuotaEventBillingStatus = "not_evaluated" | "non_billable" | "billable_candidate" | "refund_candidate";
export type QuotaEventSubjectType = "script_studio" | "saved_script";
export type QuotaEventTargetResourceType = "none" | "script_audio";
export type ScriptSavedModelAudioSource = "listen" | "script_detail";
export type ScriptSavedBestTakeSource = "review" | "progress" | "script_detail";
export type AccountDeletionRequestSource = "in_app" | "support_web" | "admin";
export type AccountDeletionRequestStatus =
  | "requested"
  | "confirmed"
  | "processing"
  | "provider_cleanup_failed"
  | "storage_cleanup_failed"
  | "db_cleanup_failed"
  | "auth_cleanup_failed"
  | "completed"
  | "cancelled"
  | "expired";
export type AccountDeletionFailureStage =
  | "provider_cleanup"
  | "storage_cleanup"
  | "db_cleanup"
  | "auth_cleanup"
  | "notification";
export type AccountDeletionCleanupStatus = "pending" | "not_needed" | "succeeded" | "failed" | "manual_required";

export interface Database {
  public: {
    Tables: {
      account_deletion_requests: {
        Row: {
          id: string;
          user_id: string | null;
          anonymized_user_ref: string;
          request_source: AccountDeletionRequestSource;
          status: AccountDeletionRequestStatus;
          failure_stage: AccountDeletionFailureStage | null;
          failure_reason_code: string | null;
          provider_cleanup_status: AccountDeletionCleanupStatus;
          storage_cleanup_status: AccountDeletionCleanupStatus;
          db_cleanup_status: AccountDeletionCleanupStatus;
          auth_cleanup_status: AccountDeletionCleanupStatus;
          notification_status: AccountDeletionCleanupStatus;
          retry_count: number;
          requested_at: string;
          confirmed_at: string | null;
          processing_started_at: string | null;
          completed_at: string | null;
          cancelled_at: string | null;
          expires_at: string | null;
          last_attempted_at: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          anonymized_user_ref?: string;
          request_source?: AccountDeletionRequestSource;
          status?: AccountDeletionRequestStatus;
          failure_stage?: AccountDeletionFailureStage | null;
          failure_reason_code?: string | null;
          provider_cleanup_status?: AccountDeletionCleanupStatus;
          storage_cleanup_status?: AccountDeletionCleanupStatus;
          db_cleanup_status?: AccountDeletionCleanupStatus;
          auth_cleanup_status?: AccountDeletionCleanupStatus;
          notification_status?: AccountDeletionCleanupStatus;
          retry_count?: number;
          requested_at?: string;
          confirmed_at?: string | null;
          processing_started_at?: string | null;
          completed_at?: string | null;
          cancelled_at?: string | null;
          expires_at?: string | null;
          last_attempted_at?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          anonymized_user_ref?: string;
          request_source?: AccountDeletionRequestSource;
          status?: AccountDeletionRequestStatus;
          failure_stage?: AccountDeletionFailureStage | null;
          failure_reason_code?: string | null;
          provider_cleanup_status?: AccountDeletionCleanupStatus;
          storage_cleanup_status?: AccountDeletionCleanupStatus;
          db_cleanup_status?: AccountDeletionCleanupStatus;
          auth_cleanup_status?: AccountDeletionCleanupStatus;
          notification_status?: AccountDeletionCleanupStatus;
          retry_count?: number;
          requested_at?: string;
          confirmed_at?: string | null;
          processing_started_at?: string | null;
          completed_at?: string | null;
          cancelled_at?: string | null;
          expires_at?: string | null;
          last_attempted_at?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          locale: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          locale?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          locale?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      voice_consents: {
        Row: {
          id: string;
          user_id: string;
          provider: string;
          consented_at: string;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider: string;
          consented_at?: string;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          provider?: string;
          consented_at?: string;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      voices: {
        Row: {
          id: string;
          user_id: string;
          provider: string;
          consent_id: string | null;
          provider_voice_id: string;
          label: string;
          sample_audio_path: string | null;
          is_default: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider: string;
          consent_id?: string | null;
          provider_voice_id: string;
          label: string;
          sample_audio_path?: string | null;
          is_default?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          provider?: string;
          consent_id?: string | null;
          provider_voice_id?: string;
          label?: string;
          sample_audio_path?: string | null;
          is_default?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      scripts: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          content: string;
          target_seconds: number;
          locale: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          content: string;
          target_seconds?: number;
          locale?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          content?: string;
          target_seconds?: number;
          locale?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      script_audios: {
        Row: {
          id: string;
          script_id: string;
          voice_id: string | null;
          provider: string;
          cache_key: string;
          storage_path: string;
          stored_asset: Json;
          duration_seconds: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          script_id: string;
          voice_id?: string | null;
          provider: string;
          cache_key: string;
          storage_path: string;
          stored_asset?: Json;
          duration_seconds?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          script_id?: string;
          voice_id?: string | null;
          provider?: string;
          cache_key?: string;
          storage_path?: string;
          stored_asset?: Json;
          duration_seconds?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      script_saved_model_audios: {
        Row: {
          id: string;
          user_id: string;
          script_id: string;
          script_audio_id: string;
          slot: number;
          label: string;
          source: ScriptSavedModelAudioSource;
          metadata: Json;
          saved_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          script_id: string;
          script_audio_id: string;
          slot: number;
          label: string;
          source?: ScriptSavedModelAudioSource;
          metadata?: Json;
          saved_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          script_id?: string;
          script_audio_id?: string;
          slot?: number;
          label?: string;
          source?: ScriptSavedModelAudioSource;
          metadata?: Json;
          saved_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      script_saved_best_takes: {
        Row: {
          id: string;
          user_id: string;
          script_id: string;
          take_id: string;
          slot: number;
          label: string;
          source: ScriptSavedBestTakeSource;
          metadata: Json;
          saved_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          script_id: string;
          take_id: string;
          slot: number;
          label: string;
          source?: ScriptSavedBestTakeSource;
          metadata?: Json;
          saved_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          script_id?: string;
          take_id?: string;
          slot?: number;
          label?: string;
          source?: ScriptSavedBestTakeSource;
          metadata?: Json;
          saved_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      quota_events: {
        Row: {
          id: string;
          user_id: string;
          event_type: QuotaEventType;
          category: QuotaEventCategory;
          status: QuotaEventStatus;
          failure_stage: QuotaEventFailureStage | null;
          failure_code: string | null;
          billing_status: QuotaEventBillingStatus;
          subject_type: QuotaEventSubjectType;
          subject_id: string | null;
          target_resource_type: QuotaEventTargetResourceType;
          target_resource_id: string | null;
          idempotency_key: string | null;
          dedupe_key: string | null;
          request_fingerprint: string | null;
          provider: string | null;
          provider_model: string | null;
          provider_request_id: string | null;
          metadata: Json;
          attempted_at: string;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          event_type: QuotaEventType;
          category?: QuotaEventCategory;
          status: QuotaEventStatus;
          failure_stage?: QuotaEventFailureStage | null;
          failure_code?: string | null;
          billing_status?: QuotaEventBillingStatus;
          subject_type: QuotaEventSubjectType;
          subject_id?: string | null;
          target_resource_type?: QuotaEventTargetResourceType;
          target_resource_id?: string | null;
          idempotency_key?: string | null;
          dedupe_key?: string | null;
          request_fingerprint?: string | null;
          provider?: string | null;
          provider_model?: string | null;
          provider_request_id?: string | null;
          metadata?: Json;
          attempted_at?: string;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          event_type?: QuotaEventType;
          category?: QuotaEventCategory;
          status?: QuotaEventStatus;
          failure_stage?: QuotaEventFailureStage | null;
          failure_code?: string | null;
          billing_status?: QuotaEventBillingStatus;
          subject_type?: QuotaEventSubjectType;
          subject_id?: string | null;
          target_resource_type?: QuotaEventTargetResourceType;
          target_resource_id?: string | null;
          idempotency_key?: string | null;
          dedupe_key?: string | null;
          request_fingerprint?: string | null;
          provider?: string | null;
          provider_model?: string | null;
          provider_request_id?: string | null;
          metadata?: Json;
          attempted_at?: string;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      takes: {
        Row: {
          id: string;
          script_id: string;
          user_id: string;
          audio_path: string;
          duration_seconds: number | null;
          status: string;
          score: number | null;
          total_words: number | null;
          transcript_text: string | null;
          accuracy_score: number | null;
          fluency_score: number | null;
          rhythm_score: number | null;
          evaluation_summary_ja: string | null;
          evaluation_strengths_ja: Json;
          evaluation_payload: Json;
          coach_feedback_payload: Json;
          reviewed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          script_id: string;
          user_id: string;
          audio_path: string;
          duration_seconds?: number | null;
          status?: string;
          score?: number | null;
          total_words?: number | null;
          transcript_text?: string | null;
          accuracy_score?: number | null;
          fluency_score?: number | null;
          rhythm_score?: number | null;
          evaluation_summary_ja?: string | null;
          evaluation_strengths_ja?: Json;
          evaluation_payload?: Json;
          coach_feedback_payload?: Json;
          reviewed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          script_id?: string;
          user_id?: string;
          audio_path?: string;
          duration_seconds?: number | null;
          status?: string;
          score?: number | null;
          total_words?: number | null;
          transcript_text?: string | null;
          accuracy_score?: number | null;
          fluency_score?: number | null;
          rhythm_score?: number | null;
          evaluation_summary_ja?: string | null;
          evaluation_strengths_ja?: Json;
          evaluation_payload?: Json;
          coach_feedback_payload?: Json;
          reviewed_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      weak_words: {
        Row: {
          id: string;
          take_id: string;
          word: string;
          score: number | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          take_id: string;
          word: string;
          score?: number | null;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          take_id?: string;
          word?: string;
          score?: number | null;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      coach_feedback: {
        Row: {
          id: string;
          take_id: string;
          locale: string;
          title: string;
          summary: string;
          bullets: Json;
          next_step: string;
          focus_words: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          take_id: string;
          locale?: string;
          title?: string;
          summary: string;
          bullets?: Json;
          next_step?: string;
          focus_words?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          take_id?: string;
          locale?: string;
          title?: string;
          summary?: string;
          bullets?: Json;
          next_step?: string;
          focus_words?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      persist_review_bundle: {
        Args: {
          p_take_id?: string | null;
          p_script_id: string;
          p_audio_path: string;
          p_duration_seconds?: number | null;
          p_status?: string | null;
          p_score?: number | null;
          p_total_words?: number | null;
          p_transcript_text?: string | null;
          p_accuracy_score?: number | null;
          p_fluency_score?: number | null;
          p_rhythm_score?: number | null;
          p_evaluation_summary_ja?: string | null;
          p_evaluation_strengths_ja?: Json;
          p_evaluation_payload?: Json;
          p_coach_feedback_payload?: Json;
          p_coach_title?: string | null;
          p_coach_summary?: string | null;
          p_coach_bullets?: Json;
          p_coach_next_step?: string | null;
          p_coach_focus_words?: Json;
          p_weak_words?: Json;
        };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
