#!/usr/bin/env node
import { INVOCATION_VERSION, TABLES, assertInvocationEnvironment, assertFreshInvocation,
  validateActualState, exactEvidence, stableActualState, verifyInvocationPost, invocationSafeSummary } from "./g5d4-invocation-evidence.mjs";
import { createLiveReadOnlyAdapters } from "./g5d4-live-read-only-adapters.mjs";

import { execFileSync, spawn } from "node:child_process";
import { closeSync, constants as fsConstants, existsSync, openSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import dotenv from "dotenv";
import {
  G5D4_CANONICAL_STAGING,
  G5D4_EVIDENCE_SAFE_ENUMS,
  G5D4_PROVENANCE,
  G5D4_PROHIBITED_OUTPUT_KEYS,
  G5D4_REQUIRED_MIGRATIONS,
  G5D4_SCHEMA_VERSIONS,
  buildReviewerSafeDto,
  canonicalJson,
  g5d4CollectorSafeDtoSchema,
  g5d4EnvironmentInspectionSchema,
  g5d4GitInspectionSchema,
  g5d4MigrationInspectionSchema,
  g5d4OperatorMicroStepSchema,
  g5d4ProofBindingSchema,
  g5d4WrapperSafeResultSchema,
  hmacSha256Hex,
  safeDigestEqual,
  sha256Hex
} from "./g5d4-proof-contract.mjs";
import {
  readInvocationSnapshot,
  readInvocationAuthorization,
  consumeInvocationAuthorization,
  readInvocationContext,
  assertCanonicalManifestAuthority,
  assertSecurePrivateFile,
  assertSecureRunDirectory,
  atomicPublishPrivateFile,
  consumeAuthorizationOnce,
  getPrivateRawSentinels,
  inspectPrivateStatePermissions,
  loadLatestPrivateManifest,
  readAliasKey,
  readAuthorizationRecord,
  readPrivateJson,
  writePrivateCapture,
  writePrivateProofArtifact
} from "./g5d4-proof-private-state.mjs";

const MODULE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WRAPPER_SCRIPT = fileURLToPath(import.meta.url);
const DESTRUCTIVE_GUARD_ENV = "NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE";
const MAX_COLLECTOR_AGE_MS = 5 * 60 * 1000;
const MAX_CHILD_CAPTURE_BYTES = 1024 * 1024;

const capsuleSchema = z
  .object({
    runDirectory: z.string().min(1),
    consumedAuthorizationPath: z.string().min(1),
    proofArtifactPath: z.string().min(1),
    requestRef: z.string().min(1).max(256),
    microStep: g5d4OperatorMicroStepSchema,
    capsuleMac: z.string().regex(/^[0-9a-f]{64}$/)
  })
  .strict();

const childSummarySchema = z
  .object({
    status: z.enum(G5D4_EVIDENCE_SAFE_ENUMS.operatorStatus),
    safeReasonCode: z.string().nullable().optional(),
    progress: z
      .object({
        marker: z.string().regex(/^[a-z][a-z0-9_]{0,79}$/),
        terminal: z.boolean(),
        retryable: z.boolean(),
        manualReviewRequired: z.boolean()
      })
      .passthrough()
      .optional()
  })
  .passthrough();


function withoutFields(value, fields) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !fields.includes(key)));
}

function computeProofArtifactDigest(value) {
  return sha256Hex(canonicalJson(withoutFields(value, ["artifactDigest"])));
}

function verifyProofArtifact(runDirectory, artifactPath, expected) {
  assertSecurePrivateFile(artifactPath, runDirectory);
  const artifact = g5d4ProofBindingSchema.parse(readPrivateJson(runDirectory, artifactPath));
  if (!safeDigestEqual(computeProofArtifactDigest(artifact), artifact.artifactDigest)) {
    throw new Error("proof binding artifact digest mismatch");
  }
  for (const [key, value] of Object.entries(expected)) {
    if (artifact[key] !== value) throw new Error("proof binding artifact mismatch");
  }
  return artifact;
}

function assertCollectorFresh(collectedAt, now) {
  const age = now.getTime() - new Date(collectedAt).getTime();
  if (!Number.isFinite(age) || age < -30_000 || age > MAX_COLLECTOR_AGE_MS) {
    throw new Error("collector evidence is stale");
  }
}

function assertExactProvenance(value, expected, label) {
  if (
    value.runPurpose !== expected.runPurpose ||
    value.confirmationProvenance !== expected.confirmation ||
    value.collectorProvenance !== expected.collector
  ) {
    throw new Error(`${label} provenance mismatch`);
  }
}

function assertPreSpawnAuthority(input, now, expectedProvenance) {
  const manifest = assertCanonicalManifestAuthority(
    loadLatestPrivateManifest(input.runDirectory, { requireSealed: true })
  );
  assertExactProvenance(manifest, expectedProvenance, "manifest");
  const permissions = inspectPrivateStatePermissions(input.runDirectory);
  if (permissions.directoryMode !== 0o700 || permissions.fileModes.some((mode) => mode !== 0o600)) {
    throw new Error("private state permission mismatch");
  }
  const safeCollector = g5d4CollectorSafeDtoSchema.parse(input.collectorEvidence?.safe);
  const environment = g5d4EnvironmentInspectionSchema.parse(input.collectorEvidence?.private?.environment);
  const migrations = g5d4MigrationInspectionSchema.parse(input.collectorEvidence?.private?.migrations);
  const git = g5d4GitInspectionSchema.parse(input.collectorEvidence?.private?.git);
  assertExactProvenance(safeCollector, expectedProvenance, "collector");
  const microStep = g5d4OperatorMicroStepSchema.parse(input.microStep);
  const target = manifest.stageTargets[microStep];

  if (
    environment.environment !== G5D4_CANONICAL_STAGING.environment ||
    environment.projectLabel !== G5D4_CANONICAL_STAGING.projectLabel ||
    environment.projectRef !== G5D4_CANONICAL_STAGING.projectRef ||
    environment.productionGuard ||
    environment.destructiveGuard ||
    process.env[DESTRUCTIVE_GUARD_ENV] === "1"
  ) {
    throw new Error("production/destructive parent guard or project mismatch");
  }
  if (
    git.commit !== manifest.authority.commit ||
    safeCollector.commit !== manifest.authority.commit ||
    !git.trackedClean
  ) {
    throw new Error("commit or tracked worktree mismatch");
  }
  if (
    canonicalJson(migrations.applied) !== canonicalJson(G5D4_REQUIRED_MIGRATIONS) ||
    migrations.pending.length !== 0
  ) {
    throw new Error("migration history or pending migration mismatch");
  }
  if (
    safeCollector.evidenceStatus !== "pass" ||
    safeCollector.phase !== "sealed" ||
    safeCollector.runId !== manifest.runId ||
    safeCollector.projectRef !== manifest.authority.projectRef ||
    safeCollector.fixtureA.fixtureAlias !== manifest.aliases.fixtureA ||
    safeCollector.fixtureA.observedRows !== 22 ||
    safeCollector.fixtureA.prospectiveObservedRows !== 22 ||
    canonicalJson(safeCollector.fixtureA.dar) !==
      canonicalJson({ deleted: 15, anonymized: 1, retained: 6 }) ||
    safeCollector.fixtureA.processingConsentCount !== 2 ||
    safeCollector.fixtureA.writerIntentCount !== 5 ||
    safeCollector.fixtureA.durableTargetCount !== 5 ||
    safeCollector.fixtureA.durableTargetState !== "sealed" ||
    safeCollector.fixtureA.nextMicroStep !== microStep ||
    safeCollector.fixtureB.deletionRequestCount !== 0 ||
    safeCollector.target.alias !== target.alias ||
    safeCollector.target.digest !== target.digest ||
    safeCollector.target.count !== target.count
  ) {
    throw new Error("collector fixture/step/target authority mismatch");
  }
  assertCollectorFresh(safeCollector.collectedAt, now);
  return { manifest, safeCollector, environment, migrations, git, microStep, target };
}

function consumedAuthorizationPath(runDirectory, authorizationId) {
  return join(runDirectory, `${authorizationId}-consumed.json`);
}

function assertConfirmedAuthorization(runDirectory, authorizationPath, authority) {
  const record = readAuthorizationRecord(runDirectory, authorizationPath);
  if (record.state !== "confirmed") throw new Error("authorization is not confirmed");
  if (existsSync(consumedAuthorizationPath(runDirectory, record.authorizationId))) {
    throw new Error("authorization is already consumed");
  }
  const expected = {
    runId: authority.manifest.runId,
    runPurpose: authority.manifest.runPurpose,
    confirmationProvenance: authority.manifest.confirmationProvenance,
    collectorProvenance: authority.manifest.collectorProvenance,
    microStep: authority.microStep,
    fixtureAlias: authority.manifest.aliases.fixtureA,
    targetAlias: authority.target.alias,
    targetDigest: authority.target.digest,
    targetCount: authority.target.count,
    commit: authority.manifest.authority.commit,
    projectRef: authority.manifest.authority.projectRef,
    collectorDigest: authority.safeCollector.collectorDigest
  };
  for (const [field, value] of Object.entries(expected)) {
    if (record[field] !== value) throw new Error("authorization exact binding mismatch");
  }
  return { record, expected };
}

function createProofArtifact(authority, consumed, bFingerprint) {
  const draft = {
    schemaVersion: G5D4_SCHEMA_VERSIONS.proofBinding,
    authorizationDigest: consumed.recordDigest,
    collectorDigest: authority.safeCollector.collectorDigest,
    manifestSealDigest: authority.manifest.manifestSealDigest,
    bFingerprint,
    runId: authority.manifest.runId,
    runPurpose: authority.manifest.runPurpose,
    confirmationProvenance: authority.manifest.confirmationProvenance,
    collectorProvenance: authority.manifest.collectorProvenance,
    microStep: authority.microStep,
    commit: authority.manifest.authority.commit,
    projectRef: authority.manifest.authority.projectRef,
    fixtureAlias: authority.manifest.aliases.fixtureA,
    targetAlias: authority.target.alias,
    targetDigest: authority.target.digest,
    targetCount: authority.target.count,
    artifactDigest: "".padStart(64, "0")
  };
  draft.artifactDigest = computeProofArtifactDigest(draft);
  return g5d4ProofBindingSchema.parse(draft);
}

function buildCapsule(runDirectory, consumedAuthorizationPathValue, proofArtifactPath, manifest, microStep) {
  const key = readAliasKey(runDirectory);
  const unsigned = {
    runDirectory,
    consumedAuthorizationPath: consumedAuthorizationPathValue,
    proofArtifactPath,
    requestRef: manifest.rawAuthorities.deletionRequestRef,
    microStep
  };
  return capsuleSchema.parse({
    ...unsigned,
    capsuleMac: hmacSha256Hex(key, "operator-capsule", unsigned)
  });
}

function scanPrivateChildOutput(rawValue, rawSentinels) {
  const serialized = canonicalJson(rawValue);
  if (
    rawSentinels.some(
      (sentinel) => typeof sentinel === "string" && sentinel.length >= 4 && serialized.includes(sentinel)
    )
  ) {
    throw new Error("child output contains a private raw-value sentinel");
  }
  const visit = (value) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      const normalized = key.toLowerCase();
      if (
        G5D4_PROHIBITED_OUTPUT_KEYS.some((item) => {
          const needle = item.toLowerCase();
          return (
            normalized === needle ||
            normalized.endsWith(needle) ||
            normalized.startsWith(`raw${needle}`) ||
            (needle === "raw" && normalized.startsWith("raw"))
          );
        })
      ) {
        throw new Error("child output contains a prohibited key");
      }
      visit(child);
    }
  };
  visit(rawValue);
  return childSummarySchema.parse(rawValue);
}

function parseStrictChildResult(result, rawSentinels) {
  if (!result || typeof result.stdout !== "string" || typeof result.stderr !== "string") {
    throw new Error("child capture missing");
  }
  if (
    Buffer.byteLength(result.stdout) > MAX_CHILD_CAPTURE_BYTES ||
    Buffer.byteLength(result.stderr) > MAX_CHILD_CAPTURE_BYTES
  ) {
    throw new Error("child capture exceeded limit");
  }
  if (result.stderr.trim().length > 0) {
    throw new Error("child stderr is private diagnostic output and cannot become safe evidence");
  }
  let parsed;
  try {
    parsed = JSON.parse(result.stdout.trim());
  } catch {
    throw new Error("child stdout is not one strict JSON document");
  }
  const summary = scanPrivateChildOutput(parsed, rawSentinels);
  if (result.exitCode === 0 && ["succeeded", "already_satisfied"].includes(summary.status)) {
    return { summary, semantic: "exit_0_valid" };
  }
  if (
    result.exitCode === 2 &&
    ["blocked", "failed", "manual_required", "retryable"].includes(summary.status) &&
    summary.progress
  ) {
    return { summary, semantic: "exit_2_valid_progress" };
  }
  throw new Error("child exit/status semantic mismatch");
}

function safeResultCandidate(overrides = {}) {
  return {
    schemaVersion: G5D4_SCHEMA_VERSIONS.wrapperSafe,
    status: "not_started",
    authorizationId: null,
    microStep: null,
    commit: null,
    projectRef: null,
    guardTransition: "not_started",
    operatorStatus: null,
    childExitSemantic: "not_spawned",
    childSpawnCount: 0,
    retryCount: 0,
    chainingCount: 0,
    targetCount: 0,
    bFingerprintEqual: null,
    mandatoryStop: true,
    collectorDigestAfter: null,
    safeReasonCode: "prerequisite_rejected",
    ...overrides
  };
}

async function runAuthorizedStepCore(input, launchChild, expectedProvenance) {
  let authority;
  let authorization;
  let consumed;
  let proofArtifactPath;
  let spawnAttempted = false;
  let privateRawSentinels = [];
  try {
    const now = input.now ?? new Date();
    authority = assertPreSpawnAuthority(input, now, expectedProvenance);
    privateRawSentinels = getPrivateRawSentinels(authority.manifest);
    authorization = assertConfirmedAuthorization(
      input.runDirectory,
      input.confirmedAuthorizationPath,
      authority
    );
    if (!input.collector || Object.keys(input.collector).sort().join(",") !== "collectBControl") {
      throw new Error("wrapper requires exact read-only B collector");
    }
    const bBefore = await input.collector.collectBControl({ collectedAt: now.toISOString() });
    assertExactProvenance(bBefore, expectedProvenance, "B collector");
    if (bBefore.fingerprint !== authority.safeCollector.fixtureB.fingerprint) {
      throw new Error("live B fingerprint substitution or staleness");
    }

    consumed = consumeAuthorizationOnce(
      input.runDirectory,
      input.confirmedAuthorizationPath,
      authorization.expected,
      { consumedAt: input.consumedAt }
    );
    const artifact = createProofArtifact(authority, consumed.record, bBefore.fingerprint);
    proofArtifactPath = writePrivateProofArtifact(
      input.runDirectory,
      `${consumed.record.authorizationId}-proof-binding.json`,
      artifact
    );
    verifyProofArtifact(input.runDirectory, proofArtifactPath, {
      authorizationDigest: consumed.record.recordDigest,
      collectorDigest: authority.safeCollector.collectorDigest,
      manifestSealDigest: authority.manifest.manifestSealDigest,
      bFingerprint: bBefore.fingerprint,
      runId: authority.manifest.runId,
      runPurpose: authority.manifest.runPurpose,
      confirmationProvenance: authority.manifest.confirmationProvenance,
      collectorProvenance: authority.manifest.collectorProvenance,
      microStep: authority.microStep,
      commit: authority.manifest.authority.commit,
      projectRef: authority.manifest.authority.projectRef,
      fixtureAlias: authority.manifest.aliases.fixtureA,
      targetAlias: authority.target.alias,
      targetDigest: authority.target.digest,
      targetCount: authority.target.count
    });

    const capsule = buildCapsule(
      input.runDirectory,
      consumed.path,
      proofArtifactPath,
      authority.manifest,
      authority.microStep
    );
    const capsulePath = atomicPublishPrivateFile(
      input.runDirectory,
      `${consumed.record.authorizationId}-operator-capsule.json`,
      `${canonicalJson(capsule)}\n`
    );
    spawnAttempted = true;
    let launched;
    try {
      launched = await launchChild({
        runDirectory: input.runDirectory,
        capsulePath,
        authorizationId: consumed.record.authorizationId,
        spawnOptions: { shell: false, retryCount: 0, chainingCount: 0 }
      });
    } catch {
      return buildReviewerSafeDto(
        g5d4WrapperSafeResultSchema,
        safeResultCandidate({
          status: "stop",
          authorizationId: consumed.record.authorizationId,
          microStep: authority.microStep,
          commit: authority.manifest.authority.commit,
          projectRef: authority.manifest.authority.projectRef,
          childExitSemantic: "spawn_failed",
          childSpawnCount: 1,
          targetCount: authority.target.count,
          safeReasonCode: "spawn_failed"
        }),
        privateRawSentinels
      );
    }

    writePrivateCapture(
      input.runDirectory,
      `${consumed.record.authorizationId}-stdout.capture`,
      launched.stdout
    );
    writePrivateCapture(
      input.runDirectory,
      `${consumed.record.authorizationId}-stderr.capture`,
      launched.stderr
    );
    let parsedChild;
    try {
      parsedChild = parseStrictChildResult(launched, privateRawSentinels);
    } catch {
      return buildReviewerSafeDto(
        g5d4WrapperSafeResultSchema,
        safeResultCandidate({
          status: "stop",
          authorizationId: consumed.record.authorizationId,
          microStep: authority.microStep,
          commit: authority.manifest.authority.commit,
          projectRef: authority.manifest.authority.projectRef,
          childExitSemantic: "output_rejected",
          childSpawnCount: 1,
          targetCount: authority.target.count,
          safeReasonCode: "child_output_rejected"
        }),
        privateRawSentinels
      );
    }
    if (process.env[DESTRUCTIVE_GUARD_ENV] === "1") {
      throw new Error("destructive guard escaped child process scope");
    }
    let bAfter;
    try {
      bAfter = await input.collector.collectBControl({
        collectedAt: (input.afterNow ?? new Date()).toISOString()
      });
      assertExactProvenance(bAfter, expectedProvenance, "post-step B collector");
    } catch {
      return buildReviewerSafeDto(
        g5d4WrapperSafeResultSchema,
        safeResultCandidate({
          status: "stop",
          authorizationId: consumed.record.authorizationId,
          microStep: authority.microStep,
          commit: authority.manifest.authority.commit,
          projectRef: authority.manifest.authority.projectRef,
          guardTransition: "parent_off_child_on_parent_off",
          operatorStatus: parsedChild.summary.status,
          childExitSemantic: parsedChild.semantic,
          childSpawnCount: 1,
          targetCount: authority.target.count,
          bFingerprintEqual: null,
          safeReasonCode: "post_collector_rejected"
        }),
        privateRawSentinels
      );
    }
    const bEqual = bAfter.fingerprint === bBefore.fingerprint;
    return buildReviewerSafeDto(
      g5d4WrapperSafeResultSchema,
      safeResultCandidate({
        status: "stop",
        authorizationId: consumed.record.authorizationId,
        microStep: authority.microStep,
        commit: authority.manifest.authority.commit,
        projectRef: authority.manifest.authority.projectRef,
        guardTransition: "parent_off_child_on_parent_off",
        operatorStatus: parsedChild.summary.status,
        childExitSemantic: parsedChild.semantic,
        childSpawnCount: 1,
        targetCount: authority.target.count,
        bFingerprintEqual: bEqual,
        collectorDigestAfter: bAfter.collectorDigest,
        safeReasonCode: bEqual ? "operator_progress_recorded" : "b_fingerprint_changed"
      }),
      privateRawSentinels
    );
  } catch {
    const manifest = authority?.manifest;
    const record = authorization?.record;
    const candidate = safeResultCandidate({
      status: spawnAttempted ? "stop" : "not_started",
      authorizationId: record?.authorizationId ?? null,
      microStep: authority?.microStep ?? null,
      commit: manifest?.authority.commit ?? null,
      projectRef: manifest?.authority.projectRef ?? null,
      childSpawnCount: spawnAttempted ? 1 : 0,
      targetCount: authority?.target.count ?? 0,
      safeReasonCode: consumed ? "authorization_consumed" : authorization ? "authorization_rejected" : "prerequisite_rejected"
    });
    return buildReviewerSafeDto(g5d4WrapperSafeResultSchema, candidate, privateRawSentinels);
  }
}

async function launchCanonicalOperatorChild({ capsulePath, spawnOptions }) {
  if (spawnOptions.shell !== false || spawnOptions.retryCount !== 0 || spawnOptions.chainingCount !== 0) {
    throw new Error("canonical child launch options rejected");
  }
  const capsuleFd = openSync(capsulePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    return await new Promise((resolvePromise, rejectPromise) => {
      // The tsx CLI respawns Node without FD 3; load tsx in the final child instead.
      const child = spawn(process.execPath, ["--conditions=react-server", "--import", "tsx", WRAPPER_SCRIPT, "--internal-child-fd", "3"], {
        cwd: MODULE_ROOT,
        env: {
          ...process.env,
          [DESTRUCTIVE_GUARD_ENV]: "1",
          G5D4_INTERNAL_CHILD: "1"
        },
        shell: false,
        stdio: ["ignore", "pipe", "pipe", capsuleFd]
      });
      const stdout = [];
      const stderr = [];
      let stdoutSize = 0;
      let stderrSize = 0;
      child.stdout.on("data", (chunk) => {
        stdoutSize += chunk.length;
        if (stdoutSize > MAX_CHILD_CAPTURE_BYTES) child.kill("SIGKILL");
        else stdout.push(chunk);
      });
      child.stderr.on("data", (chunk) => {
        stderrSize += chunk.length;
        if (stderrSize > MAX_CHILD_CAPTURE_BYTES) child.kill("SIGKILL");
        else stderr.push(chunk);
      });
      child.once("error", rejectPromise);
      child.once("close", (exitCode) =>
        resolvePromise({
          exitCode,
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8")
        })
      );
    });
  } finally {
    closeSync(capsuleFd);
  }
}

export async function runG5d4AuthorizedStep(input) {
  try {
    const parsed = invocationEntrySchema.parse(input);
    readInvocationContext(parsed.runDirectory, "live");
    return await runInvocationCore(parsed, createLiveReadOnlyAdapters().invocation, launchCanonicalOperatorChild, "live");
  } catch {
    return buildReviewerSafeDto(g5d4WrapperSafeResultSchema, safeResultCandidate());
  }
}

export async function runG5d4AuthorizedStepSelfTestOnly(input) {
  assertSecureRunDirectory(input.runDirectory);
  if (!basename(input.runDirectory).startsWith("native-minute-g5d4-self-test-")) {
    throw new Error("fake-only wrapper is restricted to a self-test OS-temp run");
  }
  const scenario = z.enum(["success", "exit2_progress", "spawn_failure", "raw_output"]).parse(input.scenario);
  const manifest = loadLatestPrivateManifest(input.runDirectory, { requireSealed: true });
  assertExactProvenance(manifest, G5D4_PROVENANCE.selfTest, "self-test manifest");
  return runAuthorizedStepCore(input, async ({ spawnOptions }) => {
    input.observer?.({ shell: spawnOptions.shell, retryCount: spawnOptions.retryCount, chainingCount: spawnOptions.chainingCount });
    if (scenario === "spawn_failure") throw new Error("fake spawn failure");
    if (scenario === "raw_output") {
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          status: "succeeded",
          safeReasonCode: null,
          progress: {
            marker: "succeeded",
            terminal: true,
            retryable: false,
            manualReviewRequired: false
          },
          payload: input.rawOutputSentinel
        }),
        stderr: String(input.rawOutputSentinel ?? "")
      };
    }
    if (scenario === "exit2_progress") {
      return {
        exitCode: 2,
        stdout: JSON.stringify({
          status: "manual_required",
          safeReasonCode: "provider_stage_result",
          progress: {
            marker: "manual_required",
            terminal: false,
            retryable: false,
            manualReviewRequired: true
          }
        }),
        stderr: ""
      };
    }
    return {
      exitCode: 0,
      stdout: JSON.stringify({
        status: "succeeded",
        safeReasonCode: null,
        progress: {
          marker: "succeeded",
          terminal: true,
          retryable: false,
          manualReviewRequired: false
        }
      }),
      stderr: ""
    };
  }, G5D4_PROVENANCE.selfTest);
}

async function runInternalCanonicalChild(capsuleFd) {
  if (process.env.G5D4_INTERNAL_CHILD !== "1" || process.env[DESTRUCTIVE_GUARD_ENV] !== "1") {
    throw new Error("internal canonical child guard missing");
  }
  const rawCapsule = JSON.parse(readFileSync(capsuleFd, "utf8"));
  if (rawCapsule.version === INVOCATION_VERSION) return runInvocationChild(rawCapsule);
  // Historical capsules cannot enter a live destructive launcher after rebaseline.
  throw new Error("historical manifest execution authority retired");
}

const invocationEntrySchema = z.object({
  runDirectory: z.string().min(1), snapshotPath: z.string().min(1), confirmedAuthorizationPath: z.string().min(1)
}).strict();
const invocationCapsuleSchema = z.object({
  version: z.literal(INVOCATION_VERSION), runDirectory: z.string(), snapshotPath: z.string(), consumedAuthorizationPath: z.string(), capsuleMac: z.string().regex(/^[0-9a-f]{64}$/)
}).strict();
async function runInvocationCore(input, reader, launcher, purpose) {
  let snapshot; let consumed; let attempted = false; let post; let postDigest;
  try {
    snapshot = readInvocationSnapshot(input.runDirectory, input.snapshotPath, purpose);
    assertFreshInvocation(snapshot);
    readInvocationAuthorization(input.runDirectory, input.confirmedAuthorizationPath, snapshot, "confirmed");
    const inspection = await reader.inspect();
    assertInvocationEnvironment(inspection.environment, inspection.migrations, inspection.git, snapshot.git.commit);
    if (process.env[DESTRUCTIVE_GUARD_ENV] === "1") throw new Error("parent guard enabled");
    const fresh = validateActualState(await reader.read({ context: snapshot.context }), snapshot.context);
    exactEvidence(stableActualState(fresh), stableActualState(snapshot.actual), "authorized pre-state drift");
    assertFreshInvocation(snapshot);
    consumed = consumeInvocationAuthorization(input.runDirectory, input.confirmedAuthorizationPath, snapshot);
    const unsigned = { version: INVOCATION_VERSION, runDirectory: input.runDirectory, snapshotPath: input.snapshotPath, consumedAuthorizationPath: consumed.path };
    const capsule = { ...unsigned, capsuleMac: hmacSha256Hex(readAliasKey(input.runDirectory), "invocation-capsule", unsigned) };
    const capsulePath = atomicPublishPrivateFile(input.runDirectory, `${consumed.record.id}-capsule.json`, `${canonicalJson(capsule)}\n`);
    let launched; let launchFailed = false;
    attempted = true;
    try { launched = await launcher({ capsulePath, spawnOptions: { shell: false, retryCount: 0, chainingCount: 0 } }); }
    catch { launchFailed = true; }
    // Reconciliation happens even on spawn/response/output loss, before interpreting success.
    let postFailed = false;
    try {
      post = await reader.read({ context: snapshot.context, preIdentities: Object.fromEntries(TABLES.map(t => [t, snapshot.actual.a.database.evidence[t].map(r => r.id)])) });
      const inspectedAfter = await reader.inspect();
      assertInvocationEnvironment(inspectedAfter.environment, inspectedAfter.migrations, inspectedAfter.git, snapshot.git.commit);
      const postEvidence = { snapshotDigest: snapshot.digest, collectedAt: new Date().toISOString(), actual: post };
      postDigest = hmacSha256Hex(readAliasKey(input.runDirectory), "invocation-post-evidence", postEvidence);
      writePrivateProofArtifact(input.runDirectory, `${consumed.record.id}-post.json`, { ...postEvidence, digest: postDigest });
    } catch { postFailed = true; }
    if (launched) {
      writePrivateCapture(input.runDirectory, `${consumed.record.id}-stdout.capture`, launched.stdout ?? "");
      writePrivateCapture(input.runDirectory, `${consumed.record.id}-stderr.capture`, launched.stderr ?? "");
    }
    if (launchFailed || postFailed) throw new Error("post-action read-only reconciliation required");
    const sentinels = [snapshot.context.a.userId, snapshot.context.b.userId, snapshot.context.requestId,
      snapshot.context.a.providerId, snapshot.context.b.providerId, ...snapshot.context.a.storage.map(x => x.key), ...snapshot.context.b.storage.map(x => x.key)];
    const parsed = parseStrictChildResult(launched, sentinels);
    const verification = verifyInvocationPost(snapshot, post, parsed.summary);
    if (process.env[DESTRUCTIVE_GUARD_ENV] === "1") throw new Error("parent guard escaped");
    const safe = { ...invocationSafeSummary(snapshot, readAliasKey(input.runDirectory)), ...verification, postDigest, status: "STOP", invocationCount: 1, retryCount: 0, chainingCount: 0 };
    writePrivateProofArtifact(input.runDirectory, `${consumed.record.id}-verification.json`, safe);
    return safe;
  } catch {
    return { version: INVOCATION_VERSION, status: "STOP", verdict: "REJECT", mandatoryStop: true,
      bUnchanged: false, invocationCount: attempted ? 1 : 0, retryCount: 0, chainingCount: 0, reconciliation: attempted ? "READ_ONLY_RECONCILIATION_REQUIRED" : "PRECONDITION_REJECTED" };
  }
}
export async function runG5d4InvocationSelfTestOnly(input, reader, launcher) {
  const parsed = invocationEntrySchema.parse(input);
  readInvocationContext(parsed.runDirectory, "self_test");
  return runInvocationCore(parsed, reader, launcher, "self_test");
}
async function runInvocationChild(raw) {
  const capsule = invocationCapsuleSchema.parse(raw);
  const directory = assertSecureRunDirectory(capsule.runDirectory);
  const key = readAliasKey(directory);
  if (!safeDigestEqual(capsule.capsuleMac, hmacSha256Hex(key, "invocation-capsule", withoutFields(capsule, ["capsuleMac"])))) throw new Error("invocation capsule integrity");
  const snapshot = readInvocationSnapshot(directory, capsule.snapshotPath, "live");
  assertFreshInvocation(snapshot);
  const consumed = readInvocationAuthorization(directory, capsule.consumedAuthorizationPath, snapshot, "consumed");
  const git = (...args) => execFileSync("git", args, { cwd: MODULE_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  if (git("rev-parse", "HEAD") !== snapshot.git.commit || !git("status", "--porcelain", "--untracked-files=normal").split("\n").every(line => !line || line === "?? .env.local.save" || line === "?? supabase/.temp/")) throw new Error("execution source changed");
  const localEnv = join(MODULE_ROOT, ".env.local");
  const configured = { ...(existsSync(localEnv) ? dotenv.parse(readFileSync(localEnv)) : {}), ...process.env };
  if (configured.NEXT_PUBLIC_SUPABASE_URL !== `https://${G5D4_CANONICAL_STAGING.projectRef}.supabase.co` || configured.NODE_ENV === "production" || configured.VERCEL_ENV === "production" || configured.NATIVE_MINUTE_PRODUCTION_GUARD && !["0", "false"].includes(configured.NATIVE_MINUTE_PRODUCTION_GUARD)) throw new Error("child environment changed");
  for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ELEVENLABS_API_KEY"]) {
    if (!configured[name]) throw new Error("child credential unavailable");
    process.env[name] = configured[name];
  }
  atomicPublishPrivateFile(directory, `${consumed.id}-child-started.json`, `${canonicalJson({ snapshotDigest: snapshot.digest })}\n`);
  const { executeInvocationCanonicalOperator } = await import("./g5d4-invocation-operator.mjs");
  const result = await executeInvocationCanonicalOperator(directory, capsule.snapshotPath, capsule.consumedAuthorizationPath);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (["blocked", "failed", "manual_required", "retryable"].includes(result.status)) process.exitCode = 2;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.length === 4 && process.argv[2] === "--internal-child-fd" && process.argv[3] === "3") {
    await runInternalCanonicalChild(3);
  } else {
    process.stdout.write(`${JSON.stringify(safeResultCandidate())}\n`);
    process.exitCode = 2;
  }
}
