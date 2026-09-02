import { describe, expect, it, vi } from "vitest";
import { stageScriptAudioForReplay } from "@/services/voice/replay.service";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SCRIPT_ID = "22222222-2222-4222-8222-222222222222";
const VOICE_ID = "33333333-3333-4333-8333-333333333333";
const OBJECT_KEY = `${USER_ID}/${SCRIPT_ID}/${VOICE_ID}/cache-key.bin`;
const AUDIO_BYTES = Buffer.from([1, 2, 3, 4]);

function synthesized() {
  return {
    audioUrl: "",
    providerRequestId: "provider-request-a",
    cached: false,
    audioSource: {
      kind: "inline-bytes" as const,
      bytesBase64: AUDIO_BYTES.toString("base64"),
      contentType: "audio/mpeg"
    }
  };
}

function storageClient(input: {
  uploadError?: { message: string } | null;
  existingBytes?: Buffer;
  downloadError?: { message: string } | null;
} = {}) {
  const upload = vi.fn(async () => ({ data: null, error: input.uploadError ?? null }));
  const download = vi.fn(async () => ({
    data: input.existingBytes ? new Blob([Uint8Array.from(input.existingBytes)]) : null,
    error: input.downloadError ?? null
  }));
  const from = vi.fn(() => ({ upload, download }));

  return {
    client: { storage: { from } },
    from,
    upload,
    download
  };
}

function stage(client: ReturnType<typeof storageClient>["client"]) {
  return stageScriptAudioForReplay({
    storageClient: client as never,
    userId: USER_ID,
    scriptId: SCRIPT_ID,
    voiceId: VOICE_ID,
    cacheKey: "cache-key",
    synthesized: synthesized(),
    reservedStorageObjectKey: OBJECT_KEY
  });
}

describe("G5D-2E server-owned script-audio Storage writer", () => {
  it("uploads exactly once through the injected server Storage authority", async () => {
    const storage = storageClient();

    await expect(stage(storage.client)).resolves.toMatchObject({
      storedAsset: {
        storageBucket: "script-audios",
        storageObjectKey: OBJECT_KEY,
        contentType: "audio/mpeg",
        byteLength: AUDIO_BYTES.length
      }
    });
    expect(storage.from).toHaveBeenCalledWith("script-audios");
    expect(storage.upload).toHaveBeenCalledTimes(1);
    expect(storage.download).not.toHaveBeenCalled();
  });

  it("accepts a duplicate only after exact-byte reconciliation", async () => {
    const storage = storageClient({
      uploadError: { message: "The resource already exists" },
      existingBytes: AUDIO_BYTES
    });

    await expect(stage(storage.client)).resolves.toMatchObject({
      storedAsset: { storageObjectKey: OBJECT_KEY }
    });
    expect(storage.upload).toHaveBeenCalledTimes(1);
    expect(storage.download).toHaveBeenCalledWith(OBJECT_KEY);
  });

  it("keeps an ambiguous or mismatched write unresolved", async () => {
    const unverifiable = storageClient({ uploadError: { message: "already exists" } });
    await expect(stage(unverifiable.client)).rejects.toMatchObject({ status: 500 });

    const mismatch = storageClient({
      uploadError: { message: "duplicate" },
      existingBytes: Buffer.from([9, 9, 9])
    });
    await expect(stage(mismatch.client)).rejects.toMatchObject({ status: 500 });
  });
});
