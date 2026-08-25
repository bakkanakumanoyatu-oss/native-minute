import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

import { createVoiceDeletionRepository } from "@/services/voice-deletion/voice-deletion.repository";

const migrationPath = fileURLToPath(
  new URL("../../../supabase/migrations/0020_g5c_b5_post_delete_verification_transitions.sql", import.meta.url)
);
const priorMigrationPath = fileURLToPath(
  new URL("../../../supabase/migrations/0019_g5c_b4_db_cleanup_and_consent_withdrawal.sql", import.meta.url)
);
const repositoryPath = fileURLToPath(
  new URL("../../../services/voice-deletion/voice-deletion.repository.ts", import.meta.url)
);
const operationServicePath = fileURLToPath(
  new URL("../../../services/voice-deletion/voice-deletion-operation.service.ts", import.meta.url)
);
const clientStatePath = fileURLToPath(
  new URL("../../../services/voice-deletion/voice-deletion-client-state.ts", import.meta.url)
);
const webStatusRoutePath = fileURLToPath(
  new URL("../../../app/api/voice-deletion/status/route.ts", import.meta.url)
);
const webRequestRoutePath = fileURLToPath(
  new URL("../../../app/api/voice-deletion/request/route.ts", import.meta.url)
);
const webAdvanceRoutePath = fileURLToPath(
  new URL("../../../app/api/voice-deletion/advance/route.ts", import.meta.url)
);
const schemaPath = fileURLToPath(new URL("../../../schemas/voice-deletion.ts", import.meta.url));

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

describe("G5C-B5 migration 0020 contract", () => {
  it("keeps 0019 byte-for-byte unchanged", () => {
    expect(createHash("sha256").update(readFileSync(priorMigrationPath)).digest("hex")).toBe(
      "4ffcea3ca65d669f54e4c44157f43495d26fd43443e79a8e5f25c5222a0092c1"
    );
  });

  it("adds only three focused service-role SECURITY DEFINER RPCs with a safe search path", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));
    const signatures = [
      "mark_voice_deletion_preflight_manual_required(uuid)",
      "enter_voice_deletion_post_delete_verification_stage(uuid, uuid, uuid, integer)",
      "complete_voice_deletion_post_delete_verification(uuid, uuid, uuid, integer)"
    ];

    expect(sql.match(/security definer set search_path = pg_catalog, public/g)).toHaveLength(3);
    for (const signature of signatures) {
      expect(sql).toContain(`revoke all on function public.${signature} from public, anon, authenticated, service_role;`);
      expect(sql).toContain(`grant execute on function public.${signature} to service_role;`);
    }
    expect(sql).not.toContain("create table");
    expect(sql).not.toContain("account_deletion");
  });

  it("enters verification only after every durable plane and canonical DB source is absent", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));

    expect(sql).toContain("v_operation.current_stage <> 'database_cleanup'");
    expect(sql).toContain("target.status in ('pending', 'delete_requested', 'deleted', 'manual_required')");
    expect(sql).toContain("target.reconciliation_status <> 'verified_absent'");
    expect(sql).toContain("target.verification_status <> 'verified_absent'");
    expect(sql).toContain("join public.script_saved_model_audios as saved on saved.id = target.source_row_id");
    expect(sql).toContain("join public.script_audios as audio on audio.id = target.source_row_id");
    expect(sql).toContain("join public.voices as voice on voice.id = target.source_row_id");
    expect(sql).toContain("public.g5c_b4_is_current_voice_cloning_consent(p_user_id, null)");
    expect(sql).toContain("set status = 'processing', current_stage = 'post_delete_verification'");
  });

  it("rechecks final absence, fails closed, and never finalizes inside verification", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));

    expect(sql).toContain("post_delete_verification_status = 'manual_required'");
    expect(sql).toContain("post_delete_verification_status = 'succeeded'");
    expect(sql).toContain("consent_snapshot_ids = '{}'::uuid[]");
    expect(sql).toContain("where voice.user_id = p_user_id and voice.provider = 'elevenlabs'");
    expect(sql).not.toMatch(/perform public\.finalize_voice_deletion_operation/);
    expect(sql).not.toMatch(/select public\.finalize_voice_deletion_operation/);
    expect(sql).not.toContain("delete from public.recordings");
    expect(sql).not.toContain("delete from public.takes");
    expect(sql).not.toContain("delete from public.reviews");
    expect(sql).not.toContain("delete from public.progress");
    expect(sql).not.toContain("delete from public.script_saved_best_takes");
  });

  it("keeps Web authority cookie-authenticated and rejects every client authority field", () => {
    const statusRoute = readFileSync(webStatusRoutePath, "utf8");
    const requestRoute = readFileSync(webRequestRoutePath, "utf8");
    const advanceRoute = readFileSync(webAdvanceRoutePath, "utf8");
    const schema = compact(readFileSync(schemaPath, "utf8"));

    for (const route of [statusRoute, requestRoute, advanceRoute]) {
      expect(route).toContain("createSupabaseRouteClient");
      expect(route).toContain("requireCurrentUser");
      expect(route).not.toContain("createSupabaseAdminClient");
      expect(route).not.toContain("account-deletion");
    }
    expect(schema.match(/z\.object\(\{\}\)\.strict/g)).toHaveLength(2);
  });

  it("keeps all durable mutation in focused RPCs and all client output in a server-only mapper", () => {
    const repository = compact(readFileSync(repositoryPath, "utf8"));
    const operationService = readFileSync(operationServicePath, "utf8");
    const clientState = readFileSync(clientStatePath, "utf8");

    expect(repository).not.toContain('.from("voice_deletion_operations").update');
    expect(repository).not.toContain('.from("voice_deletion_operations").insert');
    expect(repository).not.toContain('.from("voice_deletion_targets").delete');
    expect(clientState.startsWith('import "server-only";')).toBe(true);
    expect(clientState).not.toMatch(/operationId|targetId|userId|providerResourceId|storageObjectKey|leaseToken/);
    expect(operationService).not.toContain("account-deletion");
    expect(operationService).not.toContain("AccountDeletion");
  });

  it("maps each B5 transition through the exact owner-scoped RPC parameters", async () => {
    const row = { id: "operation-a", user_id: "user-a" };
    const rpc = vi.fn(async () => ({ data: row, error: null }));
    const repository = createVoiceDeletionRepository({ rpc } as never);

    await repository.markPreflightManualRequired("user-a");
    await repository.enterPostDeleteVerificationStage({
      operationId: "operation-a",
      userId: "user-a",
      leaseToken: "lease-a",
      expectedRunnerAttemptCount: 7
    });
    await repository.completePostDeleteVerification({
      operationId: "operation-a",
      userId: "user-a",
      leaseToken: "lease-a",
      expectedRunnerAttemptCount: 8
    });

    expect(rpc).toHaveBeenNthCalledWith(1, "mark_voice_deletion_preflight_manual_required", {
      p_user_id: "user-a"
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "enter_voice_deletion_post_delete_verification_stage", {
      p_operation_id: "operation-a",
      p_user_id: "user-a",
      p_lease_token: "lease-a",
      p_expected_runner_attempt_count: 7
    });
    expect(rpc).toHaveBeenNthCalledWith(3, "complete_voice_deletion_post_delete_verification", {
      p_operation_id: "operation-a",
      p_user_id: "user-a",
      p_lease_token: "lease-a",
      p_expected_runner_attempt_count: 8
    });
  });
});
