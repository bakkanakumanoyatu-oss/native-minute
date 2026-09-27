import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { findPrivateGalleryLeaks, syntheticPracticeSentinel } from "./check-gallery-private-leak.mjs";

test("the public repo guard detects package names and renamed private bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "gallery-private-leak-test-"));
  try {
    assert.deepEqual(await findPrivateGalleryLeaks(root), []);
    await writeFile(join(root, "first_collection_complete.json"), "synthetic only");
    assert.deepEqual(await findPrivateGalleryLeaks(root), ["first_collection_complete.json"]);
    await rm(join(root, "first_collection_complete.json"));
    const bytes = "synthetic private bytes";
    await writeFile(join(root, "renamed.txt"), bytes);
    const hash = createHash("sha256").update(bytes).digest("hex");
    assert.deepEqual(await findPrivateGalleryLeaks(root, new Set([hash])), ["renamed.txt"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the guard scans source, Web output and Mobile output for a synthetic practice sentinel", async () => {
  const root = await mkdtemp(join(tmpdir(), "gallery-private-artifact-test-"));
  try {
    await mkdir(join(root, ".next", "server"), { recursive: true });
    await mkdir(join(root, "apps", "mobile", "dist", "assets"), { recursive: true });
    await writeFile(join(root, "source.ts"), `export const practice = "${syntheticPracticeSentinel}";`);
    await writeFile(join(root, ".next", "server", "chunk.js"), `const text="${syntheticPracticeSentinel}";`);
    await writeFile(join(root, "apps", "mobile", "dist", "assets", "chunk.js"), `const text="${syntheticPracticeSentinel}";`);
    assert.deepEqual((await findPrivateGalleryLeaks(root)).sort(), [".next/server/chunk.js", "apps/mobile/dist/assets/chunk.js", "source.ts"].sort());
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the guard detects private rights evidence names and canonical source hashes in build artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "gallery-rights-leak-test-"));
  try {
    await mkdir(join(root, ".next", "server"), { recursive: true });
    await writeFile(join(root, "rights-evidence.json"), "synthetic evidence only");
    const hash = createHash("sha256").update("synthetic canonical source").digest("hex");
    await writeFile(join(root, ".next", "server", "chunk.js"), `const sourceHash="${hash}";`);
    assert.deepEqual((await findPrivateGalleryLeaks(root, new Set([hash]))).sort(), [".next/server/chunk.js", "rights-evidence.json"].sort());
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the guard includes tracked output directories in the public source scan", async () => {
  const root = await mkdtemp(join(tmpdir(), "gallery-output-leak-test-"));
  try {
    await mkdir(join(root, "outputs", "release"), { recursive: true });
    await writeFile(join(root, "outputs", "release", "copy.json"), syntheticPracticeSentinel);
    assert.deepEqual(await findPrivateGalleryLeaks(root), ["outputs/release/copy.json"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
