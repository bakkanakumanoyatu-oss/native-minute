#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runVoiceSourceCleanup } from "../services/voice/voice-source-cleanup.service.ts";
const env = { NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE: "1" };
const userId = "10000000-0000-4000-8000-000000000001";
const ids = ["20000000-0000-4000-8000-000000000001", "20000000-0000-4000-8000-000000000002"];
const states = ["available", "available"];
const objects = new Set(ids);
let active = 0;
let failConsent = true;
const repository = {
  async select(afterId) { const id = ids.find(id => (!afterId || id > afterId) && states[ids.indexOf(id)] !== "completed"); return id ?? null; },
  async claim(sourceId) {
    active = ids.indexOf(sourceId);
    states[active] = "claimed";
    return { reason: "claimed", sourceId, userId, bucket: active === 0 ? "voice-samples" : "voice-consents",
      objectKey: active === 0 ? `${userId}/consent/sample.wav` : `${userId}/consent.wav`, leaseExpiresAt: new Date(Date.now()+900000).toISOString() };
  },
  async check() { return true; },
  async finish(_id, _token, result) { states[active] = ["cleanup_succeeded", "already_absent"].includes(result) ? "completed" : "claimed"; return true; }
};
const storage = {
  async listOwnedInventory() { throw new Error("not part of R1"); },
  async deleteObject() { if (active === 1 && failConsent) return { kind: "network_error" }; objects.delete(ids[active]); return { kind: "request_succeeded" }; },
  async verifyObjectAbsence() { return { kind: objects.has(ids[active]) ? "present" : "absent" }; }
};
const options = { env, repository, storage };
assert.equal((await runVoiceSourceCleanup({}, options)).status, "blocked");
const first = await runVoiceSourceCleanup({ mode: "execute" }, options);
assert.equal(first.safeReasonCode, "cleanup_succeeded");
const partial = await runVoiceSourceCleanup({ mode: "execute", afterId: first.nextAfterId }, options);
assert.equal(partial.safeReasonCode, "storage_delete_transient_failure");
assert.deepEqual(states, ["completed", "claimed"]);
assert.equal((await runVoiceSourceCleanup({ mode: "execute", afterId: partial.nextAfterId }, options)).safeReasonCode, "sweep_complete");
failConsent = false;
assert.equal((await runVoiceSourceCleanup({ mode: "execute" }, options)).safeReasonCode, "cleanup_succeeded");
assert.deepEqual(states, ["completed", "completed"]);
assert.equal((await runVoiceSourceCleanup({ mode: "execute" }, options)).safeCounts.deleteCalls, 0);
assert.ok(!JSON.stringify(partial).includes(userId));
console.log("R1_OPERATOR_FAKE_PARTIAL_RETRY_CURSOR_IDEMPOTENCY_PASS");

// Exercise the real CLI parser without loading the workspace's env file.
// Guard=0 and a fatal fetch trap make every subprocess non-destructive.
const cwd = mkdtempSync(join(tmpdir(), "r1-exact-cli-"));
try {
  const entry = fileURLToPath(new URL("./voice-source-cleanup-operator.mjs", import.meta.url));
  const tsx = import.meta.resolve("tsx");
  const trap = "data:text/javascript," + encodeURIComponent("globalThis.fetch = () => { process.exit(99); };");
  for (const [args, reason] of [
    [["--mode", "execute", "--source-id", ids[0]], "destructive_guard_missing"],
    [["--source-id", ids[0]], "source_cleanup_input_invalid"],
    [["--mode", "execute", "--source-id", ids[0], "--after-id", ids[1]], "source_cleanup_input_invalid"],
    [["--mode", "execute", "--source-id", ids[0], "--source-id", ids[1]], "source_cleanup_input_invalid"],
    [["--mode", "execute", `--source-id=${ids[0]}`, `--source-id=${ids[0]}`], "source_cleanup_input_invalid"],
    [["--mode", "execute", "--source-id", "malformed"], "source_cleanup_input_invalid"],
    [["--mode", "execute", "--source-id"], "source_cleanup_input_invalid"]
  ]) {
    const result = spawnSync(process.execPath, ["--conditions=react-server", "--import", tsx, "--import", trap, entry, ...args], {
      cwd, encoding: "utf8", timeout: 20000,
      env: { ...process.env, NODE_OPTIONS: "", NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE: "0",
        TSX_TSCONFIG_PATH: fileURLToPath(new URL("../tsconfig.json", import.meta.url)) }
    });
    assert.equal(result.status, 2, result.stderr);
    assert.equal(JSON.parse(result.stdout).safeReasonCode, reason);
    assert.ok(!result.stdout.includes(userId));
  }
} finally { rmSync(cwd, { recursive: true, force: true }); }
console.log("R1_EXACT_CLI_SINGLE_TARGET_REJECTION_GUARD_NO_NETWORK_PASS");
