import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

import { createVoiceDeletionRepository } from "@/services/voice-deletion/voice-deletion.repository";

const migrationPath = fileURLToPath(
  new URL("../../../supabase/migrations/0019_g5c_b4_db_cleanup_and_consent_withdrawal.sql", import.meta.url)
);
const repositoryPath = fileURLToPath(
  new URL("../../../services/voice-deletion/voice-deletion.repository.ts", import.meta.url)
);
const collectorPath = fileURLToPath(
  new URL("../../../services/voice-deletion/voice-deletion.service.ts", import.meta.url)
);
const consentRunnerPath = fileURLToPath(
  new URL("../../../services/voice-deletion/voice-deletion-consent-runner.ts", import.meta.url)
);
const databaseRunnerPath = fileURLToPath(
  new URL("../../../services/voice-deletion/voice-deletion-database-runner.ts", import.meta.url)
);
const voiceServicePath = fileURLToPath(new URL("../../../services/voice/voice.service.ts", import.meta.url));

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

describe("G5C-B4 focused DB cleanup and consent withdrawal contract", () => {
  it("adds one forward consent snapshot column and four service-role-only focused RPCs", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));

    expect(sql).toContain("add column if not exists consent_snapshot_ids uuid[] not null default '{}'::uuid[]");
    expect(sql).toContain("array_position(consent_snapshot_ids, null) is null");
    for (const signature of [
      "seal_voice_deletion_consent_snapshot(uuid, uuid, uuid, integer)",
      "withdraw_voice_deletion_current_consents(uuid, uuid, uuid, integer)",
      "enter_voice_deletion_database_cleanup_stage(uuid, uuid, uuid, integer)",
      "cleanup_voice_deletion_database_targets(uuid, uuid, uuid, integer)"
    ]) {
      expect(sql).toContain(`revoke all on function public.${signature} from public, anon, authenticated, service_role;`);
      expect(sql).toContain(`grant execute on function public.${signature} to service_role;`);
    }
    expect(sql).not.toContain("create table public.account_deletion");
    expect(sql).not.toContain("delete from storage.objects");
    expect(sql).not.toContain("http://");
  });

  it("uses the exact canonical current voice-cloning SQL contract and seals every active exact ID", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));

    expect(sql).toContain("create or replace function public.g5c_b4_is_current_voice_cloning_consent(");
    expect(sql).toContain("consent.consent_type = 'voice_cloning'");
    expect(sql).toContain("consent.consent_version = '2026-08-22.v1'");
    expect(sql).toContain("consent.provider_set = array['elevenlabs']::text[]");
    expect(sql).toContain("consent.data_categories = array['voice_sample', 'consent_recording', 'cloned_voice', 'reference_audio']::text[]");
    expect(sql).toContain("array_agg(consent.id order by consent.accepted_at desc, consent.id desc)");
    expect(sql).toContain("consent_snapshot_ids = v_consent_ids");
    expect(sql).toContain("set status = 'withdrawn'");
    expect(sql).toContain("where id = any(v_operation.consent_snapshot_ids)");
  });

  it("fails closed to durable manual state for mixed, foreign, fresh, or unsealed consent/voice state", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));

    expect(sql).toContain("mixed_or_malformed_voice_cloning_consent");
    expect(sql).toContain("voice_target_without_current_consent");
    expect(sql).toContain("consent_withdrawal_precondition_failed");
    expect(sql).toContain("unsealed_elevenlabs_voice");
    expect(sql).toContain("and not (consent.id = any(v_operation.consent_snapshot_ids))");
    expect(sql).toContain("and target.target_kind = 'voice_binding' and target.source_row_id = voice.id");
    expect(sql).toContain("and target.target_kind = 'provider_voice' and target.source_row_id = voice.id");
  });

  it("enters database cleanup only after independent provider and Storage absence checks", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));

    expect(sql).toContain("create or replace function public.enter_voice_deletion_database_cleanup_stage(");
    expect(sql).toContain("v_operation.current_stage <> 'storage_cleanup'");
    expect(sql).toContain("target.target_kind = 'provider_voice'");
    expect(sql).toContain("target.reconciliation_status <> 'verified_absent'");
    expect(sql).toContain("target.target_kind in ('voice_sample', 'voice_consent_recording', 'script_audio_storage')");
    expect(sql).toContain("set current_stage = 'database_cleanup'");
    expect(sql).not.toContain("current_stage = 'post_delete_verification'");
  });

  it("deletes only saved model rows, script audio rows, then ElevenLabs voice bindings in one database RPC", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));

    expect(sql).toContain("create or replace function public.cleanup_voice_deletion_database_targets(");
    expect(sql).toContain("lock table public.script_saved_model_audios, public.script_audios, public.voices, public.scripts in share row exclusive mode");
    expect(sql).toContain("delete from public.script_saved_model_audios as saved");
    expect(sql).toContain("delete from public.script_audios as audio");
    expect(sql).toContain("delete from public.voices as voice");
    expect(sql.indexOf("delete from public.script_saved_model_audios as saved")).toBeLessThan(
      sql.indexOf("delete from public.script_audios as audio")
    );
    expect(sql.indexOf("delete from public.script_audios as audio")).toBeLessThan(sql.indexOf("delete from public.voices as voice"));
    expect(sql).toContain("voice.provider = 'elevenlabs'");
    expect(sql).toContain("unsealed_elevenlabs_script_audio");
    expect(sql).toContain("unsealed_saved_model_audio");
    expect(sql).toContain("missing_voice_with_unresolved_script_audio");
    expect(sql).toContain("missing_script_audio_with_unresolved_saved_model_audio");
    expect(sql).not.toContain("script_saved_best_takes");
    expect(sql).not.toContain("delete from public.takes");
    expect(sql).not.toContain("delete from public.recordings");
  });

  it("closes direct cache mutations, splits legacy voice-consent policies, and fences new destructive relations", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));

    expect(sql).toContain('drop policy if exists "script_audios_insert_own" on public.script_audios;');
    expect(sql).toContain('drop policy if exists "script_audios_update_own" on public.script_audios;');
    expect(sql).toContain('drop policy if exists "script_audios_delete_own" on public.script_audios;');
    expect(sql).toContain('drop policy if exists "voice_consents_crud_own" on public.voice_consents;');
    expect(sql).toContain('create policy "voice_consents_select_own"');
    expect(sql).toContain('create policy "voice_consents_insert_own"');
    expect(sql).toContain("create or replace function public.g5c_b4_voice_deletion_writer_fence_active");
    expect(sql).toContain("before insert or update of script_id, voice_id, provider, cache_key, storage_path, stored_asset on public.script_audios");
    expect(sql).toContain("before insert or update of user_id, script_id, script_audio_id on public.script_saved_model_audios");
    expect(sql).toContain("before delete or update of user_id on public.scripts");
    expect(sql).toContain("message = 'voice deletion writer fence is active'");
  });

  it("uses RPC-only repository transitions and fails closed for malformed rows", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: null }, error: null });
    const rpc = vi.fn(() => ({ maybeSingle }));
    const repository = createVoiceDeletionRepository({ rpc } as never);

    await expect(
      repository.withdrawCurrentConsents({
        operationId: "operation-a",
        userId: "user-a",
        leaseToken: "lease-a",
        expectedRunnerAttemptCount: 2
      })
    ).resolves.toBeNull();
    expect(rpc).toHaveBeenCalledWith("withdraw_voice_deletion_current_consents", {
      p_operation_id: "operation-a",
      p_user_id: "user-a",
      p_lease_token: "lease-a",
      p_expected_runner_attempt_count: 2
    });

    const repositorySource = compact(readFileSync(repositoryPath, "utf8"));
    expect(repositorySource).not.toContain(".insert(");
    expect(repositorySource).not.toContain(".update(");
    expect(repositorySource).not.toContain(".delete(");
  });

  it("covers every owned ElevenLabs binding and keeps both runners below the finalizer boundary", () => {
    const collector = readFileSync(collectorPath, "utf8");
    const consentRunner = readFileSync(consentRunnerPath, "utf8");
    const databaseRunner = readFileSync(databaseRunnerPath, "utf8");
    const voiceService = readFileSync(voiceServicePath, "utf8");

    expect(collector).not.toContain("if (voice.isDefault) {\n      targets.push({\n        targetKind: \"voice_binding\"");
    expect(collector).toContain("Every owned ElevenLabs binding is a deletion target");
    expect(consentRunner).not.toContain("finalizeOperation");
    expect(databaseRunner).not.toContain("finalizeOperation");
    expect(databaseRunner).not.toContain("post_delete_verification");
    expect(voiceService).toContain("createServerOwnedScriptAudioWriter");
    expect(voiceService).toContain("assertServerOwnedScriptAudioWrite");
    expect(voiceService).toContain('includes("voice deletion writer fence")');
  });
});
