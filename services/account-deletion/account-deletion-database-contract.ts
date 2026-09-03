export const ACCOUNT_DELETION_DATABASE_INVENTORY_VERSION = "g5d-2h.account-db.v1" as const;

export type AccountDeletionDatabaseDisposition =
  | "DELETE"
  | "CASCADE"
  | "ANONYMIZE_RETAIN"
  | "RETAIN_SCRUBBED"
  | "BLOCKING_AUTHORITY";

export type AccountDeletionDatabaseTableContract = {
  table: string;
  disposition: AccountDeletionDatabaseDisposition;
  resolvedDisposition?: Exclude<AccountDeletionDatabaseDisposition, "BLOCKING_AUTHORITY">;
  authority: string;
};

// Exact current public-table authority after migration 0023. This is deliberately
// concrete rather than a generic retention framework; the next focused atomic DB
// finalizer must consume this exact version and all 18 entries.
export const ACCOUNT_DELETION_DATABASE_TABLE_CONTRACT = [
  { table: "profiles", disposition: "DELETE", authority: "owned profile; delete explicitly before Auth" },
  { table: "scripts", disposition: "DELETE", authority: "owned scripts after Storage absence" },
  { table: "script_audios", disposition: "CASCADE", authority: "cascade from classified script deletion" },
  { table: "takes", disposition: "DELETE", authority: "owned takes after recording absence" },
  { table: "weak_words", disposition: "CASCADE", authority: "cascade from classified take deletion" },
  { table: "coach_feedback", disposition: "CASCADE", authority: "cascade from classified take deletion" },
  { table: "script_saved_model_audios", disposition: "CASCADE", authority: "dependent saved library state" },
  { table: "script_saved_best_takes", disposition: "CASCADE", authority: "dependent saved take state" },
  { table: "voices", disposition: "DELETE", authority: "delete after Provider and Storage terminality" },
  { table: "voice_consents", disposition: "DELETE", authority: "delete after consent recording absence" },
  { table: "processing_consents", disposition: "DELETE", authority: "owned processing consent history" },
  {
    table: "voice_deletion_operations",
    disposition: "BLOCKING_AUTHORITY",
    resolvedDisposition: "ANONYMIZE_RETAIN",
    authority: "active/manual/invalid states block; only completed verified scrubbed audit retains"
  },
  {
    table: "voice_deletion_targets",
    disposition: "RETAIN_SCRUBBED",
    authority: "retain only with eligible completed parent; purge by parent cascade"
  },
  {
    table: "voice_asset_write_intents",
    disposition: "BLOCKING_AUTHORITY",
    resolvedDisposition: "DELETE",
    authority: "reserved/manual block; completed/cancelled are classified delete candidates"
  },
  {
    table: "account_deletion_requests",
    disposition: "ANONYMIZE_RETAIN",
    authority: "retain current scrubbed request authority; prior classified rows delete later"
  },
  {
    table: "account_deletion_provider_targets",
    disposition: "RETAIN_SCRUBBED",
    authority: "closed Provider sub-finalizer evidence; parent purge cascades"
  },
  {
    table: "quota_events",
    disposition: "ANONYMIZE_RETAIN",
    authority: "scrub identifiers and retain safe classifications until attempted_at + 90 days"
  },
  {
    table: "account_deletion_storage_targets",
    disposition: "RETAIN_SCRUBBED",
    authority: "closed Storage sub-finalizer evidence; parent purge cascades"
  }
] as const satisfies readonly AccountDeletionDatabaseTableContract[];

export const ACCOUNT_DELETION_DATABASE_STAGE_PREREQUISITES = {
  provider: {
    statuses: ["succeeded", "not_needed"],
    subFinalizedField: "provider_sub_finalized_at"
  },
  storage: {
    statuses: ["succeeded", "not_needed"],
    subFinalizedField: "storage_sub_finalized_at"
  }
} as const;

export const ACCOUNT_DELETION_DATABASE_FINALIZER_RPC = {
  name: "finalize_account_deletion_database_stage",
  inventoryVersion: ACCOUNT_DELETION_DATABASE_INVENTORY_VERSION,
  arguments: [
    "p_deletion_request_id",
    "p_expected_user_id",
    "p_expected_db_inventory_version"
  ],
  resultFields: [
    "db_cleanup_status",
    "safe_reason",
    "db_observed_row_count",
    "db_deleted_row_count",
    "db_anonymized_row_count",
    "db_retained_row_count",
    "already_finalized"
  ]
} as const;

// These are the production write surfaces that are not already closed by the
// Storage writer fence or its parent/cascade relationships.
export const ACCOUNT_DELETION_DATABASE_WRITER_FENCE_TABLES = [
  "profiles",
  "scripts",
  "processing_consents",
  "quota_events",
  "script_saved_model_audios",
  "script_saved_best_takes",
  "weak_words",
  "coach_feedback",
  "voice_deletion_operations",
  "voice_deletion_targets"
] as const;

export const ACCOUNT_DELETION_VOICE_WRITE_AUTHORITY = {
  voiceAssetWriteIntents: {
    reserved: "BLOCK",
    manual_required: "BLOCK",
    completed: "DELETE_CANDIDATE",
    cancelled: "DELETE_CANDIDATE"
  },
  voiceDeletionOperations: {
    pending: "BLOCK",
    processing: "BLOCK",
    partial_failure: "BLOCK",
    manual_required: "BLOCK",
    unsafe_failed: "BLOCK",
    completed_verified_scrubbed: "ANONYMIZE_RETAIN",
    completed_invalid: "BLOCK"
  }
} as const;
