import { createHash } from "node:crypto";
import { readFile, realpath, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { editorialGallerySchema } from "../lib/gallery/schema";
import { validateFirstCollection } from "../lib/gallery/manifest";
import { buildGalleryRuntimeArtifact, galleryReleaseVersionSchema } from "../lib/gallery/runtime-schema";

const firstCollectionVersion = "2026-09-27-first-collection-editorial-v1";
const firstCollectionSha256 = "2d65bd56968e88c993b97f563b4d93af40bb5f504698b078d921409cc37788e4";

function isOutsideRepo(path: string) {
  const relativePath = relative(process.cwd(), path);
  return relativePath.startsWith("..") || isAbsolute(relativePath);
}

async function main() {
  const [inputPath, outputPath, expectedSourceSha256, releaseVersion, ...extra] = process.argv.slice(2);
  if (!inputPath || !outputPath || !/^[a-f0-9]{64}$/u.test(expectedSourceSha256 ?? "") ||
    !galleryReleaseVersionSchema.safeParse(releaseVersion).success || extra.length) {
    throw new Error("usage: npm run gallery:runtime -- <private-editorial.json> <new-private-runtime.json> <expected-source-sha256> <release-version>");
  }
  const sourcePath = await realpath(resolve(inputPath));
  const requestedTargetPath = resolve(outputPath);
  const targetPath = resolve(await realpath(dirname(requestedTargetPath)), basename(requestedTargetPath));
  const sourceDirectoryRelativeTarget = relative(dirname(sourcePath), targetPath);
  if (!isOutsideRepo(sourcePath) || !isOutsideRepo(targetPath) || sourcePath === targetPath ||
    (!sourceDirectoryRelativeTarget.startsWith("..") && !isAbsolute(sourceDirectoryRelativeTarget))) {
    throw new Error("editorial source and runtime output must be distinct paths outside the public repository and source vault");
  }
  const sourceBytes = await readFile(sourcePath);
  const sourceSha256 = createHash("sha256").update(sourceBytes).digest("hex");
  if (sourceSha256 !== expectedSourceSha256 ||
    (JSON.parse(sourceBytes.toString("utf8")).collectionVersion === firstCollectionVersion && sourceSha256 !== firstCollectionSha256)) {
    throw new Error("editorial source SHA-256 mismatch");
  }
  const editorial = editorialGallerySchema.parse(JSON.parse(sourceBytes.toString("utf8")));
  const acceptance = validateFirstCollection(editorial);
  if (acceptance.mismatches.length) throw new Error(`First Collection identity mismatch:\n${acceptance.mismatches.join("\n")}`);
  const artifact = buildGalleryRuntimeArtifact(editorial, releaseVersion);
  const bytes = Buffer.from(`${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  await writeFile(targetPath, bytes, { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ releaseVersion, sourceCollectionVersion: artifact.sourceCollectionVersion,
    practiceItems: artifact.items.length, runtimeSha256: createHash("sha256").update(bytes).digest("hex") }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
