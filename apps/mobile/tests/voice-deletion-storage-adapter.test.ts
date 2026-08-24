import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

import { createVoiceDeletionStorageAdapter } from "@/services/voice-deletion/voice-deletion-storage-adapter";

function createClient(options: { removeError?: unknown; listData?: unknown; listError?: unknown } = {}) {
  const remove = vi.fn().mockResolvedValue({ data: [], error: options.removeError ?? null });
  const list = vi.fn().mockResolvedValue({
    data: Object.prototype.hasOwnProperty.call(options, "listData") ? options.listData : [],
    error: options.listError ?? null
  });
  const from = vi.fn(() => ({ remove, list }));
  return { client: { storage: { from } }, from, remove, list };
}

describe("G5C-B3 exact Storage adapter", () => {
  it.each([
    ["voice_sample", "voice-samples", "user-a/consent-a/sample.webm"],
    ["voice_consent_recording", "voice-consents", "user-a/consent.webm"],
    ["script_audio_storage", "script-audios", "user-a/script-a/voice-a/cache.mp3"]
  ] as const)("maps %s only to %s and removes exactly one key", async (targetKind, bucket, objectKey) => {
    const { client, from, remove } = createClient();
    const adapter = createVoiceDeletionStorageAdapter(client as never);

    await expect(adapter.deleteObject({ targetKind, objectKey })).resolves.toEqual({ kind: "request_succeeded" });
    expect(from).toHaveBeenCalledWith(bucket);
    expect(remove).toHaveBeenCalledWith([objectKey]);
    expect(remove.mock.calls[0]?.[0]).toHaveLength(1);
  });

  it("rejects malformed locators without selecting a bucket or sending a request", async () => {
    const { client, from, remove } = createClient();
    const adapter = createVoiceDeletionStorageAdapter(client as never);

    await expect(adapter.deleteObject({ targetKind: "voice_sample", objectKey: "../recordings/a.webm" })).resolves.toEqual({
      kind: "rejected"
    });
    expect(from).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("normalizes errors without exposing raw Storage responses", async () => {
    const { client } = createClient({ removeError: { message: "permission denied: private implementation detail", statusCode: 403 } });
    const adapter = createVoiceDeletionStorageAdapter(client as never);

    await expect(adapter.deleteObject({ targetKind: "voice_sample", objectKey: "user-a/consent-a/sample.webm" })).resolves.toEqual({
      kind: "permission_denied"
    });
  });

  it("uses parent-prefix plus basename search and only exact equality for absence", async () => {
    const present = createClient({ listData: [{ name: "cache.mp3", id: "object" }] });
    const presentAdapter = createVoiceDeletionStorageAdapter(present.client as never);
    await expect(
      presentAdapter.verifyObjectAbsence({
        targetKind: "script_audio_storage",
        objectKey: "user-a/script-a/voice-a/cache.mp3"
      })
    ).resolves.toEqual({ kind: "present" });
    expect(present.list).toHaveBeenCalledWith("user-a/script-a/voice-a", { limit: 1000, offset: 0, search: "cache.mp3" });

    const absent = createClient({ listData: [{ name: "cache.mp3.bak", id: "other" }] });
    const absentAdapter = createVoiceDeletionStorageAdapter(absent.client as never);
    await expect(
      absentAdapter.verifyObjectAbsence({
        targetKind: "script_audio_storage",
        objectKey: "user-a/script-a/voice-a/cache.mp3"
      })
    ).resolves.toEqual({ kind: "absent" });
  });

  it("never infers absence from malformed, failed, or potentially truncated lists", async () => {
    const malformed = createVoiceDeletionStorageAdapter(createClient({ listData: null }).client as never);
    await expect(malformed.verifyObjectAbsence({ targetKind: "voice_sample", objectKey: "user-a/consent-a/sample.webm" })).resolves.toEqual({
      kind: "protocol_error"
    });

    const failed = createVoiceDeletionStorageAdapter(
      createClient({ listError: { message: "network failed" } }).client as never
    );
    await expect(failed.verifyObjectAbsence({ targetKind: "voice_sample", objectKey: "user-a/consent-a/sample.webm" })).resolves.toEqual({
      kind: "network_error"
    });

    const truncated = createVoiceDeletionStorageAdapter(
      createClient({ listData: Array.from({ length: 1000 }, (_, index) => ({ name: `other-${index}` })) }).client as never
    );
    await expect(truncated.verifyObjectAbsence({ targetKind: "voice_sample", objectKey: "user-a/consent-a/sample.webm" })).resolves.toEqual({
      kind: "protocol_error"
    });
  });
});
