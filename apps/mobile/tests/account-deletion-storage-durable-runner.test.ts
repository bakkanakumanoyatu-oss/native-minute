import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

import type {
  AccountDeletionStorageAdapter,
  AccountDeletionStorageInventory,
  AccountDeletionStorageTargetKind
} from "@/services/account-deletion/account-deletion-storage-adapter";
import { createAccountDeletionStorageAdapter } from "@/services/account-deletion/account-deletion-storage-adapter";
import type {
  AccountDeletionStorageDeleteAttempt,
  AccountDeletionStorageDeleteResult,
  AccountDeletionStorageDurableRepository,
  AccountDeletionStorageFinalization,
  AccountDeletionStorageLease,
  AccountDeletionStorageVerificationAttempt,
  AccountDeletionStorageVerificationResult
} from "@/services/account-deletion/account-deletion-storage-durable.repository";
import {
  runAccountDeletionStorageDurableStep,
  sealAccountDeletionStorageSnapshot
} from "@/services/account-deletion/account-deletion-storage-durable-runner";
import type { Database } from "@/types/database";

type RequestRow = Database["public"]["Tables"]["account_deletion_requests"]["Row"];
type TargetRow = Database["public"]["Tables"]["account_deletion_storage_targets"]["Row"];

const migration = readFileSync(fileURLToPath(new URL("../../../supabase/migrations/0023_g5d_2e_account_deletion_storage_durable_state.sql", import.meta.url)), "utf8");
const storageService = readFileSync(fileURLToPath(new URL("../../../services/account-deletion/account-deletion.service.ts", import.meta.url)), "utf8");
const recordingService = readFileSync(fileURLToPath(new URL("../../../services/storage/recording-storage.service.ts", import.meta.url)), "utf8");
const replayService = readFileSync(fileURLToPath(new URL("../../../services/voice/replay.service.ts", import.meta.url)), "utf8");
const voiceService = readFileSync(fileURLToPath(new URL("../../../services/voice/voice.service.ts", import.meta.url)), "utf8");
const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const USER_A = "22222222-2222-4222-8222-222222222222";
const USER_B = "33333333-3333-4333-8333-333333333333";
const LEASE = "44444444-4444-4444-8444-444444444444";
const NOW = new Date("2026-09-02T00:00:00.000Z");

function inventory(input: Partial<AccountDeletionStorageInventory> = {}): AccountDeletionStorageInventory {
  return {
    recordings: input.recordings ?? [],
    "script-audios": input["script-audios"] ?? [],
    "voice-samples": input["voice-samples"] ?? [],
    "voice-consents": input["voice-consents"] ?? []
  };
}

type Source = { bucket: keyof AccountDeletionStorageInventory; key: string; kind: string; rowId: string };

function createSealFixture(options: {
  listed?: AccountDeletionStorageInventory[];
  sources?: Source[];
  writerActive?: boolean;
  sealed?: boolean;
} = {}) {
  const events: string[] = [];
  const targets: TargetRow[] = [];
  const request = {
    id: REQUEST_ID,
    user_id: USER_A,
    provider_cleanup_status: "succeeded",
    provider_sub_finalized_at: NOW.toISOString(),
    storage_cleanup_status: "pending",
    storage_snapshot_status: options.sealed ? "sealed" : "pending",
    storage_snapshot_collection_token: null,
    storage_snapshot_target_count: 0
  } as unknown as RequestRow;
  let listIndex = 0;
  const listed = options.listed ?? [inventory(), inventory()];

  const repository = {
    beginStorageSnapshot: vi.fn(async (_requestId: string, _userId: string, token: string) => {
      if (options.writerActive) throw new Error("writer active");
      if (request.storage_snapshot_status === "sealed") throw new Error("reseal");
      request.storage_snapshot_status = "collecting";
      request.storage_snapshot_collection_token ??= token;
      events.push("writer-fence-started");
      return request;
    }),
    sealStorageSnapshot: vi.fn(async ({ inventory: listedInventory }: { inventory: AccountDeletionStorageInventory }) => {
      if (options.writerActive || request.storage_snapshot_status !== "collecting") throw new Error("seal blocked");
      const combined = new Map<string, { bucket: keyof AccountDeletionStorageInventory; key: string; kinds: Set<string>; prefix: boolean }>();
      for (const [bucket, keys] of Object.entries(listedInventory) as Array<[keyof AccountDeletionStorageInventory, string[]]>) {
        for (const key of keys) {
          if (!key.startsWith(`${USER_A}/`) || key.includes("//")) throw new Error("ownership");
          const locator = `${bucket}:${key}`;
          const entry = combined.get(locator) ?? { bucket, key, kinds: new Set<string>(), prefix: false };
          entry.prefix = true;
          combined.set(locator, entry);
        }
      }
      for (const source of options.sources ?? []) {
        if (!source.key.startsWith(`${USER_A}/`) || source.key.startsWith(`${USER_B}/`)) throw new Error("ownership");
        const locator = `${source.bucket}:${source.key}`;
        const entry = combined.get(locator) ?? { bucket: source.bucket, key: source.key, kinds: new Set<string>(), prefix: false };
        entry.kinds.add(source.kind);
        combined.set(locator, entry);
      }
      const targetKind: Record<keyof AccountDeletionStorageInventory, AccountDeletionStorageTargetKind> = {
        recordings: "recording",
        "script-audios": "script_audio",
        "voice-samples": "voice_sample",
        "voice-consents": "voice_consent_recording"
      };
      targets.splice(0, targets.length, ...[...combined.values()].sort((a, b) => `${a.bucket}:${a.key}`.localeCompare(`${b.bucket}:${b.key}`)).map((entry, index): TargetRow => ({
        id: `target-${index}`,
        deletion_request_id: REQUEST_ID,
        user_id: USER_A,
        target_kind: targetKind[entry.bucket],
        storage_bucket: entry.bucket,
        storage_object_key: entry.key,
        target_fingerprint: `fingerprint-${index}`,
        source_kind_summary: [...entry.kinds].sort(),
        source_refs: [],
        prefix_listed: entry.prefix,
        status: "pending",
        delete_outcome: "not_attempted",
        verification_status: "not_applicable",
        delete_attempt_count: 0,
        verification_attempt_count: 0,
        next_retry_at: null,
        last_failure_category: null,
        last_attempted_at: null,
        delete_requested_at: null,
        delete_succeeded_at: null,
        verified_absent_at: null,
        manual_required_at: null,
        locator_scrubbed_at: null,
        created_at: NOW.toISOString(),
        updated_at: NOW.toISOString()
      })));
      request.storage_snapshot_status = "sealed";
      request.storage_snapshot_collection_token = null;
      request.storage_snapshot_target_count = targets.length;
      events.push("universe-sealed");
      return request;
    })
  } as unknown as AccountDeletionStorageDurableRepository;

  const adapter = {
    listOwnedInventory: vi.fn(async () => listed[Math.min(listIndex++, listed.length - 1)]),
    deleteObject: vi.fn(),
    verifyObjectAbsence: vi.fn()
  } as unknown as AccountDeletionStorageAdapter;

  return { request, targets, repository, adapter, storageAdapter: adapter, events };
}

type RunnerOptions = {
  targetCount?: number;
  leaseBusy?: boolean;
  staleDeleteResult?: boolean;
  staleVerificationResult?: boolean;
};

function createRunnerFixture(options: RunnerOptions = {}) {
  const events: string[] = [];
  const request = {
    id: REQUEST_ID,
    user_id: USER_A,
    status: "confirmed",
    provider_cleanup_status: "succeeded",
    provider_sub_finalized_at: NOW.toISOString(),
    storage_cleanup_status: "pending",
    storage_snapshot_version: "g5d-2e.account-storage.v1",
    storage_snapshot_status: "sealed",
    storage_snapshot_seal_version: 1,
    storage_snapshot_sealed_at: NOW.toISOString(),
    storage_snapshot_target_count: options.targetCount ?? 1,
    storage_verified_absent_count: 0,
    storage_runner_attempt_count: 0,
    storage_runner_lease_token: null,
    storage_runner_lease_expires_at: null,
    storage_sub_finalized_at: null,
    storage_locator_scrubbed_at: null
  } as unknown as RequestRow;
  const kinds: AccountDeletionStorageTargetKind[] = ["recording", "script_audio", "voice_sample", "voice_consent_recording"];
  const buckets = { recording: "recordings", script_audio: "script-audios", voice_sample: "voice-samples", voice_consent_recording: "voice-consents" } as const;
  const targets: TargetRow[] = Array.from({ length: options.targetCount ?? 1 }, (_, index) => {
    const kind = kinds[index % kinds.length];
    return {
      id: `target-${index}`,
      deletion_request_id: REQUEST_ID,
      user_id: USER_A,
      target_kind: kind,
      storage_bucket: buckets[kind],
      storage_object_key: `${USER_A}/owned-${index}.wav`,
      target_fingerprint: `fingerprint-${index}`,
      source_kind_summary: ["write_intent"],
      source_refs: [],
      prefix_listed: true,
      status: "pending",
      delete_outcome: "not_attempted",
      verification_status: "not_applicable",
      delete_attempt_count: 0,
      verification_attempt_count: 0,
      next_retry_at: null,
      last_failure_category: null,
      last_attempted_at: null,
      delete_requested_at: null,
      delete_succeeded_at: null,
      verified_absent_at: null,
      manual_required_at: null,
      locator_scrubbed_at: null,
      created_at: NOW.toISOString(),
      updated_at: NOW.toISOString()
    };
  });

  function owns(input: { leaseToken: string; expectedRunnerAttemptCount: number }) {
    return request.storage_runner_lease_token === input.leaseToken && request.storage_runner_attempt_count === input.expectedRunnerAttemptCount;
  }
  const repository: AccountDeletionStorageDurableRepository = {
    getRequestForOwner: vi.fn(async (requestId, userId) => requestId === REQUEST_ID && userId === USER_A ? request : null),
    beginStorageSnapshot: vi.fn(), sealStorageSnapshot: vi.fn(),
    listStorageTargets: vi.fn(async (requestId, userId) => requestId === REQUEST_ID && userId === USER_A ? targets : []),
    claimStorageLease: vi.fn(async (input: AccountDeletionStorageLease) => {
      if (options.leaseBusy || request.storage_runner_lease_token) return null;
      request.storage_runner_attempt_count += 1;
      request.storage_runner_lease_token = input.leaseToken;
      request.storage_runner_lease_expires_at = "2026-09-02T00:01:00.000Z";
      return request;
    }),
    releaseStorageLease: vi.fn(async (input) => {
      if (request.storage_runner_lease_token !== input.leaseToken) return false;
      request.storage_runner_lease_token = null;
      request.storage_runner_lease_expires_at = null;
      return true;
    }),
    beginDeleteAttempt: vi.fn(async (input: AccountDeletionStorageDeleteAttempt) => {
      const target = targets.find((row) => row.id === input.targetId);
      if (!target || !owns(input) || target.status !== "pending" || target.delete_attempt_count !== 0) return null;
      events.push(`intent:${target.id}`);
      target.status = "delete_requested";
      target.verification_status = "pending";
      target.delete_attempt_count = 1;
      return target;
    }),
    recordDeleteResult: vi.fn(async (input: AccountDeletionStorageDeleteResult) => {
      const target = targets.find((row) => row.id === input.targetId);
      if (options.staleDeleteResult || !target || !owns(input) || target.delete_attempt_count !== 1) return null;
      if (input.result === "request_succeeded") {
        target.delete_outcome = "succeeded";
        target.delete_succeeded_at = NOW.toISOString();
      } else if (["invalid_target", "auth_failed", "permission_denied", "rejected"].includes(input.result)) {
        target.status = "manual_required";
        target.verification_status = "manual_required";
        target.delete_outcome = "rejected";
        request.storage_cleanup_status = "manual_required";
        request.status = "storage_cleanup_failed";
      } else {
        target.verification_status = "unavailable";
        target.next_retry_at = "2026-09-02T00:00:05.000Z";
        request.storage_cleanup_status = "failed";
        request.status = "storage_cleanup_failed";
      }
      return target;
    }),
    beginVerificationAttempt: vi.fn(async (input: AccountDeletionStorageVerificationAttempt) => {
      const target = targets.find((row) => row.id === input.targetId);
      if (!target || !owns(input) || target.delete_attempt_count !== 1 || target.status !== "delete_requested" || target.verification_attempt_count !== input.expectedVerificationAttemptCount) return null;
      if (target.verification_attempt_count >= 5) {
        target.status = "manual_required";
        target.verification_status = "manual_required";
        request.storage_cleanup_status = "manual_required";
        return target;
      }
      target.verification_attempt_count += 1;
      target.verification_status = "pending";
      target.next_retry_at = null;
      events.push(`verify-intent:${target.id}`);
      return target;
    }),
    recordVerificationResult: vi.fn(async (input: AccountDeletionStorageVerificationResult) => {
      const target = targets.find((row) => row.id === input.targetId);
      if (options.staleVerificationResult || !target || !owns(input) || target.verification_attempt_count !== input.expectedVerificationAttemptCount) return null;
      if (input.result === "absent") {
        target.status = "verified_absent";
        target.verification_status = "verified_absent";
        target.verified_absent_at = NOW.toISOString();
        request.storage_verified_absent_count = targets.filter((row) => row.status === "verified_absent").length;
      } else if (["present", "invalid_target", "auth_failed", "permission_denied", "rejected"].includes(input.result)) {
        target.status = "manual_required";
        target.verification_status = "manual_required";
        request.storage_cleanup_status = "manual_required";
        request.status = "storage_cleanup_failed";
      } else {
        target.verification_status = "unavailable";
        target.next_retry_at = "2026-09-02T00:00:05.000Z";
        request.storage_cleanup_status = "failed";
        request.status = "storage_cleanup_failed";
      }
      return target;
    }),
    finalizeStorageStage: vi.fn(async (input: AccountDeletionStorageFinalization) => {
      if (!owns(input) || targets.some((row) => row.status !== "verified_absent")) return null;
      request.storage_snapshot_target_count = targets.length;
      request.storage_verified_absent_count = targets.length;
      request.storage_cleanup_status = targets.length ? "succeeded" : "not_needed";
      request.storage_sub_finalized_at = NOW.toISOString();
      request.storage_locator_scrubbed_at = NOW.toISOString();
      request.storage_runner_lease_token = null;
      request.storage_runner_lease_expires_at = null;
      for (const target of targets) {
        target.storage_bucket = null;
        target.storage_object_key = null;
        target.target_fingerprint = null;
        target.source_refs = null;
        target.locator_scrubbed_at = NOW.toISOString();
      }
      events.push("storage-sub-finalized");
      return request;
    })
  };
  const adapter: AccountDeletionStorageAdapter = {
    listOwnedInventory: vi.fn(),
    deleteObject: vi.fn(async ({ objectKey }) => {
      events.push(`delete:${objectKey}`);
      return { kind: "request_succeeded" as const };
    }),
    verifyObjectAbsence: vi.fn(async ({ objectKey }) => {
      events.push(`verify:${objectKey}`);
      return { kind: "absent" as const };
    })
  };
  const step = () => runAccountDeletionStorageDurableStep(
    { deletionRequestId: REQUEST_ID, userId: USER_A },
    { repository, storageAdapter: adapter, createLeaseToken: () => LEASE, now: () => NOW, random: () => 0 }
  );
  return { request, targets, repository, adapter, events, step };
}

describe("G5D-2E Storage seal and writer fence", () => {
  it("collects exact owned-prefix objects from all four production bucket layouts", async () => {
    const objects = new Map<string, Array<{ name: string; id: string | null; metadata: object | null }>>([
      [`recordings:${USER_A}`, [{ name: "script", id: null, metadata: null }]],
      [`recordings:${USER_A}/script`, [{ name: "take.wav", id: "recording-id", metadata: {} }]],
      [`script-audios:${USER_A}`, [{ name: "script", id: null, metadata: null }]],
      [`script-audios:${USER_A}/script`, [{ name: "voice", id: null, metadata: null }]],
      [`script-audios:${USER_A}/script/voice`, [{ name: "model.mp3", id: "audio-id", metadata: {} }]],
      [`voice-samples:${USER_A}`, [{ name: "consent", id: null, metadata: null }]],
      [`voice-samples:${USER_A}/consent`, [{ name: "sample.wav", id: "sample-id", metadata: {} }]],
      [`voice-consents:${USER_A}`, [{ name: "consent.wav", id: "consent-id", metadata: {} }]]
    ]);
    const list = vi.fn(async (bucket: string, prefix: string) => ({
      data: objects.get(`${bucket}:${prefix}`) ?? [],
      error: null
    }));
    const adapter = createAccountDeletionStorageAdapter({
      storage: {
        from: (bucket: string) => ({
          list: (prefix: string) => list(bucket, prefix),
          remove: vi.fn(),
          info: vi.fn()
        })
      }
    } as never);

    await expect(adapter.listOwnedInventory(USER_A)).resolves.toEqual(inventory({
      recordings: [`${USER_A}/script/take.wav`],
      "script-audios": [`${USER_A}/script/voice/model.mp3`],
      "voice-samples": [`${USER_A}/consent/sample.wav`],
      "voice-consents": [`${USER_A}/consent.wav`]
    }));
    expect(new Set(list.mock.calls.map(([bucket]) => bucket))).toEqual(new Set([
      "recordings", "script-audios", "voice-samples", "voice-consents"
    ]));
  });

  it("seals all four buckets, DB-known, write-intent, orphan, and known-not-listed targets with exact dedup", async () => {
    const listed = inventory({
      recordings: [`${USER_A}/script/orphan.wav`],
      "script-audios": [`${USER_A}/script/voice/model.mp3`],
      "voice-samples": [`${USER_A}/consent/sample.wav`],
      "voice-consents": [`${USER_A}/consent.wav`]
    });
    const fixture = createSealFixture({
      listed: [listed, listed],
      sources: [
        { bucket: "recordings", key: `${USER_A}/script/known-not-listed.wav`, kind: "take_audio", rowId: "take" },
        { bucket: "recordings", key: `${USER_A}/script/orphan.wav`, kind: "write_intent", rowId: "intent" },
        { bucket: "script-audios", key: `${USER_A}/script/voice/model.mp3`, kind: "script_audio_stored_asset", rowId: "audio" },
        { bucket: "voice-samples", key: `${USER_A}/consent/sample.wav`, kind: "voice_sample_path", rowId: "voice" },
        { bucket: "voice-consents", key: `${USER_A}/consent.wav`, kind: "voice_consent_recording", rowId: "consent" }
      ]
    });
    const sealed = await sealAccountDeletionStorageSnapshot(
      { deletionRequestId: REQUEST_ID, userId: USER_A }, fixture
    );
    expect(sealed?.storage_snapshot_target_count).toBe(5);
    expect(new Set(fixture.targets.map((target) => target.target_kind))).toEqual(new Set([
      "recording", "script_audio", "voice_sample", "voice_consent_recording"
    ]));
    expect(fixture.targets.filter((target) => target.storage_object_key?.endsWith("orphan.wav"))).toHaveLength(1);
    expect(fixture.targets.some((target) => target.storage_object_key?.endsWith("known-not-listed.wav") && !target.prefix_listed)).toBe(true);
    expect(fixture.events).toEqual(["writer-fence-started", "universe-sealed"]);
  });

  it("fails closed for listing drift, active writers, reseal, malformed ownership, and cross-user keys", async () => {
    const stable = inventory({ recordings: [`${USER_A}/a.wav`] });
    const drift = createSealFixture({ listed: [stable, inventory({ recordings: [`${USER_A}/b.wav`] })] });
    await expect(sealAccountDeletionStorageSnapshot({ deletionRequestId: REQUEST_ID, userId: USER_A }, drift)).resolves.toBeNull();
    const writer = createSealFixture({ writerActive: true });
    await expect(sealAccountDeletionStorageSnapshot({ deletionRequestId: REQUEST_ID, userId: USER_A }, writer)).rejects.toThrow();
    const reseal = createSealFixture({ sealed: true });
    await expect(sealAccountDeletionStorageSnapshot({ deletionRequestId: REQUEST_ID, userId: USER_A }, reseal)).rejects.toThrow();
    for (const key of [" malformed", `${USER_B}/cross.wav`]) {
      const bad = inventory({ recordings: [key] });
      const fixture = createSealFixture({ listed: [bad, bad] });
      await expect(sealAccountDeletionStorageSnapshot({ deletionRequestId: REQUEST_ID, userId: USER_A }, fixture)).rejects.toThrow();
    }
  });

  it("encodes the account-wide writer fence and server-only recording writer in migration/source", () => {
    expect(migration).toContain("drop policy if exists \"recordings_insert_own\"");
    expect(migration).toContain("drop policy if exists \"script-audios_insert_own\"");
    expect(migration).toContain("drop policy if exists \"script-audios_update_own\"");
    expect(migration).toContain("drop policy if exists \"script-audios_delete_own\"");
    expect(migration).toContain("kind in ('voice_create', 'script_audio_create', 'voice_sample_upload', 'voice_consent_upload', 'recording_upload')");
    expect(migration).toContain("perform public.g5c_b4_lock_voice_asset_user(p_user_id)");
    expect(migration).toContain("storage_snapshot_status in ('collecting', 'sealed')");
    const writerFence = migration.slice(
      migration.indexOf("create or replace function public.account_deletion_storage_writer_fence_active"),
      migration.indexOf("create or replace function public.account_deletion_storage_source_inventory_fence_active")
    );
    expect(writerFence).not.toContain("storage_sub_finalized_at is null");
    expect(migration).toContain("account_deletion_storage_source_inventory_fence_active");
    expect(migration).toContain("before update of user_id or delete on public.scripts");
    expect(migration).toContain("before insert or update of user_id, script_id, audio_path or delete on public.takes");
    expect(migration).toContain("lock table public.takes in share row exclusive mode");
    expect(recordingService).toContain("createSupabaseAdminClient()");
    expect(recordingService).toContain("finalizeRecordingUpload");
    expect(voiceService).toContain("createVoiceAssetWriteIntentRepository(scriptAudioWriterClient)");
    expect(voiceService).toContain("storageClient: scriptAudioWriterClient");
    expect(replayService).not.toContain("input.client.storage.from(SCRIPT_AUDIO_STORAGE_BUCKET)");
    expect(replayService).toContain("input.storageClient.storage.from(SCRIPT_AUDIO_STORAGE_BUCKET)");
    expect(replayService).toContain("voice.replay.storageIdempotencyCheck");
  });
});

describe("G5D-2E one-step execution, recovery, lease/CAS, and finalizer", () => {
  it("uses one-key DELETE and treats only exact-object 404 as verified absence", async () => {
    const remove = vi.fn(async () => ({ data: [], error: null }));
    const info = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { status: 404, message: "not found" } })
      .mockResolvedValueOnce({ data: null, error: { status: 400, message: "bad request" } })
      .mockResolvedValueOnce({ data: { id: "object-id" }, error: null });
    const from = vi.fn(() => ({
      remove,
      info,
      list: vi.fn(async () => ({ data: [], error: null }))
    }));
    const adapter = createAccountDeletionStorageAdapter({ storage: { from } } as never);
    const objectKey = `${USER_A}/script/recording.wav`;

    await expect(adapter.deleteObject({ userId: USER_A, targetKind: "recording", objectKey }))
      .resolves.toEqual({ kind: "request_succeeded" });
    expect(from).toHaveBeenCalledWith("recordings");
    expect(remove).toHaveBeenCalledWith([objectKey]);
    await expect(adapter.verifyObjectAbsence({ userId: USER_A, targetKind: "recording", objectKey }))
      .resolves.toEqual({ kind: "absent" });
    await expect(adapter.verifyObjectAbsence({ userId: USER_A, targetKind: "recording", objectKey }))
      .resolves.toEqual({ kind: "rejected" });
    await expect(adapter.verifyObjectAbsence({ userId: USER_A, targetKind: "recording", objectKey }))
      .resolves.toEqual({ kind: "present" });
    await expect(adapter.verifyObjectAbsence({
      userId: USER_A,
      targetKind: "recording",
      objectKey: `${USER_B}/cross-user.wav`
    })).resolves.toEqual({ kind: "invalid_target" });
    expect(info).toHaveBeenCalledTimes(3);
  });

  it("persists generation-1 intent before exactly one DELETE and makes later progress durable", async () => {
    const fixture = createRunnerFixture({ targetCount: 2 });
    expect(await fixture.step()).toEqual({ kind: "progressed" });
    expect(fixture.events.slice(0, 2)).toEqual(["intent:target-0", `delete:${USER_A}/owned-0.wav`]);
    expect(fixture.adapter.deleteObject).toHaveBeenCalledTimes(1);
    expect(fixture.adapter.verifyObjectAbsence).not.toHaveBeenCalled();
    expect(fixture.targets[1].status).toBe("pending");
  });

  it("recovers process loss and result-write loss verification-first without a second DELETE", async () => {
    const processLoss = createRunnerFixture();
    vi.mocked(processLoss.adapter.deleteObject).mockRejectedValueOnce(new Error("process lost"));
    expect(await processLoss.step()).toEqual({ kind: "retry_later" });
    expect(await processLoss.step()).toEqual({ kind: "target_verified" });
    expect(processLoss.adapter.deleteObject).toHaveBeenCalledTimes(1);
    expect(processLoss.adapter.verifyObjectAbsence).toHaveBeenCalledTimes(1);

    const resultLoss = createRunnerFixture({ staleDeleteResult: true });
    expect(await resultLoss.step()).toEqual({ kind: "stale_result" });
    expect(await resultLoss.step()).toEqual({ kind: "target_verified" });
    expect(resultLoss.adapter.deleteObject).toHaveBeenCalledTimes(1);
    expect(resultLoss.adapter.verifyObjectAbsence).toHaveBeenCalledTimes(1);
  });

  it("accepts only exact absence; present becomes sticky manual and ambiguity is bounded", async () => {
    const present = createRunnerFixture();
    await present.step();
    vi.mocked(present.adapter.verifyObjectAbsence).mockResolvedValueOnce({ kind: "present" });
    expect(await present.step()).toEqual({ kind: "manual_required" });
    expect(await present.step()).toEqual({ kind: "manual_required" });
    expect(present.adapter.deleteObject).toHaveBeenCalledTimes(1);

    const retry = createRunnerFixture();
    await retry.step();
    retry.targets[0].verification_attempt_count = 5;
    expect(await retry.step()).toEqual({ kind: "manual_required" });
    expect(retry.request.storage_cleanup_status).toBe("manual_required");
  });

  it("allows only the lease winner; stale CAS records no terminal result and loser action count is zero", async () => {
    const busy = createRunnerFixture({ leaseBusy: true });
    expect(await busy.step()).toEqual({ kind: "busy" });
    expect(busy.adapter.deleteObject).not.toHaveBeenCalled();
    expect(busy.adapter.verifyObjectAbsence).not.toHaveBeenCalled();

    const stale = createRunnerFixture({ staleVerificationResult: true });
    await stale.step();
    expect(await stale.step()).toEqual({ kind: "stale_result" });
    expect(stale.targets[0].status).toBe("delete_requested");
  });

  it("finalizes zero as not_needed and all-absent as succeeded, repairing counts and scrubbing locators", async () => {
    const zero = createRunnerFixture({ targetCount: 0 });
    expect(await zero.step()).toEqual({ kind: "storage_stage_finalized", status: "not_needed" });
    expect(zero.request.status).toBe("confirmed");

    const complete = createRunnerFixture({ targetCount: 1 });
    await complete.step();
    await complete.step();
    complete.request.storage_verified_absent_count = 0;
    expect(await complete.step()).toEqual({ kind: "storage_stage_finalized", status: "succeeded" });
    expect(complete.request.storage_verified_absent_count).toBe(1);
    expect(complete.request.storage_runner_lease_token).toBeNull();
    expect(complete.targets[0]).toMatchObject({
      storage_bucket: null, storage_object_key: null, target_fingerprint: null, source_refs: null
    });
    expect(complete.request.status).not.toBe("completed");
  });

  it("rejects incomplete finalization and preserves User A/B plus later-stage isolation", async () => {
    const incomplete = createRunnerFixture({ targetCount: 2 });
    await incomplete.step();
    await incomplete.step();
    expect(await incomplete.step()).toEqual({ kind: "progressed" });
    expect(incomplete.repository.finalizeStorageStage).not.toHaveBeenCalled();
    expect(await incomplete.repository.getRequestForOwner(REQUEST_ID, USER_B)).toBeNull();
    expect(await incomplete.repository.listStorageTargets(REQUEST_ID, USER_B)).toEqual([]);
    expect(incomplete.events.join(" ")).not.toMatch(/provider|database|auth|completion/);
  });
});

describe("G5D-2E migration security and legacy isolation contract", () => {
  it("uses service-role-only RPC mutation, dual lifetime FKs, sticky manual, CAS, and finalizer-only terminal state", () => {
    expect(migration).toContain("alter table public.account_deletion_storage_targets enable row level security");
    expect(migration).toContain("revoke all privileges on table public.account_deletion_storage_targets from public, anon, authenticated, service_role");
    expect(migration).toContain("grant select on table public.account_deletion_storage_targets to service_role");
    expect(migration).toContain("references public.account_deletion_requests(id) on delete cascade");
    expect(migration).toContain("references public.account_deletion_requests(id, user_id) on update cascade on delete cascade");
    expect(migration).toContain("account deletion Storage target manual state is sticky");
    expect(migration).toContain("storage_runner_attempt_count <> p_expected_runner_attempt_count");
    expect(migration).toContain("v_target.delete_outcome <> 'not_attempted'");
    expect(migration).toContain("storage_cleanup_status = case when v_target_count = 0 then 'not_needed' else 'succeeded' end");
  });

  it("keeps the legacy aggregate path fail-closed before listing/delete and never enters Provider/DB/Auth/completion", () => {
    expect(storageService).toContain("LEGACY_STORAGE_CLEANUP_DURABLE_AUTHORITY_REQUIRED = true");
    expect(storageService).toContain("storage_durable_authority_required");
    expect(storageService.indexOf("storage_durable_authority_required")).toBeLessThan(storageService.indexOf("const dryRun = await planStorageCleanupDryRun", storageService.indexOf("runStorageCleanupActual")));
    expect(migration).not.toMatch(/deleteUser|delete from auth\.users|db_cleanup_status\s*=/);
    expect(migration).not.toContain("update public.account_deletion_requests\n  set status = 'completed'");
  });
});
