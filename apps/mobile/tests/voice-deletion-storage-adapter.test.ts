import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

import {
  createVoiceDeletionStorageAdapter,
  type VoiceDeletionStorageAdapter
} from "@/services/voice-deletion/voice-deletion-storage-adapter";

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
    expect(from).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith([objectKey]);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove.mock.calls[0]?.[0]).toHaveLength(1);
  });

  it.each([
    ["voice_sample", "voice-samples", "user-a/consent-a/sample.webm"],
    ["voice_consent_recording", "voice-consents", "user-a/consent.webm"],
    ["script_audio_storage", "script-audios", "user-a/script-a/voice-a/cache.mp3"]
  ] as const)("maps %s only to %s when verifying exactly one key", async (targetKind, bucket, objectKey) => {
    const { client, from, remove, list } = createClient();
    const adapter = createVoiceDeletionStorageAdapter(client as never);

    await expect(adapter.verifyObjectAbsence({ targetKind, objectKey })).resolves.toEqual({ kind: "absent" });
    expect(from).toHaveBeenCalledWith(bucket);
    expect(from).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalled();
  });

  it("rejects recordings before delete selects a bucket or sends a request", async () => {
    const { client, from, remove } = createClient();
    const adapter = createVoiceDeletionStorageAdapter(client as never);

    await expect(
      adapter.deleteObject({ targetKind: "recordings", objectKey: "user-a/take-a/recording.webm" })
    ).resolves.toEqual({ kind: "invalid_target" });
    expect(from).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("rejects recordings before verification selects a bucket or lists", async () => {
    const { client, from, list } = createClient();
    const adapter = createVoiceDeletionStorageAdapter(client as never);

    await expect(
      adapter.verifyObjectAbsence({ targetKind: "recordings", objectKey: "user-a/take-a/recording.webm" })
    ).resolves.toEqual({ kind: "invalid_target" });
    expect(from).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });

  it.each([
    "provider_voice",
    "script_audio",
    "voice_binding",
    "arbitrary-runtime-kind",
    "",
    null,
    undefined
  ])("rejects invalid runtime target kind %p without an external Storage call", async (targetKind) => {
    const deleteClient = createClient();
    const deleteAdapter = createVoiceDeletionStorageAdapter(deleteClient.client as never);
    await expect(
      deleteAdapter.deleteObject({ targetKind, objectKey: "user-a/consent-a/sample.webm" })
    ).resolves.toEqual({ kind: "invalid_target" });
    expect(deleteClient.from).not.toHaveBeenCalled();
    expect(deleteClient.remove).not.toHaveBeenCalled();

    const verificationClient = createClient();
    const verificationAdapter = createVoiceDeletionStorageAdapter(verificationClient.client as never);
    await expect(
      verificationAdapter.verifyObjectAbsence({ targetKind, objectKey: "user-a/consent-a/sample.webm" })
    ).resolves.toEqual({ kind: "invalid_target" });
    expect(verificationClient.from).not.toHaveBeenCalled();
    expect(verificationClient.list).not.toHaveBeenCalled();
  });

  it.each([null, undefined, [], {}, { targetKind: "voice_sample" }])(
    "rejects malformed runtime input %p before any Storage call",
    async (input) => {
      const deleteClient = createClient();
      const deleteAdapter = createVoiceDeletionStorageAdapter(deleteClient.client as never);
      await expect(deleteAdapter.deleteObject(input)).resolves.toEqual({ kind: "invalid_target" });
      expect(deleteClient.from).not.toHaveBeenCalled();
      expect(deleteClient.remove).not.toHaveBeenCalled();

      const verificationClient = createClient();
      const verificationAdapter = createVoiceDeletionStorageAdapter(verificationClient.client as never);
      await expect(verificationAdapter.verifyObjectAbsence(input)).resolves.toEqual({ kind: "invalid_target" });
      expect(verificationClient.from).not.toHaveBeenCalled();
      expect(verificationClient.list).not.toHaveBeenCalled();
    }
  );

  it.each(["voice_sample", "voice_consent_recording", "script_audio_storage"] as const)(
    "rejects malformed locators for approved %s without selecting a bucket or sending a request",
    async (targetKind) => {
      const { client, from, remove, list } = createClient();
      const adapter = createVoiceDeletionStorageAdapter(client as never);

      await expect(adapter.deleteObject({ targetKind, objectKey: "../recordings/a.webm" })).resolves.toEqual({ kind: "invalid_target" });
      await expect(adapter.verifyObjectAbsence({ targetKind, objectKey: "../recordings/a.webm" })).resolves.toEqual({ kind: "invalid_target" });
      expect(from).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
      expect(list).not.toHaveBeenCalled();
    }
  );

  it("normalizes errors without exposing raw Storage responses", async () => {
    const { client } = createClient({ removeError: { message: "permission denied: private implementation detail", statusCode: 403 } });
    const adapter = createVoiceDeletionStorageAdapter(client as never);

    await expect(adapter.deleteObject({ targetKind: "voice_sample", objectKey: "user-a/consent-a/sample.webm" })).resolves.toEqual({
      kind: "permission_denied"
    });
  });

  it("keeps a valid external Storage rejection distinct from local invalid_target", async () => {
    const removeClient = createClient({ removeError: { message: "bad request", statusCode: 400 } });
    const removeAdapter = createVoiceDeletionStorageAdapter(removeClient.client as never);
    await expect(
      removeAdapter.deleteObject({ targetKind: "voice_sample", objectKey: "user-a/consent-a/sample.webm" })
    ).resolves.toEqual({ kind: "rejected" });
    expect(removeClient.from).toHaveBeenCalledTimes(1);
    expect(removeClient.remove).toHaveBeenCalledTimes(1);

    const listClient = createClient({ listError: { message: "bad request", statusCode: 400 } });
    const listAdapter = createVoiceDeletionStorageAdapter(listClient.client as never);
    await expect(
      listAdapter.verifyObjectAbsence({ targetKind: "voice_sample", objectKey: "user-a/consent-a/sample.webm" })
    ).resolves.toEqual({ kind: "rejected" });
    expect(listClient.from).toHaveBeenCalledTimes(1);
    expect(listClient.list).toHaveBeenCalledTimes(1);
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
