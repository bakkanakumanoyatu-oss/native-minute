import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  ACCOUNT_DELETION_DATABASE_INVENTORY_VERSION,
  ACCOUNT_DELETION_DATABASE_STAGE_PREREQUISITES,
  ACCOUNT_DELETION_DATABASE_TABLE_CONTRACT,
  ACCOUNT_DELETION_VOICE_WRITE_AUTHORITY
} from "@/services/account-deletion/account-deletion-database-contract";

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/0024_g5d_2h_db_anonymization_retention_owner_lifecycle_foundation.sql",
      import.meta.url
    )
  ),
  "utf8"
);
const legacyService = readFileSync(
  fileURLToPath(new URL("../../../services/account-deletion/account-deletion.service.ts", import.meta.url)),
  "utf8"
);
const databaseTypes = readFileSync(
  fileURLToPath(new URL("../../../types/database.ts", import.meta.url)),
  "utf8"
);

describe("G5D-2H exact current DB contract", () => {
  it("fixes the current public inventory at exactly 18 unique tables", () => {
    expect(ACCOUNT_DELETION_DATABASE_INVENTORY_VERSION).toBe("g5d-2h.account-db.v1");
    expect(ACCOUNT_DELETION_DATABASE_TABLE_CONTRACT).toHaveLength(18);
    expect(new Set(ACCOUNT_DELETION_DATABASE_TABLE_CONTRACT.map(({ table }) => table)).size).toBe(18);
    expect(ACCOUNT_DELETION_DATABASE_TABLE_CONTRACT.map(({ table }) => table)).toEqual([
      "profiles",
      "scripts",
      "script_audios",
      "takes",
      "weak_words",
      "coach_feedback",
      "script_saved_model_audios",
      "script_saved_best_takes",
      "voices",
      "voice_consents",
      "processing_consents",
      "voice_deletion_operations",
      "voice_deletion_targets",
      "voice_asset_write_intents",
      "account_deletion_requests",
      "account_deletion_provider_targets",
      "quota_events",
      "account_deletion_storage_targets"
    ]);
  });

  it("preserves Provider then Storage persisted sub-finalizer prerequisites", () => {
    expect(ACCOUNT_DELETION_DATABASE_STAGE_PREREQUISITES).toEqual({
      provider: {
        statuses: ["succeeded", "not_needed"],
        subFinalizedField: "provider_sub_finalized_at"
      },
      storage: {
        statuses: ["succeeded", "not_needed"],
        subFinalizedField: "storage_sub_finalized_at"
      }
    });
  });

  it("keeps active/manual voice and writer states blocking", () => {
    expect(ACCOUNT_DELETION_VOICE_WRITE_AUTHORITY.voiceAssetWriteIntents).toEqual({
      reserved: "BLOCK",
      manual_required: "BLOCK",
      completed: "DELETE_CANDIDATE",
      cancelled: "DELETE_CANDIDATE"
    });
    expect(ACCOUNT_DELETION_VOICE_WRITE_AUTHORITY.voiceDeletionOperations).toMatchObject({
      pending: "BLOCK",
      processing: "BLOCK",
      partial_failure: "BLOCK",
      manual_required: "BLOCK",
      unsafe_failed: "BLOCK",
      completed_verified_scrubbed: "ANONYMIZE_RETAIN",
      completed_invalid: "BLOCK"
    });
  });
});

describe("G5D-2H migration contract", () => {
  it("adds nullable SET NULL voice/quota owners and the dual voice-target lifetime FKs", () => {
    expect(migration).toContain("foreign key (user_id) references auth.users(id) on delete set null");
    expect(migration).toContain("references public.voice_deletion_operations(id)\n    on delete cascade");
    expect(migration).toContain("references public.voice_deletion_operations(id, user_id)\n    on update cascade\n    on delete cascade");
    expect(migration).toContain("voice_deletion_operations_audit_expires_at_idx");
    expect(migration).toContain("voice deletion audit owner anonymization requires a completed verified scrubbed audit");
    expect(migration).toContain("pg_trigger_depth() > 1");
  });

  it("anchors quota expiry to attempted_at and inventories every identifying field", () => {
    expect(migration).toContain("retention_expires_at = attempted_at + interval '90 days'");
    for (const field of [
      "subject_id",
      "target_resource_id",
      "idempotency_key",
      "dedupe_key",
      "request_fingerprint",
      "provider_request_id"
    ]) {
      expect(migration).toContain(`${field} is null`);
    }
    expect(migration).toContain("metadata = '{}'::jsonb");
    expect(migration).toContain("quota_events_retention_expires_at_idx");
  });

  it("adds DB evidence while making terminal success unreachable without a future finalizer", () => {
    for (const field of [
      "db_inventory_version",
      "db_observed_row_count",
      "db_deleted_row_count",
      "db_anonymized_row_count",
      "db_retained_row_count",
      "db_sub_finalized_at"
    ]) {
      expect(migration).toContain(field);
      expect(databaseTypes).toContain(field);
    }
    expect(migration).toContain("account deletion DB terminal state is unavailable before focused finalizer installation");
    expect(migration).not.toContain("current_setting(");
    expect(migration).not.toContain("set_config(");
    expect(migration).not.toMatch(/create\s+(or\s+replace\s+)?function\s+public\.finalize_account_deletion_db/i);
  });
});

describe("G5D-2H legacy sequential DB executor isolation", () => {
  it("fails closed before inventory, delete/anonymize, terminal status, or Auth paths", () => {
    const entry = legacyService.indexOf("export async function runDatabaseCleanupActual");
    const guard = legacyService.indexOf("db_durable_authority_required", entry);

    expect(legacyService).toContain("LEGACY_DATABASE_CLEANUP_DURABLE_AUTHORITY_REQUIRED = true");
    expect(guard).toBeGreaterThan(entry);
    expect(guard).toBeLessThan(legacyService.indexOf("const dryRun = await planDatabaseCleanupDryRun", entry));
    expect(guard).toBeLessThan(legacyService.indexOf("const cleanupDatabase = input.cleanupDatabase", entry));
    expect(guard).toBeLessThan(legacyService.indexOf('db_cleanup_status: "succeeded"', entry));
    expect(legacyService.slice(entry, guard)).not.toContain("deleteUser");
  });
});
