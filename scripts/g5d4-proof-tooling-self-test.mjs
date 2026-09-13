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
  G5D4_RECORDING_CHECKPOINT_MAX_AGE_MS,
  G5D4_REQUIRED_MIGRATIONS,
  G5D4_STORAGE_BUCKETS,
  G5D4_WRITER_INTENT_KINDS,
  buildReviewerSafeDto,
  canonicalJson,
  g5d4AFixtureContractSchema,
  g5d4AuthorizationSchema,
  g5d4BControlContractSchema,
  g5d4PrivateManifestSchema,
  hmacSha256Hex,
  sha256Hex
} from "./g5d4-proof-contract.mjs";
import {
  G5D4_CONFIRMATION_PHRASE,
  G5D4_RECORDING_CONFIRMATION_PHRASE,
  confirmLiveRecordingCheckpointFromTty,
  createSelfTestRecordingCheckpoint,
  assertSecureRunDirectory,
  assertFixtureManifestComplete,
  bindFixtureManifestAuthority,
  bindVerifiedLiveFixtureAuthority,
  verifyLiveFixtureAuthority,
  createSelfTestFixtureVerification,
  completeFixtureManifest,
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
  loadAndVerifyManifestChain,
  readAliasKey,
  readAuthorizationRecord,
  readPrivateJson,
  sealPrivateManifest
} from "./g5d4-proof-private-state.mjs";
import {
  assertReadOnlyCollectorAdapters,
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
  bindVerifiedFixturePreparationAuthority,
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

function privateManifestInput(runPurpose) {
  return {
    runPurpose,
    createdAt: INSTANT,
    authority: {
      environment: "canonical_staging",
      projectLabel: G5D4_CANONICAL_STAGING.projectLabel,
      projectRef: G5D4_CANONICAL_STAGING.projectRef,
      region: "ap-northeast-1",
      commit: COMMIT
    }
  };
}

// Synthetic identifiers stay exclusively in this fake-only harness.
function fixtureBindings(state) {
  return [
    { kind: "identity", fixtureRole: "fixture_a", userId: state.userA },
    { kind: "identity", fixtureRole: "fixture_b", userId: state.userB },
    { kind: "provider", fixtureRole: "fixture_a", resourceId: state.providerAId },
    { kind: "provider", fixtureRole: "fixture_b", resourceId: state.providerBId },
    ...state.targetsA.map((target) => ({ kind: "storage", fixtureRole: "fixture_a", target })),
    ...state.targetsB.map((target) => ({ kind: "storage", fixtureRole: "fixture_b", target })),
    { kind: "request", deletionRequestId: "private-deletion-request-id", deletionRequestRef: "private-deletion-request-ref" }
  ];
}

let isolatedModuleSequence = 0;
async function createIsolatedVerificationModule(state, mutateObservations = () => {}, mutableReceipt = false, humanOptions = {}) {
  // Test-only source isolation replaces machine reads and the terminal input.
  // The optional external-key freeze exception is confined below. Production
  // accepts no such options; validation, snapshot, bind and chain checks run unchanged.
  const observations = fixtureBindings(state).map((binding) => {
    const fixtureRole = binding.fixtureRole ?? "fixture_a";
    const userId = fixtureRole === "fixture_a" ? state.userA : state.userB;
    const owner = { fixtureRole, userId };
    if (binding.kind === "identity") return {
      method: "readIdentityBaseline", query: owner,
      result: { ...owner, auth: { userId, present: true, confirmed: true }, profile: { userId, count: 1 },
        baseline: G5D4_A_PREP_TABLE_CONTRACT.filter(({ table }) => table !== "profiles").map(({ table }) => ({ table, count: 0 })) }
    };
    if (binding.kind === "provider") return {
      method: "readProviderBinding", query: { ...owner, resourceId: binding.resourceId },
      result: { ...owner, resourceId: binding.resourceId, present: true, count: 1,
        dbBinding: { userId, resourceId: binding.resourceId, count: 1 } }
    };
    if (binding.kind === "storage") return {
      method: "readStorageBinding", query: { ...owner, ...binding.target },
      result: { ...owner, ...binding.target, present: true, count: 1,
        dbLocator: { userId, ...binding.target, count: 1 },
        recordingState: binding.target.bucket === "recordings" ? {
          scriptId: "private-script", consentId: "private-consent", consentType: "pronunciation_processing",
          consentStatus: "active", consentVersion: "2026-08-22.v1", writerIntentId: "private-writer",
          writerKind: "recording_upload", writerStatus: "completed", writerOwnerId: userId,
          writerScriptId: "private-script", writerBucket: binding.target.bucket, writerKey: binding.target.key,
          storageObjectId: "private-object"
        } : null }
    };
    return {
      method: "readDeletionRequest",
      query: { ...owner, deletionRequestId: binding.deletionRequestId, deletionRequestRef: binding.deletionRequestRef, fixtureBUserId: state.userB },
      result: { ...owner, deletionRequestId: binding.deletionRequestId, deletionRequestRef: binding.deletionRequestRef,
        count: 1, state: "confirmed", conflictCount: 0, fixtureBUserId: state.userB, fixtureBRequestCount: 0 }
    };
  });
  for (const { fixtureRole, userId } of fixtureBindings(state).slice(0, 2)) observations.push({
    method: "readCurrentRecordingIdentity", query: { fixtureRole, userId },
    result: { fixtureRole, userId, auth: { state: "present", identity: userId, evidence: {
      contact: "synthetic@example.invalid", identity: "00000000-0000-4000-8000-000000000001",
      confirmedAt: INSTANT, provider: "email", bannedUntil: null
    } } }
  });
  mutateObservations(observations);
  const privatePath = join(ROOT, "scripts/g5d4-proof-private-state.mjs");
  let source = readFileSync(privatePath, "utf8");
  const factory = /function createLiveFixtureVerificationReader\(\) \{[\s\S]*?\n\}/;
  if (!factory.test(source)) throw new Error("isolated reader factory boundary missing");
  source = source.replace(factory, `function createLiveFixtureVerificationReader() {
    const observations = ${canonicalJson(observations)};
    return Object.fromEntries(["readIdentityBaseline", "readCurrentRecordingIdentity", "readProviderBinding", "readStorageBinding", "readDeletionRequest"].map(method => [method, async query => {
      isolatedReadCounts[method] = (isolatedReadCounts[method] ?? 0) + 1;
      const observed = observations.find(item => item.method === method && canonicalJson(item.query) === canonicalJson(query));
      if (!observed) throw new Error("isolated fake read target missing");
      const result = structuredClone(observed.result);
      isolatedReadResults.push(result);
      if (isolatedHumanState.duringRead) await isolatedHumanState.duringRead();
      return result;
    }]));
  }`);
  if (!humanOptions.realTty) {
    const tty = /async function readRecordingPhraseFromLiveTty\(summary\) \{[\s\S]*?\n\}/;
    if (!tty.test(source)) throw new Error("isolated recording TTY boundary missing");
    source = source.replace(tty, `async function readRecordingPhraseFromLiveTty(summary) {
      isolatedHumanPrompts.push(summary);
      if (isolatedHumanState.duringPrompt) await isolatedHumanState.duringPrompt();
      return isolatedHumanState.phrase;
    }`);
  }
  // Reproduce the old machine-only bind in a source copy. Real production
  // completion/seal and chain readers below must reject the resulting fixture.
  if (humanOptions.legacyMachineOnly) {
    source = source.replace(/function assertAcceptedRecordingVerification\(verified, manifest, binding, key\) \{[\s\S]*?\n\}/,
      "function assertAcceptedRecordingVerification() {}");
    const conjunction = /  let accepted = verified;[\s\S]*?  assertAcceptedRecordingVerification\(accepted, current, binding, key\);/;
    if (!conjunction.test(source)) throw new Error("legacy conjunction test boundary missing");
    source = source.replace(conjunction, "  const accepted = verified;\n  const checkpoints = new WeakMap();");
  }
  // Defense-in-depth test only: remove external-key freezing in an isolated
  // instance. Snapshot construction/lookup/persistence remain unchanged.
  if (mutableReceipt) {
    const declaration = "const receipt = Object.freeze(Object.create(null));";
    if (!source.includes(declaration)) throw new Error("opaque receipt test boundary missing");
    source = source.replace(declaration, "const receipt = Object.create(null);");
  }
  source = source.replace('const MODULE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");', `const MODULE_ROOT = ${JSON.stringify(ROOT)};`)
    .replaceAll('"zod"', JSON.stringify(import.meta.resolve("zod")))
    .replaceAll('"./g5d4-proof-contract.mjs"', JSON.stringify(new URL("./g5d4-proof-contract.mjs", import.meta.url).href))
    .replaceAll('"./g5d4-invocation-evidence.mjs"', JSON.stringify(new URL("./g5d4-invocation-evidence.mjs", import.meta.url).href))
    .replaceAll('"./g5d4-live-read-only-adapters.mjs"', JSON.stringify(new URL("./g5d4-live-read-only-adapters.mjs", import.meta.url).href));
  source += `\nexport const isolatedReadCounts = {};\nexport const isolatedReadResults = [];
    export const isolatedHumanPrompts = [];
    export const isolatedHumanState = { phrase: G5D4_RECORDING_CONFIRMATION_PHRASE };
    // isolated instance ${++isolatedModuleSequence}\n`;
  if (humanOptions.clock) source += `
    export const isolatedClock = { now: globalThis.Date.now() };
    const Date = class extends globalThis.Date {
      constructor(...args) { super(...(args.length ? args : [isolatedClock.now])); }
      static now() { return isolatedClock.now; }
    };\n`;
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const isolated = await import(moduleUrl);
  let helper = readFileSync(join(ROOT, "scripts/g5d4-fixture-prepare.mjs"), "utf8");
  helper = helper.replaceAll('"./g5d4-proof-contract.mjs"', JSON.stringify(new URL("./g5d4-proof-contract.mjs", import.meta.url).href))
    .replaceAll('"zod"', JSON.stringify(import.meta.resolve("zod")))
    .replaceAll('"./g5d4-proof-private-state.mjs"', JSON.stringify(moduleUrl));
  return { ...isolated, helper: await import(`data:text/javascript;base64,${Buffer.from(helper).toString("base64")}`) };
}

function populateSyntheticManifest(runDirectory, state) {
  for (const binding of fixtureBindings(state)) bindFixtureManifestAuthority(runDirectory, binding);
  return completeFixtureManifest(runDirectory);
}

async function createSyntheticPrivateRun(state, runPurpose, options = {}) {
  const runDirectory = createPrivateRunDirectory({ runPurpose });
  try {
    const initial = createInitialPrivateManifest(runDirectory, privateManifestInput(runPurpose));
    createAliasKey(runDirectory);
    if (runPurpose === G5D4_PROVENANCE.selfTest.runPurpose) populateSyntheticManifest(runDirectory, state);
    else {
      const isolated = await createIsolatedVerificationModule(state);
      for (const binding of fixtureBindings(state)) await isolated.helper.bindVerifiedFixturePreparationAuthority(runDirectory, binding);
      completeFixtureManifest(runDirectory);
    }
    const sealed = options.sealed === false ? null : sealPrivateManifest(runDirectory, { createdAt: INSTANT });
    return { runDirectory, initial, sealed };
  } catch {
    cleanupPrivateRunDirectory(runDirectory);
    throw new Error("isolated fake manifest setup failed");
  }
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
  let ok;
  try {
    ok = await operation();
  } catch {
    // Never dump isolated module source or private fixture observations.
    throw new Error(`case ${number} failed during isolated check`);
  }
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

async function checkIncrementalManifest(state, trackRun) {
  const isolated = await createIsolatedVerificationModule(state);
  const { bindVerifiedFixturePreparationAuthority } = isolated.helper;
  const directory = trackRun(createPrivateRunDirectory({ runPurpose: G5D4_PROVENANCE.live.runPurpose }));
  const bindings = fixtureBindings(state);
  const initialInput = privateManifestInput(G5D4_PROVENANCE.live.runPurpose);
  let initial;
  let preparation = createFixturePreparationState();
  let bOnly;
  const identityEvidence = (fixtureRole) => ({ fixtureRole, magicLinkLoginObserved: true, zeroBaselineVerified: true });
  const persistedBytes = new Map();
  function preserveGenerations() {
    for (const manifest of loadAndVerifyManifestChain(directory)) {
      const name = `manifest-${String(manifest.generation).padStart(6, "0")}.json`;
      const bytes = readFileSync(join(directory, name), "utf8");
      if (persistedBytes.has(name) && persistedBytes.get(name) !== bytes) throw new Error("prior generation changed");
      persistedBytes.set(name, bytes);
    }
    return true;
  }
  await check(62, "preparing live-purpose creation needs no future resource or key", async () => {
    if (!await expectReject(() => createInitialPrivateManifest(directory, {
      ...initialInput, rawAuthorities: { fixtureAUserId: state.userA }
    }))) return false;
    initial = createInitialPrivateManifest(directory, initialInput);
    const raw = initial.manifest.rawAuthorities;
    return initial.manifest.lifecycle === "preparing" && !existsSync(join(directory, "alias-key.bin")) &&
      Object.values(raw).every((value) => value === null || (Array.isArray(value) && value.length === 0)) &&
      Object.keys(initial.manifest.aliases).length === 0 && Object.keys(initial.manifest.stageTargets).length === 0;
  });
  await check(63, "unbound preparing generation integrity passes before key creation", async () =>
    loadLatestPrivateManifest(directory).generationDigest === initial.manifest.generationDigest && preserveGenerations()
  );
  createAliasKey(directory);
  await check(64, "A baseline verification then one identity binding and checkpoint", async () => {
    if (!await expectReject(() => bindVerifiedFixturePreparationAuthority(directory, bindings[0], {
      ...identityEvidence("fixture_a"), zeroBaselineVerified: false
    }))) return false;
    if (!await expectReject(() => advanceFixturePreparation(preparation, "fixture_a_login_verified", {
      fixtureRole: "fixture_a", magicLinkLoginObserved: true
    }, { runDirectory: directory }))) return false;
    const result = await bindVerifiedFixturePreparationAuthority(directory, bindings[0]);
    preparation = advanceFixturePreparation(preparation, "fixture_a_login_verified", {
      fixtureRole: "fixture_a", magicLinkLoginObserved: true
    }, { runDirectory: directory });
    return result.manifest.rawAuthorities.fixtureAUserId === state.userA &&
      result.manifest.rawAuthorities.fixtureBUserId === null && preserveGenerations();
  });
  await check(65, "same-value A rebind and raw identity replacement fail without a generation", async () => {
    const before = loadLatestPrivateManifest(directory).generation;
    return await expectReject(() => bindFixtureManifestAuthority(directory, bindings[0])) &&
      await expectReject(() => bindFixtureManifestAuthority(directory, { ...bindings[0], userId: state.userB })) &&
      loadLatestPrivateManifest(directory).generation === before;
  });
  await check(66, "B binds independently including before A", async () => {
    bOnly = trackRun(createPrivateRunDirectory({ runPurpose: G5D4_PROVENANCE.live.runPurpose }));
    createInitialPrivateManifest(bOnly, initialInput);
    createAliasKey(bOnly);
    const independent = await bindVerifiedFixturePreparationAuthority(bOnly, bindings[1]);
    await bindVerifiedFixturePreparationAuthority(directory, bindings[1]);
    preparation = advanceFixturePreparation(preparation, "fixture_b_login_verified", {
      fixtureRole: "fixture_b", magicLinkLoginObserved: true
    }, { runDirectory: directory });
    return independent.manifest.rawAuthorities.fixtureAUserId === null &&
      independent.manifest.rawAuthorities.fixtureBUserId === state.userB && preserveGenerations();
  });
  await check(67, "A/B identity substitution and B rebind rejected", async () =>
    await expectReject(() => bindFixtureManifestAuthority(bOnly, { ...bindings[0], userId: state.userB })) &&
    await expectReject(() => bindVerifiedFixturePreparationAuthority(bOnly, bindings[0], identityEvidence("fixture_b"))) &&
    await expectReject(() => bindFixtureManifestAuthority(directory, bindings[1]))
  );
  await check(68, "partial preparing manifest cannot seal or claim fixture_complete", async () =>
    await expectReject(() => sealPrivateManifest(directory)) &&
    await expectReject(() => completeFixtureManifest(directory)) &&
    !g5d4PrivateManifestSchema.safeParse({ ...loadLatestPrivateManifest(directory), lifecycle: "fixture_complete" }).success
  );
  await check(69, "partial manifest cannot issue authorization", async () =>
    await expectReject(() => issueAuthorizationRecord(directory, {})) &&
    !readdirSync(directory).some((name) => name.startsWith("g5d4_authz_"))
  );
  await check(70, "partial live manifest fails wrapper and Human-ready checkpoint closed", async () => {
    const result = await runG5d4AuthorizedStep({
      runDirectory: directory, microStep: "provider_cleanup", confirmedAuthorizationPath: join(directory, "missing-confirmed.json")
    });
    const refused = await expectReject(() => advanceFixturePreparation({
      ...preparation, state: "targets_sealed_verified", nextCheckpoint: "human_gate_ready"
    }, "human_gate_ready", {
      sealedManifestVerified: true, collectorCurrent: true, humanAuthorizationCreated: false, destructiveGuardEnabled: false
    }, { runDirectory: directory }));
    return result.status === "not_started" && result.childSpawnCount === 0 && refused;
  });
  await check(71, "A/B Provider resources bind incrementally after their identities", async () => {
    if (!await expectReject(() => bindFixtureManifestAuthority(bOnly, bindings[2]))) return false;
    for (const binding of bindings.slice(2, 4)) {
      if (binding.fixtureRole === "fixture_b" && !await expectReject(() => bindFixtureManifestAuthority(directory, {
        ...binding, resourceId: state.providerAId
      }))) return false;
      await bindVerifiedFixturePreparationAuthority(directory, binding);
      preserveGenerations();
    }
    return loadLatestPrivateManifest(directory).rawAuthorities.deletionRequestId === null;
  });
  await check(72, "Provider same-value rebind and conflicting replacement rejected", async () =>
    await expectReject(() => bindFixtureManifestAuthority(directory, bindings[2])) &&
    await expectReject(() => bindFixtureManifestAuthority(directory, { ...bindings[2], resourceId: "private-replacement-provider" }))
  );
  await check(73, "A/B exact Storage universe binds one verified object per generation", async () => {
    for (const binding of bindings.slice(4, 12)) {
      const evidence = { fixtureRole: binding.fixtureRole, resourcePresent: true, ownershipVerified: true };
      if (binding.target.bucket === "recordings") {
        if (!await expectReject(() => bindVerifiedFixturePreparationAuthority(directory, binding, evidence))) return false;
        evidence.recordingContract = "consent_gated_web";
        evidence.humanCanonicalWebSuccessObserved = true;
        evidence.immediateReadOnlyReconciliationVerified = true;
        evidence.directStorageBypassUsed = false;
      }
      if (binding.fixtureRole === "fixture_b" && !await expectReject(() => bindFixtureManifestAuthority(directory, {
        ...binding, target: state.targetsA.find((target) => target.bucket === binding.target.bucket)
      }))) return false;
      await bindVerifiedFixturePreparationAuthority(directory, binding);
      preserveGenerations();
    }
    return loadLatestPrivateManifest(directory).rawAuthorities.fixtureBStorageTargets.length === 4;
  });
  await check(74, "duplicate and conflicting Storage objects cannot overwrite", async () =>
    await expectReject(() => bindFixtureManifestAuthority(directory, bindings[4])) &&
    await expectReject(() => bindFixtureManifestAuthority(directory, {
      ...bindings[4], target: { ...bindings[4].target, key: "private-replacement-object" }
    }))
  );
  await check(75, "request remains truly unbound before creation and blocks completion", async () => {
    const manifest = loadLatestPrivateManifest(directory);
    return manifest.rawAuthorities.deletionRequestId === null && manifest.rawAuthorities.deletionRequestRef === null &&
      manifest.aliases.request === undefined && manifest.stageTargets.completion_verification === undefined &&
      manifest.stageTargets.database_cleanup === undefined &&
      await expectReject(() => completeFixtureManifest(directory));
  });
  await check(76, "confirmed existing request binds ID/ref together exactly once", async () => {
    const binding = bindings.at(-1);
    const evidence = { fixtureADeletionRequestCount: 1, fixtureARequestState: "confirmed", fixtureBDeletionRequestCount: 0 };
    if (!await expectReject(() => bindVerifiedFixturePreparationAuthority(directory, binding, {
      ...evidence, fixtureADeletionRequestCount: 0
    }))) return false;
    await bindVerifiedFixturePreparationAuthority(directory, binding);
    return await expectReject(() => bindFixtureManifestAuthority(directory, binding)) &&
      await expectReject(() => bindFixtureManifestAuthority(directory, { ...binding, deletionRequestRef: "private-replacement-request" })) &&
      preserveGenerations();
  });
  await check(77, "completion rejects every missing final raw/alias/target authority", async () => {
    const manifest = loadLatestPrivateManifest(directory);
    for (const section of ["rawAuthorities", "aliases", "stageTargets"]) {
      for (const field of Object.keys(manifest[section])) {
        const missing = clone(manifest);
        delete missing[section][field];
        if (!await expectReject(() => assertFixtureManifestComplete(missing, readAliasKey(directory)))) return false;
      }
    }
    return true;
  });
  await check(78, "completion validates structure, derived bindings and exact provenance", async () => {
    const manifest = loadLatestPrivateManifest(directory);
    const mutations = [
      (value) => { value.rawAuthorities.fixtureAStorageTargets[3] = clone(value.rawAuthorities.fixtureAStorageTargets[0]); },
      (value) => { value.rawAuthorities.fixtureBStorageTargets.pop(); },
      (value) => { value.aliases.targetSet = value.aliases.fixtureA; },
      (value) => { value.aliases.storageTargets.reverse(); },
      (value) => { value.stageTargets.database_cleanup.count = 14; },
      (value) => { value.stageTargets.provider_cleanup.digest = "0".repeat(64); },
      (value) => { value.collectorProvenance = G5D4_PROVENANCE.selfTest.collector; },
      (value) => { delete value.confirmationProvenance; }
    ];
    for (const mutate of mutations) {
      const changed = clone(manifest);
      mutate(changed);
      if (!await expectReject(() => assertFixtureManifestComplete(changed, readAliasKey(directory)))) return false;
    }
    return true;
  });
  await check(79, "full validation permits only the fixture_complete transition", async () => {
    const current = loadLatestPrivateManifest(directory);
    assertFixtureManifestComplete(current, readAliasKey(directory));
    if (!await expectReject(() => sealPrivateManifest(directory))) return false;
    const complete = completeFixtureManifest(directory).manifest;
    const observations = [
      ["processing_consents_verified", { fixtureAConsentCount: 2, fixtureBConsentCount: 2,
        voiceCloningAcceptedForBoth: true, pronunciationProcessingAcceptedForBoth: true }],
      ["consent_sample_material_verified", { fixtureAConsentSamplePresent: true, fixtureBConsentSamplePresent: true,
        personalMaterialExcluded: true }],
      ["normal_recordings_verified", { fixtureARecordingPresent: true, fixtureBRecordingPresent: true,
        recordingContract: "consent_gated_web", humanCanonicalWebSuccessObserved: true, immediateReadOnlyReconciliationVerified: true, directStorageBypassUsed: false }],
      ["provider_awareness_verified", { disposableProviderResourceCountA: 1, disposableProviderResourceCountB: 1,
        humanProviderAwarenessObserved: true }],
      ["deletion_request_verified", { fixtureADeletionRequestCount: 1, fixtureARequestState: "confirmed", fixtureBDeletionRequestCount: 0 }],
      ["prep_stop_verified", { fixtureAObservedRows: 17, fixtureBObservedRows: 16, durableTargetsBeforeSeal: 0, destructiveMutations: 0 }]
    ];
    for (const [checkpoint, evidence] of observations) {
      preparation = advanceFixturePreparation(preparation, checkpoint, evidence, { runDirectory: directory });
    }
    return complete.lifecycle === "fixture_complete" && !complete.sealed &&
      complete.previousGenerationDigest === current.generationDigest &&
      await expectReject(() => issueAuthorizationRecord(directory, {})) && preserveGenerations();
  });
  await check(80, "complete manifest seals with original final target semantics", async () => {
    const sealed = sealPrivateManifest(directory).manifest;
    const current = loadLatestPrivateManifest(directory, { requireSealed: true });
    preparation = advanceFixturePreparation(preparation, "targets_sealed_verified", {
      fixtureAObservedRows: 22, providerTargets: 1, storageTargets: 4, durableTargets: 5,
      deletedRows: 15, anonymizedRows: 1, retainedRows: 6, destructiveMutations: 0
    }, { runDirectory: directory });
    preparation = advanceFixturePreparation(preparation, "human_gate_ready", {
      sealedManifestVerified: true, collectorCurrent: true, humanAuthorizationCreated: false, destructiveGuardEnabled: false
    }, { runDirectory: directory });
    return !preparation.destructiveExecutionAuthorized && current.lifecycle === "sealed" && current.generationDigest === sealed.generationDigest &&
      current.stageTargets.database_cleanup.count === 15 && current.stageTargets.storage_cleanup.count === 4 &&
      current.runPurpose === G5D4_PROVENANCE.live.runPurpose && preserveGenerations();
  });
  await check(81, "sealed fixture identities/resources and lifecycle stay immutable", async () => {
    for (const binding of bindings) {
      if (!await expectReject(() => bindFixtureManifestAuthority(directory, binding))) return false;
    }
    return await expectReject(() => completeFixtureManifest(directory)) &&
      await expectReject(() => sealPrivateManifest(directory)) && preserveGenerations();
  });
  await check(82, "all prior generation bytes/digests/provenance preserved; tampering refused", async () => {
    const chain = loadAndVerifyManifestChain(directory);
    const copy = trackRun(copyPrivateRunToLiveLookingDirectory(directory, (name, bytes) => {
      if (name !== "manifest-000003.json") return bytes;
      const changed = JSON.parse(bytes.toString("utf8"));
      changed.rawAuthorities.fixtureAUserId = "private-replaced-identity";
      return Buffer.from(canonicalJson(changed));
    }));
    return chain.length === 16 && chain.every((manifest, index) =>
      manifest.previousGenerationDigest === (index ? chain[index - 1].generationDigest : null) &&
      manifest.runPurpose === G5D4_PROVENANCE.live.runPurpose &&
      manifest.confirmationProvenance === G5D4_PROVENANCE.live.confirmation &&
      manifest.collectorProvenance === G5D4_PROVENANCE.live.collector
    ) && await expectReject(() => loadLatestPrivateManifest(copy)) && preserveGenerations();
  });
  await check(83, "valid digest cannot hide a replaced binding or changed run provenance", async () => {
    for (const field of ["rawAuthorities", "runPurpose"]) {
      const copy = trackRun(copyPrivateRunToLiveLookingDirectory(bOnly));
      const previous = loadLatestPrivateManifest(copy);
      const changed = {
        ...previous, generation: previous.generation + 1, previousGenerationDigest: previous.generationDigest
      };
      if (field === "rawAuthorities") changed.rawAuthorities.fixtureBUserId = "private-replaced-b";
      else {
        changed.runPurpose = G5D4_PROVENANCE.selfTest.runPurpose;
        changed.confirmationProvenance = G5D4_PROVENANCE.selfTest.confirmation;
        changed.collectorProvenance = G5D4_PROVENANCE.selfTest.collector;
      }
      const unsigned = Object.fromEntries(Object.entries(changed).filter(([key]) => key !== "generationDigest"));
      changed.generationDigest = sha256Hex(canonicalJson(unsigned));
      atomicPublishPrivateFile(copy, "manifest-000003.json", canonicalJson(changed));
      if (!await expectReject(() => loadLatestPrivateManifest(copy))) return false;
    }
    return true;
  });
}

async function checkVerifiedBindingBoundary(state, trackRun) {
  const api = await createIsolatedVerificationModule(state);
  const bindings = fixtureBindings(state);
  const prepare = (purpose = G5D4_PROVENANCE.live.runPurpose) => {
    const directory = trackRun(createPrivateRunDirectory({ runPurpose: purpose }));
    createInitialPrivateManifest(directory, privateManifestInput(purpose));
    createAliasKey(directory);
    return directory;
  };
  const directory = prepare();
  let number = 83;
  const focused = (label, operation) => check(++number, label, operation);
  const verifiedBind = (binding) => api.helper.bindVerifiedFixturePreparationAuthority(directory, binding);
  for (const [label, binding] of [["A", bindings[0]], ["B", bindings[1]], ["Provider", bindings[2]],
    ["Storage", bindings[4]], ["request", bindings.at(-1)]]) {
    await focused(`live raw ${label} bind rejected`, async () =>
      await expectReject(() => bindFixtureManifestAuthority(directory, binding)) && loadLatestPrivateManifest(directory).generation === 1);
  }
  const synthetic = prepare(G5D4_PROVENANCE.selfTest.runPurpose);
  const syntheticReceipt = api.createSelfTestFixtureVerification(synthetic, bindings[0]);
  await focused("live rejects self-test verification capability", async () =>
    Object.isFrozen(syntheticReceipt) && Reflect.ownKeys(syntheticReceipt).length === 0 &&
    await expectReject(() => api.bindVerifiedLiveFixtureAuthority(directory, bindings[0], syntheticReceipt)));
  const receiptA = await api.verifyLiveFixtureAuthority(directory, bindings[0]);
  const staleB = await api.verifyLiveFixtureAuthority(directory, bindings[1]);
  await focused("A receipt cannot bind B role", async () =>
    expectReject(() => api.bindVerifiedLiveFixtureAuthority(directory, { ...bindings[0], fixtureRole: "fixture_b" }, receiptA)));
  await focused("receipt cannot bind another raw identity", async () =>
    expectReject(() => api.bindVerifiedLiveFixtureAuthority(directory, { ...bindings[0], userId: state.userB }, receiptA)));
  for (const field of ["targetDigest", "generation", "generationDigest", "verificationProvenance", "ownerDigest", "relationDigest", "verifiedCount", "verifiedAt", "integrityMac"]) {
    await focused(`receipt tampered ${field} rejected`, async () => {
      const receipt = await api.verifyLiveFixtureAuthority(directory, bindings[0]);
      return await expectReject(() => { receipt[field] = "0".repeat(64); }) &&
        await expectReject(() => api.bindVerifiedLiveFixtureAuthority(directory, bindings[0], { ...receipt, [field]: "0".repeat(64) }));
    });
  }
  await focused("receipt missing verification provenance rejected", async () => {
    const receipt = await api.verifyLiveFixtureAuthority(directory, bindings[0]);
    return !Reflect.defineProperty(receipt, "verificationProvenance", { value: "self_test_v1" }) &&
      await expectReject(() => api.bindVerifiedLiveFixtureAuthority(directory, bindings[0], { ...receipt }));
  });
  await focused("public live bind rejects copied and caller re-signed receipts", async () => {
    const forged = clone(receiptA);
    forged.integrityMac = hmacSha256Hex(readAliasKey(directory), "fixture-binding-verification",
      Object.fromEntries(Object.entries(forged).filter(([field]) => field !== "integrityMac")));
    return await expectReject(() => api.bindVerifiedLiveFixtureAuthority(directory, bindings[0], forged)) &&
      await expectReject(() => bindVerifiedLiveFixtureAuthority(directory, bindings[0], receiptA));
  });
  await focused("verified A read evidence binds A", async () =>
    api.bindVerifiedLiveFixtureAuthority(directory, bindings[0], receiptA).manifest.rawAuthorities.fixtureAUserId === state.userA);
  await focused("successful receipt is single-use and from previous generation", async () =>
    expectReject(() => api.bindVerifiedLiveFixtureAuthority(directory, bindings[0], receiptA)));
  await focused("intervening A bind makes unconsumed B receipt stale", async () =>
    await expectReject(() => api.bindVerifiedLiveFixtureAuthority(directory, bindings[1], staleB)) &&
    loadLatestPrivateManifest(directory).generation === 2);
  await focused("verified B read evidence binds B", async () =>
    (await verifiedBind(bindings[1])).manifest.rawAuthorities.fixtureBUserId === state.userB);
  const providerReceipt = await api.verifyLiveFixtureAuthority(directory, bindings[2]);
  await focused("Provider receipt cannot bind Storage", async () =>
    expectReject(() => api.bindVerifiedLiveFixtureAuthority(directory, bindings[4], providerReceipt)));
  await focused("verified Provider read evidence binds exact A/B resources", async () => {
    api.bindVerifiedLiveFixtureAuthority(directory, bindings[2], providerReceipt);
    await verifiedBind(bindings[3]);
    return loadLatestPrivateManifest(directory).rawAuthorities.fixtureBProviderResourceId === state.providerBId;
  });
  await focused("verified Storage reads bind all eight exact owned bucket objects", async () => {
    for (const binding of bindings.slice(4, 12)) await verifiedBind(binding);
    return loadLatestPrivateManifest(directory).bindingVerifications.filter(({ kind }) => kind === "storage").length === 8;
  });
  await focused("verified confirmed no-conflict request read binds A request", async () =>
    (await verifiedBind(bindings.at(-1))).manifest.rawAuthorities.deletionRequestId === bindings.at(-1).deletionRequestId);
  await focused("verified same-value rebinding rejected for all authority kinds", async () => {
    const generation = loadLatestPrivateManifest(directory).generation;
    for (const binding of bindings) if (!await expectReject(() => verifiedBind(binding))) return false;
    return loadLatestPrivateManifest(directory).generation === generation;
  });
  await focused("raw resource binds still rejected with identities already present", async () => {
    for (const binding of bindings.slice(2)) if (!await expectReject(() => bindFixtureManifestAuthority(directory, binding))) return false;
    return true;
  });
  await focused("complete validation rejects missing, synthetic and tampered persisted provenance", async () => {
    const full = loadLatestPrivateManifest(directory);
    for (const mutate of [
      (value) => { delete value.bindingVerifications; },
      (value) => { value.bindingVerifications = []; },
      (value) => { value.bindingVerifications[0].verificationProvenance = "self_test_v1"; },
      (value) => { value.bindingVerifications[0].relationDigest = "0".repeat(64); },
      (value) => { value.bindingVerifications[0].ownerDigest = "0".repeat(64); }
    ]) {
      const changed = clone(full);
      mutate(changed);
      if (!await expectReject(() => assertFixtureManifestComplete(changed, readAliasKey(directory)))) return false;
    }
    return true;
  });
  // Recompute the full unsealed digest chain: this negative must fail for
  // absent verified bindings, not merely a stale outer generation digest.
  let previousDigest = null;
  const legacy = trackRun(copyPrivateRunToLiveLookingDirectory(directory, (name, bytes) => {
    if (!name.startsWith("manifest-")) return bytes;
    const value = JSON.parse(bytes);
    value.bindingVerifications = [];
    value.previousGenerationDigest = previousDigest;
    value.generationDigest = sha256Hex(canonicalJson(Object.fromEntries(Object.entries(value).filter(([field]) => field !== "generationDigest"))));
    previousDigest = value.generationDigest;
    return Buffer.from(canonicalJson(value));
  }));
  await focused("fully populated legacy raw live manifest cannot complete", async () => expectReject(() => completeFixtureManifest(legacy)));
  await focused("unverified live manifest cannot seal", async () => expectReject(() => sealPrivateManifest(legacy)));
  await focused("full verified live fixture completes", async () => completeFixtureManifest(directory).manifest.lifecycle === "fixture_complete");
  await focused("full verified live fixture seals and rereads", async () => {
    sealPrivateManifest(directory);
    return loadLatestPrivateManifest(directory, { requireSealed: true }).bindingVerifications.length === 13;
  });
  await focused("self-test raw fixture population retains only self_test_v1 provenance", async () => {
    populateSyntheticManifest(synthetic, state);
    sealPrivateManifest(synthetic);
    return loadLatestPrivateManifest(synthetic, { requireSealed: true }).bindingVerifications.every((item) =>
      item.runPurpose === "g5d4_self_test" && item.verificationProvenance === "self_test_v1");
  });
  const fresh = prepare();
  await focused("production live verifier and helper reject caller observations or adapters", async () =>
    await expectReject(() => verifyLiveFixtureAuthority(fresh, bindings[0], { readIdentityBaseline: () => ({}) })) &&
    await expectReject(() => bindVerifiedFixturePreparationAuthority(fresh, bindings[0], { zeroBaselineVerified: true })) &&
    await expectReject(() => verifyLiveFixtureAuthority(fresh, bindings[0])) &&
    loadLatestPrivateManifest(fresh).generation === 1);
  await focused("self-test public receipt factory cannot produce live provenance", async () =>
    await expectReject(() => createSelfTestFixtureVerification(fresh, bindings[0])) &&
    await expectReject(() => createSelfTestFixtureVerification(synthetic, bindings[0], { runPurpose: "g5d4_live" })));
  const other = prepare();
  await focused("receipt cannot cross runs even for exact same raw target", async () => {
    const receipt = await api.verifyLiveFixtureAuthority(fresh, bindings[0]);
    return expectReject(() => api.bindVerifiedLiveFixtureAuthority(other, bindings[0], receipt));
  });
  await focused("intervening successful binding during read prevents receipt issuance", async () => {
    const receipt = await api.verifyLiveFixtureAuthority(fresh, bindings[0]);
    const pendingB = api.verifyLiveFixtureAuthority(fresh, bindings[1]);
    api.bindVerifiedLiveFixtureAuthority(fresh, bindings[0], receipt);
    return expectReject(() => pendingB);
  });
  const malformed = [
    ["Auth exact identity presence", 0, (result) => { result.auth.present = false; }],
    ["Auth target mismatch", 0, (result) => { result.auth.userId = state.userB; }],
    ["profile absence", 0, (result) => { result.profile.count = 0; }],
    ["nonzero fresh baseline", 0, (result) => { result.baseline[0].count = 1; }],
    ["baseline missing table coverage", 0, (result) => { result.baseline[0].table = result.baseline[1].table; }],
    ["wrong identity role", 0, (result) => { result.fixtureRole = "fixture_b"; }],
    ["Provider absence", 2, (result) => { result.present = false; }],
    ["Provider wrong owner relation", 2, (result) => { result.dbBinding.userId = state.userB; }],
    ["Storage object absence", 4, (result) => { result.present = false; }],
    ["Storage wrong bucket", 4, (result) => { result.bucket = "script-audios"; }],
    ["Storage wrong DB locator", 4, (result) => { result.dbLocator.key = "private-other-object"; }],
    ["Storage wrong owner", 4, (result) => { result.dbLocator.userId = state.userB; }],
    ["recording missing current consent state", 4, (result) => { result.recordingState = null; }],
    ["request absence", 12, (result) => { result.count = 0; }],
    ["request wrong owner", 12, (result) => { result.userId = state.userB; }],
    ["request unconfirmed state", 12, (result) => { result.state = "requested"; }],
    ["request conflicts", 12, (result) => { result.conflictCount = 1; }],
    ["B request conflict", 12, (result) => { result.fixtureBRequestCount = 1; }]
  ];
  // All malformed read cases use an unbound resource slot with both identities
  // present, except baseline cases which use a fresh run.
  await api.helper.bindVerifiedFixturePreparationAuthority(fresh, bindings[1]);
  for (const [label, index, mutate] of malformed) {
    await focused(`read-only check rejects ${label}`, async () => {
      const isolated = await createIsolatedVerificationModule(state, (observations) => mutate(observations[index].result));
      const targetRun = index === 0 ? other : fresh;
      const before = loadLatestPrivateManifest(targetRun).generation;
      return await expectReject(() => isolated.helper.bindVerifiedFixturePreparationAuthority(targetRun, bindings[index])) &&
        loadLatestPrivateManifest(targetRun).generation === before &&
        Object.values(isolated.isolatedReadCounts).reduce((sum, count) => sum + count, 0) === 1;
    });
  }
  await focused("valid reader checks actually performed for every authority kind", async () =>
    ["readIdentityBaseline", "readProviderBinding", "readStorageBinding", "readDeletionRequest"].every((method) => api.isolatedReadCounts[method] > 0));
  const conflicts = [
    ["A/B identity substitution", 1, (value) => { value.userB = value.userA; }],
    ["A/B Provider substitution", 3, (value) => { value.providerBId = value.providerAId; }],
    ["A/B Storage substitution", 8, (value) => { value.targetsB[0] = clone(value.targetsA[0]); }],
    ["Storage bucket replacement", 4, (value) => { value.targetsA[0].key = "private-replacement-verified-object"; }]
  ];
  for (const [label, index, mutate] of conflicts) {
    await focused(`verified evidence still rejects ${label}`, async () => {
      const conflictRun = prepare();
      for (const binding of bindings.slice(0, index === 4 ? 5 : index)) {
        await api.helper.bindVerifiedFixturePreparationAuthority(conflictRun, binding);
      }
      const changed = clone(state);
      mutate(changed);
      const conflictingApi = await createIsolatedVerificationModule(changed);
      const before = loadLatestPrivateManifest(conflictRun).generation;
      return await expectReject(() => conflictingApi.helper.bindVerifiedFixturePreparationAuthority(conflictRun, fixtureBindings(changed)[index])) &&
        Object.values(conflictingApi.isolatedReadCounts).reduce((sum, count) => sum + count, 0) === 1 &&
        loadLatestPrivateManifest(conflictRun).generation === before;
    });
  }
  process.stdout.write(`G5D4_VERIFIED_BINDING_FOCUSED_PASS ${number - 83}/${number - 83}\n`);
}

// Reproduce the reviewed same-object TOCTOU: every field returns the original
// receipt for the canonical comparison, then a caller-re-signed substitution
// for the later parse. The old implementation can persist the unverified B.
function installReceiptSubstitution(receipt, directory, binding, substitute) {
  const manifest = loadLatestPrivateManifest(directory);
  const key = readAliasKey(directory);
  const owner = (value) => value.kind === "identity" ? value.userId
    : manifest.rawAuthorities[value.fixtureRole === "fixture_b" ? "fixtureBUserId" : "fixtureAUserId"];
  const original = Object.keys(receipt).length ? clone(receipt) : {
    schemaVersion: "g5d4.fixture-verification.v2", runId: manifest.runId, runPurpose: manifest.runPurpose,
    verificationProvenance: G5D4_PROVENANCE.live.collector,
    generation: manifest.generation, generationDigest: manifest.generationDigest,
    fixtureRole: binding.fixtureRole ?? "fixture_a", kind: binding.kind,
    targetDigest: hmacSha256Hex(key, "fixture-binding-target", binding),
    ownerDigest: hmacSha256Hex(key, "fixture-binding-owner", owner(binding)),
    relationDigest: "0".repeat(64), recordingScriptDigest: null, humanRecordingCheckpoint: null,
    verifiedState: binding.kind === "identity" ? "fresh_zero_baseline"
      : binding.kind === "request" ? "confirmed_no_conflict" : "present_owned",
    verifiedCount: 1, verifiedAt: INSTANT
  };
  const forged = { ...original,
    targetDigest: hmacSha256Hex(key, "fixture-binding-target", substitute),
    ownerDigest: hmacSha256Hex(key, "fixture-binding-owner", owner(substitute)) };
  forged.integrityMac = hmacSha256Hex(key, "fixture-binding-verification",
    Object.fromEntries(Object.entries(forged).filter(([field]) => field !== "integrityMac")));
  let getterReads = 0;
  let installed = 0;
  for (const field of Object.keys(forged)) {
    let reads = 0;
    if (Reflect.defineProperty(receipt, field, { enumerable: true, configurable: true,
      get() { getterReads += 1; return reads++ === 0 ? original[field] : forged[field]; }
    })) installed += 1;
  }
  return { reads: () => getterReads, installed };
}

async function checkImmutableBindingSnapshot(state, trackRun) {
  let number = 145;
  const focused = (label, operation) => check(++number, label, operation);
  const bindings = fixtureBindings(state);
  const prepare = (purpose = G5D4_PROVENANCE.live.runPurpose) => {
    const directory = trackRun(createPrivateRunDirectory({ runPurpose: purpose }));
    createInitialPrivateManifest(directory, privateManifestInput(purpose));
    createAliasKey(directory);
    return directory;
  };
  const replacements = [
    [0, { ...bindings[0], userId: "private-unverified-user-b" }],
    [2, { ...bindings[2], resourceId: "private-unverified-provider-b" }],
    [4, { ...bindings[4], target: { ...bindings[4].target, key: "private-unverified-storage-b" } }],
    [12, { kind: "request", deletionRequestId: "private-unverified-request-b", deletionRequestRef: "private-unverified-ref-b" }]
  ];
  // First run the exact exploit against the normal returned key. Repeat with
  // a mutable key to prove private snapshot authority independently of freeze.
  for (const mutableReceipt of [false, true]) {
    const api = await createIsolatedVerificationModule(state, undefined, mutableReceipt);
    for (const [index, substitute] of replacements) {
      await focused(`${mutableReceipt ? "mutable-key snapshot" : "opaque receipt"} ${bindings[index].kind} stateful A-to-B substitution rejected`, async () => {
        const directory = prepare();
        for (const binding of bindings.slice(0, index === 0 ? 0 : 2)) {
          await api.helper.bindVerifiedFixturePreparationAuthority(directory, binding);
        }
        const binding = bindings[index];
        const receipt = await api.verifyLiveFixtureAuthority(directory, binding);
        const before = loadLatestPrivateManifest(directory);
        const attack = installReceiptSubstitution(receipt, directory, binding, substitute);
        if (!await expectReject(() => api.bindVerifiedLiveFixtureAuthority(directory, substitute, receipt)) ||
            loadLatestPrivateManifest(directory).generationDigest !== before.generationDigest) return false;
        const checkpoint = binding.kind === "storage" && binding.target.bucket === "recordings"
          ? await api.confirmLiveRecordingCheckpointFromTty(directory, binding, receipt) : undefined;
        const bound = api.bindVerifiedLiveFixtureAuthority(directory, binding, receipt, checkpoint).manifest;
        const metadata = bound.bindingVerifications.at(-1);
        const raw = bound.rawAuthorities;
        const persisted = binding.kind === "identity" ? { ...binding, userId: raw.fixtureAUserId }
          : binding.kind === "provider" ? { ...binding, resourceId: raw.fixtureAProviderResourceId }
          : binding.kind === "storage" ? { ...binding, target: raw.fixtureAStorageTargets[0] }
          : { kind: "request", deletionRequestId: raw.deletionRequestId, deletionRequestRef: raw.deletionRequestRef };
        return metadata.targetDigest === hmacSha256Hex(readAliasKey(directory), "fixture-binding-target", binding) &&
          metadata.targetDigest !== hmacSha256Hex(readAliasKey(directory), "fixture-binding-target", substitute) &&
          canonicalJson(persisted) === canonicalJson(binding) &&
          metadata.generationDigest === before.generationDigest && attack.reads() === 0 &&
          (mutableReceipt ? attack.installed > 0 : attack.installed === 0 && Object.isFrozen(receipt));
      });
    }
  }

  const api = await createIsolatedVerificationModule(state);
  const directory = prepare();
  const receiptA = await api.verifyLiveFixtureAuthority(directory, bindings[0]);
  const staleB = await api.verifyLiveFixtureAuthority(directory, bindings[1]);
  await focused("receipt is a frozen empty opaque identity", async () =>
    Object.isFrozen(receiptA) && Object.getPrototypeOf(receiptA) === null && Reflect.ownKeys(receiptA).length === 0);
  await focused("copied receipt remains invalid in the issuing module", async () =>
    expectReject(() => api.bindVerifiedLiveFixtureAuthority(directory, bindings[0], clone(receiptA))));
  await focused("Proxy-wrapped receipt is rejected without inspecting caller properties", async () => {
    let reads = 0;
    const proxy = new Proxy(receiptA, { get() { reads += 1; throw new Error("unexpected receipt read"); },
      ownKeys() { reads += 1; throw new Error("unexpected receipt enumeration"); } });
    return await expectReject(() => api.bindVerifiedLiveFixtureAuthority(directory, bindings[0], proxy)) && reads === 0;
  });
  await focused("nested read-result arrays and objects cannot change verified relation digest", async () => {
    const observation = api.isolatedReadResults[0];
    const relationDigest = hmacSha256Hex(readAliasKey(directory), "fixture-binding-relations", observation);
    observation.auth.userId = "private-unverified-user";
    observation.profile.count = 2;
    observation.baseline[0].count = 9;
    observation.baseline.push({ table: "private-added-table", count: 1 });
    const manifest = api.bindVerifiedLiveFixtureAuthority(directory, bindings[0], receiptA).manifest;
    return manifest.rawAuthorities.fixtureAUserId === state.userA && manifest.bindingVerifications.at(-1).relationDigest === relationDigest;
  });
  await focused("successful snapshot capability remains single-use", async () =>
    expectReject(() => api.bindVerifiedLiveFixtureAuthority(directory, bindings[0], receiptA)));
  await focused("intervening generation invalidates an unused immutable snapshot", async () =>
    expectReject(() => api.bindVerifiedLiveFixtureAuthority(directory, bindings[1], staleB)));
  await focused("self-test opaque snapshot cannot enter the live registry", async () => {
    const synthetic = api.createSelfTestFixtureVerification(prepare(G5D4_PROVENANCE.selfTest.runPurpose), bindings[1]);
    return await expectReject(() => api.bindVerifiedLiveFixtureAuthority(directory, bindings[1], synthetic)) &&
      loadLatestPrivateManifest(directory).generation === 2;
  });
  await api.helper.bindVerifiedFixturePreparationAuthority(directory, bindings[1]);
  for (const binding of bindings.slice(2, 4)) await api.helper.bindVerifiedFixturePreparationAuthority(directory, binding);
  await focused("caller nested Storage target and getter/Proxy mutations cannot change the snapshot", async () => {
    const target = clone(bindings[4].target);
    let reads = 0;
    const input = { ...bindings[4], target: new Proxy(target, { get(value, field) { reads += 1; return value[field]; } }) };
    const receipt = await api.verifyLiveFixtureAuthority(directory, input);
    const before = reads;
    Object.defineProperty(target, "key", { get: () => "private-unverified-nested-key" });
    const checkpoint = await api.confirmLiveRecordingCheckpointFromTty(directory, bindings[4], receipt);
    const manifest = api.bindVerifiedLiveFixtureAuthority(directory, bindings[4], receipt, checkpoint).manifest;
    return canonicalJson(manifest.rawAuthorities.fixtureAStorageTargets[0]) === canonicalJson(bindings[4].target) && reads === before;
  });
  for (const binding of bindings.slice(5)) await api.helper.bindVerifiedFixturePreparationAuthority(directory, binding);
  await focused("complete validates exact immutable snapshot targets and provenance for all bindings", async () => {
    const manifest = completeFixtureManifest(directory).manifest;
    return manifest.bindingVerifications.length === bindings.length && manifest.bindingVerifications.every((value, index) =>
      value.targetDigest === hmacSha256Hex(readAliasKey(directory), "fixture-binding-target", bindings[index]) &&
      value.verificationProvenance === G5D4_PROVENANCE.live.collector);
  });
  await focused("full snapshot-bound fixture seals and preserves all metadata on chain reread", async () => {
    const sealed = sealPrivateManifest(directory).manifest;
    return canonicalJson(loadLatestPrivateManifest(directory, { requireSealed: true })) === canonicalJson(sealed);
  });
  await focused("complete authority validation rejects all four substituted persisted bindings", async () => {
    for (const [index, substitute] of replacements) {
      const changed = clone(loadLatestPrivateManifest(directory));
      if (index === 0) changed.rawAuthorities.fixtureAUserId = substitute.userId;
      if (index === 2) changed.rawAuthorities.fixtureAProviderResourceId = substitute.resourceId;
      if (index === 4) changed.rawAuthorities.fixtureAStorageTargets[0] = substitute.target;
      if (index === 12) {
        changed.rawAuthorities.deletionRequestId = substitute.deletionRequestId;
        changed.rawAuthorities.deletionRequestRef = substitute.deletionRequestRef;
      }
      if (!await expectReject(() => assertFixtureManifestComplete(changed, readAliasKey(directory)))) return false;
    }
    return true;
  });
  await focused("caller-mutated keys complete and seal only the original verified fixture", async () => {
    const mutableApi = await createIsolatedVerificationModule(state, undefined, true);
    const attackedRun = prepare();
    const attacks = [];
    for (const [index, binding] of bindings.entries()) {
      const receipt = await mutableApi.verifyLiveFixtureAuthority(attackedRun, binding);
      const substitute = replacements.find(([targetIndex]) => targetIndex === index)?.[1];
      if (substitute) {
        attacks.push(installReceiptSubstitution(receipt, attackedRun, binding, substitute));
        if (!await expectReject(() => mutableApi.bindVerifiedLiveFixtureAuthority(attackedRun, substitute, receipt))) return false;
      }
      const checkpoint = binding.kind === "storage" && binding.target.bucket === "recordings"
        ? await mutableApi.confirmLiveRecordingCheckpointFromTty(attackedRun, binding, receipt) : undefined;
      mutableApi.bindVerifiedLiveFixtureAuthority(attackedRun, binding, receipt, checkpoint);
    }
    completeFixtureManifest(attackedRun);
    sealPrivateManifest(attackedRun);
    const manifest = loadLatestPrivateManifest(attackedRun, { requireSealed: true });
    return attacks.length === 4 && attacks.every((attack) => attack.reads() === 0) &&
      canonicalJson(manifest.rawAuthorities) === canonicalJson(loadLatestPrivateManifest(directory).rawAuthorities) &&
      manifest.bindingVerifications.every((value, index) =>
        value.targetDigest === hmacSha256Hex(readAliasKey(attackedRun), "fixture-binding-target", bindings[index]) &&
        value.verificationProvenance === G5D4_PROVENANCE.live.collector);
  });
  process.stdout.write(`G5D4_IMMUTABLE_SNAPSHOT_FOCUSED_PASS ${number - 145}/${number - 145}\n`);
}

async function checkHumanDecisionAndLiveReaders() {
  const userId = "11111111-1111-4111-8111-111111111111";
  const scriptId = "22222222-2222-4222-8222-222222222222";
  const id = "33333333-3333-4333-8333-333333333333";
  const key = `${userId}/${scriptId}/${id}.wav`;
  const raw = Object.fromEntries(G5D4_A_PREP_TABLE_CONTRACT.map(({ table }) => [table, []]));
  const row = { id, owner_id: userId, created_at: INSTANT, updated_at: null, status: null };
  raw.profiles = [{ ...row, id: userId }];
  raw.scripts = [{ ...row, id: scriptId }];
  raw.processing_consents = [{ ...row, consent_type: "pronunciation_processing", consent_version: "2026-08-22.v1",
    purpose_id: "pronunciation_processing", purpose_version: "v1", provider_set: ["openai", "azure"],
    data_categories: ["recorded_audio", "transcript", "pronunciation_result"], status: "active", accepted_at: INSTANT, withdrawn_at: null }];
  raw.voice_asset_write_intents = [{ ...row, kind: "recording_upload", status: "completed", script_id: scriptId,
    storage_bucket: "recordings", storage_object_key: key }];
  const objects = [{ id, bucket_id: "recordings", name: key, owner_id: null,
    created_at: INSTANT, updated_at: INSTANT, version: "v1", size: "4", content_type: "audio/wav", etag: "etag" }];
  const env = { NEXT_PUBLIC_SUPABASE_URL: "https://ztlliqishddrrvqqrrlu.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "synthetic-only",
    ELEVENLABS_API_KEY: "synthetic-only", SUPABASE_ACCESS_TOKEN: `sbp_${"1".repeat(40)}` };
  async function isolated(options = {}) {
    let source = readFileSync(join(ROOT, "scripts/g5d4-live-read-only-adapters.mjs"), "utf8");
    source = source.replace('const ROOT = resolve(new URL("..", import.meta.url).pathname);', `const ROOT = ${JSON.stringify(ROOT)};`)
      .replaceAll('"zod"', JSON.stringify(import.meta.resolve("zod")))
      .replaceAll('"dotenv"', JSON.stringify(import.meta.resolve("dotenv")))
      .replaceAll('"./g5d4-proof-contract.mjs"', JSON.stringify(new URL("./g5d4-proof-contract.mjs", import.meta.url).href))
      .replace('  const file = join(ROOT, ".env.local");\n  const env = { ...(existsSync(file) ? dotenv.parse(readFileSync(file)) : {}), ...process.env };',
        `  const env = ${canonicalJson({ ...env, ...options.env })};`);
    const state = { raw: clone(raw), objects: clone(objects), history: G5D4_REQUIRED_MIGRATIONS,
      project: { id: G5D4_CANONICAL_STAGING.projectRef, name: "native-minute-staging", region: "ap-northeast-1", status: "ACTIVE_HEALTHY" }, ...options.state };
    source = source.replace(/async function request\(url, headers, body\) \{[\s\S]*?\n\}/, `async function request(url, headers, body) {
      isolatedCalls.push({url, body});
      let value;
      if (url.endsWith('/database/query/read-only')) {
        if (!body.query.startsWith('select ') || /\\b(insert|update|delete|upsert|call|grant|alter|create)\\b/i.test(body.query)) throw new Error('non SELECT query');
        if (body.query.includes('supabase_migrations.schema_migrations')) value=isolatedState.history.map(version=>({version}));
        else if (body.query.includes('has_table_privilege')) value=[{writer_select:true,reader_role:'supabase_read_only_user'}];
        else if (body.query.includes('storage.objects')) value=body.query.includes('where false')?[]:isolatedState.objects;
        else if (body.query.includes('jsonb_build_object')) value=[{owned:body.query.includes('where false')?Object.fromEntries(Object.keys(isolatedState.raw).map(name=>[name,[]])):isolatedState.raw}];
        else throw new Error('unknown query');
      } else if (url === 'https://api.supabase.com/v1/projects/${G5D4_CANONICAL_STAGING.projectRef}') value=isolatedState.project;
      else if (url.endsWith('/auth/v1/admin/users/${userId}')) value={id:'${userId}',email:'fixture@example.test',email_confirmed_at:'${INSTANT}',app_metadata:{provider:'email'},identities:[{identity_id:'${id}',user_id:'${userId}',provider:'email'}]};
      else if (url.endsWith('/auth/v1/settings')) value={};
      else if (url.endsWith('/storage/v1/bucket')) value=${canonicalJson(G5D4_STORAGE_BUCKETS.map((id) => ({ id, public: false })))};
      else throw new Error('unexpected endpoint');
      return {json:async()=>structuredClone(value)};
    }`);
    source += `\nexport const isolatedCalls=[];\nexport const isolatedState=${canonicalJson(state)};\nexport {recordingState, bindingStorage, validateOwnedRows, storageRows, ownedRowsQuery, storageQuery, databaseSnapshot, FIELDS};\n// instance ${++isolatedModuleSequence}\n`;
    return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  }
  let n = 166;
  const focused = async (name, test) => check(n++, name, test);
  const api = await isolated();
  await focused("Human Decision current-state recording accepted without historical origin artifact", async () => {
    const observation = api.bindingStorage(raw, objects, { fixtureRole: "fixture_a", userId, bucket: "recordings", key });
    return observation.recordingState.writerStatus === "completed" && !('recordingContract' in observation) && !('directStorageBypassUsed' in observation);
  });
  for (const [label, mutate] of [
    ["missing pronunciation consent", (r) => { r.processing_consents = []; }],
    ["withdrawn pronunciation consent", (r) => { r.processing_consents[0].status = "withdrawn"; }],
    ["stale consent version", (r) => { r.processing_consents[0].consent_version = "obsolete"; }],
    ["consent provider set", (r) => { r.processing_consents[0].provider_set = []; }],
    ["wrong recording owner", (r) => { r.voice_asset_write_intents[0].owner_id = id; }],
    ["wrong recording script", (r) => { r.scripts[0].id = id; }],
    ["writer script mismatch", (r) => { r.voice_asset_write_intents[0].script_id = id; }],
    ["writer kind mismatch", (r) => { r.voice_asset_write_intents[0].kind = "voice_sample_upload"; }],
    ["incomplete writer", (r) => { r.voice_asset_write_intents[0].status = "reserved"; }],
    ["writer Storage locator", (r) => { r.voice_asset_write_intents[0].storage_object_key = "wrong"; }],
    ["duplicate writer", (r) => { r.voice_asset_write_intents.push(clone(r.voice_asset_write_intents[0])); }],
    ["mismatched take", (r) => { r.takes = [{ ...row, script_id: scriptId, audio_path: "wrong" }]; }]
  ]) await focused(`recording reconciliation rejects ${label}`, async () => {
    const changed = clone(raw); mutate(changed);
    return expectReject(() => api.recordingState(changed, objects, userId, key));
  });
  for (const [label, changed] of [["missing", []], ["wrong", [{ ...objects[0], name: "wrong" }]], ["duplicate", [...objects, ...objects]]]) {
    await focused(`recording reconciliation rejects ${label} Storage object`, async () => expectReject(() => api.recordingState(raw, changed, userId, key)));
  }
  await focused("Storage list rejects foreign owner and malformed owned prefix", async () =>
    await expectReject(() => api.storageRows([{ ...objects[0], owner_id: id }], userId)) &&
    await expectReject(() => api.storageRows([{ ...objects[0], name: `${id}/wrong` }], userId)));
  const preparation = { schemaVersion: "g5d4.fixture-preparation.v1", state: "consent_sample_material_verified",
    completedCheckpoints: [], nextCheckpoint: "normal_recordings_verified", humanActionRequired: true, destructiveExecutionAuthorized: false };
  const evidence = { fixtureARecordingPresent: true, fixtureBRecordingPresent: true, recordingContract: "consent_gated_web",
    humanCanonicalWebSuccessObserved: true, immediateReadOnlyReconciliationVerified: true, directStorageBypassUsed: false };
  await focused("accepted Human Web checkpoint remains procedure-only and non-destructive", async () =>
    advanceFixturePreparation(preparation, "normal_recordings_verified", evidence).destructiveExecutionAuthorized === false);
  for (const field of ["humanCanonicalWebSuccessObserved", "immediateReadOnlyReconciliationVerified"]) {
    await focused(`Human checkpoint requires ${field}`, async () => {
      const changed = { ...evidence }; delete changed[field];
      return expectReject(() => advanceFixturePreparation(preparation, "normal_recordings_verified", changed));
    });
  }
  await focused("Human Decision rejects direct fixture upload and Mobile procedure substitution", async () =>
    await expectReject(() => advanceFixturePreparation(preparation, "normal_recordings_verified", { ...evidence, directStorageBypassUsed: true })) &&
    await expectReject(() => advanceFixturePreparation(preparation, "normal_recordings_verified", { ...evidence, recordingContract: "consent_gated_mobile" })) &&
    assertFixturePreparationHasNoUnsafeAutomation(readFileSync(join(ROOT, "scripts/g5d4-fixture-prepare.mjs"), "utf8")));
  for (const [label, env] of [["Production", { NATIVE_MINUTE_PRODUCTION_GUARD: "1" }], ["ref", { NEXT_PUBLIC_SUPABASE_URL: "https://other.invalid" }], ["destructive guard", { NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE: "1" }]]) {
    await focused(`${label} rejected before any target read`, async () => {
      const isolatedApi = await isolated({ env });
      return await expectReject(() => isolatedApi.createLiveReadOnlyAdapters().reader.readStorageBinding({ fixtureRole: "fixture_a", userId, bucket: "recordings", key })) && isolatedApi.isolatedCalls.length === 0;
    });
  }
  for (const field of ["id", "name", "region", "status"]) {
    await focused(`project ${field} mismatch rejected before SQL/Auth/Storage reads`, async () => {
      const isolatedApi = await isolated(); isolatedApi.isolatedState.project[field] = "mismatch";
      return await expectReject(() => isolatedApi.createLiveReadOnlyAdapters().smoke()) && isolatedApi.isolatedCalls.length === 1;
    });
  }
  await focused("migration mismatch rejected before fixture data access", async () => {
    const isolatedApi = await isolated({ state: { history: ["0001"] } });
    return await expectReject(() => isolatedApi.createLiveReadOnlyAdapters().smoke()) && isolatedApi.isolatedCalls.length === 2;
  });
  await focused("read-only live adapter exact capability surface and injection rejection", async () => {
    const live = api.createLiveReadOnlyAdapters();
    return assertReadOnlyCollectorAdapters(live.adapters) && Object.values(live.adapters).every(Object.isFrozen) &&
      Object.isFrozen(live.reader) && await expectReject(() => api.createLiveReadOnlyAdapters({ db: {} }));
  });
  await focused("isolated live reader reconciles actual recording projection", async () => {
    const result = await api.createLiveReadOnlyAdapters().reader.readStorageBinding({ fixtureRole: "fixture_a", userId, bucket: "recordings", key });
    return result.recordingState.scriptId === scriptId && result.recordingState.writerKey === key;
  });
  await focused("identity reader verifies exact Auth/profile/17 zero baseline and empty Storage", async () => {
    const baseline = clone(raw);
    for (const name of Object.keys(baseline)) if (name !== "profiles") baseline[name] = [];
    const isolatedApi = await isolated({ state: { raw: baseline, objects: [] } });
    const result = await isolatedApi.createLiveReadOnlyAdapters().reader.readIdentityBaseline({ fixtureRole: "fixture_a", userId });
    return result.auth.confirmed && result.profile.count === 1 && result.baseline.length === 17 && result.baseline.every((row) => row.count === 0);
  });
  await focused("bounded smoke uses no fixture identity, Provider resource or mutation endpoint", async () => {
    const isolatedApi = await isolated(); const result = await isolatedApi.createLiveReadOnlyAdapters().smoke();
    return result.fixturePass === false && result.mutations === 0 && isolatedApi.isolatedCalls.length === 7 &&
      isolatedApi.isolatedCalls.every(({ url, body }) => body === undefined || url.endsWith('/database/query/read-only')) &&
      !isolatedApi.isolatedCalls.some(({ url }) => url.includes('elevenlabs') || url.includes('/admin/users'));
  });
  await focused("static SELECT owner parameters reject SQL injection", async () =>
    await expectReject(() => api.ownedRowsQuery("'; delete from public.profiles; --")) &&
    await expectReject(() => api.storageQuery("'; select 1; --")));
  const full = clone(raw);
  full.processing_consents.push({ ...row, consent_type: "voice_cloning", consent_version: "2026-08-22.v1",
    purpose_id: "voice_cloning", purpose_version: "v1", provider_set: ["elevenlabs"],
    data_categories: ["voice_sample", "consent_recording", "cloned_voice", "reference_audio"], status: "active", accepted_at: INSTANT, withdrawn_at: null });
  for (const kind of G5D4_WRITER_INTENT_KINDS.filter((kind) => kind !== "recording_upload")) full.voice_asset_write_intents.push({ ...row, kind, status: "completed" });
  for (const name of ["takes", "weak_words", "coach_feedback", "script_audios", "voices", "voice_consents", "quota_events"]) full[name] = [{ ...row }];
  full.voices[0].provider = "elevenlabs"; full.voices[0].provider_voice_id = "A".repeat(20);
  await focused("live DB projection retains B16/A17/A22 and exact 18 category contract", async () => {
    const schema = await import("./g5d4-proof-contract.mjs");
    const total = (snapshot) => schema.g5d4PrivateDatabaseSnapshotSchema.parse(snapshot).tables.reduce((sum, table) => sum + table.rows.length, 0);
    if (total(api.databaseSnapshot(full, objects, userId)) !== 16) return false;
    full.account_deletion_requests = [{ ...row, status: "confirmed", confirmed_at: INSTANT, provider_snapshot_status: "pending", storage_snapshot_status: "pending", provider_snapshot_target_count: 0, storage_snapshot_target_count: 0 }];
    if (total(api.databaseSnapshot(full, objects, userId, id)) !== 17) return false;
    Object.assign(full.account_deletion_requests[0], { provider_snapshot_status: "sealed", storage_snapshot_status: "sealed", provider_snapshot_target_count: 1, storage_snapshot_target_count: 4 });
    full.account_deletion_provider_targets = [{ ...row, deletion_request_id: id, source_voice_id: id, provider_name: "elevenlabs", provider_resource_id: "A".repeat(20), status: "pending", delete_outcome: "not_attempted" }];
    const stored = G5D4_STORAGE_BUCKETS.map((bucket_id) => ({ ...objects[0], bucket_id }));
    full.account_deletion_storage_targets = stored.map((object) => ({ ...row, deletion_request_id: id, storage_bucket: object.bucket_id, storage_object_key: object.name, status: "pending", delete_outcome: "not_attempted" }));
    const snapshot = api.databaseSnapshot(full, stored, userId, id);
    return total(snapshot) === 22 && canonicalJson(snapshot.tables.map(({table,category,rows})=>({table,category,count:rows.length}))) === canonicalJson(G5D4_A_SEALED_TABLE_CONTRACT);
  });
  await focused("live DB rejects substituted durable target before accepting count-only evidence", async () => {
    const stored = G5D4_STORAGE_BUCKETS.map((bucket_id) => ({ ...objects[0], bucket_id }));
    const providerWrong = clone(full); providerWrong.account_deletion_provider_targets[0].provider_resource_id = "B".repeat(20);
    const storageWrong = clone(full); storageWrong.account_deletion_storage_targets[0].storage_object_key = "wrong";
    return await expectReject(() => api.databaseSnapshot(providerWrong, stored, userId, id)) &&
      await expectReject(() => api.databaseSnapshot(storageWrong, stored, userId, id));
  });
  await focused("proof current-consent version remains aligned with product authority", async () => {
    const source = readFileSync(join(ROOT,"services/consent/consent.service.ts"),"utf8");
    return source.includes('CURRENT_PRONUNCIATION_CONSENT_VERSION = "2026-08-22.v1"') &&
      source.includes('CURRENT_VOICE_CLONING_CONSENT_VERSION = "2026-08-22.v1"');
  });
  await focused("every live SELECT projection field exists in canonical DB types", async () => {
    const source = readFileSync(join(ROOT, "types/database.ts"), "utf8");
    for (const [table, fields] of Object.entries(api.FIELDS)) {
      const start = source.indexOf(`      ${table}: {\n        Row: {`);
      if (start < 0) return false;
      const body = source.slice(start, source.indexOf("\n        };", start));
      for (const field of fields) if (!body.includes(`          ${field}:`)) return false;
    }
    return true;
  });
  process.stdout.write(`G5D4_HUMAN_DECISION_LIVE_READER_FOCUSED_PASS ${n - 166}/${n - 166}\n`);
}

async function checkRecordingCheckpointAcceptance(state, trackRun, bypassOnly = false) {
  let number = 203;
  const focused = (label, operation) => check(++number, label, operation);
  const bindings = fixtureBindings(state);
  const a = bindings[4];
  const b = bindings[8];
  const prepare = async (api, purpose = G5D4_PROVENANCE.live.runPurpose) => {
    const directory = trackRun(createPrivateRunDirectory({ runPurpose: purpose }));
    createInitialPrivateManifest(directory, privateManifestInput(purpose));
    createAliasKey(directory);
    for (const binding of bindings.slice(0, 2)) {
      if (purpose === G5D4_PROVENANCE.live.runPurpose) await api.helper.bindVerifiedFixturePreparationAuthority(directory, binding);
      else bindFixtureManifestAuthority(directory, binding);
    }
    return directory;
  };

  // Exact reviewed bypass: every required machine binding, zero Human calls.
  // Only the legacy source copy can populate it; acceptance uses the real module.
  const legacy = await createIsolatedVerificationModule(state, undefined, false, { legacyMachineOnly: true });
  const legacyDirectory = await prepare(legacy);
  for (const binding of bindings.slice(2)) {
    const receipt = await legacy.verifyLiveFixtureAuthority(legacyDirectory, binding);
    legacy.bindVerifiedLiveFixtureAuthority(legacyDirectory, binding, receipt);
  }
  const legacyFull = legacy.loadLatestPrivateManifest(legacyDirectory);
  await focused("previous bypass has 13 machine bindings and exactly zero Human recording calls", async () =>
    legacyFull.bindingVerifications.length === 13 && legacy.isolatedHumanPrompts.length === 0 &&
    legacyFull.bindingVerifications.every((item) => item.humanRecordingCheckpoint === null));
  await focused("previous bypass fixture_complete REJECT with all machine bindings populated", async () =>
    expectReject(() => completeFixtureManifest(legacyDirectory)));
  await focused("previous bypass seal REJECT with zero Human checkpoints", async () =>
    expectReject(() => sealPrivateManifest(legacyDirectory)));
  legacy.completeFixtureManifest(legacyDirectory);
  await focused("seal independently rejects legacy fixture_complete lacking A/B checkpoints", async () =>
    expectReject(() => sealPrivateManifest(legacyDirectory)));
  process.stdout.write("G5D4_PREVIOUS_BYPASS_REPRODUCTION_PASS human_checkpoint_calls=0 machine_bindings=13 fixture_complete=REJECT seal=REJECT\n");
  if (bypassOnly) return;

  const api = await createIsolatedVerificationModule(state);
  const directory = await prepare(api);
  const receiptA = await api.verifyLiveFixtureAuthority(directory, a);
  const receiptB = await api.verifyLiveFixtureAuthority(directory, b);
  await focused("machine reconciliation PASS alone rejects recording acceptance", async () =>
    expectReject(() => api.bindVerifiedLiveFixtureAuthority(directory, a, receiptA)));
  for (const value of [true, { confirmed: true }, { provenance: "human_web_recording_tty_live_v1" }]) {
    await focused("caller boolean or metadata cannot supply live checkpoint capability", async () =>
      expectReject(() => api.bindVerifiedLiveFixtureAuthority(directory, a, receiptA, value)));
  }
  await focused("confirmation rejects caller stream/phrase/env-style overrides", async () =>
    expectReject(() => api.confirmLiveRecordingCheckpointFromTty(directory, a, receiptA, {
      input: createFakeTty().input, phrase: G5D4_RECORDING_CONFIRMATION_PHRASE, confirmed: true
    })));
  const checkpointA = await api.confirmLiveRecordingCheckpointFromTty(directory, a, receiptA);
  await focused("Human checkpoint is opaque immutable and emits only safe run/role/recording/script", async () => {
    const text = api.isolatedHumanPrompts.join("\n");
    return Object.isFrozen(checkpointA) && Reflect.ownKeys(checkpointA).length === 0 &&
      text.includes("fixture_a") && text.includes("g5d4_v1") &&
      ![state.userA, state.userB, a.target.key, "private-script"].some((raw) => text.includes(raw));
  });
  await focused("same verification cannot silently issue a replacement checkpoint", async () =>
    expectReject(() => api.confirmLiveRecordingCheckpointFromTty(directory, a, receiptA)));
  await focused("A checkpoint cannot satisfy B role/owner/recording", async () =>
    expectReject(() => api.bindVerifiedLiveFixtureAuthority(directory, b, receiptB, checkpointA)));
  await focused("recording A checkpoint cannot switch exact recording candidate", async () =>
    expectReject(() => api.bindVerifiedLiveFixtureAuthority(directory,
      { ...a, target: { ...a.target, key: "private-other-recording" } }, receiptA, checkpointA)));
  await focused("wrong role assertion rejects even with original recording capability", async () =>
    expectReject(() => api.bindVerifiedLiveFixtureAuthority(directory, { ...a, fixtureRole: "fixture_b" }, receiptA, checkpointA)));
  const other = await prepare(api);
  const otherReceipt = await api.verifyLiveFixtureAuthority(other, a);
  await focused("run A checkpoint cannot satisfy same recording in run B", async () =>
    expectReject(() => api.bindVerifiedLiveFixtureAuthority(other, a, otherReceipt, checkpointA)));
  const secondReceiptA = await api.verifyLiveFixtureAuthority(directory, a);
  await focused("checkpoint cannot attach to another machine observation of the same candidate", async () =>
    expectReject(() => api.bindVerifiedLiveFixtureAuthority(directory, a, secondReceiptA, checkpointA)));
  await focused("copied/Proxy checkpoint cannot enter live capability registry", async () =>
    await expectReject(() => api.bindVerifiedLiveFixtureAuthority(directory, a, receiptA, clone(checkpointA))) &&
    await expectReject(() => api.bindVerifiedLiveFixtureAuthority(directory, a, receiptA, new Proxy(checkpointA, {
      get() { throw new Error("must not read caller checkpoint"); }
    }))));
  const synthetic = await prepare(api, G5D4_PROVENANCE.selfTest.runPurpose);
  const syntheticReceipt = api.createSelfTestFixtureVerification(synthetic, a);
  const syntheticCheckpoint = api.createSelfTestRecordingCheckpoint(synthetic, a, syntheticReceipt);
  await focused("self_test_v1 checkpoint cannot satisfy valid live machine receipt", async () =>
    expectReject(() => api.bindVerifiedLiveFixtureAuthority(directory, a, receiptA, syntheticCheckpoint)));
  await focused("self-test factory cannot mint checkpoint for live run", async () =>
    await expectReject(() => api.createSelfTestRecordingCheckpoint(directory, a, receiptA)) &&
    await expectReject(() => createSelfTestRecordingCheckpoint(directory, a, receiptA)));
  await focused("live confirmation rejects self-test run/capability", async () =>
    expectReject(() => api.confirmLiveRecordingCheckpointFromTty(synthetic, a, syntheticReceipt)));
  const failedApi = await createIsolatedVerificationModule(state, (observations) => {
    observations[4].result.recordingState.consentStatus = "withdrawn";
  });
  await focused("Human checkpoint alone with failed machine reconciliation rejects", async () =>
    await expectReject(() => failedApi.verifyLiveFixtureAuthority(directory, a)) &&
    await expectReject(() => failedApi.bindVerifiedLiveFixtureAuthority(directory, a, undefined, checkpointA)) &&
    failedApi.isolatedHumanPrompts.length === 0);
  await focused("A matching live-profile Human and machine inputs accept exact A recording", async () => {
    const result = api.bindVerifiedLiveFixtureAuthority(directory, a, receiptA, checkpointA).manifest;
    return result.bindingVerifications.at(-1).humanRecordingCheckpoint.provenance === "human_web_recording_tty_live_v1" &&
      canonicalJson(result.rawAuthorities.fixtureAStorageTargets) === canonicalJson([a.target]);
  });
  await focused("consumed A checkpoint cannot be reused for B after fresh B reconciliation", async () => {
    const freshB = await api.verifyLiveFixtureAuthority(directory, b);
    return expectReject(() => api.bindVerifiedLiveFixtureAuthority(directory, b, freshB, checkpointA));
  });
  await focused("B helper performs machine then explicit narrow Human input then bind", async () => {
    const result = await api.helper.bindVerifiedFixturePreparationAuthority(directory, b);
    return result.manifest.bindingVerifications.at(-1).humanRecordingCheckpoint.fixtureRole === "fixture_b" &&
      api.isolatedHumanPrompts.length === 2;
  });
  for (const binding of bindings.slice(2).filter((value) => value !== a && value !== b)) {
    await api.helper.bindVerifiedFixturePreparationAuthority(directory, binding);
  }
  const full = loadLatestPrivateManifest(directory);
  const checkpointEntries = full.bindingVerifications.filter((entry) => entry.humanRecordingCheckpoint);
  await focused("A+B valid checkpoint fixture completes with unchanged thirteen bindings", async () =>
    checkpointEntries.length === 2 && completeFixtureManifest(directory).manifest.lifecycle === "fixture_complete");
  await focused("valid completed fixture seals without inventing Human metadata", async () => {
    const sealed = sealPrivateManifest(directory).manifest;
    return canonicalJson(sealed.bindingVerifications) === canonicalJson(full.bindingVerifications) &&
      loadLatestPrivateManifest(directory, { requireSealed: true }).lifecycle === "sealed";
  });

  // Re-signing the enclosing verification cannot hide a checkpoint mismatch.
  // This exercises complete/seal's semantic checks independently of outer hashes.
  const key = readAliasKey(directory);
  const resignVerification = (entry) => {
    entry.integrityMac = hmacSha256Hex(key, "fixture-binding-verification",
      Object.fromEntries(Object.entries(entry).filter(([field]) => field !== "integrityMac")));
  };
  const mutations = [
    ["missing A checkpoint", (entry) => { entry.humanRecordingCheckpoint = null; }],
    ["duplicate A checkpoint used for B", (entry) => { entry.humanRecordingCheckpoint = clone(checkpointEntries[0].humanRecordingCheckpoint); }, 1],
    ["wrong script", (entry) => { entry.humanRecordingCheckpoint.scriptDigest = "0".repeat(64); }],
    ["wrong role", (entry) => { entry.humanRecordingCheckpoint.fixtureRole = "fixture_b"; }],
    ["wrong run", (entry) => { entry.humanRecordingCheckpoint.runId = "g5d4_run_" + "0".repeat(32); }],
    ["wrong recording alias", (entry) => { entry.humanRecordingCheckpoint.recordingAlias = checkpointEntries[1].humanRecordingCheckpoint.recordingAlias; }],
    ["self-test provenance", (entry) => { entry.humanRecordingCheckpoint.provenance = "self_test_v1"; }],
    ["wrong generation", (entry) => { entry.humanRecordingCheckpoint.generation += 1; }],
    ["wrong manifest digest", (entry) => { entry.humanRecordingCheckpoint.generationDigest = "0".repeat(64); }],
    ["wrong machine observation", (entry) => { entry.humanRecordingCheckpoint.machineVerificationDigest = "0".repeat(64); }],
    ["tampered checkpoint MAC", (entry) => { entry.humanRecordingCheckpoint.integrityMac = "0".repeat(64); }],
    ["Human timestamp before machine", (entry) => { entry.humanRecordingCheckpoint.confirmedAt = INSTANT; }],
    ["Human timestamp beyond immediate window", (entry) => {
      entry.humanRecordingCheckpoint.confirmedAt = new Date(Date.parse(entry.verifiedAt) + G5D4_RECORDING_CHECKPOINT_MAX_AGE_MS + 1).toISOString();
    }]
  ];
  for (const [label, mutate, index = 0] of mutations) {
    await focused(`complete/seal authority rejects ${label}`, async () => {
      const changed = clone(full);
      const entry = changed.bindingVerifications.filter((value) => value.humanRecordingCheckpoint)[index];
      mutate(entry);
      if (entry.humanRecordingCheckpoint && label !== "tampered checkpoint MAC") {
        entry.humanRecordingCheckpoint.integrityMac = hmacSha256Hex(key, "fixture-web-recording-checkpoint",
          Object.fromEntries(Object.entries(entry.humanRecordingCheckpoint).filter(([field]) => field !== "integrityMac")));
      }
      resignVerification(entry);
      return expectReject(() => assertFixtureManifestComplete(changed, key));
    });
  }
  await focused("later generation cannot replace a bound Human checkpoint", async () => {
    const before = loadAndVerifyManifestChain(directory).find((value) => value.lifecycle === "fixture_complete");
    const copy = trackRun(createPrivateRunDirectory({ runPurpose: G5D4_PROVENANCE.live.runPurpose }));
    for (const name of readdirSync(directory).filter((name) => name === "alias-key.bin" ||
      (/^manifest-/.test(name) && Number(name.slice(9, 15)) <= before.generation))) {
      atomicPublishPrivateFile(copy, name, readFileSync(join(directory, name)));
    }
    const next = { ...clone(before), generation: before.generation + 1, previousGenerationDigest: before.generationDigest,
      lifecycle: "sealed", sealed: true, manifestSealDigest: "0".repeat(64) };
    const entry = next.bindingVerifications.find((value) => value.humanRecordingCheckpoint);
    entry.humanRecordingCheckpoint.confirmedAt = new Date(Date.parse(entry.humanRecordingCheckpoint.confirmedAt) + 1).toISOString();
    entry.humanRecordingCheckpoint.integrityMac = hmacSha256Hex(key, "fixture-web-recording-checkpoint",
      Object.fromEntries(Object.entries(entry.humanRecordingCheckpoint).filter(([field]) => field !== "integrityMac")));
    resignVerification(entry);
    // Keep the seal and outer digest valid: rejection must come from the
    // immutable completion/seal transition, not merely an invalid seal MAC.
    next.manifestSealDigest = hmacSha256Hex(key, "manifest-seal", canonicalJson({
      ...Object.fromEntries(Object.entries(next).filter(([field]) => !["generationDigest", "manifestSealDigest"].includes(field))),
      manifestSealDigest: null
    }));
    next.generationDigest = sha256Hex(canonicalJson(Object.fromEntries(Object.entries(next).filter(([field]) => field !== "generationDigest"))));
    atomicPublishPrivateFile(copy, `manifest-${String(next.generation).padStart(6, "0")}.json`, canonicalJson(next));
    return expectReject(() => loadLatestPrivateManifest(copy));
  });

  const staleRun = await prepare(api);
  const staleReceipt = await api.verifyLiveFixtureAuthority(staleRun, a);
  const staleCheckpoint = await api.confirmLiveRecordingCheckpointFromTty(staleRun, a, staleReceipt);
  await api.helper.bindVerifiedFixturePreparationAuthority(staleRun, bindings[2]);
  await focused("intervening manifest generation rejects already issued Human checkpoint", async () =>
    expectReject(() => api.bindVerifiedLiveFixtureAuthority(staleRun, a, staleReceipt, staleCheckpoint)));
  const promptRun = await prepare(api);
  const promptReceipt = await api.verifyLiveFixtureAuthority(promptRun, a);
  api.isolatedHumanState.duringPrompt = () => api.helper.bindVerifiedFixturePreparationAuthority(promptRun, bindings[2]);
  await focused("manifest advancement during Human interaction rejects checkpoint issuance", async () =>
    expectReject(() => api.confirmLiveRecordingCheckpointFromTty(promptRun, a, promptReceipt)));
  delete api.isolatedHumanState.duringPrompt;
  const freshReceipt = await api.verifyLiveFixtureAuthority(promptRun, a);
  api.isolatedHumanState.phrase = G5D4_CONFIRMATION_PHRASE;
  await focused("destructive authorization phrase cannot confirm recording procedure", async () =>
    expectReject(() => api.confirmLiveRecordingCheckpointFromTty(promptRun, a, freshReceipt)));
  api.isolatedHumanState.phrase = "";
  await focused("empty or automatic default is never Human confirmation", async () =>
    expectReject(() => api.confirmLiveRecordingCheckpointFromTty(promptRun, a, freshReceipt)));
  api.isolatedHumanState.phrase = G5D4_RECORDING_CONFIRMATION_PHRASE;
  await focused("expired machine read cannot issue a Human checkpoint", async () => {
    const originalNow = Date.now;
    Date.now = () => originalNow() + G5D4_RECORDING_CHECKPOINT_MAX_AGE_MS + 1000;
    try { return await expectReject(() => api.confirmLiveRecordingCheckpointFromTty(promptRun, a, freshReceipt)); }
    finally { Date.now = originalNow; }
  });
  const realTtyApi = await createIsolatedVerificationModule(state, undefined, false, { realTty: true });
  const realTtyReceipt = await realTtyApi.verifyLiveFixtureAuthority(promptRun, a);
  await focused("actual production TTY reader rejects non-TTY automated process", async () =>
    !process.stdin.isTTY && !process.stdout.isTTY &&
    await expectReject(() => realTtyApi.confirmLiveRecordingCheckpointFromTty(promptRun, a, realTtyReceipt)));
  await focused("public live module cannot accept isolated synthetic machine/checkpoint handles", async () =>
    await expectReject(() => confirmLiveRecordingCheckpointFromTty(promptRun, a, freshReceipt)) &&
    await expectReject(() => bindVerifiedLiveFixtureAuthority(promptRun, a, freshReceipt, checkpointA)));
  await focused("self-test synthetic checkpoints complete and seal only with self_test_v1", async () => {
    for (const binding of bindings.slice(2)) bindFixtureManifestAuthority(synthetic, binding);
    completeFixtureManifest(synthetic);
    const sealed = sealPrivateManifest(synthetic).manifest;
    const checkpoints = sealed.bindingVerifications.flatMap((value) => value.humanRecordingCheckpoint ?? []);
    return checkpoints.length === 2 && checkpoints.every((value) => value.provenance === "self_test_v1" && value.runPurpose === "g5d4_self_test");
  });
  process.stdout.write(`G5D4_RECORDING_CHECKPOINT_FOCUSED_PASS ${number - 203}/${number - 203}\n`);
}

async function checkRecordingIdentitySeparation(state, trackRun) {
  let number = 251;
  const focused = (label, operation) => check(++number, label, operation);
  const currentState = "current_recording_identity_v1";
  const bindings = fixtureBindings(state);
  const identity = bindings[1]; const recording = bindings[8];
  const prepare = (purpose = G5D4_PROVENANCE.live.runPurpose) => {
    const directory = trackRun(createPrivateRunDirectory({ runPurpose: purpose }));
    createInitialPrivateManifest(directory, privateManifestInput(purpose)); createAliasKey(directory);
    return directory;
  };
  const nonzeroB = (observations) => {
    for (const row of observations[1].result.baseline) {
      row.count = ({ scripts: 1, takes: 1, weak_words: 4, coach_feedback: 1, voices: 1 })[row.table] ?? 0;
    }
  };
  const api = await createIsolatedVerificationModule(state, nonzeroB);
  const directory = prepare();
  // Separate synthetic historical evidence; no production API consumes it.
  const historical = { role: "fixture_b", environment: "canonical_staging", profile: 1,
    otherTables: 0, storage: 0, provider: 0, capturedAt: INSTANT };
  historical.mac = hmacSha256Hex(readAliasKey(directory), "synthetic-historical-baseline", historical);
  const bytes = canonicalJson(historical);
  const historyPath = atomicPublishPrivateFile(directory, "synthetic-historical-baseline.json", bytes);
  await focused("current nonzero B still rejects fresh-zero fixture verification", async () =>
    expectReject(() => api.verifyLiveFixtureAuthority(directory, identity)));
  const receipt = await api.verifyLiveCurrentRecordingIdentity(directory, identity);
  await focused("current B identity capability is opaque and does not read a current zero baseline", async () =>
    Object.isFrozen(receipt) && Reflect.ownKeys(receipt).length === 0 &&
    api.isolatedReadCounts.readCurrentRecordingIdentity === 1 && api.isolatedReadCounts.readIdentityBaseline === 1);
  await focused("current capability cannot enter fresh-zero bind", async () =>
    expectReject(() => api.bindVerifiedLiveFixtureAuthority(directory, identity, receipt)));
  const freshApi = await createIsolatedVerificationModule(state);
  const freshRun = prepare();
  const fresh = await freshApi.verifyLiveFixtureAuthority(freshRun, identity);
  await focused("fresh-zero capability cannot substitute current recording identity", async () =>
    expectReject(() => freshApi.bindVerifiedLiveRecordingCheckpointIdentity(freshRun, identity, fresh)));
  for (const [label, expected] of [
    ["wrong user", { ...identity, userId: state.userA }],
    ["wrong role", { ...identity, fixtureRole: "fixture_a" }],
    ["wrong kind", recording]
  ]) await focused(`${label} current identity bind rejected`, async () =>
    expectReject(() => api.bindVerifiedLiveRecordingCheckpointIdentity(directory, expected, receipt)));
  const otherRun = prepare();
  await focused("wrong run current identity bind rejected", async () =>
    expectReject(() => api.bindVerifiedLiveRecordingCheckpointIdentity(otherRun, identity, receipt)));
  const synthetic = prepare(G5D4_PROVENANCE.selfTest.runPurpose);
  const syntheticReceipt = api.createSelfTestCurrentRecordingIdentity(synthetic, identity);
  await focused("self-test current identity cannot bind live", async () =>
    expectReject(() => api.bindVerifiedLiveRecordingCheckpointIdentity(directory, identity, syntheticReceipt)));
  await focused("self-test issuer cannot mint from live run", async () =>
    expectReject(() => api.createSelfTestCurrentRecordingIdentity(directory, identity)));
  const real = await import("./g5d4-proof-private-state.mjs");
  await focused("source-isolated capability never escapes into actual live module", async () =>
    expectReject(() => real.bindVerifiedLiveRecordingCheckpointIdentity(directory, identity, receipt)));
  for (const [label, forged] of [["boolean", true], ["arbitrary JSON", { verified: true, verifiedState: currentState }],
    ["saved baseline JSON", historical], ["copied opaque capability", { ...receipt }]]) {
    await focused(`${label} cannot bind current identity`, async () =>
      expectReject(() => api.bindVerifiedLiveRecordingCheckpointIdentity(directory, identity, forged)));
  }
  await focused("saved baseline cannot be injected into verifier/helper/binder", async () =>
    await expectReject(() => api.verifyLiveCurrentRecordingIdentity(directory, identity, historical)) &&
    await expectReject(() => api.verifyLiveCurrentRecordingIdentity(directory, { ...identity, baseline: historical })) &&
    await expectReject(() => api.helper.bindCurrentRecordingCheckpointIdentity(directory, identity, historical)) &&
    await expectReject(() => api.bindVerifiedLiveRecordingCheckpointIdentity(directory, identity, receipt, historical)));
  const originalNow = Date.now;
  await focused("stale and future current identity capabilities reject", async () => {
    try {
      Date.now = () => originalNow() + G5D4_RECORDING_CHECKPOINT_MAX_AGE_MS + 1000;
      const stale = await expectReject(() => api.bindVerifiedLiveRecordingCheckpointIdentity(directory, identity, receipt));
      Date.now = () => originalNow() - 10000;
      return stale && await expectReject(() => api.bindVerifiedLiveRecordingCheckpointIdentity(directory, identity, receipt));
    } finally { Date.now = originalNow; }
  });
  for (const [label, mutate] of [
    ["unknown Auth", (r) => { r.auth.state = "unknown"; r.auth.evidence = null; }],
    ["absent Auth", (r) => { r.auth.state = "absent"; r.auth.evidence = null; }],
    ["wrong Auth identity", (r) => { r.auth.identity = state.userA; }],
    ["wrong observed owner", (r) => { r.userId = state.userA; }],
    ["wrong observed role", (r) => { r.fixtureRole = "fixture_a"; }],
    ["missing confirmation", (r) => { r.auth.evidence.confirmedAt = null; }],
    ["malformed ban", (r) => { r.auth.evidence.bannedUntil = "unknown"; }],
    ["active ban", (r) => { r.auth.evidence.bannedUntil = "2999-01-01T00:00:00.000Z"; }]
  ]) await focused(`${label} cannot issue current capability`, async () => {
    const bad = await createIsolatedVerificationModule(state, (rows) => {
      nonzeroB(rows); mutate(rows.find(r => r.method === "readCurrentRecordingIdentity" && r.query.fixtureRole === "fixture_b").result);
    });
    return expectReject(() => bad.verifyLiveCurrentRecordingIdentity(directory, identity));
  });
  const staleRun = prepare();
  const staleReceipt = await api.verifyLiveCurrentRecordingIdentity(staleRun, identity);
  await api.helper.bindVerifiedFixturePreparationAuthority(staleRun, bindings[0]);
  await focused("intervening manifest generation rejects current identity capability", async () =>
    expectReject(() => api.bindVerifiedLiveRecordingCheckpointIdentity(staleRun, identity, staleReceipt)));
  const duringReadRun = prepare();
  api.isolatedHumanState.duringRead = async () => {
    api.isolatedHumanState.duringRead = null;
    await api.helper.bindVerifiedFixturePreparationAuthority(duringReadRun, bindings[0]);
  };
  await focused("generation change during Auth read rejects issuance", async () =>
    expectReject(() => api.verifyLiveCurrentRecordingIdentity(duringReadRun, identity)));
  api.isolatedHumanState.duringRead = () => { Date.now = () => originalNow() + G5D4_RECORDING_CHECKPOINT_MAX_AGE_MS + 1000; };
  await focused("slow Auth read cannot mint freshly timestamped authority", async () => {
    try { return await expectReject(() => api.verifyLiveCurrentRecordingIdentity(directory, identity)); }
    finally { Date.now = originalNow; api.isolatedHumanState.duringRead = null; }
  });
  await focused("correct current nonzero B binds checkpoint identity without freshness", async () => {
    const result = api.bindVerifiedLiveRecordingCheckpointIdentity(directory, identity, receipt).manifest;
    return result.rawAuthorities.fixtureBUserId === state.userB && result.bindingVerifications.length === 1 &&
      result.bindingVerifications[0].verifiedState === currentState;
  });
  await focused("current identity capability consumed once", async () =>
    expectReject(() => api.bindVerifiedLiveRecordingCheckpointIdentity(directory, identity, receipt)));
  await focused("current identity cannot become fresh login checkpoint", async () =>
    expectReject(() => advanceFixturePreparation({ ...createFixturePreparationState(), nextCheckpoint: "fixture_b_login_verified" },
      "fixture_b_login_verified", { fixtureRole: "fixture_b", magicLinkLoginObserved: true }, { runDirectory: directory })));
  for (const index of [3, 9, 10, 11, 12]) await focused(`current identity cannot authorize non-recording binding ${index}`, async () =>
    expectReject(() => api.helper.bindVerifiedFixturePreparationAuthority(directory, bindings[index])));
  const machine = await api.verifyLiveFixtureAuthority(directory, recording);
  await focused("matching machine without actual Human checkpoint remains rejected", async () =>
    expectReject(() => api.bindVerifiedLiveFixtureAuthority(directory, recording, machine)));
  for (const [label, input] of [
    ["wrong recording", { ...recording, target: { ...recording.target, key: "wrong-recording" } }],
    ["wrong recording owner/role", { ...recording, fixtureRole: "fixture_a" }]
  ]) await focused(`${label} cannot obtain Human checkpoint`, async () =>
    expectReject(() => api.confirmLiveRecordingCheckpointFromTty(directory, input, machine)));
  for (const [label, mutate] of [
    ["wrong writer owner", r => { r.recordingState.writerOwnerId = state.userA; }],
    ["wrong script", r => { r.recordingState.writerScriptId = "wrong-script"; }],
    ["wrong DB locator", r => { r.dbLocator.key = "wrong-recording"; }],
    ["withdrawn consent", r => { r.recordingState.consentStatus = "withdrawn"; }]
  ]) await focused(`${label} reconciliation rejects current identity resume`, async () => {
    const bad = await createIsolatedVerificationModule(state, rows => { nonzeroB(rows); mutate(rows[8].result); });
    return expectReject(() => bad.verifyLiveFixtureAuthority(directory, recording));
  });
  api.isolatedHumanState.duringPrompt = () => { Date.now = () => originalNow() + G5D4_RECORDING_CHECKPOINT_MAX_AGE_MS + 1000; };
  await focused("identity expiry during Human prompt rejects checkpoint", async () => {
    try { return await expectReject(() => api.confirmLiveRecordingCheckpointFromTty(directory, recording, machine)); }
    finally { Date.now = originalNow; api.isolatedHumanState.duringPrompt = null; }
  });
  await focused("B resume matching machine plus isolated TTY confirmation accepts recording", async () => {
    const human = await api.confirmLiveRecordingCheckpointFromTty(directory, recording, machine);
    const result = api.bindVerifiedLiveFixtureAuthority(directory, recording, machine, human).manifest;
    return result.bindingVerifications[0].verifiedState === currentState &&
      result.bindingVerifications[1].humanRecordingCheckpoint.fixtureRole === "fixture_b" &&
      result.rawAuthorities.fixtureBStorageTargets.length === 1 && result.rawAuthorities.deletionRequestId === null;
  });
  await focused("accepted recording machine capability cannot be reused", async () =>
    expectReject(() => api.confirmLiveRecordingCheckpointFromTty(directory, recording, machine)));
  await focused("checkpoint-only manifest cannot complete/seal or issue destructive authorization", async () =>
    await expectReject(() => completeFixtureManifest(directory)) && await expectReject(() => sealPrivateManifest(directory)) &&
    await expectReject(() => issueAuthorizationRecord(directory, {})));
  await focused("fully populated forged manifest still cannot upgrade current identity to fresh fixture", async () => {
    const fullRun = prepare();
    for (const binding of bindings) await freshApi.helper.bindVerifiedFixturePreparationAuthority(fullRun, binding);
    const full = loadLatestPrivateManifest(fullRun); const key = readAliasKey(fullRun);
    full.bindingVerifications[1].verifiedState = currentState;
    full.bindingVerifications[1].integrityMac = hmacSha256Hex(key, "fixture-binding-verification",
      Object.fromEntries(Object.entries(full.bindingVerifications[1]).filter(([name]) => name !== "integrityMac")));
    return await expectReject(() => assertFixtureManifestComplete(full, key)) &&
      !g5d4PrivateManifestSchema.safeParse({ ...full, lifecycle: "fixture_complete" }).success;
  });
  await focused("self-test B resume accepts synthetic Human and machine only as self-test", async () => {
    api.bindSelfTestRecordingCheckpointIdentity(synthetic, identity, syntheticReceipt);
    const result = api.bindFixtureManifestAuthority(synthetic, recording).manifest;
    return result.runPurpose === G5D4_PROVENANCE.selfTest.runPurpose && result.bindingVerifications[0].verifiedState === currentState &&
      result.bindingVerifications[1].humanRecordingCheckpoint.provenance === "self_test_v1" &&
      await expectReject(() => api.bindVerifiedLiveRecordingCheckpointIdentity(otherRun, identity, syntheticReceipt));
  });
  await focused("resume helper binds current identity without automatic Human acceptance", async () => {
    const helperRun = prepare(); const prompts = api.isolatedHumanPrompts.length;
    const result = (await api.helper.bindCurrentRecordingCheckpointIdentity(helperRun, identity)).manifest;
    return result.bindingVerifications[0].verifiedState === currentState && result.rawAuthorities.fixtureBStorageTargets.length === 0 &&
      api.isolatedHumanPrompts.length === prompts;
  });
  const clockApi = await createIsolatedVerificationModule(state, nonzeroB, false, { clock: true });
  const clockRun = prepare();
  await clockApi.helper.bindCurrentRecordingCheckpointIdentity(clockRun, identity);
  clockApi.isolatedClock.now += G5D4_RECORDING_CHECKPOINT_MAX_AGE_MS + 1;
  const freshMachine = await clockApi.verifyLiveFixtureAuthority(clockRun, recording);
  await focused("stale bound identity rejects even when machine reconciliation is brand new", async () =>
    expectReject(() => clockApi.confirmLiveRecordingCheckpointFromTty(clockRun, recording, freshMachine)));
  const finalBindRun = prepare();
  await clockApi.helper.bindCurrentRecordingCheckpointIdentity(finalBindRun, identity);
  clockApi.isolatedClock.now += G5D4_RECORDING_CHECKPOINT_MAX_AGE_MS - 1000;
  const timelyMachine = await clockApi.verifyLiveFixtureAuthority(finalBindRun, recording);
  const timelyHuman = await clockApi.confirmLiveRecordingCheckpointFromTty(finalBindRun, recording, timelyMachine);
  clockApi.isolatedClock.now += 1001;
  await focused("identity expiry before final bind rejects still-fresh Human and machine receipts", async () =>
    expectReject(() => clockApi.bindVerifiedLiveFixtureAuthority(finalBindRun, recording, timelyMachine, timelyHuman)));
  await focused("accepted historical recording remains readable after current capability expires", async () => {
    try {
      Date.now = () => originalNow() + G5D4_RECORDING_CHECKPOINT_MAX_AGE_MS + 1000;
      return loadLatestPrivateManifest(directory).rawAuthorities.fixtureBStorageTargets.length === 1;
    } finally { Date.now = originalNow; }
  });
  await focused("separate historical baseline bytes and permissions remain unchanged", async () =>
    readFileSync(historyPath, "utf8") === bytes && inspectPrivateStatePermissions(directory).directoryMode === 0o700 &&
    loadLatestPrivateManifest(directory).bindingVerifications.every(item => item.verifiedState !== "fresh_zero_baseline"));
  process.stdout.write(`G5D4_RECORDING_IDENTITY_SEPARATION_FOCUSED_PASS ${number - 251}/${number - 251}\n`);
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
    const initial = createInitialPrivateManifest(runDirectory, {
      runId: "g5d4_run_11111111111111111111111111111111",
      ...privateManifestInput(G5D4_PROVENANCE.selfTest.runPurpose)
    });
    createAliasKey(runDirectory);
    const complete = populateSyntheticManifest(runDirectory, state);
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
        humanCanonicalWebSuccessObserved: true, immediateReadOnlyReconciliationVerified: true,
        directStorageBypassUsed: false
      });
      const source = readFileSync(join(ROOT, "scripts", "g5d4-fixture-prepare.mjs"), "utf8");
      return accepted.state === "normal_recordings_verified" && assertFixturePreparationHasNoUnsafeAutomation(source);
    });

    await check(44, "manifest is append-only, sealed, and digest chained", async () =>
      initial.manifest.generation === 1 &&
      sealed.manifest.generation === 16 &&
      sealed.manifest.previousGenerationDigest === complete.manifest.generationDigest &&
      loadAndVerifyManifestChain(runDirectory).length === 16 &&
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
      await createSyntheticPrivateRun(state, G5D4_PROVENANCE.live.runPurpose)
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
        await createSyntheticPrivateRun(state, G5D4_PROVENANCE.live.runPurpose, { sealed: false })
      );
      const result = await runG5d4AuthorizedStep({
        runDirectory: unsealedRun.runDirectory,
        microStep: "provider_cleanup",
        confirmedAuthorizationPath: join(unsealedRun.runDirectory, "missing-confirmed.json")
      });
      return result.childSpawnCount === 0;
    });

    await check(60, "live-owned factory has only fixed collector methods and rejects injected adapters", async () => {
      const collector = createLiveReadOnlyCollector(liveRun.runDirectory);
      return Object.isFrozen(collector) && canonicalJson(Object.keys(collector).sort()) === canonicalJson(["collectBControl", "collectReadiness"]) &&
        await expectReject(() => createLiveReadOnlyCollector(liveRun.runDirectory, adapters)) &&
        await expectReject(() => collector.collectReadiness({ adapters }));
    });

    await checkIncrementalManifest(state, trackIsolationRun);
    await checkVerifiedBindingBoundary(state, trackIsolationRun);
    await checkImmutableBindingSnapshot(state, trackIsolationRun);
    await checkHumanDecisionAndLiveReaders();
    await checkRecordingCheckpointAcceptance(state, trackIsolationRun);
    await checkRecordingIdentitySeparation(state, trackIsolationRun);

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
} else if (["--verified-binding-only", "--immutable-snapshot-only", "--recording-checkpoint-only", "--recording-bypass-only", "--identity-separation-only"].includes(process.argv[2])) {
  const directories = new Set();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("unexpected real network access"); };
  try {
    const suite = process.argv[2] === "--identity-separation-only" ? checkRecordingIdentitySeparation
      : process.argv[2].startsWith("--recording-") ? checkRecordingCheckpointAcceptance
      : process.argv[2] === "--immutable-snapshot-only" ? checkImmutableBindingSnapshot : checkVerifiedBindingBoundary;
    await suite(makeHarnessState(), (directory) => { directories.add(directory); return directory; }, process.argv[2] === "--recording-bypass-only");
  } finally {
    globalThis.fetch = originalFetch;
    for (const directory of directories) if (existsSync(directory)) cleanupPrivateRunDirectory(directory);
  }
} else {
  await main();
  await import("./g5d4-invocation-evidence-self-test.mjs");
  await import("./g5d4-fd-transport-self-test.mjs");
}
