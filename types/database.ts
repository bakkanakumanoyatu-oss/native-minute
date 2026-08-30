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
export type VoiceDeletionOperationStatus =
  | "pending"
  | "processing"
  | "partial_failure"
  | "manual_required"
  | "completed"
  | "failed";
export type VoiceDeletionStage =
  | "snapshot"
  | "consent_withdrawal"
  | "provider_cleanup"
  | "storage_cleanup"
  | "database_cleanup"
  | "post_delete_verification";
export type VoiceDeletionStageStatus =
  | "pending"
  | "processing"
  | "succeeded"
  | "not_needed"
  | "failed"
  | "manual_required";
export type VoiceDeletionTargetKind =
  | "provider_voice"
  | "voice_sample"
  | "voice_consent_recording"
  | "script_audio_storage"
  | "script_audio"
  | "saved_model_audio"
  | "voice_binding";
export type VoiceDeletionTargetStatus =
  | "pending"
  | "delete_requested"
  | "deleted"
  | "verified_absent"
  | "manual_required";
export type VoiceDeletionTargetDeleteOutcome =
  | "not_attempted"
  | "succeeded"
  | "not_found"
  | "timed_out"
  | "unavailable"
  | "rejected"
  | "not_needed";
export type VoiceDeletionTargetVerificationStatus =
  | "not_applicable"
  | "pending"
  | "verified_absent"
  | "present"
  | "unavailable"
  | "manual_required";
export type VoiceAssetWriteIntentKind =
  | "voice_create"
  | "script_audio_create"
  | "voice_sample_upload"
  | "voice_consent_upload";
export type VoiceAssetWriteIntentStatus = "reserved" | "completed" | "cancelled" | "manual_required";

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
      voice_deletion_operations: {
        Row: {
          id: string;
          user_id: string;
          status: VoiceDeletionOperationStatus;
          current_stage: VoiceDeletionStage | null;
          snapshot_version: string;
          snapshot_status: VoiceDeletionStageStatus;
          consent_snapshot_id: string | null;
          consent_snapshot_ids: string[];
          consent_snapshot_state: string;
          consent_withdrawal_status: VoiceDeletionStageStatus;
          post_delete_verification_status: VoiceDeletionStageStatus;
          runner_attempt_count: number;
          snapshot_attempt_count: number;
          consent_attempt_count: number;
          verification_attempt_count: number;
          last_failure_stage: VoiceDeletionStage | null;
          last_failure_category: string | null;
          next_retry_at: string | null;
          manual_reason_category: string | null;
          manual_required_at: string | null;
          lease_token: string | null;
          lease_expires_at: string | null;
          requested_at: string;
          snapshot_at: string | null;
          processing_started_at: string | null;
          destructive_started_at: string | null;
          last_attempted_at: string | null;
          completed_at: string | null;
          failed_at: string | null;
          sensitive_snapshot_scrubbed_at: string | null;
          audit_expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          status?: VoiceDeletionOperationStatus;
          current_stage?: VoiceDeletionStage | null;
          snapshot_version?: string;
          snapshot_status?: VoiceDeletionStageStatus;
          consent_snapshot_id?: string | null;
          consent_snapshot_ids?: string[];
          consent_snapshot_state?: string;
          consent_withdrawal_status?: VoiceDeletionStageStatus;
          post_delete_verification_status?: VoiceDeletionStageStatus;
          runner_attempt_count?: number;
          snapshot_attempt_count?: number;
          consent_attempt_count?: number;
          verification_attempt_count?: number;
          last_failure_stage?: VoiceDeletionStage | null;
          last_failure_category?: string | null;
          next_retry_at?: string | null;
          manual_reason_category?: string | null;
          manual_required_at?: string | null;
          lease_token?: string | null;
          lease_expires_at?: string | null;
          requested_at?: string;
          snapshot_at?: string | null;
          processing_started_at?: string | null;
          destructive_started_at?: string | null;
          last_attempted_at?: string | null;
          completed_at?: string | null;
          failed_at?: string | null;
          sensitive_snapshot_scrubbed_at?: string | null;
          audit_expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          status?: VoiceDeletionOperationStatus;
          current_stage?: VoiceDeletionStage | null;
          snapshot_version?: string;
          snapshot_status?: VoiceDeletionStageStatus;
          consent_snapshot_id?: string | null;
          consent_snapshot_ids?: string[];
          consent_snapshot_state?: string;
          consent_withdrawal_status?: VoiceDeletionStageStatus;
          post_delete_verification_status?: VoiceDeletionStageStatus;
          runner_attempt_count?: number;
          snapshot_attempt_count?: number;
          consent_attempt_count?: number;
          verification_attempt_count?: number;
          last_failure_stage?: VoiceDeletionStage | null;
          last_failure_category?: string | null;
          next_retry_at?: string | null;
          manual_reason_category?: string | null;
          manual_required_at?: string | null;
          lease_token?: string | null;
          lease_expires_at?: string | null;
          requested_at?: string;
          snapshot_at?: string | null;
          processing_started_at?: string | null;
          destructive_started_at?: string | null;
          last_attempted_at?: string | null;
          completed_at?: string | null;
          failed_at?: string | null;
          sensitive_snapshot_scrubbed_at?: string | null;
          audit_expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      voice_asset_write_intents: {
        Row: {
          id: string;
          user_id: string;
          kind: VoiceAssetWriteIntentKind;
          status: VoiceAssetWriteIntentStatus;
          lease_token: string | null;
          lease_expires_at: string | null;
          script_id: string | null;
          voice_id: string | null;
          cache_key: string | null;
          storage_bucket: string | null;
          storage_object_key: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          kind: VoiceAssetWriteIntentKind;
          status?: VoiceAssetWriteIntentStatus;
          lease_token?: string | null;
          lease_expires_at?: string | null;
          script_id?: string | null;
          voice_id?: string | null;
          cache_key?: string | null;
          storage_bucket?: string | null;
          storage_object_key?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["voice_asset_write_intents"]["Insert"]>;
        Relationships: [];
      };
      voice_deletion_targets: {
        Row: {
          id: string;
          operation_id: string;
          user_id: string;
          target_kind: VoiceDeletionTargetKind;
          source_row_id: string | null;
          provider_name: string | null;
          provider_resource_id: string | null;
          storage_bucket: string | null;
          storage_object_key: string | null;
          target_fingerprint: string | null;
          status: VoiceDeletionTargetStatus;
          delete_outcome: VoiceDeletionTargetDeleteOutcome;
          reconciliation_status: VoiceDeletionTargetVerificationStatus;
          verification_status: VoiceDeletionTargetVerificationStatus;
          delete_attempt_count: number;
          verification_attempt_count: number;
          last_failure_category: string | null;
          last_attempted_at: string | null;
          delete_succeeded_at: string | null;
          verified_absent_at: string | null;
          manual_required_at: string | null;
          locator_scrubbed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          operation_id: string;
          user_id: string;
          target_kind: VoiceDeletionTargetKind;
          source_row_id?: string | null;
          provider_name?: string | null;
          provider_resource_id?: string | null;
          storage_bucket?: string | null;
          storage_object_key?: string | null;
          target_fingerprint?: string | null;
          status?: VoiceDeletionTargetStatus;
          delete_outcome?: VoiceDeletionTargetDeleteOutcome;
          reconciliation_status?: VoiceDeletionTargetVerificationStatus;
          verification_status?: VoiceDeletionTargetVerificationStatus;
          delete_attempt_count?: number;
          verification_attempt_count?: number;
          last_failure_category?: string | null;
          last_attempted_at?: string | null;
          delete_succeeded_at?: string | null;
          verified_absent_at?: string | null;
          manual_required_at?: string | null;
          locator_scrubbed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          operation_id?: string;
          user_id?: string;
          target_kind?: VoiceDeletionTargetKind;
          source_row_id?: string | null;
          provider_name?: string | null;
          provider_resource_id?: string | null;
          storage_bucket?: string | null;
          storage_object_key?: string | null;
          target_fingerprint?: string | null;
          status?: VoiceDeletionTargetStatus;
          delete_outcome?: VoiceDeletionTargetDeleteOutcome;
          reconciliation_status?: VoiceDeletionTargetVerificationStatus;
          verification_status?: VoiceDeletionTargetVerificationStatus;
          delete_attempt_count?: number;
          verification_attempt_count?: number;
          last_failure_category?: string | null;
          last_attempted_at?: string | null;
          delete_succeeded_at?: string | null;
          verified_absent_at?: string | null;
          manual_required_at?: string | null;
          locator_scrubbed_at?: string | null;
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
      processing_consents: {
        Row: {
          id: string;
          user_id: string;
          consent_type: "pronunciation_processing" | "voice_cloning";
          consent_version: string;
          purpose_id: string;
          purpose_version: string;
          provider_set: string[];
          data_categories: string[];
          status: "active" | "withdrawn";
          accepted_at: string;
          withdrawn_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          consent_type: "pronunciation_processing" | "voice_cloning";
          consent_version: string;
          purpose_id: string;
          purpose_version: string;
          provider_set: string[];
          data_categories: string[];
          status?: "active" | "withdrawn";
          accepted_at?: string;
          withdrawn_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          consent_type?: "pronunciation_processing" | "voice_cloning";
          consent_version?: string;
          purpose_id?: string;
          purpose_version?: string;
          provider_set?: string[];
          data_categories?: string[];
          status?: "active" | "withdrawn";
          accepted_at?: string;
          withdrawn_at?: string | null;
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
      create_or_get_voice_deletion_operation: {
        Args: {
          p_user_id: string;
        };
        Returns: Array<{
          operation_id: string;
          created: boolean;
        }>;
      };
      seal_voice_deletion_snapshot: {
        Args: {
          p_operation_id: string;
          p_user_id: string;
          p_targets: Json;
        };
        Returns: Database["public"]["Tables"]["voice_deletion_operations"]["Row"];
      };
      reserve_voice_asset_write_intent: {
        Args: {
          p_user_id: string;
          p_kind: VoiceAssetWriteIntentKind;
          p_lease_token: string;
          p_lease_seconds: number;
          p_script_id?: string | null;
          p_voice_id?: string | null;
          p_cache_key?: string | null;
          p_storage_bucket?: string | null;
          p_storage_object_key?: string | null;
        };
        Returns: Database["public"]["Tables"]["voice_asset_write_intents"]["Row"];
      };
      cancel_voice_asset_write_intent: {
        Args: {
          p_intent_id: string;
          p_user_id: string;
          p_lease_token: string;
          p_known_no_side_effect: boolean;
        };
        Returns: Database["public"]["Tables"]["voice_asset_write_intents"]["Row"];
      };
      finalize_voice_upload_write_intent: {
        Args: {
          p_intent_id: string;
          p_user_id: string;
          p_lease_token: string;
          p_storage_bucket: string;
          p_storage_object_key: string;
        };
        Returns: Database["public"]["Tables"]["voice_asset_write_intents"]["Row"];
      };
      finalize_voice_create_write_intent: {
        Args: {
          p_intent_id: string;
          p_user_id: string;
          p_lease_token: string;
          p_consent_id: string;
          p_provider_voice_id: string;
          p_label: string;
          p_sample_audio_path?: string | null;
        };
        Returns: Database["public"]["Tables"]["voices"]["Row"];
      };
      finalize_script_audio_write_intent: {
        Args: {
          p_intent_id: string;
          p_user_id: string;
          p_lease_token: string;
          p_provider: string;
          p_storage_path: string;
          p_stored_asset: Json;
          p_duration_seconds?: number | null;
        };
        Returns: Database["public"]["Tables"]["script_audios"]["Row"];
      };
      claim_voice_deletion_operation_lease: {
        Args: {
          p_operation_id: string;
          p_user_id: string;
          p_lease_token: string;
          p_lease_seconds: number;
        };
        Returns: Database["public"]["Tables"]["voice_deletion_operations"]["Row"];
      };
      release_voice_deletion_operation_lease: {
        Args: {
          p_operation_id: string;
          p_user_id: string;
          p_lease_token: string;
        };
        Returns: Database["public"]["Tables"]["voice_deletion_operations"]["Row"];
      };
      finalize_voice_deletion_operation: {
        Args: {
          p_operation_id: string;
          p_user_id: string;
          p_lease_token: string;
        };
        Returns: Database["public"]["Tables"]["voice_deletion_operations"]["Row"];
      };
      seal_voice_deletion_consent_snapshot: {
        Args: {
          p_operation_id: string;
          p_user_id: string;
          p_lease_token: string;
          p_expected_runner_attempt_count: number;
        };
        Returns: Database["public"]["Tables"]["voice_deletion_operations"]["Row"];
      };
      withdraw_voice_deletion_current_consents: {
        Args: {
          p_operation_id: string;
          p_user_id: string;
          p_lease_token: string;
          p_expected_runner_attempt_count: number;
        };
        Returns: Database["public"]["Tables"]["voice_deletion_operations"]["Row"];
      };
      enter_voice_deletion_database_cleanup_stage: {
        Args: {
          p_operation_id: string;
          p_user_id: string;
          p_lease_token: string;
          p_expected_runner_attempt_count: number;
        };
        Returns: Database["public"]["Tables"]["voice_deletion_operations"]["Row"];
      };
      cleanup_voice_deletion_database_targets: {
        Args: {
          p_operation_id: string;
          p_user_id: string;
          p_lease_token: string;
          p_expected_runner_attempt_count: number;
        };
        Returns: Database["public"]["Tables"]["voice_deletion_operations"]["Row"];
      };
      mark_voice_deletion_preflight_manual_required: {
        Args: {
          p_user_id: string;
        };
        Returns: Database["public"]["Tables"]["voice_deletion_operations"]["Row"];
      };
      enter_voice_deletion_post_delete_verification_stage: {
        Args: {
          p_operation_id: string;
          p_user_id: string;
          p_lease_token: string;
          p_expected_runner_attempt_count: number;
        };
        Returns: Database["public"]["Tables"]["voice_deletion_operations"]["Row"];
      };
      complete_voice_deletion_post_delete_verification: {
        Args: {
          p_operation_id: string;
          p_user_id: string;
          p_lease_token: string;
          p_expected_runner_attempt_count: number;
        };
        Returns: Database["public"]["Tables"]["voice_deletion_operations"]["Row"];
      };
      accept_g5c_b7_manual_provider_absence: {
        Args: {
          p_operation_id: string;
          p_user_id: string;
          p_target_id: string;
          p_lease_token: string;
          p_expected_runner_attempt_count: number;
          p_expected_verification_attempt_count: number;
        };
        Returns: Database["public"]["Tables"]["voice_deletion_operations"]["Row"];
      };
      begin_provider_voice_delete_attempt: {
        Args: {
          p_operation_id: string;
          p_user_id: string;
          p_target_id: string;
          p_lease_token: string;
          p_expected_delete_attempt_count: number;
        };
        Returns: Database["public"]["Tables"]["voice_deletion_targets"]["Row"];
      };
      record_provider_voice_delete_result: {
        Args: {
          p_operation_id: string;
          p_user_id: string;
          p_target_id: string;
          p_lease_token: string;
          p_expected_delete_attempt_count: number;
          p_result: string;
          p_retry_delay_seconds: number;
        };
        Returns: Database["public"]["Tables"]["voice_deletion_targets"]["Row"];
      };
      begin_provider_voice_reconciliation_attempt: {
        Args: {
          p_operation_id: string;
          p_user_id: string;
          p_target_id: string;
          p_lease_token: string;
          p_expected_verification_attempt_count: number;
        };
        Returns: Database["public"]["Tables"]["voice_deletion_targets"]["Row"];
      };
      record_provider_voice_reconciliation_result: {
        Args: {
          p_operation_id: string;
          p_user_id: string;
          p_target_id: string;
          p_lease_token: string;
          p_expected_verification_attempt_count: number;
          p_result: string;
          p_owner_signal: string | null;
          p_retry_delay_seconds: number;
        };
        Returns: Database["public"]["Tables"]["voice_deletion_targets"]["Row"];
      };
      enter_voice_deletion_storage_cleanup_stage: {
        Args: {
          p_operation_id: string;
          p_user_id: string;
          p_lease_token: string;
          p_expected_runner_attempt_count: number;
        };
        Returns: Database["public"]["Tables"]["voice_deletion_operations"]["Row"];
      };
      begin_storage_object_delete_attempt: {
        Args: {
          p_operation_id: string;
          p_user_id: string;
          p_target_id: string;
          p_lease_token: string;
          p_expected_delete_attempt_count: number;
        };
        Returns: Database["public"]["Tables"]["voice_deletion_targets"]["Row"];
      };
      record_storage_object_delete_result: {
        Args: {
          p_operation_id: string;
          p_user_id: string;
          p_target_id: string;
          p_lease_token: string;
          p_expected_delete_attempt_count: number;
          p_result: string;
          p_retry_delay_seconds: number;
        };
        Returns: Database["public"]["Tables"]["voice_deletion_targets"]["Row"];
      };
      begin_storage_object_verification_attempt: {
        Args: {
          p_operation_id: string;
          p_user_id: string;
          p_target_id: string;
          p_lease_token: string;
          p_expected_verification_attempt_count: number;
        };
        Returns: Database["public"]["Tables"]["voice_deletion_targets"]["Row"];
      };
      record_storage_object_verification_result: {
        Args: {
          p_operation_id: string;
          p_user_id: string;
          p_target_id: string;
          p_lease_token: string;
          p_expected_verification_attempt_count: number;
          p_result: string;
          p_retry_delay_seconds: number;
        };
        Returns: Database["public"]["Tables"]["voice_deletion_targets"]["Row"];
      };
      mark_storage_object_invalid_target_manual_required: {
        Args: {
          p_operation_id: string;
          p_user_id: string;
          p_target_id: string;
          p_lease_token: string;
          p_expected_delete_attempt_count: number;
          p_expected_verification_attempt_count: number;
        };
        Returns: Database["public"]["Tables"]["voice_deletion_targets"]["Row"];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
