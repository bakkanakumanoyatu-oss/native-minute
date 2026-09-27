import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const privateNames = new Set([
  "native_minute_first_collection_complete.zip",
  "first_collection_complete.json",
  "first_collection_editorial.md",
  "first_collection_status.csv",
  "mainline_handoff.md"
]);
const privateHashes = new Set([
  "92808ca7894c23e88389e9373b7ab05147f661a6b642a916101daf0251754f41",
  "2d65bd56968e88c993b97f563b4d93af40bb5f504698b078d921409cc37788e4"
]);
const generatedDirectories = new Set([".git", "node_modules", "dist", "DerivedData"]);

async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export async function findPrivateGalleryLeaks(root, protectedHashes = privateHashes) {
  const leaks = [];
  async function scan(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (generatedDirectories.has(entry.name) || entry.name === ".next" || entry.name.startsWith(".next-")) continue;
      const path = join(directory, entry.name);
      const name = relative(root, path);
      if (privateNames.has(entry.name) || entry.name === "native_minute_first_collection" || entry.name === "native-minute-private-content") {
        leaks.push(name);
        continue;
      }
      if (entry.isDirectory()) await scan(path);
      else if (entry.isFile() && protectedHashes.has(await sha256(path))) leaks.push(name);
    }
  }
  await scan(root);
  return leaks;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const leaks = await findPrivateGalleryLeaks(process.cwd());
  if (leaks.length) {
    console.error(`private Gallery package found inside public repo: ${leaks.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log("gallery private content guard passed");
  }
}
