import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, open, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { editorialGallerySchema } from "../lib/gallery/schema";
import { buildPublicGalleryManifest, validateFirstCollection } from "../lib/gallery/manifest";
import { assertRuntimeMatchesPublic, buildGalleryRuntimeArtifact, galleryRuntimeSchema } from "../lib/gallery/runtime-schema";
import {
  assertReleasePayloadSeparation,
  buildFirstWorldBetaOverlay,
  FIRST_COLLECTION_DECISION_SHA256,
  FIRST_COLLECTION_SOURCE_SHA256,
  FIRST_WORLD_BETA_DISCOVERY_IDS,
  FIRST_WORLD_BETA_PRACTICE_IDS
} from "../lib/gallery/release-decision";

const runtimeFilename = "gallery-runtime.json";
const manifestFilename = "release-hash-manifest.json";
const reportFilename = "validation-report.json";

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function jsonBytes(value: unknown) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function isWithin(directory: string, target: string) {
  const path = relative(directory, target);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

function publicWorktreeRoots(): string[] {
  const output = execFileSync("git", ["worktree", "list", "--porcelain"], { encoding: "utf8" });
  const roots = output.split("\n").filter(line => line.startsWith("worktree ")).map(line => line.slice("worktree ".length));
  if (!roots.length || !roots.includes(process.cwd())) throw new Error("release builder must run from a registered public worktree root");
  return roots;
}

function assertExactIds(actual: string[], expected: readonly string[], label: string) {
  if (actual.length !== expected.length || new Set(actual).size !== actual.length ||
    actual.some(id => !expected.includes(id))) {
    throw new Error(`${label} IDs differ from the pinned release decision`);
  }
}

async function main() {
  const [sourceArgument, decisionArgument, publicArgument, privateDirectoryArgument, ...extra] = process.argv.slice(2);
  if (!sourceArgument || !decisionArgument || !publicArgument || !privateDirectoryArgument || extra.length) {
    throw new Error("usage: npm run gallery:release -- <canonical-source.json> <decision.json> <new-public-candidate.json> <new-private-output-directory>");
  }
  const worktreeRoot = await realpath(process.cwd());
  const publicRoots = publicWorktreeRoots();
  const sourcePath = await realpath(resolve(sourceArgument));
  const decisionPath = await realpath(resolve(decisionArgument));
  const publicPath = join(await realpath(dirname(resolve(publicArgument))), basename(publicArgument));
  const privateParent = await realpath(dirname(resolve(privateDirectoryArgument)));
  const privateDirectory = join(privateParent, basename(privateDirectoryArgument));
  if (!publicPath.endsWith(".json") || !isWithin(worktreeRoot, publicPath) ||
    publicRoots.some(root => isWithin(root, sourcePath) || isWithin(root, decisionPath) || isWithin(root, privateDirectory)) ||
    isWithin(dirname(sourcePath), privateDirectory) ||
    sourcePath === decisionPath || sourcePath === publicPath || decisionPath === publicPath) {
    throw new Error("source, decision, public candidate and private output paths violate the release boundary");
  }

  const [sourceBytes, decisionBytes] = await Promise.all([readFile(sourcePath), readFile(decisionPath)]);
  if (sha256(sourceBytes) !== FIRST_COLLECTION_SOURCE_SHA256 || sha256(decisionBytes) !== FIRST_COLLECTION_DECISION_SHA256) {
    throw new Error("canonical source or human decision SHA-256 mismatch");
  }
  const source = editorialGallerySchema.parse(JSON.parse(sourceBytes.toString("utf8")));
  const sourceAcceptance = validateFirstCollection(source);
  if (sourceAcceptance.mismatches.length) throw new Error("canonical First Collection identity mismatch");
  const { editorial, decision } = buildFirstWorldBetaOverlay(source, JSON.parse(decisionBytes.toString("utf8")));
  const overlayAcceptance = validateFirstCollection(editorial);
  if (overlayAcceptance.mismatches.length) throw new Error("release overlay changed canonical collection identity");

  const catalog = buildPublicGalleryManifest(editorial);
  const runtime = galleryRuntimeSchema.parse(buildGalleryRuntimeArtifact(editorial, decision.releaseDecisionVersion));
  assertRuntimeMatchesPublic(runtime, catalog);
  assertExactIds(catalog.items.filter(item => item.publicationMode === "PRACTICE").map(item => item.id), FIRST_WORLD_BETA_PRACTICE_IDS, "Public PRACTICE");
  assertExactIds(catalog.items.filter(item => item.publicationMode === "DISCOVERY").map(item => item.id), FIRST_WORLD_BETA_DISCOVERY_IDS, "Public DISCOVERY");
  assertExactIds(runtime.items.map(item => item.id), FIRST_WORLD_BETA_PRACTICE_IDS, "Private runtime");
  if (catalog.items.length !== 12 || editorial.items.some(item => item.publicationMode === "HOLD")) {
    throw new Error("release item counts differ from the pinned decision");
  }
  assertReleasePayloadSeparation(source, catalog, runtime);

  const publicBytes = jsonBytes(catalog);
  const runtimeBytes = jsonBytes(runtime);
  const report = {
    schemaVersion: "gallery-release-validation/v1",
    releaseVersion: decision.releaseDecisionVersion,
    collectionVersion: source.collectionVersion,
    counts: { public: 12, practice: 5, discovery: 7, hold: 0, runtime: 5 },
    publicIds: catalog.items.map(item => item.id),
    runtimeIds: runtime.items.map(item => item.id),
    checks: {
      sourceAndDecisionHashesPinned: true,
      sourceIdentityPreserved: true,
      decisionIdsAndRightsMatched: true,
      publicMetadataContainsNoProtectedPayload: true,
      discoveryPayloadAbsentFromRuntime: true,
      runtimeMatchesPublicMetadata: true,
      sourceAndDecisionFilesUnchanged: false
    },
    hashes: { sourceSha256: sha256(sourceBytes), decisionSha256: sha256(decisionBytes),
      publicSha256: sha256(publicBytes), runtimeSha256: sha256(runtimeBytes) }
  };
  // Detect a concurrent edit to either input before creating any output.
  const [sourceAgain, decisionAgain] = await Promise.all([readFile(sourcePath), readFile(decisionPath)]);
  if (sha256(sourceAgain) !== sha256(sourceBytes) || sha256(decisionAgain) !== sha256(decisionBytes)) {
    throw new Error("source or decision changed during artifact generation");
  }
  report.checks.sourceAndDecisionFilesUnchanged = true;
  const reportBytes = jsonBytes(report);
  const hashManifest = {
    schemaVersion: "gallery-release-hashes/v1",
    releaseVersion: decision.releaseDecisionVersion,
    collectionVersion: source.collectionVersion,
    sourceSha256: sha256(sourceBytes),
    decisionSha256: sha256(decisionBytes),
    outputs: {
      publicMetadata: { finalRepoPath: "lib/gallery/public-gallery.json", candidateFilename: basename(publicPath),
        sha256: sha256(publicBytes), bytes: publicBytes.length },
      privateRuntime: { filename: runtimeFilename, sha256: sha256(runtimeBytes), bytes: runtimeBytes.length },
      validationReport: { filename: reportFilename, sha256: sha256(reportBytes), bytes: reportBytes.length }
    }
  };
  const hashManifestBytes = jsonBytes(hashManifest);

  let privateDirectoryCreated = false;
  let publicCandidateCreated = false;
  try {
    await mkdir(privateDirectory, { mode: 0o700 });
    privateDirectoryCreated = true;
    await writeFile(join(privateDirectory, runtimeFilename), runtimeBytes, { flag: "wx", mode: 0o600 });
    await writeFile(join(privateDirectory, reportFilename), reportBytes, { flag: "wx", mode: 0o600 });
    await writeFile(join(privateDirectory, manifestFilename), hashManifestBytes, { flag: "wx", mode: 0o600 });
    const publicFile = await open(publicPath, "wx", 0o644);
    publicCandidateCreated = true;
    try { await publicFile.writeFile(publicBytes); } finally { await publicFile.close(); }
  } catch (error) {
    if (publicCandidateCreated) await rm(publicPath, { force: true });
    if (privateDirectoryCreated) await rm(privateDirectory, { recursive: true, force: true });
    throw error;
  }
  console.log(JSON.stringify({ releaseVersion: decision.releaseDecisionVersion, publicItems: 12, practiceItems: 5,
    discoveryItems: 7, publicSha256: sha256(publicBytes), runtimeSha256: sha256(runtimeBytes),
    reportSha256: sha256(reportBytes), hashManifestSha256: sha256(hashManifestBytes) }, null, 2));
}

main().catch(error => {
  // Parser and filesystem errors can embed source values. Keep CLI diagnostics
  // deliberately generic so protected text never reaches logs.
  const safeMessage = error instanceof Error && (
    error.message.startsWith("usage:") ||
    error.message.startsWith("source, decision, public candidate") ||
    error.message.startsWith("canonical source or human decision SHA-256") ||
    error.message.startsWith("release builder must run")
  ) ? error.message : "Gallery release validation or artifact write failed";
  console.error(safeMessage);
  process.exitCode = 1;
});
