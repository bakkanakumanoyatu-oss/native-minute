import { createHash } from "node:crypto";
import { readFile, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { editorialGallerySchema } from "../lib/gallery/schema";
import { buildPublicGalleryManifest, validateFirstCollection } from "../lib/gallery/manifest";

const firstCollectionVersion = "2026-09-27-first-collection-editorial-v1";
const firstCollectionSha256 = "2d65bd56968e88c993b97f563b4d93af40bb5f504698b078d921409cc37788e4";

async function main() {
  const [inputPath, outputPath, expectedSha256, ...extra] = process.argv.slice(2);
  if (!inputPath || !outputPath || !/^[a-f0-9]{64}$/u.test(expectedSha256 ?? "") || extra.length) {
    throw new Error("usage: npm run gallery:manifest -- <canonical-editorial.json> <new-public-output.json> <expected-source-sha256>");
  }
  const sourcePath = await realpath(resolve(inputPath));
  const repoRelativeSource = relative(process.cwd(), sourcePath);
  if (!repoRelativeSource.startsWith("..") && !isAbsolute(repoRelativeSource)) {
    throw new Error("editorial source must be outside the public repository");
  }
  if (sourcePath === resolve(outputPath)) throw new Error("source and output paths must differ");

  const sourceBytes = await readFile(sourcePath);
  const packageSha256 = createHash("sha256").update(sourceBytes).digest("hex");
  if (packageSha256 !== expectedSha256) throw new Error("editorial source SHA-256 mismatch");
  const editorial = editorialGallerySchema.parse(JSON.parse(sourceBytes.toString("utf8")));
  if (editorial.collectionVersion === firstCollectionVersion && packageSha256 !== firstCollectionSha256) {
    throw new Error("known First Collection version does not match its accepted source SHA-256");
  }
  const acceptance = validateFirstCollection(editorial);
  if (acceptance.mismatches.length) throw new Error(`First Collection identity mismatch:\n${acceptance.mismatches.join("\n")}`);
  const manifest = buildPublicGalleryManifest(editorial);
  await writeFile(resolve(outputPath), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({
    packageSha256,
    collectionVersion: editorial.collectionVersion,
    counts: acceptance.counts,
    publicItems: manifest.items.length,
    practiceItems: manifest.items.filter(item => item.publicationMode === "PRACTICE").length,
    discoveryItems: manifest.items.filter(item => item.publicationMode === "DISCOVERY").length
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
