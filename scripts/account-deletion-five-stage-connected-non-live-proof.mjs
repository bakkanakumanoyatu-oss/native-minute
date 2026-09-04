#!/usr/bin/env node

import { createHmac, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MODE = "G5D_FIVE_STAGE_CONNECTED_NON_LIVE_PROOF_IMPLEMENTATION_AND_EXECUTION";
const SUCCESS_STATUS =
  "G5D_FIVE_STAGE_CONNECTED_NON_LIVE_PROOF_IMPLEMENTED_AND_EXECUTED_PENDING_INDEPENDENT_REVIEW";
const EXPECTED_COMMIT = "a1378f1572c6bc9e97b323412da0962db6e64952";
const EXPECTED_MIGRATION_SHA = "ff05fd6ffcca8e1a78c62418360e74f2d025f2779dcd6ea9f147919359728beb";
const POSTGRES_IMAGE = "public.ecr.aws/supabase/postgres:17.6.1.143";
const POSTGREST_IMAGE = "public.ecr.aws/supabase/postgrest:v13.0.7";
const PROOF_PATH = "docs/g5d-five-stage-connected-non-live-proof-result.md";
const ACKNOWLEDGEMENT = "DELETE_DISPOSABLE_ACCOUNT";
const GUARD = "NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE";
const PARTIAL_STACK_PROBE_ARG = "--partial-stack-cleanup-probes";
const PARTIAL_STACK_PROBE_MODE =
  "G5D_FIVE_STAGE_CONNECTED_NON_LIVE_PROOF_PARTIAL_STACK_FAILURE_CLEANUP_P1_MINIMUM_CORRECTION";
const INJECTED_BOOTSTRAP_FAILURE = "isolated_bootstrap_injected_failure";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const SQL_PATH = join(SCRIPT_DIR, "g5d-five-stage-connected-non-live-proof.sql");
const MIGRATIONS_DIR = join(REPO_ROOT, "supabase", "migrations");

// These values are proof-internal targeting authorities. They are never copied to
// the safe aggregate, stdout, stderr, or the result document.
const FIXTURES = {
  clean: {
    userId: "71000000-0000-4000-8000-000000000001",
    requestId: "72000000-0000-4000-8000-000000000001",
    providerRef: "nm_sensitive_provider_h",
    storageKey: "71000000-0000-4000-8000-000000000001/nm-sensitive-storage-h.wav"
  },
  recovery: {
    userId: "71000000-0000-4000-8000-000000000002",
    requestId: "72000000-0000-4000-8000-000000000002",
    providerRef: "nm_sensitive_provider_r",
    storageKey: "71000000-0000-4000-8000-000000000002/nm-sensitive-storage-r.wav"
  },
  manual: {
    userId: "71000000-0000-4000-8000-000000000003",
    requestId: "72000000-0000-4000-8000-000000000003",
    providerRef: "nm_sensitive_provider_m",
    storageKey: "71000000-0000-4000-8000-000000000003/nm-sensitive-storage-m.wav"
  }
};
const AMBIGUOUS_OPAQUE_REF = "adr_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const EXPECTED_STAGE_INVOCATIONS = {
  provider: 14,
  storage: 10,
  database: 5,
  auth: 5,
  completion: 5,
  invalidMultiStage: 1,
  totalExecuteAttempts: 40,
  immediatelyPrecedingDryRuns: 39
};
const EXPECTED_STAGE_SERVICE_CALLS = {
  provider: 12,
  storage: 9,
  database: 4,
  auth: 4,
  completion: 5
};
const EXPECTED_TERMINAL_COUNTS = {
  provider: 3,
  storage: 3,
  database: 3,
  auth: 3,
  completion: 3
};
const EXPECTED_FAKE_DISPATCH_COUNTS = {
  providerDelete: 3,
  providerGetReconcile: 2,
  storageInventoryReads: 4,
  storageDelete: 2,
  storageInfoVerification: 2,
  authGet: 4,
  authDelete: 2,
  isolatedAuthUsersDeleted: 2,
  databaseFinalizerRpc: 4,
  completionRpc: 4
};

class SafeProofError extends Error {
  constructor(reason) {
    super(reason);
    this.name = "SafeProofError";
    this.safeReason = reason;
  }
}

function assertProof(condition, reason) {
  if (!condition) throw new SafeProofError(reason);
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      cwd: options.cwd ?? REPO_ROOT,
      input: options.input,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"]
    }).trim();
  } catch {
    if (options.allowFailure) return "";
    throw new SafeProofError(options.safeReason ?? "isolated_substrate_command_failed");
  }
}

function docker(args, options = {}) {
  return run("docker", args, options);
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function serviceRoleJwt(secret) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({ role: "service_role", iss: "supabase", iat: now - 60, exp: now + 3_600 })
  );
  const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
}

function safeResultSkeleton(commitSha, migrationSha) {
  return {
    mode: MODE,
    status: "FAIL",
    commitSha,
    migrationSha,
    stageInvocations: {
      provider: 0,
      storage: 0,
      database: 0,
      auth: 0,
      completion: 0,
      invalidMultiStage: 0,
      totalExecuteAttempts: 0,
      immediatelyPrecedingDryRuns: 0
    },
    stageServiceCalls: { provider: 0, storage: 0, database: 0, auth: 0, completion: 0 },
    stageTerminalCounts: { provider: 0, storage: 0, database: 0, auth: 0, completion: 0 },
    aggregateTargetCounts: {
      clean: { provider: 0, storage: 0 },
      recovery: { provider: 0, storage: 0 },
      manual: { provider: 0, storage: 0 }
    },
    fakeDispatchCounts: {
      providerDelete: 0,
      providerGetReconcile: 0,
      storageInventoryReads: 0,
      storageDelete: 0,
      storageInfoVerification: 0,
      authGet: 0,
      authDelete: 0,
      isolatedAuthUsersDeleted: 0,
      databaseFinalizerRpc: 0,
      completionRpc: 0
    },
    responseLossInjected: 0,
    responseLossRecovered: 0,
    priorStageBlocks: 0,
    manualStops: 0,
    replayCounts: { provider: 0, storage: 0, database: 0, auth: 0, completion: 0 },
    crossRequestBlocks: 0,
    opaqueAmbiguityBlocks: 0,
    sameInvocationChaining: 0,
    realExternalCalls: { provider: 0, storage: 0, auth: 0, total: 0 },
    canonicalStagingAccess: 0,
    canonicalStagingMutation: 0,
    productionAccess: 0,
    productionMutation: 0,
    notificationSenderCalls: 0,
    purgeCalls: 0,
    processDestructiveGuardEnablements: 0,
    redactionSentinelMatches: 0,
    finalCompletionTerminal: false,
    isolatedStackDestroyed: false,
    focusedFindings: { P0: 0, P1: 0, P2: 0, UNKNOWN: 0 },
    programFindings: {
      P0: 0,
      P1: 0,
      P2: 1,
      UNKNOWN: 0,
      knownP2: "auth_terminal_authority_missing"
    },
    proofLocalSyntheticAcknowledgementIsHumanAuthorization: false,
    failureReason: null
  };
}

function fixedFailureReason(error) {
  const allowed = new Set([
    "checkpoint_mismatch",
    "migration_chain_mismatch",
    "isolated_substrate_command_failed",
    "isolated_database_not_ready",
    "isolated_postgrest_not_ready",
    "isolated_migration_apply_failed",
    "isolated_fixture_setup_failed",
    "loopback_boundary_violation",
    "canonical_ceremony_mismatch",
    "canonical_stage_semantics_mismatch",
    "persisted_handoff_mismatch",
    "prior_stage_enforcement_mismatch",
    "response_loss_recovery_mismatch",
    "manual_stop_mismatch",
    "replay_mismatch",
    "cross_request_isolation_mismatch",
    "opaque_ambiguity_mismatch",
    "expected_totals_mismatch",
    "hard_zero_boundary_mismatch",
    "safe_evidence_mismatch",
    "cleanup_incomplete"
  ]);
  return error instanceof SafeProofError && allowed.has(error.safeReason)
    ? error.safeReason
    : "safe_evidence_mismatch";
}

function proofArgs(stage, requestRef, execute = false) {
  const args = ["--stage", stage, "--request", requestRef, "--proof", PROOF_PATH, "--env-label", "isolated_non_live"];
  if (!execute) return ["--dry-run", ...args];
  const executeArgs = [
    "--execute",
    ...args,
    "--acknowledge-irreversible",
    ACKNOWLEDGEMENT,
    "--latest-dry-run-runnable"
  ];
  if (stage !== "provider") executeArgs.push("--prior-stage-satisfied");
  return executeArgs;
}

async function waitForPostgrest(url, originalFetch) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await originalFetch(url);
      if (response.status >= 200 && response.status < 500) return;
    } catch {
      // The disposable service may still be starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new SafeProofError("isolated_postgrest_not_ready");
}

function createIsolatedStackContext(workdir) {
  const suffix = createHash("sha256").update(workdir).digest("hex").slice(0, 12);
  return {
    workdir,
    names: {
      network: `nm-g5d-proof-net-${suffix}`,
      database: `nm-g5d-proof-db-${suffix}`,
      postgrest: `nm-g5d-proof-rest-${suffix}`
    },
    password: createHash("sha256").update(`password:${workdir}`).digest("hex"),
    jwtSecret: createHash("sha256").update(`jwt:${workdir}`).digest("hex")
  };
}

function injectBootstrapFailure(failurePoint, expectedPoint) {
  if (failurePoint === expectedPoint) throw new SafeProofError(INJECTED_BOOTSTRAP_FAILURE);
}

function startIsolatedStack(stack, failurePoint = null) {
  const dataDir = join(stack.workdir, "database");

  docker(["image", "inspect", POSTGRES_IMAGE], { safeReason: "isolated_substrate_command_failed" });
  docker(["image", "inspect", POSTGREST_IMAGE], { safeReason: "isolated_substrate_command_failed" });
  injectBootstrapFailure(failurePoint, "before-network");
  docker(["network", "create", stack.names.network], {
    safeReason: "isolated_substrate_command_failed"
  });
  injectBootstrapFailure(failurePoint, "after-network");
  docker(
    [
      "run",
      "-d",
      "--name",
      stack.names.database,
      "--network",
      stack.names.network,
      "--network-alias",
      "db",
      "-e",
      `POSTGRES_PASSWORD=${stack.password}`,
      "-v",
      `${dataDir}:/var/lib/postgresql/data`,
      POSTGRES_IMAGE
    ],
    { safeReason: "isolated_substrate_command_failed" }
  );
  injectBootstrapFailure(failurePoint, "after-database");

  for (let attempt = 0; attempt < 120; attempt += 1) {
    // pg_isready can briefly succeed against the image's temporary init server.
    // Docker healthy is only reached after the entrypoint has finished init.
    const ready = docker(["inspect", "-f", "{{.State.Health.Status}}", stack.names.database], {
      allowFailure: true
    });
    if (ready === "healthy") return;
    execFileSync("sleep", ["0.25"], { stdio: "ignore" });
  }
  throw new SafeProofError("isolated_database_not_ready");
}

function applySql(databaseName, path, variable, safeReason) {
  const input = readFileSync(path);
  docker(
    ["exec", "-i", databaseName, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-v", `${variable}=1`, "-U", "supabase_admin", "-d", "postgres"],
    { input, safeReason }
  );
}

function applyMigrations(databaseName, workdir, failurePoint = null) {
  const files = migrationFiles();
  assertProof(files.length === 27, "migration_chain_mismatch");
  assertProof(files.every((name, index) => name.startsWith(String(index + 1).padStart(4, "0") + "_")), "migration_chain_mismatch");

  const copyDir = join(workdir, "migrations");
  cpSync(MIGRATIONS_DIR, copyDir, { recursive: true, filter: (source) => !source.includes("/.temp/") });
  for (const [index, name] of files.entries()) {
    const version = name.slice(0, 4);
    const sql = readFileSync(join(copyDir, name), "utf8");
    const recordedName = name.replace(/'/g, "''");
    const wrapped = `\\set VERBOSITY verbose\nbegin;\n${sql}\ninsert into supabase_migrations.schema_migrations(version, statements, name) values ('${version}', null, '${recordedName}');\ncommit;\n`;
    docker(
      ["exec", "-i", databaseName, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "supabase_admin", "-d", "postgres"],
      { input: wrapped, safeReason: "isolated_migration_apply_failed" }
    );
    if (index === 0) injectBootstrapFailure(failurePoint, "during-migration");
  }
}

function startPostgrest(stack, failurePoint = null) {
  const dbUri = `postgres://supabase_admin:${stack.password}@db:5432/postgres`;
  docker(
    [
      "run",
      "-d",
      "--name",
      stack.names.postgrest,
      "--network",
      stack.names.network,
      "-p",
      "127.0.0.1::3000",
      "-e",
      `PGRST_DB_URI=${dbUri}`,
      "-e",
      "PGRST_DB_SCHEMAS=public",
      "-e",
      "PGRST_DB_ANON_ROLE=anon",
      "-e",
      `PGRST_JWT_SECRET=${stack.jwtSecret}`,
      POSTGREST_IMAGE
    ],
    { safeReason: "isolated_substrate_command_failed" }
  );
  injectBootstrapFailure(failurePoint, "after-postgrest");
  const port = docker([
    "inspect",
    "-f",
    '{{(index (index .NetworkSettings.Ports "3000/tcp") 0).HostPort}}',
    stack.names.postgrest
  ]);
  assertProof(/^\d+$/.test(port), "isolated_postgrest_not_ready");
  return `http://127.0.0.1:${port}`;
}

function inspectStackInventory(stack) {
  const containerNames = docker(["container", "ls", "-a", "--format", "{{.Names}}"], {
    safeReason: "cleanup_incomplete"
  })
    .split("\n")
    .filter((name) => name === stack.names.database || name === stack.names.postgrest);
  const networkNames = docker(["network", "ls", "--format", "{{.Name}}"], {
    safeReason: "cleanup_incomplete"
  })
    .split("\n")
    .filter((name) => name === stack.names.network);
  return {
    containers: containerNames.length,
    networks: networkNames.length,
    tempWorkdirs: existsSync(stack.workdir) ? 1 : 0
  };
}

function inspectAllProofResources() {
  const containers = docker(["container", "ls", "-a", "--format", "{{.Names}}"], {
    safeReason: "cleanup_incomplete"
  })
    .split("\n")
    .filter((name) => name.startsWith("nm-g5d-proof-db-") || name.startsWith("nm-g5d-proof-rest-")).length;
  const networks = docker(["network", "ls", "--format", "{{.Name}}"], {
    safeReason: "cleanup_incomplete"
  })
    .split("\n")
    .filter((name) => name.startsWith("nm-g5d-proof-net-")).length;
  const tempWorkdirs = readdirSync(tmpdir()).filter((name) =>
    name.startsWith("native-minute-g5d-five-stage-")
  ).length;
  return { containers, networks, tempWorkdirs, backups: 0 };
}

function verifyStackAbsent(stack) {
  const inventory = inspectStackInventory(stack);
  return inventory.containers === 0 && inventory.networks === 0 && inventory.tempWorkdirs === 0;
}

function cleanupStack(stack, options = {}) {
  if (
    !stack ||
    dirname(resolve(stack.workdir)) !== resolve(tmpdir()) ||
    !basename(stack.workdir).startsWith("native-minute-g5d-five-stage-")
  ) {
    return false;
  }
  docker(["rm", "-f", stack.names.postgrest], { allowFailure: true });
  docker(["rm", "-f", stack.names.database], { allowFailure: true });
  docker(["network", "rm", stack.names.network], { allowFailure: true });
  try {
    rmSync(stack.workdir, { recursive: true, force: true });
  } catch {
    docker(
      ["run", "--rm", "-v", `${stack.workdir}:/proof-work`, POSTGRES_IMAGE, "bash", "-lc", "find /proof-work -mindepth 1 -delete"],
      { allowFailure: true }
    );
    try {
      rmSync(stack.workdir, { recursive: true, force: true });
    } catch {
      return false;
    }
  }
  if (options.simulateVerificationFailure) return false;
  try {
    return verifyStackAbsent(stack);
  } catch {
    return false;
  }
}

function runPartialStackProbe(failurePoint) {
  const workdir = mkdtempSync(join(tmpdir(), "native-minute-g5d-five-stage-"));
  const stack = createIsolatedStackContext(workdir);
  let injectedFailureObserved = false;
  let firstCleanupVerified = false;
  let repeatedCleanupVerified = false;

  try {
    startIsolatedStack(stack, failurePoint);
    if (failurePoint === "after-postgrest") startPostgrest(stack, failurePoint);
    if (failurePoint === "during-migration") {
      applySql(
        stack.names.database,
        SQL_PATH,
        "g5d_five_stage_bootstrap",
        "isolated_fixture_setup_failed"
      );
      applyMigrations(stack.names.database, stack.workdir, failurePoint);
    }
    throw new SafeProofError("safe_evidence_mismatch");
  } catch (error) {
    injectedFailureObserved =
      error instanceof SafeProofError && error.safeReason === INJECTED_BOOTSTRAP_FAILURE;
  } finally {
    firstCleanupVerified = cleanupStack(stack);
    repeatedCleanupVerified = cleanupStack(stack);
  }

  const inventory = inspectStackInventory(stack);
  assertProof(injectedFailureObserved, "safe_evidence_mismatch");
  assertProof(firstCleanupVerified && repeatedCleanupVerified, "cleanup_incomplete");
  assertProof(
    inventory.containers === 0 && inventory.networks === 0 && inventory.tempWorkdirs === 0,
    "cleanup_incomplete"
  );
  return {
    injectedFailureObserved,
    containers: inventory.containers,
    networks: inventory.networks,
    tempWorkdirs: inventory.tempWorkdirs,
    repeatedCleanupVerified
  };
}

function runCleanupVerificationFailureProbe() {
  const workdir = mkdtempSync(join(tmpdir(), "native-minute-g5d-five-stage-"));
  const stack = createIsolatedStackContext(workdir);
  let destroyedWithFailedVerification = true;
  let finalCleanupVerified = false;

  try {
    startIsolatedStack(stack, "after-network");
  } catch (error) {
    assertProof(
      error instanceof SafeProofError && error.safeReason === INJECTED_BOOTSTRAP_FAILURE,
      "safe_evidence_mismatch"
    );
  } finally {
    destroyedWithFailedVerification = cleanupStack(stack, { simulateVerificationFailure: true });
    finalCleanupVerified = cleanupStack(stack);
  }

  assertProof(!destroyedWithFailedVerification && finalCleanupVerified, "cleanup_incomplete");
  return { isolatedStackDestroyed: destroyedWithFailedVerification, finalCleanupVerified };
}

function runPartialStackCleanupProbes() {
  const result = {
    mode: PARTIAL_STACK_PROBE_MODE,
    status: "FAIL",
    probes: {},
    aggregate: { containers: null, networks: null, tempWorkdirs: null, backups: 0 },
    isolatedStackDestroyedRequiresVerifiedAbsence: false,
    processDestructiveGuard: { before: "set", after: "set", enableCount: 0 },
    redactionSentinelMatches: 0,
    failureReason: null
  };
  const originalGuard = process.env[GUARD];

  try {
    assertProof(originalGuard === undefined, "hard_zero_boundary_mismatch");
    result.processDestructiveGuard.before = "unset";
    for (const failurePoint of [
      "before-network",
      "after-network",
      "after-database",
      "after-postgrest",
      "during-migration"
    ]) {
      result.probes[failurePoint] = runPartialStackProbe(failurePoint);
    }
    const verificationFailure = runCleanupVerificationFailureProbe();
    result.probes.verificationFailure = verificationFailure;
    result.isolatedStackDestroyedRequiresVerifiedAbsence =
      verificationFailure.isolatedStackDestroyed === false && verificationFailure.finalCleanupVerified;
    result.aggregate = inspectAllProofResources();
    assertProof(
      result.aggregate.containers === 0 &&
        result.aggregate.networks === 0 &&
        result.aggregate.tempWorkdirs === 0 &&
        result.isolatedStackDestroyedRequiresVerifiedAbsence,
      "cleanup_incomplete"
    );
    result.status = "PASS";
  } catch (error) {
    result.failureReason = fixedFailureReason(error);
  } finally {
    if (process.env[GUARD] !== originalGuard) result.processDestructiveGuard.enableCount += 1;
    if (originalGuard === undefined) delete process.env[GUARD];
    else process.env[GUARD] = originalGuard;
    result.processDestructiveGuard.after = process.env[GUARD] === undefined ? "unset" : "set";
    if (result.processDestructiveGuard.enableCount !== 0 || result.processDestructiveGuard.after !== "unset") {
      result.status = "FAIL";
      result.failureReason = "hard_zero_boundary_mismatch";
    }
  }

  const serialized = JSON.stringify(result);
  result.redactionSentinelMatches = [
    resolve(tmpdir()),
    "native-minute-g5d-five-stage-",
    "nm-g5d-proof-net-",
    "nm-g5d-proof-db-",
    "nm-g5d-proof-rest-"
  ].filter((sentinel) => serialized.includes(sentinel)).length;
  if (result.redactionSentinelMatches !== 0) {
    result.status = "FAIL";
    result.failureReason = "safe_evidence_mismatch";
  }
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "PASS") process.exitCode = 1;
}

async function executeConnectedProof(baseUrl, jwt, safeResult) {
  const proofEnv = {
    NEXT_PUBLIC_SUPABASE_URL: baseUrl,
    SUPABASE_SERVICE_ROLE_KEY: jwt,
    [GUARD]: "1"
  };
  const productionFactoryCalls = { provider: 0, storage: 0, auth: 0, repository: 0 };
  const fakePresent = {
    provider: new Set(Object.values(FIXTURES).map((fixture) => fixture.providerRef)),
    storage: new Set(Object.values(FIXTURES).map((fixture) => fixture.storageKey))
  };
  const loss = { provider: false, storage: false, database: false, auth: false, completion: false };

  const [
    { createClient },
    { parseArgs, runAccountDeletionOperator },
    { createAccountDeletionProviderOperatorBridge },
    { createAccountDeletionStorageOperatorBridge },
    { createAccountDeletionDatabaseOperatorBridge },
    { createAccountDeletionAuthOperatorBridge },
    { createAccountDeletionCompletionOperatorBridge },
    { createAccountDeletionProviderDurableRepository },
    { createAccountDeletionStorageDurableRepository },
    { createAccountDeletionDatabaseFinalizerRepository },
    { createAccountDeletionAuthDurableRepository },
    { createAccountDeletionCompletionRepository }
  ] = await Promise.all([
    import("@supabase/supabase-js"),
    import("./account-deletion-operator-runner.mjs"),
    import("../services/account-deletion/account-deletion-provider-operator.service.ts"),
    import("../services/account-deletion/account-deletion-storage-operator.service.ts"),
    import("../services/account-deletion/account-deletion-database-operator.service.ts"),
    import("../services/account-deletion/account-deletion-auth-operator.service.ts"),
    import("../services/account-deletion/account-deletion-completion-operator.service.ts"),
    import("../services/account-deletion/account-deletion-provider-durable.repository.ts"),
    import("../services/account-deletion/account-deletion-storage-durable.repository.ts"),
    import("../services/account-deletion/account-deletion-database-finalizer.repository.ts"),
    import("../services/account-deletion/account-deletion-auth-durable.repository.ts"),
    import("../services/account-deletion/account-deletion-completion.repository.ts")
  ]);

  const client = createClient(baseUrl, jwt, { auth: { persistSession: false, autoRefreshToken: false } });
  const providerRepository = createAccountDeletionProviderDurableRepository(client);
  const storageRepository = createAccountDeletionStorageDurableRepository(client);
  const baseDatabaseRepository = createAccountDeletionDatabaseFinalizerRepository(client);
  const authRepository = createAccountDeletionAuthDurableRepository(client);
  const baseCompletionRepository = createAccountDeletionCompletionRepository(client);

  const providerAdapter = {
    async deleteVoice({ providerResourceId }) {
      safeResult.fakeDispatchCounts.providerDelete += 1;
      if (providerResourceId === FIXTURES.manual.providerRef) return { kind: "permission_denied" };
      fakePresent.provider.delete(providerResourceId);
      if (providerResourceId === FIXTURES.recovery.providerRef && !loss.provider) {
        loss.provider = true;
        safeResult.responseLossInjected += 1;
        throw new Error("proof_response_lost");
      }
      return { kind: "deleted" };
    },
    async reconcileVoiceAbsence({ providerResourceId }) {
      safeResult.fakeDispatchCounts.providerGetReconcile += 1;
      return fakePresent.provider.has(providerResourceId)
        ? { kind: "present", ownerSignal: "unknown" }
        : { kind: "verified_absent" };
    }
  };
  const storageAdapter = {
    async listOwnedInventory(userId) {
      safeResult.fakeDispatchCounts.storageInventoryReads += 1;
      const fixture = Object.values(FIXTURES).find((candidate) => candidate.userId === userId);
      assertProof(Boolean(fixture), "safe_evidence_mismatch");
      return {
        recordings: [],
        "script-audios": [],
        "voice-samples": [fixture.storageKey],
        "voice-consents": []
      };
    },
    async deleteObject({ objectKey }) {
      safeResult.fakeDispatchCounts.storageDelete += 1;
      fakePresent.storage.delete(objectKey);
      if (objectKey === FIXTURES.recovery.storageKey && !loss.storage) {
        loss.storage = true;
        safeResult.responseLossInjected += 1;
        throw new Error("proof_response_lost");
      }
      return { kind: "request_succeeded" };
    },
    async verifyObjectAbsence({ objectKey }) {
      safeResult.fakeDispatchCounts.storageInfoVerification += 1;
      return { kind: fakePresent.storage.has(objectKey) ? "present" : "absent" };
    }
  };
  const authAdapter = {
    async getUserById(targetUserId) {
      safeResult.fakeDispatchCounts.authGet += 1;
      const { data, error } = await client.rpc("g5d_five_stage_proof_auth_user_exists", {
        p_target_user_id: targetUserId
      });
      assertProof(!error && typeof data === "boolean", "safe_evidence_mismatch");
      return { kind: data ? "present" : "verified_absent" };
    },
    async deleteUser(targetUserId) {
      safeResult.fakeDispatchCounts.authDelete += 1;
      const { data, error } = await client.rpc("g5d_five_stage_proof_delete_auth_user", {
        p_target_user_id: targetUserId
      });
      assertProof(!error && data === true, "safe_evidence_mismatch");
      if (targetUserId === FIXTURES.recovery.userId && !loss.auth) {
        loss.auth = true;
        safeResult.responseLossInjected += 1;
        throw new Error("proof_response_lost");
      }
      return { kind: "observed" };
    }
  };

  const databaseRepository = {
    ...baseDatabaseRepository,
    async finalizeDatabaseStage(input) {
      safeResult.fakeDispatchCounts.databaseFinalizerRpc += 1;
      const result = await baseDatabaseRepository.finalizeDatabaseStage(input);
      if (input.deletionRequestId === FIXTURES.recovery.requestId && !loss.database) {
        loss.database = true;
        safeResult.responseLossInjected += 1;
        throw new Error("proof_response_lost");
      }
      return result;
    }
  };
  const completionRepository = {
    ...baseCompletionRepository,
    async finalizeCompletion(deletionRequestId) {
      safeResult.fakeDispatchCounts.completionRpc += 1;
      const result = await baseCompletionRepository.finalizeCompletion(deletionRequestId);
      if (deletionRequestId === FIXTURES.recovery.requestId && !loss.completion) {
        loss.completion = true;
        safeResult.responseLossInjected += 1;
        throw new Error("proof_response_lost");
      }
      return result;
    }
  };

  const poison = (kind) => () => {
    productionFactoryCalls[kind] += 1;
    throw new SafeProofError("hard_zero_boundary_mismatch");
  };
  const bridges = {
    provider: createAccountDeletionProviderOperatorBridge({
      env: proofEnv,
      repository: providerRepository,
      providerAdapter,
      createRepository: poison("repository"),
      createProviderAdapter: poison("provider")
    }),
    storage: createAccountDeletionStorageOperatorBridge({
      env: proofEnv,
      repository: storageRepository,
      storageAdapter,
      createRepository: poison("repository"),
      createStorageAdapter: poison("storage")
    }),
    database: createAccountDeletionDatabaseOperatorBridge({
      env: proofEnv,
      repository: databaseRepository,
      createRepository: poison("repository")
    }),
    auth: createAccountDeletionAuthOperatorBridge({
      env: proofEnv,
      repository: authRepository,
      authAdapter,
      createRepository: poison("repository"),
      createAuthAdapter: poison("auth")
    }),
    completion: createAccountDeletionCompletionOperatorBridge({
      env: proofEnv,
      repository: completionRepository,
      createRepository: poison("repository")
    })
  };

  function composedBridge(overrides = {}) {
    const selected = { ...bridges, ...overrides };
    const rawStageServices = Object.assign({}, ...Object.values(selected).map((bridge) => bridge.stageServices));
    const stageServices = Object.fromEntries(
      Object.entries(rawStageServices).map(([stage, service]) => [
        stage,
        async (input) => {
          safeResult.stageServiceCalls[stage] += 1;
          activeInvocationServiceCalls += 1;
          if (activeInvocationServiceCalls > 1) safeResult.sameInvocationChaining += 1;
          return service(input);
        }
      ])
    );
    return {
      stageServices,
      requestResolver(input) {
        return selected[input.stage]?.requestResolver(input) ??
          Promise.resolve({ ok: false, safeReasonCode: "stage_service_unavailable" });
      }
    };
  }

  let activeInvocationServiceCalls = 0;
  async function singleStage(stage, requestRef, options = {}) {
    const bridge = composedBridge(options.bridgeOverrides);
    const dryRun = await runAccountDeletionOperator(parseArgs(proofArgs(stage, requestRef, false)), {
      env: options.env ?? proofEnv,
      ...bridge
    });
    assertProof(dryRun.status === "ready_for_dry_run", "canonical_ceremony_mismatch");
    safeResult.stageInvocations.immediatelyPrecedingDryRuns += 1;

    activeInvocationServiceCalls = 0;
    safeResult.stageInvocations[stage] += 1;
    safeResult.stageInvocations.totalExecuteAttempts += 1;
    const summary = await runAccountDeletionOperator(parseArgs(proofArgs(stage, requestRef, true)), {
      env: options.env ?? proofEnv,
      ...bridge
    });
    assertProof(activeInvocationServiceCalls <= 1, "canonical_ceremony_mismatch");
    if (summary.progress?.terminal === true) safeResult.stageTerminalCounts[stage] += 1;
    return summary;
  }

  async function safeState(scenario) {
    const { data, error } = await client.rpc("g5d_five_stage_proof_safe_state", { p_scenario_slug: scenario });
    assertProof(!error && Array.isArray(data) && data.length === 1, "safe_evidence_mismatch");
    return data[0];
  }

  async function isolatedCall(scenario, stage, callback) {
    const other = scenario === "clean" ? "recovery" : "clean";
    const beforeOther = await safeState(other);
    const result = await callback();
    const afterOther = await safeState(other);
    assertProof(beforeOther.state_fingerprint === afterOther.state_fingerprint, "cross_request_isolation_mismatch");
    assertProof(result.stage === stage && result.mode === "execute", "canonical_ceremony_mismatch");
    return result;
  }

  const noGuard = await singleStage("provider", FIXTURES.clean.requestId, { env: { ...proofEnv, [GUARD]: undefined } });
  assertProof(noGuard.status === "blocked" && noGuard.safeReasonCode === "destructive_guard_missing", "canonical_ceremony_mismatch");

  activeInvocationServiceCalls = 0;
  safeResult.stageInvocations.invalidMultiStage += 1;
  safeResult.stageInvocations.totalExecuteAttempts += 1;
  const invalidMulti = await runAccountDeletionOperator(
    parseArgs([
      "--execute",
      "--stage",
      "provider",
      "--stage",
      "storage",
      "--request",
      FIXTURES.clean.requestId,
      "--proof",
      PROOF_PATH,
      "--acknowledge-irreversible",
      ACKNOWLEDGEMENT,
      "--latest-dry-run-runnable"
    ]),
    { env: proofEnv, ...composedBridge() }
  );
  assertProof(invalidMulti.status === "blocked" && activeInvocationServiceCalls === 0, "canonical_ceremony_mismatch");

  for (const stage of ["storage", "database", "auth", "completion"]) {
    const beforeRpc = {
      db: safeResult.fakeDispatchCounts.databaseFinalizerRpc,
      authGet: safeResult.fakeDispatchCounts.authGet,
      authDelete: safeResult.fakeDispatchCounts.authDelete,
      completion: safeResult.fakeDispatchCounts.completionRpc
    };
    const blocked = await singleStage(stage, FIXTURES.manual.requestId);
    const afterRpc = {
      db: safeResult.fakeDispatchCounts.databaseFinalizerRpc,
      authGet: safeResult.fakeDispatchCounts.authGet,
      authDelete: safeResult.fakeDispatchCounts.authDelete,
      completion: safeResult.fakeDispatchCounts.completionRpc
    };
    assertProof(blocked.status === "blocked" && sameJson(beforeRpc, afterRpc), "prior_stage_enforcement_mismatch");
    safeResult.priorStageBlocks += 1;
  }

  const wrongPairBridge = createAccountDeletionProviderOperatorBridge({
    env: proofEnv,
    lookupRequest: async () => ({
      rows: [
        {
          id: FIXTURES.clean.requestId,
          user_id: FIXTURES.recovery.userId,
          anonymized_user_ref: AMBIGUOUS_OPAQUE_REF,
          status: "confirmed",
          provider_cleanup_status: "pending"
        }
      ],
      failed: false
    }),
    repository: providerRepository,
    providerAdapter,
    createRepository: poison("repository"),
    createProviderAdapter: poison("provider")
  });
  const wrongPairExternalBefore = safeResult.fakeDispatchCounts.providerDelete + safeResult.fakeDispatchCounts.providerGetReconcile;
  const wrongPairStateBefore = await safeState("clean");
  const wrongPair = await singleStage("provider", FIXTURES.clean.requestId, {
    bridgeOverrides: { provider: wrongPairBridge }
  });
  const wrongPairStateAfter = await safeState("clean");
  assertProof(
    wrongPair.status === "blocked" &&
      wrongPairExternalBefore === safeResult.fakeDispatchCounts.providerDelete + safeResult.fakeDispatchCounts.providerGetReconcile &&
      wrongPairStateBefore.state_fingerprint === wrongPairStateAfter.state_fingerprint,
    "cross_request_isolation_mismatch"
  );
  safeResult.crossRequestBlocks += 1;

  const opaqueServiceBefore = { ...safeResult.stageServiceCalls };
  const opaqueStateBefore = await safeState("clean");
  const opaque = await singleStage("provider", AMBIGUOUS_OPAQUE_REF);
  const opaqueStateAfter = await safeState("clean");
  assertProof(
    opaque.status === "blocked" &&
      sameJson(opaqueServiceBefore, safeResult.stageServiceCalls) &&
      opaqueStateBefore.state_fingerprint === opaqueStateAfter.state_fingerprint,
    "opaque_ambiguity_mismatch"
  );
  safeResult.opaqueAmbiguityBlocks += 1;

  const assertMarker = (summary, marker) =>
    assertProof(summary.progress?.marker === marker, "canonical_stage_semantics_mismatch");
  const cleanCall = (stage) =>
    isolatedCall("clean", stage, () => singleStage(stage, FIXTURES.clean.requestId));
  const recoveryCall = (stage) =>
    isolatedCall("recovery", stage, () => singleStage(stage, FIXTURES.recovery.requestId));

  assertMarker(await cleanCall("provider"), "seal_only");
  assertMarker(await cleanCall("provider"), "progressed");
  assertMarker(await cleanCall("provider"), "target_verified");
  assertMarker(await cleanCall("provider"), "terminal");
  let state = await safeState("clean");
  assertProof(state.provider_terminal === true && state.provider_target_count === 1, "persisted_handoff_mismatch");
  const providerReplayBefore = safeResult.fakeDispatchCounts.providerDelete + safeResult.fakeDispatchCounts.providerGetReconcile;
  assertMarker(await cleanCall("provider"), "terminal");
  assertProof(providerReplayBefore === safeResult.fakeDispatchCounts.providerDelete + safeResult.fakeDispatchCounts.providerGetReconcile, "replay_mismatch");
  safeResult.replayCounts.provider += 1;

  assertMarker(await cleanCall("storage"), "seal_only");
  assertMarker(await cleanCall("storage"), "progressed");
  assertMarker(await cleanCall("storage"), "target_verified");
  assertMarker(await cleanCall("storage"), "terminal");
  state = await safeState("clean");
  assertProof(state.storage_terminal === true && state.storage_target_count === 1, "persisted_handoff_mismatch");
  const storageReplayBefore = {
    inventory: safeResult.fakeDispatchCounts.storageInventoryReads,
    deletes: safeResult.fakeDispatchCounts.storageDelete,
    verifies: safeResult.fakeDispatchCounts.storageInfoVerification
  };
  assertMarker(await cleanCall("storage"), "terminal");
  assertProof(
    sameJson(storageReplayBefore, {
      inventory: safeResult.fakeDispatchCounts.storageInventoryReads,
      deletes: safeResult.fakeDispatchCounts.storageDelete,
      verifies: safeResult.fakeDispatchCounts.storageInfoVerification
    }),
    "replay_mismatch"
  );
  safeResult.replayCounts.storage += 1;

  assertMarker(await cleanCall("database"), "terminal");
  state = await safeState("clean");
  assertProof(state.database_terminal === true, "persisted_handoff_mismatch");
  const cleanDbFingerprint = state.database_terminal_fingerprint;
  assertMarker(await cleanCall("database"), "terminal");
  state = await safeState("clean");
  assertProof(state.database_terminal_fingerprint === cleanDbFingerprint, "replay_mismatch");
  safeResult.replayCounts.database += 1;

  const cleanAuthBefore = {
    get: safeResult.fakeDispatchCounts.authGet,
    del: safeResult.fakeDispatchCounts.authDelete
  };
  assertMarker(await cleanCall("auth"), "terminal");
  state = await safeState("clean");
  assertProof(
    state.auth_terminal === true && state.auth_user_present === false &&
      safeResult.fakeDispatchCounts.authGet - cleanAuthBefore.get === 2 &&
      safeResult.fakeDispatchCounts.authDelete - cleanAuthBefore.del === 1,
    "persisted_handoff_mismatch"
  );
  const authReplayBefore = {
    get: safeResult.fakeDispatchCounts.authGet,
    del: safeResult.fakeDispatchCounts.authDelete
  };
  assertMarker(await cleanCall("auth"), "terminal");
  assertProof(
    authReplayBefore.get === safeResult.fakeDispatchCounts.authGet &&
      authReplayBefore.del === safeResult.fakeDispatchCounts.authDelete,
    "replay_mismatch"
  );
  safeResult.replayCounts.auth += 1;

  assertMarker(await cleanCall("completion"), "terminal");
  state = await safeState("clean");
  assertProof(state.completion_terminal === true, "persisted_handoff_mismatch");
  const cleanCompletionFingerprint = state.completion_terminal_fingerprint;
  assertMarker(await cleanCall("completion"), "terminal");
  state = await safeState("clean");
  assertProof(state.completion_terminal_fingerprint === cleanCompletionFingerprint, "replay_mismatch");
  safeResult.replayCounts.completion += 1;

  assertMarker(await recoveryCall("provider"), "seal_only");
  assertMarker(await recoveryCall("provider"), "retry_later");
  const recoveryProviderDeleteCount = safeResult.fakeDispatchCounts.providerDelete;
  assertMarker(await recoveryCall("provider"), "target_verified");
  assertProof(safeResult.fakeDispatchCounts.providerDelete === recoveryProviderDeleteCount, "response_loss_recovery_mismatch");
  assertMarker(await recoveryCall("provider"), "terminal");
  state = await safeState("recovery");
  assertProof(state.provider_terminal === true, "response_loss_recovery_mismatch");
  safeResult.responseLossRecovered += 1;

  assertMarker(await recoveryCall("storage"), "seal_only");
  assertMarker(await recoveryCall("storage"), "retry_later");
  const recoveryStorageDeleteCount = safeResult.fakeDispatchCounts.storageDelete;
  assertMarker(await recoveryCall("storage"), "target_verified");
  assertProof(safeResult.fakeDispatchCounts.storageDelete === recoveryStorageDeleteCount, "response_loss_recovery_mismatch");
  assertMarker(await recoveryCall("storage"), "terminal");
  state = await safeState("recovery");
  assertProof(state.storage_terminal === true, "response_loss_recovery_mismatch");
  safeResult.responseLossRecovered += 1;

  const recoveryDbLost = await recoveryCall("database");
  assertProof(recoveryDbLost.status === "manual_required", "response_loss_recovery_mismatch");
  state = await safeState("recovery");
  assertProof(state.database_terminal === true, "response_loss_recovery_mismatch");
  const recoveryDbFingerprint = state.database_terminal_fingerprint;
  assertMarker(await recoveryCall("database"), "terminal");
  state = await safeState("recovery");
  assertProof(state.database_terminal_fingerprint === recoveryDbFingerprint, "response_loss_recovery_mismatch");
  safeResult.responseLossRecovered += 1;

  const recoveryAuthDeleteBefore = safeResult.fakeDispatchCounts.authDelete;
  const recoveryAuthLost = await recoveryCall("auth");
  assertProof(recoveryAuthLost.status === "failed", "response_loss_recovery_mismatch");
  const recoveryAuthDeleteAfterLoss = safeResult.fakeDispatchCounts.authDelete;
  assertProof(recoveryAuthDeleteAfterLoss - recoveryAuthDeleteBefore === 1, "response_loss_recovery_mismatch");
  assertMarker(await recoveryCall("auth"), "terminal");
  assertProof(safeResult.fakeDispatchCounts.authDelete === recoveryAuthDeleteAfterLoss, "response_loss_recovery_mismatch");
  state = await safeState("recovery");
  assertProof(state.auth_terminal === true && state.auth_user_present === false, "response_loss_recovery_mismatch");
  safeResult.responseLossRecovered += 1;

  const recoveryCompletionLost = await recoveryCall("completion");
  assertProof(recoveryCompletionLost.status === "manual_required", "response_loss_recovery_mismatch");
  state = await safeState("recovery");
  assertProof(state.completion_terminal === true, "response_loss_recovery_mismatch");
  const recoveryCompletionFingerprint = state.completion_terminal_fingerprint;
  assertMarker(await recoveryCall("completion"), "terminal");
  state = await safeState("recovery");
  assertProof(state.completion_terminal_fingerprint === recoveryCompletionFingerprint, "response_loss_recovery_mismatch");
  safeResult.responseLossRecovered += 1;

  assertMarker(await singleStage("provider", FIXTURES.manual.requestId), "seal_only");
  assertMarker(await singleStage("provider", FIXTURES.manual.requestId), "manual_required");
  state = await safeState("manual");
  assertProof(state.manual_stop === true, "manual_stop_mismatch");
  safeResult.manualStops += 1;

  for (const scenario of ["clean", "recovery", "manual"]) {
    const aggregate = await safeState(scenario);
    safeResult.aggregateTargetCounts[scenario] = {
      provider: Number(aggregate.provider_target_count),
      storage: Number(aggregate.storage_target_count)
    };
  }
  const { data: verificationRows, error: verificationError } = await client.rpc(
    "g5d_five_stage_proof_final_verification"
  );
  assertProof(
    !verificationError && Array.isArray(verificationRows) && verificationRows.length === 1,
    "safe_evidence_mismatch"
  );
  const verification = verificationRows[0];
  safeResult.fakeDispatchCounts.isolatedAuthUsersDeleted = Number(verification.auth_fixture_deletions);
  safeResult.finalCompletionTerminal =
    verification.migration_chain_exact === true && Number(verification.completed_scenarios) === 2;
  assertProof(
    verification.migration_chain_exact === true && Number(verification.fixture_count) === 3 &&
      Number(verification.auth_fixture_deletions) === 2 && Number(verification.completed_scenarios) === 2 &&
      Number(verification.manual_scenarios) === 1,
    "safe_evidence_mismatch"
  );

  safeResult.stageInvocations.totalExecuteAttempts =
    Object.values(safeResult.stageInvocations).slice(0, 5).reduce((sum, count) => sum + count, 0) +
    safeResult.stageInvocations.invalidMultiStage;
  assertProof(sameJson(safeResult.stageInvocations, EXPECTED_STAGE_INVOCATIONS), "expected_totals_mismatch");
  assertProof(sameJson(safeResult.stageServiceCalls, EXPECTED_STAGE_SERVICE_CALLS), "expected_totals_mismatch");
  assertProof(sameJson(safeResult.stageTerminalCounts, EXPECTED_TERMINAL_COUNTS), "expected_totals_mismatch");
  assertProof(sameJson(safeResult.fakeDispatchCounts, EXPECTED_FAKE_DISPATCH_COUNTS), "expected_totals_mismatch");
  assertProof(
    safeResult.responseLossInjected === 5 && safeResult.responseLossRecovered === 5 &&
      safeResult.priorStageBlocks === 4 && safeResult.manualStops === 1 &&
      Object.values(safeResult.replayCounts).every((count) => count === 1) &&
      safeResult.crossRequestBlocks === 1 && safeResult.opaqueAmbiguityBlocks === 1,
    "expected_totals_mismatch"
  );
  assertProof(
    Object.values(productionFactoryCalls).every((count) => count === 0) &&
      safeResult.sameInvocationChaining === 0 && safeResult.finalCompletionTerminal,
    "hard_zero_boundary_mismatch"
  );
}

async function main() {
  const commitSha = run("git", ["rev-parse", "HEAD"], { safeReason: "checkpoint_mismatch" });
  const migrationSha = sha256File(join(MIGRATIONS_DIR, "0027_g5d_completion_foundation.sql"));
  const safeResult = safeResultSkeleton(commitSha, migrationSha);
  const originalCwd = process.cwd();
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalGuard = process.env[GUARD];
  let workdir = "";
  let stack = null;

  try {
    assertProof(commitSha === EXPECTED_COMMIT && migrationSha === EXPECTED_MIGRATION_SHA, "checkpoint_mismatch");
    assertProof(process.env[GUARD] === undefined, "hard_zero_boundary_mismatch");
    assertProof(process.cwd() === REPO_ROOT, "checkpoint_mismatch");
    workdir = mkdtempSync(join(tmpdir(), "native-minute-g5d-five-stage-"));
    stack = createIsolatedStackContext(workdir);
    assertProof(!workdir.startsWith(join(REPO_ROOT, "supabase", ".temp")), "hard_zero_boundary_mismatch");
    startIsolatedStack(stack);
    applySql(stack.names.database, SQL_PATH, "g5d_five_stage_bootstrap", "isolated_fixture_setup_failed");
    applyMigrations(stack.names.database, workdir);
    applySql(stack.names.database, SQL_PATH, "g5d_five_stage_fixture", "isolated_fixture_setup_failed");
    const baseUrl = startPostgrest(stack);
    await waitForPostgrest(baseUrl, originalFetch);

    const loopbackOrigin = new URL(baseUrl).origin;
    globalThis.fetch = async (input, init) => {
      const requestedUrl = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      if (requestedUrl.origin !== loopbackOrigin || !["127.0.0.1", "localhost", "::1"].includes(requestedUrl.hostname)) {
        throw new SafeProofError("loopback_boundary_violation");
      }
      if (requestedUrl.pathname === "/rest/v1") requestedUrl.pathname = "/";
      else if (requestedUrl.pathname.startsWith("/rest/v1/")) {
        requestedUrl.pathname = requestedUrl.pathname.slice("/rest/v1".length);
      }
      return originalFetch(requestedUrl, init);
    };
    const jwt = serviceRoleJwt(stack.jwtSecret);
    process.env.NEXT_PUBLIC_SUPABASE_URL = baseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = jwt;
    process.chdir(workdir);
    await executeConnectedProof(baseUrl, jwt, safeResult);
    safeResult.status = SUCCESS_STATUS;
  } catch (error) {
    safeResult.failureReason = fixedFailureReason(error);
    safeResult.focusedFindings.UNKNOWN = 1;
    safeResult.programFindings.UNKNOWN = 1;
  } finally {
    process.chdir(originalCwd);
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    try {
      safeResult.isolatedStackDestroyed = cleanupStack(stack);
    } catch {
      safeResult.isolatedStackDestroyed = false;
    }
    if (process.env[GUARD] !== originalGuard) {
      safeResult.processDestructiveGuardEnablements += 1;
      safeResult.status = "FAIL";
      safeResult.failureReason = "hard_zero_boundary_mismatch";
    }
    if (originalGuard === undefined) delete process.env[GUARD];
    else process.env[GUARD] = originalGuard;
    if (!safeResult.isolatedStackDestroyed) {
      safeResult.status = "FAIL";
      safeResult.failureReason = "cleanup_incomplete";
    }
  }

  const forbiddenSentinels = [
    ...Object.values(FIXTURES).flatMap((fixture) => Object.values(fixture)),
    AMBIGUOUS_OPAQUE_REF,
    "nm-sensitive-h@example.invalid",
    "nm-sensitive-r@example.invalid",
    "nm-sensitive-m@example.invalid"
  ];
  const serialized = JSON.stringify(safeResult);
  safeResult.redactionSentinelMatches = forbiddenSentinels.filter((sentinel) => serialized.includes(sentinel)).length;
  if (safeResult.redactionSentinelMatches !== 0) {
    safeResult.status = "FAIL";
    safeResult.failureReason = "safe_evidence_mismatch";
  }
  console.log(JSON.stringify(safeResult, null, 2));
  if (safeResult.status !== SUCCESS_STATUS) process.exitCode = 1;
}

if (process.argv.includes(PARTIAL_STACK_PROBE_ARG)) runPartialStackCleanupProbes();
else await main();
