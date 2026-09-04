#!/usr/bin/env node

import { spawn } from "node:child_process";
import { closeSync, constants as fsConstants, existsSync, openSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  G5D4_CANONICAL_STAGING,
  G5D4_EVIDENCE_SAFE_ENUMS,
  G5D4_OPERATOR_MICRO_STEPS,
  G5D4_PROVENANCE,
  G5D4_PROHIBITED_OUTPUT_KEYS,
  G5D4_REQUIRED_MIGRATIONS,
  G5D4_SCHEMA_VERSIONS,
  buildReviewerSafeDto,
  canonicalJson,
  g5d4AuthorizationSchema,
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
  verifyAuthorizationRecord,
  writePrivateCapture,
  writePrivateProofArtifact
} from "./g5d4-proof-private-state.mjs";
import { createLiveReadOnlyCollector } from "./g5d4-read-only-evidence-collector.mjs";

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

const liveEntryInputSchema = z
  .object({
    runDirectory: z.string().min(1),
    confirmedAuthorizationPath: z.string().min(1),
    microStep: g5d4OperatorMicroStepSchema
  })
  .strict();

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
  const tsxPath = join(MODULE_ROOT, "node_modules", ".bin", "tsx");
  try {
    return await new Promise((resolvePromise, rejectPromise) => {
      const child = spawn(tsxPath, [WRAPPER_SCRIPT, "--internal-child-fd", "3"], {
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

function assertLiveAuthorizationBeforeCollection(input, manifest) {
  const record = readAuthorizationRecord(input.runDirectory, input.confirmedAuthorizationPath);
  const target = manifest.stageTargets[input.microStep];
  assertExactProvenance(record, G5D4_PROVENANCE.live, "authorization");
  if (
    record.state !== "confirmed" ||
    record.runId !== manifest.runId ||
    record.microStep !== input.microStep ||
    record.fixtureAlias !== manifest.aliases.fixtureA ||
    !target ||
    record.targetAlias !== target.alias ||
    record.targetDigest !== target.digest ||
    record.targetCount !== target.count ||
    record.commit !== manifest.authority.commit ||
    record.projectRef !== manifest.authority.projectRef ||
    existsSync(consumedAuthorizationPath(input.runDirectory, record.authorizationId))
  ) {
    throw new Error("live authorization binding mismatch");
  }
  return record;
}

export async function runG5d4AuthorizedStep(input) {
  try {
    const parsed = liveEntryInputSchema.parse(input);
    const manifest = assertCanonicalManifestAuthority(
      loadLatestPrivateManifest(parsed.runDirectory, { requireSealed: true })
    );
    assertExactProvenance(manifest, G5D4_PROVENANCE.live, "live manifest");
    assertLiveAuthorizationBeforeCollection(parsed, manifest);
    const liveCollector = createLiveReadOnlyCollector(parsed.runDirectory);
    const now = new Date();
    const collectorEvidence = await liveCollector.collectReadiness({
      phase: "sealed",
      collectedAt: now.toISOString()
    });
    const collector = Object.freeze({ collectBControl: liveCollector.collectBControl });
    return runAuthorizedStepCore(
      { ...parsed, collector, collectorEvidence, now },
      launchCanonicalOperatorChild,
      G5D4_PROVENANCE.live
    );
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
  const capsule = capsuleSchema.parse(JSON.parse(readFileSync(capsuleFd, "utf8")));
  const runDirectory = assertSecureRunDirectory(capsule.runDirectory);
  const key = readAliasKey(runDirectory);
  const expectedMac = hmacSha256Hex(
    key,
    "operator-capsule",
    withoutFields(capsule, ["capsuleMac"])
  );
  if (!safeDigestEqual(expectedMac, capsule.capsuleMac)) throw new Error("operator capsule integrity mismatch");
  const manifest = assertCanonicalManifestAuthority(
    loadLatestPrivateManifest(runDirectory, { requireSealed: true })
  );
  assertExactProvenance(manifest, G5D4_PROVENANCE.live, "internal child manifest");
  const consumed = verifyAuthorizationRecord(
    g5d4AuthorizationSchema.parse(readPrivateJson(runDirectory, capsule.consumedAuthorizationPath)),
    key
  );
  if (
    consumed.state !== "consumed" ||
    consumed.runPurpose !== G5D4_PROVENANCE.live.runPurpose ||
    consumed.confirmationProvenance !== G5D4_PROVENANCE.live.confirmation ||
    consumed.collectorProvenance !== G5D4_PROVENANCE.live.collector ||
    consumed.runId !== manifest.runId ||
    consumed.microStep !== capsule.microStep ||
    consumed.fixtureAlias !== manifest.aliases.fixtureA
  ) {
    throw new Error("consumed authorization child binding mismatch");
  }
  verifyProofArtifact(runDirectory, capsule.proofArtifactPath, {
    authorizationDigest: consumed.recordDigest,
    collectorDigest: consumed.collectorDigest,
    manifestSealDigest: manifest.manifestSealDigest,
    runId: manifest.runId,
    runPurpose: manifest.runPurpose,
    confirmationProvenance: manifest.confirmationProvenance,
    collectorProvenance: manifest.collectorProvenance,
    microStep: capsule.microStep,
    commit: manifest.authority.commit,
    projectRef: manifest.authority.projectRef,
    fixtureAlias: manifest.aliases.fixtureA,
    targetAlias: consumed.targetAlias,
    targetDigest: consumed.targetDigest,
    targetCount: consumed.targetCount
  });

  const [{ parseArgs, runAccountDeletionOperator }, providerModule, storageModule, databaseModule, authModule, completionModule] =
    await Promise.all([
      import("./account-deletion-operator-runner.mjs"),
      import("../services/account-deletion/account-deletion-provider-operator.service.ts"),
      import("../services/account-deletion/account-deletion-storage-operator.service.ts"),
      import("../services/account-deletion/account-deletion-database-operator.service.ts"),
      import("../services/account-deletion/account-deletion-auth-operator.service.ts"),
      import("../services/account-deletion/account-deletion-completion-operator.service.ts")
    ]);
  const providerBridge = providerModule.createAccountDeletionProviderOperatorBridge({ env: process.env });
  const storageBridge = storageModule.createAccountDeletionStorageOperatorBridge({ env: process.env });
  const databaseBridge = databaseModule.createAccountDeletionDatabaseOperatorBridge({ env: process.env });
  const authBridge = authModule.createAccountDeletionAuthOperatorBridge({ env: process.env });
  const completionBridge = completionModule.createAccountDeletionCompletionOperatorBridge({ env: process.env });
  const stageServices = {
    ...providerBridge.stageServices,
    ...storageBridge.stageServices,
    ...databaseBridge.stageServices,
    ...authBridge.stageServices,
    ...completionBridge.stageServices
  };
  const stage = G5D4_OPERATOR_MICRO_STEPS[capsule.microStep];
  const args = [
    "--stage",
    stage,
    "--request",
    capsule.requestRef,
    "--execute",
    "--proof",
    capsule.proofArtifactPath,
    "--env-label",
    manifest.authority.projectLabel,
    "--latest-dry-run-runnable",
    "--acknowledge-irreversible",
    "I_UNDERSTAND_ACCOUNT_DELETION_IS_IRREVERSIBLE"
  ];
  if (stage !== "provider") args.push("--prior-stage-satisfied");
  const parsed = parseArgs(args);
  const summary = await runAccountDeletionOperator(parsed, {
    env: process.env,
    requestResolver: (resolverInput) => {
      if (stage === "provider") return providerBridge.requestResolver(resolverInput);
      if (stage === "storage") return storageBridge.requestResolver(resolverInput);
      if (stage === "database") return databaseBridge.requestResolver(resolverInput);
      if (stage === "auth") return authBridge.requestResolver(resolverInput);
      return completionBridge.requestResolver(resolverInput);
    },
    stageServices
  });
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  if (["blocked", "failed", "manual_required"].includes(summary.status)) process.exitCode = 2;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.length === 4 && process.argv[2] === "--internal-child-fd" && process.argv[3] === "3") {
    await runInternalCanonicalChild(3);
  } else {
    process.stdout.write(`${JSON.stringify(safeResultCandidate())}\n`);
    process.exitCode = 2;
  }
}
