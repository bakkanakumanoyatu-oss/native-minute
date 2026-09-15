import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
import { runVoiceSourceCleanup } from "@/services/voice/voice-source-cleanup.service";
import { parseSourceCleanupClaim, SOURCE_CLEANUP_REASONS, createVoiceSourceCleanupRepository } from "@/services/voice/voice-source-cleanup.repository";
import { createAccountDeletionStorageAdapter } from "@/services/account-deletion/account-deletion-storage-adapter";

const sourceId = "10000000-0000-4000-8000-000000000001";
const userId = "20000000-0000-4000-8000-000000000001";
const env = { NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE: "1" };
function fixture(bucket: "voice-samples" | "voice-consents" = "voice-samples") {
  const target = { reason: "claimed" as const, sourceId, userId, bucket,
    objectKey: `${userId}/${bucket === "voice-samples" ? "consent/" : ""}sample.wav`, leaseExpiresAt: new Date(Date.now()+900_000).toISOString() };
  const repository = {
    select: vi.fn(async () => sourceId as string | null),
    claim: vi.fn(async () => target), check: vi.fn(async () => true), finish: vi.fn(async () => true)
  };
  const storage = {
    listOwnedInventory: vi.fn(), deleteObject: vi.fn(async () => ({ kind: "request_succeeded" as const })),
    verifyObjectAbsence: vi.fn().mockResolvedValueOnce({ kind: "present" }).mockResolvedValue({ kind: "absent" })
  };
  return { target, repository, storage, env };
}
describe("R1 explicit bounded operator", () => {
  it.each([undefined, "dry-run", "anything"])("requires explicit execute: %s", async mode => {
    const f = fixture(); expect((await runVoiceSourceCleanup({ mode }, f)).status).toBe("blocked");
    expect(f.repository.select).not.toHaveBeenCalled(); expect(f.storage.deleteObject).not.toHaveBeenCalled();
  });
  it("requires destructive guard before repository construction", async () => {
    const f = fixture(); expect((await runVoiceSourceCleanup({ mode: "execute" }, { ...f, env: {} })).safeReasonCode).toBe("destructive_guard_missing");
    expect(f.repository.select).not.toHaveBeenCalled();
  });
  it.each(["voice-samples", "voice-consents"] as const)("verifies %s before canonical success", async bucket => {
    const f = fixture(bucket); const result = await runVoiceSourceCleanup({ mode: "execute" }, f);
    expect(result).toMatchObject({ status: "succeeded", safeReasonCode: "cleanup_succeeded", safeCounts: { examined: 1, deleteCalls: 1, verificationCalls: 2 }, nextAfterId: sourceId });
    expect(f.repository.finish).toHaveBeenCalledWith(sourceId, expect.any(String), "cleanup_succeeded");
    expect(f.storage.deleteObject).toHaveBeenCalledWith({ userId, objectKey: f.target.objectKey, targetKind: bucket === "voice-samples" ? "voice_sample" : "voice_consent_recording" });
    expect(JSON.stringify(result)).not.toContain(userId); expect(JSON.stringify(result)).not.toContain("sample.wav");
    expect(f.repository.check).toHaveBeenCalledTimes(3);
  });
  it("already absent skips DELETE and converges with Account deletion", async () => {
    const f = fixture(); f.storage.verifyObjectAbsence.mockReset().mockResolvedValue({ kind: "absent" });
    expect((await runVoiceSourceCleanup({ mode: "execute" }, f)).safeReasonCode).toBe("already_absent");
    expect(f.storage.deleteObject).not.toHaveBeenCalled();
  });
  it.each(["timed_out", "auth_failed", "permission_denied", "protocol_error", "unavailable"])("initial verification %s never deletes", async kind => {
    const f = fixture(); f.storage.verifyObjectAbsence.mockReset().mockResolvedValue({ kind });
    expect((await runVoiceSourceCleanup({ mode: "execute" }, f)).status).toBe("retryable_failure");
    expect(f.storage.deleteObject).not.toHaveBeenCalled();
    expect(f.repository.finish).toHaveBeenCalledWith(sourceId, expect.any(String), "verification_failure");
  });
  it("DELETE success with present object is retryable verification failure", async () => {
    const f = fixture(); f.storage.verifyObjectAbsence.mockReset().mockResolvedValue({ kind: "present" });
    expect((await runVoiceSourceCleanup({ mode: "execute" }, f)).safeReasonCode).toBe("verification_failure");
  });
  it("DELETE failure and present object retains transient failure", async () => {
    const f = fixture(); f.storage.verifyObjectAbsence.mockReset().mockResolvedValue({ kind: "present" });
    f.storage.deleteObject.mockResolvedValue({ kind: "network_error" } as never);
    expect((await runVoiceSourceCleanup({ mode: "execute" }, f)).safeReasonCode).toBe("storage_delete_transient_failure");
  });
  it("concurrent Account removal plus failed DELETE converges by exact absence", async () => {
    const f = fixture(); f.storage.deleteObject.mockResolvedValue({ kind: "rejected" } as never);
    expect((await runVoiceSourceCleanup({ mode: "execute" }, f)).safeReasonCode).toBe("cleanup_succeeded");
  });
  it("stale worker stops before DELETE and does not mutate a newer claim", async () => {
    const f = fixture(); f.repository.check.mockResolvedValueOnce(true).mockResolvedValue(false);
    expect((await runVoiceSourceCleanup({ mode: "execute" }, f)).safeReasonCode).toBe("claim_conflict");
    expect(f.storage.deleteObject).not.toHaveBeenCalled(); expect(f.repository.finish).not.toHaveBeenCalled();
  });
  it("expiry deadline stops storage work", async () => {
    const f = fixture(); f.target.leaseExpiresAt = new Date(Date.now()-1).toISOString();
    await runVoiceSourceCleanup({ mode: "execute" }, f);
    expect(f.storage.verifyObjectAbsence).not.toHaveBeenCalled();
  });
  it("a delayed successful CAS response cannot outlive its cleanup lease", async () => {
    const f = fixture();
    const now = vi.spyOn(Date, "now");
    const started = Date.now();
    f.repository.check.mockImplementation(async () => { now.mockReturnValue(started + 1_000_000); return true; });
    try {
      expect((await runVoiceSourceCleanup({ mode: "execute" }, f)).safeReasonCode).toBe("claim_conflict");
      expect(f.storage.verifyObjectAbsence).not.toHaveBeenCalled();
      expect(f.storage.deleteObject).not.toHaveBeenCalled();
    } finally { now.mockRestore(); }
  });
  it("lost durable completion response is never reported succeeded", async () => {
    const f = fixture(); f.repository.finish.mockResolvedValue(false);
    expect((await runVoiceSourceCleanup({ mode: "execute" }, f)).status).toBe("unknown");
  });
  it.each(SOURCE_CLEANUP_REASONS)("%s advances cursor without storage dispatch", async reason => {
    const f = fixture(); f.repository.claim.mockResolvedValue({ reason } as never);
    expect(await runVoiceSourceCleanup({ mode: "execute" }, f)).toMatchObject({ safeReasonCode: reason, nextAfterId: sourceId, safeCounts: { examined: 1, deleteCalls: 0 } });
    expect(f.storage.deleteObject).not.toHaveBeenCalled();
  });
  it("end of sweep returns null cursor without claims", async () => {
    const f = fixture(); f.repository.select.mockResolvedValue(null);
    expect(await runVoiceSourceCleanup({ mode: "execute" }, f)).toMatchObject({ nextAfterId: null, safeReasonCode: "sweep_complete" });
    expect(f.repository.claim).not.toHaveBeenCalled();
  });
  it("nonmonotonic cursor is malformed and never deletes", async () => {
    const f = fixture();
    expect((await runVoiceSourceCleanup({ mode: "execute", afterId: sourceId }, f)).status).toBe("unknown");
    expect(f.repository.claim).not.toHaveBeenCalled();
  });
  it("exceptions cannot leak raw paths/provider diagnostics", async () => {
    const f = fixture(); f.repository.claim.mockRejectedValue(new Error(`SECRET ${userId} ${f.target.objectKey}`));
    expect(JSON.stringify(await runVoiceSourceCleanup({ mode: "execute" }, f))).not.toContain("SECRET");
  });
  it.each(["recordings", "script-audios", "external-provider"])("rejects out-of-scope bucket %s", bucket => {
    expect(parseSourceCleanupClaim({ ...fixture().target, bucket }, sourceId).reason).toBe("malformed_canonical_state");
  });
  it("rejects foreign owner, dot traversal, empty segments, and missing state", () => {
    for (const objectKey of ["foreign/consent/a.wav", `${userId}/../a.wav`, `${userId}//a.wav`]) {
      expect(parseSourceCleanupClaim({ ...fixture().target, objectKey }, sourceId).reason).toBe("unsafe_locator_or_ownership");
    }
    expect(parseSourceCleanupClaim(null, sourceId).reason).toBe("malformed_canonical_state");
  });
  it("repository fail-closes RPC errors without diagnostic propagation", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "secret raw path" } }));
    const r = createVoiceSourceCleanupRepository({ rpc } as never);
    await expect(r.select(null)).rejects.toThrow("source_cleanup_state_unknown");
    expect(await r.finish(sourceId, userId, "cleanup_succeeded")).toBe(false);
  });
});
describe("R1 reuses the Account exact absence adapter", () => {
  it.each([
    [404, {}, "absent"],
    [400, { statusCode: "404", error: "not_found", code: "NoSuchKey", message: "Object not found" }, "absent"],
    [401, { statusCode: 404 }, "auth_failed"],
    [400, { statusCode: "404", error: "not_found", code: "NoSuchKey", message: "different" }, "rejected"]
  ])("HTTP %s body contract", async (status, infoBody, expected) => {
    const bucket = { info: vi.fn(async () => ({ data: null, error: { status, infoBody } })), remove: vi.fn(), list: vi.fn() };
    const adapter = createAccountDeletionStorageAdapter({ storage: { from: () => bucket } } as never);
    expect((await adapter.verifyObjectAbsence({ userId, targetKind: "voice_sample", objectKey: `${userId}/consent/a.wav` })).kind).toBe(expected);
  });
});
