import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/config", () => ({ getSupabaseServiceRoleKey: () => "fake-only" }));
import {
  accountDeletionLegalHoldBlocks, selectAccountDeletionResumeStage,
  type AccountDeletionCanonicalStage
} from "@/services/account-deletion/account-deletion-legal-hold";
import { runAccountDeletionProviderDurableStep } from "@/services/account-deletion/account-deletion-provider-durable-runner";
import { runAccountDeletionStorageDurableStep } from "@/services/account-deletion/account-deletion-storage-durable-runner";
import { runAccountDeletionAuthDurableStep } from "@/services/account-deletion/account-deletion-auth-durable-runner";
import { runAccountDeletionDatabaseOperatorStage } from "@/services/account-deletion/account-deletion-database-operator.service";
import type { Database } from "@/types/database";

type Row = Database["public"]["Tables"]["account_deletion_requests"]["Row"];
const stages: AccountDeletionCanonicalStage[] = ["provider", "storage", "database", "auth", "completion"];
const id = "28000000-0000-4000-8000-000000000001";
const owner = "28100000-0000-4000-8000-000000000001";
const fixture = (overrides: Partial<Row> = {}) => ({
  id, user_id: owner, status: "confirmed", legal_hold_active: false, legal_hold_scope: null,
  provider_cleanup_status: "pending", provider_sub_finalized_at: null,
  provider_snapshot_version: "g5d-2a.account-provider.v1", provider_snapshot_status: "sealed",
  provider_snapshot_seal_version: 1, provider_snapshot_sealed_at: "2026-09-15T00:00:00Z",
  storage_cleanup_status: "pending", storage_sub_finalized_at: null,
  storage_snapshot_version: "g5d-2e.account-storage.v1", storage_snapshot_status: "sealed",
  storage_snapshot_seal_version: 1, storage_snapshot_sealed_at: "2026-09-15T00:00:00Z",
  db_cleanup_status: "pending", db_sub_finalized_at: null,
  auth_cleanup_status: "pending", auth_sub_finalized_at: null, ...overrides
} as Row);

describe("R3 scoped legal hold", () => {
  it.each([
    ["retained_audit", []], ["provider", ["provider", "database", "auth", "completion"]],
    ["storage", ["storage", "database", "auth", "completion"]],
    ["database", ["database", "auth", "completion"]], ["owner_linkage", ["auth", "completion"]]
  ])("guards only stages that invalidate %s", (scope, blocked) => {
    const row = fixture({ legal_hold_active: true, legal_hold_scope: [scope as string] });
    expect(stages.filter(stage => accountDeletionLegalHoldBlocks(row, stage))).toEqual(blocked);
  });

  it.each([undefined, null, [], ["unknown"], ["storage", "provider"], ["provider", "provider"], [null]])(
    "fails closed on malformed active scope %j", scope => {
      expect(stages.every(stage => accountDeletionLegalHoldBlocks({ legal_hold_active: true, legal_hold_scope: scope }, stage))).toBe(true);
    });
  it("fails closed on missing persisted predicate", () => {
    expect(accountDeletionLegalHoldBlocks({}, "provider")).toBe(true);
  });
  it("supports combined sorted narrow scopes", () => {
    const row = fixture({ legal_hold_active: true, legal_hold_scope: ["owner_linkage", "storage"] });
    expect(accountDeletionLegalHoldBlocks(row, "provider")).toBe(false);
    expect(accountDeletionLegalHoldBlocks(row, "storage")).toBe(true);
    expect(accountDeletionLegalHoldBlocks(row, "auth")).toBe(true);
  });
  it.each(stages.slice(0, 4))("resumes first incomplete %s after explicit release without mutation", stage => {
    const row = fixture({ legal_hold_active: true, legal_hold_scope: [stage === "auth" ? "owner_linkage" : stage] });
    const fields = [["provider_cleanup_status", "provider_sub_finalized_at"], ["storage_cleanup_status", "storage_sub_finalized_at"],
      ["db_cleanup_status", "db_sub_finalized_at"], ["auth_cleanup_status", "auth_sub_finalized_at"]] as const;
    for (let n = 0; n < stages.indexOf(stage); n++) {
      row[fields[n][0]] = "succeeded";
      row[fields[n][1]] = "2026-09-15T00:00:00Z";
    }
    expect(selectAccountDeletionResumeStage(row)).toBeNull();
    row.legal_hold_active = false;
    const before = structuredClone(row);
    expect(selectAccountDeletionResumeStage(row)).toBe(stage);
    expect(row).toEqual(before);
  });
  it("never reopens completed requests or replays completed stages", () => {
    const row = fixture({ status: "completed" });
    expect(selectAccountDeletionResumeStage(row)).toBeNull();
    expect(selectAccountDeletionResumeStage({ ...row, legal_hold_active: true, legal_hold_scope: ["retained_audit"] })).toBeNull();
  });
  it("does not clear manual state on release", () => {
    expect(selectAccountDeletionResumeStage(fixture({ provider_cleanup_status: "manual_required" }))).toBeNull();
  });
  it("retained audit permits existing deletion stages and isolates User B", () => {
    expect(selectAccountDeletionResumeStage(fixture({ legal_hold_active: true, legal_hold_scope: ["retained_audit"] }))).toBe("provider");
    const held = fixture({ legal_hold_active: true, legal_hold_scope: ["provider"] });
    const userB = fixture({ id: "28000000-0000-4000-8000-000000000002" });
    expect(selectAccountDeletionResumeStage(held)).toBeNull();
    expect(selectAccountDeletionResumeStage(userB)).toBe("provider");
  });

  it.each(["provider", "storage"] as const)("held %s stops before lease, counters or adapter dispatch", async stage => {
    const row = fixture({ legal_hold_active: true, legal_hold_scope: [stage],
      ...(stage === "storage" ? { provider_cleanup_status: "succeeded", provider_sub_finalized_at: "2026-09-15T00:00:00Z" } : {}) });
    const calls: string[] = [];
    const repository = new Proxy({ getRequestForOwner: async () => row }, {
      get(target, key) { if (key in target) return target[key as keyof typeof target]; return () => { calls.push(String(key)); throw Error("unexpected mutation"); }; }
    });
    const adapter = new Proxy({}, { get: () => () => { calls.push("adapter"); throw Error("unexpected external action"); } });
    const runner = stage === "provider" ? runAccountDeletionProviderDurableStep : runAccountDeletionStorageDurableStep;
    const before = structuredClone(row);
    const result = await runner({ deletionRequestId: id, userId: owner }, {
      repository, providerAdapter: adapter, storageAdapter: adapter
    } as unknown as Parameters<typeof runner>[1]);
    expect(result.kind).toBe("not_runnable");
    expect(calls).toEqual([]);
    expect(row).toEqual(before);
  });
  it("owner hold blocks Auth before any verification, intent or DELETE mutation", async () => {
    const row = fixture({ legal_hold_active: true, legal_hold_scope: ["owner_linkage"] });
    const getRequestByAuthority = vi.fn(async () => row);
    const result = await runAccountDeletionAuthDurableStep({ requestRef: id }, {
      repository: { getRequestByAuthority }, authAdapter: {}
    } as unknown as Parameters<typeof runAccountDeletionAuthDurableStep>[1]);
    expect(result.status).toBe("blocked");
    expect(result.safeReasonCode).toBe("legal_hold_active");
    expect(result.safeCounts.destructiveOperationsAttempted).toBe(0);
    expect(result.safeCounts.authGetCalls).toBe(0);
  });
  it("Database hold stops before finalizer invocation", async () => {
    const finalizeDatabaseStage = vi.fn();
    const result = await runAccountDeletionDatabaseOperatorStage({ stage: "database", mode: "execute", request: { userId: owner, deletionRequestId: id } }, {
      env: { NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE: "1" },
      repository: { getRequestForOwner: async () => fixture({ legal_hold_active: true, legal_hold_scope: ["database"] }), finalizeDatabaseStage }
    });
    expect(result.status).toBe("blocked");
    expect(finalizeDatabaseStage).not.toHaveBeenCalled();
  });
});

const migrations = new URL("../../../supabase/migrations/", import.meta.url);
const sql = readFileSync(new URL("0028_gate5_limited_legal_hold.sql", migrations), "utf8");
const original = (prefix: string) => readFileSync(new URL(readdirSync(migrations).find(name => name.startsWith(prefix))!, migrations), "utf8");
const fn = (source: string, name: string) => {
  const start = source.indexOf(`create or replace function public.${name}(`);
  return source.slice(start, source.indexOf("\n$$;", start) + 4);
};
describe("R3 forward migration contract", () => {
  it("adds exactly next migration and only six hold columns", () => {
    expect(readdirSync(migrations).filter(name => /^\d{4}_/.test(name)).sort().map(name => name.slice(0, 4)))
      .toEqual(Array.from({ length: 28 }, (_, i) => String(i + 1).padStart(4, "0")));
    expect(sql.match(/add column /g)).toHaveLength(6);
  });
  it("preserves the complete DB finalizer except its early scope guard", () => {
    const guard = "  if public.account_deletion_legal_hold_blocks(v_request, 'database') then\n    raise exception using errcode = 'check_violation', message = 'legal_hold_active';\n  end if;\n\n";
    expect(fn(sql, "finalize_account_deletion_database_stage").replace(guard, ""))
      .toBe(fn(original("0025_"), "finalize_account_deletion_database_stage"));
  });
  it.each(["provider", "storage"])("preserves %s lease CAS except atomic hold predicate", stage => {
    const guard = `and not public.account_deletion_legal_hold_blocks(account_deletion_requests, '${stage}')\n    `;
    const name = `claim_account_deletion_${stage}_lease`;
    expect(fn(sql, name).replace(guard, "")).toBe(fn(original(stage === "provider" ? "0022_" : "0023_"), name));
  });
  it("preserves Auth dispatch authority except hold predicate", () => {
    const name = "authorize_account_deletion_auth_delete_dispatch";
    expect(fn(sql, name).replace("    or public.account_deletion_legal_hold_blocks(v_request, 'auth')\n", ""))
      .toBe(fn(original("0026_"), name));
  });
  it("keeps all first-Completion checks byte-identical", () => {
    const name = "enforce_account_deletion_completion_authority";
    const suffix = (s: string) => s.slice(s.indexOf("  if new.status = 'completed' then"));
    expect(suffix(fn(sql, name))).toBe(suffix(fn(original("0027_"), name)));
  });
  it("apply/release have no stage, expiry or destructive write", () => {
    for (const name of ["apply_account_deletion_legal_hold", "release_account_deletion_legal_hold"]) {
      const body = fn(sql, name);
      const write = body.slice(body.indexOf("  update public.account_deletion_requests set"));
      expect(write).not.toMatch(/\b(expires_at|completed_at|status|retry_count|user_id)\s*=/);
      expect(body).not.toMatch(/\b(delete from|finalize_account_deletion|authorize_account_deletion)\b/);
      expect(body).toContain("for update");
    }
  });
});
