import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL("../../../supabase/migrations/0015_g5c_b1_voice_deletion_durable_state.sql", import.meta.url)
);
const repositoryPath = fileURLToPath(
  new URL("../../../services/voice-deletion/voice-deletion.repository.ts", import.meta.url)
);
const voiceDeletionServicePath = fileURLToPath(
  new URL("../../../services/voice-deletion/voice-deletion.service.ts", import.meta.url)
);

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

describe("G5C-B1 durable voice deletion repository", () => {
  it("adds exactly the voice-only operation and target tables with server-only RLS and safety constraints", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));

    expect(sql).toContain("create table if not exists public.voice_deletion_operations");
    expect(sql).toContain("create table if not exists public.voice_deletion_targets");
    expect(sql).toContain("alter table public.voice_deletion_operations enable row level security;");
    expect(sql).toContain("alter table public.voice_deletion_targets enable row level security;");
    expect(sql).not.toContain("on public.voice_deletion_operations for select");
    expect(sql).not.toContain("on public.voice_deletion_targets for select");
    expect(sql).not.toContain("on public.voice_deletion_operations for all");
    expect(sql).not.toContain("on public.voice_deletion_targets for all");
    expect(sql).toContain("revoke all on function public.seal_voice_deletion_snapshot(uuid, uuid, jsonb) from public, anon, authenticated;");
    expect(sql).toContain("grant execute on function public.seal_voice_deletion_snapshot(uuid, uuid, jsonb) to service_role;");
    expect(sql).toContain("voice_deletion_operations_user_active_unique_idx");
    expect(sql).toContain("voice_deletion_targets_operation_fingerprint_unique_idx");
    expect(sql).toContain("foreign key (operation_id, user_id) references public.voice_deletion_operations (id, user_id) on delete cascade");
    expect(sql).toContain("status in ('pending', 'processing', 'partial_failure', 'manual_required', 'completed', 'failed')");
    expect(sql).toContain("status in ('pending', 'delete_requested', 'deleted', 'verified_absent', 'manual_required')");
    expect(sql).not.toContain("provider_cleanup_status");
    expect(sql).not.toContain("storage_cleanup_status");
    expect(sql).not.toContain("database_cleanup_status");
  });

  it("keeps completion, failure, locator scrub, duplicate target, and atomic snapshot safety in the database contract", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));

    expect(sql).toContain("voice_deletion_operations_completed_safety_check");
    expect(sql).toContain("post_delete_verification_status = 'succeeded'");
    expect(sql).toContain("sensitive_snapshot_scrubbed_at is not null");
    expect(sql).toContain("voice_deletion_operations_failed_before_destructive_check check ( status <> 'failed' or destructive_started_at is null )");
    expect(sql).toContain("voice_deletion_targets_deleted_requires_success_check");
    expect(sql).toContain("voice_deletion_targets_verified_absent_check");
    expect(sql).toContain("voice_deletion_targets_scrubbed_locator_check");
    expect(sql).toContain("voice_deletion_targets_locator_required_before_scrub_check");
    expect(sql).toContain("insert into public.voice_deletion_targets");
    expect(sql).toContain("set snapshot_status = 'succeeded'");
    expect(sql).toContain("for update");
    expect(sql).toContain("claim_voice_deletion_operation_lease");
    expect(sql).toContain("and (lease_token is null or lease_expires_at <= now())");
  });

  it("recovers the winning active operation after the database race constraint rejects a duplicate create", () => {
    const repository = compact(readFileSync(repositoryPath, "utf8"));

    expect(repository).toContain('if (result.error?.code === "23505")');
    expect(repository).toContain("const existing = await getActiveOperation(userId);");
    expect(repository).toContain("return { operation: existing, created: false };");
  });

  it("routes target insertion through the one atomic seal RPC with the caller's owner scope", () => {
    const repository = compact(readFileSync(repositoryPath, "utf8"));

    expect(repository).toContain('await client.rpc("seal_voice_deletion_snapshot", {');
    expect(repository).toContain("p_operation_id: operationId,");
    expect(repository).toContain("p_user_id: userId,");
    expect(repository).toContain("insertSnapshotTargets: sealSnapshot,");
  });

  it("marks the repository server-only, scopes every target lookup by user, and remains separate from account deletion", () => {
    const repository = compact(readFileSync(repositoryPath, "utf8"));
    const deletionService = compact(readFileSync(voiceDeletionServicePath, "utf8"));

    expect(repository).toContain('import "server-only";');
    expect(repository).toContain('.from("voice_deletion_targets") .select("*") .eq("operation_id", operationId) .eq("user_id", userId)');
    expect(repository).toContain('.eq("id", operationId) .eq("user_id", userId)');
    expect(repository).not.toContain("account-deletion");
    expect(deletionService).not.toContain("account-deletion");
  });
});
