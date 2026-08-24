import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSupabaseClient } from "@/lib/supabase/client";

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn()
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient
}));

import { uploadOwnedVoiceConsentRecording } from "@/services/storage/voice-consent-storage.service";
import { uploadOwnedVoiceSample } from "@/services/storage/voice-sample-storage.service";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CONSENT_ID = "22222222-2222-4222-8222-222222222222";
const RESERVATION = {
  intentId: "33333333-3333-4333-8333-333333333333",
  leaseToken: "44444444-4444-4444-8444-444444444444"
};
const COMPLETED_INTENT = {
  id: RESERVATION.intentId,
  user_id: USER_ID,
  kind: "voice_sample_upload" as const,
  status: "completed" as const,
  lease_token: null,
  lease_expires_at: null,
  script_id: null,
  voice_id: null,
  cache_key: null,
  storage_bucket: "voice-samples",
  storage_object_key: `${USER_ID}/${CONSENT_ID}/sample.m4a`,
  created_at: "2026-08-24T00:00:00.000Z",
  updated_at: "2026-08-24T00:00:00.000Z"
};
type ReserveMock = (input: Record<string, unknown>) => Promise<typeof RESERVATION>;
type FinalizeMock = (input: Record<string, unknown>) => Promise<typeof COMPLETED_INTENT>;

function createClient(upload: ReturnType<typeof vi.fn>) {
  const consentQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data: { id: CONSENT_ID, user_id: USER_ID }, error: null }))
  };
  consentQuery.select.mockReturnValue(consentQuery);
  consentQuery.eq.mockReturnValue(consentQuery);

  return {
    from: vi.fn(() => consentQuery),
    storage: { from: vi.fn(() => ({ upload })) }
  } as unknown as AppSupabaseClient;
}

function intents(
  reserve = vi.fn<ReserveMock>().mockResolvedValue(RESERVATION),
  finalizeUpload = vi.fn<FinalizeMock>().mockResolvedValue(COMPLETED_INTENT)
) {
  return { reserve, finalizeUpload };
}

function configureServerStorage(upload: ReturnType<typeof vi.fn>) {
  const from = vi.fn(() => ({ upload }));
  mocks.createSupabaseAdminClient.mockReturnValue({ storage: { from } });
  return from;
}

describe("G5C-B4 durable voice uploads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an active deletion before voice sample Storage is called", async () => {
    const authenticatedUpload = vi.fn();
    const reserve = vi.fn<ReserveMock>().mockRejectedValue({ status: 409 });

    await expect(uploadOwnedVoiceSample(
      createClient(authenticatedUpload),
      USER_ID,
      { consentId: CONSENT_ID, file: new File(["sample"], "sample.m4a", { type: "audio/mp4" }) },
      intents(reserve)
    )).rejects.toMatchObject({ status: 409 });

    expect(reserve).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER_ID,
      kind: "voice_sample_upload",
      storageBucket: "voice-samples",
      storageObjectKey: expect.stringMatching(new RegExp(`^${USER_ID}/${CONSENT_ID}/[^/]+\\.m4a$`))
    }));
    expect(authenticatedUpload).not.toHaveBeenCalled();
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("rejects an active deletion before consent recording Storage is called", async () => {
    const authenticatedUpload = vi.fn();
    const reserve = vi.fn<ReserveMock>().mockRejectedValue({ status: 409 });

    await expect(uploadOwnedVoiceConsentRecording(
      createClient(authenticatedUpload),
      USER_ID,
      { file: new File(["consent"], "consent.m4a", { type: "audio/mp4" }) },
      intents(reserve)
    )).rejects.toMatchObject({ status: 409 });

    expect(reserve).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER_ID,
      kind: "voice_consent_upload",
      storageBucket: "voice-consents",
      storageObjectKey: expect.stringMatching(new RegExp(`^${USER_ID}/[^/]+\\.m4a$`))
    }));
    expect(authenticatedUpload).not.toHaveBeenCalled();
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("keeps a successful Storage write unresolved when durable completion crashes", async () => {
    const upload = vi.fn(async () => ({ error: null }));
    const authenticatedUpload = vi.fn();
    const serverStorageFrom = configureServerStorage(upload);
    const finalizeUpload = vi.fn<FinalizeMock>().mockRejectedValue({ status: 500 });
    const writeIntents = intents(vi.fn<ReserveMock>().mockResolvedValue(RESERVATION), finalizeUpload);

    await expect(uploadOwnedVoiceSample(
      createClient(authenticatedUpload),
      USER_ID,
      { consentId: CONSENT_ID, file: new File(["sample"], "sample.m4a", { type: "audio/mp4" }) },
      writeIntents
    )).rejects.toMatchObject({ status: 500 });

    expect(upload).toHaveBeenCalledTimes(1);
    expect(authenticatedUpload).not.toHaveBeenCalled();
    expect(serverStorageFrom).toHaveBeenCalledWith("voice-samples");
    expect(mocks.createSupabaseAdminClient).toHaveBeenCalledTimes(1);
    expect(finalizeUpload).toHaveBeenCalledWith(expect.objectContaining({
      ...RESERVATION,
      userId: USER_ID,
      storageBucket: "voice-samples"
    }));
  });

  it("does not finalize or cancel when the Storage response is ambiguous", async () => {
    const upload = vi.fn(async () => ({ error: { message: "network timeout after request" } }));
    const authenticatedUpload = vi.fn();
    const serverStorageFrom = configureServerStorage(upload);
    const finalizeUpload = vi.fn<FinalizeMock>().mockResolvedValue(COMPLETED_INTENT);
    const writeIntents = intents(vi.fn<ReserveMock>().mockResolvedValue(RESERVATION), finalizeUpload);

    await expect(uploadOwnedVoiceConsentRecording(
      createClient(authenticatedUpload),
      USER_ID,
      { file: new File(["consent"], "consent.m4a", { type: "audio/mp4" }) },
      writeIntents
    )).rejects.toMatchObject({ status: 500 });

    expect(upload).toHaveBeenCalledTimes(1);
    expect(authenticatedUpload).not.toHaveBeenCalled();
    expect(serverStorageFrom).toHaveBeenCalledWith("voice-consents");
    expect(mocks.createSupabaseAdminClient).toHaveBeenCalledTimes(1);
    expect(finalizeUpload).not.toHaveBeenCalled();
    expect(Object.keys(writeIntents)).not.toContain("cancelKnownNoSideEffect");
  });

  it("terminalizes successful sample and consent uploads with the exact reserved identity", async () => {
    for (const uploadKind of ["sample", "consent"] as const) {
      const upload = vi.fn(async () => ({ error: null }));
      const authenticatedUpload = vi.fn();
      const serverStorageFrom = configureServerStorage(upload);
      const reserve = vi.fn<ReserveMock>().mockResolvedValue(RESERVATION);
      const finalizeUpload = vi.fn<FinalizeMock>().mockResolvedValue(COMPLETED_INTENT);
      const writeIntents = intents(reserve, finalizeUpload);
      const client = createClient(authenticatedUpload);

      if (uploadKind === "sample") {
        await uploadOwnedVoiceSample(
          client,
          USER_ID,
          { consentId: CONSENT_ID, file: new File(["sample"], "sample.m4a", { type: "audio/mp4" }) },
          writeIntents
        );
      } else {
        await uploadOwnedVoiceConsentRecording(
          client,
          USER_ID,
          { file: new File(["consent"], "consent.m4a", { type: "audio/mp4" }) },
          writeIntents
        );
      }

      const reserved = reserve.mock.calls[0]?.[0];
      expect(upload).toHaveBeenCalledWith(reserved?.storageObjectKey, expect.any(Buffer), expect.any(Object));
      expect(authenticatedUpload).not.toHaveBeenCalled();
      expect(serverStorageFrom).toHaveBeenCalledWith(
        uploadKind === "sample" ? "voice-samples" : "voice-consents"
      );
      expect(finalizeUpload).toHaveBeenCalledWith(expect.objectContaining({
        ...RESERVATION,
        storageBucket: reserved?.storageBucket,
        storageObjectKey: reserved?.storageObjectKey
      }));
    }
  });
});
