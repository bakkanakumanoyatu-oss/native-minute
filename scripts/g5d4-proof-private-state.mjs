import {
  closeSync,
  constants as fsConstants,
  existsSync,
  fsyncSync,
  fstatSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  G5D4_CANONICAL_STAGING,
  G5D4_PROVENANCE,
  G5D4_SCHEMA_VERSIONS,
  canonicalJson,
  g5d4AliasRoleSchema,
  g5d4AuthorizationSchema,
  g5d4PrivateManifestSchema,
  hmacSha256Hex,
  safeDigestEqual,
  sha256Hex
} from "./g5d4-proof-contract.mjs";

const MODULE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RUN_PREFIX = "native-minute-g5d4-";
const SELF_TEST_RUN_PREFIX = "native-minute-g5d4-self-test-";
const KEY_FILENAME = "alias-key.bin";
const FILE_MODE = 0o600;
const DIRECTORY_MODE = 0o700;
const NO_FOLLOW = fsConstants.O_NOFOLLOW ?? 0;

export const G5D4_CONFIRMATION_PHRASE =
  "I CONFIRM G5D4 MICRO STEP FOR THE SEALED DISPOSABLE FIXTURE";

function isPathInside(candidate, parent) {
  const child = resolve(candidate);
  const root = resolve(parent);
  const rel = relative(root, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function fsyncDirectory(directory) {
  const fd = openSync(directory, fsConstants.O_RDONLY | NO_FOLLOW);
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function assertMode(stat, expected, label) {
  if ((stat.mode & 0o777) !== expected) throw new Error(`${label} permission mismatch`);
}

export function assertSecureRunDirectory(runDirectory, options = {}) {
  if (typeof runDirectory !== "string" || !isAbsolute(runDirectory)) {
    throw new Error("private run directory must be absolute");
  }
  if (!existsSync(runDirectory)) {
    if (options.allowMissing === true) return resolve(runDirectory);
    throw new Error("private run directory is missing");
  }

  const pathStat = lstatSync(runDirectory);
  if (pathStat.isSymbolicLink() || !pathStat.isDirectory()) {
    throw new Error("private run directory must be a real directory");
  }

  const canonicalRun = realpathSync(runDirectory);
  const canonicalTemp = realpathSync(tmpdir());
  const canonicalRepo = realpathSync(MODULE_ROOT);
  const permittedPrefix =
    basename(canonicalRun).startsWith(RUN_PREFIX) ||
    basename(canonicalRun).startsWith(SELF_TEST_RUN_PREFIX);

  if (
    !isPathInside(canonicalRun, canonicalTemp) ||
    isPathInside(canonicalRun, canonicalRepo) ||
    isPathInside(canonicalRun, join(canonicalRepo, "supabase", ".temp")) ||
    !permittedPrefix
  ) {
    throw new Error("private run directory containment refused");
  }

  assertMode(pathStat, DIRECTORY_MODE, "private run directory");
  return canonicalRun;
}

export function createPrivateRunDirectory(options = {}) {
  const purpose = options.runPurpose;
  if (![G5D4_PROVENANCE.live.runPurpose, G5D4_PROVENANCE.selfTest.runPurpose].includes(purpose)) {
    throw new Error("private run purpose required");
  }
  const prefix = purpose === G5D4_PROVENANCE.selfTest.runPurpose ? SELF_TEST_RUN_PREFIX : RUN_PREFIX;
  const directory = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(directory, { mode: DIRECTORY_MODE, recursive: true });
  const canonical = assertSecureRunDirectory(directory);
  fsyncDirectory(dirname(canonical));
  return canonical;
}

function assertSafePrivateFilename(filename) {
  if (
    typeof filename !== "string" ||
    !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(filename) ||
    filename === "." ||
    filename === ".."
  ) {
    throw new Error("private filename refused");
  }
}

export function assertSecurePrivateFile(filePath, runDirectory, expectedMode = FILE_MODE) {
  const canonicalRun = assertSecureRunDirectory(runDirectory);
  if (!isPathInside(filePath, canonicalRun) || dirname(resolve(filePath)) !== canonicalRun) {
    throw new Error("private file path escape refused");
  }
  const fileStat = lstatSync(filePath);
  if (fileStat.isSymbolicLink() || !fileStat.isFile() || fileStat.nlink !== 1) {
    throw new Error("private file must be a regular unlinked file");
  }
  assertMode(fileStat, expectedMode, "private file");
  return resolve(filePath);
}

function readSecureFile(filePath, runDirectory, encoding = null) {
  const securePath = assertSecurePrivateFile(filePath, runDirectory);
  const fd = openSync(securePath, fsConstants.O_RDONLY | NO_FOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1) throw new Error("private file changed during read");
    return readFileSync(fd, encoding ? { encoding } : undefined);
  } finally {
    closeSync(fd);
  }
}

export function readPrivateJson(runDirectory, filePath) {
  return JSON.parse(readSecureFile(filePath, runDirectory, "utf8"));
}

export function atomicPublishPrivateFile(runDirectory, filename, data, options = {}) {
  const canonicalRun = assertSecureRunDirectory(runDirectory);
  assertSafePrivateFilename(filename);
  const finalPath = join(canonicalRun, filename);
  if (existsSync(finalPath)) throw Object.assign(new Error("private file already exists"), { code: "EEXIST" });

  const temporaryName = `.g5d4-${randomBytes(12).toString("hex")}.tmp`;
  const temporaryPath = join(canonicalRun, temporaryName);
  let fd;
  let linked = false;
  try {
    fd = openSync(
      temporaryPath,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | NO_FOLLOW,
      options.mode ?? FILE_MODE
    );
    writeFileSync(fd, data);
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    linkSync(temporaryPath, finalPath);
    linked = true;
    unlinkSync(temporaryPath);
    fsyncDirectory(canonicalRun);
    assertSecurePrivateFile(finalPath, canonicalRun, options.mode ?? FILE_MODE);
    return finalPath;
  } catch (error) {
    if (fd !== undefined) closeSync(fd);
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
    if (linked && existsSync(finalPath)) {
      // Publication succeeded; never roll it back into a reusable name.
      fsyncDirectory(canonicalRun);
    }
    throw error;
  }
}

export function createAliasKey(runDirectory) {
  const key = randomBytes(32);
  const keyPath = atomicPublishPrivateFile(runDirectory, KEY_FILENAME, key);
  const persisted = readSecureFile(keyPath, runDirectory);
  if (persisted.length !== 32 || !persisted.equals(key)) throw new Error("alias key persistence mismatch");
  return keyPath;
}

export function readAliasKey(runDirectory) {
  const key = readSecureFile(join(assertSecureRunDirectory(runDirectory), KEY_FILENAME), runDirectory);
  if (key.length !== 32) throw new Error("alias key length mismatch");
  return key;
}

export function createAliasRegistry(key, options = {}) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error("alias key must be 32 bytes");
  const registry = new Map();
  const digestFn = options.digestFn ?? ((role, raw) => hmacSha256Hex(key, `alias:${role}`, raw));

  return {
    alias(role, raw) {
      const exactRole = g5d4AliasRoleSchema.parse(role);
      if (typeof raw !== "string" || raw.length === 0) throw new Error("alias raw value required");
      const alias = `g5d4_v1${digestFn(exactRole, raw)}`;
      const prior = registry.get(alias);
      const binding = `${exactRole}\0${raw}`;
      if (prior !== undefined && prior !== binding) throw new Error("alias collision detected");
      registry.set(alias, binding);
      return alias;
    },
    size() {
      return registry.size;
    }
  };
}

function assertNoCredentialMaterial(value) {
  const strings = [];
  const visit = (current, key = "") => {
    if (typeof current === "string") strings.push([key, current]);
    else if (Array.isArray(current)) current.forEach((item) => visit(item, key));
    else if (current && typeof current === "object") {
      Object.entries(current).forEach(([childKey, child]) => visit(child, childKey));
    }
  };
  visit(value);
  const prohibitedKey = /(?:api.?key|jwt|cookie|password|magic.?link|credential|token|secret)/i;
  const prohibitedValue = /(?:^sk-[A-Za-z0-9_-]{12,}|^eyJ[^.]+\.[^.]+\.[^.]+$|postgres(?:ql)?:\/\/|bearer\s+)/i;
  if (strings.some(([key, raw]) => prohibitedKey.test(key) || prohibitedValue.test(raw))) {
    throw new Error("credential material cannot enter private manifest");
  }
}

function manifestGenerationFilename(generation) {
  return `manifest-${String(generation).padStart(6, "0")}.json`;
}

function withoutFields(value, fields) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !fields.includes(key)));
}

function computeManifestGenerationDigest(manifest) {
  return sha256Hex(canonicalJson(withoutFields(manifest, ["generationDigest"])));
}

function computeManifestSealDigest(manifest, key) {
  return hmacSha256Hex(
    key,
    "manifest-seal",
    canonicalJson({ ...withoutFields(manifest, ["generationDigest", "manifestSealDigest"]), manifestSealDigest: null })
  );
}

function publishManifest(runDirectory, draft) {
  const manifest = {
    ...draft,
    generationDigest: computeManifestGenerationDigest({ ...draft, generationDigest: "".padStart(64, "0") })
  };
  g5d4PrivateManifestSchema.parse(manifest);
  const path = atomicPublishPrivateFile(
    runDirectory,
    manifestGenerationFilename(manifest.generation),
    `${canonicalJson(manifest)}\n`
  );
  const reread = JSON.parse(readSecureFile(path, runDirectory, "utf8"));
  if (canonicalJson(reread) !== canonicalJson(manifest)) throw new Error("manifest publish verification failed");
  return { path, manifest };
}

function createAliasesAndTargets(rawAuthorities, key) {
  const registry = createAliasRegistry(key);
  const fixtureA = registry.alias("fixture_a", rawAuthorities.fixtureAUserId);
  const fixtureB = registry.alias("fixture_b", rawAuthorities.fixtureBUserId);
  const providerResource = registry.alias("provider_resource", rawAuthorities.fixtureAProviderResourceId);
  const storageTargets = rawAuthorities.fixtureAStorageTargets.map(({ bucket, key: objectKey }) =>
    registry.alias("storage_target", `${bucket}\0${objectKey}`)
  );
  const request = registry.alias("request", rawAuthorities.deletionRequestRef);
  const targetSetRaw = canonicalJson({
    provider: rawAuthorities.fixtureAProviderResourceId,
    storage: rawAuthorities.fixtureAStorageTargets
  });
  const targetSet = registry.alias("target_set", targetSetRaw);

  return {
    aliases: { fixtureA, fixtureB, providerResource, storageTargets, request, targetSet },
    stageTargets: {
      provider_cleanup: {
        alias: providerResource,
        digest: hmacSha256Hex(key, "stage-target:provider", rawAuthorities.fixtureAProviderResourceId),
        count: 1
      },
      storage_cleanup: {
        alias: targetSet,
        digest: hmacSha256Hex(key, "stage-target:storage", rawAuthorities.fixtureAStorageTargets),
        count: 4
      },
      database_cleanup: {
        alias: fixtureA,
        digest: hmacSha256Hex(key, "stage-target:database", "D15:A1:R6"),
        count: 15
      },
      auth_cleanup: {
        alias: fixtureA,
        digest: hmacSha256Hex(key, "stage-target:auth", rawAuthorities.fixtureAUserId),
        count: 1
      },
      completion_verification: {
        alias: request,
        digest: hmacSha256Hex(key, "stage-target:completion", rawAuthorities.deletionRequestId),
        count: 1
      }
    }
  };
}

export function createInitialPrivateManifest(runDirectory, input) {
  const canonicalRun = assertSecureRunDirectory(runDirectory);
  if (readdirSync(canonicalRun).some((name) => name.startsWith("manifest-"))) {
    throw new Error("initial manifest already exists");
  }
  assertNoCredentialMaterial(input);
  const key = readAliasKey(canonicalRun);
  const runId = input.runId ?? `g5d4_run_${randomBytes(16).toString("hex")}`;
  const provenance =
    input.runPurpose === G5D4_PROVENANCE.live.runPurpose
      ? G5D4_PROVENANCE.live
      : input.runPurpose === G5D4_PROVENANCE.selfTest.runPurpose
        ? G5D4_PROVENANCE.selfTest
        : null;
  if (!provenance) throw new Error("private manifest run purpose required");
  const { aliases, stageTargets } = createAliasesAndTargets(input.rawAuthorities, key);
  return publishManifest(canonicalRun, {
    schemaVersion: G5D4_SCHEMA_VERSIONS.privateManifest,
    runId,
    runPurpose: provenance.runPurpose,
    confirmationProvenance: provenance.confirmation,
    collectorProvenance: provenance.collector,
    generation: 1,
    previousGenerationDigest: null,
    generationDigest: "".padStart(64, "0"),
    createdAt: input.createdAt ?? new Date().toISOString(),
    sealed: false,
    manifestSealDigest: null,
    authority: input.authority,
    rawAuthorities: input.rawAuthorities,
    aliases,
    stageTargets
  });
}

export function listManifestPaths(runDirectory) {
  const canonicalRun = assertSecureRunDirectory(runDirectory);
  return readdirSync(canonicalRun)
    .filter((name) => /^manifest-\d{6}\.json$/.test(name))
    .sort()
    .map((name) => join(canonicalRun, name));
}

export function loadAndVerifyManifestChain(runDirectory) {
  const paths = listManifestPaths(runDirectory);
  if (paths.length === 0) throw new Error("private manifest is missing");
  let previous = null;
  const manifests = paths.map((path, index) => {
    const manifest = g5d4PrivateManifestSchema.parse(
      JSON.parse(readSecureFile(path, runDirectory, "utf8"))
    );
    if (manifest.generation !== index + 1) throw new Error("manifest generation sequence mismatch");
    const expectedPreviousDigest = previous ? previous.generationDigest : null;
    if (manifest.previousGenerationDigest !== expectedPreviousDigest) {
      throw new Error("manifest generation chain mismatch");
    }
    const digest = computeManifestGenerationDigest(manifest);
    if (!safeDigestEqual(digest, manifest.generationDigest)) {
      throw new Error("manifest generation digest mismatch");
    }
    if (previous?.sealed) throw new Error("sealed manifest cannot have a later generation");
    previous = manifest;
    return manifest;
  });
  return manifests;
}

export function loadLatestPrivateManifest(runDirectory, options = {}) {
  const manifests = loadAndVerifyManifestChain(runDirectory);
  const manifest = manifests.at(-1);
  if (options.requireSealed === true) {
    const key = readAliasKey(runDirectory);
    if (!manifest.sealed || manifest.manifestSealDigest === null) {
      throw new Error("private manifest is not sealed");
    }
    const expectedSeal = computeManifestSealDigest(manifest, key);
    if (!safeDigestEqual(expectedSeal, manifest.manifestSealDigest)) {
      throw new Error("private manifest seal mismatch");
    }
  }
  return manifest;
}

export function sealPrivateManifest(runDirectory, options = {}) {
  const current = loadLatestPrivateManifest(runDirectory);
  if (current.sealed) throw new Error("private manifest is already sealed");
  const key = readAliasKey(runDirectory);
  const draft = {
    ...current,
    generation: current.generation + 1,
    previousGenerationDigest: current.generationDigest,
    generationDigest: "".padStart(64, "0"),
    createdAt: options.createdAt ?? new Date().toISOString(),
    sealed: true,
    manifestSealDigest: null
  };
  draft.manifestSealDigest = computeManifestSealDigest(draft, key);
  const published = publishManifest(runDirectory, draft);
  loadLatestPrivateManifest(runDirectory, { requireSealed: true });
  return published;
}

function authorizationFilename(authorizationId, state) {
  return `${authorizationId}-${state}.json`;
}

function authorizationUnsignedPayload(record) {
  return withoutFields(record, ["recordDigest", "integrityMac"]);
}

function signAuthorization(record, key) {
  const unsigned = authorizationUnsignedPayload(record);
  const recordDigest = sha256Hex(canonicalJson(unsigned));
  const integrityMac = hmacSha256Hex(key, "authorization-integrity", recordDigest);
  return { ...unsigned, recordDigest, integrityMac };
}

export function verifyAuthorizationRecord(record, key) {
  const parsed = g5d4AuthorizationSchema.parse(record);
  const expected = signAuthorization(parsed, key);
  if (
    !safeDigestEqual(parsed.recordDigest, expected.recordDigest) ||
    !safeDigestEqual(parsed.integrityMac, expected.integrityMac)
  ) {
    throw new Error("authorization integrity verification failed");
  }
  return parsed;
}

export function readAuthorizationRecord(runDirectory, authorizationPath) {
  const key = readAliasKey(runDirectory);
  return verifyAuthorizationRecord(
    JSON.parse(readSecureFile(authorizationPath, runDirectory, "utf8")),
    key
  );
}

export function issueAuthorizationRecord(runDirectory, binding, options = {}) {
  const manifest = loadLatestPrivateManifest(runDirectory, { requireSealed: true });
  const key = readAliasKey(runDirectory);
  const target = manifest.stageTargets[binding.microStep];
  if (
    binding.runId !== manifest.runId ||
    binding.commit !== manifest.authority.commit ||
    binding.projectRef !== manifest.authority.projectRef ||
    binding.fixtureAlias !== manifest.aliases.fixtureA ||
    !target ||
    binding.targetAlias !== target.alias ||
    binding.targetDigest !== target.digest ||
    binding.targetCount !== target.count
  ) {
    throw new Error("authorization binding does not match sealed manifest");
  }

  const authorizationId = options.authorizationId ?? `g5d4_authz_${randomBytes(16).toString("hex")}`;
  const record = signAuthorization(
    {
      schemaVersion: G5D4_SCHEMA_VERSIONS.authorization,
      authorizationId,
      state: "issued",
      runId: binding.runId,
      runPurpose: manifest.runPurpose,
      confirmationProvenance: manifest.confirmationProvenance,
      collectorProvenance: manifest.collectorProvenance,
      microStep: binding.microStep,
      fixtureAlias: binding.fixtureAlias,
      targetAlias: binding.targetAlias,
      targetDigest: binding.targetDigest,
      targetCount: binding.targetCount,
      commit: binding.commit,
      projectRef: binding.projectRef,
      collectorDigest: binding.collectorDigest,
      issuedAt: options.issuedAt ?? new Date().toISOString(),
      confirmedAt: null,
      consumedAt: null,
      previousRecordDigest: null,
      recordDigest: "".padStart(64, "0"),
      integrityMac: "".padStart(64, "0")
    },
    key
  );
  g5d4AuthorizationSchema.parse(record);
  const path = atomicPublishPrivateFile(
    runDirectory,
    authorizationFilename(authorizationId, "issued"),
    `${canonicalJson(record)}\n`
  );
  return { path, record };
}

async function readFixedPhraseFromLiveTty() {
  if (
    process.stdin.isTTY !== true ||
    process.stdout.isTTY !== true ||
    typeof process.stdout.write !== "function"
  ) {
    throw new Error("Human confirmation requires live TTY stdin/stdout");
  }
  process.stdout.write("Type the fixed G5D-4 confirmation phrase: ");
  let accumulated = "";
  for await (const chunk of process.stdin) {
    accumulated += chunk.toString("utf8");
    if (accumulated.includes("\n")) break;
    if (accumulated.length > 256) throw new Error("confirmation input too long");
  }
  return accumulated.split(/\r?\n/, 1)[0];
}

export async function confirmAuthorizationFromTty(runDirectory, issuedPath) {
  if (arguments.length !== 2) throw new Error("live confirmation does not accept overrides");
  const manifest = loadLatestPrivateManifest(runDirectory, { requireSealed: true });
  if (
    manifest.runPurpose !== G5D4_PROVENANCE.live.runPurpose ||
    manifest.confirmationProvenance !== G5D4_PROVENANCE.live.confirmation ||
    manifest.collectorProvenance !== G5D4_PROVENANCE.live.collector
  ) {
    throw new Error("Human confirmation requires exact live provenance");
  }
  const key = readAliasKey(runDirectory);
  const issued = readAuthorizationRecord(runDirectory, issuedPath);
  if (issued.state !== "issued") throw new Error("authorization is not issued");
  if (
    issued.runId !== manifest.runId ||
    issued.runPurpose !== manifest.runPurpose ||
    issued.confirmationProvenance !== manifest.confirmationProvenance ||
    issued.collectorProvenance !== manifest.collectorProvenance
  ) {
    throw new Error("issued authorization live provenance mismatch");
  }
  const consumedPath = join(runDirectory, authorizationFilename(issued.authorizationId, "consumed"));
  if (existsSync(consumedPath)) throw new Error("consumed authorization can never return to confirmed");
  const phrase = await readFixedPhraseFromLiveTty();
  if (phrase !== G5D4_CONFIRMATION_PHRASE) throw new Error("Human confirmation phrase mismatch");

  const record = signAuthorization(
    {
      ...authorizationUnsignedPayload(issued),
      state: "confirmed",
      confirmedAt: new Date().toISOString(),
      previousRecordDigest: issued.recordDigest
    },
    key
  );
  const path = atomicPublishPrivateFile(
    runDirectory,
    authorizationFilename(issued.authorizationId, "confirmed"),
    `${canonicalJson(record)}\n`
  );
  return { path, record };
}

function assertAuthorizationBinding(record, expected) {
  const fields = [
    "runId",
    "runPurpose",
    "confirmationProvenance",
    "collectorProvenance",
    "microStep",
    "fixtureAlias",
    "targetAlias",
    "targetDigest",
    "targetCount",
    "commit",
    "projectRef",
    "collectorDigest"
  ];
  if (fields.some((field) => record[field] !== expected[field])) {
    throw new Error("authorization current binding mismatch");
  }
}

export function consumeAuthorizationOnce(runDirectory, confirmedPath, expected, options = {}) {
  const key = readAliasKey(runDirectory);
  const confirmed = readAuthorizationRecord(runDirectory, confirmedPath);
  if (confirmed.state !== "confirmed") throw new Error("authorization is not confirmed");
  assertAuthorizationBinding(confirmed, expected);
  const consumedPath = join(
    assertSecureRunDirectory(runDirectory),
    authorizationFilename(confirmed.authorizationId, "consumed")
  );
  if (existsSync(consumedPath)) {
    throw Object.assign(new Error("authorization already consumed"), { code: "EEXIST" });
  }

  const consumed = signAuthorization(
    {
      ...authorizationUnsignedPayload(confirmed),
      state: "consumed",
      consumedAt: options.consumedAt ?? new Date().toISOString(),
      previousRecordDigest: confirmed.recordDigest
    },
    key
  );
  try {
    atomicPublishPrivateFile(
      runDirectory,
      authorizationFilename(confirmed.authorizationId, "consumed"),
      `${canonicalJson(consumed)}\n`
    );
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw Object.assign(new Error("authorization already consumed"), { code: "EEXIST" });
    }
    throw error;
  }
  fsyncDirectory(assertSecureRunDirectory(runDirectory));
  const reread = readAuthorizationRecord(runDirectory, consumedPath);
  if (reread.state !== "consumed" || !safeDigestEqual(reread.recordDigest, consumed.recordDigest)) {
    throw new Error("consumed authorization reread mismatch");
  }
  return { path: consumedPath, record: reread };
}

export function writePrivateProofArtifact(runDirectory, filename, artifact) {
  return atomicPublishPrivateFile(runDirectory, filename, `${canonicalJson(artifact)}\n`);
}

export function writePrivateCapture(runDirectory, filename, value) {
  const body = Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8");
  return atomicPublishPrivateFile(runDirectory, filename, body);
}

export function getPrivateRawSentinels(manifest) {
  const parsed = g5d4PrivateManifestSchema.parse(manifest);
  const values = [];
  const visit = (value) => {
    if (typeof value === "string") values.push(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") Object.values(value).forEach(visit);
  };
  visit(parsed.rawAuthorities);
  return values;
}

export function inspectPrivateStatePermissions(runDirectory) {
  const canonicalRun = assertSecureRunDirectory(runDirectory);
  const files = readdirSync(canonicalRun).map((name) => join(canonicalRun, name));
  files.forEach((path) => assertSecurePrivateFile(path, canonicalRun));
  return { directoryMode: statSync(canonicalRun).mode & 0o777, fileModes: files.map((path) => statSync(path).mode & 0o777) };
}

export function assertCanonicalManifestAuthority(manifest) {
  const parsed = g5d4PrivateManifestSchema.parse(manifest);
  if (
    parsed.authority.environment !== G5D4_CANONICAL_STAGING.environment ||
    parsed.authority.projectLabel !== G5D4_CANONICAL_STAGING.projectLabel ||
    parsed.authority.projectRef !== G5D4_CANONICAL_STAGING.projectRef
  ) {
    throw new Error("exact Canonical Staging authority required");
  }
  return parsed;
}

export function cleanupPrivateRunDirectory(runDirectory) {
  const canonicalRun = assertSecureRunDirectory(runDirectory);
  rmSync(canonicalRun, { recursive: true, force: false });
  if (existsSync(canonicalRun)) throw new Error("private temp cleanup incomplete");
  return true;
}
