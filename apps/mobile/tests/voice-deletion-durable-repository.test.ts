import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

import { createVoiceDeletionRepository } from "@/services/voice-deletion/voice-deletion.repository";

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

describe("G5C-B1 durable voice deletion focused RPC boundary", () => {
  it("makes both durable tables service-role read-only and leaves no direct DML grant", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));

    expect(sql).toContain("revoke all privileges on table public.voice_deletion_operations from public, anon, authenticated, service_role;");
    expect(sql).toContain("revoke all privileges on table public.voice_deletion_targets from public, anon, authenticated, service_role;");
    expect(sql).toContain("grant select on table public.voice_deletion_operations to service_role;");
    expect(sql).toContain("grant select on table public.voice_deletion_targets to service_role;");
    expect(sql).not.toContain("grant select, insert");
    expect(sql).not.toContain("grant insert on table public.voice_deletion_operations");
    expect(sql).not.toContain("grant update on table public.voice_deletion_operations");
    expect(sql).not.toContain("grant delete on table public.voice_deletion_operations");
    expect(sql).not.toContain("grant insert on table public.voice_deletion_targets");
    expect(sql).not.toContain("grant update on table public.voice_deletion_targets");
    expect(sql).not.toContain("grant delete on table public.voice_deletion_targets");
  });

  it("exposes every current mutation through an explicit service-role-only SECURITY DEFINER RPC", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));

    for (const signature of [
      "create_or_get_voice_deletion_operation(uuid)",
      "seal_voice_deletion_snapshot(uuid, uuid, jsonb)",
      "claim_voice_deletion_operation_lease(uuid, uuid, uuid, integer)",
      "release_voice_deletion_operation_lease(uuid, uuid, uuid)",
      "finalize_voice_deletion_operation(uuid, uuid, uuid)"
    ]) {
      expect(sql).toContain(`revoke all on function public.${signature} from public, anon, authenticated, service_role;`);
      expect(sql).toContain(`grant execute on function public.${signature} to service_role;`);
    }

    expect(sql).toContain("create or replace function public.create_or_get_voice_deletion_operation( p_user_id uuid ) returns table(operation_id uuid, created boolean) language plpgsql security definer set search_path = pg_catalog, public");
    expect(sql).toContain("create or replace function public.seal_voice_deletion_snapshot( p_operation_id uuid, p_user_id uuid, p_targets jsonb ) returns public.voice_deletion_operations language plpgsql security definer set search_path = pg_catalog, public");
    expect(sql).toContain("create or replace function public.finalize_voice_deletion_operation( p_operation_id uuid, p_user_id uuid, p_lease_token uuid ) returns public.voice_deletion_operations language plpgsql security definer set search_path = pg_catalog, public");
  });

  it("creates only the fixed initial operation state and recovers the winner of the active-operation race", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));
    const repository = compact(readFileSync(repositoryPath, "utf8"));

    expect(sql).toContain("insert into public.voice_deletion_operations (user_id) values (p_user_id)");
    expect(sql).toContain("when unique_violation then");
    expect(sql).toContain("return query select v_operation_id, false;");
    expect(repository).toContain('await client.rpc("create_or_get_voice_deletion_operation", { p_user_id: userId })');
    expect(repository).toContain('client.rpc("create_or_get_voice_deletion_operation", { p_user_id: userId }).single()');
    expect(repository).not.toContain('.from("voice_deletion_operations").insert');
  });

  it.each([
    { created: true, label: "a new operation" },
    { created: false, label: "the existing active operation" }
  ])("requires exactly one RPC row and maps %s", async ({ created }) => {
    const operation = { id: "operation-a", user_id: "user-a", status: "pending" };
    const single = vi.fn().mockResolvedValue({
      data: { operation_id: operation.id, created },
      error: null
    });
    const rpc = vi.fn().mockReturnValue({ single });
    const maybeSingle = vi.fn().mockResolvedValue({ data: operation, error: null });
    const from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ maybeSingle })
        })
      })
    });
    const repository = createVoiceDeletionRepository({ rpc, from } as never);

    await expect(repository.createOrGetActiveOperation("user-a")).resolves.toEqual({ operation, created });
    expect(rpc).toHaveBeenCalledWith("create_or_get_voice_deletion_operation", { p_user_id: "user-a" });
    expect(single).toHaveBeenCalledTimes(1);
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });

  it.each(["zero rows", "multiple rows"])("fails closed when the single-row RPC transform reports %s", async () => {
    const single = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" }
    });
    const rpc = vi.fn().mockReturnValue({ single });
    const from = vi.fn();
    const repository = createVoiceDeletionRepository({ rpc, from } as never);

    await expect(repository.createOrGetActiveOperation("user-a")).rejects.toMatchObject({
      status: 500,
      message: "voice deletion operation の作成に失敗しました。"
    });
    expect(single).toHaveBeenCalledTimes(1);
    expect(from).not.toHaveBeenCalled();
  });

  it("seals a snapshot atomically only before destructive work and cannot add targets after sealing", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));

    expect(sql).toContain("if v_operation.snapshot_status <> 'pending' or v_operation.destructive_started_at is not null then");
    expect(sql).toContain("insert into public.voice_deletion_targets");
    expect(sql).toContain("set snapshot_status = 'succeeded'");
    expect(sql).toContain("for update");
    expect(sql).toContain("voice_deletion_targets_operation_fingerprint_unique_idx");
  });

  it("keeps target ownership and identity immutable, including after completion", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));

    expect(sql).toContain("voice deletion target ownership and kind are immutable");
    expect(sql).toContain("completed voice deletion targets are immutable");
    expect(sql).toContain("completed voice deletion operations are immutable outside retention purge");
    expect(sql).toContain("completed voice deletion operations cannot transition to a non-completed status");
  });

  it("requires the correct absence-verification plane for each target kind", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));

    expect(sql).toContain("target_kind = 'provider_voice' and reconciliation_status = 'verified_absent' and verification_status = 'not_applicable'");
    expect(sql).toContain("target_kind in ( 'voice_sample', 'voice_consent_recording', 'script_audio_storage', 'script_audio', 'saved_model_audio', 'voice_binding' ) and verification_status = 'verified_absent' and reconciliation_status = 'not_applicable'");
    expect(sql).not.toContain("reconciliation_status = 'verified_absent' or verification_status = 'verified_absent'");
    expect(sql).toContain("voice deletion operation has unresolved targets");
  });

  it("has no forgeable custom-GUC finalization path", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).not.toContain("app.g5c_voice_deletion_finalizing_operation_id");
    expect(sql).not.toContain("set_config(");
    expect(sql).not.toContain("current_setting(");
  });

  it("requires processing, the post-delete stage, and the owning live lease to finalize", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));

    expect(sql).toContain("p_lease_token uuid");
    expect(sql).toContain("if p_lease_token is null then raise exception 'voice deletion finalization requires a lease token';");
    expect(sql).toContain("v_operation.status <> 'processing'");
    expect(sql).toContain("v_operation.current_stage <> 'post_delete_verification'");
    expect(sql).toContain("v_operation.lease_token <> p_lease_token");
    expect(sql).toContain("v_operation.lease_expires_at <= now()");
    expect(sql).toContain("and (lease_token is null or lease_expires_at <= now())");
    expect(sql).toContain("and lease_token = p_lease_token");
  });

  it("scrubs locators only in finalization and retains destructive monotonicity", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));

    expect(sql).toContain("locator_scrubbed_at = v_completed_at");
    expect(sql).toContain("sensitive_snapshot_scrubbed_at = v_completed_at");
    expect(sql).toContain("audit_expires_at = v_completed_at + interval '90 days'");
    expect(sql).toContain("voice deletion target locators can only transition to a scrubbed state");
    expect(sql).toContain("voice deletion destructive_started_at is monotonic");
    expect(sql).toContain("voice deletion cannot transition to failed after destructive work starts");
  });

  it("uses table reads and focused RPC mutations only in the server-only repository", async () => {
    const repositorySource = compact(readFileSync(repositoryPath, "utf8"));
    const deletionService = compact(readFileSync(voiceDeletionServicePath, "utf8"));
    const completedOperation = { id: "operation-a", user_id: "user-a", status: "completed" };
    const rpc = vi.fn().mockResolvedValue({ data: completedOperation, error: null });
    const repository = createVoiceDeletionRepository({ rpc } as never);

    await expect(repository.finalizeOperation("operation-a", "user-a", "lease-a")).resolves.toBe(completedOperation);
    expect(rpc).toHaveBeenCalledWith("finalize_voice_deletion_operation", {
      p_operation_id: "operation-a",
      p_user_id: "user-a",
      p_lease_token: "lease-a"
    });
    expect(repositorySource).toContain('import "server-only";');
    expect(repositorySource).toContain('await client.rpc("release_voice_deletion_operation_lease", {');
    expect(repositorySource).not.toContain(".insert(");
    expect(repositorySource).not.toContain(".update(");
    expect(repositorySource).not.toContain(".delete(");
    expect(repositorySource).not.toContain("account-deletion");
    expect(deletionService).not.toContain("account-deletion");
  });
});
