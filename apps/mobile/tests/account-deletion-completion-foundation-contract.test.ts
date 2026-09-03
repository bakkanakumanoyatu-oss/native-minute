import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const expectedMigrationSha256 = "ff05fd6ffcca8e1a78c62418360e74f2d025f2779dcd6ea9f147919359728beb";
const migrationsDirectory = fileURLToPath(new URL("../../../supabase/migrations", import.meta.url));
const migrationPath = fileURLToPath(
  new URL("../../../supabase/migrations/0027_g5d_completion_foundation.sql", import.meta.url)
);
const resultDocPath = fileURLToPath(
  new URL("../../../docs/g5d-completion-foundation-migration-result.md", import.meta.url)
);
const databaseTypesPath = fileURLToPath(new URL("../../../types/database.ts", import.meta.url));
const migrationBytes = readFileSync(migrationPath);
const migration = migrationBytes.toString("utf8");
const canonicalCompletionExpirySql = "interval '2160 hours'";
const oldTimezoneDependentCompletionExpirySql = "interval '90 days'";

describe("G5D Completion foundation migration contract", () => {
  it("uses the exact next migration identity and pins byte authority", () => {
    const versions = readdirSync(migrationsDirectory)
      .filter((name) => /^\d{4}_.+\.sql$/.test(name))
      .map((name) => name.slice(0, 4))
      .sort();
    const expectedVersions = Array.from({ length: 27 }, (_, index) => String(index + 1).padStart(4, "0"));
    const resultDoc = readFileSync(resultDocPath, "utf8");
    const recordedSha = resultDoc.match(/^SHA-256: `([0-9a-f]{64})`$/m)?.[1];
    const computedSha = createHash("sha256").update(migrationBytes).digest("hex");

    expect(versions).toEqual(expectedVersions);
    expect(computedSha).toBe(expectedMigrationSha256);
    expect(recordedSha).toBe(expectedMigrationSha256);
    expect(recordedSha).toBe(computedSha);
  });

  it("adds no table or column and fails closed before installing Completion authority", () => {
    expect(migration).not.toMatch(/\bcreate\s+table\b/i);
    expect(migration).not.toMatch(/\badd\s+column\b/i);

    const preflight = migration.indexOf("historical account deletion completion rows require reconciliation");
    const constraint = migration.indexOf("account_deletion_requests_completion_terminal_shape_check");
    const rpc = migration.indexOf("create or replace function public.finalize_account_deletion_completion");

    expect(preflight).toBeGreaterThan(-1);
    expect(constraint).toBeGreaterThan(preflight);
    expect(rpc).toBeGreaterThan(constraint);
    for (const marker of [
      "request.status <> 'completed'",
      "request.completed_at is not null",
      "request.expires_at is distinct from request.completed_at + interval '2160 hours'",
      "request.notification_status <> 'not_needed'",
      "request.failure_stage is not null",
      "request.failure_reason_code is not null",
      "request.user_id is not null",
      "request.metadata <> '{}'::jsonb"
    ]) {
      expect(migration.slice(0, constraint)).toContain(marker);
    }
  });

  it("uses one timezone-invariant Completion expiry definition at every authority site", () => {
    expect(2160 * 60 * 60).toBe(7_776_000);
    expect(migration.match(/interval '2160 hours'/g)).toHaveLength(5);
    expect(migration).toContain(canonicalCompletionExpirySql);
    expect(migration).not.toContain(oldTimezoneDependentCompletionExpirySql);
  });

  it("enforces the exact completed composite and one-way immutable transition", () => {
    for (const marker of [
      "status = 'completed'",
      "and expires_at is not null",
      "expires_at = completed_at + interval '2160 hours'",
      "and last_attempted_at is not null",
      "last_attempted_at = completed_at",
      "notification_status = 'not_needed'",
      "status <> 'completed'",
      "and completed_at is null",
      "old.status <> 'confirmed'",
      "completed account deletion authority is immutable"
    ]) {
      expect(migration).toContain(marker);
    }
    expect(migration).toContain(
      "public.account_deletion_completion_prerequisites_terminal(new) is not true"
    );
  });

  it("revalidates exact Provider and Storage parent/child authority", () => {
    for (const marker of [
      "p_request.provider_snapshot_version = 'g5d-2a.account-provider.v1'",
      "p_request.provider_snapshot_status = 'sealed'",
      "p_request.provider_snapshot_seal_version = 1",
      "p_request.provider_locator_scrubbed_at = p_request.provider_sub_finalized_at",
      "p_request.provider_snapshot_target_count::bigint = (",
      "target.user_id is not null",
      "target.reconciliation_status <> 'verified_absent'",
      "target.locator_scrubbed_at is distinct from p_request.provider_sub_finalized_at",
      "p_request.storage_snapshot_version = 'g5d-2e.account-storage.v1'",
      "p_request.storage_snapshot_status = 'sealed'",
      "p_request.storage_snapshot_collection_token is null",
      "p_request.storage_snapshot_fingerprint is null",
      "target.verification_status <> 'verified_absent'",
      "target.locator_scrubbed_at is distinct from p_request.storage_sub_finalized_at"
    ]) {
      expect(migration).toContain(marker);
    }
  });

  it("revalidates DB D/A/R and strict Auth terminal authority", () => {
    for (const marker of [
      "p_request.db_inventory_version = 'g5d-2h.account-db.v1'",
      "p_request.db_observed_row_count::bigint =",
      "p_request.db_deleted_row_count::bigint",
      "p_request.db_anonymized_row_count::bigint",
      "p_request.db_retained_row_count::bigint = 1::bigint",
      "p_request.auth_intent_version = 'g5d-2m.auth-delete.v1'",
      "p_request.auth_delete_target_user_id is null",
      "p_request.auth_verification_result is null",
      "p_request.auth_verification_result_attempt_count is null",
      "p_request.auth_verified_absent_at >= p_request.auth_delete_requested_at",
      "p_request.auth_sub_finalized_at >= p_request.auth_verified_absent_at",
      "p_request.auth_cleanup_status = 'succeeded' and p_request.auth_delete_generation = 1"
    ]) {
      expect(migration).toContain(marker);
    }
  });

  it("performs only the exact first write and returns immutable replay evidence", () => {
    const updateStart = migration.indexOf("update public.account_deletion_requests as request");
    const updateEnd = migration.indexOf("returning * into v_request", updateStart);
    const exactWrite = migration.slice(updateStart, updateEnd);

    for (const assignment of [
      "status = 'completed'",
      "completed_at = v_completed_at",
      "expires_at = v_completed_at + interval '2160 hours'",
      "notification_status = 'not_needed'",
      "failure_stage = null",
      "failure_reason_code = null",
      "last_attempted_at = v_completed_at"
    ]) {
      expect(exactWrite).toContain(assignment);
    }
    for (const forbidden of [
      "anonymized_user_ref =",
      "retry_count =",
      "provider_cleanup_status =",
      "storage_cleanup_status =",
      "db_cleanup_status =",
      "auth_cleanup_status ="
    ]) {
      expect(exactWrite).not.toContain(forbidden);
    }
    expect(migration).toContain("'already_completed'::text");
    expect(migration).toContain("for update");
    expect(migration).not.toContain("current_setting(");
    expect(migration).not.toContain("set_config(");
  });

  it("keeps Auth terminal evidence immutable while permitting unrelated Completion columns", () => {
    expect(migration).toContain("old.auth_sub_finalized_at is not null and v_protected_changed");
    expect(migration).toContain(
      "old.auth_sub_finalized_at is null\n    and new.auth_cleanup_status in ('succeeded', 'not_needed')"
    );
    expect(migration).toContain("account deletion Auth terminal evidence is immutable");
  });

  it("uses one service-role-only RPC and removes direct Completion column authority", () => {
    expect(migration).toContain("language plpgsql\nsecurity definer\nset search_path = pg_catalog, public");
    expect(migration).toContain(
      "alter function public.finalize_account_deletion_completion(uuid)\n  owner to postgres"
    );
    expect(migration).toContain(
      "revoke all on function public.finalize_account_deletion_completion(uuid)\n  from public, anon, authenticated, service_role"
    );
    expect(migration).toContain(
      "grant execute on function public.finalize_account_deletion_completion(uuid)\n  to service_role"
    );

    const grantStart = migration.lastIndexOf("grant update (");
    const directGrant = migration.slice(
      grantStart,
      migration.indexOf(") on public.account_deletion_requests to service_role", grantStart)
    );
    for (const protectedColumn of ["completed_at", "expires_at", "notification_status"]) {
      expect(directGrant).not.toMatch(new RegExp(`\\b${protectedColumn}\\b`));
    }
    for (const preservedColumn of ["status", "confirmed_at", "metadata"]) {
      expect(directGrant).toContain(preservedColumn);
    }
  });

  it("updates only the generated function type surface", () => {
    const databaseTypes = readFileSync(databaseTypesPath, "utf8");

    expect(databaseTypes).toContain("finalize_account_deletion_completion:");
    for (const field of [
      "completion_status",
      "safe_reason",
      "completed_at",
      "expires_at",
      "already_completed"
    ]) {
      expect(databaseTypes).toContain(`${field}:`);
    }
  });
});
