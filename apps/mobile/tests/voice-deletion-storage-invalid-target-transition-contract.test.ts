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

describe("G5C-B3 invalid Storage target durable mapping", () => {
  it("is a forward-only result-RPC replacement and leaves 0017's contract untouched", () => {
    const sql0017 = compact(readFileSync(migration0017Path, "utf8"));
    const sql0018 = compact(readFileSync(migration0018Path, "utf8"));

    expect(sql0017).not.toContain("invalid_target");
    expect(sql0018.match(/create or replace function/g)).toHaveLength(2);
    expect(sql0018).toContain("create or replace function public.record_storage_object_delete_result(");
    expect(sql0018).toContain("create or replace function public.record_storage_object_verification_result(");
    expect(sql0018).not.toContain("create table");
    expect(sql0018).not.toContain("alter table");
    expect(sql0018).not.toContain("create trigger");
    expect(sql0018).not.toContain("drop policy");
    expect(sql0018).not.toContain("storage.objects");
    expect(sql0018).not.toContain("locator_scrubbed_at");
    expect(sql0018).not.toContain("database_cleanup");
    expect(sql0018).not.toContain("post_delete_verification");
    expect(sql0018).not.toContain("status = 'completed'");
  });

  it("accepts invalid_target as a durable local contract failure and makes it manual", () => {
    const sql = compact(readFileSync(migration0018Path, "utf8"));

    expect(sql).toContain("'request_succeeded', 'invalid_target', 'timed_out'");
    expect(sql).toContain("elsif p_result in ('auth_failed', 'permission_denied', 'invalid_target') then");
    expect(sql).toContain("'absent', 'present', 'invalid_target', 'timed_out'");
    expect(sql).toContain("elsif p_result = 'invalid_target' then");
    expect(sql).toContain("set status = 'manual_required'");
    expect(sql).toContain("last_failure_category = p_result");
    expect(sql).toContain("manual_reason_category = p_result");
    expect(sql).toContain("next_retry_at = null");
    expect(sql).not.toContain("verified_absent_at = coalesce(verified_absent_at, now()) and p_result = 'invalid_target'");
  });

  it("preserves generic external rejected delete semantics as verification-first", () => {
    const sql = compact(readFileSync(migration0018Path, "utf8"));

    expect(sql).not.toContain("p_result in ('auth_failed', 'permission_denied', 'rejected', 'invalid_target')");
    expect(sql).toContain("when p_result in ('rejected', 'protocol_error') then 'rejected'");
    expect(sql).toContain("set status = 'delete_requested', delete_outcome = v_delete_outcome, reconciliation_status = 'not_applicable', verification_status = 'pending', last_failure_category = p_result");
  });

  it("preserves SECURITY DEFINER, fixed search_path, and service-role-only execution", () => {
    const sql = compact(readFileSync(migration0018Path, "utf8"));
    const signatures = [
      "record_storage_object_delete_result(uuid, uuid, uuid, uuid, integer, text, integer)",
      "record_storage_object_verification_result(uuid, uuid, uuid, uuid, integer, text, integer)"
    ];

    expect(sql.match(/security definer/g)).toHaveLength(2);
    expect(sql.match(/set search_path = pg_catalog, public/g)).toHaveLength(2);
    for (const signature of signatures) {
      expect(sql).toContain(`revoke all on function public.${signature} from public, anon, authenticated, service_role;`);
      expect(sql).toContain(`grant execute on function public.${signature} to service_role;`);
    }
  });
});
