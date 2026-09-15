#!/usr/bin/env node
// Real R1 SQL transitions + production repository/runner + fake Storage only.
// Invoked by the disposable runner, never reads an env file or remote URL.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { runVoiceSourceCleanup } from "../services/voice/voice-source-cleanup.service.ts";
import { createVoiceSourceCleanupRepository } from "../services/voice/voice-source-cleanup.repository.ts";
const container = process.argv[2];
assert.match(container ?? "", /^native-minute-r1-proof-[0-9a-f]{10}$/);
const state = JSON.parse(execFileSync("docker", ["inspect", container], { encoding: "utf8" }))[0];
assert.equal(state.HostConfig.NetworkMode, "none");
assert.ok(!state.HostConfig.PortBindings || Object.keys(state.HostConfig.PortBindings).length === 0);
function sql(statement) {
  return execFileSync("docker", ["exec", "-i", container, "psql", "-X", "-At", "-U", "postgres", "-v", "ON_ERROR_STOP=1"],
    { input: statement, encoding: "utf8", timeout: 20000 }).trim();
}
const literal = value => value == null ? "null" : `'${String(value).replaceAll("'", "''")}'`;
const argsByRpc = {
  select_voice_source_cleanup: ["p_after_id"],
  claim_voice_source_cleanup: ["p_source_id", "p_token"],
  check_voice_source_cleanup: ["p_source_id", "p_token"],
  finish_voice_source_cleanup: ["p_source_id", "p_token", "p_result"]
};
const repository = createVoiceSourceCleanupRepository({ async rpc(name, args) {
  assert.ok(argsByRpc[name]);
  const values = argsByRpc[name].map(k => literal(args[k])).join(",");
  return { data: JSON.parse(sql(`select coalesce(to_jsonb(public.${name}(${values})),'null'::jsonb)`)), error: null };
} });
sql("select r1_test.seed(41); select r1_test.age_source(s,interval '25 hours'),r1_test.age_source(r,interval '25 hours') from r1_test.fixture where n=41;");
const fixture = JSON.parse(sql("select to_jsonb(f) from r1_test.fixture f where n=41"));
const sources = JSON.parse(sql(`select jsonb_agg(jsonb_build_object('id',id,'key',storage_object_key,'kind',kind)) from public.voice_asset_write_intents where id in (${literal(fixture.s)},${literal(fixture.r)})`));
const objects = new Set(sources.map(s => s.key));
let failConsent = true;
let deletes = 0;
const storage = {
  async listOwnedInventory() { throw new Error("R1 must not list"); },
  async verifyObjectAbsence(input) { assert.equal(input.userId, fixture.u); return { kind: objects.has(input.objectKey) ? "present" : "absent" }; },
  async deleteObject(input) {
    assert.equal(input.userId, fixture.u);
    assert.ok(sources.some(s => s.key === input.objectKey));
    deletes++;
    if (input.targetKind === "voice_consent_recording" && failConsent) return { kind: "network_error" };
    objects.delete(input.objectKey); return { kind: "request_succeeded" };
  }
};
const options = { env: { NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE: "1" }, repository, storage };
function before(id) {
  const hex = (BigInt(`0x${id.replaceAll("-", "")}`) - 1n).toString(16).padStart(32, "0");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
const sample = await runVoiceSourceCleanup({ mode: "execute", afterId: before(fixture.s) }, options);
assert.equal(sample.safeReasonCode, "cleanup_succeeded");
const failed = await runVoiceSourceCleanup({ mode: "execute", afterId: before(fixture.r) }, options);
assert.equal(failed.safeReasonCode, "storage_delete_transient_failure");
assert.equal(sql(`select cleanup_state from public.voice_asset_write_intents where id=${literal(fixture.s)}`), "completed");
assert.equal(sql(`select cleanup_state from public.voice_asset_write_intents where id=${literal(fixture.r)}`), "claimed");
const dueBefore = sql(`select cleanup_due_at from public.voice_asset_write_intents where id=${literal(fixture.r)}`);
failConsent = false;
const retry = await runVoiceSourceCleanup({ mode: "execute", afterId: before(fixture.r) }, options);
assert.equal(retry.safeReasonCode, "cleanup_succeeded");
assert.equal(sql(`select cleanup_due_at from public.voice_asset_write_intents where id=${literal(fixture.r)}`), dueBefore);
assert.equal(deletes, 3);
assert.equal(objects.size, 0);
assert.equal(sql(`select count(*) from public.voice_consents where id=${literal(fixture.c)}`), "1");
assert.equal(sql(`select cleanup_attempt_count from public.voice_asset_write_intents where id=${literal(fixture.r)}`), "2");
console.log("R1_CONNECTED_SQL_REPOSITORY_ROUTINE_FAKE_STORAGE_PARTIAL_RETRY_PASS");
