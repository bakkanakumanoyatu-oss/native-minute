import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/services/account-deletion/account-deletion.service", () => ({
  ACCOUNT_DELETION_DESTRUCTIVE_GUARD_ENV: "NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE"
}));
import { createRetentionPurgeRepository, parseRetentionPurgeResult } from "@/services/account-deletion/retention-purge.repository";
import { runRetentionPurgeOperator } from "@/services/account-deletion/retention-purge-operator.service";

const id = "93000000-0000-4000-8000-000000000001";
const env = { NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE: "1" };
const row = { examined: 1, purged: 1, skipped_hold: 0, skipped_not_expired: 0, skipped_unsafe: 0,
  legacy_hold_linkage_unresolved: 0, next_after_id: id };

describe("R2 bounded operator", () => {
  it.each(["quota", "voice", "account"])("invokes %s exactly once", async resource => {
    const purgeNext = vi.fn().mockResolvedValue(row);
    const result = await runRetentionPurgeOperator({ resource, mode: "execute" }, { env, repository: { purgeNext } });
    expect(result.status).toBe("succeeded");
    expect(purgeNext).toHaveBeenCalledExactlyOnceWith(resource, null);
    expect(result).toMatchObject({ rpcCalls: 1, safeCounts: { examined: 1, purged: 1 }, nextAfterId: id });
  });
  it.each([{}, { resource: "quota" }, { resource: "bad", mode: "execute" },
    { resource: "quota", mode: "execute", afterId: "raw input" }])("rejects invalid input without calls", async input => {
    const purgeNext = vi.fn();
    expect((await runRetentionPurgeOperator(input, { env, repository: { purgeNext } })).status).toBe("blocked");
    expect(purgeNext).not.toHaveBeenCalled();
  });
  it("requires the existing destructive guard", async () => {
    const purgeNext = vi.fn();
    expect(await runRetentionPurgeOperator({ resource: "quota", mode: "execute" }, { env: {}, repository: { purgeNext } }))
      .toMatchObject({ rpcCalls: 0, safeReasonCode: "destructive_guard_missing" });
    expect(purgeNext).not.toHaveBeenCalled();
  });
  it("does not retry or fabricate purge after response loss", async () => {
    const purgeNext = vi.fn().mockRejectedValue(new Error("secret provider locator"));
    const result = await runRetentionPurgeOperator({ resource: "quota", mode: "execute" }, { env, repository: { purgeNext } });
    expect(result).toEqual({ status: "unknown", safeReasonCode: "retention_result_unknown", rpcCalls: 1 });
    expect(purgeNext).toHaveBeenCalledTimes(1);
  });
  it("rejects nonadvancing cursor", async () => {
    const result = await runRetentionPurgeOperator({ resource: "quota", mode: "execute", afterId: id }, {
      env, repository: { purgeNext: vi.fn().mockResolvedValue(row) }
    });
    expect(result.status).toBe("unknown");
  });
  it.each([null, [], [row, row], [{ ...row, examined: 2 }], [{ ...row, purged: -1 }],
    [{ ...row, skipped_hold: 1 }], [{ ...row, next_after_id: "raw" }], [{ ...row, purged: NaN }]])("rejects malformed aggregates", value => {
    expect(parseRetentionPurgeResult(value)).toBeNull();
  });
  it("strips all surplus fields from repository output", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ ...row, secret: "private" }], error: null });
    const repository = createRetentionPurgeRepository({ rpc } as never);
    expect(await repository.purgeNext("quota", null)).toEqual(row);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("routine_purge_retained_evidence", { p_resource: "quota", p_after_id: null });
  });
  it.each(["skipped_hold", "skipped_not_expired", "skipped_unsafe", "legacy_hold_linkage_unresolved"])("preserves %s distinctly", key => {
    const value = { ...row, purged: 0, [key]: 1 };
    expect(parseRetentionPurgeResult([value])).toEqual(value);
  });
  it("preserves exhausted sweep", () => {
    expect(parseRetentionPurgeResult([{ ...row, examined: 0, purged: 0, next_after_id: null }]))
      .toEqual({ ...row, examined: 0, purged: 0, next_after_id: null });
  });
});
