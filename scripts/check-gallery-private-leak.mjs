import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const privateNames = new Set([
  "native_minute_first_collection_complete.zip",
  "first_collection_complete.json",
  "first_collection_editorial.md",
  "first_collection_status.csv",
  "mainline_handoff.md",
  "gallery-runtime.json",
  "sources.json",
  "public_manifest_preview.json",
  "validate_in_repo.ts",
  "validate_package.py",
  "validation_report.json",
  "validation_report.md",
  "SHA256SUMS.txt"
]);
const privateHashes = new Set([
  "92808ca7894c23e88389e9373b7ab05147f661a6b642a916101daf0251754f41",
  "2d65bd56968e88c993b97f563b4d93af40bb5f504698b078d921409cc37788e4"
]);
const generatedDirectories = new Set([".git", "node_modules", "dist", "DerivedData"]);
export const syntheticPracticeSentinel = ["PRIVATE_GALLERY", "RUNTIME_SENTINEL_7f2a"].join("_");
const contentMarkers = [syntheticPracticeSentinel];
const privateRightsEvidenceName = /(?:rights[-_]evidence|source[-_]investigation)/iu;

async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export async function findPrivateGalleryLeaks(root, protectedHashes = privateHashes, protectedText = []) {
  const leaks = [];
  const protectedMarkers = protectedText.flatMap(value => [Buffer.from(value), Buffer.from(JSON.stringify(value).slice(1, -1))]);
  async function scan(directory, includeGenerated = false) {
    if (!(await stat(directory).catch(() => null))) return;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!includeGenerated && (generatedDirectories.has(entry.name) || entry.name === ".next" || entry.name.startsWith(".next-"))) continue;
      const path = join(directory, entry.name);
      const name = relative(root, path);
      if (privateNames.has(entry.name) || privateRightsEvidenceName.test(entry.name) || entry.name === "native_minute_first_collection" || entry.name === "native-minute-private-content") {
        leaks.push(name);
        continue;
      }
      if (entry.isDirectory()) await scan(path, includeGenerated);
      else if (entry.isFile()) {
        if (protectedHashes.has(await sha256(path))) { leaks.push(name); continue; }
        const bytes = await readFile(path);
        const markers = includeGenerated ? [...contentMarkers, ...protectedHashes] : contentMarkers;
        if (markers.some(marker => bytes.includes(Buffer.from(marker))) || protectedMarkers.some(marker => bytes.includes(marker))) leaks.push(name);
      }
    }
  }
  await scan(root);
  await scan(join(root, ".next"), true);
  await scan(join(root, "apps", "mobile", "dist"), true);
  return leaks;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--source")) {
    throw new Error("usage: npm run check:gallery-private-leak -- [--source <private-editorial.json>]");
  }
  const sourceBytes = args.length ? await readFile(args[1]) : null;
  if (sourceBytes && createHash("sha256").update(sourceBytes).digest("hex") !== "2d65bd56968e88c993b97f563b4d93af40bb5f504698b078d921409cc37788e4") {
    throw new Error("canonical First Collection source SHA-256 mismatch");
  }
  const editorial = sourceBytes ? JSON.parse(sourceBytes.toString("utf8")) : null;
  const protectedText = editorial?.items.flatMap(item => [item.practice.practiceTextEn, item.practice.translationJa].filter(Boolean)) ?? [];
  const leaks = await findPrivateGalleryLeaks(process.cwd(), privateHashes, protectedText);
  if (leaks.length) {
    console.error(`private Gallery package found inside public repo: ${leaks.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log("gallery private content guard passed");
  }
}
