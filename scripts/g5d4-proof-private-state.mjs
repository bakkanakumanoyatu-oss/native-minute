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
import { z } from "zod";
import {
  G5D4_BINDING_VERIFICATION_VERSION,
  G5D4_CANONICAL_STAGING,
  G5D4_A_PREP_TABLE_CONTRACT,
  G5D4_PROVENANCE,
  G5D4_SCHEMA_VERSIONS,
  canonicalJson,
  g5d4AliasRoleSchema,
  g5d4AuthorizationSchema,
  g5d4FixtureBindingSchema,
  g5d4FixtureVerificationSchema,
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

function createAliasesAndTargets(raw, key) {
  const registry = createAliasRegistry(key);
  const aliases = {};
  const stageTargets = {};
  if (raw.fixtureAUserId) {
    aliases.fixtureA = registry.alias("fixture_a", raw.fixtureAUserId);
    stageTargets.auth_cleanup = {
      alias: aliases.fixtureA,
      digest: hmacSha256Hex(key, "stage-target:auth", raw.fixtureAUserId),
      count: 1
    };
  }
  if (raw.fixtureBUserId) aliases.fixtureB = registry.alias("fixture_b", raw.fixtureBUserId);
  if (raw.fixtureAProviderResourceId) {
    aliases.providerResource = registry.alias("provider_resource", raw.fixtureAProviderResourceId);
    stageTargets.provider_cleanup = {
      alias: aliases.providerResource,
      digest: hmacSha256Hex(key, "stage-target:provider", raw.fixtureAProviderResourceId),
      count: 1
    };
  }
  if (raw.fixtureAStorageTargets.length) {
    aliases.storageTargets = raw.fixtureAStorageTargets.map(({ bucket, key: objectKey }) =>
      registry.alias("storage_target", `${bucket}\0${objectKey}`)
    );
  }
  if (raw.fixtureAProviderResourceId && raw.fixtureAStorageTargets.length === 4) {
    aliases.targetSet = registry.alias("target_set", canonicalJson({
      provider: raw.fixtureAProviderResourceId,
      storage: raw.fixtureAStorageTargets
    }));
    stageTargets.storage_cleanup = {
      alias: aliases.targetSet,
      digest: hmacSha256Hex(key, "stage-target:storage", raw.fixtureAStorageTargets),
      count: 4
    };
  }
  if (raw.deletionRequestId && raw.deletionRequestRef) {
    aliases.request = registry.alias("request", raw.deletionRequestRef);
    stageTargets.completion_verification = {
      alias: aliases.request,
      digest: hmacSha256Hex(key, "stage-target:completion", raw.deletionRequestId),
      count: 1
    };
  }
  if (raw.fixtureAUserId && raw.fixtureBUserId && raw.fixtureAProviderResourceId &&
      raw.fixtureBProviderResourceId && raw.fixtureAStorageTargets.length === 4 &&
      raw.fixtureBStorageTargets.length === 4 && raw.deletionRequestId && raw.deletionRequestRef) {
    stageTargets.database_cleanup = {
      alias: aliases.fixtureA,
      digest: hmacSha256Hex(key, "stage-target:database", "D15:A1:R6"),
      count: 15
    };
  }
  return { aliases, stageTargets };
}

function emptyRawAuthorities() {
  return {
    fixtureAUserId: null,
    fixtureBUserId: null,
    fixtureAProviderResourceId: null,
    fixtureBProviderResourceId: null,
    fixtureAStorageTargets: [],
    fixtureBStorageTargets: [],
    deletionRequestId: null,
    deletionRequestRef: null
  };
}

function assertDerivedManifestBindings(manifest, key) {
  const expected = key ? createAliasesAndTargets(manifest.rawAuthorities, key) : { aliases: {}, stageTargets: {} };
  if (canonicalJson(manifest.aliases) !== canonicalJson(expected.aliases) ||
      canonicalJson(manifest.stageTargets) !== canonicalJson(expected.stageTargets)) {
    throw new Error("manifest aliases/target-set authority mismatch");
  }
}

// Validates the full existing sealed authority, including exact bucket universe,
// A/B isolation, coherent provenance and derived aliases/digests/counts.
// Self-test provenance stays self-test; validation never promotes it to live.
export function assertFixtureManifestComplete(manifest, key) {
  const parsed = assertCanonicalManifestAuthority(manifest);
  assertDerivedManifestBindings(parsed, key);
  assertVerifiedManifestBindings(parsed, key);
  return parsed;
}

// Returned receipts are opaque identity keys only. Authority and persisted
// HMAC evidence live exclusively in module-owned immutable snapshots. Keep
// live/self-test registries separate; neither a copy nor a local-key re-sign
// can mint a capability. This is not an OS-user signature.
const liveVerificationCapabilities = new WeakMap();
const selfTestVerificationCapabilities = new WeakMap();

function verificationCapabilitiesFor(runPurpose) {
  if (runPurpose === G5D4_PROVENANCE.live.runPurpose) return liveVerificationCapabilities;
  if (runPurpose === G5D4_PROVENANCE.selfTest.runPurpose) return selfTestVerificationCapabilities;
  throw new Error("fixture verification run purpose mismatch");
}

function bindingRole(binding) {
  return binding.kind === "request" ? "fixture_a" : binding.fixtureRole;
}

function bindingOwner(manifest, binding) {
  const owner = binding.kind === "identity" ? binding.userId
    : manifest.rawAuthorities[bindingRole(binding) === "fixture_a" ? "fixtureAUserId" : "fixtureBUserId"];
  if (!owner) throw new Error("verified resource requires bound fixture identity");
  return owner;
}

function manifestBindings(raw) {
  const bindings = [];
  for (const [prefix, fixtureRole] of [["fixtureA", "fixture_a"], ["fixtureB", "fixture_b"]]) {
    if (raw[`${prefix}UserId`]) bindings.push({ kind: "identity", fixtureRole, userId: raw[`${prefix}UserId`] });
    if (raw[`${prefix}ProviderResourceId`]) bindings.push({ kind: "provider", fixtureRole, resourceId: raw[`${prefix}ProviderResourceId`] });
    for (const target of raw[`${prefix}StorageTargets`]) bindings.push({ kind: "storage", fixtureRole, target });
  }
  if (raw.deletionRequestId) bindings.push({ kind: "request", deletionRequestId: raw.deletionRequestId, deletionRequestRef: raw.deletionRequestRef });
  return bindings;
}

function verificationMac(receipt, key) {
  return hmacSha256Hex(key, "fixture-binding-verification", withoutFields(receipt, ["integrityMac"]));
}

function assertVerificationBinding(receipt, manifest, binding, key) {
  const parsed = g5d4FixtureVerificationSchema.parse(receipt);
  const provenance = manifest.runPurpose === G5D4_PROVENANCE.live.runPurpose
    ? G5D4_PROVENANCE.live.collector : G5D4_PROVENANCE.selfTest.collector;
  if (parsed.runId !== manifest.runId || parsed.runPurpose !== manifest.runPurpose ||
      parsed.verificationProvenance !== provenance || parsed.kind !== binding.kind ||
      parsed.fixtureRole !== bindingRole(binding) ||
      !safeDigestEqual(parsed.targetDigest, hmacSha256Hex(key, "fixture-binding-target", binding)) ||
      !safeDigestEqual(parsed.ownerDigest, hmacSha256Hex(key, "fixture-binding-owner", bindingOwner(manifest, binding))) ||
      !safeDigestEqual(parsed.integrityMac, verificationMac(parsed, key))) {
    throw new Error("verified fixture binding integrity/target/provenance mismatch");
  }
  return parsed;
}

function assertVerifiedManifestBindings(manifest, key) {
  const bindings = manifestBindings(manifest.rawAuthorities);
  if (manifest.bindingVerifications.length !== bindings.length) throw new Error("every fixture binding requires verification provenance");
  const seen = new Set();
  for (const receipt of manifest.bindingVerifications) {
    const binding = bindings.find((item) => hmacSha256Hex(key, "fixture-binding-target", item) === receipt.targetDigest);
    if (!binding || seen.has(receipt.targetDigest) || receipt.generation >= manifest.generation) {
      throw new Error("fixture verification coverage/generation mismatch");
    }
    assertVerificationBinding(receipt, manifest, binding, key);
    seen.add(receipt.targetDigest);
  }
}

function assertPreparingPurpose(runDirectory, runPurpose) {
  const manifest = loadLatestPrivateManifest(runDirectory);
  if (manifest.lifecycle !== "preparing" || manifest.runPurpose !== runPurpose) {
    throw new Error("fixture verification requires exact preparing run purpose");
  }
  if (manifest.authority.environment !== G5D4_CANONICAL_STAGING.environment ||
      manifest.authority.projectRef !== G5D4_CANONICAL_STAGING.projectRef ||
      manifest.authority.projectLabel !== G5D4_CANONICAL_STAGING.projectLabel) {
    throw new Error("fixture verification requires canonical staging authority");
  }
  return manifest;
}

function createLiveFixtureVerificationReader() {
  // Like the existing live collector, deliberately unarmed until the separate
  // approved live reader wiring unit. No input, adapter, flag or environment
  // override can turn observations supplied by a caller into live authority.
  throw new Error("live fixture verification reader is not armed");
}

// These are read results, never public caller attestations. Exact IDs and DB
// relations are checked before any capability or MAC is constructed.
async function inspectFixtureBinding(reader, manifest, binding) {
  const fixtureRole = bindingRole(binding);
  const userId = bindingOwner(manifest, binding);
  const exact = (value) => z.literal(value);
  const owner = { fixtureRole: exact(fixtureRole), userId: exact(userId) };
  if (binding.kind === "identity") {
    const result = await reader.readIdentityBaseline({ fixtureRole, userId });
    const parsed = z.object({
      ...owner,
      auth: z.object({ userId: exact(userId), present: z.literal(true), confirmed: z.literal(true) }).strict(),
      profile: z.object({ userId: exact(userId), count: z.literal(1) }).strict(),
      baseline: z.array(z.object({ table: z.string(), count: z.literal(0) }).strict()).length(17)
    }).strict().parse(result);
    const expected = G5D4_A_PREP_TABLE_CONTRACT.filter(({ table }) => table !== "profiles").map(({ table }) => table).sort();
    if (canonicalJson(parsed.baseline.map(({ table }) => table).sort()) !== canonicalJson(expected)) {
      throw new Error("identity baseline exact table universe mismatch");
    }
    return parsed;
  }
  if (binding.kind === "provider") {
    return z.object({
      ...owner, resourceId: exact(binding.resourceId), present: z.literal(true), count: z.literal(1),
      dbBinding: z.object({ userId: exact(userId), resourceId: exact(binding.resourceId), count: z.literal(1) }).strict()
    }).strict().parse(await reader.readProviderBinding({ fixtureRole, userId, resourceId: binding.resourceId }));
  }
  if (binding.kind === "storage") {
    const target = binding.target;
    const recording = target.bucket === "recordings";
    return z.object({
      ...owner, bucket: exact(target.bucket), key: exact(target.key), present: z.literal(true), count: z.literal(1),
      dbLocator: z.object({ userId: exact(userId), bucket: exact(target.bucket), key: exact(target.key), count: z.literal(1) }).strict(),
      recordingContract: recording ? z.enum(["consent_gated_web", "consent_gated_mobile"]) : z.null(),
      directStorageBypassUsed: z.literal(false)
    }).strict().parse(await reader.readStorageBinding({ fixtureRole, userId, ...target }));
  }
  if (!manifest.rawAuthorities.fixtureBUserId) throw new Error("request verification requires B control identity");
  return z.object({
    ...owner, deletionRequestId: exact(binding.deletionRequestId), deletionRequestRef: exact(binding.deletionRequestRef),
    count: z.literal(1), state: z.literal("confirmed"), conflictCount: z.literal(0),
    fixtureBUserId: exact(manifest.rawAuthorities.fixtureBUserId), fixtureBRequestCount: z.literal(0)
  }).strict().parse(await reader.readDeletionRequest({
    fixtureRole, userId, deletionRequestId: binding.deletionRequestId, deletionRequestRef: binding.deletionRequestRef,
    fixtureBUserId: manifest.rawAuthorities.fixtureBUserId
  }));
}

function createFixtureVerificationCapability(runDirectory, manifest, binding, observation) {
  const key = readAliasKey(runDirectory);
  const verification = {
    schemaVersion: G5D4_BINDING_VERIFICATION_VERSION,
    runId: manifest.runId, runPurpose: manifest.runPurpose,
    verificationProvenance: manifest.runPurpose === G5D4_PROVENANCE.live.runPurpose
      ? G5D4_PROVENANCE.live.collector : G5D4_PROVENANCE.selfTest.collector,
    generation: manifest.generation, generationDigest: manifest.generationDigest,
    fixtureRole: bindingRole(binding), kind: binding.kind,
    targetDigest: hmacSha256Hex(key, "fixture-binding-target", binding),
    ownerDigest: hmacSha256Hex(key, "fixture-binding-owner", bindingOwner(manifest, binding)),
    relationDigest: hmacSha256Hex(key, "fixture-binding-relations", observation),
    verifiedState: binding.kind === "identity" ? "fresh_zero_baseline"
      : binding.kind === "request" ? "confirmed_no_conflict" : "present_owned",
    verifiedCount: 1, verifiedAt: new Date().toISOString()
  };
  verification.integrityMac = verificationMac(verification, key);
  // Binding and live observation have already been schema-parsed into owned data.
  // Copy the complete binding and validated metadata; retain no reader result
  // or caller references. These strict schemas contain only scalar fields,
  // plus Storage's one nested scalar target, so freeze that exact shape.
  const snapshot = structuredClone({
    runDirectory: assertSecureRunDirectory(runDirectory),
    binding,
    verification: g5d4FixtureVerificationSchema.parse(verification)
  });
  if (snapshot.binding.kind === "storage") Object.freeze(snapshot.binding.target);
  Object.freeze(snapshot.binding);
  Object.freeze(snapshot.verification);
  Object.freeze(snapshot);
  const receipt = Object.freeze(Object.create(null));
  verificationCapabilitiesFor(manifest.runPurpose).set(receipt, snapshot);
  return receipt;
}

export async function verifyLiveFixtureAuthority(runDirectory, input) {
  if (arguments.length !== 2) throw new Error("live fixture verification accepts no evidence/reader overrides");
  assertNoCredentialMaterial(input);
  const binding = g5d4FixtureBindingSchema.parse(input);
  const manifest = assertPreparingPurpose(runDirectory, G5D4_PROVENANCE.live.runPurpose);
  const observation = await inspectFixtureBinding(createLiveFixtureVerificationReader(), manifest, binding);
  // Any intervening bind makes the observation unusable, even before issuance.
  if (loadLatestPrivateManifest(runDirectory).generationDigest !== manifest.generationDigest) {
    throw new Error("fixture verification generation became stale during read");
  }
  return createFixtureVerificationCapability(runDirectory, manifest, binding, observation);
}

export function createSelfTestFixtureVerification(runDirectory, input) {
  if (arguments.length !== 2) throw new Error("self-test fixture verification accepts no provenance override");
  assertNoCredentialMaterial(input);
  const binding = g5d4FixtureBindingSchema.parse(input);
  const manifest = assertPreparingPurpose(runDirectory, G5D4_PROVENANCE.selfTest.runPurpose);
  return createFixtureVerificationCapability(runDirectory, manifest, binding, { synthetic: "self_test_v1" });
}

export function bindVerifiedLiveFixtureAuthority(runDirectory, input, receipt) {
  if (arguments.length !== 3) throw new Error("verified live bind accepts no overrides");
  const manifest = assertPreparingPurpose(runDirectory, G5D4_PROVENANCE.live.runPurpose);
  return bindManifestAuthority(runDirectory, input, receipt, manifest);
}

function appendManifestGeneration(runDirectory, current, changes, options = {}) {
  return publishManifest(runDirectory, {
    ...current,
    ...changes,
    generation: current.generation + 1,
    previousGenerationDigest: current.generationDigest,
    createdAt: options.createdAt ?? new Date().toISOString()
  });
}

export function bindFixtureManifestAuthority(runDirectory, input) {
  // Backwards-compatible name, now structurally self-test-only.
  if (arguments.length !== 2) throw new Error("raw fixture bind accepts no overrides");
  const current = assertPreparingPurpose(runDirectory, G5D4_PROVENANCE.selfTest.runPurpose);
  return bindManifestAuthority(runDirectory, input, createSelfTestFixtureVerification(runDirectory, input), current);
}

function bindManifestAuthority(runDirectory, input, receipt, current) {
  const capabilities = verificationCapabilitiesFor(current.runPurpose);
  const snapshot = capabilities.get(receipt);
  if (!snapshot || snapshot.runDirectory !== assertSecureRunDirectory(runDirectory)) {
    throw new Error("fixture verification capability missing or changed");
  }
  // Caller input is only an expected target/kind/role/slot assertion. Never
  // inspect receipt properties or use caller input as persisted authority.
  assertNoCredentialMaterial(input);
  const expectedBinding = g5d4FixtureBindingSchema.parse(input);
  const { binding, verification: verified } = snapshot;
  if (canonicalJson(expectedBinding) !== canonicalJson(binding)) throw new Error("verified fixture binding target mismatch");
  const key = readAliasKey(runDirectory);
  assertVerificationBinding(verified, current, binding, key);
  if (verified.generation !== current.generation || verified.generationDigest !== current.generationDigest) {
    throw new Error("fixture verification generation is stale");
  }
  if (current.lifecycle !== "preparing") throw new Error("fixture bindings require preparing manifest");
  const raw = structuredClone(current.rawAuthorities);
  const prefix = binding.fixtureRole === "fixture_a" ? "fixtureA" : "fixtureB";
  const bindOnce = (field, value) => {
    if (raw[field] !== null) throw new Error("fixture authority already bound");
    raw[field] = value;
  };
  if (binding.kind === "identity") bindOnce(`${prefix}UserId`, binding.userId);
  if (binding.kind === "provider") bindOnce(`${prefix}ProviderResourceId`, binding.resourceId);
  if (binding.kind === "storage") {
    const targets = raw[`${prefix}StorageTargets`];
    if (targets.some((target) => target.bucket === binding.target.bucket)) {
      throw new Error("storage bucket authority already bound");
    }
    targets.push(binding.target);
  }
  if (binding.kind === "request") {
    bindOnce("deletionRequestId", binding.deletionRequestId);
    bindOnce("deletionRequestRef", binding.deletionRequestRef);
  }
  const derived = createAliasesAndTargets(raw, readAliasKey(runDirectory));
  const published = appendManifestGeneration(runDirectory, current, {
    rawAuthorities: raw, ...derived, bindingVerifications: [...current.bindingVerifications, verified]
  });
  capabilities.delete(receipt);
  return published;
}

export function completeFixtureManifest(runDirectory) {
  const current = loadLatestPrivateManifest(runDirectory);
  if (current.lifecycle !== "preparing") throw new Error("fixture completion requires preparing manifest");
  assertFixtureManifestComplete(current, readAliasKey(runDirectory));
  return appendManifestGeneration(runDirectory, current, { lifecycle: "fixture_complete" });
}

export function createInitialPrivateManifest(runDirectory, input) {
  const canonicalRun = assertSecureRunDirectory(runDirectory);
  if (readdirSync(canonicalRun).some((name) => name.startsWith("manifest-"))) {
    throw new Error("initial manifest already exists");
  }
  assertNoCredentialMaterial(input);
  if (Object.keys(input).some((field) => !["runId", "runPurpose", "createdAt", "authority"].includes(field))) {
    throw new Error("initial manifest accepts current run authority only");
  }
  const runId = input.runId ?? `g5d4_run_${randomBytes(16).toString("hex")}`;
  const provenance =
    input.runPurpose === G5D4_PROVENANCE.live.runPurpose
      ? G5D4_PROVENANCE.live
      : input.runPurpose === G5D4_PROVENANCE.selfTest.runPurpose
        ? G5D4_PROVENANCE.selfTest
        : null;
  if (!provenance) throw new Error("private manifest run purpose required");
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
    lifecycle: "preparing",
    sealed: false,
    manifestSealDigest: null,
    authority: input.authority,
    rawAuthorities: emptyRawAuthorities(),
    aliases: {},
    stageTargets: {},
    bindingVerifications: []
  });
}

export function listManifestPaths(runDirectory) {
  const canonicalRun = assertSecureRunDirectory(runDirectory);
  return readdirSync(canonicalRun)
    .filter((name) => /^manifest-\d{6}\.json$/.test(name))
    .sort()
    .map((name) => join(canonicalRun, name));
}

function assertManifestTransition(previous, current) {
  if (!previous) {
    if (current.lifecycle !== "preparing" || current.bindingVerifications.length !== 0 ||
        canonicalJson(current.rawAuthorities) !== canonicalJson(emptyRawAuthorities())) {
      throw new Error("manifest must start with unbound preparing authority");
    }
    return;
  }
  for (const field of ["schemaVersion", "runId", "runPurpose", "confirmationProvenance", "collectorProvenance", "authority"]) {
    if (canonicalJson(previous[field]) !== canonicalJson(current[field])) {
      throw new Error("manifest run authority/provenance is immutable");
    }
  }
  if (previous.sealed) throw new Error("sealed manifest cannot have a later generation");
  if (current.lifecycle !== "preparing") {
    const expected = previous.lifecycle === "preparing" ? "fixture_complete" : "sealed";
    if (current.lifecycle !== expected || canonicalJson(previous.rawAuthorities) !== canonicalJson(current.rawAuthorities) ||
        canonicalJson(previous.bindingVerifications) !== canonicalJson(current.bindingVerifications)) {
      throw new Error("manifest completion/seal transition mismatch");
    }
    return;
  }
  if (previous.lifecycle !== "preparing") throw new Error("manifest lifecycle rollback refused");
  let additions = 0;
  for (const field of Object.keys(previous.rawAuthorities)) {
    const before = previous.rawAuthorities[field];
    const after = current.rawAuthorities[field];
    if (canonicalJson(before) === canonicalJson(after)) continue;
    if (Array.isArray(before)) {
      if (after.length !== before.length + 1 || canonicalJson(before) !== canonicalJson(after.slice(0, -1))) {
        throw new Error("existing storage bindings are immutable");
      }
    } else if (before !== null || after === null) {
      throw new Error("existing fixture identity/resource bindings are immutable");
    }
    // The request ID/ref pair is one indivisible binding.
    if (field !== "deletionRequestRef") additions += 1;
  }
  if (additions !== 1) throw new Error("each preparing generation must append exactly one binding");
  const receipt = current.bindingVerifications.at(-1);
  const previousTargets = new Set(previous.bindingVerifications.map((item) => item.targetDigest));
  if (current.bindingVerifications.length !== previous.bindingVerifications.length + 1 ||
      canonicalJson(previous.bindingVerifications) !== canonicalJson(current.bindingVerifications.slice(0, -1)) ||
      receipt.generation !== previous.generation || receipt.generationDigest !== previous.generationDigest ||
      previousTargets.has(receipt.targetDigest)) {
    throw new Error("fixture verification must append against exact prior generation");
  }
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
    assertManifestTransition(previous, manifest);
    const key = manifest.generation === 1 ? null : readAliasKey(runDirectory);
    assertDerivedManifestBindings(manifest, key);
    assertVerifiedManifestBindings(manifest, key);
    if (manifest.lifecycle !== "preparing") assertFixtureManifestComplete(manifest, key);
    if (manifest.sealed && !safeDigestEqual(computeManifestSealDigest(manifest, key), manifest.manifestSealDigest)) {
      throw new Error("private manifest seal mismatch");
    }
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
  if (current.lifecycle !== "fixture_complete") throw new Error("seal requires fixture_complete manifest");
  const key = readAliasKey(runDirectory);
  assertFixtureManifestComplete(current, key);
  const draft = {
    ...current,
    generation: current.generation + 1,
    previousGenerationDigest: current.generationDigest,
    generationDigest: "".padStart(64, "0"),
    createdAt: options.createdAt ?? new Date().toISOString(),
    lifecycle: "sealed",
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
  // Keep the pre-existing collector/operator contract complete even though the
  // private-state loader can now read preparing generations.
  g5d4PrivateManifestSchema.parse({
    ...parsed, lifecycle: "fixture_complete", sealed: false, manifestSealDigest: null
  });
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
