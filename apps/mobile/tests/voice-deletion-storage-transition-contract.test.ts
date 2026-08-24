import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

import { createVoiceDeletionRepository } from "@/services/voice-deletion/voice-deletion.repository";

const migrationPath = fileURLToPath(
  new URL("../../../supabase/migrations/0017_g5c_b3_storage_object_transitions.sql", import.meta.url)
);
const repositoryPath = fileURLToPath(
  new URL("../../../services/voice-deletion/voice-deletion.repository.ts", import.meta.url)
);

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

describe("G5C-B3 focused Storage transition contract", () => {
  it("adds exactly the five focused service-role-only SECURITY DEFINER RPCs", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));
    const signatures = [
      "enter_voice_deletion_storage_cleanup_stage(uuid, uuid, uuid, integer)",
      "begin_storage_object_delete_attempt(uuid, uuid, uuid, uuid, integer)",
      "record_storage_object_delete_result(uuid, uuid, uuid, uuid, integer, text, integer)",
      "begin_storage_object_verification_attempt(uuid, uuid, uuid, uuid, integer)",
      "record_storage_object_verification_result(uuid, uuid, uuid, uuid, integer, text, integer)"
    ];

    for (const signature of signatures) {
      expect(sql).toContain(`revoke all on function public.${signature} from public, anon, authenticated, service_role;`);
      expect(sql).toContain(`grant execute on function public.${signature} to service_role;`);
    }
    expect(sql.match(/security definer/g)).toHaveLength(10);
    expect(sql.match(/set search_path = pg_catalog, public/g)).toHaveLength(10);
    expect(sql).not.toContain("create table");
    expect(sql).not.toContain("delete from storage.objects");
    expect(sql).not.toContain("update storage.objects");
  });

  it("enforces the fixed Storage kind-to-bucket mapping and blocks recordings", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));

    expect(sql).toContain("target_kind = 'voice_sample' and source_row_id is not null and storage_bucket = 'voice-samples'");
    expect(sql).toContain("target_kind = 'voice_consent_recording' and source_row_id is not null and storage_bucket = 'voice-consents'");
    expect(sql).toContain("target_kind = 'script_audio_storage' and source_row_id is not null and storage_bucket = 'script-audios'");
    expect(sql).toContain("target_kind not in ('voice_sample', 'voice_consent_recording', 'script_audio_storage') and storage_bucket is null and storage_object_key is null");
    expect(sql).not.toContain("recordings_delete_own");
    expect(sql).not.toContain("bucket = 'recordings'");
  });

  it("removes only the three authenticated direct DELETE policies", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));

    expect(sql).toContain('drop policy if exists "voice-samples_delete_own" on storage.objects;');
    expect(sql).toContain('drop policy if exists "voice-consents_delete_own" on storage.objects;');
    expect(sql).toContain('drop policy if exists "script-audios_delete_own" on storage.objects;');
    expect(sql).not.toContain("_select_own");
    expect(sql).not.toContain("_insert_own");
    expect(sql).not.toContain("_update_own");
  });

  it("re-resolves attribution and every shared reference before persisting delete intent", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));

    expect(sql).toContain("lock table public.voices, public.voice_consents, public.scripts, public.script_audios, public.script_saved_model_audios in share row exclusive mode");
    expect(sql).toContain("from public.voices as voice join public.voice_consents as consent");
    expect(sql).toContain("consent.metadata -> 'recording' ->> 'audioPath'");
    expect(sql).toContain("from public.script_audios as audio join public.scripts as script");
    expect(sql).toContain("from public.script_saved_model_audios as saved");
    expect(sql).toContain("storage_attribution_mismatch");
    expect(sql).toContain("storage_shared_reference");
    expect(sql.indexOf("lock table public.voices")).toBeLessThan(sql.indexOf("delete_attempt_count = delete_attempt_count + 1"));
  });

  it("fences every current B3 writer after a durable destructive intent", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));

    expect(sql).toContain("create or replace function public.g5c_b3_storage_reference_fence_active(");
    expect(sql).toContain("target.user_id = p_user_id");
    expect(sql).toContain("target.target_kind = p_target_kind");
    expect(sql).toContain("target.storage_bucket = p_storage_bucket");
    expect(sql).toContain("target.storage_object_key = p_storage_object_key");
    expect(sql).toContain("target.status in ('delete_requested', 'deleted', 'verified_absent', 'manual_required')");
    expect(sql).toContain("operation.destructive_started_at is not null");
    expect(sql).toContain("operation.status <> 'completed'");

    expect(sql).toContain("before insert or update of user_id, sample_audio_path, consent_id on public.voices");
    expect(sql).toContain("before insert or update of user_id, metadata on public.voice_consents");
    expect(sql).toContain("before insert or update of script_id, voice_id, stored_asset on public.script_audios");
    expect(sql).toContain("before insert or update of user_id, script_id, script_audio_id on public.script_saved_model_audios");
    expect(sql).toContain("'voice_sample', 'voice-samples'");
    expect(sql).toContain("'voice_consent_recording', 'voice-consents'");
    expect(sql).toContain("'script_audio_storage', 'script-audios'");
    expect(sql).toContain("new.script_audio_id");

    expect(sql).toContain("message = 'voice deletion storage reference fence is active'");
    expect(sql).toContain("revoke all on function public.g5c_b3_storage_reference_fence_active(uuid, text, text, text, uuid) from public, anon, authenticated, service_role;");
    expect(sql).not.toContain("storage://recordings/");
  });

  it("keeps B3 before finalization: no locator scrub, completion, or B4 transition", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));

    expect(sql).not.toContain("set locator_scrubbed_at");
    expect(sql).not.toContain("current_stage = 'database_cleanup'");
    expect(sql).not.toContain("current_stage = 'post_delete_verification'");
    expect(sql).not.toContain("status = 'completed'");
  });

  it("uses repository RPC calls only and fails closed for malformed transition rows", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: null }, error: null });
    const rpc = vi.fn(() => ({ maybeSingle }));
    const repository = createVoiceDeletionRepository({ rpc } as never);

    await expect(
      repository.beginStorageObjectDeleteAttempt({
        operationId: "operation-a",
        userId: "user-a",
        targetId: "target-a",
        leaseToken: "lease-a",
        expectedDeleteAttemptCount: 0
      })
    ).resolves.toBeNull();
    expect(rpc).toHaveBeenCalledWith("begin_storage_object_delete_attempt", {
      p_operation_id: "operation-a",
      p_user_id: "user-a",
      p_target_id: "target-a",
      p_lease_token: "lease-a",
      p_expected_delete_attempt_count: 0
    });

    await expect(
      repository.markStorageObjectInvalidTargetManualRequired({
        operationId: "operation-a",
        userId: "user-a",
        targetId: "target-a",
        leaseToken: "lease-a",
        expectedDeleteAttemptCount: 1,
        expectedVerificationAttemptCount: 0
      })
    ).resolves.toBeNull();
    expect(rpc).toHaveBeenCalledWith("mark_storage_object_invalid_target_manual_required", {
      p_operation_id: "operation-a",
      p_user_id: "user-a",
      p_target_id: "target-a",
      p_lease_token: "lease-a",
      p_expected_delete_attempt_count: 1,
      p_expected_verification_attempt_count: 0
    });

    const repositorySource = compact(readFileSync(repositoryPath, "utf8"));
    expect(repositorySource).not.toContain(".update(");
    expect(repositorySource).not.toContain(".insert(");
    expect(repositorySource).not.toContain(".delete(");
  });
});
