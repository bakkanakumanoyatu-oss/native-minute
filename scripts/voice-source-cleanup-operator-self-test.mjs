#!/usr/bin/env node
import assert from "node:assert/strict";
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
