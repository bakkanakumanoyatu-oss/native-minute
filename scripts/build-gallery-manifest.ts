import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { editorialGallerySchema } from "../lib/gallery/schema";
import { buildPublicGalleryManifest, validateFirstCollection } from "../lib/gallery/manifest";

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  throw new Error("usage: npm run gallery:manifest -- <canonical-editorial.json> <public-gallery.json>");
}
const sourceBytes = await readFile(resolve(inputPath));
const editorial = editorialGallerySchema.parse(JSON.parse(sourceBytes.toString("utf8")));
const acceptance = validateFirstCollection(editorial);
if (acceptance.mismatches.length) throw new Error(`First Collection identity mismatch:\n${acceptance.mismatches.join("\n")}`);
const manifest = buildPublicGalleryManifest(editorial);
await writeFile(resolve(outputPath), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
console.log(JSON.stringify({
  packageSha256: createHash("sha256").update(sourceBytes).digest("hex"),
  collectionVersion: editorial.collectionVersion,
  counts: acceptance.counts,
  publicItems: manifest.items.length,
  practiceItems: manifest.items.filter(item => item.publicationMode === "PRACTICE").length,
  discoveryItems: manifest.items.filter(item => item.publicationMode === "DISCOVERY").length
}, null, 2));
