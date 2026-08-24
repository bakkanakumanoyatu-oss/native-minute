import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration0017Path = fileURLToPath(
  new URL("../../../supabase/migrations/0017_g5c_b3_storage_object_transitions.sql", import.meta.url)
);
const migration0018Path = fileURLToPath(
  new URL("../../../supabase/migrations/0018_g5c_b3_invalid_storage_target_durable_mapping.sql", import.meta.url)
);

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

describe("G5C-B3 dedicated invalid Storage target transition", () => {
  it("leaves 0017 immutable and makes 0018 one focused forward-only RPC", () => {
    const sql0017 = compact(readFileSync(migration0017Path, "utf8"));
    const sql0018 = compact(readFileSync(migration0018Path, "utf8"));

    expect(sql0017).not.toContain("invalid_target");
    expect(sql0017.match(/create or replace function/g)).toHaveLength(10);
    expect(sql0018.match(/create or replace function/g)).toHaveLength(1);
    expect(sql0018).toContain("create or replace function public.mark_storage_object_invalid_target_manual_required(");
    expect(sql0018).not.toContain("record_storage_object_delete_result");
    expect(sql0018).not.toContain("record_storage_object_verification_result");
    expect(sql0018).not.toContain("p_result");
    expect(sql0018).not.toContain("p_retry_delay_seconds");
    expect(sql0018).not.toContain("create table");
    expect(sql0018).not.toContain("alter table");
    expect(sql0018).not.toContain("create trigger");
    expect(sql0018).not.toContain("drop policy");
    expect(sql0018).not.toContain("storage.objects");
  });

  it("accepts only canonical identity and counters, never an adapter locator or kind", () => {
    const sql = compact(readFileSync(migration0018Path, "utf8"));

    expect(sql).toContain("p_operation_id uuid, p_user_id uuid, p_target_id uuid, p_lease_token uuid, p_expected_delete_attempt_count integer, p_expected_verification_attempt_count integer");
    expect(sql).not.toContain("p_target_kind");
    expect(sql).not.toContain("p_storage_bucket");
    expect(sql).not.toContain("p_storage_object_key");
    expect(sql).toContain("where id = p_operation_id and user_id = p_user_id for update");
    expect(sql).toContain("v_operation.current_stage <> 'storage_cleanup'");
    expect(sql).toContain("v_operation.status = 'completed'");
    expect(sql).toContain("v_operation.lease_token is distinct from p_lease_token");
    expect(sql).toContain("v_operation.lease_expires_at <= now()");
    expect(sql).toContain("v_target.delete_attempt_count <> p_expected_delete_attempt_count");
    expect(sql).toContain("v_target.verification_attempt_count <> p_expected_verification_attempt_count");
  });

  it("limits manualization to active B3 Storage targets and preserves all finalization boundaries", () => {
    const sql = compact(readFileSync(migration0018Path, "utf8"));

    expect(sql).toContain("v_target.target_kind not in ('voice_sample', 'voice_consent_recording', 'script_audio_storage')");
    expect(sql).toContain("v_target.status in ('verified_absent', 'manual_required')");
    expect(sql).toContain("v_target.locator_scrubbed_at is not null");
    expect(sql).not.toContain("recordings");
    expect(sql).not.toContain("provider_voice");
    expect(sql).not.toContain("script_audio'");
    expect(sql).not.toContain("saved_model_audio");
    expect(sql).not.toContain("voice_binding");
    expect(sql).not.toContain("locator_scrubbed_at =");
    expect(sql).not.toContain("database_cleanup");
    expect(sql).not.toContain("post_delete_verification");
    expect(sql).not.toContain("set status = 'completed'");
  });

  it("durably maps a local contract violation to manual_required without recording an external result", () => {
    const sql = compact(readFileSync(migration0018Path, "utf8"));

    expect(sql).toContain("set status = 'manual_required', reconciliation_status = 'manual_required', verification_status = 'manual_required', last_failure_category = 'invalid_target'");
    expect(sql).toContain("last_failure_stage = 'storage_cleanup'");
    expect(sql).toContain("manual_reason_category = 'invalid_target'");
    expect(sql).toContain("next_retry_at = null");
    expect(sql).not.toContain("delete_attempt_count = delete_attempt_count + 1");
    expect(sql).not.toContain("verification_attempt_count = verification_attempt_count + 1");
    expect(sql).not.toContain("delete_outcome = 'rejected'");
    expect(sql).not.toContain("verified_absent_at =");
  });

  it("keeps generic external rejected in 0017's verification-first delete-result path", () => {
    const sql0017 = compact(readFileSync(migration0017Path, "utf8"));
    const sql0018 = compact(readFileSync(migration0018Path, "utf8"));

    expect(sql0017).toContain("when p_result in ('rejected', 'protocol_error') then 'rejected'");
    expect(sql0017).toContain("set status = 'delete_requested', delete_outcome = v_delete_outcome, reconciliation_status = 'not_applicable', verification_status = 'pending', last_failure_category = p_result");
    expect(sql0017).not.toContain("'invalid_target'");
    expect(sql0018).not.toContain("rejected");
  });

  it("is SECURITY DEFINER with fixed search_path and service-role-only execution", () => {
    const sql = compact(readFileSync(migration0018Path, "utf8"));
    const signature = "mark_storage_object_invalid_target_manual_required(uuid, uuid, uuid, uuid, integer, integer)";

    expect(sql.match(/security definer/g)).toHaveLength(1);
    expect(sql.match(/set search_path = pg_catalog, public/g)).toHaveLength(1);
    expect(sql).toContain(`revoke all on function public.${signature} from public, anon, authenticated, service_role;`);
    expect(sql).toContain(`grant execute on function public.${signature} to service_role;`);
  });
});
