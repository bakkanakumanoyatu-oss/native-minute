#!/usr/bin/env node

import { spawn } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  G5D4_A_PREP_TABLE_CONTRACT,
  G5D4_A_SEALED_TABLE_CONTRACT,
  G5D4_B_CONTROL_TABLE_CONTRACT,
  G5D4_CANONICAL_STAGING,
  G5D4_PROVENANCE,
  G5D4_REQUIRED_MIGRATIONS,
  G5D4_STORAGE_BUCKETS,
  G5D4_WRITER_INTENT_KINDS,
  buildReviewerSafeDto,
  canonicalJson,
  g5d4AFixtureContractSchema,
  g5d4AuthorizationSchema,
  g5d4BControlContractSchema,
  hmacSha256Hex,
  sha256Hex
} from "./g5d4-proof-contract.mjs";
import {
  G5D4_CONFIRMATION_PHRASE,
  assertSecureRunDirectory,
  atomicPublishPrivateFile,
  cleanupPrivateRunDirectory,
  confirmAuthorizationFromTty,
  consumeAuthorizationOnce,
  createAliasKey,
  createAliasRegistry,
  createInitialPrivateManifest,
  createPrivateRunDirectory,
  inspectPrivateStatePermissions,
  issueAuthorizationRecord,
  loadLatestPrivateManifest,
  readAliasKey,
  readAuthorizationRecord,
  readPrivateJson,
  sealPrivateManifest
} from "./g5d4-proof-private-state.mjs";
import {
  buildBStableFingerprint,
  collectG5d4SelfTestReadOnlyEvidence,
  collectSelfTestBControlFingerprint,
  compareBStableFingerprints,
  createLiveReadOnlyCollector
} from "./g5d4-read-only-evidence-collector.mjs";
import {
  runG5d4AuthorizedStep,
  runG5d4AuthorizedStepSelfTestOnly
} from "./g5d4-authorized-step-wrapper.mjs";
import {
  advanceFixturePreparation,
  assertFixturePreparationHasNoUnsafeAutomation,
  createFixturePreparationState
} from "./g5d4-fixture-prepare.mjs";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const COMMIT = "b74218ee624981f2297d483a2d485edc401c307d";
const NOW = new Date();
const INSTANT = "2026-09-04T00:00:00.000Z";

function clone(value) {
  return structuredClone(value);
}

function privateRow(id, ownerId, status = "ready", relations = []) {
  return {
    id,
    ownerId,
    createdAt: INSTANT,
    updatedAt: INSTANT,
    status,
    relations
  };
}

function makeDatabaseSnapshot(role, contract, request) {
  const userId = `private-${role}-user-authority`;
  const tables = contract.map(({ table, category, count }) => ({
    table,
    category,
    rows: Array.from({ length: count }, (_, index) =>
      privateRow(
        `private-${role}-${table}-${index + 1}`,
        userId,
        table === "processing_consents"
          ? "active"
          : table === "voice_asset_write_intents"
            ? "completed"
            : table === "account_deletion_requests"
              ? "confirmed"
              : "ready",
        [{ kind: "fixture_owner", targetId: userId }]
      )
    )
  }));
  return {
    userId,
    tables,
    processingConsents: [
      { consentType: "voice_cloning", status: "active", consentVersion: "2026-08-22.v1" },
      {
        consentType: "pronunciation_processing",
        status: "active",
        consentVersion: "2026-08-22.v1"
      }
    ],
    writerIntents: G5D4_WRITER_INTENT_KINDS.map((kind) => ({ kind, status: "completed" })),
    request
  };
}

function makeStorageTargets(role) {
  return G5D4_STORAGE_BUCKETS.map((bucket) => ({
    bucket,
    key: `private-${role}/${bucket}/fixture-audio.bin`
  }));
}

function makeProvider(resourceId, telemetrySuffix = "base") {
  return {
    resourceId,
    present: true,
    state: "ready",
    createdAt: INSTANT,
    updatedAt: INSTANT,
    deletionRelevantStatus: "eligible",
    telemetry: {
      requestId: `transport-request-${telemetrySuffix}`,
      rateLimitRemaining: 99,
      readAt: INSTANT
    }
  };
}

function makeAuth(userId, role, transportSuffix = "base") {
  return {
    present: true,
    userId,
    identityBinding: `private-${role}-identity-binding`,
    contact: `private-${role}@example.test`,
    provider: "email",
    confirmedAt: INSTANT,
    deletionStatus: "eligible",
    transport: { requestId: `auth-transport-${transportSuffix}`, readAt: INSTANT }
  };
}

function makeHarnessState() {
  const targetsA = makeStorageTargets("fixture-a");
  const targetsB = makeStorageTargets("fixture-b");
  const userA = "private-fixture_a-user-authority";
  const userB = "private-fixture_b-user-authority";
  const providerAId = "private-provider-resource-a";
  const providerBId = "private-provider-resource-b";
  const databaseA = makeDatabaseSnapshot("fixture_a", G5D4_A_SEALED_TABLE_CONTRACT, {
    count: 1,
    id: "private-deletion-request-id",
    state: "confirmed",
    conflictCount: 0,
    durableTargetState: "sealed",
    providerTargetCount: 1,
    storageTargetCount: 4
  });
  const databaseB = makeDatabaseSnapshot("fixture_b", G5D4_B_CONTROL_TABLE_CONTRACT, {
    count: 0,
    id: null,
    state: "absent",
    conflictCount: 0,
    durableTargetState: "absent",
    providerTargetCount: 0,
    storageTargetCount: 0
  });
  const providerA = makeProvider(providerAId);
  const providerB = makeProvider(providerBId);
  const authA = makeAuth(userA, "fixture-a");
  const authB = makeAuth(userB, "fixture-b");
  const storage = new Map();
  for (const target of [...targetsA, ...targetsB]) {
    const bytes = Buffer.from(`private-content:${target.bucket}:${target.key}`, "utf8");
    storage.set(`${target.bucket}\0${target.key}`, {
      info: {
        ...target,
        present: true,
        size: bytes.length,
        contentType: "audio/wav",
        version: "stable-v1",
        stableMetadata: { createdAt: INSTANT, updatedAt: INSTANT, etag: "stable-etag-v1" },
        transport: {
          signedUrl: "https://transport.invalid/signed-only",
          headers: { "x-request-id": "transport-only" },
          readAt: INSTANT
        }
      },
      bytes
    });
  }
  return {
    targetsA,
    targetsB,
    userA,
    userB,
    providerAId,
    providerBId,
    databaseA,
    databaseB,
    providerA,
    providerB,
    authA,
    authB,
    storage,
    environment: {
      environment: "canonical_staging",
      projectLabel: G5D4_CANONICAL_STAGING.projectLabel,
      projectRef: G5D4_CANONICAL_STAGING.projectRef,
      productionGuard: false,
      destructiveGuard: false
    },
    migrations: { applied: [...G5D4_REQUIRED_MIGRATIONS], pending: [] },
    git: { commit: COMMIT, branch: "codex/g3-mobile-main-loop", trackedClean: true },
    networkCalls: 0
  };
}

function makeReadOnlyAdapters(state) {
  const adapters = {
    db: {
      select: async ({ fixtureRole }) =>
        clone(fixtureRole === "fixture_a" ? state.databaseA : state.databaseB)
    },
    storage: {
      read: async ({ bucket, key }) => clone(state.storage.get(`${bucket}\0${key}`)?.info),
      list: async ({ rawUserId }) =>
        clone(rawUserId === state.userA ? state.targetsA : state.targetsB),
      info: async ({ bucket, key }) => clone(state.storage.get(`${bucket}\0${key}`)?.info),
      download: async ({ bucket, key }) => Buffer.from(state.storage.get(`${bucket}\0${key}`).bytes)
    },
    auth: {
      get: async ({ userId }) => clone(userId === state.userA ? state.authA : state.authB)
    },
    provider: {
      get: async ({ resourceId }) =>
        clone(resourceId === state.providerAId ? state.providerA : state.providerB)
    },
    environment: {
      inspectProject: async () => clone(state.environment),
      inspectMigrations: async () => clone(state.migrations)
    },
    git: { inspect: async () => clone(state.git) }
  };
  return new Proxy(adapters, {
    get(target, property, receiver) {
      if (["rpc", "insert", "update", "delete", "upsert", "upload", "remove", "post", "put", "patch"].includes(String(property))) {
        throw new Error("mutation/network poison invoked");
      }
      return Reflect.get(target, property, receiver);
    }
  });
}

function createFakeTty() {
  const input = Readable.from([`${G5D4_CONFIRMATION_PHRASE}\n`]);
  input.isTTY = true;
  const output = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  output.isTTY = true;
  return { input, output };
}

function withoutAuthorizationIntegrity(record) {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => !["recordDigest", "integrityMac"].includes(key))
  );
}

function signAuthorizationInsideSelfTestBoundary(record, key) {
  const unsigned = withoutAuthorizationIntegrity(record);
  const recordDigest = sha256Hex(canonicalJson(unsigned));
  return {
    ...unsigned,
    recordDigest,
    integrityMac: hmacSha256Hex(key, "authorization-integrity", recordDigest)
  };
}

function confirmAuthorizationForSelfTest(runDirectory, issuedPath, confirmedAt) {
  const manifest = loadLatestPrivateManifest(runDirectory, { requireSealed: true });
  if (
    manifest.runPurpose !== G5D4_PROVENANCE.selfTest.runPurpose ||
    manifest.confirmationProvenance !== G5D4_PROVENANCE.selfTest.confirmation ||
    manifest.collectorProvenance !== G5D4_PROVENANCE.selfTest.collector
  ) {
    throw new Error("self-test confirmation is restricted to self-test provenance");
  }
  const issued = readAuthorizationRecord(runDirectory, issuedPath);
  if (issued.state !== "issued") throw new Error("self-test authorization is not issued");
  if (
    issued.runId !== manifest.runId ||
    issued.runPurpose !== G5D4_PROVENANCE.selfTest.runPurpose ||
    issued.confirmationProvenance !== G5D4_PROVENANCE.selfTest.confirmation ||
    issued.collectorProvenance !== G5D4_PROVENANCE.selfTest.collector
  ) {
    throw new Error("self-test authorization provenance mismatch");
  }
  const consumedPath = join(runDirectory, `${issued.authorizationId}-consumed.json`);
  if (existsSync(consumedPath)) throw new Error("consumed self-test authorization cannot be confirmed");
  const record = signAuthorizationInsideSelfTestBoundary(
    {
      ...withoutAuthorizationIntegrity(issued),
      state: "confirmed",
      runPurpose: G5D4_PROVENANCE.selfTest.runPurpose,
      confirmationProvenance: G5D4_PROVENANCE.selfTest.confirmation,
      collectorProvenance: G5D4_PROVENANCE.selfTest.collector,
      confirmedAt,
      previousRecordDigest: issued.recordDigest
    },
    readAliasKey(runDirectory)
  );
  g5d4AuthorizationSchema.parse(record);
  const path = atomicPublishPrivateFile(
    runDirectory,
    `${issued.authorizationId}-confirmed.json`,
    `${canonicalJson(record)}\n`
  );
  return { path, record };
}

function privateManifestInput(state, runPurpose) {
  return {
    runPurpose,
    createdAt: INSTANT,
    authority: {
      environment: "canonical_staging",
      projectLabel: G5D4_CANONICAL_STAGING.projectLabel,
      projectRef: G5D4_CANONICAL_STAGING.projectRef,
      commit: COMMIT
    },
    rawAuthorities: {
      fixtureAUserId: state.userA,
      fixtureBUserId: state.userB,
      fixtureAProviderResourceId: state.providerAId,
      fixtureBProviderResourceId: state.providerBId,
      fixtureAStorageTargets: state.targetsA,
      fixtureBStorageTargets: state.targetsB,
      deletionRequestId: "private-deletion-request-id",
      deletionRequestRef: "private-deletion-request-ref"
    }
  };
}

function createSyntheticPrivateRun(state, runPurpose, options = {}) {
  const runDirectory = createPrivateRunDirectory({ runPurpose });
  createAliasKey(runDirectory);
  const initial = createInitialPrivateManifest(
    runDirectory,
    privateManifestInput(state, runPurpose)
  );
  const sealed = options.sealed === false ? null : sealPrivateManifest(runDirectory, { createdAt: INSTANT });
  return { runDirectory, initial, sealed };
}

function copyPrivateRunToLiveLookingDirectory(sourceDirectory, mutateFile) {
  const destination = createPrivateRunDirectory({ runPurpose: G5D4_PROVENANCE.live.runPurpose });
  for (const name of readdirSync(sourceDirectory)) {
    let bytes = readFileSync(join(sourceDirectory, name));
    if (mutateFile) bytes = mutateFile(name, bytes);
    atomicPublishPrivateFile(destination, name, bytes);
  }
  return destination;
}

function issueProviderAuthorization(runDirectory, collectorDigest = "a".repeat(64)) {
  const manifest = loadLatestPrivateManifest(runDirectory, { requireSealed: true });
  const target = manifest.stageTargets.provider_cleanup;
  return issueAuthorizationRecord(
    runDirectory,
    {
      runId: manifest.runId,
      microStep: "provider_cleanup",
      fixtureAlias: manifest.aliases.fixtureA,
      targetAlias: target.alias,
      targetDigest: target.digest,
      targetCount: target.count,
      commit: manifest.authority.commit,
      projectRef: manifest.authority.projectRef,
      collectorDigest
    },
    { issuedAt: INSTANT }
  );
}

function publishAdversarialConfirmedRecord(runDirectory, issuedPath, suffix, overrides) {
  const issued = readAuthorizationRecord(runDirectory, issuedPath);
  const record = signAuthorizationInsideSelfTestBoundary(
    {
      ...withoutAuthorizationIntegrity(issued),
      state: "confirmed",
      confirmedAt: "2026-09-04T00:01:00.000Z",
      previousRecordDigest: issued.recordDigest,
      ...overrides
    },
    readAliasKey(runDirectory)
  );
  const path = atomicPublishPrivateFile(
    runDirectory,
    `${issued.authorizationId}-${suffix}.json`,
    `${canonicalJson(record)}\n`
  );
  return { path, record };
}

async function expectReject(operation) {
  try {
    await operation();
  } catch {
    return true;
  }
  return false;
}

let passed = 0;
async function check(number, label, operation) {
  const ok = await operation();
  if (!ok) throw new Error(`case ${number} failed`);
  passed += 1;
  process.stdout.write(`- ${String(number).padStart(2, "0")} ${label}: PASS\n`);
}

async function spawnConsumeWorkers(runDirectory, confirmedPath, expectedPath, count) {
  const children = Array.from({ length: count }, () =>
    new Promise((resolvePromise) => {
      const child = spawn(
        process.execPath,
        [fileURLToPath(import.meta.url), "--consume-worker", runDirectory, confirmedPath, expectedPath],
        { shell: false, stdio: ["ignore", "pipe", "pipe"] }
      );
      child.once("close", (code) => resolvePromise(code));
      child.once("error", () => resolvePromise(99));
    })
  );
  return Promise.all(children);
}

async function consumeWorker() {
  const [, , , runDirectory, confirmedPath, expectedPath] = process.argv;
  try {
    consumeAuthorizationOnce(runDirectory, confirmedPath, readPrivateJson(runDirectory, expectedPath));
    process.exitCode = 0;
  } catch (error) {
    process.exitCode = error?.code === "EEXIST" ? 3 : 4;
  }
}

async function main() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("unexpected real network access");
  };
  const runDirectory = createPrivateRunDirectory({
    runPurpose: G5D4_PROVENANCE.selfTest.runPurpose
  });
  const isolationRunDirectories = new Set();
  const trackIsolationRun = (value) => {
    isolationRunDirectories.add(value.runDirectory ?? value);
    return value;
  };
  let cleanupPassed = false;
  try {
    const state = makeHarnessState();
    const adapters = makeReadOnlyAdapters(state);
    createAliasKey(runDirectory);
    const initial = createInitialPrivateManifest(runDirectory, {
      runId: "g5d4_run_11111111111111111111111111111111",
      ...privateManifestInput(state, G5D4_PROVENANCE.selfTest.runPurpose)
    });
    const sealed = sealPrivateManifest(runDirectory, { createdAt: INSTANT });
    const manifest = loadLatestPrivateManifest(runDirectory, { requireSealed: true });
    const key = readAliasKey(runDirectory);
    const collectorEvidence = await collectG5d4SelfTestReadOnlyEvidence({
      runDirectory,
      adapters,
      phase: "sealed",
      collectedAt: NOW.toISOString()
    });
    const wrapperCollector = {
      collectBControl: ({ collectedAt }) =>
        collectSelfTestBControlFingerprint({ runDirectory, adapters, collectedAt })
    };

    async function makeConfirmedAuthorization(evidence = collectorEvidence) {
      const target = manifest.stageTargets.provider_cleanup;
      const issued = issueAuthorizationRecord(
        runDirectory,
        {
          runId: manifest.runId,
          microStep: "provider_cleanup",
          fixtureAlias: manifest.aliases.fixtureA,
          targetAlias: target.alias,
          targetDigest: target.digest,
          targetCount: target.count,
          commit: manifest.authority.commit,
          projectRef: manifest.authority.projectRef,
          collectorDigest: evidence.safe.collectorDigest
        },
        { issuedAt: INSTANT }
      );
      return confirmAuthorizationForSelfTest(
        runDirectory,
        issued.path,
        "2026-09-04T00:01:00.000Z"
      );
    }

    process.stdout.write("G5D-4 proof-only tooling fake self-test\n");
    process.stdout.write("- real network/provider/storage/auth access: 0\n");
    process.stdout.write("- real fixture/Human authorization/destructive execution: 0\n");

    await check(1, "0700 directory and 0600 files", async () => {
      const modes = inspectPrivateStatePermissions(runDirectory);
      return modes.directoryMode === 0o700 && modes.fileModes.every((mode) => mode === 0o600);
    });

    await check(2, "symlink and repo path escape refusal", async () => {
      const linkParent = mkdtempSync(join(tmpdir(), "native-minute-g5d4-link-test-"));
      const linkPath = join(linkParent, "native-minute-g5d4-self-test-link");
      try {
        symlinkSync(ROOT, linkPath, "dir");
        return (
          (await expectReject(() => Promise.resolve(assertSecureRunDirectory(linkPath)))) &&
          (await expectReject(() => Promise.resolve(assertSecureRunDirectory(ROOT))))
        );
      } finally {
        rmSync(linkParent, { recursive: true, force: false });
      }
    });

    await check(3, "exclusive no-overwrite publication", async () => {
      atomicPublishPrivateFile(runDirectory, "no-overwrite.probe", "first");
      return expectReject(() =>
        Promise.resolve(atomicPublishPrivateFile(runDirectory, "no-overwrite.probe", "second"))
      );
    });

    await check(4, "alias determinism", async () => {
      const registry = createAliasRegistry(key);
      return registry.alias("fixture_a", state.userA) === registry.alias("fixture_a", state.userA);
    });

    await check(5, "alias role domain separation", async () => {
      const registry = createAliasRegistry(key);
      return registry.alias("fixture_a", "same-private-value") !== registry.alias("fixture_b", "same-private-value");
    });

    await check(6, "alias collision registry", async () => {
      const registry = createAliasRegistry(key, { digestFn: () => "0".repeat(64) });
      registry.alias("fixture_a", "first-private-value");
      return expectReject(() => Promise.resolve(registry.alias("fixture_b", "second-private-value")));
    });

    await check(7, "reviewer DTO contains no private raw authority", async () => {
      const serialized = canonicalJson(collectorEvidence.safe);
      return [
        state.userA,
        state.userB,
        state.providerAId,
        state.providerBId,
        "private-deletion-request-ref",
        ...state.targetsA.map((item) => item.key),
        ...state.targetsB.map((item) => item.key),
        state.authA.contact,
        state.authB.contact
      ].every((value) => !serialized.includes(value));
    });

    await check(8, "wrong micro-step rejected before spawn", async () => {
      const confirmed = await makeConfirmedAuthorization();
      const result = await runG5d4AuthorizedStepSelfTestOnly({
        runDirectory,
        microStep: "storage_cleanup",
        collectorEvidence,
        confirmedAuthorizationPath: confirmed.path,
        collector: wrapperCollector,
        scenario: "success",
        now: NOW
      });
      return result.childSpawnCount === 0;
    });

    await check(9, "fixture alias substitution rejected", async () => {
      const changed = clone(collectorEvidence);
      changed.safe.fixtureA.fixtureAlias = manifest.aliases.fixtureB;
      const confirmed = await makeConfirmedAuthorization();
      const result = await runG5d4AuthorizedStepSelfTestOnly({
        runDirectory,
        microStep: "provider_cleanup",
        collectorEvidence: changed,
        confirmedAuthorizationPath: confirmed.path,
        collector: wrapperCollector,
        scenario: "success",
        now: NOW
      });
      return result.childSpawnCount === 0;
    });

    await check(10, "wrong target alias/count rejected", async () => {
      const changed = clone(collectorEvidence);
      changed.safe.target.alias = manifest.aliases.request;
      changed.safe.target.count = 2;
      const confirmed = await makeConfirmedAuthorization();
      const result = await runG5d4AuthorizedStepSelfTestOnly({
        runDirectory,
        microStep: "provider_cleanup",
        collectorEvidence: changed,
        confirmedAuthorizationPath: confirmed.path,
        collector: wrapperCollector,
        scenario: "success",
        now: NOW
      });
      return result.childSpawnCount === 0;
    });

    await check(11, "wrong project ref or commit rejected", async () => {
      const changed = clone(collectorEvidence);
      changed.private.git.commit = "a".repeat(40);
      const confirmed = await makeConfirmedAuthorization();
      const result = await runG5d4AuthorizedStepSelfTestOnly({
        runDirectory,
        microStep: "provider_cleanup",
        collectorEvidence: changed,
        confirmedAuthorizationPath: confirmed.path,
        collector: wrapperCollector,
        scenario: "success",
        now: NOW
      });
      return result.childSpawnCount === 0;
    });

    await check(12, "stale collector rejected", async () => {
      const changed = clone(collectorEvidence);
      changed.safe.collectedAt = new Date(NOW.getTime() - 600_000).toISOString();
      const confirmed = await makeConfirmedAuthorization();
      const result = await runG5d4AuthorizedStepSelfTestOnly({
        runDirectory,
        microStep: "provider_cleanup",
        collectorEvidence: changed,
        confirmedAuthorizationPath: confirmed.path,
        collector: wrapperCollector,
        scenario: "success",
        now: NOW
      });
      return result.childSpawnCount === 0;
    });

    await check(13, "unconfirmed authorization rejected", async () => {
      const target = manifest.stageTargets.provider_cleanup;
      const issued = issueAuthorizationRecord(runDirectory, {
        runId: manifest.runId,
        microStep: "provider_cleanup",
        fixtureAlias: manifest.aliases.fixtureA,
        targetAlias: target.alias,
        targetDigest: target.digest,
        targetCount: target.count,
        commit: manifest.authority.commit,
        projectRef: manifest.authority.projectRef,
        collectorDigest: collectorEvidence.safe.collectorDigest
      });
      const result = await runG5d4AuthorizedStepSelfTestOnly({
        runDirectory,
        microStep: "provider_cleanup",
        collectorEvidence,
        confirmedAuthorizationPath: issued.path,
        collector: wrapperCollector,
        scenario: "success",
        now: NOW
      });
      return result.childSpawnCount === 0;
    });

    await check(14, "consumed authorization rejected", async () => {
      const confirmed = await makeConfirmedAuthorization();
      const record = readAuthorizationRecord(runDirectory, confirmed.path);
      consumeAuthorizationOnce(runDirectory, confirmed.path, {
        runId: record.runId,
        runPurpose: record.runPurpose,
        confirmationProvenance: record.confirmationProvenance,
        collectorProvenance: record.collectorProvenance,
        microStep: record.microStep,
        fixtureAlias: record.fixtureAlias,
        targetAlias: record.targetAlias,
        targetDigest: record.targetDigest,
        targetCount: record.targetCount,
        commit: record.commit,
        projectRef: record.projectRef,
        collectorDigest: record.collectorDigest
      });
      const result = await runG5d4AuthorizedStepSelfTestOnly({
        runDirectory,
        microStep: "provider_cleanup",
        collectorEvidence,
        confirmedAuthorizationPath: confirmed.path,
        collector: wrapperCollector,
        scenario: "success",
        now: NOW
      });
      return result.childSpawnCount === 0;
    });

    let concurrentIssued;
    let concurrentConfirmed;
    let concurrentExpected;
    await check(15, "concurrent consume has exactly one winner", async () => {
      concurrentConfirmed = await makeConfirmedAuthorization();
      concurrentIssued = readAuthorizationRecord(runDirectory, concurrentConfirmed.path);
      concurrentExpected = {
        runId: concurrentIssued.runId,
        runPurpose: concurrentIssued.runPurpose,
        confirmationProvenance: concurrentIssued.confirmationProvenance,
        collectorProvenance: concurrentIssued.collectorProvenance,
        microStep: concurrentIssued.microStep,
        fixtureAlias: concurrentIssued.fixtureAlias,
        targetAlias: concurrentIssued.targetAlias,
        targetDigest: concurrentIssued.targetDigest,
        targetCount: concurrentIssued.targetCount,
        commit: concurrentIssued.commit,
        projectRef: concurrentIssued.projectRef,
        collectorDigest: concurrentIssued.collectorDigest
      };
      const expectedPath = atomicPublishPrivateFile(
        runDirectory,
        `${concurrentIssued.authorizationId}-consume-expected.json`,
        `${canonicalJson(concurrentExpected)}\n`
      );
      const codes = await spawnConsumeWorkers(runDirectory, concurrentConfirmed.path, expectedPath, 8);
      return codes.filter((code) => code === 0).length === 1 && codes.filter((code) => code === 3).length === 7;
    });

    await check(16, "spawn failure remains consumed", async () => {
      const confirmed = await makeConfirmedAuthorization();
      const authorization = readAuthorizationRecord(runDirectory, confirmed.path);
      const result = await runG5d4AuthorizedStepSelfTestOnly({
        runDirectory,
        microStep: "provider_cleanup",
        collectorEvidence,
        confirmedAuthorizationPath: confirmed.path,
        collector: wrapperCollector,
        scenario: "spawn_failure",
        now: NOW
      });
      const consumedPath = join(runDirectory, `${authorization.authorizationId}-consumed.json`);
      return result.childSpawnCount === 1 && result.childExitSemantic === "spawn_failed" && existsSync(consumedPath);
    });

    let launchObservations = [];
    let successfulWrapperResult;
    await check(17, "automatic retry count is zero", async () => {
      const confirmed = await makeConfirmedAuthorization();
      successfulWrapperResult = await runG5d4AuthorizedStepSelfTestOnly({
        runDirectory,
        microStep: "provider_cleanup",
        collectorEvidence,
        confirmedAuthorizationPath: confirmed.path,
        collector: wrapperCollector,
        scenario: "success",
        observer: (value) => launchObservations.push(value),
        now: NOW
      });
      return successfulWrapperResult.retryCount === 0 && launchObservations[0]?.retryCount === 0;
    });

    await check(18, "canonical stub child launched exactly once", async () =>
      successfulWrapperResult.childSpawnCount === 1 && launchObservations.length === 1
    );

    await check(19, "child launch uses shell=false", async () => launchObservations[0]?.shell === false);

    await check(20, "corrected A 17 to 22 and D/A/R 15/1/6 accepted", async () => {
      const prepTables = clone(G5D4_A_PREP_TABLE_CONTRACT);
      const parsed = g5d4AFixtureContractSchema.safeParse({
        phase: "prep_stop",
        observedRows: 17,
        prospectiveObservedRows: 22,
        dar: { deleted: 15, anonymized: 1, retained: 6 },
        tables: prepTables,
        processingConsents: [
          { consentType: "voice_cloning", status: "active" },
          { consentType: "pronunciation_processing", status: "active" }
        ],
        writerIntentKinds: [...G5D4_WRITER_INTENT_KINDS],
        provider: { present: true, count: 1 },
        storage: { required: 4, present: 4 },
        auth: { present: true },
        request: { count: 1, state: "confirmed", conflictCount: 0 },
        durableTargets: { provider: 0, storage: 0, total: 0, state: "absent" },
        nextMicroStep: "seal_targets"
      });
      return parsed.success && collectorEvidence.safe.fixtureA.observedRows === 22;
    });

    await check(21, "obsolete A 16/21/14/1/6 rejected", async () => {
      const obsolete = {
        phase: "prep_stop",
        observedRows: 16,
        prospectiveObservedRows: 21,
        dar: { deleted: 14, anonymized: 1, retained: 6 },
        tables: clone(G5D4_A_PREP_TABLE_CONTRACT),
        processingConsents: [{ consentType: "voice_cloning", status: "active" }],
        writerIntentKinds: [...G5D4_WRITER_INTENT_KINDS],
        provider: { present: true, count: 1 },
        storage: { required: 4, present: 4 },
        auth: { present: true },
        request: { count: 1, state: "confirmed", conflictCount: 0 },
        durableTargets: { provider: 0, storage: 0, total: 0, state: "absent" },
        nextMicroStep: "seal_targets"
      };
      const observed21 = { ...obsolete, phase: "sealed", observedRows: 21 };
      return (
        !g5d4AFixtureContractSchema.safeParse(obsolete).success &&
        !g5d4AFixtureContractSchema.safeParse(observed21).success
      );
    });

    await check(22, "missing pronunciation_processing rejected", async () => {
      const candidate = {
        observedRows: 16,
        tables: clone(G5D4_B_CONTROL_TABLE_CONTRACT),
        processingConsents: [
          { consentType: "voice_cloning", status: "active" },
          { consentType: "voice_cloning", status: "active" }
        ],
        writerIntentKinds: [...G5D4_WRITER_INTENT_KINDS],
        provider: { present: true, count: 1 },
        storage: { required: 4, present: 4 },
        auth: { present: true },
        deletionRequestCount: 0
      };
      return !g5d4BControlContractSchema.safeParse(candidate).success;
    });

    await check(23, "unknown table/category rejected", async () => {
      const candidate = clone(G5D4_B_CONTROL_TABLE_CONTRACT);
      candidate[0].table = "unknown_table";
      const base = {
        observedRows: 16,
        processingConsents: [
          { consentType: "voice_cloning", status: "active" },
          { consentType: "pronunciation_processing", status: "active" }
        ],
        writerIntentKinds: [...G5D4_WRITER_INTENT_KINDS],
        provider: { present: true, count: 1 },
        storage: { required: 4, present: 4 },
        auth: { present: true },
        deletionRequestCount: 0
      };
      const missingCategory = clone(G5D4_B_CONTROL_TABLE_CONTRACT);
      delete missingCategory[0].category;
      return (
        !g5d4BControlContractSchema.safeParse({ ...base, tables: candidate }).success &&
        !g5d4BControlContractSchema.safeParse({ ...base, tables: missingCategory }).success
      );
    });

    await check(24, "writer-intent mismatch rejected", async () => {
      const changed = clone(state.databaseB);
      changed.writerIntents[4].kind = "voice_create";
      const changedAdapters = makeReadOnlyAdapters({ ...state, databaseB: changed });
      return expectReject(() =>
        collectG5d4SelfTestReadOnlyEvidence({
          runDirectory,
          adapters: changedAdapters,
          phase: "sealed",
          collectedAt: NOW.toISOString()
        })
      );
    });

    await check(25, "corrected B consent/control contract accepted", async () =>
      collectorEvidence.safe.fixtureB.observedRows === 16 &&
      collectorEvidence.safe.fixtureB.processingConsentCount === 2 &&
      collectorEvidence.safe.fixtureB.deletionRequestCount === 0
    );

    const bBaseline = await collectSelfTestBControlFingerprint({
      runDirectory,
      adapters,
      collectedAt: NOW.toISOString()
    });
    await check(26, "unchanged B fingerprint accepted", async () => {
      const again = await collectSelfTestBControlFingerprint({
        runDirectory,
        adapters,
        collectedAt: new Date(NOW.getTime() + 1000).toISOString()
      });
      return compareBStableFingerprints(bBaseline.fingerprint, again.fingerprint);
    });

    await check(27, "protected B field mutation rejected", async () => {
      const changed = clone(state.databaseB);
      changed.tables[0].rows[0].updatedAt = "2026-09-04T00:00:01.000Z";
      const changedFingerprint = buildBStableFingerprint(
        {
          database: changed,
          provider: state.providerB,
          storage: state.targetsB.map((target) => state.storage.get(`${target.bucket}\0${target.key}`)),
          auth: state.authB
        },
        key
      );
      return expectReject(() =>
        Promise.resolve(compareBStableFingerprints(bBaseline.fingerprint, changedFingerprint.root))
      );
    });

    await check(28, "excluded transport telemetry variation accepted", async () => {
      const provider = clone(state.providerB);
      provider.telemetry = {
        requestId: "different-transport-request",
        rateLimitRemaining: 1,
        readAt: "2026-09-04T00:00:02.000Z"
      };
      const auth = clone(state.authB);
      auth.transport = { requestId: "different-auth-transport", readAt: "2026-09-04T00:00:02.000Z" };
      const storage = state.targetsB.map((target) => {
        const item = clone(state.storage.get(`${target.bucket}\0${target.key}`));
        item.bytes = Buffer.from(item.bytes);
        item.info.transport = {
          signedUrl: "https://different.invalid/transport-only",
          headers: { "x-request-id": "different" },
          readAt: "2026-09-04T00:00:02.000Z"
        };
        return item;
      });
      const changed = buildBStableFingerprint(
        { database: state.databaseB, provider, storage, auth },
        key
      );
      return changed.root === bBaseline.fingerprint;
    });

    await check(29, "true destructive guard rejected", async () => {
      const changed = clone(collectorEvidence);
      changed.private.environment.destructiveGuard = true;
      const confirmed = await makeConfirmedAuthorization();
      const result = await runG5d4AuthorizedStepSelfTestOnly({
        runDirectory,
        microStep: "provider_cleanup",
        collectorEvidence: changed,
        confirmedAuthorizationPath: confirmed.path,
        collector: wrapperCollector,
        scenario: "success",
        now: NOW
      });
      return result.childSpawnCount === 0;
    });

    await check(30, "Production project/ref rejected", async () => {
      const changed = clone(collectorEvidence);
      changed.private.environment.environment = "production";
      changed.private.environment.projectLabel = "native-minute-production";
      changed.private.environment.projectRef = "abcdefghijklmnopqrst";
      const confirmed = await makeConfirmedAuthorization();
      const result = await runG5d4AuthorizedStepSelfTestOnly({
        runDirectory,
        microStep: "provider_cleanup",
        collectorEvidence: changed,
        confirmedAuthorizationPath: confirmed.path,
        collector: wrapperCollector,
        scenario: "success",
        now: NOW
      });
      return result.childSpawnCount === 0;
    });

    await check(31, "migration/pending mismatch rejected", async () => {
      const changed = clone(collectorEvidence);
      changed.private.migrations.pending = ["0027"];
      const confirmed = await makeConfirmedAuthorization();
      const result = await runG5d4AuthorizedStepSelfTestOnly({
        runDirectory,
        microStep: "provider_cleanup",
        collectorEvidence: changed,
        confirmedAuthorizationPath: confirmed.path,
        collector: wrapperCollector,
        scenario: "success",
        now: NOW
      });
      return result.childSpawnCount === 0;
    });

    await check(32, "layered redaction raw/key/shape scanners", async () => {
      const rawSentinelRejected = await expectReject(() =>
        Promise.resolve(
          buildReviewerSafeDto(
            z.object({ projectRef: z.string() }).strict(),
            { projectRef: "private-deletion-request-ref" },
            ["private-deletion-request-ref"]
          )
        )
      );
      const keyRejected = await expectReject(() =>
        Promise.resolve(
          buildReviewerSafeDto(
            z.object({ payload: z.string() }).strict(),
            { payload: "not-sensitive" },
            []
          )
        )
      );
      const shapeRejected = await expectReject(() =>
        Promise.resolve(
          buildReviewerSafeDto(
            z.object({ value: z.string() }).strict(),
            { value: "hidden@example.test" },
            []
          )
        )
      );
      return rawSentinelRejected && keyRejected && shapeRejected;
    });

    await check(33, "exit code 2 with valid progress is handled semantically", async () => {
      const confirmed = await makeConfirmedAuthorization();
      const result = await runG5d4AuthorizedStepSelfTestOnly({
        runDirectory,
        microStep: "provider_cleanup",
        collectorEvidence,
        confirmedAuthorizationPath: confirmed.path,
        collector: wrapperCollector,
        scenario: "exit2_progress",
        now: NOW
      });
      return result.childExitSemantic === "exit_2_valid_progress" && result.operatorStatus === "manual_required";
    });

    await check(34, "private OS-temp cleanup and absence verification", async () => {
      const cleanupProbe = createPrivateRunDirectory({
        runPurpose: G5D4_PROVENANCE.selfTest.runPurpose
      });
      createAliasKey(cleanupProbe);
      cleanupPrivateRunDirectory(cleanupProbe);
      return !existsSync(cleanupProbe);
    });

    await check(35, "tampered authorization MAC rejected", async () => {
      const confirmed = await makeConfirmedAuthorization();
      const tampered = readPrivateJson(runDirectory, confirmed.path);
      tampered.integrityMac = "0".repeat(64);
      const tamperedPath = atomicPublishPrivateFile(
        runDirectory,
        `${tampered.authorizationId}-tampered.json`,
        `${canonicalJson(tampered)}\n`
      );
      return expectReject(() => Promise.resolve(readAuthorizationRecord(runDirectory, tamperedPath)));
    });

    await check(36, "authorization alias substitution rejected", async () => {
      const confirmed = await makeConfirmedAuthorization();
      const tampered = readPrivateJson(runDirectory, confirmed.path);
      tampered.fixtureAlias = manifest.aliases.fixtureB;
      const tamperedPath = atomicPublishPrivateFile(
        runDirectory,
        `${tampered.authorizationId}-alias-substitution.json`,
        `${canonicalJson(tampered)}\n`
      );
      const result = await runG5d4AuthorizedStepSelfTestOnly({
        runDirectory,
        microStep: "provider_cleanup",
        collectorEvidence,
        confirmedAuthorizationPath: tamperedPath,
        collector: wrapperCollector,
        scenario: "success",
        now: NOW
      });
      return result.childSpawnCount === 0;
    });

    await check(37, "B fingerprint substitution rejected", async () => {
      const changed = clone(collectorEvidence);
      changed.safe.fixtureB.fingerprint = "0".repeat(64);
      const confirmed = await makeConfirmedAuthorization();
      const result = await runG5d4AuthorizedStepSelfTestOnly({
        runDirectory,
        microStep: "provider_cleanup",
        collectorEvidence: changed,
        confirmedAuthorizationPath: confirmed.path,
        collector: wrapperCollector,
        scenario: "success",
        now: NOW
      });
      return result.childSpawnCount === 0;
    });

    await check(38, "consumed state rollback to confirmed rejected", async () => {
      return expectReject(() =>
        Promise.resolve(
          confirmAuthorizationForSelfTest(
            runDirectory,
            concurrentConfirmed.path,
            "2026-09-04T00:02:00.000Z"
          )
        )
      );
    });

    await check(39, "target digest substitution rejected", async () => {
      const changed = clone(collectorEvidence);
      changed.safe.target.digest = "0".repeat(64);
      const confirmed = await makeConfirmedAuthorization();
      const result = await runG5d4AuthorizedStepSelfTestOnly({
        runDirectory,
        microStep: "provider_cleanup",
        collectorEvidence: changed,
        confirmedAuthorizationPath: confirmed.path,
        collector: wrapperCollector,
        scenario: "success",
        now: NOW
      });
      return result.childSpawnCount === 0;
    });

    await check(40, "child stdout/stderr raw secret is captured but not emitted", async () => {
      const confirmed = await makeConfirmedAuthorization();
      const sentinel = "private-deletion-request-ref";
      const result = await runG5d4AuthorizedStepSelfTestOnly({
        runDirectory,
        microStep: "provider_cleanup",
        collectorEvidence,
        confirmedAuthorizationPath: confirmed.path,
        collector: wrapperCollector,
        scenario: "raw_output",
        rawOutputSentinel: sentinel,
        now: NOW
      });
      return result.childExitSemantic === "output_rejected" && !canonicalJson(result).includes(sentinel);
    });

    await check(41, "excluded telemetry cannot hide identity/presence/content mutation", async () => {
      const providerIdentity = clone(state.providerB);
      providerIdentity.resourceId = "private-provider-resource-b-substituted";
      const providerPresence = clone(state.providerB);
      providerPresence.present = false;
      providerPresence.state = "deleted";
      providerPresence.deletionRelevantStatus = "absent";
      const storageContent = state.targetsB.map((target) => {
        const item = clone(state.storage.get(`${target.bucket}\0${target.key}`));
        item.bytes = Buffer.from(item.bytes);
        return item;
      });
      storageContent[0].bytes = Buffer.from("protected-content-mutation", "utf8");
      storageContent[0].info.size = storageContent[0].bytes.length;
      const fingerprints = [
        buildBStableFingerprint(
          { database: state.databaseB, provider: providerIdentity, storage: state.targetsB.map((target) => state.storage.get(`${target.bucket}\0${target.key}`)), auth: state.authB },
          key
        ).root,
        buildBStableFingerprint(
          { database: state.databaseB, provider: providerPresence, storage: state.targetsB.map((target) => state.storage.get(`${target.bucket}\0${target.key}`)), auth: state.authB },
          key
        ).root,
        buildBStableFingerprint(
          { database: state.databaseB, provider: state.providerB, storage: storageContent, auth: state.authB },
          key
        ).root
      ];
      return fingerprints.every((fingerprint) => fingerprint !== bBaseline.fingerprint);
    });

    await check(42, "unexpected saved-model/best rows rejected", async () => {
      const changed = clone(state.databaseB);
      const savedModel = changed.tables.find((item) => item.table === "script_saved_model_audios");
      savedModel.rows.push(privateRow("private-unexpected-saved-model", state.userB));
      const changedAdapters = makeReadOnlyAdapters({ ...state, databaseB: changed });
      return expectReject(() =>
        collectG5d4SelfTestReadOnlyEvidence({
          runDirectory,
          adapters: changedAdapters,
          phase: "sealed",
          collectedAt: NOW.toISOString()
        })
      );
    });

    await check(43, "normal consent-gated recording checkpoint only", async () => {
      let preparation = createFixturePreparationState();
      preparation = advanceFixturePreparation(preparation, "fixture_a_login_verified", {
        fixtureRole: "fixture_a",
        magicLinkLoginObserved: true
      });
      preparation = advanceFixturePreparation(preparation, "fixture_b_login_verified", {
        fixtureRole: "fixture_b",
        magicLinkLoginObserved: true
      });
      preparation = advanceFixturePreparation(preparation, "processing_consents_verified", {
        fixtureAConsentCount: 2,
        fixtureBConsentCount: 2,
        voiceCloningAcceptedForBoth: true,
        pronunciationProcessingAcceptedForBoth: true
      });
      preparation = advanceFixturePreparation(preparation, "consent_sample_material_verified", {
        fixtureAConsentSamplePresent: true,
        fixtureBConsentSamplePresent: true,
        personalMaterialExcluded: true
      });
      const accepted = advanceFixturePreparation(preparation, "normal_recordings_verified", {
        fixtureARecordingPresent: true,
        fixtureBRecordingPresent: true,
        recordingContract: "consent_gated_web",
        directStorageBypassUsed: false
      });
      const source = readFileSync(join(ROOT, "scripts", "g5d4-fixture-prepare.mjs"), "utf8");
      return accepted.state === "normal_recordings_verified" && assertFixturePreparationHasNoUnsafeAutomation(source);
    });

    await check(44, "manifest is append-only, sealed, and digest chained", async () =>
      initial.manifest.generation === 1 &&
      sealed.manifest.generation === 2 &&
      sealed.manifest.previousGenerationDigest === initial.manifest.generationDigest &&
      sealed.manifest.sealed === true
    );

    await check(45, "network and mutation poison remained uncalled", async () => state.networkCalls === 0);

    await check(46, "accidental wrapper invocation fails closed with spawn count zero", async () => {
      const result = await new Promise((resolvePromise) => {
        const env = { ...process.env };
        delete env.NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE;
        const child = spawn(process.execPath, [join(ROOT, "scripts", "g5d4-authorized-step-wrapper.mjs")], {
          env,
          shell: false,
          stdio: ["ignore", "pipe", "pipe"]
        });
        const stdout = [];
        child.stdout.on("data", (chunk) => stdout.push(chunk));
        child.once("close", (code) =>
          resolvePromise({ code, stdout: Buffer.concat(stdout).toString("utf8") })
        );
        child.once("error", () => resolvePromise({ code: 99, stdout: "" }));
      });
      const parsed = JSON.parse(result.stdout);
      return result.code === 2 && parsed.status === "not_started" && parsed.childSpawnCount === 0;
    });

    await check(47, "unexpected durable targets before Human Gate rejected", async () => {
      const prep = {
        phase: "prep_stop",
        observedRows: 17,
        prospectiveObservedRows: 22,
        dar: { deleted: 15, anonymized: 1, retained: 6 },
        tables: clone(G5D4_A_PREP_TABLE_CONTRACT),
        processingConsents: [
          { consentType: "voice_cloning", status: "active" },
          { consentType: "pronunciation_processing", status: "active" }
        ],
        writerIntentKinds: [...G5D4_WRITER_INTENT_KINDS],
        provider: { present: true, count: 1 },
        storage: { required: 4, present: 4 },
        auth: { present: true },
        request: { count: 1, state: "confirmed", conflictCount: 0 },
        durableTargets: { provider: 1, storage: 0, total: 1, state: "sealed" },
        nextMicroStep: "seal_targets"
      };
      return !g5d4AFixtureContractSchema.safeParse(prep).success;
    });

    const selfTestConfirmedForIsolation = await makeConfirmedAuthorization();
    await check(48, "self-test authorization and collector cannot satisfy live wrapper", async () => {
      const result = await runG5d4AuthorizedStep({
        runDirectory,
        microStep: "provider_cleanup",
        confirmedAuthorizationPath: selfTestConfirmedForIsolation.path
      });
      return result.childSpawnCount === 0 && result.status === "not_started";
    });

    await check(49, "renamed self-test directory cannot satisfy live wrapper", async () => {
      const copiedDirectory = trackIsolationRun(copyPrivateRunToLiveLookingDirectory(runDirectory));
      const result = await runG5d4AuthorizedStep({
        runDirectory: copiedDirectory,
        microStep: "provider_cleanup",
        confirmedAuthorizationPath: join(
          copiedDirectory,
          basename(selfTestConfirmedForIsolation.path)
        )
      });
      return result.childSpawnCount === 0;
    });

    await check(50, "self-test to live provenance edit fails authorization MAC", async () => {
      const tampered = readPrivateJson(runDirectory, selfTestConfirmedForIsolation.path);
      tampered.runPurpose = G5D4_PROVENANCE.live.runPurpose;
      tampered.confirmationProvenance = G5D4_PROVENANCE.live.confirmation;
      tampered.collectorProvenance = G5D4_PROVENANCE.live.collector;
      const tamperedPath = atomicPublishPrivateFile(
        runDirectory,
        `${tampered.authorizationId}-provenance-tampered.json`,
        `${canonicalJson(tampered)}\n`
      );
      return expectReject(() => Promise.resolve(readAuthorizationRecord(runDirectory, tamperedPath)));
    });

    const liveRun = trackIsolationRun(
      createSyntheticPrivateRun(state, G5D4_PROVENANCE.live.runPurpose)
    );
    const liveIssuedForTty = issueProviderAuthorization(liveRun.runDirectory);
    await check(51, "synthetic TTY cannot be injected into live confirmation", async () => {
      const rejected = await expectReject(() =>
        confirmAuthorizationFromTty(
          liveRun.runDirectory,
          liveIssuedForTty.path,
          createFakeTty()
        )
      );
      const confirmedPath = join(
        liveRun.runDirectory,
        `${liveIssuedForTty.record.authorizationId}-confirmed.json`
      );
      return rejected && !existsSync(confirmedPath);
    });

    await check(52, "live manifest rejects self-test confirmed record", async () => {
      const issued = issueProviderAuthorization(liveRun.runDirectory, "b".repeat(64));
      const selfTestRecord = publishAdversarialConfirmedRecord(
        liveRun.runDirectory,
        issued.path,
        "self-test-confirmed",
        {
          runPurpose: G5D4_PROVENANCE.selfTest.runPurpose,
          confirmationProvenance: G5D4_PROVENANCE.selfTest.confirmation,
          collectorProvenance: G5D4_PROVENANCE.selfTest.collector
        }
      );
      const result = await runG5d4AuthorizedStep({
        runDirectory: liveRun.runDirectory,
        microStep: "provider_cleanup",
        confirmedAuthorizationPath: selfTestRecord.path
      });
      return result.childSpawnCount === 0;
    });

    await check(53, "live-looking authorization rejects self-test collector provenance", async () => {
      const issued = issueProviderAuthorization(liveRun.runDirectory, "c".repeat(64));
      const mixedRecord = publishAdversarialConfirmedRecord(
        liveRun.runDirectory,
        issued.path,
        "mixed-collector-provenance",
        { collectorProvenance: G5D4_PROVENANCE.selfTest.collector }
      );
      const result = await runG5d4AuthorizedStep({
        runDirectory: liveRun.runDirectory,
        microStep: "provider_cleanup",
        confirmedAuthorizationPath: mixedRecord.path
      });
      return result.childSpawnCount === 0;
    });

    await check(54, "live public wrapper rejects injected fake collector", async () => {
      const result = await runG5d4AuthorizedStep({
        runDirectory: liveRun.runDirectory,
        microStep: "provider_cleanup",
        confirmedAuthorizationPath: liveIssuedForTty.path,
        collector: wrapperCollector
      });
      return result.childSpawnCount === 0;
    });

    await check(55, "live public wrapper rejects injected fake launcher", async () => {
      let fakeLaunchCount = 0;
      const result = await runG5d4AuthorizedStep({
        runDirectory: liveRun.runDirectory,
        microStep: "provider_cleanup",
        confirmedAuthorizationPath: liveIssuedForTty.path,
        launcher: async () => {
          fakeLaunchCount += 1;
        }
      });
      return result.childSpawnCount === 0 && fakeLaunchCount === 0;
    });

    await check(56, "missing manifest provenance fails closed", async () => {
      const copiedDirectory = trackIsolationRun(
        copyPrivateRunToLiveLookingDirectory(liveRun.runDirectory, (name, bytes) => {
          if (name !== "manifest-000002.json") return bytes;
          const value = JSON.parse(bytes.toString("utf8"));
          delete value.runPurpose;
          return Buffer.from(`${canonicalJson(value)}\n`, "utf8");
        })
      );
      const result = await runG5d4AuthorizedStep({
        runDirectory: copiedDirectory,
        microStep: "provider_cleanup",
        confirmedAuthorizationPath: join(copiedDirectory, basename(liveIssuedForTty.path))
      });
      return result.childSpawnCount === 0;
    });

    await check(57, "unknown manifest provenance fails closed", async () => {
      const copiedDirectory = trackIsolationRun(
        copyPrivateRunToLiveLookingDirectory(liveRun.runDirectory, (name, bytes) => {
          if (name !== "manifest-000002.json") return bytes;
          const value = JSON.parse(bytes.toString("utf8"));
          value.collectorProvenance = "unknown_collector_v1";
          return Buffer.from(`${canonicalJson(value)}\n`, "utf8");
        })
      );
      const result = await runG5d4AuthorizedStep({
        runDirectory: copiedDirectory,
        microStep: "provider_cleanup",
        confirmedAuthorizationPath: join(copiedDirectory, basename(liveIssuedForTty.path))
      });
      return result.childSpawnCount === 0;
    });

    await check(58, "caller-supplied stale live collector is not accepted", async () => {
      const result = await runG5d4AuthorizedStep({
        runDirectory: liveRun.runDirectory,
        microStep: "provider_cleanup",
        confirmedAuthorizationPath: liveIssuedForTty.path,
        collectorEvidence: {
          safe: {
            collectedAt: new Date(NOW.getTime() - 600_000).toISOString(),
            collectorProvenance: G5D4_PROVENANCE.live.collector
          }
        }
      });
      return result.childSpawnCount === 0;
    });

    await check(59, "unsealed live manifest fails closed", async () => {
      const unsealedRun = trackIsolationRun(
        createSyntheticPrivateRun(state, G5D4_PROVENANCE.live.runPurpose, { sealed: false })
      );
      const result = await runG5d4AuthorizedStep({
        runDirectory: unsealedRun.runDirectory,
        microStep: "provider_cleanup",
        confirmedAuthorizationPath: join(unsealedRun.runDirectory, "missing-confirmed.json")
      });
      return result.childSpawnCount === 0;
    });

    await check(60, "unarmed live-owned collector factory fails before network", async () =>
      expectReject(() => Promise.resolve(createLiveReadOnlyCollector(liveRun.runDirectory)))
    );

    for (const directory of isolationRunDirectories) cleanupPrivateRunDirectory(directory);
    isolationRunDirectories.clear();

    cleanupPassed = cleanupPrivateRunDirectory(runDirectory);
    if (!cleanupPassed || existsSync(runDirectory)) throw new Error("final private cleanup failed");
    process.stdout.write(`- 61 final private temp cleanup: PASS\n`);
    passed += 1;
    process.stdout.write(`G5D4_PROOF_TOOLING_FAKE_ONLY_SELF_TEST_PASS ${passed}/${passed}\n`);
  } finally {
    globalThis.fetch = originalFetch;
    if (!cleanupPassed && existsSync(runDirectory)) {
      chmodSync(runDirectory, 0o700);
      cleanupPrivateRunDirectory(runDirectory);
    }
    for (const directory of isolationRunDirectories) {
      if (existsSync(directory)) cleanupPrivateRunDirectory(directory);
    }
  }
}

if (process.argv[2] === "--consume-worker") {
  await consumeWorker();
} else {
  await main();
}
