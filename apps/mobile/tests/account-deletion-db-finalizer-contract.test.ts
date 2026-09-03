import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  ACCOUNT_DELETION_DATABASE_FINALIZER_RPC,
  ACCOUNT_DELETION_DATABASE_INVENTORY_VERSION,
  ACCOUNT_DELETION_DATABASE_TABLE_CONTRACT,
  ACCOUNT_DELETION_DATABASE_WRITER_FENCE_TABLES
} from "@/services/account-deletion/account-deletion-database-contract";

const expectedMigrationSha256 = "8dcee3373fa67edcbbf9356d708c6d3a722b2f916cfd4659198238a750934814";
const migrationPath = fileURLToPath(
  new URL("../../../supabase/migrations/0025_g5d_2j_atomic_db_finalizer.sql", import.meta.url)
);
const resultDocPath = fileURLToPath(
  new URL(
    "../../../docs/g5d-2j-atomic-db-finalizer-rpc-and-transactional-runtime-proof-result.md",
    import.meta.url
  )
);
const migrationBytes = readFileSync(migrationPath);
const migration = migrationBytes.toString("utf8");
const resultDoc = readFileSync(resultDocPath, "utf8");
const legacyService = readFileSync(
  fileURLToPath(new URL("../../../services/account-deletion/account-deletion.service.ts", import.meta.url)),
  "utf8"
);
const databaseTypes = readFileSync(
  fileURLToPath(new URL("../../../types/database.ts", import.meta.url)),
  "utf8"
);

describe("G5D-2J atomic database finalizer contract", () => {
  it("pins the exact migration bytes and matching result-doc SHA authority", () => {
    const computedMigrationSha256 = createHash("sha256").update(migrationBytes).digest("hex");
    const recordedMigrationSha256 = resultDoc.match(/^SHA-256: `([0-9a-f]{64})`$/m)?.[1];

    expect(computedMigrationSha256).toBe(expectedMigrationSha256);
    expect(recordedMigrationSha256).toBe(expectedMigrationSha256);
    expect(recordedMigrationSha256).toBe(computedMigrationSha256);
  });

  it("keeps one exact static 18-table inventory and version", () => {
    expect(ACCOUNT_DELETION_DATABASE_INVENTORY_VERSION).toBe("g5d-2h.account-db.v1");
    expect(ACCOUNT_DELETION_DATABASE_TABLE_CONTRACT).toHaveLength(18);

    for (const { table } of ACCOUNT_DELETION_DATABASE_TABLE_CONTRACT) {
      expect(migration).toContain(`from public.${table}`);
    }

    expect(migration).not.toMatch(/\bexecute\s+(format\s*\(|v_)/i);
    expect(migration).not.toContain("information_schema.tables");
    expect(migration).not.toContain("current_setting(");
    expect(migration).not.toContain("set_config(");
  });

  it("exposes only the focused service-role RPC with generated-compatible types", () => {
    expect(ACCOUNT_DELETION_DATABASE_FINALIZER_RPC).toEqual({
      name: "finalize_account_deletion_database_stage",
      inventoryVersion: "g5d-2h.account-db.v1",
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
    });
    expect(migration).toMatch(
      /create or replace function public\.finalize_account_deletion_database_stage\(\s*p_deletion_request_id uuid,\s*p_expected_user_id uuid,\s*p_expected_db_inventory_version text\s*\)/
    );
    expect(migration).toContain("language plpgsql\nsecurity definer\nset search_path = pg_catalog, public");
    expect(migration).toContain(
      "alter function public.finalize_account_deletion_database_stage(uuid, uuid, text) owner to postgres"
    );
    expect(migration).toContain(
      "grant execute on function public.finalize_account_deletion_database_stage(uuid, uuid, text)\n  to service_role"
    );
    expect(databaseTypes).toContain("finalize_account_deletion_database_stage");
    for (const field of ACCOUNT_DELETION_DATABASE_FINALIZER_RPC.resultFields) {
      expect(databaseTypes).toContain(field);
    }
  });

  it("requires exact persisted Provider and Storage terminal evidence", () => {
    for (const marker of [
      "provider_snapshot_version <> 'g5d-2a.account-provider.v1'",
      "provider_snapshot_status <> 'sealed'",
      "provider_sub_finalized_at is null",
      "provider_locator_scrubbed_at is distinct from v_request.provider_sub_finalized_at",
      "storage_snapshot_version <> 'g5d-2e.account-storage.v1'",
      "storage_snapshot_status <> 'sealed'",
      "storage_snapshot_collection_token is not null",
      "storage_snapshot_fingerprint is not null",
      "storage_sub_finalized_at is null",
      "storage_locator_scrubbed_at is distinct from v_request.storage_sub_finalized_at"
    ]) {
      expect(migration).toContain(marker);
    }
    expect(migration).toContain("db_finalizer_provider_prerequisite_invalid");
    expect(migration).toContain("db_finalizer_storage_prerequisite_invalid");
  });

  it("revalidates prerequisites and exact owned post-state before an already-finalized replay", () => {
    const providerValidation = migration.indexOf("select count(*) into v_current_provider_targets");
    const storageValidation = migration.indexOf("select count(*) into v_current_storage_targets");
    const replayValidation = migration.indexOf("if v_already_finalized then");
    const replayReturn = migration.indexOf("'already_finalized'::text", replayValidation);

    expect(providerValidation).toBeGreaterThan(-1);
    expect(storageValidation).toBeGreaterThan(providerValidation);
    expect(replayValidation).toBeGreaterThan(storageValidation);
    expect(replayReturn).toBeGreaterThan(replayValidation);
    expect(migration).toContain("db_terminal_post_state_invalid");
    expect(migration).toContain(
      "v_request.db_retained_row_count <>\n        1 + v_current_provider_targets + v_current_storage_targets"
    );
    expect(migration).toContain("exists (select 1 from public.scripts where user_id = v_owned_user_id)");
    expect(migration).toContain(
      "exists (select 1 from public.account_deletion_requests where user_id = v_owned_user_id and id <> p_deletion_request_id)"
    );
  });

  it("requires zero/not_needed and nonzero/succeeded polarity before deleting prior evidence", () => {
    for (const marker of [
      "prior.provider_cleanup_status = 'not_needed' and prior.provider_snapshot_target_count = 0",
      "prior.provider_cleanup_status = 'succeeded' and prior.provider_snapshot_target_count > 0",
      "t.locator_scrubbed_at is distinct from prior.provider_sub_finalized_at",
      "prior.storage_cleanup_status = 'not_needed' and prior.storage_snapshot_target_count = 0",
      "prior.storage_cleanup_status = 'succeeded' and prior.storage_snapshot_target_count > 0",
      "t.locator_scrubbed_at is distinct from prior.storage_sub_finalized_at"
    ]) {
      expect(migration).toContain(marker);
    }
  });

  it("installs the narrow post-Storage writer fences", () => {
    expect(ACCOUNT_DELETION_DATABASE_WRITER_FENCE_TABLES).toHaveLength(10);
    for (const table of ACCOUNT_DELETION_DATABASE_WRITER_FENCE_TABLES) {
      expect(migration).toContain(`on public.${table}`);
    }
    expect(migration).toContain("storage_snapshot_status = 'sealed'");
    expect(migration).toContain("storage_cleanup_status in ('succeeded', 'not_needed')");
    expect(migration).toContain("storage_sub_finalized_at is not null");
    expect(migration).toContain("g5d_2j_lock_db_writer_users");
    expect(migration).toContain("g5c_b4_lock_voice_asset_user(v_user_id)");
    expect(migration).toContain("enforce_g5d_2j_storage_terminal_db_writer_lock");
  });

  it("keeps unsafe writer and voice authority blocking", () => {
    expect(migration).toContain("status in ('reserved', 'manual_required')");
    expect(migration).toContain("status not in ('completed', 'cancelled')");
    expect(migration).toContain("db_finalizer_write_intent_blocked");
    expect(migration).toContain("db_finalizer_voice_operation_blocked");
    expect(migration).toContain("operation.status = 'completed'");
    expect(migration).toContain("target.status <> 'verified_absent'");
  });

  it("partitions every observed row exactly into D/A/R and verifies post-state", () => {
    expect(migration).toContain("v_observed <> v_deleted + v_anonymized + v_retained");
    expect(migration).toContain(
      "v_retained := 1 + v_current_provider_targets + v_current_storage_targets"
    );
    expect(migration).toContain("retention_expires_at > v_now");
    expect(migration).toContain("retention_expires_at <= v_now");
    expect(migration).toContain("delete from public.voice_deletion_operations");
    expect(migration).toContain("update public.voice_deletion_operations set user_id = null");
    expect(migration).toContain("delete from public.quota_events");
    expect(migration).toContain("identifier_scrubbed_at = v_now");
    expect(migration).toContain("db_finalizer_post_state_owned_inventory_invalid");
    expect(migration).toContain("db_finalizer_post_state_retention_invalid");
    expect(migration).toContain("db_finalizer_retained_stage_evidence_invalid");
  });

  it("makes terminal evidence immutable and removes direct service-role column authority", () => {
    expect(migration).toContain("security invoker");
    expect(migration).toContain("account deletion DB terminal evidence is immutable");
    expect(migration).toContain(
      "revoke update on table public.account_deletion_requests from public, anon, authenticated, service_role"
    );

    const directGrant = migration.slice(
      migration.indexOf("grant update ("),
      migration.indexOf(") on public.account_deletion_requests to service_role")
    );
    for (const protectedField of [
      "db_cleanup_status",
      "db_inventory_version",
      "db_observed_row_count",
      "db_deleted_row_count",
      "db_anonymized_row_count",
      "db_retained_row_count",
      "db_sub_finalized_at"
    ]) {
      expect(directGrant).not.toContain(protectedField);
    }
  });

  it("keeps the legacy sequential executor fail-closed before every mutation path", () => {
    const entry = legacyService.indexOf("export async function runDatabaseCleanupActual");
    const guard = legacyService.indexOf("db_durable_authority_required", entry);

    expect(entry).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(entry);
    expect(guard).toBeLessThan(legacyService.indexOf("const dryRun = await planDatabaseCleanupDryRun", entry));
    expect(guard).toBeLessThan(legacyService.indexOf("const cleanupDatabase = input.cleanupDatabase", entry));
    expect(legacyService.slice(entry, guard)).not.toContain("deleteUser");
  });
});
