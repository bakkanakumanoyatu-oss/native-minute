import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { findPrivateGalleryLeaks } from "./check-gallery-private-leak.mjs";

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
