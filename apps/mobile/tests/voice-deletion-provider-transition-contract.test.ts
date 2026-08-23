import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

import { createVoiceDeletionRepository } from "@/services/voice-deletion/voice-deletion.repository";

const migrationPath = fileURLToPath(
  new URL("../../../supabase/migrations/0016_g5c_b2b_provider_voice_transitions.sql", import.meta.url)
);
const repositoryPath = fileURLToPath(
  new URL("../../../services/voice-deletion/voice-deletion.repository.ts", import.meta.url)
);
const runnerPath = fileURLToPath(
  new URL("../../../services/voice-deletion/voice-deletion-provider-runner.ts", import.meta.url)
);

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

describe("G5C-B2b focused provider target transition boundary", () => {
  it("adds only four focused service-role-only SECURITY DEFINER transition RPCs", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));
    const signatures = [
      "begin_provider_voice_delete_attempt(uuid, uuid, uuid, uuid, integer)",
      "record_provider_voice_delete_result(uuid, uuid, uuid, uuid, integer, text, integer)",
      "begin_provider_voice_reconciliation_attempt(uuid, uuid, uuid, uuid, integer)",
      "record_provider_voice_reconciliation_result(uuid, uuid, uuid, uuid, integer, text, text, integer)"
    ];

    for (const signature of signatures) {
      expect(sql).toContain(`revoke all on function public.${signature} from public, anon, authenticated, service_role;`);
      expect(sql).toContain(`grant execute on function public.${signature} to service_role;`);
    }
    expect(sql.match(/security definer/g)).toHaveLength(4);
    expect(sql.match(/set search_path = pg_catalog, public/g)).toHaveLength(4);
    expect(sql).not.toContain("create table");
    expect(sql).not.toContain("alter table");
  });

  it("requires durable provider-stage ownership, a live lease, and compare-and-swap counters before mutation", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));

    expect(sql).toContain("v_operation.snapshot_status <> 'succeeded'");
    expect(sql).toContain("v_operation.consent_withdrawal_status not in ('succeeded', 'not_needed')");
    expect(sql).toContain("v_operation.current_stage <> 'provider_cleanup'");
    expect(sql).toContain("v_operation.lease_token is distinct from p_lease_token");
    expect(sql).toContain("v_operation.lease_expires_at <= now()");
    expect(sql).toContain("v_target.target_kind <> 'provider_voice'");
    expect(sql).toContain("v_target.provider_name <> 'elevenlabs'");
    expect(sql).toContain("v_target.delete_attempt_count <> p_expected_delete_attempt_count");
    expect(sql).toContain("v_target.verification_attempt_count <> p_expected_verification_attempt_count");
    expect(sql).toContain("return null;");
  });

  it("persists both DELETE and reconciliation intent before an adapter call and never chains DELETE to GET", () => {
    const runner = readFileSync(runnerPath, "utf8");

    expect(runner.indexOf("beginProviderVoiceDeleteAttempt")).toBeLessThan(runner.indexOf("providerAdapter.deleteVoice"));
    expect(runner.indexOf("beginProviderVoiceReconciliationAttempt")).toBeLessThan(
      runner.indexOf("providerAdapter.reconcileVoiceAbsence")
    );
    expect(runner).not.toContain("account-deletion");
    expect(runner).not.toContain("storage_cleanup");
    expect(runner).not.toContain("completed");
  });

  it("maps DELETE provider_rejected to durable reconciliation and makes a later present result manual", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));

    expect(sql).toContain("elsif p_result = 'provider_rejected' then -- A rejected DELETE is ambiguous: the next invocation must reconcile the -- exact provider resource before any manual decision or another DELETE. update public.voice_deletion_targets set status = 'delete_requested', delete_outcome = 'rejected', reconciliation_status = 'pending', verification_status = 'pending', last_failure_category = 'provider_rejected'");
    expect(sql).toContain("elsif p_result = 'present' and v_target.last_failure_category = 'provider_rejected' then -- A provider-rejected DELETE followed by a confirmed present resource must -- not become a new automatic DELETE candidate. update public.voice_deletion_targets set status = 'manual_required', reconciliation_status = 'manual_required', verification_status = 'manual_required', last_failure_category = 'provider_rejected'");
    expect(sql).toContain("when v_target.last_failure_category = 'provider_rejected' then 'provider_rejected' else p_result end");
  });

  it("uses RPC mutations only and fail-closes all-null stale transition rows", async () => {
    const target = { id: "target-a", operation_id: "operation-a", user_id: "user-a" };
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: null }, error: null });
    const rpc = vi.fn(() => ({ maybeSingle }));
    const repository = createVoiceDeletionRepository({ rpc } as never);

    await expect(
      repository.recordProviderVoiceDeleteResult({
        operationId: "operation-a",
        userId: "user-a",
        targetId: target.id,
        leaseToken: "lease-a",
        expectedDeleteAttemptCount: 1,
        result: "deleted",
        retryDelaySeconds: 0
      })
    ).resolves.toBeNull();
    expect(rpc).toHaveBeenCalledWith("record_provider_voice_delete_result", {
      p_operation_id: "operation-a",
      p_user_id: "user-a",
      p_target_id: "target-a",
      p_lease_token: "lease-a",
      p_expected_delete_attempt_count: 1,
      p_result: "deleted",
      p_retry_delay_seconds: 0
    });
    const repositorySource = compact(readFileSync(repositoryPath, "utf8"));
    expect(repositorySource).toContain('.order("created_at", { ascending: true }) .order("id", { ascending: true })');
    expect(repositorySource).not.toContain(".update(");
    expect(repositorySource).not.toContain(".insert(");
    expect(repositorySource).not.toContain(".delete(");
  });
});
