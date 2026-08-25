import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import {
  collectVoiceOnlyDeletionSnapshot,
  createVoiceOnlyDeletionDurableSnapshotTargets,
  createVoiceOnlyDeletionDryRun,
  verifyVoiceOnlyDeletionSnapshot,
  VOICE_ONLY_DELETION_RETAINED_CATEGORIES
} from "@/services/voice-deletion";
import { mapVoiceDeletionClientState } from "@/services/voice-deletion/voice-deletion-client-state";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-822222222222";
const VOICE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VOICE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CONSENT_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CONSENT_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SCRIPT_A = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const SCRIPT_B = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const SCRIPT_AUDIO_A = "12121212-1212-4121-8121-121212121212";
const SCRIPT_AUDIO_B = "34343434-3434-4343-8343-343434343434";

type TestRow = Record<string, unknown>;
type Fixture = {
  tables: Record<string, TestRow[]>;
  storage: Record<string, string[]>;
  storageFailures?: Partial<Record<string, true>>;
  calls: Array<{ table: string; kind: "eq" | "in"; column: string; value: unknown }>;
  storagePrefixes: Array<{ bucket: string; prefix: string }>;
};

function scriptAudioRow(input: {
  id: string;
  scriptId: string;
  voiceId: string | null;
  provider?: string;
  storedAsset?: Record<string, unknown>;
}) {
  return {
    id: input.id,
    script_id: input.scriptId,
    voice_id: input.voiceId,
    provider: input.provider ?? "elevenlabs",
    cache_key: `cache-${input.id}`,
    storage_path: `/api/script-audio/${input.id}`,
    stored_asset: input.storedAsset ?? {},
    duration_seconds: 60,
    created_at: "2026-08-22T00:00:00.000Z"
  };
}

function currentVoiceCloningConsent(input: {
  id: string;
  userId: string;
  status: "active" | "withdrawn";
  acceptedAt?: string;
  overrides?: Record<string, unknown>;
}) {
  return {
    id: input.id,
    user_id: input.userId,
    consent_type: "voice_cloning",
    consent_version: "2026-08-22.v1",
    purpose_id: "voice_cloning",
    purpose_version: "v1",
    provider_set: ["elevenlabs"],
    data_categories: ["voice_sample", "consent_recording", "cloned_voice", "reference_audio"],
    status: input.status,
    accepted_at: input.acceptedAt ?? "2026-08-22T00:00:00.000Z",
    ...input.overrides
  };
}

function emptyConsentInventoryFixture(processingConsents: TestRow[]) {
  const data = fixture();
  data.tables.voices = [];
  data.tables.scripts = [];
  data.tables.script_audios = [];
  data.tables.script_saved_model_audios = [];
  data.tables.voice_consents = [];
  data.tables.processing_consents = processingConsents;
  data.storage["voice-samples"] = [];
  data.storage["voice-consents"] = [];
  data.storage["script-audios"] = [];
  return data;
}

function fixture(): Fixture {
  return {
    calls: [],
    storagePrefixes: [],
    tables: {
      voices: [
        {
          id: VOICE_A,
          user_id: USER_A,
          provider: "elevenlabs",
          provider_voice_id: "provider-voice-a-private",
          consent_id: CONSENT_A,
          label: "A private voice",
          sample_audio_path: `storage://voice-samples/${USER_A}/${CONSENT_A}/sample-a.m4a`,
          is_default: true,
          created_at: "2026-08-22T00:00:00.000Z"
        },
        {
          id: VOICE_B,
          user_id: USER_B,
          provider: "elevenlabs",
          provider_voice_id: "provider-voice-b-private",
          consent_id: CONSENT_B,
          label: "B private voice",
          sample_audio_path: `storage://voice-samples/${USER_B}/${CONSENT_B}/sample-b.m4a`,
          is_default: true,
          created_at: "2026-08-22T00:00:00.000Z"
        }
      ],
      scripts: [
        { id: SCRIPT_A, user_id: USER_A },
        { id: SCRIPT_B, user_id: USER_B }
      ],
      script_audios: [
        scriptAudioRow({
          id: SCRIPT_AUDIO_A,
          scriptId: SCRIPT_A,
          voiceId: VOICE_A,
          storedAsset: {
            storageBucket: "script-audios",
            storageObjectKey: `${USER_A}/${SCRIPT_A}/${VOICE_A}/target-a.wav`,
            contentType: "audio/wav",
            byteLength: 32
          }
        }),
        scriptAudioRow({ id: "audio-null", scriptId: SCRIPT_A, voiceId: null }),
        scriptAudioRow({ id: "audio-unknown", scriptId: SCRIPT_A, voiceId: "no-longer-bound" }),
        scriptAudioRow({ id: "audio-provider-mismatch", scriptId: SCRIPT_A, voiceId: VOICE_A, provider: "other-provider" }),
        scriptAudioRow({
          id: SCRIPT_AUDIO_B,
          scriptId: SCRIPT_B,
          voiceId: VOICE_B,
          storedAsset: {
            storageBucket: "script-audios",
            storageObjectKey: `${USER_B}/${SCRIPT_B}/${VOICE_B}/target-b.wav`,
            contentType: "audio/wav",
            byteLength: 32
          }
        })
      ],
      script_saved_model_audios: [
        {
          id: "saved-model-a",
          user_id: USER_A,
          script_id: SCRIPT_A,
          script_audio_id: SCRIPT_AUDIO_A,
          slot: 1,
          label: "A model",
          source: "listen",
          metadata: {},
          saved_at: "2026-08-22T00:00:00.000Z",
          created_at: "2026-08-22T00:00:00.000Z",
          updated_at: "2026-08-22T00:00:00.000Z"
        },
        {
          id: "saved-model-b",
          user_id: USER_B,
          script_id: SCRIPT_B,
          script_audio_id: SCRIPT_AUDIO_B,
          slot: 1,
          label: "B model",
          source: "listen",
          metadata: {},
          saved_at: "2026-08-22T00:00:00.000Z",
          created_at: "2026-08-22T00:00:00.000Z",
          updated_at: "2026-08-22T00:00:00.000Z"
        }
      ],
      voice_consents: [
        {
          id: CONSENT_A,
          user_id: USER_A,
          provider: "elevenlabs",
          consented_at: "2026-08-22T00:00:00.000Z",
          metadata: { recording: { audioPath: `storage://voice-consents/${USER_A}/consent-a.m4a` } },
          created_at: "2026-08-22T00:00:00.000Z"
        },
        {
          id: CONSENT_B,
          user_id: USER_B,
          provider: "elevenlabs",
          consented_at: "2026-08-22T00:00:00.000Z",
          metadata: { recording: { audioPath: `storage://voice-consents/${USER_B}/consent-b.m4a` } },
          created_at: "2026-08-22T00:00:00.000Z"
        }
      ],
      processing_consents: [
        currentVoiceCloningConsent({ id: "canonical-a", userId: USER_A, status: "active" }),
        currentVoiceCloningConsent({ id: "canonical-b", userId: USER_B, status: "active" })
      ]
    },
    storage: {
      "voice-samples": [
        `${USER_A}/${CONSENT_A}/sample-a.m4a`,
        `${USER_A}/legacy-sample-orphan.m4a`,
        `${USER_B}/${CONSENT_B}/sample-b.m4a`
      ],
      "voice-consents": [
        `${USER_A}/consent-a.m4a`,
        `${USER_A}/legacy-consent-orphan.m4a`,
        `${USER_B}/consent-b.m4a`
      ],
      "script-audios": [
        `${USER_A}/${SCRIPT_A}/${VOICE_A}/target-a.wav`,
        `${USER_A}/legacy-script-orphan.wav`,
        `${USER_B}/${SCRIPT_B}/${VOICE_B}/target-b.wav`
      ]
    },
    storageFailures: {}
  };
}

function createClient(data: Fixture) {
  function createQuery(table: string) {
    const filters: Array<{ column: string; value: unknown }> = [];
    const inFilters: Array<{ column: string; values: unknown[] }> = [];
    const resolveRows = () =>
      (data.tables[table] ?? []).filter((row) =>
        filters.every((filter) => row[filter.column] === filter.value) &&
        inFilters.every((filter) => filter.values.includes(row[filter.column]))
      );
    const query = {
      eq(column: string, value: unknown) {
        data.calls.push({ table, kind: "eq", column, value });
        filters.push({ column, value });
        return query;
      },
      in(column: string, values: unknown[]) {
        data.calls.push({ table, kind: "in", column, value: values });
        inFilters.push({ column, values });
        return query;
      },
      order() {
        return query;
      },
      limit() {
        return query;
      },
      async maybeSingle() {
        return { data: resolveRows()[0] ?? null, error: null };
      },
      then(resolve: (value: unknown) => unknown) {
        return Promise.resolve(resolve({ data: resolveRows(), error: null }));
      }
    };
    return query;
  }

  return {
    from(table: string) {
      return { select: () => createQuery(table) };
    },
    storage: {
      from(bucket: string) {
        return {
          async list(prefix: string) {
            data.storagePrefixes.push({ bucket, prefix });

            if (data.storageFailures?.[bucket]) {
              return { data: null, error: { message: "storage list failed" } };
            }

            const descendants = (data.storage[bucket] ?? []).filter((key) => key.startsWith(`${prefix}/`));
            const directEntries = new Map<string, { name: string; id: string | null }>();
            for (const descendant of descendants) {
              const rest = descendant.slice(prefix.length + 1);
              const [name, ...tail] = rest.split("/");
              directEntries.set(name, { name, id: tail.length ? null : `object-${name}` });
            }
            return { data: [...directEntries.values()], error: null };
          }
        };
      }
    }
  } as never;
}

describe("G5C-A voice-only deletion foundation", () => {
  it("uses owner-scoped bindings only and snapshots User A's attributable voice assets deterministically", async () => {
    const data = fixture();
    const snapshot = await collectVoiceOnlyDeletionSnapshot(createClient(data), USER_A);

    expect(snapshot.targets.voices).toEqual([
      expect.objectContaining({ appVoiceId: VOICE_A, providerVoiceId: "provider-voice-a-private", isDefault: true })
    ]);
    expect(snapshot.targets.scriptAudios).toEqual([
      expect.objectContaining({ scriptAudioId: SCRIPT_AUDIO_A, appVoiceId: VOICE_A })
    ]);
    expect(snapshot.targets.savedModelAudios).toEqual([
      expect.objectContaining({ savedModelAudioId: "saved-model-a", scriptAudioId: SCRIPT_AUDIO_A })
    ]);
    expect(snapshot.targets.storageObjects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ bucket: "voice-samples", source: "voice_sample", sourceRowId: VOICE_A }),
        expect.objectContaining({ bucket: "voice-consents", source: "consent_recording", sourceRowId: CONSENT_A }),
        expect.objectContaining({ bucket: "script-audios", source: "script_audio", sourceRowId: SCRIPT_AUDIO_A })
      ])
    );
    expect(JSON.stringify(snapshot)).not.toContain(VOICE_B);
    expect(JSON.stringify(snapshot)).not.toContain("provider-voice-b-private");
    expect(data.calls).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: "voices", kind: "eq", column: "user_id", value: USER_A }),
      expect.objectContaining({ table: "scripts", kind: "eq", column: "user_id", value: USER_A }),
      expect.objectContaining({ table: "voice_consents", kind: "eq", column: "user_id", value: USER_A }),
      expect.objectContaining({ table: "processing_consents", kind: "eq", column: "user_id", value: USER_A }),
      expect.objectContaining({ table: "script_saved_model_audios", kind: "eq", column: "user_id", value: USER_A })
    ]));
    expect(data.storagePrefixes).toEqual(expect.arrayContaining([
      expect.objectContaining({ bucket: "voice-samples", prefix: USER_A }),
      expect.objectContaining({ bucket: "voice-consents", prefix: USER_A }),
      expect.objectContaining({ bucket: "script-audios", prefix: USER_A })
    ]));
  });

  it("keeps legacy, unknown, and storage-only objects out of targets and marks them manual-required", async () => {
    const snapshot = await collectVoiceOnlyDeletionSnapshot(createClient(fixture()), USER_A);
    const reasons = snapshot.manualCandidates.map((candidate) => candidate.reason);

    expect(reasons).toEqual(expect.arrayContaining([
      "script_audio_voice_id_missing",
      "script_audio_voice_attribution_unknown",
      "script_audio_provider_attribution_unknown",
      "storage_object_unattributed"
    ]));
    expect(snapshot.targets.scriptAudios).toHaveLength(1);
    expect(snapshot.targets.storageObjects).toHaveLength(3);
    expect(snapshot.operation.status).toBe("manual_required");
  });

  it("keeps historical unreferenced consent recordings out of automatic Storage targets", async () => {
    const data = fixture();
    const historicalConsent = "99999999-9999-4999-8999-999999999999";
    data.tables.voice_consents.push({
      id: historicalConsent,
      user_id: USER_A,
      provider: "elevenlabs",
      consented_at: "2026-08-20T00:00:00.000Z",
      metadata: { recording: { audioPath: `storage://voice-consents/${USER_A}/historical.m4a` } },
      created_at: "2026-08-20T00:00:00.000Z"
    });
    data.storage["voice-consents"].push(`${USER_A}/historical.m4a`);

    const snapshot = await collectVoiceOnlyDeletionSnapshot(createClient(data), USER_A);
    expect(snapshot.targets.storageObjects).not.toContainEqual(
      expect.objectContaining({ bucket: "voice-consents", objectKey: `${USER_A}/historical.m4a` })
    );
    expect(snapshot.manualCandidates).toContainEqual({ reason: "storage_object_unattributed", source: "storage" });
  });

  it("retains one exact Storage target for duplicate all-target locators while preserving source-row attribution", async () => {
    const data = fixture();
    const duplicateVoice = "abababab-abab-4bab-8bab-abababababab";
    data.tables.voices.push({
      id: duplicateVoice,
      user_id: USER_A,
      provider: "elevenlabs",
      provider_voice_id: "provider-voice-duplicate-private",
      consent_id: CONSENT_A,
      label: "duplicate path",
      sample_audio_path: `storage://voice-samples/${USER_A}/${CONSENT_A}/sample-a.m4a`,
      is_default: false,
      created_at: "2026-08-22T00:00:00.000Z"
    });

    const snapshot = await collectVoiceOnlyDeletionSnapshot(createClient(data), USER_A);
    const durable = createVoiceOnlyDeletionDurableSnapshotTargets(snapshot);
    const sampleTargets = durable.filter((target) => target.targetKind === "voice_sample");
    expect(sampleTargets).toHaveLength(1);
    expect(sampleTargets[0]).toMatchObject({
      storageBucket: "voice-samples",
      storageObjectKey: `${USER_A}/${CONSENT_A}/sample-a.m4a`,
      sourceRowId: expect.any(String)
    });
    expect(durable.filter((target) => target.targetKind === "provider_voice")).toHaveLength(2);
    expect(durable).not.toEqual(expect.arrayContaining([expect.objectContaining({ storageBucket: "recordings" })]));
  });

  it("keeps the bounded walker but flags a visible deeper branch for manual review", async () => {
    const data = fixture();
    const deepStorageOnlyKey = `${USER_A}/level-1/level-2/level-3/level-4/level-5/deep-orphan.m4a`;
    data.storage["voice-samples"].push(deepStorageOnlyKey);

    const snapshot = await collectVoiceOnlyDeletionSnapshot(createClient(data), USER_A);
    const dryRun = createVoiceOnlyDeletionDryRun(snapshot);

    expect(snapshot.storageListings).toContainEqual(expect.objectContaining({
      bucket: "voice-samples",
      status: "truncated"
    }));
    expect(snapshot.manualCandidates).toContainEqual({
      reason: "storage_listing_truncated",
      source: "storage"
    });
    expect(JSON.stringify(snapshot)).not.toContain(deepStorageOnlyKey);
    expect(dryRun.review).toMatchObject({
      manualRequiredCandidateCount: expect.any(Number),
      storageListingTruncatedCount: 1
    });
    expect(dryRun.review.manualRequiredCandidateCount).toBeGreaterThan(0);
    expect(JSON.stringify(dryRun)).not.toContain(USER_A);
    expect(JSON.stringify(dryRun)).not.toContain(deepStorageOnlyKey);
  });

  it("marks a failed owner-only Storage listing for manual review instead of treating it as empty", async () => {
    const data = fixture();
    data.storageFailures = { "voice-consents": true };

    const snapshot = await collectVoiceOnlyDeletionSnapshot(createClient(data), USER_A);
    const dryRun = createVoiceOnlyDeletionDryRun(snapshot);

    expect(snapshot.storageListings).toContainEqual(expect.objectContaining({
      bucket: "voice-consents",
      status: "unavailable",
      objectKeys: []
    }));
    expect(snapshot.manualCandidates).toContainEqual({
      reason: "storage_listing_unavailable",
      source: "storage"
    });
    expect(dryRun.review.storageListingUnavailableCount).toBe(1);
    expect(dryRun.review.manualRequiredCandidateCount).toBeGreaterThan(0);
  });

  it("returns a safe non-destructive response and explicitly preserves learning history", async () => {
    const snapshot = await collectVoiceOnlyDeletionSnapshot(createClient(fixture()), USER_A);
    const dryRun = createVoiceOnlyDeletionDryRun(snapshot);
    const serialized = JSON.stringify(dryRun);

    expect(dryRun.operation).toEqual({ status: "pending", mode: "dry_run", destructiveActionsCalled: false });
    expect(dryRun.targetCounts).toMatchObject({
      appVoices: 1,
      providerVoices: 1,
      defaultVoiceBindings: 1,
      voiceSamples: 1,
      consentRecordings: 1,
      scriptAudios: 1,
      savedModelAudioReferences: 1,
      storageObjects: 3
    });
    expect(dryRun.retained).toEqual(
      Object.fromEntries(VOICE_ONLY_DELETION_RETAINED_CATEGORIES.map((category) => [category, true]))
    );
    expect(Object.keys(dryRun.targetCounts)).not.toEqual(expect.arrayContaining(["recordings", "takes", "scripts", "progress"]));
    expect(serialized).not.toContain("provider-voice-a-private");
    expect(serialized).not.toContain("storage://");
    expect(serialized).not.toContain(USER_A);
    expect(serialized).not.toContain("target-a.wav");
  });

  it("provides a read-only post-delete verifier and never treats provider absence as locally verified", async () => {
    const client = createClient(fixture());
    const snapshot = await collectVoiceOnlyDeletionSnapshot(client, USER_A);
    const verification = await verifyVoiceOnlyDeletionSnapshot(client, USER_A, snapshot);

    expect(verification.providerVoiceAbsence).toBe("not_checked");
    expect(verification.applicationBindings).toMatchObject({
      currentElevenLabsVoicesRemaining: 1,
      targetVoicesRemaining: 1,
      defaultVoiceBindingsRemaining: 1,
      targetScriptAudiosRemaining: 1,
      savedModelAudioReferencesRemaining: 1
    });
    expect(verification.consent).toEqual({ currentVoiceCloningConsent: "active", expectedAfterFutureExecution: "withdrawn" });
    expect(verification.preservation).toEqual(
      Object.fromEntries(VOICE_ONLY_DELETION_RETAINED_CATEGORIES.map((category) => [category, "not_checked"]))
    );
  });

  it("does not couple the G5C-A foundation to the account-deletion engine", async () => {
    const servicePath = fileURLToPath(
      new URL("../../../services/voice-deletion/voice-deletion.service.ts", import.meta.url)
    );
    const source = await readFile(servicePath, "utf8");

    expect(source).not.toContain("services/account-deletion");
    expect(source).not.toContain("runAccountDeletion");
  });

  it("recognizes one exact active current voice-cloning consent", async () => {
    const data = emptyConsentInventoryFixture([
      currentVoiceCloningConsent({ id: "active-current", userId: USER_A, status: "active" })
    ]);

    const snapshot = await collectVoiceOnlyDeletionSnapshot(createClient(data), USER_A);

    expect(snapshot.targets.canonicalVoiceCloningConsent).toEqual({ consentId: "active-current", status: "active" });
  });

  it("keeps an older exact active consent authoritative after a newer exact withdrawal", async () => {
    const data = emptyConsentInventoryFixture([
      currentVoiceCloningConsent({
        id: "active-older",
        userId: USER_A,
        status: "active",
        acceptedAt: "2026-08-22T00:00:00.000Z"
      }),
      currentVoiceCloningConsent({
        id: "withdrawn-newer",
        userId: USER_A,
        status: "withdrawn",
        acceptedAt: "2026-08-23T00:00:00.000Z"
      })
    ]);

    const snapshot = await collectVoiceOnlyDeletionSnapshot(createClient(data), USER_A);

    expect(snapshot.targets.canonicalVoiceCloningConsent).toEqual({ consentId: "active-older", status: "active" });
    expect(mapVoiceDeletionClientState({ operation: null, inventory: snapshot })).toMatchObject({ state: "not_requested" });
  });

  it("recognizes multiple exact active current consents", async () => {
    const data = emptyConsentInventoryFixture([
      currentVoiceCloningConsent({ id: "active-older", userId: USER_A, status: "active", acceptedAt: "2026-08-22T00:00:00.000Z" }),
      currentVoiceCloningConsent({ id: "active-newer", userId: USER_A, status: "active", acceptedAt: "2026-08-23T00:00:00.000Z" })
    ]);

    const snapshot = await collectVoiceOnlyDeletionSnapshot(createClient(data), USER_A);

    expect(snapshot.targets.canonicalVoiceCloningConsent).toEqual({ consentId: "active-newer", status: "active" });
  });

  it("treats all exact current withdrawals as inactive", async () => {
    const data = emptyConsentInventoryFixture([
      currentVoiceCloningConsent({ id: "withdrawn-older", userId: USER_A, status: "withdrawn", acceptedAt: "2026-08-22T00:00:00.000Z" }),
      currentVoiceCloningConsent({ id: "withdrawn-newer", userId: USER_A, status: "withdrawn", acceptedAt: "2026-08-23T00:00:00.000Z" })
    ]);

    const snapshot = await collectVoiceOnlyDeletionSnapshot(createClient(data), USER_A);

    expect(snapshot.targets.canonicalVoiceCloningConsent).toEqual({ consentId: "withdrawn-newer", status: "withdrawn" });
    expect(mapVoiceDeletionClientState({ operation: null, inventory: snapshot })).toMatchObject({ state: "already_no_voice" });
  });

  it("does not treat an old contract's active consent as current exact consent", async () => {
    const data = emptyConsentInventoryFixture([
      currentVoiceCloningConsent({
        id: "old-contract-active",
        userId: USER_A,
        status: "active",
        overrides: { consent_version: "2026-01-01.v1" }
      })
    ]);

    const snapshot = await collectVoiceOnlyDeletionSnapshot(createClient(data), USER_A);

    expect(snapshot.targets.canonicalVoiceCloningConsent).toEqual({ consentId: null, status: "not_found" });
    expect(snapshot.manualCandidates).toContainEqual({
      reason: "mixed_or_malformed_voice_cloning_consent",
      source: "processing_consent"
    });
  });

  it("keeps malformed or mixed active consent history fail-closed with zero targets", async () => {
    const data = emptyConsentInventoryFixture([
      currentVoiceCloningConsent({ id: "exact-withdrawn", userId: USER_A, status: "withdrawn" }),
      currentVoiceCloningConsent({
        id: "malformed-active",
        userId: USER_A,
        status: "active",
        overrides: { provider_set: ["elevenlabs", "other"] }
      })
    ]);

    const snapshot = await collectVoiceOnlyDeletionSnapshot(createClient(data), USER_A);
    const state = mapVoiceDeletionClientState({ operation: null, inventory: snapshot });

    expect(snapshot.targets.canonicalVoiceCloningConsent).toEqual({ consentId: "exact-withdrawn", status: "withdrawn" });
    expect(snapshot.manualCandidates).toContainEqual({
      reason: "mixed_or_malformed_voice_cloning_consent",
      source: "processing_consent"
    });
    expect(state).toEqual({ state: "not_requested", phase: "none", canRetry: false, canAdvance: false });
    expect(state.state).not.toBe("already_no_voice");
  });
});
